import type { FrameSample, LivenessChallenge, LivenessEvidence, MediaPipeFaceResult } from './types';
import { toFrameSample } from './faceFrame';
import { collectEvidence, actionPrompt } from './runner';

/**
 * LivenessSession — framework-agnostic controller for one liveness challenge.
 *
 * The camera layer pushes each MediaPipe result in as it arrives; the session
 * buffers them (timestamped relative to challenge start), reports live progress
 * for the UI, and assembles the server-bound evidence at the end. It makes NO
 * pass/fail decision — that is the server's job (SAACMS §6).
 *
 * Pure + injectable clock → fully unit-testable (no camera/native deps).
 */
export interface LivenessProgress {
  currentIndex: number; // index of the action being performed now
  total: number;
  detected: number; // how many actions observed so far
  currentPrompt: string; // human prompt for the current action
  done: boolean; // all actions observed
  expired: boolean;
}

export class LivenessSession {
  private challenge: LivenessChallenge;
  private now: () => number;
  private startedAt: number;
  private frames: FrameSample[] = [];

  /**
   * @param challenge server-issued challenge
   * @param opts.now injectable clock (ms); defaults to Date.now
   */
  constructor(challenge: LivenessChallenge, opts: { now?: () => number } = {}) {
    this.challenge = challenge;
    this.now = opts.now || (() => Date.now());
    this.startedAt = this.now();
  }

  /** Push a raw MediaPipe face result (camera frame). Ignored if expired. */
  pushResult(result: MediaPipeFaceResult): void {
    if (this.isExpired()) return;
    const t = this.now() - this.startedAt;
    this.frames.push(toFrameSample(result, t));
  }

  /** Push an already-flattened sample (mainly for tests). */
  pushSample(sample: FrameSample): void {
    this.frames.push(sample);
  }

  elapsedMs(): number {
    return this.now() - this.startedAt;
  }

  isExpired(): boolean {
    // expiresAt/issuedAt are absolute (server) ms; we bound by local elapsed
    // against the challenge duration to avoid clock-skew issues.
    const duration = this.challenge.expiresAt - this.challenge.issuedAt;
    return this.elapsedMs() > duration;
  }

  /** Live progress for the UI (re-derives detected count from the buffer). */
  progress(): LivenessProgress {
    const evidence = collectEvidence(this.challenge, this.frames);
    const detected = evidence.events.length;
    const total = this.challenge.sequence.length;
    const currentIndex = Math.min(detected, total - 1);
    return {
      currentIndex,
      total,
      detected,
      currentPrompt: actionPrompt(this.challenge.sequence[currentIndex]),
      done: detected >= total,
      expired: this.isExpired(),
    };
  }

  /** Assemble the final evidence payload to submit with the mark. */
  collect(): LivenessEvidence {
    return collectEvidence(this.challenge, this.frames);
  }

  frameCount(): number {
    return this.frames.length;
  }
}
