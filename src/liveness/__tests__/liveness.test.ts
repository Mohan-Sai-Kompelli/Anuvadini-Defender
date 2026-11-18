import { headPoseFromMatrix, blendshapeMap, toFrameSample } from '../faceFrame';
import { detectBlink, detectSmile, detectTurn, detectNod, detectAction } from '../actionDetectors';
import { collectEvidence } from '../runner';
import type { FrameSample, LivenessChallenge, MediaPipeFaceResult } from '../types';

// ---- helpers ----------------------------------------------------------------

const DEG = Math.PI / 180;

// row-major 4x4 rotation matrices
function Ry(deg: number): number[] {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1];
}
function Rx(deg: number): number[] {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1];
}
function Rz(deg: number): number[] {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function frame(t: number, over: Partial<FrameSample> = {}): FrameSample {
  return {
    t,
    eyeBlinkL: 0.05,
    eyeBlinkR: 0.05,
    smileL: 0.05,
    smileR: 0.05,
    jawOpen: 0,
    yawDeg: 0,
    pitchDeg: 0,
    rollDeg: 0,
    ...over,
  };
}

// ---- head pose --------------------------------------------------------------

describe('headPoseFromMatrix', () => {
  it('recovers pure yaw / pitch / roll', () => {
    expect(headPoseFromMatrix(Ry(25)).yawDeg).toBeCloseTo(25, 1);
    expect(headPoseFromMatrix(Rx(20)).pitchDeg).toBeCloseTo(20, 1);
    expect(headPoseFromMatrix(Rz(15)).rollDeg).toBeCloseTo(15, 1);
  });
  it('identity → zero pose', () => {
    const p = headPoseFromMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(p.yawDeg).toBeCloseTo(0);
    expect(p.pitchDeg).toBeCloseTo(0);
    expect(p.rollDeg).toBeCloseTo(0);
  });
  it('handles missing/short data safely', () => {
    expect(headPoseFromMatrix(undefined)).toEqual({ yawDeg: 0, pitchDeg: 0, rollDeg: 0 });
  });
});

// ---- blendshape extraction --------------------------------------------------

describe('blendshape extraction', () => {
  const result: MediaPipeFaceResult = {
    faceBlendshapes: [
      {
        categories: [
          { categoryName: 'eyeBlinkLeft', score: 0.8 },
          { categoryName: 'eyeBlinkRight', score: 0.75 },
          { categoryName: 'mouthSmileLeft', score: 0.6 },
          { categoryName: 'mouthSmileRight', score: 0.62 },
          { categoryName: 'jawOpen', score: 0.1 },
        ],
      },
    ],
    facialTransformationMatrixes: [{ data: Ry(22) }],
  };

  it('maps names → scores', () => {
    const m = blendshapeMap(result);
    expect(m.eyeBlinkLeft).toBe(0.8);
    expect(m.mouthSmileRight).toBe(0.62);
  });

  it('flattens to a FrameSample with pose', () => {
    const fsample = toFrameSample(result, 123);
    expect(fsample.t).toBe(123);
    expect(fsample.eyeBlinkL).toBe(0.8);
    expect(fsample.smileR).toBe(0.62);
    expect(fsample.yawDeg).toBeCloseTo(22, 1);
  });

  it('empty result → zeros, no throw', () => {
    const fsample = toFrameSample({}, 0);
    expect(fsample.eyeBlinkL).toBe(0);
    expect(fsample.yawDeg).toBe(0);
  });
});

// ---- detectors --------------------------------------------------------------

describe('detectBlink', () => {
  it('detects an open→closed transition', () => {
    const r = detectBlink([
      frame(0, { eyeBlinkL: 0.05, eyeBlinkR: 0.05 }),
      frame(200, { eyeBlinkL: 0.8, eyeBlinkR: 0.78 }),
      frame(400, { eyeBlinkL: 0.05, eyeBlinkR: 0.05 }),
    ]);
    expect(r.detected).toBe(true);
    expect(r.event!.action).toBe('blink');
    expect(r.event!.eyeBlinkL).toBeGreaterThanOrEqual(0.55);
  });
  it('rejects a permanently-closed eye (no open frame → likely a still)', () => {
    const r = detectBlink([
      frame(0, { eyeBlinkL: 0.9, eyeBlinkR: 0.9 }),
      frame(200, { eyeBlinkL: 0.9, eyeBlinkR: 0.9 }),
    ]);
    expect(r.detected).toBe(false);
  });
  it('rejects no blink at all', () => {
    expect(detectBlink([frame(0), frame(200)]).detected).toBe(false);
  });
});

describe('detectSmile', () => {
  it('detects a sustained smile (≥300ms)', () => {
    const r = detectSmile([
      frame(0, { smileL: 0.7, smileR: 0.7 }),
      frame(200, { smileL: 0.72, smileR: 0.71 }),
      frame(400, { smileL: 0.7, smileR: 0.7 }),
    ]);
    expect(r.detected).toBe(true);
    expect(r.event!.action).toBe('smile');
  });
  it('rejects a too-brief smile (<300ms)', () => {
    const r = detectSmile([
      frame(0, { smileL: 0.05, smileR: 0.05 }),
      frame(100, { smileL: 0.7, smileR: 0.7 }),
      frame(200, { smileL: 0.05, smileR: 0.05 }),
    ]);
    expect(r.detected).toBe(false);
  });
});

describe('detectTurn / detectNod', () => {
  it('detects left vs right by yaw sign', () => {
    expect(detectTurn([frame(0, { yawDeg: -25 })], 'turn_left').detected).toBe(true);
    expect(detectTurn([frame(0, { yawDeg: -25 })], 'turn_right').detected).toBe(false);
    expect(detectTurn([frame(0, { yawDeg: 25 })], 'turn_right').detected).toBe(true);
  });
  it('detects a nod via pitch swing', () => {
    expect(detectNod([frame(0, { pitchDeg: -18 })]).detected).toBe(true);
    expect(detectNod([frame(0, { pitchDeg: -5 })]).detected).toBe(false);
  });
  it('dispatch via detectAction', () => {
    expect(detectAction('turn_right', [frame(0, { yawDeg: 30 })]).detected).toBe(true);
  });
});

// ---- runner: full challenge -------------------------------------------------

describe('collectEvidence', () => {
  const challenge: LivenessChallenge = {
    nonce: 'abc',
    sequence: ['blink', 'turn_right', 'smile'],
    issuedAt: 0,
    expiresAt: 20000,
    perActionWindowMs: 4000,
    hmac: 'x',
  };

  function genuineFrames(): FrameSample[] {
    return [
      // blink around 700ms (open → closed → open)
      frame(300, { eyeBlinkL: 0.05, eyeBlinkR: 0.05 }),
      frame(700, { eyeBlinkL: 0.85, eyeBlinkR: 0.83 }),
      frame(1000, { eyeBlinkL: 0.05, eyeBlinkR: 0.05 }),
      // turn right around 2200ms
      frame(2200, { yawDeg: 26 }),
      frame(2500, { yawDeg: 5 }),
      // smile sustained 3500–3900ms
      frame(3500, { smileL: 0.72, smileR: 0.71 }),
      frame(3700, { smileL: 0.73, smileR: 0.72 }),
      frame(3900, { smileL: 0.72, smileR: 0.71 }),
    ];
  }

  it('produces events matching the sequence, in order, with magnitudes above server thresholds', () => {
    const ev = collectEvidence(challenge, genuineFrames());
    expect(ev.complete).toBe(true);
    expect(ev.events.map((e) => e.action)).toEqual(['blink', 'turn_right', 'smile']);
    // timestamps strictly increasing
    const ts = ev.events.map((e) => e.t);
    expect(ts[0]).toBeLessThan(ts[1]);
    expect(ts[1]).toBeLessThan(ts[2]);
    // magnitudes clear the SERVER thresholds (blink≥0.5, smile≥0.5, |yaw|≥15)
    const [blink, turn, smile] = ev.events;
    expect(Math.min(blink.eyeBlinkL!, blink.eyeBlinkR!)).toBeGreaterThanOrEqual(0.5);
    expect(Math.abs(turn.yawDeg!)).toBeGreaterThanOrEqual(15);
    expect(Math.min(smile.smileL!, smile.smileR!)).toBeGreaterThanOrEqual(0.5);
    expect(ev.nonce).toBe('abc');
  });

  it('marks incomplete when an action is missing (a still photo never blinks/turns)', () => {
    const frames = [frame(500), frame(1500), frame(2500)]; // neutral, no actions
    const ev = collectEvidence(challenge, frames);
    expect(ev.complete).toBe(false);
    expect(ev.events.length).toBeLessThan(challenge.sequence.length);
  });

  it('does not satisfy a WRONG-order recording (turn before the prompted blink)', () => {
    // A pre-recorded clip that turns first then blinks cannot fill blink in window 1
    // if there is no blink early; here only a turn exists early → blink missing.
    const frames = [frame(400, { yawDeg: 26 }), frame(800, { yawDeg: 26 })];
    const ev = collectEvidence(challenge, frames);
    expect(ev.complete).toBe(false);
    expect(ev.events[0]?.action).not.toBe('blink');
  });
});
