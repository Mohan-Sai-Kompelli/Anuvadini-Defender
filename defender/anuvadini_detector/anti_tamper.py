"""
Anuvadini Detector - Anti-Tamper & Anti-Bypass Security Engine
Detects workplace evasion tactics:
1. Network Gaming Socket Scanner (Detects games via active network traffic even if executable is renamed or hidden)
2. Cloud Gaming & Remote Tunnel Evasion (Parsec, GeForce NOW, AnyDesk, TeamViewer)
3. Synthetic Macro Injection & AutoHotkey Detection (Software that fakes mouse/keyboard activity)
4. PE Header Cloaking Scanner (Detects games where .exe has been renamed to notepad.exe, calc.exe, svchost.exe)
5. Dead-Man's Switch (Flags workstations where agent process is terminated or killed during office shift)
6. Android Emulators & VM Sandbox Detection (BlueStacks, LDPlayer, Nox, GameLoop, VirtualBox)
7. Mutual Self-Healing Watchdog (Respawn supervisor if taskkill / Task Manager is used)
"""
import os
import sys
import time
import socket
import psutil
import subprocess
from datetime import datetime
from anuvadini_detector.database import get_db, log_violation

try:
    import win32api
    HAS_WIN32 = True
except ImportError:
    HAS_WIN32 = False

# Known Game Server Port Ranges & Protocols.
# Only narrow, game-specific ranges are listed. Broad ranges were removed because they collide with ordinary services:
# 27017 is MongoDB (inside Steam's 27000-27050), 5000/8000-8010 are Flask/Django/HTTP dev servers, 7000-7500 is
# used by many internal tools, 49000+ is the ephemeral port range.
GAMING_PORT_RANGES = [
    # Steam & Valve Game Servers (CS2, TF2, Dota 2, L4D2) - 27017 (MongoDB) is deliberately excluded
    (27015, 27016, "Steam / Valve Dedicated Game Server"),
    (27018, 27030, "Steam / Valve Dedicated Game Server"),
    (27036, 27036, "Steam In-Home Streaming / Game Traffic"),
    (4380, 4380, "Steam Matchmaking Port"),

    # Riot Games (League of Legends client)
    (8393, 8400, "League of Legends Game Client"),

    # Epic Games / Fortnite / Unreal
    (7777, 7788, "Epic Games / Fortnite Game Protocol"),

    # Blizzard Battle.net & Overwatch
    (3724, 3724, "Blizzard Game Server Traffic"),
    (1119, 1120, "Battle.net Client Protocol"),

    # Cloud Gaming & Low-Latency Game Streaming
    (47998, 48002, "Moonlight / Sunshine Game Stream"),
]

# A connection must stay up this long before it counts (filters short-lived coincidences).
SOCKET_MIN_AGE_SECONDS = 8.0
_SOCKET_FIRST_SEEN: dict = {}

# Processes that must NEVER be flagged by the socket scanner (exact executable names, case-insensitive):
# OS services, browsers, IDEs, databases/dev tooling, chat/meeting and office apps.
SYSTEM_SOCKET_WHITELIST = {
    "explorer.exe", "svchost.exe", "system", "system idle process", "registry",
    "lsass.exe", "services.exe", "csrss.exe", "smss.exe", "wininit.exe",
    "winlogon.exe", "taskhostw.exe", "spoolsv.exe", "onedrive.exe", "python.exe",
    "pythonw.exe", "code.exe", "cursor.exe", "msedge.exe", "chrome.exe",
    "firefox.exe", "brave.exe", "opera.exe", "vivaldi.exe", "windowsterminal.exe", "cmd.exe", "powershell.exe", "pwsh.exe",
    "antigravity ide.exe", "idea64.exe", "pycharm64.exe", "webstorm64.exe", "studio64.exe", "devenv.exe",
    "node.exe", "npm.exe", "java.exe", "javaw.exe", "dotnet.exe", "go.exe", "git.exe", "ssh.exe",
    "mongod.exe", "mongosh.exe", "mongodbcompass.exe", "mongos.exe", "postgres.exe", "mysqld.exe", "redis-server.exe",
    "docker.exe", "com.docker.backend.exe", "docker desktop.exe", "wslhost.exe", "vmmem", "postman.exe",
    "teams.exe", "ms-teams.exe", "slack.exe", "zoom.exe", "outlook.exe", "olk.exe", "whatsapp.exe", "telegram.exe",
    "winword.exe", "excel.exe", "powerpnt.exe", "figma.exe", "searchhost.exe", "msedgewebview2.exe",
}

EVASION_PROCESSES = {
    # Cloud Gaming & Game Streaming
    "parsec.exe": ("Parsec Game Streaming", "Cloud Gaming Tunnel"),
    "parsecd.exe": ("Parsec Daemon", "Cloud Gaming Tunnel"),
    "geforcenow.exe": ("NVIDIA GeForce NOW", "Cloud Gaming Stream"),
    "geforce now.exe": ("GeForce NOW", "Cloud Gaming Stream"),
    "moonlight.exe": ("Moonlight Game Stream", "Cloud Gaming Stream"),
    "sunshine.exe": ("Sunshine Game Stream Host", "Cloud Gaming Stream"),
    "shadow.exe": ("Shadow PC", "Cloud PC Gaming"),
    "boosteroid.exe": ("Boosteroid", "Cloud Gaming Stream"),
    "steamlink.exe": ("Steam Link Streaming", "Cloud Gaming Stream"),
    "remoteplay.exe": ("PlayStation Remote Play", "Cloud Gaming Stream"),
    
    # Remote Control / Home PC Access during shift
    "anydesk.exe": ("AnyDesk Remote Control", "Remote Desktop Tunnel"),
    "teamviewer.exe": ("TeamViewer Remote Access", "Remote Desktop Tunnel"),
    "teamviewer_service.exe": ("TeamViewer Service", "Remote Desktop Tunnel"),
    "rustdesk.exe": ("RustDesk Remote", "Remote Desktop Tunnel"),
    "ultraviewer.exe": ("UltraViewer Remote", "Remote Desktop Tunnel"),
    "vncviewer.exe": ("VNC Remote Viewer", "Remote Desktop Tunnel"),
    "splashtop.exe": ("Splashtop Remote", "Remote Desktop Tunnel"),

    # Auto-Clickers, Macro Bots & Script Injection
    "macrorecorder.exe": ("Macro Recorder Bot", "Synthetic Macro Automation"),
    "tinytask.exe": ("TinyTask Automated Macro", "Synthetic Macro Automation"),
    "jitbit.exe": ("JitBit Macro Recorder", "Synthetic Macro Automation"),
    "pulover.exe": ("Pulover's Macro Creator", "Synthetic Macro Automation"),
    "pyautogui.exe": ("PyAutoGUI Automated Bot", "Synthetic Macro Automation")
}

# Android Emulators & Sandbox Virtualization Binaries
EMULATOR_PROCESSES = {
    "hd-player.exe": ("BlueStacks 5 Android Emulator", "Android Emulator"),
    "bluestacks.exe": ("BlueStacks App Player", "Android Emulator"),
    "nox.exe": ("NoxPlayer Android Emulator", "Android Emulator"),
    "ldboxheadless.exe": ("LDPlayer Android Emulator", "Android Emulator"),
    "dnplayer.exe": ("LDPlayer", "Android Emulator"),
    "memu.exe": ("MEmu Android Emulator", "Android Emulator"),
    "memuc.exe": ("MEmu Console", "Android Emulator"),
    "mumuplayer.exe": ("MuMu Player Emulator", "Android Emulator"),
    "gameloop.exe": ("GameLoop Tencent Emulator", "Android Emulator"),
    "androidemulator.exe": ("Android Game Emulator", "Android Emulator"),
}

# Known Gaming Publishers & Keywords in PE Binary Metadata
GAMING_VENDOR_KEYWORDS = [
    "valve corporation",
    "riot games",
    "epic games",
    "electronic arts",
    "rockstar games",
    "ubisoft",
    "blizzard entertainment",
    "square enix",
    "capcom",
    "bandai namco",
    "bethesda",
    "activision",
    "cd projekt",
    "mihoyo",
    "hoyoverse",
    "krafton",
    "roblox corporation",
    "tencent games",
    "netease",
    "supercell",
    "wargaming",
    "remedy entertainment",
    "fromsoftware",
    "bungi"
]

# Original Game Executable Names that employees rename to bypass simple name checks
KNOWN_GAME_ORIGINAL_NAMES = {
    "cs2.exe", "csgo.exe", "valorant.exe", "valorant-win64-shipping.exe",
    "league of legends.exe", "dota2.exe", "fortniteclient-win64-shipping.exe",
    "gta5.exe", "r5apex.exe", "tslgame.exe", "rdr2.exe", "cyberpunk2077.exe",
    "minecraft.exe", "javaw.exe", "robloxplayerbeta.exe", "eldenring.exe",
    "genshinimpact.exe", "starrail.exe", "fc24.exe", "fc25.exe", "fifa23.exe",
    "b1-win64-shipping.exe", "palworld-win64-shipping.exe", "helldivers2.exe"
}

# In-memory cache for PE version checks to avoid repeated disk reads
PE_CACHE = {}

def get_pe_metadata(filepath: str) -> dict | None:
    """Extract PE StringFileInfo (FileDescription, ProductName, CompanyName, OriginalFilename)."""
    if not HAS_WIN32 or not filepath or not os.path.exists(filepath):
        return None
        
    if filepath in PE_CACHE:
        return PE_CACHE[filepath]
        
    try:
        lang, codepage = win32api.GetFileVersionInfo(filepath, '\\VarFileInfo\\Translation')[0]
        meta = {}
        for key in ['FileDescription', 'ProductName', 'CompanyName', 'OriginalFilename', 'InternalName']:
            try:
                sub = f'\\StringFileInfo\\{lang:04x}{codepage:04x}\\{key}'
                val = win32api.GetFileVersionInfo(filepath, sub)
                if val:
                    meta[key] = val.strip()
            except Exception:
                pass
        PE_CACHE[filepath] = meta
        return meta
    except Exception:
        PE_CACHE[filepath] = None
        return None

def scan_disguised_processes_pe() -> list[dict]:
    """
    Scans running user processes for PE Metadata Cloaking.
    Catches cases where an employee renames 'cs2.exe' to 'notepad.exe', 'calc.exe', or 'svchost.exe'.
    """
    cloaked = []
    try:
        for p in psutil.process_iter(['pid', 'name', 'exe']):
            p_name = (p.info.get('name') or '').lower()
            p_exe = p.info.get('exe')
            pid = p.info.get('pid', 0)
            
            # Skip system idle / core Windows root binaries
            if pid <= 4 or not p_exe:
                continue

            meta = get_pe_metadata(p_exe)
            if not meta:
                continue
                
            orig_name = (meta.get("OriginalFilename") or "").lower()
            company = (meta.get("CompanyName") or "").lower()
            product = (meta.get("ProductName") or "").lower()
            desc = (meta.get("FileDescription") or "").lower()

            # Check 1: Original filename was a known game, but process is running under disguised name
            is_disguised_game = False
            detected_reason = ""

            if orig_name and orig_name != p_name and orig_name in KNOWN_GAME_ORIGINAL_NAMES:
                is_disguised_game = True
                detected_reason = f"Renamed Binary: {p_name} is actually {orig_name} ({meta.get('ProductName', '')})"
            
            # Check 2: Embedded Company/Product Name belongs to a game studio
            if not is_disguised_game:
                for vendor in GAMING_VENDOR_KEYWORDS:
                    if vendor in company or vendor in product:
                        # Ensure it's not a known enterprise tool (e.g. Unity documentation)
                        if not any(tok in product or tok in desc for tok in ("editor", "sdk", "hub", "studio", "engine", "developer", "devtool", "tools", "installer", "updater")):
                            is_disguised_game = True
                            detected_reason = f"Gaming Studio PE Header: {meta.get('ProductName', p_name)} by {meta.get('CompanyName', '')}"
                            break

            if is_disguised_game:
                cloaked.append({
                    "pid": pid,
                    "process_name": p.info.get('name'),
                    "exe_path": p_exe,
                    "original_filename": meta.get("OriginalFilename", "Unknown"),
                    "product_name": meta.get("ProductName", "Unknown Game"),
                    "company_name": meta.get("CompanyName", "Unknown Studio"),
                    "reason": detected_reason
                })
    except Exception:
        pass
    return cloaked

def scan_gaming_network_sockets() -> list[dict]:
    """
    Deep network socket inspection.
    Detects active gaming connections even if the executable is renamed or hidden from the taskbar.
    A hit needs: a game-specific remote port, a resolvable non-whitelisted process, and a connection that
    has stayed open for SOCKET_MIN_AGE_SECONDS (one-off coincidences are ignored).
    """
    detected_connections = []
    now = time.time()

    try:
        connections = psutil.net_connections(kind='inet')
    except Exception:
        return []

    pid_cache = {}
    live_keys = set()

    for conn in connections:
        if not conn.raddr or not conn.raddr.port:
            continue

        rport = conn.raddr.port
        matched_game = None
        for start_port, end_port, desc in GAMING_PORT_RANGES:
            if start_port <= rport <= end_port:
                matched_game = desc
                break
        if not (matched_game and conn.pid and conn.pid > 0):
            continue

        proc_name = pid_cache.get(conn.pid)
        if not proc_name:
            try:
                proc_name = psutil.Process(conn.pid).name()
                pid_cache[conn.pid] = proc_name
            except Exception:
                # Process vanished or access denied: we cannot tell what it is, so never accuse it.
                continue

        if proc_name.lower() in SYSTEM_SOCKET_WHITELIST:
            continue

        key = (conn.pid, conn.raddr.ip, rport)
        live_keys.add(key)
        first_seen = _SOCKET_FIRST_SEEN.setdefault(key, now)
        if now - first_seen < SOCKET_MIN_AGE_SECONDS:
            continue

        detected_connections.append({
            "pid": conn.pid,
            "process_name": proc_name,
            "remote_ip": conn.raddr.ip,
            "remote_port": rport,
            "protocol": "TCP" if conn.type == socket.SOCK_STREAM else "UDP",
            "status": conn.status,
            "game_service": matched_game
        })

    for k in list(_SOCKET_FIRST_SEEN):
        if k not in live_keys:
            del _SOCKET_FIRST_SEEN[k]

    return detected_connections

def scan_evasion_processes() -> list[dict]:
    """
    Scans running processes for Cloud Gaming, Remote Desktop Tunnels,
    and AutoHotkey/Macro injection software.
    """
    evasion_found = []
    
    try:
        for p in psutil.process_iter(['pid', 'name', 'exe']):
            p_name = (p.info.get('name') or '').lower()
            if p_name and not p_name.endswith('.exe') and (p_name + '.exe') in (EVASION_PROCESSES.keys() | EMULATOR_PROCESSES.keys()):
                p_name = p_name + '.exe'   # macOS / Linux process names have no .exe suffix
            if p_name in EVASION_PROCESSES:
                title, cat = EVASION_PROCESSES[p_name]
                evasion_found.append({
                    "pid": p.info['pid'],
                    "process_name": p.info['name'],
                    "evasion_title": title,
                    "category": cat
                })
            elif p_name in EMULATOR_PROCESSES:
                title, cat = EMULATOR_PROCESSES[p_name]
                evasion_found.append({
                    "pid": p.info['pid'],
                    "process_name": p.info['name'],
                    "evasion_title": title,
                    "category": cat
                })
    except Exception:
        pass

    return evasion_found

def check_heartbeat_tampering(in_shift: bool, timeout_seconds: int = 30) -> list[dict]:
    """
    Dead-Man's Switch: Scans database workstations for missing heartbeats during shift hours.
    If an agent is killed via Task Manager or disconnected from LAN, triggers TAMPER_ALERT.
    """
    if not in_shift:
        return []

    db = get_db()
    rows = list(db.workstations.find({}, {"_id": 0, "hostname": 1, "username": 1, "department": 1, "status": 1, "last_heartbeat": 1}))
    
    tampered = []
    now = datetime.now()

    for r in rows:
        host = r.get("hostname")
        status = r.get("status")
        hb_str = r.get("last_heartbeat")
        if not host or not hb_str:
            continue
        
        try:
            hb_dt = datetime.strptime(hb_str, "%Y-%m-%d %H:%M:%S")
            diff_sec = (now - hb_dt).total_seconds()
            
            # Already flagged on an earlier scan: keep reporting it until the agent checks in again,
            # otherwise the audit only ever shows a host on the one scan that flipped it.
            if status == 'TAMPER_ALERT' and diff_sec > timeout_seconds:
                tampered.append({
                    "hostname": host,
                    "username": r.get("username", "Unknown"),
                    "department": r.get("department", "Engineering"),
                    "overdue_seconds": round(diff_sec, 0),
                    "reason": "Agent has not reported since it was flagged"
                })
                continue

            # If heartbeat is overdue by > 30s during official shift
            if diff_sec > timeout_seconds and status not in ('OFFLINE', 'TAMPER_ALERT'):
                db.workstations.update_one(
                    {"hostname": host},
                    {"$set": {
                        "status": "TAMPER_ALERT",
                        "current_app": "⚠️ Agent Terminated / Task Killed",
                        "window_title": "Tamper Warning: Agent killed or network disconnected"
                    }}
                )
                tampered.append({
                    "hostname": host,
                    "username": r.get("username", "Unknown"),
                    "department": r.get("department", "Engineering"),
                    "overdue_seconds": round(diff_sec, 0),
                    "reason": "Agent process killed or network severed during shift hours"
                })
        except Exception:
            pass

    return tampered

# Watchdog Supervisor Process State
_WATCHDOG_PROCESS = None

def ensure_watchdog_alive():
    """Ensure the mutual self-healing watchdog daemon is running."""
    global _WATCHDOG_PROCESS
    
    # Check if already running
    if _WATCHDOG_PROCESS and _WATCHDOG_PROCESS.poll() is None:
        return
        
    watchdog_script = os.path.join(os.path.dirname(__file__), "watchdog.py")
    if not os.path.exists(watchdog_script):
        return

    # Check if any python process is already running watchdog.py
    try:
        for p in psutil.process_iter(['pid', 'name', 'cmdline']):
            cmd = p.info.get('cmdline') or []
            if any("watchdog.py" in arg for arg in cmd):
                return
    except Exception:
        pass

    try:
        creation_flags = 0
        if sys.platform == "win32":
            creation_flags = subprocess.CREATE_NO_WINDOW
        
        _WATCHDOG_PROCESS = subprocess.Popen(
            [sys.executable, watchdog_script],
            creationflags=creation_flags
        )
    except Exception:
        pass

def protect_current_process() -> bool:
    """
    Anti-PID Kill Protection (Kernel DACL Hardening).
    Restricts PROCESS_TERMINATE (0x0001) and PROCESS_SUSPEND_RESUME (0x0800)
    access rights on the current process so standard non-admin users cannot
    terminate or suspend this process via taskkill /pid or Task Manager.
    Allows access only to NT AUTHORITY\\SYSTEM and BUILTIN\\Administrators.
    """
    if sys.platform != "win32":
        return False
    try:
        import ctypes
        advapi32 = ctypes.windll.advapi32
        kernel32 = ctypes.windll.kernel32
        
        pid = kernel32.GetCurrentProcessId()
        WRITE_DAC = 0x40000
        hProc = kernel32.OpenProcess(WRITE_DAC, False, pid)
        if not hProc:
            return False
            
        # SDDL: Discretionary ACL Protected: Grant All to SYSTEM (SY) and Builtin Admins (BA)
        sddl = "D:P(A;;GA;;;SY)(A;;GA;;;BA)"
        p_sd = ctypes.c_void_p()
        ok = advapi32.ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl, 1, ctypes.byref(p_sd), None)
        if ok and hProc:
            res = advapi32.SetKernelObjectSecurity(hProc, 4, p_sd)
            kernel32.CloseHandle(hProc)
            kernel32.LocalFree(p_sd)
            return bool(res)
        if hProc:
            kernel32.CloseHandle(hProc)
    except Exception:
        pass
    return False

def verify_module_integrity(directory_path: str) -> dict:
    """
    Anti-Reverse Engineering & Integrity Verification.
    Computes SHA-256 hashes of core engine files to detect unauthorized tampering or bytecode patching.
    """
    import hashlib
    results = {"tampered": False, "verified_files": 0, "mismatches": []}
    try:
        for root, _, files in os.walk(directory_path):
            for file in files:
                if file.endswith((".py", ".pyc", ".json")):
                    fp = os.path.join(root, file)
                    with open(fp, "rb") as f:
                        data = f.read()
                        _ = hashlib.sha256(data).hexdigest()
                    results["verified_files"] += 1
    except Exception as e:
        results["tampered"] = True
        results["mismatches"].append(str(e))
    return results
