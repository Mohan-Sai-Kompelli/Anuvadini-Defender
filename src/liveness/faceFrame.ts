import type { FrameSample, MediaPipeFaceResult } from './types';

/**
 * Flatten a MediaPipe face-landmarker result into a FrameSample:
 * the handful of blendshape + head-pose values the liveness detectors use.
 *
 * Pure + native-free → unit-testable.
 */

/** Build a name→score map from the first detected face's blendshapes. */
export function blendshapeMap(result: MediaPipeFaceResult): Record<string, number> {
  const out: Record<string, number> = {};
  const cats = result?.faceBlendshapes?.[0]?.categories;
  if (Array.isArray(cats)) {
    for (const c of cats) {
      if (c && c.categoryName) out[c.categoryName] = c.score;
    }
  }
  return out;
}

const RAD2DEG = 180 / Math.PI;

/**
 * Decompose head pose (degrees) from a 4x4 row-major facial transformation
 * matrix. Exact for single-axis rotations; good approximation for small
 * combined rotations.
 *
 * NOTE: the sign/axis convention of MediaPipe's matrix can vary by platform;
 * `turn_left` vs `turn_right` may need a one-line sign flip after a real-device
 * calibration. The math here is validated against synthetic rotations in tests.
 */
export function headPoseFromMatrix(data: number[] | undefined): {
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
} {
  if (!Array.isArray(data) || data.length < 11) {
    return { yawDeg: 0, pitchDeg: 0, rollDeg: 0 };
  }
  // row-major 4x4: r_ij = data[i*4 + j]
  const r00 = data[0];
  const r02 = data[2];
  const r10 = data[4];
  const r12 = data[6];
  const r22 = data[10];

  // Pitch from r12 directly (stable); yaw/roll via atan2. Near gimbal lock
  // (pitch ≈ ±90°, so cos(pitch) ≈ 0 and r22 ≈ 0) the yaw/roll atan2 terms blow
  // up — fall back to a coupled extraction so a tilted, steeply-pitched head
  // doesn't report a wildly wrong yaw. (Liveness turns are ±15–25°, far from
  // this, but the guard prevents pathological misreads.)
  const sinPitch = Math.max(-1, Math.min(1, -r12));
  const pitch = Math.asin(sinPitch) * RAD2DEG;
  const cosPitch = Math.sqrt(1 - sinPitch * sinPitch);

  let yaw: number;
  let roll: number;
  if (cosPitch < 0.087) {
    // within ~5° of gimbal lock
    yaw = Math.atan2(r10, r00) * RAD2DEG;
    roll = 0;
  } else {
    yaw = Math.atan2(r02, r22) * RAD2DEG;
    roll = Math.atan2(r10, r00) * RAD2DEG;
  }
  return { yawDeg: yaw, pitchDeg: pitch, rollDeg: roll };
}

/** Convert a raw MediaPipe result (+ relative timestamp) into a FrameSample. */
export function toFrameSample(result: MediaPipeFaceResult, t: number): FrameSample {
  const bs = blendshapeMap(result);
  const pose = headPoseFromMatrix(result?.facialTransformationMatrixes?.[0]?.data);
  return {
    t,
    eyeBlinkL: bs.eyeBlinkLeft ?? 0,
    eyeBlinkR: bs.eyeBlinkRight ?? 0,
    smileL: bs.mouthSmileLeft ?? 0,
    smileR: bs.mouthSmileRight ?? 0,
    jawOpen: bs.jawOpen ?? 0,
    yawDeg: pose.yawDeg,
    pitchDeg: pose.pitchDeg,
    rollDeg: pose.rollDeg,
  };
}
