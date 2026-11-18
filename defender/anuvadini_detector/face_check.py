"""
Anuvadini Detector - Server-side presence check for webcam frames.

The exe only captures and uploads a webcam frame. This module runs on the server and answers:
is a face visible in this frame? That answer is stored on the PC's record, so the dashboard can
show "at desk" or "away" without rebuilding the exe when the check is improved.

Uses OpenCV's YuNet face detector (model file in assets/). Returns None when the check cannot
run, so the upload itself never fails because of it.
"""
from __future__ import annotations

import os
import threading

_MODEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "face_detection_yunet_2023mar.onnx")
_detector = None
_lock = threading.Lock()


def _get_detector(w: int, h: int):
    global _detector
    import cv2
    if _detector is None:
        _detector = cv2.FaceDetectorYN.create(_MODEL, "", (w, h), 0.8, 0.3, 5000)
    _detector.setInputSize((w, h))
    return _detector


def face_present(jpeg_bytes: bytes) -> bool | None:
    """True if at least one face is found in the JPEG; None if the check cannot run."""
    if not jpeg_bytes or not os.path.exists(_MODEL):
        return None
    try:
        import cv2
        import numpy as np
        img = cv2.imdecode(np.frombuffer(jpeg_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            return None
        h, w = img.shape[:2]
        with _lock:
            _, faces = _get_detector(w, h).detect(img)
        return faces is not None and len(faces) > 0
    except Exception:
        return None
