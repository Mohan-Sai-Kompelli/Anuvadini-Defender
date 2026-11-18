const crypto = require('crypto');

/**
 * LivenessService (Layer 1 — active challenge/response)
 * -----------------------------------------------------
 * Server-issued, randomized liveness challenge bound to a single-use nonce.
 * The client is a SENSOR, not a judge: it performs the prompted actions and
 * sends back raw measurements (a timeline of blendshape/head-pose events). The
 * server re-decides everything here. See SAACMS_MASTER_PLAN.md §6.
 *
 * This implements Layer 1 (defeats a pre-recorded video that can't satisfy
 * today's random sequence within the timing windows). Layers 2-3 (passive PAD /
 * replay forensics, 3D parallax) plug into adjudicate() later via face-back.
 *
 * Nonce store: in-memory Map by default (single backend). For multi-node, swap
 * `store` for Redis — the interface is get/set/del with TTL semantics.
 */

// Full 5-action pool — 2 random steps drawn from these each challenge (see
// MOBILE_SEQUENCE_LENGTH below). Must match src/liveness/challengeGenerator.ts's
// ACTION_POOL.
const ACTIONS = ['blink', 'smile', 'turn_left', 'turn_right', 'nod'];
// Mobile UX and server adjudication must agree on this number — the app's own
// challenge-fetch validation (LivenessChallenge.tsx) hard-checks the sequence
// length it gets back.
const MOBILE_SEQUENCE_LENGTH = 2;

const CONFIG = {
  hmacSecret: process.env.LIVENESS_HMAC_SECRET || process.env.JWT_SECRET || '',
  sequenceLength: MOBILE_SEQUENCE_LENGTH,
  // 150s (was 45s, was 20s) — must cover BOTH steps getting the full 1-minute
  // per-step wait (LivenessChallenge.tsx's STEP_TIMEOUT_MS) before the whole
  // run completes, plus the pre-flight /verify-face round trip after the last
  // step. A tighter budget here rejected genuine-but-slow users with an
  // expired-nonce failure that had nothing to do with their actual face or
  // actions.
  challengeTtlMs: parseInt(process.env.LIVENESS_TTL_MS || '150000', 10),
  // 60s (was 7s, was 4s) — the gap allowed between consecutive action events.
  // Matches the client's per-step wait (STEP_TIMEOUT_MS / PER_ACTION_WINDOW_MS)
  // exactly: whatever the client is willing to wait for a step, the server
  // must be willing to accept the resulting gap, or a genuine slow-but-live
  // user who the client happily waited for gets rejected here instead as
  // `window_exceeded`. This does not weaken the anti-replay property: a
  // pre-recorded video still cannot dynamically react to a RANDOM action
  // sequence within any window, however generous — only a live human can.
  perActionWindowMs: parseInt(process.env.LIVENESS_ACTION_WINDOW_MS || '60000', 10),
  // Magnitude thresholds for adjudication. These MUST NOT be stricter than the
  // on-device detector's own pass conditions (CameraStream's LIVENESS consts):
  // the device watched the action live and only emits an event once ITS
  // threshold is crossed — if the server then demands a bigger number from the
  // same reading, a genuine, correctly-performed action gets rejected as
  // `weak_*` and the user only ever sees the generic "verification could not
  // be completed" message.
  thresholds: {
    // Average closedness (L+R)/2 must peak above this. The client passes a
    // blink on avg(eyeOpen) < 0.35 → avg closedness > 0.65, so 0.5 keeps a
    // real margin while tolerating one asymmetric eye (glasses, side light).
    blink: 0.5,
    // Effective requirement is (smile - 0.1) per side = 0.3 — matching the
    // client's adaptive floor (smileFloor 0.3): beards/neutral faces depress
    // MLKit's absolute smilingProbability, and the client already verified the
    // RISE against this face's own neutral. The old 0.6 (→0.5 required) was
    // stricter than the client's 0.45 absolute / 0.3 adaptive pass, so smiles
    // the device confirmed live systematically failed server adjudication.
    smile: 0.4,
    turnYawDeg: 15, // |yaw| target for a left/right turn (client emits at ≥16)
    nodPitchDeg: 12, // pitch swing for a nod
  },
  // Inter-event latency must look human: not instantaneous, not absurdly slow.
  minActionLatencyMs: 250,
};

class LivenessService {
  constructor() {
    this.store = new Map(); // nonce -> challenge record
    this.lastSequenceByStudent = new Map(); // studentId -> last sequence (anti-repeat)
  }

  _randomSequence(studentId) {
    const last = (this.lastSequenceByStudent.get(String(studentId)) || []).join(',');
    let seq;
    // Try a few times to avoid handing out yesterday's exact sequence, AND to
    // avoid turn_left/turn_right landing adjacent — whipping the head
    // side-to-side back-to-back is awkward and easy to misdetect (same rule
    // the client's own offline generator already applies).
    const isOppositeTurns = (a, b) =>
      (a === 'turn_left' && b === 'turn_right') || (a === 'turn_right' && b === 'turn_left');
    for (let attempt = 0; attempt < 8; attempt++) {
      seq = [];
      const pool = [...ACTIONS];
      for (let i = 0; i < CONFIG.sequenceLength && pool.length; i++) {
        let idx = crypto.randomInt(pool.length);
        // Redraw once if this pick would create an adjacent opposite-turn
        // pair; if every remaining candidate is a turn, just accept it
        // (only happens with a degenerate/small pool).
        if (seq.length && isOppositeTurns(seq[seq.length - 1], pool[idx])) {
          const alt = pool.findIndex((a, ai) => ai !== idx && !isOppositeTurns(seq[seq.length - 1], a));
          if (alt !== -1) idx = alt;
        }
        seq.push(pool.splice(idx, 1)[0]);
      }
      if (seq.join(',') !== last) break;
    }
    this.lastSequenceByStudent.set(String(studentId), seq);
    return seq;
  }

  _sign(payload) {
    return crypto
      .createHmac('sha256', CONFIG.hmacSecret)
      .update(payload)
      .digest('hex');
  }

  /** Issue a challenge for a student. */
  issueChallenge(studentId) {
    this._sweep();
    const nonce = crypto.randomBytes(32).toString('hex');
    const sequence = this._randomSequence(studentId);
    const issuedAt = Date.now();
    const expiresAt = issuedAt + CONFIG.challengeTtlMs;

    const record = {
      nonce,
      studentId: String(studentId),
      sequence,
      issuedAt,
      expiresAt,
      perActionWindowMs: CONFIG.perActionWindowMs,
      status: 'issued',
    };
    this.store.set(nonce, record);

    const hmac = this._sign(`${nonce}.${sequence.join(',')}.${issuedAt}.${expiresAt}`);
    return {
      nonce,
      sequence,
      issuedAt,
      expiresAt,
      perActionWindowMs: CONFIG.perActionWindowMs,
      hmac,
    };
  }

  /** Magnitude check for a single reported action event. */
  _actionMagnitudeOk(action, ev) {
    const t = CONFIG.thresholds;
    switch (action) {
      case 'blink': {
        // AVERAGE closedness, mirroring the on-device detector (it arms/passes
        // on the average of both eyes). Requiring EACH eye to clear the bar
        // rejected genuine blinks where one eye reads low (glasses, uneven
        // lighting) that the device — which watched the blink live — accepted.
        const l = Number(ev.eyeBlinkL) || 0;
        const r = Number(ev.eyeBlinkR) || 0;
        return (l + r) / 2 >= t.blink;
      }
      case 'smile': {
        const l = Number(ev.smileL) || 0;
        const r = Number(ev.smileR) || 0;
        return l >= t.smile - 0.1 && r >= t.smile - 0.1;
      }
      case 'turn_left':
        return Number(ev.yawDeg) <= -t.turnYawDeg;
      case 'turn_right':
        return Number(ev.yawDeg) >= t.turnYawDeg;
      case 'nod':
        return Math.abs(Number(ev.pitchDeg)) >= t.nodPitchDeg;
      default:
        return false;
    }
  }

  /**
   * Adjudicate a liveness submission server-side.
   * @param {Object} args { nonce, studentId, events: [{t, action, ...magnitudes}] }
   * @returns {Object} { passed, reasons: [], sequence, details }
   *
   * Pass requires ALL of:
   *  - nonce exists, belongs to this student, is unburned and unexpired
   *  - reported actions equal the issued sequence, in order
   *  - each action's magnitude exceeds its threshold
   *  - each action lands inside its per-action window and timing looks human
   * The nonce is burned (single-use) regardless of outcome.
   */
  adjudicate({ nonce, studentId, events }) {
    const reasons = [];
    const record = this.store.get(nonce);

    if (!record) return { passed: false, reasons: ['nonce_invalid'] };
    // Burn immediately: single-use, even on failure (prevents retry/replay).
    this.store.delete(nonce);

    if (record.status !== 'issued') reasons.push('nonce_already_used');
    if (String(record.studentId) !== String(studentId)) reasons.push('nonce_student_mismatch');
    if (Date.now() > record.expiresAt) reasons.push('nonce_expired');

    if (!Array.isArray(events) || !events.length) {
      reasons.push('no_events');
      return { passed: false, reasons, sequence: record.sequence };
    }

    // Order + magnitude + timing checks against the issued sequence.
    const seq = record.sequence;
    if (events.length < seq.length) reasons.push('insufficient_actions');

    // Timing is judged on the DELTAS between consecutive actions, anchored on
    // the FIRST event — never on the absolute offset from issuance. The client
    // stamps t = (its own clock) − (the server's issuedAt), so any device
    // clock skew shifts EVERY t by the same constant, and the challenge fetch
    // round trip, camera warm-up, the permission gate and the first
    // instruction's TTS narration all land inside t[0] too. Judging t[0]
    // against the per-action window therefore rejected genuine users
    // (`window_exceeded_0`, or a skewed-negative t → `bad_timestamp_0`) for
    // reasons that say nothing about liveness. Deltas cancel the constant
    // skew; the per-action windows still bound every action→action reaction,
    // and the nonce TTL above (server clock only) still bounds the whole run —
    // a replay cannot buy itself time by faking the anchor.
    let prevT = null;
    for (let i = 0; i < seq.length; i++) {
      const expected = seq[i];
      const ev = events[i];
      if (!ev) {
        reasons.push(`missing_action_${i}_${expected}`);
        continue;
      }
      if (ev.action !== expected) {
        reasons.push(`wrong_action_${i}_expected_${expected}_got_${ev.action}`);
      }
      if (!this._actionMagnitudeOk(expected, ev)) {
        reasons.push(`weak_${expected}_${i}`);
      }
      const t = Number(ev.t);
      if (!Number.isFinite(t)) {
        reasons.push(`bad_timestamp_${i}`);
      } else {
        if (prevT != null) {
          const gap = t - prevT;
          if (gap < CONFIG.minActionLatencyMs) reasons.push(`too_fast_${i}`);
          if (gap > record.perActionWindowMs) reasons.push(`window_exceeded_${i}`);
        }
        prevT = t;
      }
    }

    const passed = reasons.length === 0;
    return {
      passed,
      reasons,
      sequence: seq,
      details: { actionCount: events.length, expected: seq.length },
    };
  }

  /** Drop expired challenge records. */
  _sweep() {
    const now = Date.now();
    for (const [nonce, rec] of this.store) {
      if (now > rec.expiresAt) this.store.delete(nonce);
    }
  }

  _config() {
    return CONFIG;
  }
}

module.exports = new LivenessService();
