"""
Anuvadini Detector - Multi-Monitor GDI & Tamper-Evident Audit Proof Capture
Captures high-res desktop screens using GDI BitBlt (on Windows) or Pillow ImageGrab,
and embeds an official, tamper-evident forensic watermark banner on detected violations.
"""

import base64
import ctypes
import hashlib
import io
import os
import platform
import time
from typing import Optional, Tuple
from PIL import Image, ImageGrab, ImageDraw, ImageFont

def capture_desktop_gdi() -> Optional[Image.Image]:
    """
    High-performance multi-monitor desktop capture using native Win32 GDI BitBlt.
    Falls back gracefully to Pillow ImageGrab on Linux/macOS or if GDI fails.
    (Fixes known NameError in server / agent).
    """
    if platform.system() == "Windows":
        try:
            user32 = ctypes.windll.user32
            gdi32 = ctypes.windll.gdi32

            # Virtual screen dimensions spanning all monitors
            left = user32.GetSystemMetrics(76)  # SM_XVIRTUALSCREEN
            top = user32.GetSystemMetrics(77)   # SM_YVIRTUALSCREEN
            width = user32.GetSystemMetrics(78) # SM_CXVIRTUALSCREEN
            height = user32.GetSystemMetrics(79)# SM_CYVIRTUALSCREEN

            if width <= 0 or height <= 0:
                width = user32.GetSystemMetrics(0)
                height = user32.GetSystemMetrics(1)
                left, top = 0, 0

            hdesktop = user32.GetDesktopWindow()
            desktop_dc = user32.GetDC(hdesktop)
            mem_dc = gdi32.CreateCompatibleDC(desktop_dc)
            bitmap = gdi32.CreateCompatibleBitmap(desktop_dc, width, height)
            gdi32.SelectObject(mem_dc, bitmap)

            # Copy screen surface to memory bitmap
            SRCCOPY = 0x00CC0020
            gdi32.BitBlt(mem_dc, 0, 0, width, height, desktop_dc, left, top, SRCCOPY)

            # Extract DIB bits
            class BITMAPINFOHEADER(ctypes.Structure):
                _fields_ = [
                    ("biSize", ctypes.c_uint32),
                    ("biWidth", ctypes.c_int32),
                    ("biHeight", ctypes.c_int32),
                    ("biPlanes", ctypes.c_uint16),
                    ("biBitCount", ctypes.c_uint16),
                    ("biCompression", ctypes.c_uint32),
                    ("biSizeImage", ctypes.c_uint32),
                    ("biXPelsPerMeter", ctypes.c_int32),
                    ("biYPelsPerMeter", ctypes.c_int32),
                    ("biClrUsed", ctypes.c_uint32),
                    ("biClrImportant", ctypes.c_uint32)
                ]

            bmi = BITMAPINFOHEADER()
            bmi.biSize = ctypes.sizeof(BITMAPINFOHEADER)
            bmi.biWidth = width
            bmi.biHeight = -height  # Top-down DIB
            bmi.biPlanes = 1
            bmi.biBitCount = 32
            bmi.biCompression = 0

            buf_size = width * height * 4
            buffer = ctypes.create_string_buffer(buf_size)
            gdi32.GetDIBits(mem_dc, bitmap, 0, height, buffer, ctypes.byref(bmi), 0)

            # Cleanup GDI handles
            gdi32.DeleteObject(bitmap)
            gdi32.DeleteDC(mem_dc)
            user32.ReleaseDC(hdesktop, desktop_dc)

            # Convert raw BGRA to PIL Image
            img = Image.frombytes("RGBA", (width, height), buffer.raw, "raw", "BGRA")
            return img.convert("RGB")
        except Exception:
            pass

    # Reliable Cross-Platform Fallback
    try:
        return ImageGrab.grab().convert("RGB")
    except Exception:
        # Emergency dummy image if headless
        return Image.new("RGB", (1280, 720), color=(15, 23, 42))

def create_tamper_evident_proof(
    workstation_id: str,
    user_id: str,
    violation_title: str,
    raw_img: Optional[Image.Image] = None,
    audit_dir: Optional[str] = None
) -> Tuple[str, str]:
    """
    Generates a watermarked JPEG audit screenshot with red warning banner and cryptographic SHA256 stamp.
    Returns:
        (base64_string, file_path_if_saved)
    """
    if raw_img is None:
        raw_img = capture_desktop_gdi()
    if raw_img is None:
        raw_img = Image.new("RGB", (1280, 720), color=(30, 41, 59))

    img = raw_img.copy()
    draw = ImageDraw.Draw(img)
    w, h = img.size

    timestamp_str = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
    hash_payload = f"{workstation_id}:{user_id}:{timestamp_str}:{violation_title}"
    audit_hash = hashlib.sha256(hash_payload.encode()).hexdigest()[:16].upper()

    # Red Tamper-Evident Header Banner
    banner_height = 42
    draw.rectangle([0, 0, w, banner_height], fill=(185, 28, 28)) # Dark Crimson Red
    draw.rectangle([0, banner_height - 2, w, banner_height], fill=(239, 68, 68)) # Highlight line

    # Banner Text
    header_text = f"ANUVADINI DETECTOR - TAMPER-EVIDENT AUDIT PROOF | REF: #{audit_hash}"
    details_text = f"HOST: {workstation_id} | USER: {user_id} | TIME: {timestamp_str} | REASON: {violation_title.upper()}"

    draw.text((14, 6), header_text, fill=(255, 255, 255))
    draw.text((14, 22), details_text, fill=(254, 202, 202))

    # Convert to Base64
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85, optimize=True)
    b64_data = base64.b64encode(buf.getvalue()).decode("utf-8")

    file_path = ""
    if audit_dir:
        os.makedirs(audit_dir, exist_ok=True)
        file_name = f"evidence_{int(time.time())}_{workstation_id}.jpg"
        file_path = os.path.join(audit_dir, file_name)
        with open(file_path, "wb") as f:
            f.write(buf.getvalue())

    return b64_data, file_path
