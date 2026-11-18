/**
 * Liveness evidence types (mobile side, SAACMS §6 Layer 1).
 *
 * The client is a SENSOR, not a judge: these modules turn MediaPipe output into
 * the exact evidence shape the SERVER adjudicates (server/services/livenessService.js).
 * No accept/reject decision is made here.
 *
 * Kept free of native imports so it is unit-testable under the app's Jest.
 */

export type LivenessAction =
  | 'blink'
  | 'turn_left'
  | 'turn_right'
  | 'nod'
  | 'smile';

/** A server-issued challenge (from POST /api/liveness/challenge). */
export interface LivenessChallenge {
  nonce: string;
  sequence: LivenessAction[];
  issuedAt: number;
  expiresAt: number;
  perActionWindowMs: number;
  hmac: string;
}

/**
 * One flattened camera frame: the few blendshape + head-pose values the
 * detectors need, plus a timestamp RELATIVE to challenge start (ms).
 */
export interface FrameSample {
  t: number;
  eyeBlinkL: number;
  eyeBlinkR: number;
  smileL: number;
  smileR: number;
  jawOpen: number;
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
}

/**
 * One evidence event sent to the server. Field names MUST match what
 * livenessService._actionMagnitudeOk reads (eyeBlinkL/R, smileL/R, yawDeg, pitchDeg, t, action).
 */
export interface LivenessEvent {
  t: number;
  action: LivenessAction;
  eyeBlinkL?: number;
  eyeBlinkR?: number;
  smileL?: number;
  smileR?: number;
  jawOpen?: number;
  yawDeg?: number;
  pitchDeg?: number;
}

/** The full payload submitted alongside attendance/spot-check marks. */
export interface LivenessEvidence {
  nonce: string;
  events: LivenessEvent[];
  /** Downsampled head-pose/luma timeline (for server L2/L3 later). */
  frameTimeline?: Array<Pick<FrameSample, 't' | 'yawDeg' | 'pitchDeg'>>;
  /** Did the client locally see every prompted action? (UX only — never trusted.) */
  complete: boolean;
}

/** Minimal shape of a MediaPipe face-landmarker result (subset we consume). */
export interface MediaPipeFaceResult {
  faceBlendshapes?: Array<{ categories: Array<{ categoryName?: string; score: number }> }>;
  facialTransformationMatrixes?: Array<{ data: number[] }>;
}
