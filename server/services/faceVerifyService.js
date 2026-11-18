const axios = require('axios');
const FormData = require('form-data');

/**
 * FaceVerifyService
 * -----------------
 * Thin, configurable wrapper around the Python face-back `/verify-face` endpoint
 * so the attendance route can do REAL server-side verification at mark time
 * (closing the `faceVerified = !!faceImage` hole — SAACMS_MASTER_PLAN.md §6 P0).
 *
 * The face service keys enrolled faces by the student `uid` (see
 * routes/students.js enrollment, which posts user_id=uid). `/verify-face` takes
 * multipart `user_id` + `face_image` and returns { match: bool, reason?, distance? }.
 *
 * Base URL is configurable via FACE_API_URL (the old code hardcoded an IP that
 * breaks in any other environment).
 */
// Multiple face-back instances behind simple round-robin + failover, instead
// of one process capped at FACE_API_THREADS (default 8) taking every request
// in the building. FACE_API_URLS is a comma-separated list ("http://host:50011,
// http://host:50012,..."); FACE_API_URL (singular, old name) still works as a
// one-instance fallback so existing deployments don't need to change anything
// to keep working. Running multiple instances does NOT affect match accuracy —
// every instance runs the identical model files and reads the SAME shared
// MongoDB embeddings collection live on every request (see check.py), so which
// instance handles a given check-in has no bearing on the result; it only
// changes how many check-ins can be worked on at once.
const FACE_API_URLS = (process.env.FACE_API_URLS || process.env.FACE_API_URL || 'http://localhost:50011')
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);
const FACE_API_URL = FACE_API_URLS[0]; // kept for the few call sites/logs that just want "a" base URL
const TIMEOUT_MS = parseInt(process.env.FACE_API_TIMEOUT_MS || '8000', 10);

// Round-robins the STARTING instance for each new request (not just retries),
// so load actually spreads across the pool instead of every request preferring
// instance 0 and only falling back to others on failure.
let rrCursor = 0;
function candidateUrls() {
  if (FACE_API_URLS.length === 1) return FACE_API_URLS;
  const start = rrCursor % FACE_API_URLS.length;
  rrCursor = (rrCursor + 1) % FACE_API_URLS.length;
  return [...FACE_API_URLS.slice(start), ...FACE_API_URLS.slice(0, start)];
}

/**
 * POST to `path` on the face-back pool, trying instances in round-robin order
 * and moving to the NEXT instance (not retrying the same one) on a connection
 * failure (refused/reset/timeout — i.e. that instance is down), same as the
 * single-instance retry this replaces. `makeForm` is a factory (not a form
 * instance) because a `form-data` stream can only be consumed once, so a
 * fresh one is needed for each instance attempt.
 */
async function postWithFailover(path, makeForm, timeout, opts = {}) {
  const validateStatus = opts.validateStatus || ((s) => (s >= 200 && s < 300) || s === 404);
  const urls = candidateUrls();
  let lastErr;
  for (let i = 0; i < urls.length; i++) {
    try {
      return await axios.post(`${urls[i]}${path}`, makeForm(), {
        headers: makeForm().getHeaders(),
        timeout,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        validateStatus,
      });
    } catch (err) {
      lastErr = err;
      const isConnectionIssue =
        err.code === 'ECONNREFUSED' ||
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'ECONNABORTED';
      // A real application error (e.g. the instance responded with a 4xx/5xx
      // that validateStatus rejected) means that instance IS up and answered
      // — trying another instance wouldn't change a data/logic problem, so
      // surface it immediately instead of masking it behind pool failover.
      if (!isConnectionIssue) throw err;
      if (i < urls.length - 1) {
        console.warn(`[faceVerifyService] ${urls[i]} unreachable (${err.code}), trying next instance`);
      }
    }
  }
  throw lastErr;
}

/** Turn a base64 / data-URL string or Buffer into a Buffer for upload. */
function toBuffer(faceImage) {
  if (!faceImage) return null;
  if (Buffer.isBuffer(faceImage)) return faceImage;
  if (typeof faceImage !== 'string') return null;
  // strip an optional data URL prefix: data:image/jpeg;base64,XXXX
  const comma = faceImage.indexOf(',');
  const b64 = faceImage.startsWith('data:') && comma !== -1 ? faceImage.slice(comma + 1) : faceImage;
  try {
    return Buffer.from(b64, 'base64');
  } catch (_e) {
    return null;
  }
}

/**
 * Normalize a face-engine response ( /verify-face OR /verify-face-multi — both
 * return the same { match, similarity, spoof:{available,label,reason,score} }
 * shape) into the { reachable, match, score, similarity, reason, spoof } object
 * the attendance route enforces on. Kept as ONE function so single-frame and
 * multi-frame verification share identical spoof/label semantics — the route
 * treats a multi-frame 'fake' exactly like a single-frame 'fake'.
 */
function buildResult(data) {
  if (data.error) {
    return { reachable: true, match: null, score: null, reason: 'service_error', error: String(data.error) };
  }
  // check.py returns `similarity` (higher = closer); some builds return
  // `distance` (lower = closer) or `score`. Expose whatever is present.
  const score =
    typeof data.similarity === 'number'
      ? data.similarity
      : typeof data.distance === 'number'
      ? data.distance
      : typeof data.score === 'number'
      ? data.score
      : null;

  // Anti-spoof (PAD) verdict from the face engine, normalized. `available` is
  // false when the engine couldn't run PAD (then we never enforce it).
  const s = data.spoof && typeof data.spoof === 'object' ? data.spoof : null;
  const spoof = s
    ? {
        available: s.available === true,
        // Only a CONFIDENT 'fake' blocks. 'uncertain' (borderline) and 'real'
        // both pass, so a genuine user is never falsely rejected in real time.
        // For multi-frame, 'fake' means AT LEAST ONE captured frame was a
        // confident fake (a screen/bezel entered the shot mid-challenge).
        isFake: s.available === true && s.label === 'fake',
        isUncertain: s.available === true && s.label === 'uncertain',
        // 'retry'/'no_face' = the frame was unusable (too dark/bright/blurry or
        // no face found) — the engine refused to judge it. The app should ask
        // the user to recapture; NEVER treated as fake.
        needsRetry: s.available === true && (s.label === 'retry' || s.label === 'no_face'),
        retryReason: s.reason || null, // 'too_dark'|'too_bright'|'too_blurry'|'no_face'
        label: s.label || null,
        score: typeof s.score === 'number' ? s.score : null,
        // Decision margin + per-view margins — carried so the alert email can
        // explain WHY a frame was judged fake (real-vs-fake margin per view).
        margin: typeof s.margin === 'number' ? s.margin : null,
        margins: s.margins && typeof s.margins === 'object' ? s.margins : null,
        model: s.model || null,
        // Whole-frame SCREEN-replay signature (periodic moiré across the frame)
        // — TRUE even when the face-crop model said 'real', because a
        // frame-filling video replay shows a clean face the model passes but a
        // screen lattice/bezel the whole frame reveals. Routes use this to catch
        // exactly the replays MiniFASNet misses.
        screenSuspected: s.screenSuspected === true,
        // Aggressive variant (ANY single tainted frame) — the spot-check route
        // uses this so a held-up video replay is caught even when only some
        // burst frames show the screen. Falls back to screenSuspected.
        screenSuspectedAny: (s.screenSuspectedAny ?? s.screenSuspected) === true,
        screenMoire: typeof s.screenMoire === 'number' ? s.screenMoire : null,
        screenPeak: typeof s.screenPeak === 'number' ? s.screenPeak : null,
        // Multi-frame observability (undefined on single-frame responses).
        motion: typeof s.motion === 'number' ? s.motion : null,
        frameCount: typeof s.frameCount === 'number' ? s.frameCount : null,
        // Per-frame verdicts from predict_multi (antispoof_service.py), e.g.
        // [{label:'real'|'fake'|'uncertain'|..., margin, reason}, ...]. Used by
        // applyConservativeFakeGate() below; null on single-frame responses.
        frames: Array.isArray(s.frames) ? s.frames : null,
      }
    : {
        available: false,
        isFake: false,
        isUncertain: false,
        needsRetry: false,
        retryReason: null,
        label: null,
        score: null,
        margin: null,
        margins: null,
        model: null,
        screenSuspected: false,
        screenSuspectedAny: false,
        screenMoire: null,
        screenPeak: null,
        motion: null,
        frameCount: null,
        frames: null,
      };

  return {
    reachable: true,
    match: data.match === true,
    score,
    similarity: typeof data.similarity === 'number' ? data.similarity : null,
    reason: data.reason || null,
    spoof,
    error: null,
  };
}

/**
 * Multi-frame PAD's "any confident-fake frame fails the whole session" rule
 * (antispoof_service.py predict_multi) is deliberately AGGRESSIVE — it exists
 * for spot-check, where a false reject only costs a cheap retry. Check-in/out
 * has the opposite risk (a false reject costs a whole day's attendance), so
 * callers there opt into this gate: if the PAD verdict is 'fake' but the
 * per-frame breakdown shows REAL frames outnumbering fake ones (an isolated
 * bad frame — autofocus hunt, motion blur mid-blink — on an otherwise-clean
 * live capture, not a sustained replay signature), downgrade to 'uncertain'
 * instead of blocking. A genuine replay attack scores fake on EVERY frame
 * (validated on the corpus — see antispoof_service.py comments), so this
 * costs no real catch rate; it only protects a genuine user whose burst had
 * one or two noisy frames among mostly-real ones. Never touches spot-check,
 * which doesn't pass conservativeFakeGate and keeps today's aggressive rule.
 */
function applyConservativeFakeGate(spoof) {
  if (!spoof || !spoof.isFake || !Array.isArray(spoof.frames) || spoof.frames.length < 2) {
    return spoof;
  }
  const judged = spoof.frames.filter((f) => f && ['real', 'fake', 'uncertain'].includes(f.label));
  const fakeCount = judged.filter((f) => f.label === 'fake').length;
  const realCount = judged.filter((f) => f.label === 'real').length;
  if (fakeCount > 0 && realCount > fakeCount) {
    console.log(
      `[antispoof] conservative gate: fake -> uncertain (real frames ${realCount} outnumber fake frames ${fakeCount} of ${judged.length} judged)`
    );
    return { ...spoof, isFake: false, isUncertain: true, label: 'uncertain' };
  }
  return spoof;
}

/**
 * Verify a captured face against the enrolled identity.
 * @param {Object} args { uid, faceImage }  faceImage = base64/dataURL/Buffer
 * @param {Object} [opts] { conservativeFakeGate }  see applyConservativeFakeGate()
 * @returns {Object} {
 *   reachable: bool,   // did we get a response from the service?
 *   match: bool|null,  // did the face match? (null if not determinable)
 *   score: number|null,// similarity/distance if the service returns one
 *   reason: string|null,
 *   error: string|null
 * }
 */
async function verify({ uid, faceImage }, opts = {}) {
  if (!uid) {
    return { reachable: false, match: null, score: null, reason: 'missing_uid', error: 'uid required' };
  }
  const buf = toBuffer(faceImage);
  if (!buf || !buf.length) {
    return { reachable: false, match: null, score: null, reason: 'missing_image', error: 'face image required' };
  }

  try {
    const makeForm = () => {
      const form = new FormData();
      form.append('user_id', String(uid));
      form.append('face_image', buf, { filename: 'capture.jpg', contentType: 'image/jpeg' });
      return form;
    };

    // postWithFailover absorbs a transient blip (an instance still booting, a
    // momentary hiccup) by trying the NEXT pool instance — a truly-down pool
    // still ends up `reachable: false` below. 404 = "no face data for user"
    // is a valid business answer, not a transport error.
    const resp = await postWithFailover('/verify-face', makeForm, TIMEOUT_MS);

    console.log('[faceVerifyService] response status:', resp.status, 'data:', resp.data);
    const result = buildResult(resp.data || {});
    if (opts.conservativeFakeGate) result.spoof = applyConservativeFakeGate(result.spoof);
    return result;
  } catch (err) {
    // Network / timeout / service down.
    return {
      reachable: false,
      match: null,
      score: null,
      reason: 'unreachable',
      error: err.message,
    };
  }
}

/**
 * Multi-frame verify: send EVERY frame the app captured across the live
 * liveness challenge (one per action step + the final capture) to the face
 * engine's /verify-face-multi, which makes ONE identity decision (best frame)
 * and ONE anti-spoof decision (any confident-fake frame fails). Returns the
 * exact same shape as verify() so the attendance route enforces identically.
 *
 * Falls back to single-frame verify() when only one usable frame is supplied,
 * so callers can always route through here.
 * @param {Object} args { uid, faceImages }  faceImages = array of base64/dataURL/Buffer
 * @param {Object} [opts] { conservativeFakeGate }  see applyConservativeFakeGate()
 */
async function verifyMulti({ uid, faceImages }, opts = {}) {
  if (!uid) {
    return { reachable: false, match: null, score: null, reason: 'missing_uid', error: 'uid required' };
  }
  const bufs = (Array.isArray(faceImages) ? faceImages : [faceImages])
    .map(toBuffer)
    .filter((b) => b && b.length);
  if (!bufs.length) {
    return { reachable: false, match: null, score: null, reason: 'missing_image', error: 'face image required' };
  }
  if (bufs.length === 1) {
    return verify({ uid, faceImage: bufs[0] }, opts);
  }

  const makeForm = () => {
    const form = new FormData();
    form.append('user_id', String(uid));
    bufs.forEach((buf, i) =>
      form.append('face_images', buf, { filename: `frame-${i}.jpg`, contentType: 'image/jpeg' })
    );
    return form;
  };

  // Multi-frame PAD scores several frames (~100-150ms each) — give it more
  // headroom than the single-frame timeout so a scan never fails-closed on a
  // slow-but-healthy engine.
  const multiTimeout = Math.max(TIMEOUT_MS, 15000);
  try {
    const resp = await postWithFailover('/verify-face-multi', makeForm, multiTimeout);
    const result = buildResult(resp.data || {});
    if (opts.conservativeFakeGate) result.spoof = applyConservativeFakeGate(result.spoof);
    return result;
  } catch (err) {
    return { reachable: false, match: null, score: null, reason: 'unreachable', error: err.message };
  }
}

/**
 * Enroll / re-enroll a person's reference face in the embedding service.
 * Mirrors routes/students.js enrollment: POST /create-embedding with
 * user_id=uid + name + email + one-or-more `face_images`. Used when an Admin/HOD
 * uploads (or replaces) a faculty member's registration image after the fact.
 *
 * @param {Object} args { uid, name, email, faceImages } faceImages = array of
 *        base64/dataURL strings or Buffers (at least one).
 * @returns {Object} { reachable, ok, error }
 */
async function enroll({ uid, name, email, faceImages }) {
  if (!uid) return { reachable: false, ok: false, error: 'uid required' };
  const list = (Array.isArray(faceImages) ? faceImages : [faceImages])
    .map(toBuffer)
    .filter((b) => b && b.length);
  if (!list.length) return { reachable: false, ok: false, error: 'at least one face image required' };

  try {
    const makeForm = () => {
      const form = new FormData();
      form.append('user_id', String(uid));
      if (name) form.append('name', String(name));
      form.append('email', String(email || uid));
      list.forEach((buf, i) =>
        form.append('face_images', buf, { filename: `enroll-${i}.jpg`, contentType: 'image/jpeg' })
      );
      return form;
    };

    // Enrollment writes to the SAME shared MongoDB embeddings collection every
    // instance reads from live on each verify — it only needs to reach ONE
    // instance, any instance, for the new/updated embedding to be immediately
    // visible to verify calls against every other instance too.
    const resp = await postWithFailover('/create-embedding', makeForm, Math.max(TIMEOUT_MS, 20000), {
      validateStatus: (s) => s >= 200 && s < 500,
    });
    const data = resp.data || {};
    // Enrollment security screening result (face-back/check.py) — per-image
    // usable/quality_rejected/spoof_suspected tiers. Present on both success
    // and failure responses; null if the face engine predates this field.
    const security = data.security || null;
    if (resp.status >= 400 || data.error) {
      return { reachable: true, ok: false, error: String(data.error || `status ${resp.status}`), security };
    }
    return { reachable: true, ok: true, error: null, security };
  } catch (err) {
    return { reachable: false, ok: false, error: err.message, security: null };
  }
}

/**
 * Anti-spoof ONLY (no identity match) on a single image — for the super-admin
 * retroactive "Check Anti-Spam Faces" scan of stored captures. Posts to the face
 * engine's /antispoof. Never throws.
 * @param {Buffer|string} faceImage  Buffer / base64 / data-URL
 * @returns {{available:bool, real:bool, isFake:bool, label:string|null, score:number|null, error:string|null}}
 */
async function scanImage(faceImage) {
  const buf = toBuffer(faceImage);
  if (!buf || !buf.length) {
    return { available: false, real: true, isFake: false, label: null, score: null, error: 'missing_image' };
  }
  try {
    const makeForm = () => {
      const form = new FormData();
      form.append('face_image', buf, { filename: 'capture.jpg', contentType: 'image/jpeg' });
      return form;
    };
    const resp = await postWithFailover('/antispoof', makeForm, TIMEOUT_MS, {
      validateStatus: (s) => s >= 200 && s < 300,
    });
    const s = (resp.data && resp.data.spoof) || {};
    const available = s.available === true;
    // label is 'fake' | 'real' | 'uncertain' | 'retry' | 'no_face'. Only a
    // confident 'fake' counts as a spoof; 'uncertain' is surfaced for review but
    // never blocks/accuses; 'retry'/'no_face' mean the frame was unusable.
    const isFake = available && s.label === 'fake';
    const isUncertain = available && s.label === 'uncertain';
    return {
      available,
      isFake,
      isUncertain,
      needsRetry: available && (s.label === 'retry' || s.label === 'no_face'),
      retryReason: s.reason || null,
      label: s.label || null,
      score: typeof s.score === 'number' ? s.score : null,
      error: null,
    };
  } catch (err) {
    return { available: false, isFake: false, isUncertain: false, label: null, score: null, error: err.message };
  }
}

/**
 * VLM RESCAN — a hosted vision-language model's second-guess on a capture,
 * used ONLY as a fire-and-forget follow-up AFTER a check-in/out or spot-check
 * has already been marked/responded to the user (see server/routes/
 * attendance.js and spotChecks.js: called without `await`ing it on the
 * request path). Posts to the face engine's /antispoof-vlm-rescan.
 *
 * WHY THIS IS SEPARATE FROM verify()/verifyMulti()'s spoof result: the VLM
 * call measured 10-60s end-to-end (network + hosted-model inference) —
 * calling it inline used to make every check-in wait that long on
 * "Verifying...". It now NEVER runs inside the synchronous PAD path
 * (antispoof_service.py's predict_image no longer touches it at all); it
 * only exists here, invoked after the response already went out, purely to
 * correct the admin's spoof-review dashboard label for the cases the fast
 * local models (MiniFASNet, DeePixBiS) left 'uncertain'.
 *
 * Never throws — callers should fire this with `.catch()` (not `await`) so a
 * slow/failed rescan can never delay or break the request it follows.
 * @param {Buffer|string} faceImage
 * @returns {{available:bool, isFake:bool, label:string|null, reason:string|null, raw:string|null}}
 */
async function vlmRescan(faceImage) {
  const buf = toBuffer(faceImage);
  if (!buf || !buf.length) {
    return { available: false, isFake: false, label: null, reason: 'missing_image', raw: null };
  }
  try {
    const makeForm = () => {
      const form = new FormData();
      form.append('face_image', buf, { filename: 'capture.jpg', contentType: 'image/jpeg' });
      return form;
    };
    // Comfortably above face-back's own ANTISPOOF_VLM_TIMEOUT_S (300s default
    // — see vlm_spoof_service.py) so THIS timeout is never what cuts the call
    // short; face-back's is the one that actually bounds the NVIDIA request.
    // Raised twice (70s -> 130s -> 320s, 2026-07-30) chasing real timeouts on
    // a slower deployment network — this request is never on a user-facing
    // timer, so there's no reason to keep either bound tight.
    const resp = await postWithFailover('/antispoof-vlm-rescan', makeForm, 320000, {
      validateStatus: (s) => s >= 200 && s < 300,
    });
    const v = (resp.data && resp.data.vlm) || {};
    return {
      available: v.available === true,
      isFake: v.available === true && v.isFake === true,
      label: v.label || null,
      reason: v.reason || null,
      raw: v.raw || null,
    };
  } catch (err) {
    return { available: false, isFake: false, label: null, reason: err.message, raw: null };
  }
}

module.exports = { verify, verifyMulti, enroll, scanImage, vlmRescan, FACE_API_URL };
