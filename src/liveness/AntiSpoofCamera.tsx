// VisionCamera wrapper that runs Google ML Kit face detection AND an on-device
// anti-spoof (PAD) model on the SAME frame, in one frame processor.
//
// Everything runs INLINE in the VisionCamera frame processor worklet — the
// context where react-native-vision-camera-face-detector's detectFaces(),
// vision-camera-resize-plugin's resize(), and react-native-fast-tflite's
// runSync() are all designed to be called. We don't hand the frame back to JS
// (the host captures its verification photo separately via takePhoto), so there
// is no frame ref-counting to manage: we hop to JS with just the faces + the
// per-frame live score.
//
// Loaded DEFENSIVELY by CameraStream: if worklets-core, the face-detector plugin,
// react-native-fast-tflite or vision-camera-resize-plugin aren't present/healthy,
// CameraStream falls back to the plain face-detector Camera (no PAD) or the ML
// Kit snapshot loop — never a crash.

import * as React from "react";
import {
  Camera as VisionCamera,
  runAtTargetFps,
  useFrameProcessor,
} from "react-native-vision-camera";
import { Worklets } from "react-native-worklets-core";
import { useFaceDetector } from "react-native-vision-camera-face-detector";
import { useResizePlugin } from "vision-camera-resize-plugin";

import type { CameraProps, Frame } from "react-native-vision-camera";
import type { Face } from "react-native-vision-camera-face-detector";
import {
  ANTISPOOF_CROP_FACTOR,
  ANTISPOOF_INPUT_DTYPE,
  ANTISPOOF_INPUT_SIZE,
  ANTISPOOF_LIVE_CLASS_INDEX,
  ANTISPOOF_PIXEL_FORMAT,
} from "./antiSpoof";

type Props = {
  ref: React.RefObject<VisionCamera | null>;
  faceDetectionOptions?: any;
  /** Same as the plugin: called on the JS thread with detected faces. */
  faceDetectionCallback: (faces: Face[], frame: Frame) => void;
  /** Per-frame live probability (0..1), or -1 when no score this frame. */
  spoofCallback: (liveScore: number) => void;
  /** The loaded TensorflowModel from useAntiSpoofModel(); its runSync is a worklet. */
  spoofModel: any | null;
} & CameraProps;

export function AntiSpoofCamera({
  ref,
  faceDetectionOptions,
  faceDetectionCallback,
  spoofCallback,
  spoofModel,
  ...props
}: Props) {
  const { detectFaces, stopListeners } = useFaceDetector(faceDetectionOptions);
  const { resize } = useResizePlugin();

  React.useEffect(() => () => stopListeners(), []);

  // One hop back to JS per frame: deliver faces AND the live score together.
  const runOnJs = React.useMemo(
    () =>
      Worklets.createRunOnJS((faces: Face[], liveScore: number) => {
        faceDetectionCallback(faces, undefined as unknown as Frame);
        spoofCallback(liveScore);
      }),
    [faceDetectionCallback, spoofCallback]
  );

  // Capture tunables as plain locals so the worklet closes over values reliably.
  const SIZE = ANTISPOOF_INPUT_SIZE;
  const CROP = ANTISPOOF_CROP_FACTOR;
  const LIVE_IDX = ANTISPOOF_LIVE_CLASS_INDEX;
  const DTYPE = ANTISPOOF_INPUT_DTYPE;
  const PIXFMT = ANTISPOOF_PIXEL_FORMAT;

  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";
      // PERFORMANCE: throttle ALL per-frame work to ~10fps. Running ML Kit face
      // detection AND the synchronous TFLite anti-spoof model on every camera
      // frame (30–60fps) saturated the frame thread and made the preview stutter
      // ("stuck frames"). Liveness only needs a few samples/sec, so 10fps stays
      // responsive for the actions yet leaves the frame thread free for a smooth
      // preview. runAtTargetFps simply skips the body on in-between frames.
      runAtTargetFps(10, () => {
        "worklet";
        const faces = detectFaces(frame);

        // Anti-spoof score: only when a face is present and the model is loaded.
        let liveScore = -1;
        if (spoofModel != null && faces.length > 0) {
        try {
          // Centered square crop — the liveness UI keeps the face in a centered
          // circle, so this reliably frames the face without needing frame-space
          // bounds (the plugin reports bounds in window space).
          const side = Math.min(frame.width, frame.height) * CROP;
          const x = (frame.width - side) / 2;
          const y = (frame.height - side) / 2;
          const input = resize(frame, {
            crop: { x, y, width: side, height: side },
            scale: { width: SIZE, height: SIZE },
            pixelFormat: PIXFMT,
            dataType: DTYPE,
          });
          const outputs = spoofModel.runSync([input]);
          const scores = outputs[0]; // class scores / logits
          // Softmax over the class scores, then take the "live" class.
          let max = -Infinity;
          for (let i = 0; i < scores.length; i++) {
            if (scores[i] > max) max = scores[i];
          }
          let sum = 0;
          for (let i = 0; i < scores.length; i++) sum += Math.exp(scores[i] - max);
          const idx = LIVE_IDX < scores.length ? LIVE_IDX : scores.length - 1;
          liveScore = sum > 0 ? Math.exp(scores[idx] - max) / sum : -1;
        } catch (err) {
          // Model/resize hiccup on this frame — emit "unknown", keep streaming.
          liveScore = -1;
        }
      }

        runOnJs(faces, liveScore);
      });
    },
    [detectFaces, resize, runOnJs, spoofModel]
  );

  return (
    <VisionCamera
      {...props}
      ref={ref}
      frameProcessor={frameProcessor}
      pixelFormat="yuv"
    />
  );
}
