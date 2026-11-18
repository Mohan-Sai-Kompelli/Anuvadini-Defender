import type { LivenessAction } from './types';

/**
 * On-device random challenge generator (PHONE-ONLY mode).
 *
 * The robust anti-spoofing property here is RANDOMNESS + REAL-TIME multi-step
 * sequencing: a pre-recorded video can't satisfy an unpredictable sequence like
 * "blink → turn left → smile" issued fresh at verification time. Each step
 * also has a short time window, so the user must perform it live.
 *
 * NOTE: this runs on the client, so the verdict is only as trustworthy as the
 * device. When the server liveness endpoints are built (see src/liveness/runner.ts
 * + INTEGRATION.md), move issuance + adjudication server-side and keep this as the
 * offline fallback only.
 */

export interface LocalChallenge {
  challengeId: string;
  sequence: LivenessAction[];
  /** ISO timestamp after which the whole challenge is stale. */
  expiresAt: string;
  /** How long the user gets to complete each single step (ms). */
  perActionWindowMs: number;
}

/** Actions available in PHONE-ONLY mode — 2 random steps drawn from this
 * 5-action pool each challenge. Must match server/services/livenessService.js's
 * ACTIONS. */
export const ACTION_POOL: LivenessAction[] = [
  'blink',
  'smile',
  'turn_left',
  'turn_right',
  'nod',
];

// Keep the mobile verification flow to two randomized live actions (was
// three) — must match server/services/livenessService.js's
// MOBILE_SEQUENCE_LENGTH. Two independent actions still provide the
// challenge-response anti-replay layer, while the passive PAD model and
// same-session face recognition remain active.
const DEFAULT_STEPS = 2;

// Full action pool — a fresh random multi-step sequence each time (a recorded
// video can't satisfy an unpredictable live sequence).
const CHALLENGE_POOL: LivenessAction[] = ACTION_POOL;

// 1 minute per step (matches LivenessChallenge.tsx's STEP_TIMEOUT_MS and the
// server's perActionWindowMs) — a step advances the moment it's detected;
// this is only the ceiling for "not detected yet" before restarting.
const PER_ACTION_WINDOW_MS = 60000;
const TOTAL_GRACE_MS = 4000; // slack on top of step windows before the whole challenge expires

/** Pick a random integer in [0, n). */
function randInt(n: number): number {
  return Math.floor(Math.random() * n);
}

/** A short, collision-resistant-enough id for a local (untrusted) challenge. */
function makeId(): string {
  return `local-${Date.now().toString(36)}-${randInt(1e9).toString(36)}`;
}

/**
 * Build a random challenge.
 *
 * Rules that keep it human-doable yet unpredictable:
 *  - `steps` actions (default 3), drawn from ACTION_POOL.
 *  - No two IDENTICAL actions back-to-back.
 *  - turn_left and turn_right are never adjacent (whipping head side-to-side is
 *    awkward and easy to misdetect).
 */
export function generateLocalChallenge(steps: number = DEFAULT_STEPS): LocalChallenge {
  const sequence: LivenessAction[] = [];

  while (sequence.length < steps) {
    const candidate = CHALLENGE_POOL[randInt(CHALLENGE_POOL.length)];
    const prev = sequence[sequence.length - 1];

    if (prev) {
      // No two identical actions back-to-back. (A repeated action's prop value
      // doesn't change between steps, which made the camera's per-step state
      // reset miss the second step and wedge it — and "blink twice in a row" is a
      // confusing instruction anyway.)
      if (candidate === prev) continue;
      const oppositeTurns =
        (prev === 'turn_left' && candidate === 'turn_right') ||
        (prev === 'turn_right' && candidate === 'turn_left');
      if (oppositeTurns) continue;
    }
    sequence.push(candidate);
  }

  const ttlMs = steps * PER_ACTION_WINDOW_MS + TOTAL_GRACE_MS;
  return {
    challengeId: makeId(),
    sequence,
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    perActionWindowMs: PER_ACTION_WINDOW_MS,
  };
}
