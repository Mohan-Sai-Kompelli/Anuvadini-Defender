"""
Anuvadini Detector - Cross-Platform Enforcement & Action Module
Supports Windows, macOS (MacBooks), and Linux.
Handles screen warning alerts, process termination, and sound chimes.
"""
import sys
import os
import threading
import psutil

IS_WINDOWS = sys.platform == "win32"
IS_MAC = sys.platform == "darwin"

user32 = None
if IS_WINDOWS:
    try:
        import ctypes
        if hasattr(ctypes, "windll"):
            user32 = ctypes.windll.user32
    except Exception:
        user32 = None

def _as_escape(text: str) -> str:
    """Escape text for use inside an AppleScript string literal."""
    return str(text).replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\" & linefeed & \"")

def _mac_dialog(title: str, text: str, timeout_seconds: int = 8, icon: str = "caution") -> None:
    """Native macOS dialog that dismisses itself (a banner notification is too easy to miss)."""
    import subprocess
    script = (f'display dialog "{_as_escape(text)}" with title "{_as_escape(title)}" buttons {{"OK"}} default button "OK" '
              f'with icon {icon} giving up after {int(timeout_seconds)}')
    subprocess.run(["osascript", "-e", script], capture_output=True, timeout=timeout_seconds + 5)

def _msg_box_worker(title: str, text: str, timeout_seconds: int = 7, icon: int = 0x30):
    """Display a non-blocking system modal alert on the client desktop that auto-dismisses."""
    if IS_WINDOWS and user32:
        try:
            flags = 0x1000 | icon | 0x10000 | 0x40000   # system-modal | icon | foreground | topmost
            if hasattr(user32, "MessageBoxTimeoutW"):
                user32.MessageBoxTimeoutW(0, text, title, flags, 0, timeout_seconds * 1000)
            else:
                user32.MessageBoxW(0, text, title, flags)
            return
        except Exception as e:
            print(f"[Windows Alert Error]: {e}")

    if IS_MAC:
        try:
            _mac_dialog(title, text, timeout_seconds, "stop" if icon == 0x10 else "caution")
            return
        except Exception as e:
            print(f"[macOS Alert Error]: {e}")

    # Terminal notification fallback
    print(f"\n{'='*50}\n[{title}]\n{text}\n{'='*50}\n")

def trigger_warning_popup(game_name: str, reason: str = "Company Policy Violation"):
    """Show an official Anuvadini Detector enforcement notice on the employee's screen."""
    title = "⚠️ ANUVADINI DETECTOR - POLICY WARNING"
    text = (
        f"Unauthorized Activity Detected:\n\n"
        f"• Application: {game_name}\n"
        f"• Status: LOGGED TO AUDIT SERVER\n\n"
        f"Office guidelines prohibit non-work activities and gaming during work hours.\n"
        f"Please close this application immediately."
    )
    t = threading.Thread(target=_msg_box_worker, args=(title, text, 8), daemon=True)
    t.start()

_site_popup_proc = None   # the popup process currently on screen (never stack several)

def _site_popup_fallback(site: str, category: str):
    """Plain Windows message box, used only if the branded popup cannot be started."""
    title = "ANUVADINI FOUNDATION - WEBSITE BLOCKED"
    lines = ["This website is not allowed.", "", f"\u2022 Website: {site}"]
    if category:
        lines.append(f"\u2022 Category: {category}")
    lines += ["", "Anuvadini Foundation has blocked this website. The page has been closed."]
    threading.Thread(target=_msg_box_worker, args=(title, "\n".join(lines), 8, 0x10), daemon=True).start()

def show_site_blocked_popup(site: str, category: str = ""):
    """Tell the employee that Anuvadini Foundation has blocked the website they just opened.
    Shows the branded popup (logo) in its own process; falls back to a plain message box."""
    global _site_popup_proc
    if _site_popup_proc is not None and _site_popup_proc.poll() is None:
        return  # one is already on screen
    try:
        import subprocess
        import tkinter  # noqa: F401  (fail fast to the fallback if tkinter is missing on this PC)
        exe = sys.executable
        if IS_WINDOWS:
            pyw = os.path.join(os.path.dirname(exe), "pythonw.exe")
            if os.path.exists(pyw):
                exe = pyw
        pkg_parent = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        flags = 0x08000000 if IS_WINDOWS else 0   # CREATE_NO_WINDOW
        proc = subprocess.Popen(
            [exe, "-m", "anuvadini_detector.popup_ui", str(site)[:120], str(category)[:60]],
            cwd=pkg_parent, creationflags=flags, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        _site_popup_proc = proc

        def _fallback_if_crashed():
            try:
                code = proc.wait(timeout=3)
                if code != 0:            # crashed within 3 s (no Tk / display problem): show the plain dialog instead
                    _site_popup_fallback(site, category)
            except Exception:
                pass                     # still running after 3 s = the popup is on screen
        threading.Thread(target=_fallback_if_crashed, daemon=True).start()
    except Exception:
        _site_popup_fallback(site, category)

def play_alert_chime():
    """Play warning alert beep to notify employee across all platforms."""
    if IS_WINDOWS:
        try:
            import winsound
            winsound.MessageBeep(winsound.MB_ICONEXCLAMATION)
            return
        except Exception:
            pass

    if IS_MAC:
        try:
            import subprocess
            subprocess.run(["afplay", "/System/Library/Sounds/Ping.aiff"], timeout=1.0)
            return
        except Exception:
            pass

    try:
        # Standard terminal ASCII bell chime
        sys.stdout.write('\a')
        sys.stdout.flush()
    except Exception:
        pass

# Killing any of these would crash or lock out the machine; no remote command may target them.
PROTECTED_PROCESSES = {
    "system", "registry", "memory compression", "smss.exe", "csrss.exe", "wininit.exe", "winlogon.exe",
    "services.exe", "lsass.exe", "svchost.exe", "dwm.exe", "fontdrvhost.exe", "explorer.exe", "sihost.exe",
    "ctfmon.exe", "taskhostw.exe", "searchhost.exe", "lockapp.exe",
    # macOS
    "launchd", "kernel_task", "windowserver", "loginwindow", "finder", "dock", "systemuiserver", "coreservicesd",
}

def kill_process_by_pid(pid: int) -> tuple[bool, str]:
    """Terminate or kill a running gaming process by PID cross-platform."""
    try:
        if pid <= 4:
            return False, "Cannot terminate system process"
        if pid == os.getpid():
            return False, "Refusing to terminate the Anuvadini process itself"
        p = psutil.Process(pid)
        name = p.name()
        if name.lower() in PROTECTED_PROCESSES:
            return False, f"Refusing to terminate protected system process ({name})"
        p.kill()
        return True, f"Successfully terminated {name} (PID: {pid})"
    except psutil.NoSuchProcess:
        return False, "Process no longer exists"
    except psutil.AccessDenied:
        return False, "Access denied. Administrative rights required to terminate this process."
    except Exception as e:
        return False, str(e)

def lock_workstation() -> tuple[bool, str]:
    """Instantly lock employee workstation screen cross-platform."""
    if IS_WINDOWS and user32:
        try:
            res = user32.LockWorkStation()
            return bool(res), "Windows Workstation locked successfully."
        except Exception as e:
            return False, str(e)
    if IS_MAC:
        try:
            import subprocess
            cgsession = "/System/Library/CoreServices/Menu Extras/User.menu/Contents/Resources/CGSession"
            if os.path.exists(cgsession):
                subprocess.run([cgsession, "-suspend"], check=False, timeout=5)
                return True, "macOS session locked."
            # Ctrl+Cmd+Q = Lock Screen (needs the Accessibility permission)
            r = subprocess.run(["osascript", "-e", 'tell application "System Events" to keystroke "q" using {control down, command down}'],
                               capture_output=True, text=True, timeout=5)
            if r.returncode == 0:
                return True, "macOS screen locked."
            subprocess.run(["pmset", "displaysleepnow"], check=False, timeout=5)   # last resort: sleep the display
            return False, "Could not lock (grant Accessibility permission); display put to sleep instead."
        except Exception as e:
            return False, str(e)
    return False, "Lock screen not supported on this platform."

if __name__ == "__main__":
    print(f"Platform: {sys.platform}. Testing alert chime...")
    play_alert_chime()
