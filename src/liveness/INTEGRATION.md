# Liveness — mobile integration guide (device-build step)

The liveness **logic** is built and unit-tested (`src/liveness/*`, 21 Jest tests).
What remains needs a real device/emulator build to verify: feeding the MediaPipe
camera frames into a `LivenessSession`, rendering the challenge UI, and handling
the spot-check push. This guide wires the tested pieces together.

> Principle: the client only **collects evidence**. The server (`/api/attendance/mark`
> and `/api/liveness/verify`) re-adjudicates everything. Never trust a client verdict.

## 1. Capture frames into a session

In the camera screen, use the library's face-landmarker (it already exposes
blendshapes + the 4×4 transform matrix — see `react-native-mediapipe`
`useFaceLandmarkDetection`). For each result, push it into a `LivenessSession`.

```ts
import { LivenessSession } from './liveness/session';
import { apiService } from './services/api';

// 1) fetch a server challenge
const res = await apiService.getLivenessChallenge();
const challenge = res.data.challenge;            // {nonce, sequence, perActionWindowMs, ...}
const session = new LivenessSession(challenge);

// 2) on every MediaPipe result (frame processor → JS callback):
function onFaceResult(result /* FaceLandmarkerResult */) {
  session.pushResult(result);                    // buffers + timestamps
  const p = session.progress();                  // live UI feedback
  setPrompt(p.currentPrompt);                    // e.g. "Turn your head right"
  setStep(p.detected, p.total);                  // step chips / progress ring
  if (p.done || p.expired) finish();
}

// 3) when done, submit evidence WITH the attendance mark
async function finish() {
  const evidence = session.collect();            // {nonce, events, frameTimeline}
  await apiService.markAttendance({
    type: 'in',
    latitude, longitude,
    faceImage,                                   // the captured JPEG/base64
    authMethod: 'face',
    livenessNonce: evidence.nonce,
    livenessEvents: evidence.events,             // server adjudicates these
  });
}
```

`markAttendance` already forwards `livenessNonce` + `livenessEvents` (see
`src/services/api.ts`). The server, in `LIVENESS_MODE=enforce`, rejects the mark
if the evidence doesn't satisfy the challenge.

## 2. Challenge UI (`src/components/LivenessChallenge.tsx`)

- Render step chips from `challenge.sequence` using `runner.actionPrompt(action)`
  and Lucide icons (`Eye`, `ArrowLeft`/`ArrowRight`, `Smile`, `ArrowDown`).
- Drive the highlighted step + ring fill from `session.progress()`.
- **Delete any client-side `passed`/verdict** — the component only collects.
- On `progress().done`, call `finish()`; on `expired`, show one retry that fetches
  a **fresh** challenge (never reuse a nonce).

## 3. Spot-check push → liveness deep-link

The server sends a `spot_check` FCM data message carrying `spotCheckId` (see
`server/services/pushNotificationService.js#sendSpotCheckNotification`). In the
app's notification handler:

```ts
// when a notification with data.type === 'spot_check' is tapped:
navigation.navigate('Attendance', {
  spotCheckId: data.spotCheckId,   // run the same liveness flow…
});
// after a successful liveness/face check, post the response:
await apiService.makeRequest(`/spot-checks/${spotCheckId}/respond`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ latitude, longitude, faceVerified: true,
                         livenessVerdict: { passed: true } }),
});
```

Pending spot-checks can also be polled with `GET /api/spot-checks/pending`.

## 4. Verify on device

1. `LIVENESS_MODE=shadow` first (server logs verdicts, never blocks) — confirm
   genuine users produce `complete: true` evidence in the logs.
2. Tune thresholds in `src/liveness/actionDetectors.ts` if needed (they are
   already stricter than the server's).
3. Flip the server to `LIVENESS_MODE=enforce` for a pilot org.

That's the whole device step. Everything it calls (`session`, `runner`,
`actionDetectors`, `faceFrame`, `markAttendance`) is already unit-tested.
