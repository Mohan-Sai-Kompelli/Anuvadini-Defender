# -*- coding: utf-8 -*-
"""
vlm_spoof_service.py
---------------------
LAST-RESORT spoof scan using a hosted vision-language model (NVIDIA NIM,
nvidia/llama-3.1-nemotron-nano-vl-8b-v1) as a THIRD independent opinion,
after MiniFASNet (antispoof_service.py) and DeePixBiS (deepixbis_service.py)
have both already run and neither reached a confident verdict.

MODEL CHOICE (2026-08-03): this used to default to
"mistralai/mistral-medium-3.5-128b", which isn't actually a vision model on
this NIM catalog — every request (even a tiny text-only "Say OK", no image)
hung with ZERO bytes back until timeout, on every account/key tried. Direct
testing against https://integrate.api.nvidia.com/v1/models confirmed which
model IDs this account can actually reach; the fast-responding candidate
found first, meta/llama-3.2-11b-vision-instruct, was then EVALUATED against
the labeled corpus in livefakeimages/ (ground truth: fake_attempt_14/15/16/18
are confirmed screen-replay attacks, the rest are genuine selfies — see the
antispoof-decision-design memory) and scored 20/20 "FAKE", including all 16
genuine selfies — 100% false-positive, functionally useless despite being
fast. Swapping ONLY the model to nvidia/llama-3.1-nemotron-nano-vl-8b-v1
(same prompt, same code) scored 16/16 correct on that same corpus (the 2
"suspect" items both read FAKE, consistent with their ambiguous ground
truth) at ~2s/request. Moral: a fast wrong answer is worse than a slow one —
always score a NEW model against livefakeimages/ before trusting it, not
just "does it respond quickly on one image".

WHY THIS RUNS LAST, NOT FIRST
    It's a network call to a third-party API (seconds of latency, a paid
    request, a new external dependency/outage surface) — the opposite of
    MiniFASNet/DeePixBiS, which are local and fast. Running it only on
    'uncertain' frames (see antispoof_service.predict_image's call site) means
    it's paid for/waited on only on the minority of captures neither local
    model could already call confidently, not on every check-in.

WHY IT'S STILL ESCALATE-ONLY, SAME AS DeePixBiS
    A confident 'fake' label here does not block check-in/out attendance
    (server/routes/attendance.js's "POLICY CHANGE" comments) and does not
    always block spot-check either — it only feeds the admin's spoof-review
    dashboard. So this is never allowed to turn an already-'real' verdict into
    'fake' either (kept consistent with the other second-opinion gate) — it
    only ever resolves an 'uncertain' into 'fake', which costs nothing but an
    extra reviewed dashboard entry if wrong, while a genuinely missed spoof
    that a general-purpose VLM's broad visual reasoning CAN see (a laptop
    bezel, a phone frame, on-screen glare, a video-call UI element) but
    neither narrow PAD model was trained to look for costs real fraud going
    undetected.

Contract, same as the other two PAD modules: everything is defensive. No API
key / network failure / malformed response ever raises — predict_safe()
returns {"available": False} and the caller's verdict is untouched.
"""
import base64
import os

import requests

# NOTE: these used to be read ONCE at module-import time (`X = os.environ.get(...)`
# at module level). That broke in practice: check.py imports antispoof_service
# (which imports this module) BEFORE it calls load_dotenv(../server/.env) a few
# lines later — so NVIDIA_VLM_API_KEY was always None/missing regardless of what
# was actually in .env, permanently (module-level code runs once, at import).
# Every setting here is now read INSIDE predict_safe() on every call instead, so
# it always reflects the current environment no matter when/where dotenv loaded.
NVIDIA_VLM_URL = "https://integrate.api.nvidia.com/v1/chat/completions"

PROMPT = (
    "You are a presentation-attack (spoof) detector for a face-recognition "
    "attendance system. Look ONLY for evidence that this photo is NOT a "
    "direct live capture of a real person's face by a phone camera — for "
    "example: a laptop/monitor/TV bezel or edge visible in the frame, a "
    "keyboard or device chassis, on-screen UI elements (a video-call window, "
    "a paused video's scrubber/play button), screen glare or pixel "
    "moiré/banding, the sharp rectangular edge of a printed photo or another "
    "phone's screen being held up, or unnatural lighting consistent with a "
    "screen rather than ambient light on skin. If you see ANY such evidence, "
    "this is a SCREEN/PHOTO REPLAY ATTACK. If the image shows an ordinary "
    "direct selfie/camera capture with no such evidence, it is REAL.\n\n"
    "Answer with EXACTLY one word first on its own line — REAL or FAKE — "
    "then one short sentence explaining what you saw."
)


# Max long-side pixels sent to the VLM. A raw phone-camera capture (e.g.
# 3000x4000 from a 12MP sensor) re-encodes to a 1-3MB JPEG — base64 inflates
# that another ~33%, so the upload alone could take well past even a generous
# timeout on a slow/throttled connection (observed 2026-07-30: a real request
# still timed out at 120s from a real deployment network). The model only
# needs to SEE a laptop bezel/keyboard/screen edge, not read fine print — full
# camera resolution buys nothing here. 1024px keeps that detail comfortably
# visible while cutting a multi-MB upload down to tens of KB.
MAX_VLM_SIDE = int(os.environ.get("ANTISPOOF_VLM_MAX_SIDE", "1024"))


def _encode_jpeg_b64(img):
    import cv2
    h, w = img.shape[:2]
    scale = MAX_VLM_SIDE / float(max(h, w))
    if scale < 1.0:
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    if not ok:
        raise ValueError("jpeg encode failed")
    return base64.b64encode(buf.tobytes()).decode("ascii")


def _call_nvidia(api_key, model, b64, timeout_s):
    """One attempt against the NVIDIA endpoint with a given key. Returns the
    parsed {available,isFake,label,reason,raw} dict on success, or raises
    (caller decides whether to fail over to another key or give up).

    Payload is deliberately LEAN (max_tokens=200, temperature=0.2, no
    reasoning_effort) — this is a one-word REAL/FAKE classification of a
    single image, not an open-ended reasoning task. A high reasoning_effort +
    16384 max_tokens config makes the model generate far more before it
    answers, which is slower, not faster — the opposite of what a tight
    timeout budget needs.
    """
    payload = {
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": PROMPT},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                ],
            }
        ],
        "model": model,
        "max_tokens": 200,
        "stream": False,
        "temperature": 0.2,  # low — this is a classification task, not creative writing
        "top_p": 1,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
    }
    resp = requests.post(NVIDIA_VLM_URL, headers=headers, json=payload, timeout=timeout_s)
    resp.raise_for_status()
    data = resp.json()
    text = data["choices"][0]["message"]["content"].strip()

    first_word = text.split(None, 1)[0].strip(".:,").upper() if text else ""
    if first_word == "FAKE":
        label = "fake"
    elif first_word == "REAL":
        label = "real"
    else:
        label = "uncertain"  # model didn't answer in the expected format — never guess

    return {"available": True, "isFake": label == "fake", "label": label, "reason": None, "raw": text}


def predict_safe(img):
    """Score one already-oriented cv2 BGR frame with the hosted VLM.

    Returns: {available, isFake, label, reason, raw} — never raises. 'label'
    is 'fake' | 'real' | 'uncertain' (the model answered but not a clean
    REAL/FAKE first word) to mirror the other PAD modules' vocabulary, but
    callers should only ever act on isFake (see module docstring on why this
    stays escalate-only).

    TWO-KEY FAILOVER (2026-08-03): this host's chat-completions endpoint is
    reachable (TCP/TLS connects instantly, a bare GET answers in ~150ms) but a
    real POST with a body was observed hanging for 50s+ with NO response —
    confirmed with both `requests` and a bare `curl`, so it's a network-path
    issue to this host, not a client bug (see the old single-attempt 300s
    comment this replaced). A second key alone doesn't fix a pure network
    block, but it DOES help if the real cause is a rate-limited/stale key
    hanging instead of failing fast — and either way, this bounds the worst
    case to ~2x the PER-ATTEMPT timeout instead of one single 300s hang, which
    is what was actually reported as "too slow".
    """
    # Read every env-driven setting HERE, per call — see the note above
    # NVIDIA_VLM_URL on why these can't be module-level constants.
    vlm_enable = os.environ.get("ANTISPOOF_VLM_ENABLE", "1") == "1"
    model = os.environ.get("NVIDIA_VLM_MODEL", "nvidia/llama-3.1-nemotron-nano-vl-8b-v1")
    # Short PER-ATTEMPT budget (not the old single-shot 300s) — this only ever
    # runs from the async /antispoof-vlm-rescan path (fired AFTER a mark/
    # response already went out), so nothing blocks a user either way; this is
    # about not burning 5+ minutes per call when the host is unreachable.
    timeout_s = float(os.environ.get("ANTISPOOF_VLM_TIMEOUT_S", "20"))

    api_keys = [
        k for k in (
            os.environ.get("NVIDIA_VLM_API_KEY"),
            os.environ.get("NVIDIA_VLM_API_KEY_2"),
        ) if k
    ]

    if not vlm_enable:
        return {"available": False, "isFake": False, "label": None, "reason": "disabled", "raw": None}
    if not api_keys:
        return {"available": False, "isFake": False, "label": None, "reason": "no_api_key", "raw": None}
    if img is None or getattr(img, "size", 0) == 0:
        return {"available": False, "isFake": False, "label": None, "reason": "no_image", "raw": None}

    try:
        b64 = _encode_jpeg_b64(img)
    except Exception as e:  # noqa: BLE001
        return {"available": False, "isFake": False, "label": None, "reason": f"encode_failed:{e}", "raw": None}

    last_err = None
    for idx, key in enumerate(api_keys):
        try:
            return _call_nvidia(key, model, b64, timeout_s)
        except Exception as e:  # noqa: BLE001 — never let a third-party API break a verdict
            last_err = e
            print(f"[vlm_spoof] key #{idx + 1}/{len(api_keys)} failed ({e!r}) — "
                  + ("trying next key" if idx + 1 < len(api_keys) else "no keys left"))

    return {"available": False, "isFake": False, "label": None, "reason": str(last_err), "raw": None}
