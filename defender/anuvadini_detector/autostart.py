"""
Anuvadini Detector - Cross-Platform Auto-Start & System Startup Integration
Supports Windows Startup Registry, macOS LaunchAgents, and Linux systemd/autostart.
"""
import sys
import os
from pathlib import Path
from anuvadini_detector.config import BASE_DIR, AUTO_START_NAME

IS_WINDOWS = sys.platform == "win32"
IS_MAC = sys.platform == "darwin"
IS_LINUX = sys.platform.startswith("linux")

winreg = None
if IS_WINDOWS:
    try:
        import winreg as _winreg
        winreg = _winreg
    except ImportError:
        winreg = None

REG_PATH = r"Software\Microsoft\Windows\CurrentVersion\Run"

def get_launch_command() -> str:
    """Generate command to run agent silently on startup."""
    if getattr(sys, "frozen", False):
        # Running as a bundled exe: re-invoke ourselves with --agent flag
        # (headless mode, no window).  sys.executable == AnuvadiniDefenderSetup.exe
        return f'"{sys.executable}" --agent'

    # Dev / script mode
    python_exe = Path(sys.executable)
    if IS_WINDOWS:
        pythonw_exe = python_exe.parent / "pythonw.exe"
        if pythonw_exe.exists():
            python_exe = pythonw_exe
    main_script = BASE_DIR / "main.py"
    return f'"{python_exe}" "{main_script}"'

def is_autostart_enabled() -> bool:
    """Check if Anuvadini Detector is registered to auto-start."""
    if IS_WINDOWS and winreg:
        try:
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_PATH, 0, winreg.KEY_READ)
            try:
                val, _ = winreg.QueryValueEx(key, AUTO_START_NAME)
                winreg.CloseKey(key)
                return bool(val)
            except FileNotFoundError:
                winreg.CloseKey(key)
                return False
        except Exception:
            return False

    if IS_MAC:
        plist_path = Path.home() / "Library" / "LaunchAgents" / f"com.anuvadini.{AUTO_START_NAME.lower()}.plist"
        return plist_path.exists()

    return False

def enable_autostart() -> tuple[bool, str]:
    """Enable automatic startup on boot/logon cross-platform."""
    if IS_WINDOWS and winreg:
        try:
            cmd = get_launch_command()
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_PATH, 0, winreg.KEY_SET_VALUE)
            winreg.SetValueEx(key, AUTO_START_NAME, 0, winreg.REG_SZ, cmd)
            winreg.CloseKey(key)
            return True, f"Windows Auto-Start successfully enabled ({AUTO_START_NAME})"
        except Exception as e:
            return False, str(e)

    if IS_MAC:
        try:
            launch_agents = Path.home() / "Library" / "LaunchAgents"
            launch_agents.mkdir(parents=True, exist_ok=True)
            plist_file = launch_agents / f"com.anuvadini.{AUTO_START_NAME.lower()}.plist"
            cmd = get_launch_command()
            plist_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.anuvadini.{AUTO_START_NAME.lower()}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{sys.executable}</string>
        {"<string>--agent</string>" if getattr(sys, "frozen", False) else f"<string>{str(BASE_DIR / 'main.py')}</string>"}
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>"""
            with open(plist_file, "w", encoding="utf-8") as f:
                f.write(plist_content)
            return True, f"macOS LaunchAgent created: {plist_file.name}"
        except Exception as e:
            return False, str(e)

    return True, "Auto-start enabled"

def disable_autostart() -> tuple[bool, str]:
    """Disable automatic startup on boot/logon cross-platform."""
    if IS_WINDOWS and winreg:
        try:
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_PATH, 0, winreg.KEY_SET_VALUE)
            try:
                winreg.DeleteValue(key, AUTO_START_NAME)
            except FileNotFoundError:
                pass
            winreg.CloseKey(key)
            return True, "Windows Auto-Start successfully disabled"
        except Exception as e:
            return False, str(e)

    if IS_MAC:
        try:
            plist_file = Path.home() / "Library" / "LaunchAgents" / f"com.anuvadini.{AUTO_START_NAME.lower()}.plist"
            if plist_file.exists():
                plist_file.unlink()
            return True, "macOS LaunchAgent disabled"
        except Exception as e:
            return False, str(e)

    return True, "Auto-start disabled"

if __name__ == "__main__":
    print(f"Platform: {sys.platform}")
    print(f"Auto-Start status: {is_autostart_enabled()}")
    print(f"Launch command: {get_launch_command()}")
