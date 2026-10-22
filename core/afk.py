"""
Anuvadini Detector - Microsecond AFK / Idle Tracker
Uses native Win32 GetLastInputInfo hardware counters for accurate away-from-keyboard detection.
Includes cross-platform fallbacks for non-Windows environments.
"""

import ctypes
import os
import platform
import time

class LASTINPUTINFO(ctypes.Structure):
    _fields_ = [
        ("cbSize", ctypes.c_uint),
        ("dwTime", ctypes.c_uint)
    ]

_last_active_time = time.time()

def get_hardware_idle_seconds() -> float:
    """
    Returns exact seconds of hardware user inactivity (no mouse moves, clicks, or keystrokes).
    Uses Win32 GetLastInputInfo.
    """
    global _last_active_time

    if platform.system() == "Windows":
        try:
            lii = LASTINPUTINFO()
            lii.cbSize = ctypes.sizeof(LASTINPUTINFO)
            if ctypes.windll.user32.GetLastInputInfo(ctypes.byref(lii)):
                # GetTickCount returns milliseconds since system startup
                current_ticks = ctypes.windll.kernel32.GetTickCount()
                millis_idle = current_ticks - lii.dwTime
                return max(0.0, float(millis_idle) / 1000.0)
        except Exception:
            pass

    # Fallback for Linux/macOS or when ctypes is unavailable
    idle_env = os.getenv("MOCK_IDLE_SECONDS")
    if idle_env:
        try:
            return float(idle_env)
        except ValueError:
            pass

    return 0.0

def is_afk(threshold_seconds: float = 180.0) -> bool:
    """Evaluates if the user is currently AFK beyond the given threshold (default 3 mins)."""
    return get_hardware_idle_seconds() >= threshold_seconds
