"""
Anuvadini Detector - Enterprise Workstation Client Agent
Runs silently on employee workstations (50-500+ PCs).
Connects to Central Management Server, reports active windows & anti-tamper telemetry,
and listens for remote IT actions (warning popups, process kills).
"""

import sys
import os
import time
import socket
import argparse
import urllib.request
import urllib.parse
import json
import threading
import base64
import io
from datetime import datetime

# Employee PCs have no database: tell the shared modules (firewall, ...) to use the central server instead.
os.environ["ANUVADINI_AGENT_MODE"] = "1"

# Base directory setup
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from anuvadini_detector.watcher import get_active_window, get_visible_windows
from anuvadini_detector.afk import get_idle_seconds
from anuvadini_detector.controller import is_controller_connected
from anuvadini_detector.enforcer import trigger_warning_popup, kill_process_by_pid, play_alert_chime, lock_workstation
from anuvadini_detector.heuristics import analyze_cursor_movement
from anuvadini_detector.evidence import capture_screen_universal, capture_violation_screenshot
from anuvadini_detector.config import (
    EVIDENCE_DIR,
    AUTO_STOP_AT_SHIFT_END,
    SCHEDULE_ENABLED,
    SHIFT_START_TIME,
    SHIFT_END_TIME,
    WORKING_DAYS,
    OVERRIDE_SCHEDULE,
)
from anuvadini_detector import duty, pairing_status
from anuvadini_detector.anti_tamper import (
    scan_gaming_network_sockets,
    scan_evasion_processes,
    scan_disguised_processes_pe,
    ensure_watchdog_alive,
    protect_current_process
)
from anuvadini_detector.signatures import check_process_signature, check_window_title_signature, PRODUCTIVITY_WHITELIST, FULLSCREEN_HEURISTIC_EXEMPT, is_productivity_process
from anuvadini_detector.firewall import firewall_engine

# Enterprise Configuration Paths
PROGRAMDATA_CONFIG = r"C:\ProgramData\AnuvadiniDetector\agent_config.json"
LOCAL_CONFIG = os.path.join(BASE_DIR, "agent_config.json")

def upload_screen_frame(server_url: str, hostname: str, employee_id: str):
    """Captures and uploads a lightweight compressed JPEG frame for Live Screen Wall."""
    try:
        img = capture_screen_universal()
        if not img:
            return
        img.thumbnail((480, 270))  # smaller res = less RAM & CPU
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=40, optimize=True)
        b64 = base64.b64encode(buf.getvalue()).decode('utf-8')

        url = f"{server_url.rstrip('/')}/api/fleet/stream-frame"
        data = json.dumps({"hostname": hostname, "employee_id": employee_id, "frame_b64": b64}).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=4) as resp:
            pass
    except Exception:
        pass

_frame_uploading = False

def screen_streaming_worker(server_url: str, hostname: str, employee_id: str):
    """Background streaming thread: uploads one frame every 20s — passive, low-impact monitoring."""
    global _frame_uploading
    while True:
        try:
            if MONITORING_PAUSED:
                time.sleep(5.0)
                continue
            if not _frame_uploading:
                _frame_uploading = True
                try:
                    upload_screen_frame(server_url, hostname, employee_id)
                finally:
                    _frame_uploading = False
            time.sleep(20.0)  # 20s — enough for live wall, not enough to strain the PC
        except Exception:
            time.sleep(30.0)

# Custom rules pushed by the central server (rule_type: "process" | "keyword")
AGENT_CUSTOM_RULES: list = []

def _http_json(url: str, data: dict | None = None, timeout: float = 5.0):
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))

def policy_sync_worker(server_url: str, employee_id: str = "", department: str = ""):
    """Pulls enforcement policy, firewall blocklist and custom rules from the central server every 10s.
    The server filters the blocklist to this PC's employee / department (all / department / employee rules)."""
    base = server_url.rstrip("/")
    query = urllib.parse.urlencode({"employee_id": employee_id, "department": department})
    last_rules = None
    while True:
        try:
            pol = _http_json(f"{base}/api/fleet/policy?{query}")
            AGENT_POLICY.update({k: pol[k] for k in ("enforce", "show_popup", "play_sound", "auto_kill") if k in pol})
            firewall_engine.remote_enabled = bool(pol.get("firewall_enabled", True))
            firewall_engine.remote_rules = pol.get("firewall_rules", [])
            firewall_engine.remote_exemptions = pol.get("firewall_exemptions", [])
            AGENT_CUSTOM_RULES[:] = pol.get("custom_rules", [])
            # Re-apply the hosts-file sinkhole only when this PC's blocklist actually changed.
            rules_key = json.dumps(firewall_engine.remote_rules, sort_keys=True) + str(firewall_engine.remote_enabled)
            if rules_key != last_rules:
                firewall_engine.sync_hosts_sinkhole()
                last_rules = rules_key
        except Exception:
            pass
        time.sleep(10)

def match_custom_rule(proc_name: str, win_title: str, pid: int):
    p, t = (proc_name or "").lower(), (win_title or "").lower()
    for r in AGENT_CUSTOM_RULES:
        pat = (r.get("pattern") or "").lower().strip()
        if not pat:
            continue
        if (r.get("rule_type") == "process" and pat in p) or (r.get("rule_type") == "keyword" and pat in t):
            return {"game_name": r.get("label") or pat, "category": r.get("category") or "Custom Rule", "severity": "HIGH",
                    "process_name": proc_name, "pid": pid, "window_title": win_title}
    return None

# Latest enforcement policy from the central server. Starts disabled so nothing is enforced until the server
# confirms we are inside office hours (the server sends enforce=False outside shift / during lunch).
AGENT_POLICY = {"enforce": False}

# Set by pairing_state_worker: True after the employee checks out, False after check-in.
# While paused the agent stays alive (watchdog/DACL intact) but stops heartbeats,
# anti-tamper scans, screen frames and firewall interception.
MONITORING_PAUSED = False


def pairing_state_worker(node_url: str, agent_token: str):
    """Poll the node backend for this PC's duty state (checkout pause / check-in resume)."""
    global MONITORING_PAUSED
    url = f"{node_url.rstrip('/')}/defender-pair/agent-status"
    while True:
        try:
            req = urllib.request.Request(
                url, headers={"Authorization": f"Bearer {agent_token}"}
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            paused = bool(data.get("monitoring_paused"))
            if paused != MONITORING_PAUSED:
                MONITORING_PAUSED = paused
                print(
                    "[Defender] Monitoring "
                    + ("PAUSED (employee checked out)." if paused else "RESUMED (employee checked in).")
                )
        except Exception:
            pass
        time.sleep(15.0)


def website_firewall_worker(hostname: str, username: str, employee_id: str):
    """Real-time active tab & website blocker: intercepts gambling, adult, and game portals at 500ms intervals."""
    while True:
        if MONITORING_PAUSED or not AGENT_POLICY.get("enforce", False):
            time.sleep(5.0)
            continue
        try:
            win = get_active_window()
            w_title = win.get("title", "")
            w_proc = win.get("process_name", "")
            w_pid = win.get("pid", 0)
            w_hwnd = win.get("hwnd", 0)

            if w_title:
                fw_match = firewall_engine.check_window_interceptor(w_title, w_proc, w_pid, w_hwnd)
                if fw_match:
                    firewall_engine.enforce_silent_intercept(
                        fw_match,
                        hostname=hostname,
                        username=username,
                        employee_id=employee_id,
                        show_popup=AGENT_POLICY.get("show_popup", True)
                    )
        except Exception:
            pass
        time.sleep(3.0)  # was 0.5 — 3s is still fast enough for realtime blocking

VIOLATION_DEBOUNCE_SECONDS = 15.0
# The warning popup for one app is shown at most once per this many seconds (the incident is still logged).
POPUP_COOLDOWN_SECONDS = 300.0
_last_popup: dict[str, float] = {}

def detect_violation(proc_name, win_title, pid, is_fs, ctrl, sig, sockets, evasions, cloaked, jiggler):
    """Agent-side detection, same priority order as the central engine. Returns a violation dict or None."""
    custom = match_custom_rule(proc_name, win_title, pid)
    if custom:
        return custom
    if sig:
        return {"game_name": sig["name"], "category": sig["category"], "severity": sig.get("severity", "HIGH"),
                "process_name": proc_name, "pid": pid, "window_title": win_title}
    if is_fs and ctrl.get("connected") and proc_name.lower() not in FULLSCREEN_HEURISTIC_EXEMPT:
        return {"game_name": f"Unknown Game ({proc_name})", "category": "Gamepad Gaming (Heuristic)",
                "severity": "HIGH", "process_name": proc_name, "pid": pid, "window_title": win_title}
    try:
        for vw in get_visible_windows():
            v_proc = vw.get("process_name", "")
            if is_productivity_process(v_proc):
                continue
            bg = check_process_signature(v_proc) or check_window_title_signature(vw.get("title", ""))
            if bg:
                return {"game_name": bg["name"], "category": bg["category"], "severity": bg.get("severity", "HIGH"),
                        "process_name": v_proc, "pid": vw.get("pid", 0), "window_title": vw.get("title", "")}
    except Exception:
        pass
    if evasions:
        ev = evasions[0]
        return {"game_name": ev["evasion_title"], "category": ev["category"], "severity": "HIGH",
                "process_name": ev["process_name"], "pid": ev["pid"], "window_title": win_title}
    if sockets:
        ns = sockets[0]
        return {"game_name": f"Stealth Game: {ns['game_service']}", "category": "Network Gaming Traffic (Renamed Executable)",
                "severity": "HIGH", "process_name": ns["process_name"], "pid": ns["pid"], "window_title": win_title}
    if cloaked:
        cp = cloaked[0]
        return {"game_name": f"Cloaked Game: {cp['product_name']}", "category": "Disguised Executable (PE Cloaking)",
                "severity": "HIGH", "process_name": cp["process_name"], "pid": cp["pid"], "window_title": win_title}
    if jiggler.get("is_synthetic"):
        return {"game_name": f"Synthetic AFK Bot ({jiggler.get('reason', 'Jiggler')})",
                "category": "Anti-AFK Bypass / Synthetic Movement", "severity": "HIGH",
                "process_name": proc_name, "pid": pid, "window_title": win_title}
    return None

def capture_evidence_b64(game_name: str, win_title: str) -> str | None:
    """Capture a watermarked screenshot, return it base64-encoded and remove the local copy."""
    filename = capture_violation_screenshot(str(int(time.time())), game_name, win_title)
    if not filename:
        return None
    path = EVIDENCE_DIR / filename
    try:
        return base64.b64encode(path.read_bytes()).decode("utf-8")
    except Exception:
        return None
    finally:
        try:
            path.unlink()
        except Exception:
            pass

def load_agent_config() -> dict:
    for path in [LOCAL_CONFIG, PROGRAMDATA_CONFIG]:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    if cfg.get("employee_id") != "EMP-TEST-99":
                        return cfg
            except Exception:
                pass
    return {}

def get_client_info():
    hostname = socket.gethostname()
    username = os.getlogin() if hasattr(os, "getlogin") else os.environ.get("USERNAME", "Employee")
    
    # Get local IP
    ip = "127.0.0.1"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
    except Exception:
        pass
        
    return hostname, username, ip

def send_heartbeat(server_url: str, payload: dict) -> dict:
    url = f"{server_url.rstrip('/')}/api/fleet/heartbeat"
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=5) as response:
        return json.loads(response.read().decode('utf-8'))

def run_agent(server_url: str = None, department: str = None, employee_id: str = None):
    global MONITORING_PAUSED
    started_at = datetime.now()
    # Load persisted config if available
    saved_cfg = load_agent_config()
    server_url = server_url or saved_cfg.get("server_url", "https://defender.anuvadiniturn.com")
    node_url = saved_cfg.get("node_url", "")
    agent_token = saved_cfg.get("agent_token", "")
    department = department or saved_cfg.get("department", "Engineering")
    employee_id = employee_id or saved_cfg.get("employee_id", "EMP-001")
    custom_username = saved_cfg.get("username")

    hostname, detected_username, ip = get_client_info()
    username = custom_username or detected_username

    print("=" * 65)
    print(f"  ANUVADINI DETECTOR CLIENT AGENT (v2.0 Enterprise)")
    print(f"  Workstation: {hostname} | IP: {ip}")
    print(f"  Employee ID: {employee_id} | Name: {username}")
    print(f"  Department:  {department}")
    print(f"  Central Svr: {server_url}")
    print(f"  Anti-Bypass: ACTIVE (PE Cloaking, Sockets, Watchdog, Evasion)")
    print("=" * 65)

    # 1. Anti-PID Kill Protection (Win32 Kernel DACL Hardening)
    try:
        protected = protect_current_process()
        if protected:
            print("[Anti-Tamper] Kernel DACL Hardening Applied (taskkill /pid blocked).")
        else:
            print("[Anti-Tamper] Standard process rights (Admin required for DACL).")
    except Exception as e:
        print(f"[Anti-Tamper] DACL Notice: {e}")

    # 2. Ensure self-healing watchdog supervisor is alive
    try:
        ensure_watchdog_alive()
        print("[Anti-Tamper] Mutual Watchdog supervisor registered successfully.")
    except Exception as e:
        print(f"[Anti-Tamper] Watchdog notice: {e}")

    # 2a. End-of-day stop: if the previous run stopped at shift end and the next
    # shift has not started yet, stay stopped. The watchdog reads the same state
    # file and brings the agent back at shift start (no logoff required).
    off_duty = duty.read_off_duty()
    snapshot = None
    if off_duty:
        snapshot = pairing_status.fetch_agent_status()
        shift_due = duty.resume_due(off_duty)
        early_checkin = (
            duty.early_wake_allowed(datetime.now(), off_duty, SHIFT_END_TIME)
            and pairing_status.checked_in_after_off_duty(snapshot, off_duty)
        )

        if early_checkin:
            duty.clear_off_duty()
            print("[Defender] Fresh check-in detected; resuming monitoring early.")
        elif shift_due and snapshot and snapshot.get("paused"):
            # The employee corrected attendance and is still checked out. The
            # watchdog will wait for their next check-in instead of starting.
            message = duty.off_duty_message(off_duty)
            print("[Defender] Shift start reached, but employee is still checked out; "
                  "waiting for check-in.")
            duty.log_event(f"Start kept off-duty: {message}; employee still checked out")
            firewall_engine.remove_hosts_sinkhole()
            return
        elif shift_due:
            duty.clear_off_duty()
            print("[Defender] Shift start reached; resuming monitoring.")
        else:
            message = duty.off_duty_message(off_duty)
            print(f"[Defender] Off duty: {message}. Agent will stay stopped until shift start.")
            duty.log_event(f"Start skipped: {message}")
            firewall_engine.remove_hosts_sinkhole()
            return

    # If this is a fresh start while the employee is already checked out, start
    # paused instead of monitoring for the first 15 seconds until the poller
    # catches up. Unknown/unreachable server keeps the previous behaviour.
    if snapshot is None and not off_duty:
        snapshot = pairing_status.fetch_agent_status()
    if snapshot is not None:
        MONITORING_PAUSED = bool(snapshot.get("paused"))

    # 2b. Duty-state poller: checkout pauses monitoring, check-in resumes it.
    if node_url and agent_token:
        threading.Thread(
            target=pairing_state_worker, args=(node_url, agent_token), daemon=True
        ).start()
        print("[Defender] Duty-state poller started (checkout pause / check-in resume).")
    else:
        print("[Defender] No node_url/agent_token in config — checkout pause disabled.")

    # Firewall incidents are reported to the central server (this PC has no database)
    firewall_engine.event_sink = lambda ev: threading.Thread(
        target=lambda: _http_json(f"{server_url.rstrip('/')}/api/fleet/firewall-event", ev), daemon=True).start()
    threading.Thread(target=policy_sync_worker, args=(server_url, employee_id, department), daemon=True).start()

    # 3. Start high-frequency live screen streaming reverse tunnel thread
    threading.Thread(target=screen_streaming_worker, args=(server_url, hostname, employee_id), daemon=True).start()

    # 4. Start instant real-time website and tab blocker (closes gambling, adult, and game sites within 500ms)
    firewall_engine.identity_host, firewall_engine.identity_emp = hostname, employee_id
    threading.Thread(target=website_firewall_worker, args=(hostname, username, employee_id), daemon=True).start()

    consecutive_errors = 0
    policy = {"enforce": True}
    last_key, last_sent = "", 0.0

    while True:
        try:
            # End-of-day rule: stop the agent process at the configured shift end
            # even if the employee never checks out or logs out of Windows. The
            # watchdog sees the state file and starts us again at shift start.
            if (AUTO_STOP_AT_SHIFT_END and SCHEDULE_ENABLED and not OVERRIDE_SCHEDULE
                    and duty.should_stop_at_shift_end(
                        datetime.now(), started_at, SHIFT_END_TIME, WORKING_DAYS
                    )):
                now = datetime.now()
                resume_at = duty.next_shift_start(now, SHIFT_START_TIME, WORKING_DAYS)
                duty.write_off_duty(resume_at, f"Shift ended at {SHIFT_END_TIME}")
                firewall_engine.remove_hosts_sinkhole()
                print(
                    f"[Defender] End of day ({SHIFT_END_TIME}): agent stopping; "
                    f"next start {resume_at:%Y-%m-%d %H:%M}."
                )
                return

            if MONITORING_PAUSED:
                time.sleep(5)
                continue
            active_win = get_active_window()
            idle_sec = get_idle_seconds()
            ctrl = is_controller_connected()
            proc_name = active_win.get("process_name", "unknown")
            win_title = active_win.get("title", "")
            pid = active_win.get("pid", 0)
            is_fs = active_win.get("is_fullscreen", False)

            # Local anti-tamper & heuristic scans
            sockets = scan_gaming_network_sockets()
            evasions = scan_evasion_processes()
            cloaked = scan_disguised_processes_pe()
            jiggler = analyze_cursor_movement()

            # Determine client status
            status = "ONLINE"
            if idle_sec >= 180:
                status = "IDLE"

            # Check if gaming or bypass is occurring
            sig = None
            if not is_productivity_process(proc_name):
                sig = check_process_signature(proc_name) or check_window_title_signature(win_title)

            detection = detect_violation(proc_name, win_title, pid, is_fs, ctrl, sig, sockets, evasions, cloaked, jiggler)
            if detection:
                status = "GAMING_ALERT"

            payload = {
                "hostname": hostname,
                "employee_id": employee_id,
                "username": username,
                "department": department,
                "ip_address": ip,
                "status": status,
                "current_app": proc_name,
                "window_title": win_title,
                "pid": pid,
                "idle_seconds": idle_sec,
                "is_fullscreen": is_fs,
                "anti_tamper": {
                    "has_cloaked_pe": len(cloaked) > 0,
                    "has_gaming_sockets": len(sockets) > 0,
                    "has_evasion_tools": len(evasions) > 0,
                    "has_synthetic_jiggler": jiggler.get("is_synthetic", False)
                }
            }

            # Attach a new incident (debounced) with screenshot evidence for the central server to log
            now = time.time()
            if detection and policy.get("enforce", True):
                key = f"{detection['game_name']}::{detection['process_name']}"
                if key != last_key or now - last_sent > VIOLATION_DEBOUNCE_SECONDS:
                    last_key, last_sent = key, now
                    payload["violation"] = detection
                    payload["screenshot_b64"] = capture_evidence_b64(detection["game_name"], detection["window_title"])
            elif not detection:
                last_key = ""

            # Send heartbeat to central server & check for pending IT commands
            res = send_heartbeat(server_url, payload)
            consecutive_errors = 0
            policy = res.get("policy", policy)
            AGENT_POLICY.update(policy)

            # Local enforcement driven by the central policy (popup, chime, auto-kill)
            if detection and policy.get("enforce", True):
                if res.get("violation_logged"):
                    game = detection["game_name"]
                    cooldown = float(policy.get("popup_cooldown_seconds", POPUP_COOLDOWN_SECONDS))
                    if now - _last_popup.get(game, 0.0) >= cooldown:
                        _last_popup[game] = now
                        if policy.get("show_popup", True):
                            threading.Thread(target=trigger_warning_popup, args=(game,), daemon=True).start()
                        if policy.get("play_sound", True):
                            play_alert_chime()
                if policy.get("auto_kill") and detection["pid"] > 0:
                    kill_process_by_pid(detection["pid"])

            # Screen frames are uploaded by screen_streaming_worker() every 20s. Do not capture
            # another frame here on every 5s heartbeat — that duplicated the capture/JPEG work.

            # Execute pending commands from central server
            commands = res.get("pending_commands", [])
            for cmd in commands:
                action = cmd.get("action") or cmd.get("command_type")
                p = cmd.get("payload", {})
                print(f"[Remote IT Action Received]: {action} with {p}")
                
                if action == "show_warning":
                    msg = p.get("game_name", "Unauthorized Activity")
                    threading.Thread(target=trigger_warning_popup, args=(msg,), daemon=True).start()
                    play_alert_chime()
                elif action == "kill_process":
                    target_pid = p.get("pid")
                    if target_pid and target_pid > 0:
                        kill_process_by_pid(target_pid)
                elif action in ("lock_workstation", "lock"):
                    lock_workstation()

        except urllib.error.URLError:
            consecutive_errors += 1
            if consecutive_errors % 10 == 1:
                print(f"[Agent Offline] Attempting reconnect to {server_url}...")
        except Exception as e:
            print(f"[Agent Loop Error]: {e}")

        time.sleep(5)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Anuvadini Detector Client Agent")
    parser.add_argument("--server", default=None, help="Central Server URL")
    parser.add_argument("--dept", default=None, help="Department Name")
    parser.add_argument("--id", default=None, help="Employee ID (e.g. EMP-101)")
    args = parser.parse_args()

    run_agent(server_url=args.server, department=args.dept, employee_id=args.id)
