# -*- coding: utf-8 -*-
"""
arcface_service.py
------------------
OPTIONAL, additive ArcFace (InsightFace `buffalo_l`) identity signal that runs
*alongside* the existing facenet (MTCNN + InceptionResnetV1 / VGGFace2) pipeline
in check.py. It never replaces facenet and never forces anyone to re-enroll:

  * If InsightFace + its model pack aren't installed, EVERYTHING here reports
    "unavailable" and check.py behaves EXACTLY as before (facenet only). Same
    fail-open philosophy as antispoof_service.py.
  * When available, enrollment ALSO stores an ArcFace embedding, and multi-frame
    verification uses ArcFace as a SECOND OPINION: a match must satisfy facenet
    AND (when the enrolled person has an ArcFace reference) ArcFace too. This
    only ever *tightens* recognition (fewer impostor false-accepts) — a user
    enrolled before ArcFace has no ArcFace reference and simply skips this gate,
    so nothing regresses.

ArcFace is the industry-standard face-recognition head; buffalo_l bundles the
SCRFD detector + the ArcFace (glint360k) recogniser your friend suggested. It
downloads its ~300MB model pack once, on first use, into ~/.insightface.

To activate on a compatible Python (3.9–3.12 recommended — 3.13/3.14 may lack
prebuilt wheels):
    pip install insightface onnxruntime
The first request then auto-downloads buffalo_l; subsequent ones are ~30-50ms/CPU.

Self-test (from the face-back folder):
    python arcface_service.py ../anti-spam/images/sample/image_T1.jpg
"""

import os
import sys
import threading

import numpy as np

# Cosine-similarity match floor for the ArcFace SECOND opinion. ArcFace cosine
# similarity for the same identity is typically >0.4-0.5 and impostors <0.25 on
# glint360k; 0.28 is a deliberately permissive floor so ArcFace only VETOES a
# facenet match when it clearly disagrees (a likely impostor), never on ordinary
# same-person pose/lighting variation. Overrideable for a measured recalibration.
ARCFACE_MATCH_THRESHOLD = float(os.environ.get("ARCFACE_MATCH_THRESHOLD", "0.28"))
ARCFACE_MODEL_PACK = os.environ.get("ARCFACE_MODEL_PACK", "buffalo_l")

_INIT_LOCK = threading.Lock()
_INFER_LOCK = threading.Lock()  # insightface FaceAnalysis is not thread-safe
_INSTANCE = None
_INIT_TRIED = False
_INIT_ERROR = None


class _ArcFace:
    """Lazy InsightFace FaceAnalysis wrapper. Construction can raise (missing
    dep / model download failure); callers go through get_arcface() which turns
    that into an 'unavailable' state so verification never breaks."""

    def __init__(self):
        from insightface.app import FaceAnalysis  # local import — optional dep

        # CPU only (matches the rest of the stack); det_size 640 is the buffalo_l
        # default and handles small/angled faces well (SCRFD).
        self._app = FaceAnalysis(name=ARCFACE_MODEL_PACK, providers=["CPUExecutionProvider"])
        self._app.prepare(ctx_id=-1, det_size=(640, 640))

    def embed_image(self, img):
        """cv2 BGR image -> L2-normalized 512-d ArcFace embedding of the largest
        face, or None if no face was detected. insightface returns an already
        L2-normalized `normed_embedding`."""
        if img is None or getattr(img, "size", 0) == 0:
            return None
        with _INFER_LOCK:
            faces = self._app.get(img)
        if not faces:
            return None
        # Largest face by bbox area — mirrors facenet's select_largest.
        faces.sort(key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]), reverse=True)
        emb = np.asarray(faces[0].normed_embedding, dtype=np.float32)
        n = np.linalg.norm(emb)
        return emb / n if n > 0 else emb

    def embed_path(self, image_path):
        import cv2
        return self.embed_image(cv2.imread(image_path))


def get_arcface():
    """Ready predictor, or None if InsightFace/model couldn't load. Never raises."""
    global _INSTANCE, _INIT_TRIED, _INIT_ERROR
    if _INIT_TRIED:
        return _INSTANCE
    with _INIT_LOCK:
        if _INIT_TRIED:
            return _INSTANCE
        try:
            _INSTANCE = _ArcFace()
            print(f"[arcface] ArcFace ensemble ACTIVE (model pack '{ARCFACE_MODEL_PACK}', "
                  f"match floor {ARCFACE_MATCH_THRESHOLD})")
        except Exception as e:  # noqa: BLE001 — must never break verification
            _INIT_ERROR = str(e)
            _INSTANCE = None
            print("[arcface] ArcFace ensemble UNAVAILABLE (facenet-only, unchanged):", e)
        finally:
            _INIT_TRIED = True
    return _INSTANCE


def available():
    return get_arcface() is not None


def embed_safe(image=None, image_path=None):
    """Best-effort ArcFace embedding (list of floats) or None. Never raises."""
    inst = get_arcface()
    if inst is None:
        return None
    try:
        emb = inst.embed_image(image) if image is not None else inst.embed_path(image_path)
        return emb.tolist() if emb is not None else None
    except Exception as e:  # noqa: BLE001
        print("[arcface] embed failed:", e)
        return None


def cosine(a, b):
    a = np.asarray(a, dtype=np.float32)
    b = np.asarray(b, dtype=np.float32)
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0:
        return -1.0
    return float(np.dot(a, b) / (na * nb))


def best_similarity(test_embedding, reference_embeddings):
    """Max cosine similarity of the test embedding against any stored ArcFace
    reference view. Returns None when there's nothing to compare."""
    if test_embedding is None or not reference_embeddings:
        return None
    sims = []
    for r in reference_embeddings:
        try:
            if len(r) == len(test_embedding):
                sims.append(cosine(test_embedding, r))
        except TypeError:
            continue
    return max(sims) if sims else None


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(__file__), "..", "anti-spam", "images", "sample", "image_T1.jpg")
    print(f"Available: {available()}")
    emb = embed_safe(image_path=path)
    print(f"Embedding for {path}: {'len ' + str(len(emb)) if emb else None}")
