# -*- coding: utf-8 -*-
"""
deepixbis_service.py
---------------------
SECOND-OPINION anti-spoof scorer, independent of the MiniFASNet PAD in
antispoof_service.py. Wraps DeePixBiS (Deep Pixel-wise Binary Supervision,
https://arxiv.org/pdf/1907.04047v1.pdf), vendored under face-back/deepixbis/
from https://github.com/Saiyam26/Face-Anti-Spoofing-using-DeePixBiS.

WHY A SECOND MODEL
    MiniFASNet and DeePixBiS are different architectures (3-class softmax on
    a MobileFaceNet-style backbone vs. a DenseNet-161-feature pixel-wise map)
    trained on different data. Two independently-wrong models rarely agree by
    accident, so requiring BOTH signals to point the same way is materially
    more trustworthy than either one alone — the same "two independent views"
    principle antispoof_service.py already uses internally (orig + zoomout),
    just one level up, across two different models instead of two crops of
    one model.

WHY THIS ONLY EVER ESCALATES (never demotes MiniFASNet's own verdict)
    Whether a captured frame is labelled 'fake' has ZERO effect on whether
    check-in/out attendance is blocked (server/routes/attendance.js's
    "POLICY CHANGE" comments: only identity mismatch blocks `/mark` now — a
    confirmed spoof is recorded for the admin dashboard and the mark still
    stands) and does not block spot-check either when the org's
    fraudMonitoring.mode caps the action below 'block'. So a wrongly-escalated
    'fake' here costs nothing but one extra dashboard entry for an admin to
    dismiss — never a blocked, denied, or even NOTIFIED user (the app never
    shows the spoof verdict). But a genuinely missed spoof (someone's static
    printed photo that MiniFASNet's margin logic passed) costs real fraud
    going undetected. That asymmetry is why this module is only ever allowed
    to turn 'real'/'uncertain' INTO 'fake', never the reverse — it adds recall
    without adding any real-world false-reject risk.

Contract, same as antispoof_service.py: everything is lazy + defensive. If the
model/weights/deps can't load, predict_safe() returns {"available": False}
and the caller (antispoof_service.predict_image) simply skips the second
opinion — MiniFASNet's own verdict is untouched.
"""
import os
import sys
import threading

import numpy as np

_HERE = os.path.dirname(os.path.abspath(__file__))
_VENDOR_DIR = os.path.join(_HERE, "deepixbis")
_WEIGHTS_PATH = os.path.join(_VENDOR_DIR, "DeePixBiS.pth")

# Score is the mean of DeePixBiS's predicted pixel-wise "bonafide" map, 0..1
# (matches the vendored Test.py's `res = torch.mean(mask).item()`). A frame
# scoring AT/BELOW this is a confident fake. Deliberately low/strict (not the
# vendored demo's casual 0.5 cutoff) — this model was trained on a small,
# print-photo-only dataset (NUAA Imposter, 863 images), so its calibration on
# OUR cameras/lighting is unknown; a strict bar means it only escalates when
# very confident, keeping the "extra dashboard noise" cost low. Tune down
# further (or disable via ANTISPOOF_DPB_ENABLE=0) if it over-fires in
# practice — nothing downstream is blocking on it, so it's safe to observe
# in production logs before tightening.
DPB_FAKE_MAX = float(os.environ.get("ANTISPOOF_DPB_FAKE_MAX", "0.15"))
DPB_ENABLE = os.environ.get("ANTISPOOF_DPB_ENABLE", "1") == "1"

_LOCK = threading.Lock()
_MODEL = None
_TFMS = None
_INIT_TRIED = False
_INIT_ERROR = None


def _ensure_loaded():
    global _MODEL, _TFMS, _INIT_TRIED, _INIT_ERROR
    if _INIT_TRIED:
        return _MODEL is not None
    with _LOCK:
        if _INIT_TRIED:
            return _MODEL is not None
        try:
            if not DPB_ENABLE:
                raise RuntimeError("disabled via ANTISPOOF_DPB_ENABLE=0")
            if not os.path.exists(_WEIGHTS_PATH):
                raise RuntimeError(f"weights missing: {_WEIGHTS_PATH}")
            import torch
            from torchvision import transforms

            if _VENDOR_DIR not in sys.path:
                sys.path.insert(0, _VENDOR_DIR)
            from model import DeePixBiS  # face-back/deepixbis/model.py

            model = DeePixBiS(pretrained=False)
            state_dict = torch.load(_WEIGHTS_PATH, map_location="cpu", weights_only=True)
            model.load_state_dict(state_dict)
            model.eval()

            _MODEL = model
            _TFMS = transforms.Compose([
                transforms.ToPILImage(),
                transforms.Resize((224, 224)),
                transforms.ToTensor(),
                transforms.Normalize((0.5, 0.5, 0.5), (0.5, 0.5, 0.5)),
            ])
            print("[deepixbis] second-opinion PAD model loaded "
                  f"(fake<= {DPB_FAKE_MAX}, escalate-only)")
        except Exception as e:  # noqa: BLE001 — never let this break the primary PAD path
            _INIT_ERROR = str(e)
            print("[deepixbis] UNAVAILABLE (primary MiniFASNet PAD continues without it):", e)
        finally:
            _INIT_TRIED = True
    return _MODEL is not None


def predict_safe(img, bbox):
    """Score ONE already-detected face crop with DeePixBiS.

    Args:
        img: full oriented cv2 BGR frame (same frame antispoof_service.py's
             _AntiSpoof already found a face in).
        bbox: [left, top, width, height] from the SAME detector MiniFASNet
              uses (antispoof_service._AntiSpoof._get_bbox) — reused rather
              than running a second face detector, since the two models only
              need to agree on WHAT to look at, not how to find it.

    Returns: {available, real, isFake, label, score} — never raises.
    'label'/'real'/'isFake' mirror antispoof_service.predict_image()'s
    vocabulary so callers can treat them uniformly, but this module only ever
    reports 'fake' or 'real'/'uncertain' — no quality gate of its own (the
    caller already ran one before finding this bbox).
    """
    if not _ensure_loaded():
        return {"available": False, "real": None, "isFake": False, "label": None, "score": None,
                "reason": _INIT_ERROR or "unavailable"}
    if img is None or bbox is None:
        return {"available": False, "real": None, "isFake": False, "label": None, "score": None,
                "reason": "no_bbox"}
    try:
        import torch
        import cv2

        left, top, w, h = bbox
        # Bbox can run slightly outside the frame (MiniFASNet's own cropper
        # tolerates this internally); clamp here since we index numpy directly.
        H, W = img.shape[0], img.shape[1]
        x0, y0 = max(0, left), max(0, top)
        x1, y1 = min(W, left + w), min(H, top + h)
        if x1 <= x0 or y1 <= y0:
            return {"available": False, "real": None, "isFake": False, "label": None, "score": None,
                    "reason": "degenerate_bbox"}
        crop = img[y0:y1, x0:x1]
        crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)

        with _LOCK:  # single shared instance — see module docstring on why
            tensor = _TFMS(crop_rgb).unsqueeze(0)
            with torch.no_grad():
                out_map, _out = _MODEL.forward(tensor)
                score = float(torch.mean(out_map).item())

        is_fake = score <= DPB_FAKE_MAX
        return {
            "available": True,
            "real": (None if not is_fake else False),  # never asserts True — escalate-only
            "isFake": is_fake,
            "label": "fake" if is_fake else "uncertain",
            "score": round(score, 4),
            "reason": None,
        }
    except Exception as e:  # noqa: BLE001 — never let a second-opinion crash break PAD
        print("[deepixbis] predict failed (verdict unaffected):", e)
        return {"available": False, "real": None, "isFake": False, "label": None, "score": None,
                "reason": str(e)}
