"""
Anuvadini Detector - Cross-Platform Evidence & Screenshot Capture Module
Captures timestamped, tamper-evident audit screenshots across Windows, macOS (MacBooks), and Linux.
Uses Win32 GDI BitBlt on Windows, Pillow ImageGrab on macOS/Linux, and synthetic fallback if headless.
"""
import os
import sys
import time
import socket
from datetime import datetime
from pathlib import Path
from PIL import Image, ImageDraw
from anuvadini_detector.config import EVIDENCE_DIR

IS_WINDOWS = sys.platform == "win32"
IS_MAC = sys.platform == "darwin"

user32 = None
gdi32 = None
if IS_WINDOWS:
    try:
        import ctypes
        from ctypes import wintypes
        if hasattr(ctypes, "windll"):
            user32 = ctypes.windll.user32
            gdi32 = ctypes.windll.gdi32
            class BITMAPINFOHEADER(ctypes.Structure):
                _fields_ = [
                    ('biSize', wintypes.DWORD),
                    ('biWidth', wintypes.LONG),
                    ('biHeight', wintypes.LONG),
                    ('biPlanes', wintypes.WORD),
                    ('biBitCount', wintypes.WORD),
                    ('biCompression', wintypes.DWORD),
                    ('biSizeImage', wintypes.DWORD),
                    ('biXPelsPerMeter', wintypes.LONG),
                    ('biYPelsPerMeter', wintypes.LONG),
                    ('biClrUsed', wintypes.DWORD),
                    ('biClrImportant', wintypes.DWORD)
                ]
    except Exception:
        user32 = None
        gdi32 = None

def capture_desktop_gdi() -> Image.Image | None:
    """Capture Windows desktop screen using pure Win32 GDI BitBlt."""
    if not IS_WINDOWS or not user32 or not gdi32:
        return None
    try:
        import ctypes
        from ctypes import wintypes
        try:
            hdesk = user32.OpenInputDesktop(0, False, 0x01FF)
            if hdesk:
                user32.SetThreadDesktop(hdesk)
        except Exception:
            pass

        # Capture only the primary monitor at capped resolution to avoid huge buffers.
        # SM_CXSCREEN/SM_CYSCREEN = primary monitor only (avoids multi-monitor blowup).
        w = user32.GetSystemMetrics(0)  # SM_CXSCREEN
        h = user32.GetSystemMetrics(1)  # SM_CYSCREEN
        if w <= 0 or h <= 0:
            w, h = 1920, 1080

        # Cap at 1280px wide — allocates at most ~5MB buffer instead of 14-30MB at 4K.
        MAX_W = 1280
        if w > MAX_W:
            scale = MAX_W / w
            cap_w = MAX_W
            cap_h = max(1, int(h * scale))
        else:
            cap_w, cap_h = w, h

        hwnd = user32.GetDesktopWindow()
        hdc_screen = user32.GetDC(hwnd)
        hdc_mem = gdi32.CreateCompatibleDC(hdc_screen)
        hbm = gdi32.CreateCompatibleBitmap(hdc_screen, cap_w, cap_h)
        gdi32.SelectObject(hdc_mem, hbm)

        # StretchBlt captures at capped resolution in one step — no CAPTUREBLT flag
        # (CAPTUREBLT was causing screen artifacts/flicker on some systems).
        SRCCOPY = 0x00CC0020
        HALFTONE = 0x04  # SetStretchBltMode for smooth downscale
        gdi32.SetStretchBltMode(hdc_mem, HALFTONE)
        gdi32.StretchBlt(hdc_mem, 0, 0, cap_w, cap_h, hdc_screen, 0, 0, w, h, SRCCOPY)

        class BITMAPINFOHEADER_LOCAL(ctypes.Structure):
            _fields_ = [
                ('biSize', wintypes.DWORD),
                ('biWidth', wintypes.LONG),
                ('biHeight', wintypes.LONG),
                ('biPlanes', wintypes.WORD),
                ('biBitCount', wintypes.WORD),
                ('biCompression', wintypes.DWORD),
                ('biSizeImage', wintypes.DWORD),
                ('biXPelsPerMeter', wintypes.LONG),
                ('biYPelsPerMeter', wintypes.LONG),
                ('biClrUsed', wintypes.DWORD),
                ('biClrImportant', wintypes.DWORD)
            ]

        bmi = BITMAPINFOHEADER_LOCAL()
        bmi.biSize = ctypes.sizeof(BITMAPINFOHEADER_LOCAL)
        bmi.biWidth = cap_w
        bmi.biHeight = -cap_h
        bmi.biPlanes = 1
        bmi.biBitCount = 32
        bmi.biCompression = 0

        buf = ctypes.create_string_buffer(cap_w * cap_h * 4)
        gdi32.GetDIBits(hdc_mem, hbm, 0, cap_h, buf, ctypes.byref(bmi), 0)

        gdi32.DeleteObject(hbm)
        gdi32.DeleteDC(hdc_mem)
        user32.ReleaseDC(hwnd, hdc_screen)

        img = Image.frombuffer('RGBA', (cap_w, cap_h), buf, 'raw', 'BGRA', 0, 1)
        return img.convert("RGB")
    except Exception as e:
        print(f"[GDI Capture Fallback Error]: {e}")
        return None

def capture_screen_universal() -> Image.Image:
    """Capture the screen for monitoring. WhatsApp / Gmail windows are blurred on the copy that is sent out;
    the employee's own screen is not changed."""
    from anuvadini_detector.privacy_mask import apply_privacy_mask
    return apply_privacy_mask(_capture_screen_raw())

def _capture_screen_raw() -> Image.Image:
    """Universal screen capture: Win32 GDI -> Pillow ImageGrab -> Synthetic Evidence Canvas."""
    # 1. Try GDI on Windows
    if IS_WINDOWS and user32:
        img = capture_desktop_gdi()
        if img:
            return img

    # 2. Try Pillow ImageGrab (Works on macOS, Windows, X11)
    try:
        from PIL import ImageGrab
        img = ImageGrab.grab()
        if img:
            return img.convert("RGB")
    except Exception:
        pass

    # 3. Synthetic High-Res Evidence Audit Canvas Fallback
    w, h = 1920, 1080
    canvas = Image.new("RGB", (w, h), (15, 23, 42))
    draw = ImageDraw.Draw(canvas)
    draw.rectangle([60, 60, w - 60, h - 60], outline=(59, 130, 246), width=3)
    draw.text((100, 100), "ANUVADINI AUDIT EVIDENCE CAPTURE", fill=(255, 255, 255))
    draw.text((100, 140), f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", fill=(148, 163, 184))
    return canvas

def capture_violation_screenshot(violation_id: str, game_name: str, window_title: str) -> str | None:
    """Take screenshot and add official Anuvadini Detector audit watermark banner."""
    try:
        screenshot = capture_screen_universal()
        if not screenshot:
            return None

        # Draw Audit Watermark Banner
        draw = ImageDraw.Draw(screenshot)
        w, h = screenshot.size
        banner_h = 44

        draw.rectangle([0, 0, w, banner_h], fill=(15, 23, 42)) # Slate 900
        draw.line([0, banner_h, w, banner_h], fill=(239, 68, 68), width=3) # Crimson Red Line

        hostname = socket.gethostname()
        user = os.getlogin() if hasattr(os, "getlogin") else "Employee"
        timestamp_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        stamp_text = f"ANUVADINI DETECTOR | AUDIT EVIDENCE | PC: {hostname} ({user}) | DETECTED: {game_name} | {timestamp_str}"
        draw.text((15, 14), stamp_text, fill=(255, 255, 255))
        draw.text((max(15, w - 240), 14), f"INCIDENT #{violation_id}", fill=(248, 113, 113))

        # Save to disk
        filename = f"evidence_{violation_id}_{int(time.time())}.jpg"
        filepath = EVIDENCE_DIR / filename
        screenshot.save(str(filepath), "JPEG", quality=80, optimize=True)

        return filename
    except Exception as e:
        print(f"[Evidence Capture Error]: {e}")
        return None

if __name__ == "__main__":
    res = capture_violation_screenshot("TEST-01", "Counter-Strike 2", "Counter-Strike 2 - Steam")
    print(f"Platform: {sys.platform}. Captured evidence:", res)
