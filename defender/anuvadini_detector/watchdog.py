"""
Anuvadini Detector - Self-Healing Watchdog Daemon
Mutual Supervisor Process:
1. Monitors the primary Anuvadini Detector process.
2. If an employee terminates the process via Task Manager (Ctrl+Shift+Esc),
   Process Hacker, or 'taskkill /f /im python.exe', this watchdog immediately
   detects the death within 500ms.
3. Automatically logs a CRITICAL Tamper Violation to the SQLite database.
4. Instantly restarts the Anuvadini Detector server/agent daemon.
5. Operates in mutual resurrection with the main engine (neither can be killed alone).
"""

import os
import sys
import time
import subprocess
import socket
import psutil
from datetime import datetime

# Path setup
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from anuvadini_detector import duty, pairing_status
from anuvadini_detector.config import SHIFT_END_TIME

WATCHDOG_LOG_FILE = os.path.join(BASE_DIR, "data", "watchdog.log")

def log_watchdog(msg: str):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{timestamp}] [WATCHDOG] {msg}\n"
    try:
        os.makedirs(os.path.dirname(WATCHDOG_LOG_FILE), exist_ok=True)
        with open(WATCHDOG_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(formatted)
    except Exception:
        pass
    print(formatted.strip())

def log_tamper_incident(pid: int, hostname: str, username: str):
    """Log tamper violation when detector process is killed."""
    try:
        # Lazy import: pymongo/DB costs ~15-20 MB private memory, and the watchdog only
        # touches Mongo on an actual tamper event. Normal idle footprint stays tiny.
        from anuvadini_detector.database import log_violation, get_db

        log_violation(
            hostname=hostname,
            username=username,
            game_name="⚠️ Anti-Tamper: Agent Process Terminated",
            category="Security Bypass Attempt",
            window_title="Unauthorized task termination attempt via Task Manager / taskkill",
            process_name="taskkill.exe / taskmgr.exe",
            pid=pid,
            severity="CRITICAL"
        )
        
        # Also mark workstation as TAMPER_ALERT
        db = get_db()
        db.workstations.update_one(
            {"hostname": hostname},
            {"$set": {
                "status": "TAMPER_ALERT",
                "current_app": "⚠️ Agent Terminated by User",
                "window_title": "Critical: Process was forcibly closed - Watchdog resurrected agent"
            }}
        )
    except Exception as e:
        log_watchdog(f"Failed to record tamper violation: {e}")

def _is_frozen_exe() -> bool:
    return getattr(sys, "frozen", False)


def _agent_exe_path() -> str:
    """Return the path of the agent executable."""
    if _is_frozen_exe():
        return sys.executable          # AnuvadiniDefenderSetup.exe
    # Dev mode: best-effort guess
    desktop_dir = os.path.join(BASE_DIR, "desktop")
    return os.path.join(desktop_dir, "app.py")


def find_agent_process(preferred_pid: int | None = None) -> "psutil.Process | None":
    """
    Return the running agent process, or None if it is not alive.

    When frozen: look for AnuvadiniDefenderSetup.exe whose cmdline contains '--agent'.
    In dev mode:  look for python processes whose cmdline contains 'app.py' and '--agent'.

    If preferred_pid is supplied, verify that ONE process first. This keeps the 1s watchdog
    loop cheap (a single pid lookup) instead of scanning every process on the machine.
    """
    if preferred_pid:
        try:
            proc = psutil.Process(preferred_pid)
            joined = " ".join(proc.cmdline() or []).lower()
            if "--agent" in joined and ("app.py" in joined or "defender.desktop.app" in joined):
                return proc
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass

    exe_name = os.path.basename(_agent_exe_path()).lower()
    for proc in psutil.process_iter(["pid", "name", "cmdline"]):
        try:
            proc_name = (proc.info["name"] or "").lower()
            cmdline   = proc.info["cmdline"] or []
            if exe_name in proc_name and "--agent" in cmdline:
                return proc
            # Also match python running app.py --agent (dev mode), including -m defender.desktop.app
            if "python" in proc_name:
                joined = " ".join(cmdline).lower()
                if "--agent" in joined and ("app.py" in joined or "defender.desktop.app" in joined):
                    return proc
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
    return None


def is_server_listening(port: int = 8055) -> bool:
    """Check if the Anuvadini server port is actively listening (server-side only)."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def launch_agent_process() -> subprocess.Popen:
    """
    Resurrect the monitoring agent.

    Frozen exe  → AnuvadiniDefenderSetup.exe --agent
    Dev mode    → python desktop/app.py --agent
    """
    if _is_frozen_exe():
        cmd = [sys.executable, "--agent"]
        log_watchdog(f"Resurrecting: {sys.executable} --agent")
    else:
        agent_script = _agent_exe_path()
        cmd = [sys.executable, agent_script, "--agent"]
        log_watchdog(f"Resurrecting: {sys.executable} {agent_script} --agent")

    creation_flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    proc = subprocess.Popen(cmd, cwd=BASE_DIR, creationflags=creation_flags)
    log_watchdog(f"Agent resurrected with PID {proc.pid}")
    return proc


def run_watchdog():
    hostname = socket.gethostname()
    username = os.getlogin() if hasattr(os, "getlogin") else os.environ.get("USERNAME", "Employee")
    log_watchdog(f"Watchdog initialized on {hostname} (User: {username})")

    last_known_pid = None
    off_duty_logged_for = None

    while True:
        try:
            resumed_from_off_duty = False
            # An intentional end-of-day stop must not be treated as tampering.
            # Wait quietly until the next shift start, then clear the state and
            # launch one fresh agent.
            off_duty = duty.read_off_duty()
            if off_duty:
                snapshot = pairing_status.fetch_agent_status()
                shift_due = duty.resume_due(off_duty)
                early_checkin = (
                    duty.early_wake_allowed(datetime.now(), off_duty, SHIFT_END_TIME)
                    and pairing_status.checked_in_after_off_duty(snapshot, off_duty)
                )

                if early_checkin:
                    log_watchdog("Fresh check-in detected while off duty; waking agent early.")
                    duty.clear_off_duty()
                    resumed_from_off_duty = True
                elif shift_due and snapshot and snapshot.get("paused"):
                    # At 09:30 the employee is still checked out (for example they
                    # corrected attendance and have not checked in yet). Stay
                    # asleep; their next check-in wakes the agent.
                    resume_key = off_duty.get("resume_at")
                    if resume_key != off_duty_logged_for:
                        log_watchdog(
                            "Shift start reached, but the employee is still checked out; "
                            "waiting for check-in."
                        )
                        off_duty_logged_for = resume_key
                    time.sleep(30.0)
                    continue
                elif shift_due:
                    log_watchdog(
                        f"Shift start reached; resuming across {duty.off_duty_message(off_duty)}."
                    )
                    duty.clear_off_duty()
                    resumed_from_off_duty = True
                else:
                    resume_key = off_duty.get("resume_at")
                    if resume_key != off_duty_logged_for:
                        log_watchdog(
                            f"Off duty; agent intentionally stopped. {duty.off_duty_message(off_duty)}"
                        )
                        off_duty_logged_for = resume_key
                    time.sleep(30.0)
                    continue

            off_duty_logged_for = None
            agent_proc = find_agent_process(last_known_pid)

            if agent_proc is None:
                pid_info = last_known_pid or 0
                if resumed_from_off_duty:
                    log_watchdog("Starting agent for the new shift.")
                else:
                    log_watchdog("Alert: Anuvadini agent process is DOWN! Process was killed or crashed.")
                    log_tamper_incident(pid=pid_info, hostname=hostname, username=username)

                # Resurrect immediately
                new_proc = launch_agent_process()
                last_known_pid = new_proc.pid

                # Wait up to 5s for agent to appear
                for _ in range(10):
                    time.sleep(0.5)
                    if find_agent_process() is not None:
                        log_watchdog(f"Agent is alive again (PID {last_known_pid})")
                        break
            else:
                last_known_pid = agent_proc.pid

            time.sleep(1.0)
        except KeyboardInterrupt:
            log_watchdog("Watchdog stopped manually.")
            break
        except Exception as e:
            log_watchdog(f"Watchdog loop exception: {e}")
            time.sleep(2.0)

if __name__ == "__main__":
    run_watchdog()
