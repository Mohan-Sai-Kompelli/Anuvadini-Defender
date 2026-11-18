"""
Anuvadini Detector - Privacy masking for monitored screen frames.

Windows that belong to private-communication apps (WhatsApp, Gmail) are BLURRED in every frame that
leaves this PC (live wall, MJPEG stream, incident evidence). The employee's own screen is never touched:
the masking runs on a copy of the captured image only, so the employee still sees everything clearly.
"""
import os
import re
import sys

from PIL import Image, ImageFilter

IS_WINDOWS = sys.platform == "win32"

# Window titles that get blurred for the monitoring side. Matches the WhatsApp desktop app, WhatsApp Web,
# and Gmail in any browser (titles look like "Inbox (3) - name@gmail.com - Gmail" or "mail.google.com").
MASK_TITLE_RE = re.compile(
    r"\bwhatsapp\b|web\.whatsapp|\bgmail\b|mail\.google\.com",
    re.IGNORECASE,
)

# Set ANUVADINI_PRIVACY_BLUR=0 to disable masking (e.g. for local testing only).
PRIVACY_BLUR_ENABLED = os.environ.get("ANUVADINI_PRIVACY_BLUR", "1") != "0"
BLUR_RADIUS = int(os.environ.get("ANUVADINI_PRIVACY_BLUR_RADIUS", "24"))


def get_masked_window_rects() -> list[tuple[int, int, int, int]]:
    """Screen-space rectangles (left, top, right, bottom) of visible windows that must be blurred."""
    if not IS_WINDOWS:
        return []
    try:
        import ctypes
        from ctypes import wintypes
        user32 = ctypes.windll.user32
    except Exception:
        return []

    rects: list[tuple[int, int, int, int]] = []
    WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

    def cb(hwnd, lparam):
        try:
            if not user32.IsWindowVisible(hwnd):
                return True
            length = user32.GetWindowTextLengthW(hwnd)
            if length <= 0:
                return True
            buff = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buff, length + 1)
            if not MASK_TITLE_RE.search(buff.value or ""):
                return True
            # Skip minimized windows: nothing is on screen to blur.
            if user32.IsIconic(hwnd):
                return True
            rect = wintypes.RECT()
            if user32.GetWindowRect(hwnd, ctypes.byref(rect)):
                if rect.right > rect.left and rect.bottom > rect.top:
                    rects.append((rect.left, rect.top, rect.right, rect.bottom))
        except Exception:
            pass
        return True

    try:
        user32.EnumWindows(WNDENUMPROC(cb), 0)
    except Exception:
        return []
    return rects


def _screen_size() -> tuple[int, int] | None:
    try:
        import ctypes
        user32 = ctypes.windll.user32
        w = user32.GetSystemMetrics(0)  # SM_CXSCREEN
        h = user32.GetSystemMetrics(1)  # SM_CYSCREEN
        if w > 0 and h > 0:
            return w, h
    except Exception:
        pass
    return None


def apply_privacy_mask(img: Image.Image) -> Image.Image:
    """Return a copy of `img` with WhatsApp / Gmail windows blurred. Never modifies the employee's screen."""
    if not PRIVACY_BLUR_ENABLED or img is None:
        return img
    rects = get_masked_window_rects()
    if not rects:
        return img

    screen = _screen_size()
    out = img.copy()
    # Captured frames may be scaled versus the physical screen; map window rects into image pixels.
    sx = out.width / screen[0] if screen else 1.0
    sy = out.height / screen[1] if screen else 1.0

    for (l, t, r, b) in rects:
        box = (
            max(0, int(l * sx)), max(0, int(t * sy)),
            min(out.width, int(r * sx)), min(out.height, int(b * sy)),
        )
        if box[2] <= box[0] or box[3] <= box[1]:
            continue
        region = out.crop(box).filter(ImageFilter.GaussianBlur(BLUR_RADIUS))
        out.paste(region, box[:2])
    return out
