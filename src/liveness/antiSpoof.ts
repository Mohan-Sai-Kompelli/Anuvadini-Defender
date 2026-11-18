// On-device presentation-attack detection (PAD) — "is this a real face, or a
// face replayed on a phone/tablet screen (or a printed photo)?"
//
// ML Kit face detection gives us geometry only; it cannot tell a live face from
// a screen. So we run a small anti-spoof CNN (MiniVision Silent-Face /
// MiniFASNet, converted to TFLite) on the camera frames via
// react-native-fast-tflite, inside the same VisionCamera frame processor that
// already runs face detection (see AntiSpoofCamera.tsx). This file holds the
// model loader, the tunable constants, and the per-session score tracker that
// turns noisy per-frame scores into a single spoof / live verdict.
//
// Pairs with the randomized challenge-response liveness (LivenessChallenge.tsx):
// challenge-response defeats CANNED video replay; this PAD model defeats a face
// held up on a screen. Both run on the same live session.

import * as React from "react";

// ---------------------------------------------------------------------------
// Tunables — adjust to match the exact .tflite you bundle. Defaults target the
// common MiniVision Silent-Face-Anti-Spoofing (MiniFASNet) conversion:
//   input  : 80x80, float32 in [0,1] (the resize plugin's float32 output range,
//            which equals MiniVision's `ToTensor()` test transform — no further
//            mean/std normalization). NHWC, channels interleaved per pixel.
//   output : softmax over 3 classes [fake_2d, real, fake_3d] → index 1 = live
// If your model differs (2-class, 0..255 input, BGR channel order, different
// live index), change the constants below — they are the only model-specific
// knobs (plus the resize() call in AntiSpoofCamera.tsx).
// ---------------------------------------------------------------------------

/** Square side (px) the face crop is resized to before the model runs. */
export const ANTISPOOF_INPUT_SIZE = 80;

/**
 * Channel order the model was trained on. MiniVision loads frames with OpenCV
 * (BGR) but their conversions are commonly re-exported as RGB — if live faces
 * score consistently low (false spoofs), flip this to 'bgr'. The resize plugin
 * gives float32 channels in [0,1] either way.
 */
export const ANTISPOOF_PIXEL_FORMAT: "rgb" | "bgr" = "rgb";

/**
 * Fraction of the frame's shorter side used as the centered square crop fed to
 * the model. The liveness UI keeps the face inside a centered circle, so a
 * centered crop reliably contains the face without needing frame-space face
 * bounds (the plugin reports bounds in window space, not frame space).
 */
export const ANTISPOOF_CROP_FACTOR = 0.7;

/** Output index whose probability means "real / live". */
export const ANTISPOOF_LIVE_CLASS_INDEX = 1;

/** Tensor dtype the model expects ('float32' | 'uint8'). */
export const ANTISPOOF_INPUT_DTYPE: "float32" | "uint8" = "float32";

/**
 * Below this smoothed live-probability the session is judged a SPOOF and the
 * mark is blocked. Raise toward 1.0 to be stricter (more false rejects), lower
 * toward 0 to be laxer (more spoofs slip through). 0.5–0.7 is typical.
 */
export const ANTISPOOF_LIVE_THRESHOLD = 0.6;

/** Exponential-moving-average weight for the latest frame's score (0..1). */
export const ANTISPOOF_EMA_ALPHA = 0.4;

/** Minimum valid frames before a verdict is trusted (avoids early false calls). */
export const ANTISPOOF_MIN_FRAMES = 4;

/**
 * react-native-fast-tflite is a native module. Resolve it DEFENSIVELY at module
 * load — if the dep isn't installed or the native build is stale, importing it
 * would throw and take down the whole verify screen. When unavailable, the PAD
 * layer simply stays off and the camera behaves exactly as before.
 */
let tflite: { useTensorflowModel?: Function } | null = null;
let TFLITE_LOAD_ERROR: string | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  tflite = require("react-native-fast-tflite");
} catch (e: any) {
  TFLITE_LOAD_ERROR = e?.message ?? String(e);
  tflite = null;
}

export const TFLITE_AVAILABLE =
  !!tflite && typeof tflite.useTensorflowModel === "function";

export interface AntiSpoofModel {
  /** True only when the model has loaded and is ready to run on frames. */
  ready: boolean;
  /** The loaded TensorflowModel (its runSync is a worklet) — null until ready. */
  model: any | null;
  /** Human-readable reason the model isn't ready (for logging/diagnostics). */
  error: string | null;
}

/**
 * Load the bundled anti-spoof model. Safe to call always — if the native dep is
 * missing it returns `{ ready: false }` without calling any native hook, so the
 * camera keeps working with face-detection-only.
 *
 * NOTE: requires a real model at src/assets/antispoof.tflite. The repo ships a
 * placeholder; until it's replaced + the app is natively rebuilt, the hook
 * reports `ready: false` and nothing is enforced. See src/assets/README-antispoof.md.
 */
// Master switch for ON-DEVICE PAD. Disabled: running the TFLite model on every
// camera frame stuttered the preview, and the SAME PAD runs server-side on
// /verify-face (face-back/check.py). With this false the model is never even
// loaded. A module constant, so it never changes hook-call order per render.
const PAD_ON_DEVICE = false;

export function useAntiSpoofModel(): AntiSpoofModel {
  // TFLITE_AVAILABLE / PAD_ON_DEVICE are constant for the app's lifetime, so
  // gating the hook on them never changes hook-call order (rules-of-hooks safe).
  if (!TFLITE_AVAILABLE || !PAD_ON_DEVICE) {
    return {
      ready: false,
      model: null,
      error: !PAD_ON_DEVICE
        ? "on-device PAD disabled (runs server-side)"
        : (TFLITE_LOAD_ERROR ?? "react-native-fast-tflite not available"),
    };
  }

  // Defer the require of the asset to here so a bundling issue is contained.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const hook = tflite!.useTensorflowModel!(
    require("../assets/antispoof.tflite")
  );

  const ready = hook?.state === "loaded" && !!hook?.model;
  return {
    ready,
    model: ready ? hook.model : null,
    error:
      hook?.state === "error"
        ? hook?.error?.message ?? "model failed to load (placeholder?)"
        : hook?.state === "loading"
        ? "loading"
        : null,
  };
}

// ---------------------------------------------------------------------------
// Score tracker — smooths the per-frame live scores the frame processor emits
// into one stable verdict for the session. Lives on the JS thread (the frame
// processor hops back via runOnJS to push scores here).
// ---------------------------------------------------------------------------

export interface SpoofVerdict {
  /** True once enough frames have been seen to trust the verdict. */
  decided: boolean;
  /** True when the smoothed live score is below the threshold → block. */
  isSpoof: boolean;
  /** Smoothed live probability (0..1), or -1 if no valid frames yet. */
  liveScore: number;
  /** How many valid (face-present, model-ran) frames have been folded in. */
  frames: number;
}

export interface SpoofTracker {
  /** Fold one frame's live score in. Pass <0 for "no valid score this frame". */
  push(liveScore: number): void;
  /** Current smoothed verdict. */
  verdict(): SpoofVerdict;
  /** Forget all history (call when a fresh challenge/session starts). */
  reset(): void;
}

export function createSpoofTracker(): SpoofTracker {
  let ema = -1;
  let frames = 0;

  return {
    push(liveScore: number) {
      if (liveScore < 0 || Number.isNaN(liveScore)) return; // no valid score
      frames += 1;
      ema =
        ema < 0
          ? liveScore
          : ANTISPOOF_EMA_ALPHA * liveScore + (1 - ANTISPOOF_EMA_ALPHA) * ema;
    },
    verdict(): SpoofVerdict {
      const decided = frames >= ANTISPOOF_MIN_FRAMES && ema >= 0;
      return {
        decided,
        isSpoof: decided && ema < ANTISPOOF_LIVE_THRESHOLD,
        liveScore: ema,
        frames,
      };
    },
    reset() {
      ema = -1;
      frames = 0;
    },
  };
}

/** Small React hook wrapper so a component gets a stable tracker instance. */
export function useSpoofTracker(): SpoofTracker {
  return React.useMemo(() => createSpoofTracker(), []);
}
