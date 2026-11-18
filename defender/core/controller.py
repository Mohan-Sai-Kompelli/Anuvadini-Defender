"""
Anuvadini Detector - Hardware Gamepad & Controller Probe
Uses native Windows XInput APIs (XInput 1.4 / 1.3 / 9.1.0) to detect connected
Xbox, PlayStation, Logitech, or generic USB/Bluetooth game controllers across 4 slots.
"""

import ctypes
import os
import platform
from typing import Dict, Any, List

# XInput Constants
ERROR_SUCCESS = 0
ERROR_DEVICE_NOT_CONNECTED = 1167
XUSER_MAX_COUNT = 4

# XINPUT_STATE structure
class XINPUT_GAMEPAD(ctypes.Structure):
    _fields_ = [
        ("wButtons", ctypes.c_ushort),
        ("bLeftTrigger", ctypes.c_ubyte),
        ("bRightTrigger", ctypes.c_ubyte),
        ("sThumbLX", ctypes.c_short),
        ("sThumbLY", ctypes.c_short),
        ("sThumbRX", ctypes.c_short),
        ("sThumbRY", ctypes.c_short),
    ]

class XINPUT_STATE(ctypes.Structure):
    _fields_ = [
        ("dwPacketNumber", ctypes.c_ulong),
        ("Gamepad", XINPUT_GAMEPAD),
    ]

_xinput_dll = None

def _load_xinput():
    global _xinput_dll
    if _xinput_dll is not None:
        return _xinput_dll

    if platform.system() != "Windows":
        return None

    # Try modern and legacy XInput DLL versions
    dll_candidates = ["xinput1_4.dll", "xinput1_3.dll", "xinput9_1_0.dll"]
    for dll_name in dll_candidates:
        try:
            _xinput_dll = ctypes.windll.LoadLibrary(dll_name)
            if hasattr(_xinput_dll, "XInputGetState"):
                return _xinput_dll
        except Exception:
            continue
    return None

def detect_gamepads() -> Dict[str, Any]:
    """
    Checks all 4 XInput player slots for active gamepads.
    Returns:
        {
            "connected": bool,
            "count": int,
            "slots": List[int],
            "details": str
        }
    """
    # Environment override for testing or manual simulation
    if os.getenv("SIMULATE_GAMEPAD", "0") in ("1", "true", "True"):
        return {
            "connected": True,
            "count": 1,
            "slots": [0],
            "details": "Simulated Xbox Controller (Slot 0)"
        }

    dll = _load_xinput()
    if not dll:
        return {
            "connected": False,
            "count": 0,
            "slots": [],
            "details": "XInput unavailable (Non-Windows or driver missing)"
        }

    active_slots: List[int] = []

    try:
        for slot in range(XUSER_MAX_COUNT):
            state = XINPUT_STATE()
            res = dll.XInputGetState(slot, ctypes.byref(state))
            if res == ERROR_SUCCESS:
                active_slots.append(slot)
    except Exception as e:
        return {
            "connected": False,
            "count": 0,
            "slots": [],
            "details": f"Probe error: {e}"
        }

    count = len(active_slots)
    return {
        "connected": count > 0,
        "count": count,
        "slots": active_slots,
        "details": f"{count} Gamepad(s) Active on Slot(s) {active_slots}" if count > 0 else "No Gamepads Detected"
    }
