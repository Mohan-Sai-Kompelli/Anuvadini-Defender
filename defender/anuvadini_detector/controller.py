"""
Anuvadini Detector - Game Controller & XInput Detection Module
Detects if employees have connected an Xbox / PlayStation / USB Gamepad to their office workstation.
Cross-platform safe for Windows, macOS, and Linux.
"""
import sys
import ctypes
from ctypes import Structure, c_short, c_byte, c_ushort

class XINPUT_GAMEPAD(Structure):
    _fields_ = [
        ('wButtons', c_ushort),
        ('bLeftTrigger', c_byte),
        ('bRightTrigger', c_byte),
        ('sThumbLX', c_short),
        ('sThumbLY', c_short),
        ('sThumbRX', c_short),
        ('sThumbRY', c_short),
    ]

class XINPUT_STATE(Structure):
    _fields_ = [
        ('dwPacketNumber', ctypes.c_ulong),
        ('Gamepad', XINPUT_GAMEPAD)
    ]

_xinput_dll = None
if sys.platform == "win32" and hasattr(ctypes, "windll"):
    for dll_name in ['xinput1_4.dll', 'xinput1_3.dll', 'xinput9_1_0.dll']:
        try:
            _xinput_dll = ctypes.windll.LoadLibrary(dll_name)
            break
        except Exception:
            pass

def is_controller_connected() -> dict:
    """Check if any gamepad controller is connected and active."""
    if not _xinput_dll:
        return {"connected": False, "controller_count": 0, "active_controller": None, "status_text": "No Controller Detected"}
    
    connected_count = 0
    active_idx = None
    
    for i in range(4): # XInput supports up to 4 controllers
        try:
            state = XINPUT_STATE()
            res = _xinput_dll.XInputGetState(i, ctypes.byref(state))
            if res == 0: # ERROR_SUCCESS
                connected_count += 1
                gp = state.Gamepad
                if gp.wButtons != 0 or abs(gp.sThumbLX) > 7849 or abs(gp.sThumbLY) > 7849 or gp.bLeftTrigger > 30 or gp.bRightTrigger > 30:
                    active_idx = i
        except Exception:
            pass
                
    return {
        "connected": connected_count > 0,
        "controller_count": connected_count,
        "active_controller": active_idx,
        "status_text": f"{connected_count} Gamepad(s) Connected" if connected_count > 0 else "No Controller Detected"
    }

if __name__ == "__main__":
    print(f"Platform: {sys.platform}. Controller status:", is_controller_connected())
