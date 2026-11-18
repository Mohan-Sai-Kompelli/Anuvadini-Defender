import type { FrameSample, LivenessAction, LivenessEvent } from './types';

/**
 * Pure action detectors over a window of FrameSamples.
 *
 * Thresholds are set slightly STRICTER than the server's adjudication
 * (server/services/livenessService.js) so that any event the client emits will
 * also pass the server — the server remains the sole judge, this just avoids
 * emitting borderline evidence. All functions are pure → unit-testable.
 */

// Magnitude thresholds are kept ALIGNED with the server's
// (livenessService.js `_actionMagnitudeOk`) so an action the client detects is
// never rejected by the server for being too weak. The client adds structural
// extras (a blink must be a transition; a smile must be sustained) that only
// make it safer, never looser. Keep these in sync with the server values.
export const DETECT = {
  blinkClosed: 0.5, // server: eyeBlinkL/R ≥ 0.5
  blinkOpen: 0.2, // require a dip first → proves a transition, not a static closed frame
  smile: 0.5, // server: each mouthSmile side ≥ 0.5 (0.6 − 0.1)
  smileSustainMs: 300,
  turnYawDeg: 15, // server: |yaw| ≥ 15
  nodPitchDeg: 12, // server: |pitch| ≥ 12
  jawOpen: 0.4, // jawOpen blendshape ≥ 0.4 counts as an open mouth
};

export interface Detection {
  detected: boolean;
  event?: LivenessEvent;
}

const sortByT = (frames: FrameSample[]) => [...frames].sort((a, b) => a.t - b.t);

/** A real blink = eyes open → closed within the window. */
export function detectBlink(frames: FrameSample[]): Detection {
  const fs = sortByT(frames);
  const sawOpen = fs.some((f) => Math.min(f.eyeBlinkL, f.eyeBlinkR) < DETECT.blinkOpen);
  if (!sawOpen) return { detected: false };

  // strongest closed frame
  let peak: FrameSample | undefined;
  for (const f of fs) {
    const closed = Math.min(f.eyeBlinkL, f.eyeBlinkR);
    if (closed >= DETECT.blinkClosed) {
      if (!peak || Math.min(f.eyeBlinkL, f.eyeBlinkR) > Math.min(peak.eyeBlinkL, peak.eyeBlinkR)) {
        peak = f;
      }
    }
  }
  if (!peak) return { detected: false };
  return {
    detected: true,
    event: { t: peak.t, action: 'blink', eyeBlinkL: peak.eyeBlinkL, eyeBlinkR: peak.eyeBlinkR },
  };
}

/** A smile sustained for ≥ smileSustainMs. */
export function detectSmile(frames: FrameSample[]): Detection {
  const fs = sortByT(frames);
  let runStart = -1;
  let best: FrameSample | undefined;
  for (let i = 0; i < fs.length; i++) {
    const f = fs[i];
    const smiling = f.smileL >= DETECT.smile && f.smileR >= DETECT.smile;
    if (smiling) {
      if (runStart < 0) runStart = i;
      const span = fs[i].t - fs[runStart].t;
      if (span >= DETECT.smileSustainMs) {
        // pick the strongest frame in this sustained run
        for (let j = runStart; j <= i; j++) {
          if (!best || fs[j].smileL + fs[j].smileR > best.smileL + best.smileR) best = fs[j];
        }
      }
    } else {
      runStart = -1;
    }
  }
  if (!best) return { detected: false };
  return {
    detected: true,
    event: { t: best.t, action: 'smile', smileL: best.smileL, smileR: best.smileR },
  };
}

/** Head turn to a side: yaw beyond the threshold with the right sign. */
export function detectTurn(frames: FrameSample[], dir: 'turn_left' | 'turn_right'): Detection {
  const fs = sortByT(frames);
  let best: FrameSample | undefined;
  for (const f of fs) {
    const ok = dir === 'turn_left' ? f.yawDeg <= -DETECT.turnYawDeg : f.yawDeg >= DETECT.turnYawDeg;
    if (ok) {
      if (!best || Math.abs(f.yawDeg) > Math.abs(best.yawDeg)) best = f;
    }
  }
  if (!best) return { detected: false };
  return { detected: true, event: { t: best.t, action: dir, yawDeg: best.yawDeg } };
}

/** A nod: pitch swings beyond the threshold (down or up). */
export function detectNod(frames: FrameSample[]): Detection {
  const fs = sortByT(frames);
  let best: FrameSample | undefined;
  for (const f of fs) {
    if (Math.abs(f.pitchDeg) >= DETECT.nodPitchDeg) {
      if (!best || Math.abs(f.pitchDeg) > Math.abs(best.pitchDeg)) best = f;
    }
  }
  if (!best) return { detected: false };
  return { detected: true, event: { t: best.t, action: 'nod', pitchDeg: best.pitchDeg } };
}

/** Dispatch detection for any action over a window of frames. */
export function detectAction(action: LivenessAction, frames: FrameSample[]): Detection {
  switch (action) {
    case 'blink':
      return detectBlink(frames);
    case 'smile':
      return detectSmile(frames);
    case 'turn_left':
    case 'turn_right':
      return detectTurn(frames, action);
    case 'nod':
      return detectNod(frames);
    default:
      return { detected: false };
  }
}
