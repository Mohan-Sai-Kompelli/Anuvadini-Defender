# -*- coding: utf-8 -*-
"""
antispoof_service.py
--------------------
On-device-grade PRESENTATION-ATTACK DETECTION (PAD) for the face-back service.

Wraps the MiniVision Silent-Face-Anti-Spoofing (MiniFASNet) models that live in
the sibling ``../anti-spam`` folder and answers ONE question about a captured
frame: is this a REAL live face, or a FAKE one replayed on a phone/tablet screen
or a printed photo?

Why server-side (here) instead of on-device TFLite:
  * The PyTorch weights (`.pth`) already ship in ``anti-spam/resources`` and run
    on the same CPU the embedding model already uses — no model conversion, no
    native rebuild, and it works identically on Android AND iPhone (the phone
    just uploads the image, as it already does for face matching).

Contract — this module must NEVER break face verification:
  * Everything is lazy + defensive. If the models / deps / weights can't load,
    `predict()` returns ``{"available": False}`` and the caller treats the frame
    as "spoof unknown" (does NOT block). Same philosophy as the rest of the stack.

Quick self-test (from the face-back folder, with its venv active):
    python antispoof_service.py ../anti-spam/fake.jpg      # -> fake
    python antispoof_service.py ../anti-spam/images/sample/image_T1.jpg  # -> real
"""

import os
import sys
import math
import queue
import threading
import traceback
import concurrent.futures

import numpy as np

import deepixbis_service
# vlm_spoof_service is NOT imported here anymore — it's only called from
# check.py's separate /antispoof-vlm-rescan endpoint (async, after-the-fact),
# never from this module's synchronous predict_image()/predict_multi_safe()
# path. See the note above the removed inline call for why.

# ---------------------------------------------------------------------------
# Locate the vendored MiniFASNet project (sibling folder) and make its `src`
# package importable. We insert at the FRONT so `import src...` resolves to
# anti-spam/src (face-back has no `src` package of its own, so there's no clash).
# ---------------------------------------------------------------------------
_HERE = os.path.dirname(os.path.abspath(__file__))
ANTISPOOF_DIR = os.path.abspath(os.path.join(_HERE, "..", "anti-spam"))
MODEL_DIR = os.path.join(ANTISPOOF_DIR, "resources", "anti_spoof_models")
DETECT_PROTO = os.path.join(ANTISPOOF_DIR, "resources", "detection_model", "deploy.prototxt")
DETECT_MODEL = os.path.join(
    ANTISPOOF_DIR, "resources", "detection_model", "Widerface-RetinaFace.caffemodel"
)

# ---------------------------------------------------------------------------
# Decision logic — MARGIN-BASED relative comparison (matches the official
# MiniVision test.py, which argmax-es the 3 classes) evaluated on TWO VIEWS of
# the frame, plus an UNCERTAIN band.
#
# The model outputs 3 class probabilities: [fake(print/2D), real, fake(replay)].
# The OLD logic compared P(real) against absolute thresholds (>=0.6 real,
# <=0.4 fake) on a single view. Two production failure modes followed:
#   * absolute thresholds flagged genuine-but-imperfect selfies whose P(real)
#     was low but still the WINNING class;
#   * our 9:16 selfies fill the frame with the face, so the model's 2.7x/4x
#     context crops get clamped at the image border — geometry the model never
#     saw in training — which reliably drives genuine faces to P(fake)≈1.
#
# Fix, validated on the flagged-attempts corpus (20 production captures incl.
# 4 visually confirmed phone-replay attacks, + the repo's sample real/fakes):
#   * score margin = P(real) - max(P(fake_print), P(fake_replay)) on BOTH the
#     original frame AND a border-padded "zoomout" view (padding restores the
#     trained crop geometry for close-up faces);
#   * REAL      : best view's margin >= REAL_MARGIN (a genuine face wins
#                 clearly on at least one view — on the corpus, zoomout margins
#                 for genuine close-ups jump to +0.6..+0.98);
#   * FAKE      : EVERY face-bearing view has margin <= -FAKE_MARGIN. Screen
#                 replays carry their texture cues at every scale (confirmed
#                 replays stayed <= -0.5 on all views), while falsely-accused
#                 genuine frames always had at least one non-fake view;
#   * UNCERTAIN : anything else — surfaced for review, NEVER auto-blocked.
#
# FAKE_MARGIN is deliberately large: only a CONFIDENT, view-consistent fake
# verdict may accuse a user.
#
# Raised 0.5 -> 0.6 (2026-07): re-measured on this repo's own ground-truth
# corpus (livefakeimages/, 14 confirmed-genuine + 4 confirmed phone-replay
# attacks) — genuine margins ranged +0.47 to +1.0, confirmed attacks ranged
# -0.9989 to -0.9999. That's a ~1.47 gap between the worst genuine sample and
# the best (least-confident) attack, so there is ample room to demand a MORE
# confident fake before blocking — giving real headroom to lower-quality/older
# device cameras (whose noisier, more-compressed frames can drift a genuine
# capture's margin without being anywhere near actual replay territory) while
# every attack in the corpus still clears the new bar by a wide margin.
REAL_MARGIN = float(os.environ.get("ANTISPOOF_REAL_MARGIN", "0.2"))
FAKE_MARGIN = float(os.environ.get("ANTISPOOF_FAKE_MARGIN", "0.6"))
# Border padding for the zoomout view, as a fraction of the short image side.
ZOOMOUT_PAD = float(os.environ.get("ANTISPOOF_ZOOMOUT_PAD", "0.12"))

# ---------------------------------------------------------------------------
# Capture-quality gate — runs BEFORE the PAD models. A frame the model can't
# reliably judge (too dark / blown-out / hopelessly blurred) must NEVER produce
# a 'fake' verdict; it returns label='retry' with a reason so the app can tell
# the user to recapture. Thresholds calibrated on the production capture corpus:
#   brightness: genuine indoor selfies go down to ~68 mean-gray and up to ~200;
#     the misclassified ones were <30 (night, no light) or >205 (sky-backlit).
#   sharpness (Laplacian variance @640px): genuine FRONT-camera selfies are
#     soft (8-112) while screen-replay fakes are typically very sharp (>110),
#     so the blur floor is intentionally minimal — it only catches unusable
#     smears, it must NOT reject normal soft selfies.
MIN_BRIGHTNESS = float(os.environ.get("ANTISPOOF_MIN_BRIGHTNESS", "45"))
MAX_BRIGHTNESS = float(os.environ.get("ANTISPOOF_MAX_BRIGHTNESS", "205"))
MIN_SHARPNESS = float(os.environ.get("ANTISPOOF_MIN_SHARPNESS", "4"))

# ---------------------------------------------------------------------------
# Night / low-light handling. A dark frame used to be an instant 'too_dark'
# retry — attendance was simply impossible at night. Gamma-brightening
# (exponent < 1) lifts a genuine night capture into the model's judging range;
# validated on the corpus: the mean-27 night capture brightens to ~104 and,
# after the noise-robustness check below, scores margin +0.47 (real), while
# artificially darkened confirmed attacks stay <= -0.999 after the same
# treatment — brightening does not wash out replay texture.
LOWLIGHT_TARGET = float(os.environ.get("ANTISPOOF_LOWLIGHT_TARGET", "110"))
LOWLIGHT_MIN_EXP = float(os.environ.get("ANTISPOOF_LOWLIGHT_MIN_EXP", "0.30"))

# ---------------------------------------------------------------------------
# WHOLE-FRAME screen-texture (moiré) gate — the fix for a FRAME-FILLING screen
# replay that MiniFASNet passes. MiniFASNet only ever sees the FACE crop; on a
# laptop/monitor replay the face pixels look clean, so it scores 'real' ~0.99
# (measured on the production checkout captures). But the SCREEN's pixel lattice
# beating against the phone's sensor raises high-frequency energy across the
# WHOLE frame — a moiré signature the face crop hides. Measured on the corpus:
#   genuine live selfies : whole-frame mid/high-freq ratio 0.32-0.43
#   laptop-screen replays : 0.44-0.47  (a clean gap above every genuine sample)
# So a ratio at/above SCREEN_MOIRE_FAKE is a confident screen replay, overriding
# a 'real'/'uncertain' MiniFASNet verdict. The margin is thin (~0.01) and screen/
# camera dependent, so it is env-tunable and every score is logged — raise it if
# a sharp genuine camera on THIS deployment ever trips it, lower it to catch more.
SCREEN_MOIRE_FAKE = float(os.environ.get("ANTISPOOF_SCREEN_MOIRE", "0.44"))
# Periodicity guard — the CRUCIAL second condition that stops this gate from
# false-flagging genuine NIGHT selfies. High-ISO night sensor grain raises the
# whole-frame moiré RATIO exactly like a screen does (measured: genuine night
# captures 0.45-0.46, right in the laptop-replay band) — the ratio alone would
# wrongly reject them. But grain is RANDOM (flat FFT band → low peak/mean ~10-13)
# whereas a screen's regular pixel lattice makes CONCENTRATED periodic peaks
# (peak/mean ~15-20). Requiring BOTH ratio AND peak separates screen from grain:
# validated night-genuine 0/7 flagged, day-genuine 0/14, laptop-replay 7/7.
SCREEN_MOIRE_PEAK = float(os.environ.get("ANTISPOOF_SCREEN_MOIRE_PEAK", "14.5"))
# ENFORCEMENT SWITCH — default OFF. On real production devices the whole-frame
# moiré signature turned out to be device-dependent and NOT separable: genuine
# check-ins from the live front camera measured moiré 0.43-0.48 (same band as a
# laptop replay), and their periodicity peak occasionally crossed 14.5 too — so
# the override intermittently REJECTED genuine users ("verification failed" on a
# real face). A false rejection of a real employee is the worst outcome, so the
# hard block is disabled by default: the ratio/peak are still computed, returned
# and LOGGED for observability, but they never flip a verdict unless this is
# explicitly turned on (ANTISPOOF_SCREEN_MOIRE_ENFORCE=1) AFTER the thresholds
# have been validated on that deployment's own genuine-vs-replay captures.
SCREEN_MOIRE_ENFORCE = os.environ.get("ANTISPOOF_SCREEN_MOIRE_ENFORCE", "0") == "1"

# Noise-robustness check strength. Night/high-ISO sensor grain reads as
# replay/print texture to MiniFASNet (a genuine mean-130 night selfie with
# Laplacian sharpness ~227 scored margin -0.88 = confident fake). Denoising at
# h=10 recovers such frames (margin rises above -FAKE_MARGIN → downgraded to
# 'uncertain'/'real'), while every confirmed replay in the corpus stayed at
# margin <= -0.999 after the same denoise — screen texture cues are structural,
# not noise. h=15 was WORSE (plastic-skin oversmoothing); do not raise casually.
DENOISE_H = int(os.environ.get("ANTISPOOF_DENOISE_H", "10"))

# The RetinaFace cv2.dnn detector and the torch models are SHARED and NOT
# thread-safe WITHIN ONE _AntiSpoof instance (setInput+forward on the same
# cv2.dnn.Net object races across threads and corrupts the detected face box).
# Each _AntiSpoof instance therefore serializes its OWN inference behind its
# own instance-level lock (self._infer_lock, see __init__) — each image is
# ~100-150ms under that lock.
#
# A SINGLE shared instance (the old design) meant every request in the whole
# server queued behind ONE lock — at a 200-person check-out rush this meant
# requests piling up for many seconds, well past the app's timeout, showing as
# a stuck "Verifying..." screen. get_antispoof() below instead maintains a
# POOL of ANTISPOOF_POOL_SIZE independent instances (each with its own
# detector + torch models loaded, so no cross-instance sharing/races) and
# hands callers whichever one is free — true N-way concurrency instead of 1.
# Tune via ANTISPOOF_POOL_SIZE for the deployment's actual CPU headroom;
# default 2 is a conservative doubling that costs a second copy of the (small)
# model weights in RAM.
ANTISPOOF_POOL_SIZE = max(1, int(os.environ.get("ANTISPOOF_POOL_SIZE", "2")))
_INIT_LOCK = threading.Lock()


class _AntiSpoof:
    """Loads the RetinaFace detector + the MiniFASNet PAD models ONCE and scores
    frames. Construction can raise; callers go through get_antispoof() which
    swallows that into an "unavailable" state."""

    def __init__(self):
        # Own lock — this instance's cv2.dnn detector + torch models are only
        # ever touched by ONE caller at a time (see the pool comment above),
        # but concurrent callers of THIS SAME instance (e.g. two frames of the
        # same multi-frame request) must still not race each other.
        self._infer_lock = threading.Lock()
        import cv2  # local import so a missing cv2 doesn't kill module import
        import torch
        import torch.nn.functional as F
        from src.model_lib.MiniFASNet import (
            MiniFASNetV1,
            MiniFASNetV2,
            MiniFASNetV1SE,
            MiniFASNetV2SE,
        )
        from src.data_io import transform as trans
        from src.utility import get_kernel, parse_model_name
        from src.generate_patches import CropImage

        self._cv2 = cv2
        self._torch = torch
        self._F = F
        self._parse_model_name = parse_model_name
        self._cropper = CropImage()
        self._to_tensor = trans.Compose([trans.ToTensor()])
        self._model_map = {
            "MiniFASNetV1": MiniFASNetV1,
            "MiniFASNetV2": MiniFASNetV2,
            "MiniFASNetV1SE": MiniFASNetV1SE,
            "MiniFASNetV2SE": MiniFASNetV2SE,
        }
        self.device = torch.device("cpu")

        # Face detector for the bbox MiniFASNet crops around.
        if not (os.path.exists(DETECT_PROTO) and os.path.exists(DETECT_MODEL)):
            raise RuntimeError(f"detection model missing under {os.path.dirname(DETECT_PROTO)}")
        self._detector = cv2.dnn.readNetFromCaffe(DETECT_PROTO, DETECT_MODEL)
        self._detector_confidence = 0.6

        # Pre-load every MiniFASNet .pth so the first request isn't slow.
        self._models = []  # list of (model_name, scale, w, h, crop, torch_model)
        if not os.path.isdir(MODEL_DIR):
            raise RuntimeError(f"anti-spoof model dir missing: {MODEL_DIR}")
        names = [n for n in os.listdir(MODEL_DIR) if n.endswith(".pth")]
        if not names:
            raise RuntimeError(f"no .pth weights found in {MODEL_DIR}")
        for name in names:
            h_input, w_input, model_type, scale = parse_model_name(name)
            kernel = get_kernel(h_input, w_input)
            model = self._model_map[model_type](conv6_kernel=kernel).to(self.device)
            state_dict = self._torch_load(os.path.join(MODEL_DIR, name))
            # Weights were saved possibly DataParallel-wrapped ("module." prefix).
            first = next(iter(state_dict))
            if first.startswith("module."):
                from collections import OrderedDict

                stripped = OrderedDict((k[7:], v) for k, v in state_dict.items())
                model.load_state_dict(stripped)
            else:
                model.load_state_dict(state_dict)
            model.eval()
            self._models.append((name, scale, w_input, h_input, scale is not None, model))

    def _torch_load(self, path):
        torch = self._torch
        # newer torch (>=2.6) defaults weights_only=True; the .pth here are plain
        # state_dicts so that's fine, but fall back for older/edge cases.
        try:
            return torch.load(path, map_location=self.device, weights_only=True)
        except Exception:
            return torch.load(path, map_location=self.device)

    def _get_bbox(self, img):
        """Best face box in `img`. Returns (bbox, confidence); bbox is None when
        the detector found nothing above threshold."""
        cv2 = self._cv2
        height, width = img.shape[0], img.shape[1]
        aspect_ratio = width / height
        det_img = img
        if img.shape[1] * img.shape[0] >= 192 * 192:
            det_img = cv2.resize(
                img,
                (int(192 * math.sqrt(aspect_ratio)), int(192 / math.sqrt(aspect_ratio))),
                interpolation=cv2.INTER_LINEAR,
            )
        blob = cv2.dnn.blobFromImage(det_img, 1, mean=(104, 117, 123))
        self._detector.setInput(blob, "data")
        out = self._detector.forward("detection_out").squeeze()
        max_conf_index = int(np.argmax(out[:, 2]))
        conf = float(out[max_conf_index, 2])
        if conf < self._detector_confidence:
            return None, conf
        left = out[max_conf_index, 3] * width
        top = out[max_conf_index, 4] * height
        right = out[max_conf_index, 5] * width
        bottom = out[max_conf_index, 6] * height
        return [int(left), int(top), int(right - left + 1), int(bottom - top + 1)], conf

    def _find_face_any_rotation(self, img):
        """Find the face in `img`, trying the upright frame first and then the
        three other 90° rotations (some devices deliver sideways pixels with a
        wrong/absent EXIF tag — MiniFASNet was trained on upright faces, so a
        sideways face scores garbage). Returns (oriented_img, bbox) or (img, None).
        """
        cv2 = self._cv2
        rotations = [
            None,
            cv2.ROTATE_90_COUNTERCLOCKWISE,
            cv2.ROTATE_90_CLOCKWISE,
            cv2.ROTATE_180,
        ]
        best_img, best_bbox, best_conf = img, None, -1.0
        for rot in rotations:
            candidate = img if rot is None else cv2.rotate(img, rot)
            try:
                bbox, conf = self._get_bbox(candidate)
            except Exception:
                bbox, conf = None, -1.0
            if bbox is not None and conf > best_conf:
                best_img, best_bbox, best_conf = candidate, bbox, conf
                if rot is None:
                    break  # face found upright — the normal case, stop early
        return best_img, best_bbox

    def _screen_moire(self, img):
        """Whole-frame screen-replay cues → (ratio, peak).
          ratio = mid/high-frequency FFT energy / total. A screen's pixel lattice
                  (AND night sensor grain) push this up: genuine-day 0.32-0.43,
                  genuine-night 0.45-0.46, laptop-replay 0.44-0.47.
          peak  = max/mean of that frequency band = PERIODICITY. A screen's
                  regular grid makes concentrated peaks (~15-20); random night
                  grain is flat (~10-13). This is what tells screen from grain.
        Only ratio>=SCREEN_MOIRE_FAKE AND peak>=SCREEN_MOIRE_PEAK is a screen.
        Size-normalized so both are comparable across capture resolutions."""
        cv2 = self._cv2
        g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        h, w = g.shape
        s = 720.0 / max(h, w)
        if s < 1:
            g = cv2.resize(g, (int(w * s), int(h * s)))
        c = cv2.resize(g.astype(np.float32), (256, 256))
        F = np.fft.fftshift(np.abs(np.fft.fft2(c - c.mean())))
        cy, cx = 128, 128
        yy, xx = np.ogrid[:256, :256]
        r = np.hypot(yy - cy, xx - cx)
        band = F[(r > 40) & (r < 110)]
        tot = float(F[r > 6].sum()) + 1e-6
        ratio = float(band.sum()) / tot
        peak = float(band.max()) / (float(band.mean()) + 1e-6)
        return ratio, peak

    def _quality(self, img):
        """Capture-quality metrics + gate reason (None = usable frame).
        Sharpness is measured at a fixed 640px width so the Laplacian variance is
        comparable across capture resolutions."""
        cv2 = self._cv2
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        scale = 640.0 / max(1, gray.shape[1])
        if scale < 1:
            gray = cv2.resize(gray, None, fx=scale, fy=scale)
        sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        brightness = float(gray.mean())
        reason = None
        if brightness < MIN_BRIGHTNESS:
            reason = "too_dark"
        elif brightness > MAX_BRIGHTNESS:
            reason = "too_bright"
        elif sharpness < MIN_SHARPNESS:
            reason = "too_blurry"
        return {
            "brightness": round(brightness, 1),
            "sharpness": round(sharpness, 1),
            "reason": reason,
        }

    def _brighten(self, img):
        """Gamma-brighten a dark frame toward LOWLIGHT_TARGET mean gray.
        out = in^exp with exp < 1; exp chosen so the mean lands on target,
        clamped so a pitch-black frame isn't stretched into pure noise."""
        cv2 = self._cv2
        gray_mean = float(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).mean())
        if gray_mean <= 1:
            gray_mean = 1.0
        exp = math.log(LOWLIGHT_TARGET / 255.0) / math.log(gray_mean / 255.0)
        exp = min(1.0, max(LOWLIGHT_MIN_EXP, exp))
        lut = np.array([((i / 255.0) ** exp) * 255 for i in range(256)]).astype("uint8")
        return cv2.LUT(img, lut)

    def predict_path(self, image_path):
        """Score one image file. Returns a verdict dict (see predict_image).
        cv2.imread applies the JPEG EXIF orientation tag itself, so the frame
        arrives upright when the tag is correct; _find_face_any_rotation covers
        devices that write a wrong/missing tag."""
        return self.predict_image(self._cv2.imread(image_path))

    # -----------------------------------------------------------------------
    # MULTI-FRAME PAD — the real defence against a frame-filling screen replay.
    #
    # A single close-up replay (the face fills the frame, no bezel/moire in
    # shot) is at the ceiling of what any single-frame passive model can do —
    # measured on the production corpus, MiniFASNet AND cheap FFT/edge cues all
    # call such frames 'real'. But an attendance capture is never one frame: the
    # randomized liveness challenge (blink / turn / nod) already streams several
    # frames from ONE live session. Judging ALL of them together closes the gap:
    #
    #   * ANY frame a CONFIDENT fake  -> the whole attempt is fake. During a
    #     multi-frame challenge the attacker's hand/bezel/screen-glare enters at
    #     least one frame (the corpus' visible-screen replays score margin
    #     <= -0.99 there), and — validated on the same corpus — a genuine live
    #     face NEVER produces a confident-fake frame, so this adds recall with
    #     zero new false accusations.
    #   * STATIC across the challenge -> a genuine user who was asked to blink /
    #     turn / nod changes visibly frame-to-frame; a looped/paused replay held
    #     still barely does. Near-zero inter-frame change across a challenge that
    #     demanded motion is surfaced as 'uncertain' (for review), never an
    #     auto-block on its own — motion can legitimately be small.
    # -----------------------------------------------------------------------
    def _interframe_motion(self, images):
        """Mean normalized luma change across consecutive frames (0..~1).
        Downscaled + globally brightness-normalized so it measures STRUCTURE
        change (a head turn / blink), not exposure flicker. Returns None when
        there aren't at least two decodable frames."""
        cv2 = self._cv2
        grays = []
        for im in images:
            if im is None or getattr(im, "size", 0) == 0:
                continue
            g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
            g = cv2.resize(g, (96, 96)).astype(np.float32)
            m = g.mean()
            if m > 1:
                g *= (128.0 / m)  # cancel global exposure so we see structure
            grays.append(g)
        if len(grays) < 2:
            return None
        diffs = [float(np.abs(grays[i] - grays[i - 1]).mean()) / 255.0
                 for i in range(1, len(grays))]
        return float(np.mean(diffs)) if diffs else None

    def predict_multi(self, images):
        """Score a LIST of frames from one live session and fuse to one verdict.
        Scores frames SEQUENTIALLY on this one instance — kept for the offline
        calibrate_screen_gate.py caller. The live request path uses the
        module-level predict_multi_safe() instead, which scores frames from
        the SAME request in PARALLEL across the pool (see there).

        `images` is a list of cv2 BGR arrays (challenge-step frames + the final
        capture). Returns the same shape as predict_image() — see _fuse_multi().
        """
        frames = [self.predict_image(im) for im in images if im is not None]
        return _fuse_multi(images, frames, self._interframe_motion)

    def _score_view(self, img, bbox):
        """Fused margin for one view: (P(real), margin) with
        margin = P(real) - max(P(fake_print), P(fake_replay))."""
        torch, F = self._torch, self._F
        prediction = np.zeros((1, 3))
        for (_name, scale, out_w, out_h, do_crop, model) in self._models:
            param = {
                "org_img": img,
                "bbox": bbox,
                "scale": scale,
                "out_w": out_w,
                "out_h": out_h,
                "crop": do_crop,
            }
            patch = self._cropper.crop(**param)
            tensor = self._to_tensor(patch).unsqueeze(0).to(self.device)
            with torch.no_grad():
                logits = model.forward(tensor)
                probs = F.softmax(logits, dim=1).cpu().numpy()
            prediction += probs
        avg = prediction[0] / max(1, len(self._models))
        real_score = float(avg[1])
        return real_score, real_score - float(max(avg[0], avg[2]))

    def predict_image(self, img):
        """Score an OpenCV BGR image array.

        Returns: {
          available: True,
          real: bool|None,       # True live / False spoof / None can't say
          label: 'real'|'fake'|'uncertain'|'retry'|'no_face',
          reason: str|None,      # for retry/no_face: 'too_dark'|'too_bright'|
                                 #   'too_blurry'|'no_face' → app asks to recapture
          score: float|None,     # fused P(real) 0..1 of the best view
          margin: float|None,    # best view's margin (decision variable)
          margins: {view: margin}, # per-view margins for observability
          quality: {brightness, sharpness, reason},
          model: 'minifasnet',
        }
        Only a CONFIDENT 'fake' should ever block/flag a user. 'retry'/'no_face'
        mean the frame was unusable — recapture, never accuse.
        """
        if img is None or getattr(img, "size", 0) == 0:
            return {"available": False, "reason": "unreadable_image"}

        cv2 = self._cv2

        # Gate 1: capture quality. A frame the model can't reliably judge
        # (blown-out backlight, smeared blur) must never yield 'fake'.
        # 'too_dark' is special-cased: a genuine night capture is recoverable
        # by gamma-brightening, so try that BEFORE giving up — otherwise
        # attendance is simply impossible at night.
        quality = self._quality(img)
        if quality["reason"] == "too_dark":
            bright = self._brighten(img)
            bright_quality = self._quality(bright)
            if not bright_quality["reason"]:
                img = bright
                quality = dict(bright_quality, enhanced=True)
        if quality["reason"]:
            return {
                "available": True,
                "real": None,
                "label": "retry",
                "reason": quality["reason"],
                "score": None,
                "margin": None,
                "margins": {},
                "quality": quality,
                "model": "minifasnet",
            }

        # Serialize inference ON THIS INSTANCE — its cv2.dnn detector + torch
        # models are not thread-safe; concurrent access was the source of the
        # varying scores. Other pool instances run this section in parallel.
        with self._infer_lock:
            # Orient the frame so the face is upright (some devices deliver
            # sideways pixels with a wrong/absent EXIF tag).
            img, bbox = self._find_face_any_rotation(img)

            # Second view: replicate-pad the borders ("zoomout"). Production
            # selfies fill the frame with the face, which clamps the model's
            # context crops at the border and reliably drives genuine faces to
            # fake — padding restores the trained geometry. It also lets the
            # detector find faces that touch the frame edge.
            pad = int(ZOOMOUT_PAD * min(img.shape[0], img.shape[1]))
            padded = cv2.copyMakeBorder(img, pad, pad, pad, pad, cv2.BORDER_REPLICATE)
            try:
                bbox_pad, _conf = self._get_bbox(padded)
            except Exception:
                bbox_pad = None

            # Gate 2: the face must actually be FOUND in at least one view. The
            # old code fell back to scoring the whole frame, which produced
            # garbage near-0 scores reported as confident 'fake' — a false
            # accusation. Unusable frame → ask the user to recapture instead.
            views = {}
            if bbox is not None:
                views["orig"] = self._score_view(img, bbox)
            if bbox_pad is not None:
                views["zoomout"] = self._score_view(padded, bbox_pad)
            if not views:
                return {
                    "available": True,
                    "real": None,
                    "label": "no_face",
                    "reason": "no_face",
                    "score": None,
                    "margin": None,
                    "margins": {},
                    "quality": quality,
                    "model": "minifasnet",
                }

        # Noise-robustness check before accusing: heavy sensor grain (night /
        # high-ISO captures) reads as replay/print texture to MiniFASNet and
        # drives genuine faces to confident fake. When EVERY view says fake,
        # re-score denoised copies of the same views — replay texture cues are
        # structural and survive denoising (all confirmed attacks in the
        # corpus stayed <= -0.999), while noise-driven false fakes recover.
        # Only runs on a would-be fake verdict, so the ~1-3s denoise cost is
        # never paid on the normal genuine path.
        if views and all(m <= -FAKE_MARGIN for _s, m in views.values()):
            with self._infer_lock:
                try:
                    # Re-detect the face on the denoised frame rather than
                    # reusing the noisy frame's bbox: the scorer must judge the
                    # exact crop the detector saw, and the box shifts slightly
                    # once the grain is gone (`img` is already oriented, so a
                    # plain detection is enough — no rotation search).
                    den = cv2.fastNlMeansDenoisingColored(img, None, DENOISE_H, DENOISE_H, 7, 21)
                    try:
                        bbox_den, _ = self._get_bbox(den)
                    except Exception:
                        bbox_den = None
                    if bbox_den is not None:
                        views["denoised"] = self._score_view(den, bbox_den)
                    den_pad = cv2.copyMakeBorder(den, pad, pad, pad, pad, cv2.BORDER_REPLICATE)
                    try:
                        bbox_den_pad, _ = self._get_bbox(den_pad)
                    except Exception:
                        bbox_den_pad = None
                    if bbox_den_pad is not None:
                        views["denoised_zoomout"] = self._score_view(den_pad, bbox_den_pad)
                except Exception as e:  # noqa: BLE001 — never let the rescue path break a verdict
                    print("[antispoof] denoise check failed (verdict unchanged):", e)

        margins = {name: round(m, 4) for name, (_s, m) in views.items()}
        best_view = max(views, key=lambda k: views[k][1])
        best_score, best_margin = views[best_view]

        # Whole-frame screen-texture (moiré) — the frame-filling-replay catch
        # that MiniFASNet (face-crop only) misses. Computed on the oriented img.
        try:
            screen_moire, screen_peak = self._screen_moire(img)
        except Exception:  # noqa: BLE001 — never let this break a verdict
            screen_moire, screen_peak = None, None

        if best_margin >= REAL_MARGIN:
            # A genuine face wins clearly on at least one view.
            label, real = "real", True
        elif all(m <= -FAKE_MARGIN for _s, m in views.values()):
            # Fake requires EVERY face-bearing view (including the denoised
            # ones when they ran) to agree confidently — replay/print texture
            # cues survive re-framing and denoising; borderline genuine
            # frames don't.
            label, real = "fake", False
        else:
            label, real = "uncertain", None

        # Night-grain RESCUE: MiniFASNet reads heavy high-ISO night sensor grain
        # as fake print/replay texture and confidently rejects genuine night
        # selfies (measured: real night captures scored margin -0.5..-0.78). That
        # grain has the SAME high whole-frame moiré ratio as a screen but a LOW
        # periodicity peak (it's random, not a lattice). So a 'fake' verdict on a
        # high-ratio / LOW-peak frame is grain, not a screen → downgrade to
        # 'uncertain' (which passes) rather than falsely accuse. Real screens
        # (peak high) and phone/photo replays (ratio < the floor) are untouched.
        is_grain = (
            screen_moire is not None
            and screen_peak is not None
            and screen_moire >= SCREEN_MOIRE_FAKE
            and screen_peak < SCREEN_MOIRE_PEAK
        )
        if label == "fake" and is_grain:
            print(f"[antispoof] NIGHT-GRAIN rescue: fake -> uncertain "
                  f"(moire {screen_moire:.3f}>={SCREEN_MOIRE_FAKE} but peak "
                  f"{screen_peak:.1f}<{SCREEN_MOIRE_PEAK} = random grain, not a screen)")
            label, real = "uncertain", None

        # Screen-moiré override: a PERIODIC whole-frame moiré signature (high
        # ratio AND high peak) means the face is on a screen, even when
        # MiniFASNet's face crop looked 'real'. Both conditions are required so
        # random night sensor-grain (high ratio, LOW peak) is NOT mistaken for a
        # screen — that guard keeps genuine night selfies passing. Only ever
        # ESCALATES toward fake, never rescues a fake.
        is_screen = (
            screen_moire is not None
            and screen_peak is not None
            and screen_moire >= SCREEN_MOIRE_FAKE
            and screen_peak >= SCREEN_MOIRE_PEAK
        )
        if is_screen and label != "fake":
            if SCREEN_MOIRE_ENFORCE:
                print(f"[antispoof] SCREEN-MOIRE override: {label} -> fake "
                      f"(moire {screen_moire:.3f}>={SCREEN_MOIRE_FAKE} AND peak "
                      f"{screen_peak:.1f}>={SCREEN_MOIRE_PEAK}, best_margin {best_margin:.3f})")
                label, real = "fake", False
            else:
                # Advisory only (enforcement off) — log for tuning, do NOT block.
                print(f"[antispoof] screen-moire signal (NOT enforced): {label} kept "
                      f"(moire {screen_moire:.3f}, peak {screen_peak:.1f})")

        # SECOND-OPINION escalation (deepixbis_service.py) — a different model,
        # different architecture, different training data than MiniFASNet.
        # Only ever turns real/uncertain INTO fake, never the reverse: see that
        # module's docstring for why this asymmetry is safe (a confident
        # 'fake' label here does NOT block check-in/out attendance or always
        # block spot-check — it only feeds the admin's spoof-review dashboard
        # — so a wrong escalation costs nothing but one extra reviewed entry,
        # while a genuinely missed spoof MiniFASNet's own margin let through
        # costs real fraud going undetected).
        dpb = None
        if label != "fake":
            dpb_bbox = bbox if bbox is not None else bbox_pad
            dpb_img = img if bbox is not None else padded
            try:
                dpb = deepixbis_service.predict_safe(dpb_img, dpb_bbox)
            except Exception as e:  # noqa: BLE001 — never let the second opinion break a verdict
                print("[antispoof] deepixbis second-opinion failed (verdict unchanged):", e)
                dpb = None
            if dpb and dpb.get("available") and dpb.get("isFake"):
                print(f"[antispoof] DeePixBiS second-opinion: {label} -> fake "
                      f"(dpb_score={dpb.get('score')}, minifas_margin={best_margin:.3f})")
                label, real = "fake", False

        # SHARP-SCREEN escalation — a laptop/monitor replay that fills most of
        # the frame but still shows a sliver of the device (keyboard/bezel) at
        # an edge. MiniFASNet's "zoomout" view can score this confidently REAL
        # (the padded border geometry fools it) even though whole-frame signals
        # this file already computes on every request say otherwise:
        #   * sharpness (quality['sharpness'], Laplacian variance) — the
        #     capture-quality gate's OWN calibration comment above says genuine
        #     front-camera selfies run 8-112 while screen replays run >110
        #     (screens are re-photographed edges/text, camera-sharp). This
        #     signal is otherwise only used as a MIN floor (>=4) — never for
        #     an upper anomaly check until now. ALWAYS required here (hard
        #     gate) — it's what keeps this safe for everyday soft phone-camera
        #     selfies, whose sharpness never gets near this bar.
        #   * PLUS at least one of: elevated screen_moire ratio, OR a strongly
        #     elevated screen_peak. Originally this required sharpness AND
        #     peak>=SCREEN_MOIRE_PEAK(14.5) together, which missed confirmed
        #     replays whose peak sat just under that bar (13.5-13.8) despite
        #     unambiguous sharpness (300-1985) AND moire ratio (0.44-0.49) —
        #     re-calibrated 2026-07-29 against a real batch of confirmed
        #     screen-replay captures where sharpness was the reliable anomaly
        #     but peak alone missed 3/16. moire ratio alone is still not safe
        #     as a standalone gate (genuine-day corpus overlaps a confirmed
        #     replay's 0.4266) — it's only trusted here IN COMBINATION with
        #     the sharpness anomaly, which no genuine capture in either corpus
        #     (max observed 112.5) gets anywhere close to.
        #   Escalate-only (never demotes an existing 'fake') — same
        #   non-blocking-dashboard-only reasoning as the DeePixBiS gate above.
        #
        # DEFAULT OFF (2026-07-29): calibrated against a small local corpus
        # (WhatsApp-relayed test images + livefakeimages/) whose genuine max
        # sharpness was 112.5 — but a real teammate's laptop/webcam produced
        # GENUINE captures at sharpness 144.7, 155.1, AND 744.5 (same person,
        # same device, three consecutive real check-ins), all comfortably
        # above the 130 bar and all wrongly escalated to 'fake'. Sharpness (a
        # raw Laplacian-variance number) is exactly as device/camera-dependent
        # as the screen-moiré ratio already proved to be (see SCREEN_MOIRE_
        # ENFORCE above, disabled for the identical reason) — a phone/webcam
        # with a strong in-camera sharpening filter defeats a static
        # cross-deployment threshold. Do NOT re-enable without first running
        # calibrate_screen_gate.py-style measurement against THIS deployment's
        # own genuine-capture population (per device model, ideally) to find
        # a safe floor — a global default can't be trusted after this result.
        SHARP_SCREEN_ENABLE = os.environ.get("ANTISPOOF_SHARP_SCREEN_ENABLE", "0") == "1"
        SHARP_SCREEN_MIN_SHARPNESS = float(os.environ.get("ANTISPOOF_SHARP_SCREEN_MIN_SHARPNESS", "130"))
        SHARP_SCREEN_MIN_PEAK = float(os.environ.get("ANTISPOOF_SHARP_SCREEN_MIN_PEAK", "20"))
        sharpness_val = quality.get("sharpness")
        is_sharp_screen = (
            SHARP_SCREEN_ENABLE
            and label != "fake"
            and sharpness_val is not None
            and sharpness_val >= SHARP_SCREEN_MIN_SHARPNESS
            and (
                (screen_moire is not None and screen_moire >= SCREEN_MOIRE_FAKE)
                or (screen_peak is not None and screen_peak >= SHARP_SCREEN_MIN_PEAK)
            )
        )
        if is_sharp_screen:
            print(f"[antispoof] SHARP-SCREEN escalation: {label} -> fake "
                  f"(sharpness={sharpness_val}>={SHARP_SCREEN_MIN_SHARPNESS}, "
                  f"moire={screen_moire}, peak={screen_peak})")
            label, real = "fake", False

        # VLM scan (vlm_spoof_service.py) is DELIBERATELY NOT called here.
        # It used to run inline (see git history around 2026-07-29) but that
        # made check-in/out/spot-check wait on a third-party API in the
        # request path — measured 10-60s per call, turning a normally
        # sub-second "Verifying..." into a full-minute stall for every user.
        # POLICY (2026-07-29, explicit instruction): attendance must be marked
        # immediately off MiniFASNet + DeePixBiS + sharp-screen alone, exactly
        # as before the VLM existed. The VLM still runs — as a RESCAN, fired
        # AFTER the mark/response already happened (server/routes/
        # attendance.js and spotChecks.js call face-back's separate
        # /antispoof-vlm-rescan endpoint, fire-and-forget, once the user's
        # response is already on the wire) purely to correct the admin
        # dashboard's spoof label after the fact. See vlm_spoof_service.py and
        # check.py's /antispoof-vlm-rescan route.

        return {
            "available": True,
            "real": real,            # True / False / None (uncertain)
            "label": label,          # 'real' | 'fake' | 'uncertain'
            "reason": None,
            "score": round(best_score, 4),
            "margin": round(best_margin, 4),
            "margins": margins,
            "secondOpinion": dpb,    # deepixbis_service verdict, or None if skipped/unavailable
            "vlmScan": None,         # VLM never runs inline anymore — see /antispoof-vlm-rescan
            "screenMoire": round(screen_moire, 4) if screen_moire is not None else None,
            "screenPeak": round(screen_peak, 2) if screen_peak is not None else None,
            # Whole-frame screen signature (periodic moiré). Exposed so the
            # caller can act on it EVEN WHEN the face-crop model said 'real'
            # (a frame-filling replay the model itself misses): the routes
            # block it on spot-checks and flag it in the dashboard on
            # check-in/out. Independent of SCREEN_MOIRE_ENFORCE, which only
            # controls whether it flips this module's own label to 'fake'.
            "screenSuspected": bool(is_screen),
            # Single-frame path has only one frame, so the "any frame" verdict
            # the spot-check route reads equals the majority one here.
            "screenSuspectedAny": bool(is_screen),
            "quality": quality,
            "model": "minifasnet",
        }


def _fuse_multi(images, frames, motion_fn):
    """Fuse ALREADY-SCORED per-frame verdicts (a list of predict_image()
    results, one per frame) into one multi-frame verdict. Split out of
    _AntiSpoof.predict_multi() so the module-level predict_multi_safe() can
    score the frames of ONE request IN PARALLEL (across the instance pool)
    and then run this same fusion math — the math itself never touches a
    model, so it doesn't need to run on any particular instance.

    `motion_fn` is a bound _AntiSpoof._interframe_motion (any pool instance's
    works identically — it's pure cv2/numpy, no model state). Returns the same
    shape as predict_image() plus frames/usableCount/motion — see
    predict_multi()'s original docstring for the full field list and the
    any-confident-fake-wins decision priority.
    """
    if not frames:
        return {"available": False, "reason": "no_frames", "model": "minifasnet"}

    judged = [f for f in frames if f.get("label") in ("real", "fake", "uncertain")]
    motion = motion_fn(images)

    # Require at least MIN_FAKE_FRAMES independently-confident-fake frames
    # (or ALL judged frames, when only one was judgeable) before failing the
    # WHOLE multi-step session — a single frame reading fake (autofocus
    # hunting, motion blur mid-turn, a lighting flicker: all more common on
    # cheaper/older camera sensors) on an otherwise-clean capture is far
    # more likely camera noise than a replay attack: someone HOLDING UP a
    # screen/photo shows its texture signature consistently across MOST of
    # the session's frames (they can't un-hold it for just one frame), not
    # just a single incidental one. Confirmed replays in the corpus scored
    # <= -0.999 on EVERY view of EVERY frame, so this costs no real recall.
    MIN_FAKE_FRAMES = int(os.environ.get("ANTISPOOF_MIN_FAKE_FRAMES", "2"))
    fake_frames = [f for f in judged if f.get("label") == "fake"]
    any_fake = len(fake_frames) >= min(MIN_FAKE_FRAMES, len(judged))
    any_real = any(f.get("label") == "real" for f in judged)

    # Best (most 'real') judged frame carries the representative score/margin.
    def _m(f):
        return f.get("margin") if f.get("margin") is not None else -1.0
    best = max(judged, key=_m) if judged else frames[0]

    if any_fake:
        label, real = "fake", False
    elif any_real:
        # Genuine → real, unless the whole session barely moved despite a
        # challenge that demanded motion (advisory downgrade, never a block).
        STATIC_MOTION = float(os.environ.get("ANTISPOOF_STATIC_MOTION", "0.008"))
        if motion is not None and len(judged) >= 2 and motion < STATIC_MOTION:
            label, real = "uncertain", None
        else:
            label, real = "real", True
    elif judged:
        label, real = "uncertain", None
    else:
        # No frame was judgeable — surface the first frame's retry/no_face.
        label, real = frames[0].get("label", "retry"), None

    # TWO screen-signature verdicts, because the right sensitivity differs
    # by WHERE it's used:
    #   screenSuspected     — MAJORITY vote (2+ tainted frames, or all when
    #     only one was captured). Cautious: a single-frame glitch (glare,
    #     autofocus hunt) on a genuine face can't trip it. Used by the
    #     check-in/out path, where a false reject costs a whole day's
    #     attendance.
    #   screenSuspectedAny  — ANY single tainted frame. Aggressive (the
    #     pre-2026-07-21 behaviour). Used by the SPOT-CHECK path, where a
    #     false reject only costs a retry, so catching a held-up video
    #     replay is worth the occasional genuine recapture.
    screen_frames = [f for f in frames if f.get("screenSuspected") is True]
    any_screen = len(screen_frames) >= min(MIN_FAKE_FRAMES, len(frames))
    any_screen_single = len(screen_frames) >= 1

    return {
        "available": True,
        "real": real,
        "label": label,
        "reason": None if label in ("real", "fake", "uncertain") else frames[0].get("reason"),
        "score": best.get("score"),
        "margin": best.get("margin"),
        "margins": best.get("margins", {}),
        "screenSuspected": any_screen,
        "screenSuspectedAny": any_screen_single,
        "quality": best.get("quality"),
        "motion": round(motion, 4) if motion is not None else None,
        "usableCount": len(judged),
        "frameCount": len(frames),
        "frames": [
            {"label": f.get("label"), "margin": f.get("margin"), "reason": f.get("reason")}
            for f in frames
        ],
        "model": "minifasnet",
    }


# ---------------------------------------------------------------------------
# Lazy POOL (was a single lazy singleton — see the pool comment near
# ANTISPOOF_POOL_SIZE above for why). _ALL_INSTANCES holds every built
# instance (for get_antispoof()'s backward-compat single-instance access, used
# by the offline calibrate_screen_gate.py script only); _FREE_POOL is the
# checkout queue actual requests block on, giving true N-way concurrency
# instead of the old one-lock-for-everyone bottleneck.
# ---------------------------------------------------------------------------
_ALL_INSTANCES = []
_FREE_POOL = queue.Queue()
_INIT_TRIED = False
_INIT_ERROR = None


def _ensure_pool():
    """Build the pool once. Returns True if at least one instance is usable."""
    global _INIT_TRIED, _INIT_ERROR
    if _INIT_TRIED:
        return bool(_ALL_INSTANCES)
    # Guard the lazy load so concurrent first-requests don't each try to build
    # the pool at once.
    with _INIT_LOCK:
        if _INIT_TRIED:  # double-checked under the lock
            return bool(_ALL_INSTANCES)
        if ANTISPOOF_DIR not in sys.path:
            sys.path.insert(0, ANTISPOOF_DIR)
        try:
            for _ in range(ANTISPOOF_POOL_SIZE):
                inst = _AntiSpoof()
                _ALL_INSTANCES.append(inst)
                _FREE_POOL.put(inst)
            print(
                f"[antispoof] PAD active — pool of {len(_ALL_INSTANCES)} instance(s) x "
                f"{len(_ALL_INSTANCES[0]._models)} MiniFASNet model(s) loaded; "
                f"margins real>=+{REAL_MARGIN} fake<=-{FAKE_MARGIN}; "
                f"quality brightness {MIN_BRIGHTNESS}-{MAX_BRIGHTNESS}, sharpness>={MIN_SHARPNESS}"
            )
        except Exception as e:  # noqa: BLE001 — must never propagate into verify-face
            _INIT_ERROR = str(e)
            if _ALL_INSTANCES:
                # At least one instance built before the failure (e.g. a
                # transient issue on instance 2+) — degrade pool size rather
                # than going fully unavailable.
                print(
                    f"[antispoof] PAD degraded — only {len(_ALL_INSTANCES)}/{ANTISPOOF_POOL_SIZE} "
                    f"pool instance(s) built:", e
                )
            else:
                print("[antispoof] PAD UNAVAILABLE (face verification continues without it):", e)
                traceback.print_exc()
        finally:
            _INIT_TRIED = True
    return bool(_ALL_INSTANCES)


def get_antispoof():
    """Backward-compat single-instance accessor for the offline
    calibrate_screen_gate.py script (single-threaded, never runs alongside
    live traffic) — returns one pool instance WITHOUT checking it out, so
    don't call this from request-handling code; use predict_safe /
    predict_multi_safe there, which properly check instances in and out of
    the concurrent pool."""
    if not _ensure_pool():
        return None
    return _ALL_INSTANCES[0]


# A checkout blocks if every pool instance is currently busy — exactly the
# queueing behaviour the old single lock had, just ANTISPOOF_POOL_SIZE-wide
# instead of 1-wide. ANTISPOOF_POOL_TIMEOUT_S bounds that wait so a request
# fails closed to "unavailable" (never fake) instead of hanging forever if
# every instance is somehow stuck.
POOL_CHECKOUT_TIMEOUT_S = float(os.environ.get("ANTISPOOF_POOL_TIMEOUT_S", "12"))


def _checkout():
    if not _ensure_pool():
        return None
    try:
        return _FREE_POOL.get(timeout=POOL_CHECKOUT_TIMEOUT_S)
    except queue.Empty:
        return None


def _checkin(inst):
    if inst is not None:
        _FREE_POOL.put(inst)


def predict_safe(image_path=None, image=None):
    """Best-effort verdict that never raises. Pass a file path OR a cv2 image.
    Returns {"available": False, ...} if PAD couldn't run (unavailable, or
    every pool instance was busy past ANTISPOOF_POOL_TIMEOUT_S)."""
    inst = _checkout()
    if inst is None:
        return {"available": False, "reason": "pool_busy" if _ALL_INSTANCES else (_INIT_ERROR or "unavailable")}
    try:
        if image is not None:
            return inst.predict_image(image)
        return inst.predict_path(image_path)
    except Exception as e:  # noqa: BLE001
        print("[antispoof] predict failed:", e)
        return {"available": False, "reason": str(e)}
    finally:
        _checkin(inst)


def predict_multi_safe(images=None, image_paths=None):
    """Best-effort MULTI-FRAME verdict that never raises. Pass a list of cv2
    BGR images OR a list of file paths. Returns {"available": False, ...} if
    PAD couldn't run at all.

    Scores the frames of THIS ONE request IN PARALLEL, each on its own
    checked-out pool instance (up to ANTISPOOF_POOL_SIZE at a time), instead
    of one-by-one on a single instance — a 3-frame check-in/out capture that
    used to take ~3x a single frame's time now takes closer to 1x when the
    pool has room. Frames beyond the pool size simply queue for whichever
    instance frees up first (same safe fail-open/timeout behaviour as a plain
    checkout). Fusion of the scored frames into one verdict happens after,
    via _fuse_multi() — identical math to before, just fed pre-scored frames.
    """
    if not _ensure_pool():
        return {"available": False, "reason": "pool_busy" if _ALL_INSTANCES else (_INIT_ERROR or "unavailable")}
    try:
        imgs = images
        if imgs is None and image_paths:
            imgs = [_ALL_INSTANCES[0]._cv2.imread(p) for p in image_paths]
        imgs = [im for im in (imgs or []) if im is not None and getattr(im, "size", 0) > 0]
        if not imgs:
            return {"available": False, "reason": "no_frames"}

        def _score_one(im):
            inst = _checkout()
            if inst is None:
                # Pool saturated past the timeout even for this one frame —
                # surface as an unusable frame (never as a fake accusation);
                # _fuse_multi treats a frame with no recognized label as
                # simply not counted in `judged`.
                return {"available": False, "label": "retry", "reason": "pool_busy"}
            try:
                return inst.predict_image(im)
            finally:
                _checkin(inst)

        if len(imgs) > 1:
            workers = min(len(imgs), max(1, ANTISPOOF_POOL_SIZE))
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
                frames = list(ex.map(_score_one, imgs))
        else:
            frames = [_score_one(imgs[0])]

        return _fuse_multi(imgs, frames, _ALL_INSTANCES[0]._interframe_motion)
    except Exception as e:  # noqa: BLE001
        print("[antispoof] predict_multi failed:", e)
        return {"available": False, "reason": str(e)}


if __name__ == "__main__":
    paths = sys.argv[1:]
    if len(paths) > 1:
        print(f"Scoring {len(paths)} frames (multi):")
        print(predict_multi_safe(image_paths=paths))
    else:
        path = paths[0] if paths else os.path.join(ANTISPOOF_DIR, "fake.jpg")
        print(f"Scoring: {path}")
        print(predict_safe(image_path=path))
