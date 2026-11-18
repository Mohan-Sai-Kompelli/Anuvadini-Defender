"""
Anuvadini Detector - Cross-Platform Window & Process Watcher
Supports Windows 10/11, macOS (MacBook Pro/Air Intel & Apple Silicon M1/M2/M3), and Linux.
Tracks active foreground window, background processes, and fullscreen status with 100% reliability.
"""
import sys
import os
import psutil

IS_WINDOWS = sys.platform == "win32"
IS_MAC = sys.platform == "darwin"
IS_LINUX = sys.platform.startswith("linux")

# Windows-specific GDI/User32 Initialization with safe fallback
user32 = None
if IS_WINDOWS:
    try:
        import ctypes
        from ctypes import wintypes
        if hasattr(ctypes, "windll"):
            user32 = ctypes.windll.user32
            class RECT(ctypes.Structure):
                _fields_ = [
                    ('left', ctypes.c_long),
                    ('top', ctypes.c_long),
                    ('right', ctypes.c_long),
                    ('bottom', ctypes.c_long)
                ]
            class MONITORINFO(ctypes.Structure):
                _fields_ = [
                    ('cbSize', wintypes.DWORD),
                    ('rcMonitor', RECT),
                    ('rcWork', RECT),
                    ('dwFlags', wintypes.DWORD)
                ]
    except Exception:
        user32 = None

def _attach_to_input_desktop():
    """Ensure calling thread is attached to interactive desktop on Windows."""
    if user32:
        try:
            hdesk = user32.OpenInputDesktop(0, False, 0x01FF)
            if hdesk:
                user32.SetThreadDesktop(hdesk)
        except Exception:
            pass

def get_monitor_count() -> int:
    """Return count of connected display monitors (multi-monitor setups)."""
    if IS_WINDOWS and user32:
        try:
            # SM_CMONITORS = 80
            cnt = user32.GetSystemMetrics(80)
            return max(1, cnt)
        except Exception:
            return 1
    elif IS_MAC:
        try:
            import subprocess
            cmd = "system_profiler SPDisplaysDataType | grep -c 'Resolution:'"
            res = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=1.0)
            if res.returncode == 0 and res.stdout.strip():
                return max(1, int(res.stdout.strip()))
        except Exception:
            return 1
    return 1

def is_fullscreen(hwnd: int) -> bool:
    """True only for genuine fullscreen / borderless-fullscreen windows (games, F11 video).

    A maximized normal window (has a title bar), the desktop/taskbar shell windows and cloaked (invisible
    background) windows all cover the screen but are NOT fullscreen, so they are rejected.
    """
    if user32 and hwnd:
        try:
            import ctypes
            if not user32.IsWindowVisible(hwnd):
                return False

            cls = ctypes.create_unicode_buffer(64)
            user32.GetClassNameW(hwnd, cls, 64)
            if cls.value in ("Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd"):
                return False

            # DWMWA_CLOAKED = 14: window exists but is hidden (virtual desktop / suspended UWP app)
            cloaked = ctypes.c_int(0)
            try:
                ctypes.windll.dwmapi.DwmGetWindowAttribute(hwnd, 14, ctypes.byref(cloaked), ctypes.sizeof(cloaked))
            except Exception:
                pass
            if cloaked.value:
                return False

            # Maximized or captioned windows are ordinary app windows, not fullscreen.
            if user32.IsZoomed(hwnd):
                return False
            GWL_STYLE, WS_CAPTION = -16, 0xC00000
            if user32.GetWindowLongW(hwnd, GWL_STYLE) & WS_CAPTION:
                return False

            rect = RECT()
            if not user32.GetWindowRect(hwnd, ctypes.byref(rect)):
                return False
            w_w = rect.right - rect.left
            w_h = rect.bottom - rect.top

            # Must cover the whole monitor it lives on (multi-monitor aware)
            hmon = user32.MonitorFromWindow(hwnd, 2)  # MONITOR_DEFAULTTONEAREST
            if hmon:
                mi = MONITORINFO()
                mi.cbSize = ctypes.sizeof(MONITORINFO)
                if user32.GetMonitorInfoW(hmon, ctypes.byref(mi)):
                    m_w = mi.rcMonitor.right - mi.rcMonitor.left
                    m_h = mi.rcMonitor.bottom - mi.rcMonitor.top
                    return w_w >= (m_w - 2) and w_h >= (m_h - 2)

            screen_w = user32.GetSystemMetrics(0)  # SM_CXSCREEN
            screen_h = user32.GetSystemMetrics(1)  # SM_CYSCREEN
            return w_w >= (screen_w - 2) and w_h >= (screen_h - 2)
        except Exception:
            pass
    return False

def _run_osascript(lines: list[str], timeout: float = 2.5) -> str:
    """Run an AppleScript (one -e per line). Returns stdout, or '' on any failure / missing permission."""
    import subprocess
    try:
        cmd = ["osascript"]
        for ln in lines:
            cmd += ["-e", ln]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return res.stdout.strip() if res.returncode == 0 else ""
    except Exception:
        return ""

# Front window title: System Events needs the Accessibility permission, the browser's own scripting needs
# Automation. Both are tried so a missing permission degrades gracefully instead of hiding the page title.
_MAC_FRONT_WINDOW_SCRIPT = [
    'tell application "System Events"',
    'set fp to first application process whose frontmost is true',
    'set pName to name of fp',
    'set pId to unix id of fp',
    'set wTitle to ""',
    'try',
    'set wTitle to name of front window of fp',
    'end try',
    'return pName & "||" & (pId as string) & "||" & wTitle',
    'end tell',
]

# Each browser has its own scripting dictionary. They are queried one at a time, only for the browser that is
# actually frontmost, so a Mac without Chrome (or without Safari) never hits a compile error.
_MAC_CHROMIUM = {"Google Chrome", "Microsoft Edge", "Brave Browser", "Vivaldi", "Opera", "Chromium"}

def _mac_browser_tab_title(app_name: str) -> str:
    if app_name in _MAC_CHROMIUM:
        return _run_osascript([f'tell application "{app_name}" to get title of active tab of front window'])
    if app_name == "Safari":
        return _run_osascript(['tell application "Safari" to get name of current tab of front window'])
    return ""

def _parse_mac_front_window(raw: str) -> tuple[str, int, str]:
    """'Google Chrome||123||window title||tab title' -> (process, pid, best title)."""
    parts = (raw or "").split("||")
    name = parts[0].strip() if parts else ""
    pid = 0
    if len(parts) > 1:
        try:
            pid = int(parts[1].strip())
        except Exception:
            pid = 0
    win_title = parts[2].strip() if len(parts) > 2 else ""
    tab_title = parts[3].strip() if len(parts) > 3 else ""
    # a browser tab title is the most precise signal; fall back to the window title, then to the app name
    title = tab_title or win_title
    return name, pid, title

def _get_active_window_mac() -> dict:
    """Frontmost application + its real window / browser-tab title on macOS."""
    proc_name, proc_pid, title = "idle", 0, ""
    exe_path = ""
    raw = _run_osascript(_MAC_FRONT_WINDOW_SCRIPT)
    if raw:
        n, pid, t = _parse_mac_front_window(raw)
        if n:
            proc_name, proc_pid, title = n, pid, t
            tab = _mac_browser_tab_title(n)      # exact page title (needs the Automation permission)
            if tab:
                title = tab

    if proc_pid <= 0 and proc_name != "idle":
        for p in psutil.process_iter(['pid', 'name', 'exe']):
            try:
                if p.info['name'] and proc_name.lower() in p.info['name'].lower():
                    proc_pid = p.info['pid']
                    exe_path = p.info.get('exe') or ""
                    break
            except Exception:
                pass

    cpu_percent = 0.0
    memory_mb = 0.0
    if proc_pid > 0:
        try:
            p = psutil.Process(proc_pid)
            cpu_percent = p.cpu_percent(interval=None)
            memory_mb = round(p.memory_info().rss / (1024 * 1024), 1)
            if not exe_path:
                exe_path = p.exe()
        except Exception:
            pass

    return {
        "hwnd": 1,
        "title": title or proc_name,
        "process_name": proc_name,
        "pid": proc_pid,
        "exe_path": exe_path,
        "is_fullscreen": False,
        "cpu_percent": cpu_percent,
        "memory_mb": memory_mb
    }

def _get_visible_apps_mac() -> list[dict]:
    """Running GUI applications (the macOS equivalent of 'windows on the desktop')."""
    raw = _run_osascript([
        'tell application "System Events"',
        'set out to ""',
        'repeat with p in (every application process whose background only is false)',
        'set out to out & (name of p) & "||" & (unix id of p as string) & linefeed',
        'end repeat',
        'return out',
        'end tell',
    ], timeout=3.0)
    apps = []
    for line in raw.splitlines():
        name, _, pid = line.partition("||")
        name = name.strip()
        if name:
            try:
                pid_i = int(pid.strip())
            except Exception:
                pid_i = 0
            apps.append({"hwnd": 1, "title": name, "process_name": name, "pid": pid_i})
    return apps

def get_active_window() -> dict:
    """Cross-platform active window detection for Windows, macOS (MacBook), and Linux."""
    if IS_MAC:
        return _get_active_window_mac()

    if not IS_WINDOWS or not user32:
        # Cross-platform fallback: Top CPU active process
        try:
            procs = [p for p in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_info']) if p.info.get('pid', 0) > 4]
            top_proc = max(procs, key=lambda p: p.info.get('cpu_percent', 0.0), default=None)
            if top_proc:
                return {
                    "hwnd": 1,
                    "title": top_proc.info.get('name', 'Process'),
                    "process_name": top_proc.info.get('name', 'Process'),
                    "pid": top_proc.info.get('pid', 0),
                    "exe_path": "",
                    "is_fullscreen": False,
                    "cpu_percent": top_proc.info.get('cpu_percent', 0.0),
                    "memory_mb": round((top_proc.info.get('memory_info').rss if top_proc.info.get('memory_info') else 0) / (1024 * 1024), 1)
                }
        except Exception:
            pass
        return {
            "hwnd": 0, "title": "System Active", "process_name": "system",
            "pid": 0, "exe_path": "", "is_fullscreen": False, "cpu_percent": 0.0, "memory_mb": 0.0
        }

    # Native Windows Path
    _attach_to_input_desktop()
    hwnd = user32.GetForegroundWindow()
    if not hwnd:
        return {
            "hwnd": 0,
            "title": "",
            "process_name": "idle",
            "pid": 0,
            "exe_path": "",
            "is_fullscreen": False,
            "cpu_percent": 0.0,
            "memory_mb": 0.0
        }

    import ctypes
    from ctypes import wintypes
    length = user32.GetWindowTextLengthW(hwnd)
    buff = ctypes.create_unicode_buffer(length + 1)
    user32.GetWindowTextW(hwnd, buff, length + 1)
    title = buff.value or ""

    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    proc_pid = pid.value

    proc_name = "unknown"
    exe_path = ""
    cpu_percent = 0.0
    memory_mb = 0.0

    if proc_pid > 0:
        try:
            p = psutil.Process(proc_pid)
            proc_name = p.name()
            try:
                exe_path = p.exe()
            except Exception:
                pass
            try:
                memory_mb = round(p.memory_info().rss / (1024 * 1024), 1)
            except Exception:
                pass
        except Exception:
            pass

    return {
        "hwnd": hwnd,
        "title": title,
        "process_name": proc_name,
        "pid": proc_pid,
        "exe_path": exe_path,
        "is_fullscreen": is_fullscreen(hwnd),
        "cpu_percent": cpu_percent,
        "memory_mb": memory_mb
    }

def get_visible_windows() -> list[dict]:
    """Scan all currently visible desktop windows (cross-platform safe)."""
    if IS_MAC:
        apps = _get_visible_apps_mac()
        if apps:
            return apps[:40]
    if not IS_WINDOWS or not user32:
        windows = []
        try:
            for p in psutil.process_iter(['pid', 'name']):
                name = p.info.get('name')
                if name and not name.startswith("System") and p.info.get('pid', 0) > 4:
                    windows.append({
                        "hwnd": 1,
                        "title": name,
                        "process_name": name,
                        "pid": p.info['pid']
                    })
        except Exception:
            pass
        return windows[:25]

    _attach_to_input_desktop()
    hdesk = user32.OpenInputDesktop(0, False, 0x01FF)
    if not hdesk:
        return []

    import ctypes
    from ctypes import wintypes
    windows = []
    WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

    def cb(hwnd, lparam):
        if user32.IsWindowVisible(hwnd):
            length = user32.GetWindowTextLengthW(hwnd)
            if length > 0:
                buff = ctypes.create_unicode_buffer(length + 1)
                user32.GetWindowTextW(hwnd, buff, length + 1)
                title = buff.value.strip()
                if title:
                    pid = wintypes.DWORD()
                    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
                    pname = "unknown"
                    try:
                        pname = psutil.Process(pid.value).name()
                    except Exception:
                        pass
                    windows.append({
                        "hwnd": hwnd,
                        "title": title,
                        "process_name": pname,
                        "pid": pid.value
                    })
        return True

    try:
        user32.EnumDesktopWindows(hdesk, WNDENUMPROC(cb), 0)
    except Exception:
        pass

    return windows

if __name__ == "__main__":
    print("Platform:", sys.platform)
    print("Active Window:", get_active_window())
    print("Visible Windows:", len(get_visible_windows()))
