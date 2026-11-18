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

import re

import socket

import sys

try:

    if hasattr(sys.stdout, "reconfigure"):

        sys.stdout.reconfigure(encoding="utf-8")

    if hasattr(sys.stderr, "reconfigure"):

        sys.stderr.reconfigure(encoding="utf-8")

except Exception:

    pass

import threading

import time

import urllib.request

import urllib.error

import webbrowser

from typing import Optional, Tuple

import tkinter as tk

from tkinter import ttk, messagebox

from PIL import Image, ImageGrab, ImageTk, ImageFilter, ImageDraw, ImageFont

import websockets



try:

    import qrcode

except Exception:

    qrcode = None



from core.logo_b64 import _CENTER_LOGO_B64



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

    "server_host": "127.0.0.1",

    "server_port": 8055,

    "node_port": 5001,

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

        r"C:\ProgramData\AnuvadiniDetector\agent_config.json",

        get_config_path(),

        os.path.join(os.getcwd(), "agent_config.json"),

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

    paths = [get_config_path()]

    try:

        os.makedirs(r"C:\ProgramData\AnuvadiniDetector", exist_ok=True)

        paths.append(r"C:\ProgramData\AnuvadiniDetector\agent_config.json")

    except Exception:

        pass



    for p in paths:

        try:

            with open(p, "w", encoding="utf-8") as f:

                json.dump(cfg, f, indent=2)

        except Exception as e:

            print(f"Error saving config to {p}: {e}")





CONFIG = load_config()



# Endpoint Information

HOSTNAME = socket.gethostname()

USERNAME = os.getenv("USERNAME", os.getenv("USER", "User"))

CLIENT_ID = f"{HOSTNAME}_{USERNAME}"



# Blacklist defaults

BLACKLISTED_KEYWORDS = [

    # Social Media & Messaging

    "instagram", "twitter", "x.com", "facebook", "tiktok", "reddit", "threads", "snapchat", "linkedin",

    # Video & Entertainment

    "netflix", "youtube", "twitch", "prime video", "disney+", "hotstar", "hulu", "spotify",

    # Gaming & Game Launchers

    "steam", "epic games", "valorant", "roblox", "minecraft", "poki", "crazygames", "cs2", "battlenet", "riot games", "fifa", "fortnite", "pubg", "free fire", "gta", "bgmi",

    # Trading, Gambling & Betting

    "tradingview", "binance", "zerodha", "groww", "upstox", "stake", "bet365", "1xbet", "dream11", "rummy", "parimatch", "dafabet", "casino",

    # Piracy & Evasion

    "torrent", "piratebay", "1337x", "fitgirl"

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

    "paired": False,

    "employee_name": "",

    "employee_id": "",

    "department": CONFIG.get("department", "Technology"),

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







_LAST_ALERT_TIME = {}



def show_violation_popup(app_name: str, win_title: str):

    """Displays a prominent system warning popup when restricted apps are opened."""

    now = time.time()

    last = _LAST_ALERT_TIME.get(app_name, 0)

    if now - last < 25.0:  # 25s cooldown per app so user is warned without frozen dialog loop

        return

    _LAST_ALERT_TIME[app_name] = now



    def _worker():

        title = "⚠️ Anuvadini Defender - Policy Warning"

        msg = (

            f"Restricted Activity Detected: {app_name.upper()}\n\n"

            f"Window: {win_title[:70]}\n\n"

            f"Social media, entertainment, and gaming applications are prohibited during working hours.\n"

            f"This incident has been logged and sent to your organization administrator."

        )

        if platform.system() == "Windows":

            try:

                import ctypes

                user32 = ctypes.windll.user32

                flags = 0x1000 | 0x30 | 0x10000 | 0x40000  # SYSTEMMODAL | ICONWARNING | FOREGROUND | TOPMOST

                if hasattr(user32, "MessageBoxTimeoutW"):

                    user32.MessageBoxTimeoutW(0, msg, title, flags, 0, 8000)

                else:

                    user32.MessageBoxW(0, msg, title, flags)

                return

            except Exception:

                pass

        # Fallback console / alert

        print(f"[POLICY VIOLATION ALERT] {app_name.upper()} detected: {win_title}")



    threading.Thread(target=_worker, daemon=True).start()



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





# Privacy Shield - Strictly Constrained to WhatsApp and Mail (Apps & Webpages)
# Blurring constraint is strictly limited to WhatsApp and Mail ONLY.
# Non-mail, non-WhatsApp apps, code editors, and general web browsing are strictly excluded.

DEV_AND_PRODUCTIVITY_EXCLUDES = {
    "code.exe", "devenv.exe", "sublime_text.exe", "notepad++.exe", "notepad.exe",
    "idea64.exe", "pycharm64.exe", "webstorm64.exe", "clion64.exe", "windowsterminal.exe",
    "powershell.exe", "cmd.exe", "git-bash.exe", "mintty.exe", "wt.exe", "cursor.exe"
}

WHATSAPP_PROCS = {"whatsapp.exe", "whatsapp.native.exe", "whatsapp.root.exe"}
MAIL_PROCS = {
    "outlook.exe", "olk.exe", "thunderbird.exe", "hxoutlook.exe", "hxtsr.exe",
    "mailspring.exe", "emclient.exe", "postbox.exe"
}

def is_privacy_app_active() -> tuple[bool, str]:
    """
    Checks if the user is currently using or viewing WhatsApp or Mail (App or Webpage).
    Strictly applies blur constraint ONLY to WhatsApp and Mail, never to other apps or webpages.
    """
    try:
        title, proc, _ = get_active_window_and_process()
        title_lower = (title or "").lower().strip()
        proc_lower = (proc or "").lower().strip()

        # 1. Never shield dev tools, IDEs, terminals, code editors (prevents false blur when editing mail/whatsapp code)
        if proc_lower in DEV_AND_PRODUCTIVITY_EXCLUDES:
            return False, ""

        # 2. WhatsApp Desktop dedicated application
        if proc_lower in WHATSAPP_PROCS or ("whatsapp" in proc_lower and "installer" not in proc_lower):
            return True, "WhatsApp"

        # 3. Dedicated Mail Desktop clients (Outlook, New Outlook, Thunderbird, Windows Mail, etc.)
        if proc_lower in MAIL_PROCS:
            return True, "Mail"
        if proc_lower == "applicationframehost.exe":
            if title_lower == "mail" or title_lower.endswith(" - mail") or title_lower.startswith("mail -") or "outlook" in title_lower:
                return True, "Mail"
            if "whatsapp" in title_lower:
                return True, "WhatsApp"

        # Exclude search engine result pages (e.g. searching "gmail login" or "whatsapp web" on Google)
        if any(srch in title_lower for srch in (" - google search", " - bing", " - duckduckgo", " - search")):
            return False, ""

        # 4. WhatsApp Web in browser or electron window
        if re.search(r"\bwhatsapp\b", title_lower) or "web.whatsapp.com" in title_lower:
            return True, "WhatsApp"

        # 5. Mail Webpages (Gmail, Outlook Web, Yahoo Mail, Proton Mail, Zoho Mail, Webmail)
        # Gmail
        if re.search(r"\bgmail\b", title_lower) or "mail.google.com" in title_lower or re.search(r"\bgoogle mail\b", title_lower):
            return True, "Mail"

        # Outlook Web / Hotmail / Office 365 Mail
        if re.search(r"\boutlook\b", title_lower) and any(k in title_lower for k in ("mail", "inbox", "office", "live", "365", "microsoft")):
            return True, "Mail"
        if re.search(r"\boutlook\s*(?:-\s*google chrome|–\s*google chrome|-\s*microsoft edge|–\s*microsoft edge|-\s*mozilla firefox)\b", title_lower):
            return True, "Mail"
        if any(dom in title_lower for dom in ("outlook.live.com", "outlook.office.com", "outlook.office365.com")):
            return True, "Mail"

        # Yahoo Mail
        if re.search(r"\byahoo!?\s*mail\b", title_lower) or "mail.yahoo.com" in title_lower:
            return True, "Mail"

        # Proton Mail
        if re.search(r"\bproton\s*mail\b", title_lower) or "mail.proton.me" in title_lower:
            return True, "Mail"

        # Zoho Mail
        if re.search(r"\bzoho\s*mail\b", title_lower) or "mail.zoho.com" in title_lower:
            return True, "Mail"

        # Generic Webmail / Roundcube / Zimbra / Fastmail
        if re.search(r"\b(?:webmail|roundcube|zimbra|fastmail)\b", title_lower):
            return True, "Mail"

    except Exception:
        pass

    return False, ""





def apply_privacy_shield(screenshot: Image.Image, app_name: str) -> Image.Image:

    """

    Applies a heavy privacy blur and centered shield banner to the captured screen.

    Only the supervisor sees this blurred/shielded image; the user's PC is unaffected.

    """

    try:

        # Extreme Gaussian blur so text, names, chat contents, and emails are completely unreadable

        shielded = screenshot.filter(ImageFilter.GaussianBlur(radius=40))

        draw = ImageDraw.Draw(shielded)

        w, h = shielded.size



        # Centered dark shield banner

        banner_h = max(130, int(h * 0.22))

        y1 = (h - banner_h) // 2

        y2 = y1 + banner_h

        draw.rectangle([(0, y1), (w, y2)], fill=(15, 23, 42))



        # Banner accent border lines

        draw.line([(0, y1), (w, y1)], fill=(225, 29, 72), width=3)

        draw.line([(0, y2), (w, y2)], fill=(225, 29, 72), width=3)



        try:

            font_title = ImageFont.truetype("segoeui.ttf", max(18, int(h * 0.032)))

            font_sub = ImageFont.truetype("segoeui.ttf", max(12, int(h * 0.018)))

        except Exception:

            font_title = ImageFont.load_default()

            font_sub = font_title



        title_text = f"PRIVACY SHIELD ACTIVE - {app_name.upper()} IN USE"

        sub_text = "Supervisor live screen is blurred to protect personal communications & confidentiality."



        draw.text((w // 2, y1 + int(banner_h * 0.35)), title_text, fill=(244, 63, 94), font=font_title, anchor="mm")

        draw.text((w // 2, y1 + int(banner_h * 0.7)), sub_text, fill=(226, 232, 240), font=font_sub, anchor="mm")

        return shielded

    except Exception:

        return Image.new("RGB", screenshot.size, color=(15, 23, 42))



def capture_screen(hd: bool = False) -> str:

    """Captures screenshot. If hd=True, captures full native resolution at high quality."""

    try:

        screenshot = ImageGrab.grab()

        is_sensitive, app_name = is_privacy_app_active()

        if is_sensitive:

            screenshot = apply_privacy_shield(screenshot, app_name)

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


def send_http_telemetry_and_screen(payload: dict, thumb: str):
    """Sends frame and heartbeat to both Defender Engine and Node Server in background thread."""
    def _do_send():
        # 1. Defender Engine on port 8055 (Stream Frame + Fleet Heartbeat)
        try:
            req_frame = urllib.request.Request(
                "http://127.0.0.1:8055/api/fleet/stream-frame",
                data=json.dumps({
                    "hostname": payload.get("hostname", HOSTNAME),
                    "employee_id": payload.get("employee_id", ""),
                    "username": payload.get("username", USERNAME),
                    "current_app": payload.get("process_name", ""),
                    "window_title": payload.get("window", ""),
                    "status": "ONLINE",
                    "frame_b64": thumb
                }).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req_frame, timeout=2):
                pass
        except Exception:
            pass

        is_violation = (payload.get("status") == "Alert/Game" or bool(payload.get("matched_keyword")))
        violation_obj = None
        if is_violation:
            violation_obj = {
                "game_name": payload.get("matched_keyword") or payload.get("process_name") or "Restricted Website / App",
                "category": "Restricted Website / App",
                "window_title": payload.get("window", ""),
                "process_name": payload.get("process_name", ""),
                "pid": int(payload.get("pid", 0) or 0),
                "severity": "HIGH"
            }

        hb_status = "GAMING_ALERT" if is_violation else ("IDLE" if payload.get("status") == "Idle" else "ONLINE")

        # 1. Defender Engine on port 8055
        try:
            req_frame = urllib.request.Request(
                "http://127.0.0.1:8055/api/fleet/stream-frame",
                data=json.dumps({
                    "hostname": payload.get("hostname", HOSTNAME),
                    "employee_id": payload.get("employee_id", ""),
                    "username": payload.get("username", USERNAME),
                    "current_app": payload.get("process_name", ""),
                    "window_title": payload.get("window", ""),
                    "status": hb_status,
                    "frame_b64": thumb
                }).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req_frame, timeout=2):
                pass
        except Exception:
            pass

        try:
            req_fleet_hb = urllib.request.Request(
                "http://127.0.0.1:8055/api/fleet/heartbeat",
                data=json.dumps({
                    "hostname": payload.get("hostname", HOSTNAME),
                    "employee_id": payload.get("employee_id", "EMP-2041"),
                    "username": payload.get("username", USERNAME),
                    "department": payload.get("department", "Engineering"),
                    "status": hb_status,
                    "current_app": payload.get("process_name", ""),
                    "window_title": payload.get("window", ""),
                    "pid": int(payload.get("pid", 0) or 0),
                    "idle_seconds": float(payload.get("idle_seconds", 0.0) or 0.0),
                    "violation": violation_obj,
                    "screenshot_b64": thumb
                }).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req_fleet_hb, timeout=2):
                pass
        except Exception:
            pass

        # 2. Node server defender-pair heartbeat
        node_urls = [
            "http://127.0.0.1:5001/api/defender-pair/heartbeat",
            "https://mileage-usa-unsigned-regard.trycloudflare.com/api/defender-pair/heartbeat"
        ]
        hb_body = json.dumps({
            "pairId": APP_STATE.get("pair_id") or "",
            "hostname": payload.get("hostname", HOSTNAME),
            "username": payload.get("username", USERNAME),
            "employee_id": payload.get("employee_id", "EMP-2041"),
            "current_app": payload.get("process_name") or "",
            "window_title": payload.get("window") or "",
            "status": hb_status,
            "pid": int(payload.get("pid", 0) or 0),
            "idle_seconds": float(payload.get("idle_seconds", 0.0) or 0.0),
            "violation": violation_obj,
            "screenshot": thumb
        }).encode("utf-8")

        for u in node_urls:
            try:
                req_hb = urllib.request.Request(u, data=hb_body, headers={"Content-Type": "application/json"}, method="POST")
                with urllib.request.urlopen(req_hb, timeout=2):
                    break
            except Exception:
                continue

    threading.Thread(target=_do_send, daemon=True).start()

async def agent_task():

    global BLACKLISTED_KEYWORDS



    while not APP_STATE["stop_event"].is_set():

        # Enforce constraint: Wait for mobile app QR scan pairing (or supervisor login)

        if not (APP_STATE.get("paired") or APP_STATE.get("is_admin")):

            # Even while waiting for pairing, send heartbeat to keep node server aware
            try:
                hb_body = json.dumps({
                    "pairId": APP_STATE.get("pair_id") or "",
                    "hostname": HOSTNAME,
                    "current_app": "",
                    "window_title": "Waiting for QR scan...",
                    "screenshot": ""
                }).encode("utf-8")
                for u in [
                    "http://127.0.0.1:5001/api/defender-pair/heartbeat",
                    f"https://mileage-usa-unsigned-regard.trycloudflare.com/api/defender-pair/heartbeat"
                ]:
                    try:
                        req = urllib.request.Request(u, data=hb_body, headers={"Content-Type": "application/json"}, method="POST")
                        with urllib.request.urlopen(req, timeout=2):
                            break
                    except Exception:
                        continue
            except Exception:
                pass

            await asyncio.sleep(2.0)

            continue



        server_host = str(CONFIG.get("server_host", "127.0.0.1")).strip().rstrip("/")
        server_port = int(CONFIG.get("server_port", 8055))
        interval = float(CONFIG.get("frame_interval", 2.0))



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

                    is_sensitive, sensitive_app = is_privacy_app_active()

                    if is_sensitive:

                        win_title = f"[Privacy Protected] {sensitive_app}"

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

                        high_res_proof = capture_screen(hd=True)

                        show_violation_popup(matched_kw, win_title)



                    APP_STATE["current_status"] = status

                    thumb = high_res_proof if high_res_proof else capture_thumbnail()



                    cpu_pct = 0.0

                    ram_pct = 0.0

                    if psutil is not None:

                        try:

                            cpu_pct = psutil.cpu_percent(interval=None)

                            ram_pct = psutil.virtual_memory().percent

                        except Exception:

                            pass



                    gp_conn = False

                    try:

                        from core.controller import detect_gamepads

                        gp_conn = bool(detect_gamepads().get("connected", False))

                    except Exception:

                        pass



                    emp_name = APP_STATE.get("employee_name") or USERNAME

                    emp_id = APP_STATE.get("employee_id") or ""

                    emp_dept = APP_STATE.get("department") or CONFIG.get("department", "Engineering")



                    payload = {

                        "client_id": CLIENT_ID,

                        "hostname": HOSTNAME,

                        "username": emp_name,

                        "employee_name": emp_name,

                        "employee_id": emp_id,

                        "department": emp_dept,

                        "window": win_title,

                        "process_name": proc_name,

                        "pid": proc_pid,

                        "status": status,

                        "matched_keyword": matched_kw,

                        "idle_seconds": idle_sec,

                        "cpu_percent": cpu_pct,

                        "ram_percent": ram_pct,

                        "gamepad_connected": gp_conn,

                        "screenshot": thumb,

                        "is_admin": APP_STATE["is_admin"],

                        "role": "Supervisor" if APP_STATE["is_admin"] else "Standard",

                        "admin_user": APP_STATE["supervisor_name"] if APP_STATE["is_admin"] else "",

                        "timestamp": time.time()

                    }



                    try:
                        await ws.send(json.dumps(payload))
                    except Exception:
                        pass

                    send_http_telemetry_and_screen(payload, thumb)
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
            APP_STATE["current_status"] = "Active (Direct Stream)"
            try:
                win_title, proc_name, proc_pid = get_active_window_and_process()
                is_sensitive, sensitive_app = is_privacy_app_active()
                if is_sensitive:
                    win_title = f"[Privacy Protected] {sensitive_app}"
                APP_STATE["current_window"] = win_title
                thumb = capture_thumbnail()
                emp_name = APP_STATE.get("employee_name") or USERNAME
                emp_id = APP_STATE.get("employee_id") or ""
                emp_dept = APP_STATE.get("department") or CONFIG.get("department", "Engineering")
                payload = {
                    "client_id": CLIENT_ID,
                    "hostname": HOSTNAME,
                    "username": emp_name,
                    "employee_name": emp_name,
                    "employee_id": emp_id,
                    "department": emp_dept,
                    "window": win_title,
                    "process_name": proc_name,
                    "pid": proc_pid,
                    "status": "Normal",
                    "matched_keyword": "",
                    "idle_seconds": get_idle_seconds(),
                    "screenshot": thumb,
                    "pair_id": APP_STATE.get("pair_id") or "",
                    "timestamp": time.time()
                }
                send_http_telemetry_and_screen(payload, thumb)
                APP_STATE["last_ping_time"] = time.time()
            except Exception:
                pass
            await asyncio.sleep(2.0)





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

        self.title("Anuvadini Defender - Workstation Pairing")

        self.geometry("900x530")

        self.resizable(False, False)

        self.configure(bg="#f8fafc")



        self.protocol("WM_DELETE_WINDOW", self.on_minimize_or_close)

        self.center_window(900, 530)



        self.style = ttk.Style()

        self.style.theme_use("clam")



        self.pair_id = None

        self.pairing_payload = None

        self.expires_at = 0

        self.paired = False

        self.current_frame = None



        self.qr_poll_job = None

        self.countdown_job = None

        self.scan_line_job = None

        self.scan_y = 35

        self.scan_dir = 1

        self.qr_photo = None

        self.is_running_view = False



        self.show_pairing_interface()



    def center_window(self, w: int, h: int):

        self.update_idletasks()

        sw = self.winfo_screenwidth()

        sh = self.winfo_screenheight()

        x = max(0, int((sw - w) / 2))

        y = max(0, int((sh - h) / 2) - 30)

        self.geometry(f"{w}x{h}+{x}+{y}")



    def clear_screen(self):

        if self.qr_poll_job:

            try:

                self.after_cancel(self.qr_poll_job)

            except Exception:

                pass

            self.qr_poll_job = None

        if self.countdown_job:

            try:

                self.after_cancel(self.countdown_job)

            except Exception:

                pass

            self.countdown_job = None

        if self.scan_line_job:

            try:

                self.after_cancel(self.scan_line_job)

            except Exception:

                pass

            self.scan_line_job = None



        if self.current_frame:

            self.current_frame.destroy()

            self.current_frame = None



    # =========================================================================

    # 1. Primary Startup UI: Exact QR Workstation Pairing Screen

    # =========================================================================

    def show_pairing_interface(self):

        self.clear_screen()

        self.geometry("900x530")

        self.center_window(900, 530)

        self.configure(bg="#f8fafc")

        self.is_running_view = False

        self.paired = False



        # Outer card container matching web dashboard design

        f_card = tk.Frame(self, bg="#ffffff", bd=1, relief="solid")

        f_card.pack(fill="both", expand=True, padx=20, pady=20)

        self.current_frame = f_card



        # 2-Column Split: Left (QR Box) & Right (Steps & Details)

        f_left = tk.Frame(f_card, bg="#ffffff", width=290)

        f_left.pack(side="left", fill="y", padx=(25, 20), pady=25)

        f_left.pack_propagate(False)



        f_right = tk.Frame(f_card, bg="#ffffff")

        f_right.pack(side="right", fill="both", expand=True, padx=(10, 25), pady=25)



        # ------------------ LEFT COLUMN: QR CODE SCANNER ------------------

        # QR Canvas Box with Emerald Brackets

        f_canvas_wrap = tk.Frame(f_left, bg="#f8fafc", bd=1, relief="solid", padx=10, pady=10)

        f_canvas_wrap.pack(pady=(5, 12))



        self.canvas = tk.Canvas(

            f_canvas_wrap,

            width=240,

            height=240,

            bg="#ffffff",

            bd=0,

            highlightthickness=0

        )

        self.canvas.pack()



        # Timer & Refresh Row

        f_timer_row = tk.Frame(f_left, bg="#ffffff")

        f_timer_row.pack(fill="x", pady=(2, 6), padx=4)



        f_timer_left = tk.Frame(f_timer_row, bg="#ffffff")

        f_timer_left.pack(side="left")



        self.lbl_timer_dot = tk.Label(f_timer_left, text="●", font=("Segoe UI", 9, "bold"), bg="#ffffff", fg="#10b981")

        self.lbl_timer_dot.pack(side="left", padx=(0, 4))



        self.lbl_timer = tk.Label(f_timer_left, text="Expires in 10:00", font=("Segoe UI", 8), bg="#ffffff", fg="#64748b")

        self.lbl_timer.pack(side="left")



        self.btn_refresh = tk.Label(f_timer_row, text="🔄 Refresh", font=("Segoe UI", 8, "bold"), bg="#ffffff", fg="#059669", cursor="hand2")

        self.btn_refresh.pack(side="right")

        self.btn_refresh.bind("<Button-1>", lambda e: self.create_or_refresh_session())



        # Network Settings helper link

        lbl_settings = tk.Label(

            f_left,

            text="⚙️ Hub Network Settings",

            font=("Segoe UI", 8, "underline"),

            bg="#ffffff",

            fg="#94a3b8",

            cursor="hand2"

        )

        lbl_settings.pack(pady=(12, 0))

        lbl_settings.bind("<Button-1>", lambda e: self.show_settings_dialog())



        # ------------------ RIGHT COLUMN: INSTRUCTIONS & ACTIONS ------------------

        # Kicker Tag

        lbl_kicker = tk.Label(

            f_right,

            text="— QUICK SETUP",

            font=("Segoe UI", 8, "bold"),

            bg="#ffffff",

            fg="#059669"

        )

        lbl_kicker.pack(anchor="w")



        # Heading Title

        f_title = tk.Frame(f_right, bg="#ffffff")

        f_title.pack(anchor="w", pady=(3, 2))



        tk.Label(

            f_title,

            text="Link this PC to ",

            font=("Segoe UI", 16, "bold"),

            bg="#ffffff",

            fg="#0f172a"

        ).pack(side="left")



        tk.Label(

            f_title,

            text="your account",

            font=("Segoe UI", 16, "bold"),

            bg="#ffffff",

            fg="#059669"

        ).pack(side="left")



        # Subtitle

        lbl_desc = tk.Label(

            f_right,

            text="Just like WhatsApp Web — scan once and your PC is linked. No passwords, no USB drives. Done in seconds.",

            font=("Segoe UI", 8),

            bg="#ffffff",

            fg="#64748b",

            wraplength=480,

            justify="left"

        )

        lbl_desc.pack(anchor="w", pady=(0, 14))



        # 3 Step Flow (From official Anuvadini attendance integration)

        f_steps = tk.Frame(f_right, bg="#ffffff")

        f_steps.pack(fill="x", pady=(0, 14))



        def _add_step(parent, num_str, title_str, desc_str):

            step_r = tk.Frame(parent, bg="#ffffff")

            step_r.pack(fill="x", pady=3)



            # Circular green badge

            lbl_num = tk.Label(

                step_r,

                text=num_str,

                font=("Segoe UI", 8, "bold"),

                bg="#059669",

                fg="#ffffff",

                width=2,

                padx=2,

                pady=1

            )

            lbl_num.pack(side="left", anchor="n", padx=(0, 8), pady=(1, 0))



            f_txt = tk.Frame(step_r, bg="#ffffff")

            f_txt.pack(side="left", fill="x", expand=True)



            tk.Label(f_txt, text=title_str, font=("Segoe UI", 9, "bold"), bg="#ffffff", fg="#0f172a").pack(anchor="w")

            tk.Label(f_txt, text=desc_str, font=("Segoe UI", 8), bg="#ffffff", fg="#64748b", wraplength=440, justify="left").pack(anchor="w")



        _add_step(f_steps, "1", "Open the Anuvadini attendance app", "on your phone — check in as usual first")

        _add_step(f_steps, "2", "Tap 'Scan Work PC'", "find it on your home dashboard")

        _add_step(f_steps, "3", "Point your camera at this QR code", "this PC links to your account instantly")



        # Status Bar & Action Buttons

        f_actions_row = tk.Frame(f_right, bg="#ffffff")

        f_actions_row.pack(fill="x", pady=(4, 12))



        # Status Pill

        f_pill = tk.Frame(f_actions_row, bg="#f0fdf4", bd=1, relief="solid", padx=10, pady=5)

        f_pill.pack(side="left")



        self.lbl_status_dot = tk.Label(f_pill, text="●", font=("Segoe UI", 8, "bold"), bg="#f0fdf4", fg="#10b981")

        self.lbl_status_dot.pack(side="left", padx=(0, 5))



        self.lbl_status_msg = tk.Label(f_pill, text="Generating pairing session...", font=("Segoe UI", 8, "bold"), bg="#f0fdf4", fg="#15803d")

        self.lbl_status_msg.pack(side="left")



        # Action Buttons

        f_btn_group = tk.Frame(f_actions_row, bg="#ffffff")

        f_btn_group.pack(side="right")



        self.btn_sim = tk.Button(

            f_btn_group,

            text="⚡ Simulate Mobile Scan",

            font=("Segoe UI", 8, "bold"),

            bg="#1e4620",

            fg="#ffffff",

            activebackground="#2a5a2d",

            activeforeground="#ffffff",

            bd=0,

            padx=12,

            pady=6,

            cursor="hand2",

            command=self.simulate_mobile_scan

        )

        self.btn_sim.pack(side="left", padx=(0, 6))



        self.btn_reset = tk.Button(

            f_btn_group,

            text="Reset",

            font=("Segoe UI", 8),

            bg="#f8fafc",

            fg="#334155",

            bd=1,

            relief="solid",

            padx=10,

            pady=5,

            cursor="hand2",

            command=self.reset_pairing

        )

        self.btn_reset.pack(side="left")



        # Active Paired Sessions Card

        f_paired_box = tk.Frame(f_right, bg="#f8fafc", bd=1, relief="solid", padx=14, pady=10)

        f_paired_box.pack(fill="x", pady=(0, 5))



        f_paired_top = tk.Frame(f_paired_box, bg="#f8fafc")

        f_paired_top.pack(fill="x")



        tk.Label(

            f_paired_top,

            text="Active Paired Sessions",

            font=("Segoe UI", 9, "bold"),

            bg="#f8fafc",

            fg="#334155"

        ).pack(side="left")



        self.lbl_paired_badge = tk.Label(

            f_paired_top,

            text="0 Connected",

            font=("Segoe UI", 8, "bold"),

            bg="#e2e8f0",

            fg="#475569",

            padx=8,

            pady=2

        )

        self.lbl_paired_badge.pack(side="right")



        self.lbl_paired_desc = tk.Label(

            f_paired_box,

            text="No paired mobile devices active currently. Scan QR above to link.",

            font=("Segoe UI", 8, "italic"),

            bg="#f8fafc",

            fg="#64748b",

            anchor="w"

        )

        self.lbl_paired_desc.pack(fill="x", pady=(4, 0))



        # Start session generation & background polling

        self.create_or_refresh_session()



    # ------------------ QR RENDERING & SCANLINE ANIMATION ------------------

    def draw_corner_brackets(self):

        c = "#059669"

        w = 3

        # Top-Left

        self.canvas.create_line(16, 16, 40, 16, fill=c, width=w, tags="brackets")

        self.canvas.create_line(16, 16, 16, 40, fill=c, width=w, tags="brackets")

        # Top-Right

        self.canvas.create_line(224, 16, 200, 16, fill=c, width=w, tags="brackets")

        self.canvas.create_line(224, 16, 224, 40, fill=c, width=w, tags="brackets")

        # Bottom-Left

        self.canvas.create_line(16, 224, 40, 224, fill=c, width=w, tags="brackets")

        self.canvas.create_line(16, 224, 16, 200, fill=c, width=w, tags="brackets")

        # Bottom-Right

        self.canvas.create_line(224, 224, 200, 224, fill=c, width=w, tags="brackets")

        self.canvas.create_line(224, 224, 224, 200, fill=c, width=w, tags="brackets")



    def render_qr(self, payload):

        self.canvas.delete("all")

        text_data = json.dumps(payload) if isinstance(payload, dict) else str(payload)



        try:

            if qrcode is not None:

                qr = qrcode.QRCode(

                    version=None,

                    box_size=10,

                    border=2,

                    error_correction=qrcode.constants.ERROR_CORRECT_H,

                )

                qr.add_data(text_data)

                qr.make(fit=True)

                qr_img = qr.make_image(fill_color="#111827", back_color="white").convert("RGBA")

                qr_w, qr_h = qr_img.size



                try:

                    from PIL import ImageDraw

                    raw = base64.b64decode(_CENTER_LOGO_B64)

                    logo = Image.open(io.BytesIO(raw)).convert("RGBA")

                    logo_size = max(int(qr_w * 0.16), 36)

                    logo = logo.resize((logo_size, logo_size), Image.Resampling.LANCZOS)

                    pad = max(int(logo_size * 0.28), 8)

                    circle_size = logo_size + pad * 2

                    SS = 4

                    hi = circle_size * SS

                    cvs = Image.new("RGBA", (hi, hi), (0, 0, 0, 0))

                    d = ImageDraw.Draw(cvs)

                    shadow_off = SS * 2

                    d.ellipse([shadow_off, shadow_off, hi - 1, hi - 1], fill=(0, 0, 0, 50))

                    d.ellipse([0, 0, hi - shadow_off - 1, hi - shadow_off - 1], fill=(255, 255, 255, 255))

                    ring_w = SS * 2

                    d.ellipse([ring_w // 2, ring_w // 2, hi - shadow_off - ring_w // 2 - 1, hi - shadow_off - ring_w // 2 - 1], outline=(26, 175, 114, 200), width=ring_w)

                    circle = cvs.resize((circle_size + shadow_off // SS, circle_size + shadow_off // SS), Image.Resampling.LANCZOS)

                    circle.paste(logo, (pad, pad), logo)

                    cx = (qr_w - circle.size[0]) // 2

                    cy = (qr_h - circle.size[1]) // 2

                    qr_img.paste(circle, (cx, cy), circle)

                except Exception:

                    pass



                pil_img = qr_img.resize((180, 180), Image.Resampling.LANCZOS).convert("RGB")

                self.qr_photo = ImageTk.PhotoImage(pil_img)

                self.canvas.create_image(120, 120, image=self.qr_photo, tags="qr_image")

            else:

                self.canvas.create_text(120, 120, text="QRCode Library\nRequired", font=("Segoe UI", 9, "bold"), fill="#ef4444", justify="center")

        except Exception as e:

            self.canvas.create_text(120, 120, text=f"QR Error:\n{e}", font=("Segoe UI", 8), fill="#ef4444", justify="center")



        self.draw_corner_brackets()

        self.start_scan_animation()



    def start_scan_animation(self):

        if self.scan_line_job:

            try:

                self.after_cancel(self.scan_line_job)

            except Exception:

                pass

            self.scan_line_job = None

        self._step_scanline()



    def _step_scanline(self):

        if self.paired or not hasattr(self, "canvas") or not self.canvas.winfo_exists():

            return

        self.canvas.delete("scanline")

        self.canvas.create_line(28, self.scan_y, 212, self.scan_y, fill="#10b981", width=2, tags="scanline")

        self.scan_y += self.scan_dir * 3

        if self.scan_y >= 210:

            self.scan_dir = -1

        elif self.scan_y <= 30:

            self.scan_dir = 1

        self.scan_line_job = self.after(40, self._step_scanline)



    def start_countdown(self):

        if self.countdown_job:

            try:

                self.after_cancel(self.countdown_job)

            except Exception:

                pass

            self.countdown_job = None



        def _update():

            if self.paired:

                return

            diff = max(0, int(self.expires_at - time.time()))

            m, s = divmod(diff, 60)

            if hasattr(self, "lbl_timer") and self.lbl_timer.winfo_exists():

                self.lbl_timer.config(text=f"Expires in {m:02d}:{s:02d}")

            if diff <= 0:

                if hasattr(self, "lbl_timer") and self.lbl_timer.winfo_exists():

                    self.lbl_timer.config(text="Session Expired")

                if hasattr(self, "lbl_status_msg") and self.lbl_status_msg.winfo_exists():

                    self.lbl_status_msg.config(text="QR expired. Click Refresh to regenerate.")

                return

            self.countdown_job = self.after(1000, _update)



        _update()



    # ------------------ SERVER SESSION & POLLING ------------------

    def create_or_refresh_session(self):

        if self.qr_poll_job:

            try:

                self.after_cancel(self.qr_poll_job)

            except Exception:

                pass

            self.qr_poll_job = None



        self.canvas.delete("all")

        self.canvas.create_text(120, 120, text="Generating Session QR...", font=("Segoe UI", 9), fill="#64748b")

        self.draw_corner_brackets()

        self.lbl_status_msg.config(text="Generating pairing session...")



        def _fetch():

            host = str(CONFIG.get("server_host", "127.0.0.1")).strip().rstrip("/")

            for prefix in ("https://", "http://", "wss://", "ws://"):

                if host.lower().startswith(prefix):

                    host = host[len(prefix):]

                    break

            port = int(CONFIG.get("node_port", 5001))

            proto = "https" if port == 443 else "http"

            

            urls = []

            if port not in (80, 443):

                urls.append(f"{proto}://{host}:{port}/api/pair/create")

            else:

                urls.append(f"{proto}://{host}/api/pair/create")

            urls.append("https://mileage-usa-unsigned-regard.trycloudflare.com/api/pair/create")



            payload_data = json.dumps({

                "device": {

                    "hostname": HOSTNAME,

                    "username": USERNAME,

                    "client_id": CLIENT_ID,

                    "department": CONFIG.get("department", "Technology")

                }

            }).encode("utf-8")



            for u in urls:

                try:

                    req = urllib.request.Request(u, data=payload_data, headers={"Content-Type": "application/json"}, method="POST")

                    with urllib.request.urlopen(req, timeout=4) as resp:

                        res_body = json.loads(resp.read().decode("utf-8"))

                        if res_body.get("success"):

                            self.after(0, lambda: self._on_session_created(res_body))

                            return

                except Exception:

                    continue



            # Fallback to local session so user can still test & simulate smoothly

            self.after(0, lambda: self._on_session_fallback("Local session"))



        threading.Thread(target=_fetch, daemon=True).start()



    def _on_session_created(self, res: dict):

        self.pair_id = res.get("pairId") or res.get("pair_id")
        APP_STATE["pair_id"] = self.pair_id

        qr_raw = res.get("pairing_payload") or res.get("qr_data") or res.get("qr")

        if isinstance(qr_raw, str):

            try:

                self.pairing_payload = json.loads(qr_raw)

            except Exception:

                self.pairing_payload = qr_raw

        elif isinstance(qr_raw, dict):

            self.pairing_payload = qr_raw

        else:

            self.pairing_payload = {

                "v": 1,

                "t": "anuvadini-defender-pair",

                "pairId": self.pair_id,

            }

        expires_in = res.get("expires_in", 600)

        self.expires_at = time.time() + expires_in



        self.render_qr(self.pairing_payload)

        self.lbl_status_msg.config(text="Waiting for mobile scan...")

        self.start_countdown()

        self.start_polling()



    def _on_session_fallback(self, err_msg: str):

        import secrets

        self.pair_id = f"local-{secrets.token_hex(8)}"
        APP_STATE["pair_id"] = self.pair_id

        self.expires_at = time.time() + 600

        self.pairing_payload = {

            "v": 1,

            "t": "anuvadini-defender-pair",

            "pairId": self.pair_id,

            "host": CONFIG.get("server_host", "127.0.0.1"),

            "port": CONFIG.get("server_port", 8000),

            "workstation_id": CLIENT_ID

        }

        self.render_qr(self.pairing_payload)

        self.lbl_status_msg.config(text="Waiting for scan (Local session active)...")

        self.start_countdown()

        self.start_polling()



    def start_polling(self):

        if self.paired or not self.pair_id:

            return



        def _poll():

            host = str(CONFIG.get("server_host", "127.0.0.1")).strip().rstrip("/")

            for prefix in ("https://", "http://", "wss://", "ws://"):

                if host.lower().startswith(prefix):

                    host = host[len(prefix):]

                    break

            port = int(CONFIG.get("node_port", 5001))

            proto = "https" if port == 443 else "http"



            urls = []

            if port not in (80, 443):

                urls.append(f"{proto}://{host}:{port}/api/pair/{self.pair_id}")

            else:

                urls.append(f"{proto}://{host}/api/pair/{self.pair_id}")

            urls.append(f"https://mileage-usa-unsigned-regard.trycloudflare.com/api/pair/{self.pair_id}")



            for u in urls:

                try:

                    req = urllib.request.Request(u, headers={"Content-Type": "application/json"}, method="GET")

                    with urllib.request.urlopen(req, timeout=3) as resp:

                        data = json.loads(resp.read().decode("utf-8"))

                        if data.get("status") == "paired":

                            emp = data.get("employee") or data.get("paired_device") or {}

                            self.after(0, lambda: self.on_pairing_success(emp))

                            return

                except Exception:

                    pass



            if not self.paired:

                self.qr_poll_job = self.after(1500, self.start_polling)



        threading.Thread(target=_poll, daemon=True).start()



    def simulate_mobile_scan(self):

        if self.paired:

            return



        sim_emp = {

            "name": "Mohan Sai Kompelli",

            "employee_name": "Mohan Sai Kompelli",

            "id": "EMP-2041",

            "employee_id": "EMP-2041",

            "department": CONFIG.get("department", "Technology"),

            "workstation_id": CLIENT_ID

        }



        def _sim():

            host = str(CONFIG.get("server_host", "127.0.0.1")).strip().rstrip("/")

            for prefix in ("https://", "http://", "wss://", "ws://"):

                if host.lower().startswith(prefix):

                    host = host[len(prefix):]

                    break

            port = int(CONFIG.get("server_port", 8000))

            proto = "https" if port == 443 else "http"

            url = f"{proto}://{host}:{port}/api/pair/{self.pair_id}/simulate" if port not in (80, 443) else f"{proto}://{host}/api/pair/{self.pair_id}/simulate"



            try:

                req = urllib.request.Request(url, data=json.dumps(sim_emp).encode("utf-8"), headers={"Content-Type": "application/json"}, method="POST")

                with urllib.request.urlopen(req, timeout=4) as resp:

                    data = json.loads(resp.read().decode("utf-8"))

                    emp = data.get("employee") or data.get("paired_device") or sim_emp

                    self.after(0, lambda: self.on_pairing_success(emp))

                    return

            except Exception:

                pass



            # Local fallback simulation

            self.after(0, lambda: self.on_pairing_success(sim_emp))



        threading.Thread(target=_sim, daemon=True).start()



    def reset_pairing(self):

        self.create_or_refresh_session()



    # ------------------ PAIRING SUCCESS & TRANSITION ------------------

    def on_pairing_success(self, employee_data: dict):

        if self.paired:

            return

        self.paired = True



        if self.qr_poll_job:

            try:

                self.after_cancel(self.qr_poll_job)

            except Exception:

                pass

            self.qr_poll_job = None



        if self.countdown_job:

            try:

                self.after_cancel(self.countdown_job)

            except Exception:

                pass

            self.countdown_job = None



        if self.scan_line_job:

            try:

                self.after_cancel(self.scan_line_job)

            except Exception:

                pass

            self.scan_line_job = None



        emp_name = employee_data.get("name") or employee_data.get("employee_name") or "Mohan Sai Kompelli"

        emp_id = employee_data.get("id") or employee_data.get("employee_id") or "EMP-2041"

        emp_dept = employee_data.get("department") or CONFIG.get("department", "Technology")



        APP_STATE["paired"] = True
        APP_STATE["pair_id"] = getattr(self, "pair_id", None) or APP_STATE.get("pair_id") or ""

        APP_STATE["employee_name"] = emp_name

        APP_STATE["employee_id"] = emp_id

        APP_STATE["department"] = emp_dept



        # Canvas checkmark overlay

        self.canvas.delete("all")

        self.canvas.create_rectangle(10, 10, 230, 230, fill="#f0fdf4", outline="#bbf7d0", width=2)

        self.canvas.create_oval(85, 45, 155, 115, fill="#10b981", outline="")

        self.canvas.create_text(120, 80, text="✓", font=("Segoe UI", 30, "bold"), fill="#ffffff")

        self.canvas.create_text(120, 140, text="Device Linked!", font=("Segoe UI", 13, "bold"), fill="#0f172a")

        self.canvas.create_text(120, 175, text=f"{emp_name}\n({emp_id})", font=("Segoe UI", 9, "bold"), fill="#059669", justify="center")



        # Update status pill

        self.lbl_status_dot.config(fg="#10b981")

        self.lbl_status_msg.config(text=f"✓ Authenticated: {emp_name}")

        self.lbl_timer.config(text="Session Linked & Active", fg="#059669")



        # Update paired badge

        self.lbl_paired_badge.config(text="1 Connected", bg="#dcfce7", fg="#166534")

        self.lbl_paired_desc.config(

            text=f"✓ Linked to {emp_name} ({emp_id}) • {emp_dept}\nWorkstation ID: {CLIENT_ID}",

            font=("Segoe UI", 8, "bold"),

            fg="#15803d"

        )



        # Start the background monitoring worker

        start_agent_thread()



        # Transition to "App is running" mode after 2 seconds

        self.after(2000, self.enter_running_mode)



    # =========================================================================

    # 2. Running State: "App is running" (Nothing else shown on taskbar click)

    # =========================================================================

    def enter_running_mode(self):

        self.clear_screen()

        self.is_running_view = True

        self.title("Anuvadini Defender")

        self.geometry("480x360")

        self.center_window(480, 360)

        self.configure(bg="#ffffff")



        f = tk.Frame(self, bg="#ffffff", padx=25, pady=25)

        f.pack(fill="both", expand=True)

        self.current_frame = f



        # Status Pill at top

        f_pill = tk.Frame(f, bg="#ecfdf5", padx=10, pady=4, bd=1, relief="solid")

        f_pill.pack(anchor="w", pady=(0, 12))

        tk.Label(f_pill, text="● ACTIVE & RUNNING", font=("Segoe UI", 8, "bold"), bg="#ecfdf5", fg="#059669").pack()



        # Big Title: "App is running"

        tk.Label(f, text="App is running", font=("Segoe UI", 20, "bold"), bg="#ffffff", fg="#0f172a").pack(anchor="w")

        tk.Label(f, text="Workstation is actively monitored under enterprise policy.", font=("Segoe UI", 9), bg="#ffffff", fg="#64748b").pack(anchor="w", pady=(2, 16))



        # Details Box

        box = tk.Frame(f, bg="#f8fafc", bd=1, relief="solid", padx=15, pady=12)

        box.pack(fill="x", pady=(0, 20))



        emp_name = APP_STATE.get("employee_name") or USERNAME

        emp_id = APP_STATE.get("employee_id") or "EMP-2041"

        emp_dept = APP_STATE.get("department") or CONFIG.get("department", "Technology")



        rows = [

            ("Employee:", emp_name),

            ("Employee ID:", emp_id),

            ("Department:", emp_dept),

            ("Workstation:", HOSTNAME),

            ("Protection:", "Active Sentinel (Surveillance)")

        ]



        for lbl, val in rows:

            r = tk.Frame(box, bg="#f8fafc")

            r.pack(fill="x", pady=2)

            tk.Label(r, text=f"{lbl:<14}", font=("Segoe UI", 8, "bold"), bg="#f8fafc", fg="#64748b", width=14, anchor="w").pack(side="left")

            col = "#059669" if lbl == "Protection:" else "#0f172a"

            tk.Label(r, text=val, font=("Segoe UI", 8, "bold"), bg="#f8fafc", fg=col, anchor="w").pack(side="left")



        # Minimize Button

        btn_min = tk.Button(

            f,

            text="Minimize to Taskbar",

            font=("Segoe UI", 9, "bold"),

            bg="#0f172a",

            fg="#ffffff",

            activebackground="#1e293b",

            activeforeground="#ffffff",

            bd=0,

            pady=9,

            cursor="hand2",

            command=self.iconify

        )

        btn_min.pack(fill="x")



        lbl_info = tk.Label(

            f,

            text="The app stays active in the taskbar. Nothing else is required.",

            font=("Segoe UI", 8),

            bg="#ffffff",

            fg="#94a3b8"

        )

        lbl_info.pack(pady=(12, 0))



    # ------------------ SETTINGS DIALOG (HUB CONFIG) ------------------

    def show_settings_dialog(self):

        s_win = tk.Toplevel(self)

        s_win.title("Hub Network Settings")

        s_win.geometry("400x300")

        s_win.resizable(False, False)

        s_win.configure(bg="#ffffff")

        s_win.transient(self)

        s_win.grab_set()



        tk.Label(s_win, text="Hub Server Configuration", font=("Segoe UI", 12, "bold"), bg="#ffffff", fg="#0f172a").pack(pady=(15, 10))



        # Host

        f_h = tk.Frame(s_win, bg="#ffffff")

        f_h.pack(fill="x", padx=30, pady=4)

        tk.Label(f_h, text="Server IP / Hostname:", font=("Segoe UI", 9), bg="#ffffff", fg="#475569").pack(anchor="w")

        ent_host = tk.Entry(f_h, font=("Segoe UI", 10), bg="#f8fafc", fg="#0f172a", bd=1)

        ent_host.pack(fill="x", pady=2)

        ent_host.insert(0, str(CONFIG.get("server_host", "127.0.0.1")))



        # Port

        f_p = tk.Frame(s_win, bg="#ffffff")

        f_p.pack(fill="x", padx=30, pady=4)

        tk.Label(f_p, text="Server Port:", font=("Segoe UI", 9), bg="#ffffff", fg="#475569").pack(anchor="w")

        ent_port = tk.Entry(f_p, font=("Segoe UI", 10), bg="#f8fafc", fg="#0f172a", bd=1)

        ent_port.pack(fill="x", pady=2)

        ent_port.insert(0, str(CONFIG.get("server_port", 8000)))



        def _save():

            try:

                CONFIG["server_host"] = ent_host.get().strip()

                CONFIG["server_port"] = int(ent_port.get().strip())

                save_config(CONFIG)

                messagebox.showinfo("Saved", "Settings saved successfully! Generating new session...", parent=s_win)

                s_win.destroy()

                self.create_or_refresh_session()

            except Exception as ex:

                messagebox.showerror("Error", f"Invalid input: {ex}", parent=s_win)



        btn_save = tk.Button(s_win, text="Save Settings", font=("Segoe UI", 9, "bold"), bg="#059669", fg="#ffffff", bd=0, pady=8, cursor="hand2", command=_save)

        btn_save.pack(fill="x", padx=30, pady=20)



    def on_minimize_or_close(self):

        if self.is_running_view or self.paired:

            self.iconify()

        else:

            self.destroy()





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



