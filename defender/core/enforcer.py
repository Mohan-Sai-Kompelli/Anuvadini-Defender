"""
Anuvadini Detector - Remote IT Enforcement Module
Handles remote process termination, system-modal warning dialogs,
and fleet-wide bulk disciplinary actions.
"""

import ctypes
import os
import platform
import psutil
import threading
import time
from typing import Dict, Any, List

import subprocess

def kill_process_by_pid_or_name(target: Any) -> Dict[str, Any]:
    """
    Terminates a process by PID (int), executable name (str), or matching window title.
    Employs psutil, Windows EnumWindows window-to-PID lookup, and taskkill fallback.
    """
    killed_count = 0
    errors = []

    try:
        # Case 1: Target is numeric PID
        if isinstance(target, int) or (isinstance(target, str) and str(target).strip().isdigit()):
            pid = int(str(target).strip())
            if psutil.pid_exists(pid):
                try:
                    p = psutil.Process(pid)
                    p_name = p.name()
                    p.kill()
                    killed_count += 1
                except Exception as e:
                    errors.append(str(e))

            if platform.system() == "Windows":
                try:
                    subprocess.run(f"taskkill /F /T /PID {pid}", shell=True, capture_output=True, timeout=3)
                    killed_count = max(killed_count, 1)
                except Exception:
                    pass

            if killed_count > 0:
                return {"success": True, "message": f"Successfully terminated PID {pid}", "count": killed_count}
            return {"success": False, "message": f"PID {pid} could not be terminated", "count": 0, "errors": errors}

        target_str = str(target).strip().lower()
        if not target_str:
            return {"success": False, "message": "Empty target specified", "count": 0}

        # Build candidate names: e.g. "chrome", "chrome.exe"
        clean_name = target_str[:-4] if target_str.endswith(".exe") else target_str
        candidates = {target_str, clean_name, f"{clean_name}.exe"}

        # Case 2: Process name match via psutil
        for p in psutil.process_iter(['pid', 'name']):
            try:
                pname = (p.info['name'] or '').lower()
                if pname in candidates or any(c == pname for c in candidates):
                    p.kill()
                    killed_count += 1
            except (psutil.NoSuchProcess, psutil.AccessDenied) as e:
                errors.append(str(e))
            except Exception:
                pass

        # Case 3: On Windows, also run taskkill for the executable name
        if platform.system() == "Windows":
            try:
                exe_target = f"{clean_name}.exe"
                res = subprocess.run(f"taskkill /F /T /IM {exe_target}", shell=True, capture_output=True, timeout=3)
                if res.returncode == 0:
                    killed_count = max(killed_count, 1)
            except Exception:
                pass

        # Case 4: If still 0 killed, search by window title (e.g. "YouTube", "TradingView", "Solitaire")
        if killed_count == 0 and platform.system() == "Windows":
            try:
                target_pids = set()
                WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
                def _enum_cb(hwnd, _):
                    if ctypes.windll.user32.IsWindowVisible(hwnd):
                        length = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
                        if length > 0:
                            buff = ctypes.create_unicode_buffer(length + 1)
                            ctypes.windll.user32.GetWindowTextW(hwnd, buff, length + 1)
                            w_title = buff.value.lower()
                            if clean_name in w_title or target_str in w_title:
                                pid_val = ctypes.c_ulong()
                                ctypes.windll.user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid_val))
                                if pid_val.value and pid_val.value != os.getpid():
                                    target_pids.add(pid_val.value)
                                    # Also post WM_CLOSE for immediate window termination
                                    ctypes.windll.user32.PostMessageW(hwnd, 0x0010, 0, 0)
                    return True
                ctypes.windll.user32.EnumWindows(WNDENUMPROC(_enum_cb), 0)

                for wpid in target_pids:
                    try:
                        if psutil.pid_exists(wpid):
                            psutil.Process(wpid).kill()
                            killed_count += 1
                        subprocess.run(f"taskkill /F /T /PID {wpid}", shell=True, capture_output=True, timeout=3)
                    except Exception as e:
                        errors.append(str(e))
            except Exception as e:
                errors.append(str(e))

        if killed_count > 0:
            return {"success": True, "message": f"Killed {killed_count} instance(s) matching '{target_str}'", "count": killed_count}
        else:
            return {"success": False, "message": f"No active process or window found matching '{target_str}'", "count": 0, "errors": errors}

    except Exception as e:
        return {"success": False, "message": f"Termination failed: {e}", "count": 0}

def show_system_warning_modal(message: str, title: str = "OFFICIAL IT COMPLIANCE NOTICE", duration_seconds: int = 8):
    """
    Spawns an official system-level modal warning on the employee's screen.
    Uses Win32 MessageBoxW with top-most flags or Tkinter fallback in a detached daemon thread.
    """
    def _display():
        if platform.system() == "Windows":
            try:
                try:
                    import winsound
                    winsound.MessageBeep(winsound.MB_ICONEXCLAMATION)
                    for freq in (1300, 950, 1300):
                        winsound.Beep(freq, 220)
                except Exception:
                    pass
                # MB_OK (0x0) | MB_ICONWARNING (0x30) | MB_SYSTEMMODAL (0x1000) | MB_SETFOREGROUND (0x10000) | MB_TOPMOST (0x40000)
                flags = 0x00000000 | 0x00000030 | 0x00001000 | 0x00010000 | 0x00040000
                full_msg = f"{message}\n\n[Incident logged by ApexMonitor Compliance Enforcement]"
                ctypes.windll.user32.MessageBoxW(0, full_msg, title, flags)
                return
            except Exception:
                pass

        # Cross-platform Tkinter fallback
        try:
            import tkinter as tk
            root = tk.Tk()
            root.title(title)
            root.attributes('-topmost', True)
            root.geometry("450x180")
            root.configure(bg="#7f1d1d")

            lbl_title = tk.Label(root, text=title, font=("Segoe UI", 12, "bold"), fg="#ffffff", bg="#7f1d1d")
            lbl_title.pack(pady=(15, 5))

            lbl_msg = tk.Label(root, text=message, font=("Segoe UI", 10), fg="#fecaca", bg="#7f1d1d", wraplength=400)
            lbl_msg.pack(pady=5)

            lbl_timer = tk.Label(root, text=f"Auto-closing in {duration_seconds}s...", font=("Segoe UI", 9, "italic"), fg="#f87171", bg="#7f1d1d")
            lbl_timer.pack(pady=5)

            root.after(duration_seconds * 1000, root.destroy)
            root.mainloop()
        except Exception:
            print(f"[SCREEN WARNING POPUP]: {title} - {message}")

    thread = threading.Thread(target=_display, daemon=True)
    thread.start()
