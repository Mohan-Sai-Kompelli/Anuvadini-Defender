"""
Anuvadini Detector - Window & Screen Watcher Probe
Inspects the active foreground window, fullscreen state, and enumerates all
visible desktop windows to detect background or minimized unauthorized activities.
"""

import ctypes
import os
import platform
import psutil
from typing import Dict, Any, List, Optional

try:
    import pygetwindow as gw
except Exception:
    gw = None

class RECT(ctypes.Structure):
    _fields_ = [
        ("left", ctypes.c_long),
        ("top", ctypes.c_long),
        ("right", ctypes.c_long),
        ("bottom", ctypes.c_long)
    ]

def get_process_info_by_hwnd(hwnd: int) -> Dict[str, Any]:
    """Retrieves PID and executable name for a given window handle."""
    pid = ctypes.c_ulong()
    try:
        ctypes.windll.user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if pid.value:
            p = psutil.Process(pid.value)
            return {
                "pid": pid.value,
                "name": p.name(),
                "exe": p.exe()
            }
    except Exception:
        pass
    return {"pid": 0, "name": "unknown", "exe": ""}

def is_window_fullscreen(hwnd: int) -> bool:
    """Determines if the window covers the primary monitor (fullscreen game heuristic)."""
    if platform.system() != "Windows" or not hwnd:
        return False
    try:
        rect = RECT()
        if ctypes.windll.user32.GetWindowRect(hwnd, ctypes.byref(rect)):
            screen_w = ctypes.windll.user32.GetSystemMetrics(0) # SM_CXSCREEN
            screen_h = ctypes.windll.user32.GetSystemMetrics(1) # SM_CYSCREEN
            w = rect.right - rect.left
            h = rect.bottom - rect.top
            return w >= screen_w and h >= screen_h
    except Exception:
        pass
    return False

def get_active_window() -> Dict[str, Any]:
    """
    Retrieves the foreground active window title, process name, PID, and fullscreen state.
    """
    if platform.system() == "Windows":
        try:
            hwnd = ctypes.windll.user32.GetForegroundWindow()
            if hwnd:
                length = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
                buff = ctypes.create_unicode_buffer(length + 1)
                ctypes.windll.user32.GetWindowTextW(hwnd, buff, length + 1)
                title = buff.value.strip()
                proc_info = get_process_info_by_hwnd(hwnd)
                fullscreen = is_window_fullscreen(hwnd)

                return {
                    "hwnd": hwnd,
                    "title": title or "Desktop / Background",
                    "process_name": proc_info["name"].lower(),
                    "pid": proc_info["pid"],
                    "is_fullscreen": fullscreen
                }
        except Exception:
            pass

    # Cross-platform / PyGetWindow fallback
    if gw is not None:
        try:
            win = gw.getActiveWindow()
            if win:
                return {
                    "hwnd": getattr(win, "_hWnd", 0),
                    "title": win.title.strip() if win.title else "Desktop",
                    "process_name": "unknown",
                    "pid": 0,
                    "is_fullscreen": False
                }
        except Exception:
            pass

    return {
        "hwnd": 0,
        "title": "Desktop / Background",
        "process_name": "explorer.exe",
        "pid": 0,
        "is_fullscreen": False
    }

def enumerate_all_visible_windows() -> List[Dict[str, Any]]:
    """
    Scans ALL visible desktop windows (including minimized or background windows).
    Essential for defeating the 'Alt + Tab' evasion tactic.
    """
    windows = []

    if platform.system() == "Windows":
        try:
            WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)

            def enum_windows_callback(hwnd, lParam):
                if ctypes.windll.user32.IsWindowVisible(hwnd):
                    length = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
                    if length > 0:
                        buff = ctypes.create_unicode_buffer(length + 1)
                        ctypes.windll.user32.GetWindowTextW(hwnd, buff, length + 1)
                        title = buff.value.strip()
                        if title and title != "Program Manager":
                            proc_info = get_process_info_by_hwnd(hwnd)
                            windows.append({
                                "hwnd": hwnd,
                                "title": title,
                                "process_name": proc_info["name"].lower(),
                                "pid": proc_info["pid"]
                            })
                return True

            cb = WNDENUMPROC(enum_windows_callback)
            ctypes.windll.user32.EnumWindows(cb, 0)
            return windows
        except Exception:
            pass

    # PyGetWindow fallback
    if gw is not None:
        try:
            for win in gw.getAllWindows():
                if win.title and win.visible:
                    windows.append({
                        "hwnd": getattr(win, "_hWnd", 0),
                        "title": win.title.strip(),
                        "process_name": "unknown",
                        "pid": 0
                    })
        except Exception:
            pass

    return windows
