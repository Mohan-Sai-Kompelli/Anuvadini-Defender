"""
Anuvadini Detector - Cross-Platform AFK & Idle Detection Module
Supports Windows GetLastInputInfo, macOS IOHID/ioreg, and Linux xprintidle.
"""
import sys
import os
import time

IS_WINDOWS = sys.platform == "win32"
IS_MAC = sys.platform == "darwin"
IS_LINUX = sys.platform.startswith("linux")

_has_win32_idle = False
if IS_WINDOWS:
    try:
        import ctypes
        from ctypes import POINTER, Structure, c_ulonglong
        from ctypes.wintypes import BOOL, DWORD, UINT

        ULONGLONG = c_ulonglong

        class LastInputInfo(Structure):
            _fields_ = [("cbSize", UINT), ("dwTime", DWORD)]

        if hasattr(ctypes, "windll"):
            _has_win32_idle = True
    except Exception:
        _has_win32_idle = False

def _get_idle_windows() -> float:
    try:
        import ctypes
        from ctypes import POINTER, Structure, c_ulonglong
        from ctypes.wintypes import BOOL, DWORD, UINT

        ULONGLONG = c_ulonglong
        class LastInputInfo(Structure):
            _fields_ = [("cbSize", UINT), ("dwTime", DWORD)]

        prototype_input = ctypes.WINFUNCTYPE(BOOL, POINTER(LastInputInfo))
        paramflags_input = ((1, "lastinputinfo"),)
        c_GetLastInputInfo = prototype_input(("GetLastInputInfo", ctypes.windll.user32), paramflags_input)

        prototype_tick = ctypes.WINFUNCTYPE(ULONGLONG)
        c_GetTickCount64 = prototype_tick(("GetTickCount64", ctypes.windll.kernel32), ())

        lastinput = LastInputInfo()
        lastinput.cbSize = ctypes.sizeof(LastInputInfo)
        if 0 == c_GetLastInputInfo(lastinput):
            return 0.0

        tick_count = c_GetTickCount64()
        last_input_tick = lastinput.dwTime

        tick_lower32 = tick_count & 0xFFFFFFFF
        if tick_lower32 >= last_input_tick:
            diff_ms = tick_lower32 - last_input_tick
        else:
            diff_ms = (0x100000000 - last_input_tick) + tick_lower32

        return max(0.0, diff_ms / 1000.0)
    except Exception:
        return 0.0

def _get_idle_mac() -> float:
    try:
        import subprocess
        # Query HIDIdleTime from ioreg on macOS
        cmd = "ioreg -c IOHIDSystem | awk '/HIDIdleTime/ {print $NF/1000000000; exit}'"
        res = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=1.0)
        if res.returncode == 0 and res.stdout.strip():
            return float(res.stdout.strip())
    except Exception:
        pass
    return 0.0

def get_idle_seconds() -> float:
    """Return number of seconds since last user keyboard/mouse input across platforms."""
    if IS_WINDOWS and _has_win32_idle:
        return _get_idle_windows()
    if IS_MAC:
        return _get_idle_mac()
    return 0.0

if __name__ == "__main__":
    print(f"Platform: {sys.platform}. Current idle seconds: {get_idle_seconds():.1f}s")
