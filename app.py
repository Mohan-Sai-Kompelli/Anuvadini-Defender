"""
ApexMonitor Unified Executable Application
Dual-mode client:
  1. Continue without Password: Standard monitored agent (stays in taskbar with status/settings).
  2. Continue with Password: Supervisor mode (monitors all endpoints + tags supervisor stream).
"""

import asyncio
import base64
import ctypes
import io
import json
import os
import platform
import socket
import sys
import threading
import time
import webbrowser
from typing import Optional, Tuple
import tkinter as tk
from tkinter import ttk, messagebox
from PIL import Image, ImageGrab
import websockets

try:
    import psutil
except Exception:
    psutil = None

try:
    import pygetwindow as gw
except Exception:
    gw = None

# Default Configuration
DEFAULT_CONFIG = {
    "server_host": "innovation-tax-minute-category.trycloudflare.com",
    "server_port": 80,
    "frame_interval": 2.5
}


def get_config_path() -> str:
    """Finds the most appropriate persistent location for app_config.json."""
    if getattr(sys, "frozen", False):
        exe_dir = os.path.dirname(sys.executable)
        p = os.path.join(exe_dir, "app_config.json")
        try:
            test_file = os.path.join(exe_dir, ".test_write")
            with open(test_file, "w") as f:
                f.write("1")
            os.remove(test_file)
            return p
        except Exception:
            pass

    appdata = os.getenv("APPDATA") or os.path.expanduser("~")
    cfg_dir = os.path.join(appdata, "ApexMonitor")
    try:
        os.makedirs(cfg_dir, exist_ok=True)
        return os.path.join(cfg_dir, "app_config.json")
    except Exception:
        return os.path.join(os.path.dirname(os.path.abspath(__file__)), "app_config.json")


def load_config() -> dict:
    cfg = DEFAULT_CONFIG.copy()
    env_host = os.getenv("MONITOR_SERVER_HOST")
    if env_host:
        cfg["server_host"] = env_host.strip()
    env_port = os.getenv("MONITOR_SERVER_PORT")
    if env_port:
        try:
            cfg["server_port"] = int(env_port.strip())
        except ValueError:
            pass

    paths_to_check = [
        get_config_path(),
        os.path.join(os.getcwd(), "app_config.json"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "app_config.json")
    ]
    if getattr(sys, "frozen", False):
        paths_to_check.insert(0, os.path.join(os.path.dirname(sys.executable), "app_config.json"))

    for path in paths_to_check:
        if os.path.exists(path):
            try:
                with open(path, "r") as f:
                    file_cfg = json.load(f)
                    cfg.update(file_cfg)
                    break
            except Exception:
                pass
    return cfg


def save_config(cfg: dict):
    try:
        path = get_config_path()
        with open(path, "w") as f:
            json.dump(cfg, f, indent=2)
    except Exception as e:
        print(f"Error saving config: {e}")


CONFIG = load_config()

# Endpoint Information
HOSTNAME = socket.gethostname()
USERNAME = os.getenv("USERNAME", os.getenv("USER", "User"))
CLIENT_ID = f"{HOSTNAME}_{USERNAME}"

# Blacklist defaults
BLACKLISTED_KEYWORDS = [
    # Video & Entertainment
    "netflix", "youtube", "twitch", "prime video", "disney+", "hulu", "hotstar",
    # Gaming & Game Launchers
    "steam", "epic games", "valorant", "roblox", "minecraft", "poki", "crazygames", "cs2", "battlenet", "riot games",
    # Social Media & Chat
    "tiktok", "instagram", "facebook", "discord", "reddit", "twitter", "x.com",
    # Piracy
    "torrent", "piratebay", "1337x", "fitgirl",
    # Gambling, Betting & Casinos
    "stake", "bet365", "1xbet", "dream11", "rummy", "parimatch", "dafabet", "casino",
    # Trading & Speculative Portals
    "olymptrade", "binomo", "iqoption", "quotex", "pocketoption", "tradingview", "groww", "zerodha", "upstox", "wazirx", "coindcx", "binance", "bybit"
]


# Shared Global State between GUI and Agent Thread
APP_STATE = {
    "is_admin": False,
    "supervisor_name": "",
    "agent_running": False,
    "connected_to_server": False,
    "current_window": "Initializing...",
    "current_status": "Starting...",
    "last_ping_time": 0,
    "stop_event": threading.Event()
}


class LASTINPUTINFO(ctypes.Structure):
    _fields_ = [
        ("cbSize", ctypes.c_uint),
        ("dwTime", ctypes.c_uint)
    ]


def get_idle_seconds() -> int:
    if platform.system() != "Windows":
        return 0
    try:
        lii = LASTINPUTINFO()
        lii.cbSize = ctypes.sizeof(LASTINPUTINFO)
        if ctypes.windll.user32.GetLastInputInfo(ctypes.byref(lii)):
            millis = ctypes.windll.kernel32.GetTickCount() - lii.dwTime
            return max(0, int(millis / 1000.0))
    except Exception:
        pass
    return 0


def matches_keyword(kw: str, text: str) -> bool:
    """Matches keyword using word boundaries to prevent false positives like 'twitching' for 'twitch' or 'upstream' for 'steam'."""
    kw = (kw or "").strip()
    if not kw or not text:
        return False
    pattern = rf"(?<![a-zA-Z0-9]){re.escape(kw.lower())}(?![a-zA-Z0-9])"
    return bool(re.search(pattern, text.lower()))


def get_active_window_and_process():
    """Returns (window_title, process_name, pid) for active foreground window."""
    title = "Desktop / Background"
    proc_name = ""
    pid_val = 0

    if platform.system() == "Windows":
        try:
            hwnd = ctypes.windll.user32.GetForegroundWindow()
            if hwnd:
                length = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
                if length > 0:
                    buff = ctypes.create_unicode_buffer(length + 1)
                    ctypes.windll.user32.GetWindowTextW(hwnd, buff, length + 1)
                    val = buff.value.strip()
                    if val:
                        title = val
                pid = ctypes.c_ulong()
                ctypes.windll.user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
                if pid.value:
                    pid_val = pid.value
                    if psutil is not None and psutil.pid_exists(pid_val):
                        try:
                            proc_name = psutil.Process(pid_val).name()
                        except Exception:
                            pass
        except Exception:
            pass

    if title == "Desktop / Background" and gw is not None:
        try:
            window = gw.getActiveWindow()
            if window and window.title:
                title = window.title.strip()
        except Exception:
            pass

    return title, proc_name, pid_val


def get_active_window_title() -> str:
    return get_active_window_and_process()[0]


def execute_remote_kill(target: str):
    """Robustly terminates process by PID, process name, taskkill, or window title."""
    if not target:
        return
    # Use core.enforcer if imported/available
    try:
        from core.enforcer import kill_process_by_pid_or_name
        res = kill_process_by_pid_or_name(target)
        if res.get("count", 0) > 0:
            return
    except Exception:
        pass

    import subprocess
    target_str = str(target).strip().lower()
    clean_name = target_str[:-4] if target_str.endswith(".exe") else target_str
    candidates = {target_str, clean_name, f"{clean_name}.exe"}

    if target_str.isdigit() and psutil is not None:
        try:
            pid = int(target_str)
            if psutil.pid_exists(pid):
                psutil.Process(pid).kill()
        except Exception:
            pass
        if platform.system() == "Windows":
            try:
                subprocess.run(f"taskkill /F /T /PID {target_str}", shell=True, capture_output=True, timeout=3)
            except Exception:
                pass
        return

    killed = False
    if psutil is not None:
        for proc in psutil.process_iter(['name', 'pid']):
            try:
                pname = (proc.info['name'] or '').lower()
                if pname in candidates:
                    proc.kill()
                    killed = True
            except Exception:
                pass

    if platform.system() == "Windows":
        try:
            subprocess.run(f"taskkill /F /T /IM {clean_name}.exe", shell=True, capture_output=True, timeout=3)
        except Exception:
            pass

    # Fallback to searching visible window titles on Windows
    if not killed and platform.system() == "Windows":
        try:
            target_pids = set()
            WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
            def _enum_cb(hwnd, _):
                if ctypes.windll.user32.IsWindowVisible(hwnd):
                    length = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
                    if length > 0:
                        buff = ctypes.create_unicode_buffer(length + 1)
                        ctypes.windll.user32.GetWindowTextW(hwnd, buff, length + 1)
                        if clean_name in buff.value.lower() or target_str in buff.value.lower():
                            pid_val = ctypes.c_ulong()
                            ctypes.windll.user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid_val))
                            if pid_val.value and pid_val.value != os.getpid():
                                target_pids.add(pid_val.value)
                                ctypes.windll.user32.PostMessageW(hwnd, 0x0010, 0, 0)
                return True
            ctypes.windll.user32.EnumWindows(WNDENUMPROC(_enum_cb), 0)

            for wpid in target_pids:
                try:
                    if psutil is not None and psutil.pid_exists(wpid):
                        psutil.Process(wpid).kill()
                    subprocess.run(f"taskkill /F /T /PID {wpid}", shell=True, capture_output=True, timeout=3)
                except Exception:
                    pass
        except Exception:
            pass


def execute_remote_warn(message: str):
    """Displays official compliance warning on screen with loud audio beeps in a non-blocking daemon thread."""
    def _show():
        if platform.system() == "Windows":
            try:
                # Play loud attention beep sequence on client speakers
                try:
                    import winsound
                    winsound.MessageBeep(winsound.MB_ICONEXCLAMATION)
                    for freq in (1300, 950, 1300):
                        winsound.Beep(freq, 220)
                except Exception:
                    pass
                # MB_OK (0x0) | MB_ICONWARNING (0x30) | MB_SYSTEMMODAL (0x1000) | MB_SETFOREGROUND (0x10000) | MB_TOPMOST (0x40000)
                flags = 0x00000000 | 0x00000030 | 0x00001000 | 0x00010000 | 0x00040000
                msg_body = f"{message or 'Non-work activity detected. Please return to work tasks.'}\n\n[Incident logged by ApexMonitor Compliance Enforcement]"
                ctypes.windll.user32.MessageBoxW(0, msg_body, "APEX MONITOR COMPLIANCE WARNING", flags)
                return
            except Exception:
                pass
        try:
            import tkinter as tk
            from tkinter import messagebox
            root = tk.Tk()
            root.withdraw()
            root.attributes('-topmost', True)
            messagebox.showwarning("APEX MONITOR COMPLIANCE WARNING", message or "Non-work activity detected.", parent=root)
            root.destroy()
        except Exception:
            pass

    threading.Thread(target=_show, daemon=True).start()



class RECT(ctypes.Structure):
    _fields_ = [
        ("left", ctypes.c_long),
        ("top", ctypes.c_long),
        ("right", ctypes.c_long),
        ("bottom", ctypes.c_long)
    ]


IGNORED_BACKGROUND_PATTERNS = [
    "overlay primer", "web helper", "crashpad", "geforce overlay",
    "nvidia geforce", "radeon overlay", "amd software", "discord hook",
    "msctfime ui", "default ime", "program manager", "battery meter", "system tray"
]

PRODUCTIVE_WORK_KEYWORDS = [
    "deepseek", "chatgpt", "claude", "copilot", "gemini", "github", "gitlab",
    "visual studio", "vscode", "sublime", "cursor", "pycharm", "intellij",
    "stackoverflow", "jira", "confluence", "slack", "teams", "meet.google",
    "office", "excel", "word", "powerpoint"
]

def is_ignored_background_title(title: str) -> bool:
    if not title:
        return True
    t_lower = title.lower()
    return any(p in t_lower for p in IGNORED_BACKGROUND_PATTERNS)

def is_productive_work_window(title: str) -> bool:
    if not title:
        return False
    t_lower = title.lower()
    return any(p in t_lower for p in PRODUCTIVE_WORK_KEYWORDS)


def get_all_open_window_titles() -> list:
    """Enumerates all top-level open, visible, and background window titles,
    excluding invisible hooks, cloaked windows, and tiny overlay primers."""
    titles = []
    chrome_edge_hwnds = []

    if platform.system() == "Windows":
        try:
            WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
            def enum_windows_callback(hwnd, extra):
                # 1. Skip if window is not visible
                if not ctypes.windll.user32.IsWindowVisible(hwnd):
                    return True

                # 2. Skip if cloaked by DWM (Windows 10/11 suspended/hidden)
                try:
                    dwmapi = getattr(ctypes.windll, "dwmapi", None)
                    if dwmapi:
                        cloaked = ctypes.c_int(0)
                        dwmapi.DwmGetWindowAttribute(hwnd, 14, ctypes.byref(cloaked), ctypes.sizeof(cloaked))
                        if cloaked.value != 0:
                            return True
                except Exception:
                    pass

                # 3. Skip if tiny or zero-size (background hooks and primers)
                try:
                    rect = RECT()
                    if ctypes.windll.user32.GetWindowRect(hwnd, ctypes.byref(rect)):
                        w = rect.right - rect.left
                        h = rect.bottom - rect.top
                        if w <= 50 or h <= 50:
                            return True
                except Exception:
                    pass

                length = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
                if length > 0:
                    buff = ctypes.create_unicode_buffer(length + 1)
                    ctypes.windll.user32.GetWindowTextW(hwnd, buff, length + 1)
                    val = buff.value.strip()
                    if val and not is_ignored_background_title(val):
                        titles.append(val)
                        lower_val = val.lower()
                        if "chrome" in lower_val or "edge" in lower_val or "brave" in lower_val:
                            chrome_edge_hwnds.append(hwnd)
                return True
            ctypes.windll.user32.EnumWindows(WNDENUMPROC(enum_windows_callback), 0)
        except Exception:
            pass

        # Deep inspection for background browser tabs using Windows UI Automation
        if chrome_edge_hwnds:
            try:
                import uiautomation as auto
                for b_hwnd in chrome_edge_hwnds[:3]:  # inspect top browser windows
                    try:
                        ctrl = auto.ControlFromHandle(b_hwnd)
                        if ctrl:
                            # Search for tab items in the browser tab bar
                            for tab in ctrl.GetChildren():
                                if tab.Name and not is_ignored_background_title(tab.Name):
                                    titles.append(tab.Name)
                            # Also check any TabItem controls specifically
                            for tab_item in ctrl.GetTabItems():
                                if tab_item.Name and not is_ignored_background_title(tab_item.Name):
                                    titles.append(tab_item.Name)
                    except Exception:
                        pass
            except Exception:
                pass

    if not titles and gw is not None:
        try:
            for w in gw.getAllWindows():
                if w.title and w.title.strip() and not is_ignored_background_title(w.title.strip()):
                    if getattr(w, 'visible', True) and getattr(w, 'width', 100) > 50 and getattr(w, 'height', 100) > 50:
                        titles.append(w.title.strip())
        except Exception:
            pass

    if not titles:
        titles.append(get_active_window_title())

    # De-duplicate while preserving order
    seen = set()
    unique_titles = []
    for t in titles:
        if t and t not in seen:
            seen.add(t)
            unique_titles.append(t)
    return unique_titles




# Stream Mode Configuration (controlled dynamically by supervisor)
STREAM_MODE = {
    "mode": "normal",       # "normal" or "hd"
    "target_size": (400, 225),
    "quality": 38,
    "interval": 2.5
}


def capture_screen(hd: bool = False) -> str:
    """Captures screenshot. If hd=True, captures full native resolution at high quality."""
    try:
        screenshot = ImageGrab.grab()
        if hd or STREAM_MODE["mode"] == "hd":
            # Crystal-clear HD capture: Full desktop resolution with high JPEG quality
            img = screenshot
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=STREAM_MODE.get("quality", 90), optimize=True)
            return base64.b64encode(buf.getvalue()).decode("utf-8")
        else:
            # Normal low-bandwidth thumbnail buffer for fleet overview
            thumb = screenshot.resize(STREAM_MODE["target_size"], Image.Resampling.BILINEAR)
            if thumb.mode in ("RGBA", "P"):
                thumb = thumb.convert("RGB")
            buf = io.BytesIO()
            thumb.save(buf, format="JPEG", quality=STREAM_MODE["quality"], optimize=True)
            return base64.b64encode(buf.getvalue()).decode("utf-8")
    except Exception:
        return ""


def capture_thumbnail(target_size: Tuple[int, int] = (400, 225), quality: int = 38) -> str:
    return capture_screen(hd=(STREAM_MODE["mode"] == "hd"))



# Background Asynchronous Monitoring Loop
async def agent_task():
    global BLACKLISTED_KEYWORDS

    while not APP_STATE["stop_event"].is_set():
        server_host = str(CONFIG.get("server_host", "127.0.0.1")).strip().rstrip("/")
        server_port = int(CONFIG.get("server_port", 8000))
        interval = float(CONFIG.get("frame_interval", 3.0))

        # Clean any protocol prefix typed by user
        if server_host.startswith("https://"):
            server_host = server_host[8:]
            proto = "wss"
        elif server_host.startswith("http://"):
            server_host = server_host[7:]
            proto = "ws"
        elif server_host.startswith("wss://"):
            server_host = server_host[6:]
            proto = "wss"
        elif server_host.startswith("ws://"):
            server_host = server_host[5:]
            proto = "ws"
        else:
            proto = "wss" if (server_port == 443 or "trycloudflare.com" in server_host) else "ws"

        if server_port in (80, 443) or "trycloudflare.com" in server_host or ":" in server_host:
            uri = f"{proto}://{server_host}/ws/client/{CLIENT_ID}"
        else:
            uri = f"{proto}://{server_host}:{server_port}/ws/client/{CLIENT_ID}"

        try:
            async with websockets.connect(
                uri,
                ping_interval=20,
                ping_timeout=10,
                max_size=10 * 1024 * 1024
            ) as ws:
                APP_STATE["connected_to_server"] = True

                # Receive handshake
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=3.0)
                    msg = json.loads(raw)
                    if msg.get("type") == "handshake":
                        if "blacklist" in msg and isinstance(msg["blacklist"], list):
                            BLACKLISTED_KEYWORDS = msg["blacklist"]
                except Exception:
                    pass

                while not APP_STATE["stop_event"].is_set():
                    t0 = time.time()
                    win_title, proc_name, proc_pid = get_active_window_and_process()
                    APP_STATE["current_window"] = win_title

                    # Check blacklist: First check active foreground window
                    status = "Normal"
                    matched_kw = ""
                    for kw in BLACKLISTED_KEYWORDS:
                        if matches_keyword(kw, win_title):
                            status = "Alert/Game"
                            matched_kw = kw
                            break

                    # If active window didn't trigger, check all background and minimized windows
                    if status != "Alert/Game":
                        launcher_keywords = (
                            "epic games", "steam", "riot games", "riot client", "battlenet",
                            "battle.net", "origin", "ubisoft connect", "ea app", "gog galaxy"
                        )
                        all_titles = get_all_open_window_titles()
                        for t in all_titles:
                            if is_ignored_background_title(t):
                                continue
                            for kw in BLACKLISTED_KEYWORDS:
                                # Game launchers idling in background/tray are normal services, not active gaming violations
                                if kw.lower() in launcher_keywords:
                                    continue
                                if matches_keyword(kw, t):
                                    status = "Alert/Game"
                                    matched_kw = kw
                                    win_title = f"{win_title} [Background: {t}]"
                                    break
                            if status == "Alert/Game":
                                break

                    idle_sec = get_idle_seconds()
                    if status != "Alert/Game" and idle_sec >= 180:
                        status = "Idle"

                    # High-Resolution Evidence Capture on Violation (for Admin Dashboard audit trail)
                    high_res_proof = ""
                    if status == "Alert/Game":
                        # Silently capture full HD proof image for supervisor audit trail
                        high_res_proof = capture_screen(hd=True)

                    APP_STATE["current_status"] = status
                    thumb = high_res_proof if high_res_proof else capture_thumbnail()

                    payload = {
                        "window": win_title,
                        "process_name": proc_name,
                        "pid": proc_pid,
                        "status": status,
                        "matched_keyword": matched_kw,
                        "idle_seconds": idle_sec,
                        "screenshot": thumb,
                        "is_admin": APP_STATE["is_admin"],
                        "role": "Supervisor" if APP_STATE["is_admin"] else "Standard",
                        "admin_user": APP_STATE["supervisor_name"] if APP_STATE["is_admin"] else "",
                        "timestamp": time.time()
                    }

                    await ws.send(json.dumps(payload))

                    APP_STATE["last_ping_time"] = time.time()

                    # Drain all incoming remote commands from server
                    while True:
                        try:
                            cmd_raw = await asyncio.wait_for(ws.recv(), timeout=0.05)
                            cmd = json.loads(cmd_raw)
                            action = (cmd.get("action") or cmd.get("type") or "").upper()
                            target = cmd.get("payload", "")
                            if "KILL" in action:
                                execute_remote_kill(target)
                            elif "SET_STREAM_MODE" in action or "STREAM_MODE" in action:
                                new_mode = cmd.get("mode", "normal")
                                STREAM_MODE["mode"] = new_mode
                                if new_mode == "hd":
                                    STREAM_MODE["quality"] = cmd.get("quality", 90)
                                    interval = float(cmd.get("interval", 0.8))
                                else:
                                    STREAM_MODE["quality"] = 38
                                    interval = float(CONFIG.get("frame_interval", 2.5))
                            elif "WARN" in action:
                                execute_remote_warn(target)
                        except (asyncio.TimeoutError, websockets.ConnectionClosed):
                            break
                        except Exception:
                            break


                    elapsed = time.time() - t0
                    sleep_time = max(0.5, interval - elapsed)
                    await asyncio.sleep(sleep_time)

        except Exception as e:
            APP_STATE["connected_to_server"] = False
            APP_STATE["current_status"] = "Reconnecting..."
            await asyncio.sleep(3)


def start_agent_thread():
    if not APP_STATE["agent_running"]:
        APP_STATE["agent_running"] = True
        APP_STATE["stop_event"].clear()

        def _runner():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(agent_task())

        t = threading.Thread(target=_runner, daemon=True)
        t.start()


# Tkinter Desktop GUI
class ApexMonitorApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Anuvadini Apex")
        self.geometry("480x560")
        self.resizable(False, False)
        self.configure(bg="#0b1120")

        # Set window icon if available
        self.protocol("WM_DELETE_WINDOW", self.on_minimize_or_close)

        self.style = ttk.Style()
        self.style.theme_use("clam")

        self.current_frame = None
        self.show_startup_dialog()

    def clear_screen(self):
        if self.current_frame:
            self.current_frame.destroy()

    # 1. Startup Mode Selection Dialog
    def show_startup_dialog(self):
        self.clear_screen()
        self.geometry("480x560")

        f = tk.Frame(self, bg="#0b1120")
        f.pack(fill="both", expand=True, padx=25, pady=25)
        self.current_frame = f

        # Header Logo & Title
        lbl_logo = tk.Label(f, text="[ APEX ]", font=("Segoe UI", 26, "bold"), bg="#0b1120", fg="#6366f1")
        lbl_logo.pack(pady=(10, 5))

        lbl_title = tk.Label(f, text="Anuvadini Apex", font=("Segoe UI", 18, "bold"), bg="#0b1120", fg="#f8fafc")
        lbl_title.pack()

        lbl_sub = tk.Label(f, text="Endpoint Activity & Real-Time Monitoring Hub", font=("Segoe UI", 10), bg="#0b1120", fg="#94a3b8")
        lbl_sub.pack(pady=(2, 25))

        # Card container
        card = tk.Frame(f, bg="#1e293b", bd=1, relief="solid")
        card.pack(fill="x", pady=10)

        # Mode A: Continue with Password (Supervisor / Monitor All)
        btn_admin = tk.Button(
            card,
            text="[+] Continue with Password (Supervisor Mode)\nMonitor all employee screens & manage fleet",
            font=("Segoe UI", 10, "bold"),
            bg="#4f46e5",
            fg="#ffffff",
            activebackground="#4338ca",
            activeforeground="#ffffff",
            bd=0,
            padx=15,
            pady=12,
            cursor="hand2",
            command=self.show_password_dialog
        )
        btn_admin.pack(fill="x", padx=15, pady=(15, 10))

        # Mode B: Continue without Password (Standard Monitored Mode)
        btn_client = tk.Button(
            card,
            text="[>] Continue without Password (Employee Mode)\nRuns in taskbar and actively monitors this screen",
            font=("Segoe UI", 10, "bold"),
            bg="#334155",
            fg="#e2e8f0",
            activebackground="#475569",
            activeforeground="#ffffff",
            bd=0,
            padx=15,
            pady=12,
            cursor="hand2",
            command=self.enter_employee_mode
        )
        btn_client.pack(fill="x", padx=15, pady=(0, 15))

        # Settings Link
        lbl_settings = tk.Label(
            f,
            text="Server Configuration & Network Settings",
            font=("Segoe UI", 9, "underline"),
            bg="#0b1120",
            fg="#818cf8",
            cursor="hand2"
        )
        lbl_settings.pack(pady=(20, 5))
        lbl_settings.bind("<Button-1>", lambda e: self.show_settings_dialog())

        self.lbl_info = tk.Label(
            f,
            text=f"Endpoint: {CLIENT_ID}\nTarget Server: {CONFIG.get('server_host')}:{CONFIG.get('server_port')}",
            font=("Segoe UI", 8),
            bg="#0b1120",
            fg="#64748b"
        )
        self.lbl_info.pack(side="bottom")

    # 2. Password Prompt for Admin/Supervisor
    def show_password_dialog(self):
        pwd_win = tk.Toplevel(self)
        pwd_win.title("Supervisor Authentication")
        pwd_win.geometry("380x280")
        pwd_win.resizable(False, False)
        pwd_win.configure(bg="#0f172a")
        pwd_win.transient(self)
        pwd_win.grab_set()

        lbl_h = tk.Label(pwd_win, text="Supervisor Login", font=("Segoe UI", 14, "bold"), bg="#0f172a", fg="#f8fafc")
        lbl_h.pack(pady=(15, 5))

        lbl_desc = tk.Label(
            pwd_win,
            text="Enter admin credentials to unlock full fleet monitor.",
            font=("Segoe UI", 9),
            bg="#0f172a",
            fg="#94a3b8"
        )
        lbl_desc.pack(pady=(0, 15))

        # Supervisor name
        f_user = tk.Frame(pwd_win, bg="#0f172a")
        f_user.pack(fill="x", padx=25, pady=4)
        tk.Label(f_user, text="Supervisor Name:", font=("Segoe UI", 9), bg="#0f172a", fg="#cbd5e1").pack(anchor="w")
        ent_user = tk.Entry(f_user, font=("Segoe UI", 10), bg="#1e293b", fg="#ffffff", insertbackground="#ffffff", bd=1)
        ent_user.pack(fill="x", pady=2)
        ent_user.insert(0, USERNAME)

        # Password
        f_pwd = tk.Frame(pwd_win, bg="#0f172a")
        f_pwd.pack(fill="x", padx=25, pady=4)
        tk.Label(f_pwd, text="Password:", font=("Segoe UI", 9), bg="#0f172a", fg="#cbd5e1").pack(anchor="w")
        ent_pwd = tk.Entry(f_pwd, font=("Segoe UI", 10), show="*", bg="#1e293b", fg="#ffffff", insertbackground="#ffffff", bd=1)
        ent_pwd.pack(fill="x", pady=2)
        ent_pwd.focus_set()

        def _verify():
            entered_pwd = ent_pwd.get().strip()
            entered_user = ent_user.get().strip() or USERNAME
            server_host = str(CONFIG.get("server_host", "10.150.0.6")).strip().rstrip("/")
            server_port = int(CONFIG.get("server_port", 8000))

            proto = "https" if (server_port == 443 or "trycloudflare.com" in server_host) else "http"
            if server_port in (80, 443) or ":" in server_host:
                url = f"{proto}://{server_host}/api/auth/supervisor"
            else:
                url = f"{proto}://{server_host}:{server_port}/api/auth/supervisor"

            try:
                import urllib.request
                import urllib.error
                req_data = json.dumps({"username": entered_user, "password": entered_pwd}).encode("utf-8")
                req = urllib.request.Request(url, data=req_data, headers={"Content-Type": "application/json"}, method="POST")
                with urllib.request.urlopen(req, timeout=5) as response:
                    res_body = json.loads(response.read().decode("utf-8"))
                    if res_body.get("success"):
                        APP_STATE["is_admin"] = True
                        APP_STATE["supervisor_name"] = entered_user
                        pwd_win.destroy()
                        self.enter_supervisor_mode()
                        return
                    else:
                        messagebox.showerror("Access Denied", res_body.get("error", "Invalid supervisor credentials."), parent=pwd_win)
            except urllib.error.HTTPError as he:
                messagebox.showerror("Access Denied", "Incorrect supervisor password.", parent=pwd_win)
            except Exception as e:
                messagebox.showerror("Server Unreachable", f"Unable to reach server at {server_host}:{server_port} for verification.\n\nError: {e}", parent=pwd_win)

        ent_pwd.bind("<Return>", lambda e: _verify())

        btn_submit = tk.Button(
            pwd_win,
            text="Unlock & Open Monitor",
            font=("Segoe UI", 10, "bold"),
            bg="#6366f1",
            fg="#ffffff",
            activebackground="#4f46e5",
            bd=0,
            pady=8,
            cursor="hand2",
            command=_verify
        )
        btn_submit.pack(fill="x", padx=25, pady=15)

    # 3. Mode A: Supervisor Dashboard View
    def enter_supervisor_mode(self):
        self.clear_screen()
        self.geometry("520x460")

        # Start client monitoring worker with is_admin=True tag
        start_agent_thread()

        # Open web dashboard automatically in browser
        host = CONFIG.get("server_host", "10.150.0.6")
        port = CONFIG.get("server_port", 8000)
        # Build dashboard URL correctly - omit port for standard ports
        if port in (80, 443) or "trycloudflare.com" in str(host):
            proto = "https" if port == 443 else "http"
            dash_url = f"{proto}://{host}/"
        else:
            dash_url = f"http://{host}:{port}/"
        try:
            webbrowser.open(dash_url)
        except Exception:
            pass

        f = tk.Frame(self, bg="#0b1120")
        f.pack(fill="both", expand=True, padx=25, pady=25)
        self.current_frame = f

        tk.Label(f, text="[ SUPERVISOR ]", font=("Segoe UI", 16, "bold"), bg="#0b1120", fg="#fbbf24").pack(pady=(5, 0))
        tk.Label(f, text="Supervisor Control Active", font=("Segoe UI", 16, "bold"), bg="#0b1120", fg="#fbbf24").pack()
        tk.Label(f, text=f"Logged in as: {APP_STATE['supervisor_name']} (Admin Authenticated)", font=("Segoe UI", 10), bg="#0b1120", fg="#cbd5e1").pack(pady=(2, 15))

        # Info Box
        info_card = tk.Frame(f, bg="#1e293b", bd=1, relief="solid")
        info_card.pack(fill="x", pady=10, padx=10)

        self.lbl_sup_status = tk.Label(info_card, text="Server Connection: Connecting...", font=("Segoe UI", 10, "bold"), bg="#1e293b", fg="#f59e0b")
        self.lbl_sup_status.pack(anchor="w", padx=15, pady=(12, 4))

        self.lbl_sup_stream = tk.Label(info_card, text=f"Your Stream: Active & Tagged as [Supervisor]", font=("Segoe UI", 9), bg="#1e293b", fg="#94a3b8")
        self.lbl_sup_stream.pack(anchor="w", padx=15, pady=(0, 4))

        self.lbl_sup_win = tk.Label(info_card, text="Active Window: Scanning...", font=("Segoe UI", 9), bg="#1e293b", fg="#94a3b8")
        self.lbl_sup_win.pack(anchor="w", padx=15, pady=(0, 12))

        # Open Live Grid Button
        btn_open_web = tk.Button(
            f,
            text="Open Live Surveillance Grid in Browser",
            font=("Segoe UI", 11, "bold"),
            bg="#4f46e5",
            fg="#ffffff",
            activebackground="#4338ca",
            bd=0,
            pady=12,
            cursor="hand2",
            command=lambda: webbrowser.open(dash_url)
        )
        btn_open_web.pack(fill="x", padx=10, pady=10)

        # Minimize button
        btn_min = tk.Button(
            f,
            text="Minimize to Taskbar",
            font=("Segoe UI", 9),
            bg="#334155",
            fg="#cbd5e1",
            bd=0,
            pady=8,
            cursor="hand2",
            command=self.iconify
        )
        btn_min.pack(fill="x", padx=10, pady=4)

        self.start_gui_poller(is_supervisor=True)

    # 4. Mode B: Employee Monitored View
    def enter_employee_mode(self):
        self.clear_screen()
        self.geometry("480x420")

        # Start client monitoring worker in background
        APP_STATE["is_admin"] = False
        start_agent_thread()

        f = tk.Frame(self, bg="#0b1120")
        f.pack(fill="both", expand=True, padx=25, pady=20)
        self.current_frame = f

        tk.Label(f, text="[ EMPLOYEE ]", font=("Segoe UI", 16, "bold"), bg="#0b1120", fg="#6366f1").pack(pady=(5, 0))
        tk.Label(f, text="Anuvadini Apex Client", font=("Segoe UI", 16, "bold"), bg="#0b1120", fg="#f8fafc").pack()
        tk.Label(f, text="Employee Endpoint Status", font=("Segoe UI", 9), bg="#0b1120", fg="#94a3b8").pack(pady=(2, 12))

        # Status Panel
        card = tk.Frame(f, bg="#1e293b", bd=1, relief="solid")
        card.pack(fill="x", pady=6, padx=10)

        self.lbl_emp_conn = tk.Label(card, text="Status: Connecting to Hub...", font=("Segoe UI", 10, "bold"), bg="#1e293b", fg="#f59e0b")
        self.lbl_emp_conn.pack(anchor="w", padx=15, pady=(12, 4))

        tk.Label(card, text=f"Endpoint ID: {CLIENT_ID}", font=("Segoe UI", 9), bg="#1e293b", fg="#94a3b8").pack(anchor="w", padx=15, pady=(0, 4))

        self.lbl_emp_win = tk.Label(card, text="Active Window: Scanning...", font=("Segoe UI", 9), bg="#1e293b", fg="#94a3b8")
        self.lbl_emp_win.pack(anchor="w", padx=15, pady=(0, 4))

        self.lbl_emp_hub = tk.Label(card, text=f"Hub: {CONFIG.get('server_host')}:{CONFIG.get('server_port')}", font=("Segoe UI", 8), bg="#1e293b", fg="#64748b")
        self.lbl_emp_hub.pack(anchor="w", padx=15, pady=(0, 8))

        btn_change_ip = tk.Button(
            card,
            text="Change Server IP / Settings",
            font=("Segoe UI", 8, "bold"),
            bg="#334155",
            fg="#94a3b8",
            activebackground="#475569",
            activeforeground="#ffffff",
            bd=0,
            padx=10,
            pady=4,
            cursor="hand2",
            command=self.show_settings_dialog
        )
        btn_change_ip.pack(anchor="w", padx=15, pady=(0, 12))

        # Notice
        lbl_notice = tk.Label(
            f,
            text="This application stays active in the taskbar.\nYour workstation screen is monitored by enterprise policy.",
            font=("Segoe UI", 9),
            bg="#0b1120",
            fg="#64748b",
            justify="center"
        )
        lbl_notice.pack(pady=10)

        # Minimize button
        btn_min = tk.Button(
            f,
            text="Minimize to Taskbar",
            font=("Segoe UI", 10, "bold"),
            bg="#334155",
            fg="#f8fafc",
            activebackground="#475569",
            bd=0,
            pady=10,
            cursor="hand2",
            command=self.iconify
        )
        btn_min.pack(fill="x", padx=10, pady=5)

        self.start_gui_poller(is_supervisor=False)

    # Poller to update GUI status labels every 1 second
    def start_gui_poller(self, is_supervisor: bool):
        def _poll():
            conn = APP_STATE.get("connected_to_server", False)
            win = APP_STATE.get("current_window", "Unknown")
            status = APP_STATE.get("current_status", "Normal")

            conn_color = "#10b981" if conn else "#ef4444"
            conn_txt = "Connected (Live Streaming)" if conn else "Disconnected (Reconnecting...)"

            if is_supervisor:
                if hasattr(self, "lbl_sup_status"):
                    self.lbl_sup_status.config(text=conn_txt, fg=conn_color)
                if hasattr(self, "lbl_sup_win"):
                    self.lbl_sup_win.config(text=f"Active Window: {win[:40]}")
            else:
                if hasattr(self, "lbl_emp_conn"):
                    self.lbl_emp_conn.config(text=conn_txt, fg=conn_color)
                if hasattr(self, "lbl_emp_win"):
                    self.lbl_emp_win.config(text=f"Active Window: {win[:40]}")

            self.after(1000, _poll)

        self.after(1000, _poll)

    # 5. Settings Dialog
    def show_settings_dialog(self):
        s_win = tk.Toplevel(self)
        s_win.title("Network & Server Settings")
        s_win.geometry("400x320")
        s_win.resizable(False, False)
        s_win.configure(bg="#0f172a")
        s_win.transient(self)
        s_win.grab_set()

        tk.Label(s_win, text="Server Configuration", font=("Segoe UI", 13, "bold"), bg="#0f172a", fg="#f8fafc").pack(pady=(15, 12))

        # Host
        f_h = tk.Frame(s_win, bg="#0f172a")
        f_h.pack(fill="x", padx=30, pady=4)
        tk.Label(f_h, text="Server IP / Hostname:", font=("Segoe UI", 9), bg="#0f172a", fg="#cbd5e1").pack(anchor="w")
        ent_host = tk.Entry(f_h, font=("Segoe UI", 10), bg="#1e293b", fg="#ffffff", bd=1)
        ent_host.pack(fill="x", pady=2)
        ent_host.insert(0, str(CONFIG.get("server_host", "127.0.0.1")))

        # Port
        f_p = tk.Frame(s_win, bg="#0f172a")
        f_p.pack(fill="x", padx=30, pady=4)
        tk.Label(f_p, text="Server Port:", font=("Segoe UI", 9), bg="#0f172a", fg="#cbd5e1").pack(anchor="w")
        ent_port = tk.Entry(f_p, font=("Segoe UI", 10), bg="#1e293b", fg="#ffffff", bd=1)
        ent_port.pack(fill="x", pady=2)
        ent_port.insert(0, str(CONFIG.get("server_port", 8000)))

        # Frame Interval
        f_i = tk.Frame(s_win, bg="#0f172a")
        f_i.pack(fill="x", padx=30, pady=4)
        tk.Label(f_i, text="Transmission Interval (seconds):", font=("Segoe UI", 9), bg="#0f172a", fg="#cbd5e1").pack(anchor="w")
        ent_inv = tk.Entry(f_i, font=("Segoe UI", 10), bg="#1e293b", fg="#ffffff", bd=1)
        ent_inv.pack(fill="x", pady=2)
        ent_inv.insert(0, str(CONFIG.get("frame_interval", 3.0)))

        def _save():
            try:
                CONFIG["server_host"] = ent_host.get().strip()
                CONFIG["server_port"] = int(ent_port.get().strip())
                CONFIG["frame_interval"] = float(ent_inv.get().strip())
                save_config(CONFIG)
                if hasattr(self, "lbl_emp_hub"):
                    self.lbl_emp_hub.config(text=f"Hub: {CONFIG.get('server_host')}:{CONFIG.get('server_port')}")
                if hasattr(self, "lbl_info"):
                    self.lbl_info.config(text=f"Endpoint: {CLIENT_ID}\nTarget Server: {CONFIG.get('server_host')}:{CONFIG.get('server_port')}")
                messagebox.showinfo("Saved", "Settings saved successfully! Click 'Continue without Password' to start monitoring.", parent=s_win)
                s_win.destroy()
            except Exception as ex:
                messagebox.showerror("Error", f"Invalid input: {ex}", parent=s_win)

        btn_save = tk.Button(s_win, text="Save Settings", font=("Segoe UI", 10, "bold"), bg="#6366f1", fg="#ffffff", bd=0, pady=8, command=_save)
        btn_save.pack(fill="x", padx=30, pady=18)

    def on_minimize_or_close(self):
        # Keep running in taskbar
        self.iconify()


if __name__ == "__main__":
    import traceback
    try:
        if "--silent" in sys.argv or "--background" in sys.argv or "-s" in sys.argv:
            APP_STATE["is_admin"] = False
            start_agent_thread()
            while True:
                time.sleep(1)
        else:
            app = ApexMonitorApp()
            app.mainloop()
    except Exception as e:
        err_log = os.path.join(os.path.expanduser("~"), "ApexMonitor_crash.log")
        try:
            with open(err_log, "a") as f:
                f.write(f"\n--- CRASH AT {time.ctime()} ---\n")
                traceback.print_exc(file=f)
        except Exception:
            pass
        # Fallback to running agent thread even if GUI fails
        try:
            start_agent_thread()
            while True:
                time.sleep(1)
        except Exception:
            pass

