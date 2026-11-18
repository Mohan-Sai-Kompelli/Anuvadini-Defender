import { LivenessSession } from '../session';
import type { LivenessChallenge, FrameSample } from '../types';

const challenge: LivenessChallenge = {
  nonce: 'n1',
  sequence: ['blink', 'turn_right', 'smile'],
  issuedAt: 0,
  expiresAt: 20000, // 20s duration
  perActionWindowMs: 4000,
  hmac: 'x',
};

function frame(t: number, over: Partial<FrameSample> = {}): FrameSample {
  return { t, eyeBlinkL: 0.05, eyeBlinkR: 0.05, smileL: 0.05, smileR: 0.05, jawOpen: 0, yawDeg: 0, pitchDeg: 0, rollDeg: 0, ...over };
}

// a controllable clock
function clock(start = 1000) {
  let t = start;
  return { now: () => t, set: (v: number) => { t = v; }, advance: (d: number) => { t += d; } };
}

describe('LivenessSession', () => {
  it('buffers frames with timestamps relative to challenge start', () => {
    const c = clock(5000);
    const s = new LivenessSession(challenge, { now: c.now });
    c.advance(700);
    s.pushResult({ faceBlendshapes: [{ categories: [{ categoryName: 'eyeBlinkLeft', score: 0.05 }] }] });
    expect(s.frameCount()).toBe(1);
    // relative t ~ 700ms, not the absolute clock value
    const ev = s.collect();
    expect(ev.frameTimeline![0].t).toBeCloseTo(700, -2);
  });

  it('reports live progress as actions are observed', () => {
    const c = clock(0);
    const s = new LivenessSession(challenge, { now: c.now });
    expect(s.progress().detected).toBe(0);
    expect(s.progress().currentPrompt).toMatch(/blink/i);

    // blink at ~700ms (open->closed->open)
    s.pushSample(frame(300, { eyeBlinkL: 0.05, eyeBlinkR: 0.05 }));
    s.pushSample(frame(700, { eyeBlinkL: 0.85, eyeBlinkR: 0.83 }));
    s.pushSample(frame(1000, { eyeBlinkL: 0.05, eyeBlinkR: 0.05 }));
    let p = s.progress();
    expect(p.detected).toBe(1);
    expect(p.currentPrompt).toMatch(/right/i);

    // turn right, then smile
    s.pushSample(frame(2200, { yawDeg: 26 }));
    s.pushSample(frame(3500, { smileL: 0.72, smileR: 0.71 }));
    s.pushSample(frame(3700, { smileL: 0.73, smileR: 0.72 }));
    s.pushSample(frame(3900, { smileL: 0.72, smileR: 0.71 }));
    p = s.progress();
    expect(p.detected).toBe(3);
    expect(p.done).toBe(true);
  });

  it('marks expired after the challenge duration and stops buffering', () => {
    const c = clock(0);
    const s = new LivenessSession(challenge, { now: c.now });
    c.set(25000); // past 20s duration
    expect(s.isExpired()).toBe(true);
    s.pushResult({ faceBlendshapes: [{ categories: [] }] });
    expect(s.frameCount()).toBe(0); // expired pushes ignored
    expect(s.progress().expired).toBe(true);
  });

  it('collect() returns evidence with the challenge nonce', () => {
    const s = new LivenessSession(challenge, { now: clock(0).now });
    expect(s.collect().nonce).toBe('n1');
  });
});
