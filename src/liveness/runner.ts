import type { FrameSample, LivenessChallenge, LivenessEvidence, LivenessEvent } from './types';
import { detectAction } from './actionDetectors';

/**
 * Turn a captured frame buffer into the liveness evidence the server expects.
 *
 * Greedily finds each prompted action IN ORDER, each inside its per-action
 * window (measured from the previous action). The client never decides
 * pass/fail — it just reports what it observed; the server adjudicates.
 *
 * Frame timestamps `t` are relative to challenge start (ms).
 */
export function collectEvidence(
  challenge: LivenessChallenge,
  frames: FrameSample[]
): LivenessEvidence {
  // Must match the server's livenessService minActionLatencyMs — actions closer
  // together than this are rejected server-side as inhuman ('too_fast'), so we
  // never even propose them.
  const MIN_ACTION_GAP_MS = 250;

  const fs = [...frames].sort((a, b) => a.t - b.t);
  const events: LivenessEvent[] = [];
  let cursor = 0; // time of the previous detected action

  for (const action of challenge.sequence) {
    const windowStart = cursor + MIN_ACTION_GAP_MS;
    const windowEnd = cursor + challenge.perActionWindowMs;
    // candidate frames at least MIN_ACTION_GAP_MS after the previous action,
    // within the per-action window (mirrors the server's [250ms, window] check)
    const windowFrames = fs.filter((f) => f.t >= windowStart && f.t <= windowEnd);
    const result = detectAction(action, windowFrames);
    if (result.detected && result.event) {
      events.push(result.event);
      cursor = result.event.t;
    } else {
      // Could not observe this action in time — stop; the server will see the
      // sequence is incomplete and reject (in enforce mode).
      break;
    }
  }

  // Downsample a head-pose timeline for later server-side L2/L3 checks.
  const frameTimeline = fs
    .filter((_f, i) => i % 3 === 0)
    .map((f) => ({ t: f.t, yawDeg: f.yawDeg, pitchDeg: f.pitchDeg }));

  return {
    nonce: challenge.nonce,
    events,
    frameTimeline,
    complete: events.length === challenge.sequence.length,
  };
}

/**
 * Human-readable prompt for a challenge action (for the UI).
 */
export function actionPrompt(action: string): string {
  switch (action) {
    case 'blink':
      return 'Blink your eyes';
    case 'turn_left':
      return 'Turn your face left';
    case 'turn_right':
      return 'Turn your face right';
    case 'nod':
      return 'Nod your head';
    case 'smile':
      return 'Smile';
    default:
      return 'Follow the prompt';
  }
}
