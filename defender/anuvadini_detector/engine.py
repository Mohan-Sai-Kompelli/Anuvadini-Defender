"""
Anuvadini Detector - Detection Orchestrator & Engine
Autonomous 09:30 - 17:30 Office Shift Scheduling, Deep Process Scanning, and Telemetry.
"""
import time
import socket
import os
import json
import threading
from datetime import datetime
from typing import Callable

from anuvadini_detector.config import (
    POLL_INTERVAL_SECONDS,
    IDLE_THRESHOLD_SECONDS,
    SCREENSHOT_ON_VIOLATION,
    SCREENSHOT_COOLDOWN_SECONDS,
    AUTO_KILL_GAMES_DEFAULT,
    SHOW_POPUP_ALERT,
    PLAY_ALERT_SOUND,
    SCHEDULE_ENABLED,
    SHIFT_START_TIME,
    SHIFT_END_TIME,
    WORKING_DAYS,
    OVERRIDE_SCHEDULE,
    LUNCH_BREAK_ENABLED,
    LUNCH_START_TIME,
    LUNCH_END_TIME
)
from anuvadini_detector.watcher import get_active_window, get_visible_windows
from anuvadini_detector.afk import get_idle_seconds
from anuvadini_detector.controller import is_controller_connected
from anuvadini_detector.signatures import check_process_signature, check_window_title_signature, PRODUCTIVITY_WHITELIST, FULLSCREEN_HEURISTIC_EXEMPT, is_productivity_process
from anuvadini_detector.evidence import capture_violation_screenshot
from anuvadini_detector.enforcer import trigger_warning_popup, kill_process_by_pid, play_alert_chime, lock_workstation
from anuvadini_detector.nvidia_nim import nvidia_auditor
from anuvadini_detector.heuristics import analyze_cursor_movement
from anuvadini_detector.notifier import send_violation_webhook
from anuvadini_detector.anti_tamper import (
    scan_gaming_network_sockets,
    scan_evasion_processes,
    scan_disguised_processes_pe,
    ensure_watchdog_alive
)
from anuvadini_detector.firewall import firewall_engine
from anuvadini_detector.database import (
    log_violation,
    log_activity_tick,
    record_attendance_tick,
    get_custom_rules,
    get_setting,
    set_setting,
    upsert_workstation
)

class DetectionEngine:
    def __init__(self):
        self.is_running = False
        self._thread = None
        self.auto_kill = True   # Close apps automatically is ON by default (the admin can switch it off)
        self.show_popup = SHOW_POPUP_ALERT
        self.play_sound = PLAY_ALERT_SOUND
        
        # Load Office Shift Schedule from Database or Config Defaults
        self.schedule_enabled = get_setting("schedule_enabled", "1" if SCHEDULE_ENABLED else "0") == "1"
        self.shift_start = get_setting("shift_start", SHIFT_START_TIME) # "09:30"
        self.shift_end = get_setting("shift_end", SHIFT_END_TIME)       # "17:30"
        self.override_schedule = get_setting("override_schedule", "1" if OVERRIDE_SCHEDULE else "0") == "1"
        self.lunch_enabled = get_setting("lunch_enabled", "1" if LUNCH_BREAK_ENABLED else "0") == "1"
        self.lunch_start = get_setting("lunch_start", LUNCH_START_TIME) # "13:00"
        self.lunch_end = get_setting("lunch_end", LUNCH_END_TIME)       # "14:00"
        try:
            self.working_days = json.loads(get_setting("working_days", json.dumps(WORKING_DAYS)))
        except Exception:
            self.working_days = WORKING_DAYS
        
        self.hostname = socket.gethostname()
        self.username = os.environ.get("USERNAME", "Authorized Employee")
        self.employee_id = "9310790241"
        self.department = "Anuvadini foundation"
        
        # Load persisted agent config if available (prioritize workspace agent_config.json)
        workspace_cfg = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "agent_config.json")
        progdata_cfg = r"C:\ProgramData\AnuvadiniDetector\agent_config.json"
        for p in [workspace_cfg, progdata_cfg]:
            if os.path.exists(p):
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        cfg = json.load(f)
                        emp_id = cfg.get("employee_id")
                        if emp_id and emp_id != "EMP-TEST-99":
                            self.employee_id = emp_id
                        if cfg.get("username") and cfg.get("username") != "Test Installation":
                            self.username = cfg.get("username")
                        if cfg.get("department") and cfg.get("department") != "Engineering":
                            self.department = cfg.get("department")
                        break
                except Exception:
                    pass
        
        # State tracking
        self.last_active_window = {}
        self.last_screenshot_time = 0
        self.last_violation_log_time = 0
        self.last_violation_game = ""
        self.current_state = "WORK" # "WORK", "GAMING", "IDLE", "OFF_DUTY"
        self.active_violation = None
        self.total_violations_today = 0
        
        # WebSocket / Event Listeners
        self.subscribers: list[Callable[[dict], None]] = []

    def register_subscriber(self, callback: Callable[[dict], None]):
        """Subscribe to real-time telemetry events."""
        if callback not in self.subscribers:
            self.subscribers.append(callback)

    def unregister_subscriber(self, callback: Callable[[dict], None]):
        if callback in self.subscribers:
            self.subscribers.remove(callback)

    def _broadcast(self, data: dict):
        for sub in list(self.subscribers):
            try:
                sub(data)
            except Exception:
                pass

    def start(self):
        if self.is_running:
            return
        self.is_running = True
        self._thread = threading.Thread(target=self._monitoring_loop, daemon=True)
        self._thread.start()
        print(f"[Anuvadini Engine] Autonomous monitoring started on PC: {self.hostname} ({self.username})")
        print(f"[Anuvadini Engine] Office Shift Window: {self.shift_start} to {self.shift_end} (Auto-Schedule: {self.schedule_enabled})")

    def stop(self):
        self.is_running = False
        print("[Anuvadini Engine] Monitoring stopped.")

    def get_shift_status(self) -> dict:
        """Calculate autonomous shift status (09:30 AM to 05:30 PM window)."""
        now = datetime.now()
        today_date = now.date()
        weekday = now.weekday() # 0 = Monday, 6 = Sunday

        try:
            sh_h, sh_m = map(int, self.shift_start.split(":"))
            eh_h, eh_m = map(int, self.shift_end.split(":"))
        except Exception:
            sh_h, sh_m = 9, 30
            eh_h, eh_m = 17, 30

        start_dt = datetime.combine(today_date, datetime.min.time()).replace(hour=sh_h, minute=sh_m)
        end_dt = datetime.combine(today_date, datetime.min.time()).replace(hour=eh_h, minute=eh_m)

        is_work_day = weekday in self.working_days
        is_time_window = start_dt <= now <= end_dt

        is_active = False
        status_label = "OFF-DUTY"
        status_reason = "Shift Finished"
        is_lunch = False

        if self.override_schedule:
            is_active = True
            status_label = "OVERRIDE"
            status_reason = "Manual Force-Active Override"
        elif not self.schedule_enabled:
            is_active = True
            status_label = "ALWAYS-ON"
            status_reason = "Continuous 24/7 Monitoring"
        else:
            if is_work_day and is_time_window:
                is_active = True
                status_label = "IN-SHIFT"
                remaining = end_dt - now
                rem_hrs = int(remaining.total_seconds() // 3600)
                rem_mins = int((remaining.total_seconds() % 3600) // 60)
                status_reason = f"Official Office Shift ({self.shift_start} - {self.shift_end}) • {rem_hrs}h {rem_mins}m remaining"

                # Check Lunch Break Window
                is_lunch = False
                if self.lunch_enabled:
                    try:
                        lh_s, lm_s = map(int, self.lunch_start.split(":"))
                        lh_e, lm_e = map(int, self.lunch_end.split(":"))
                        l_start_dt = datetime.combine(today_date, datetime.min.time()).replace(hour=lh_s, minute=lm_s)
                        l_end_dt = datetime.combine(today_date, datetime.min.time()).replace(hour=lh_e, minute=lm_e)
                        if l_start_dt <= now <= l_end_dt:
                            is_lunch = True
                            status_label = "LUNCH-BREAK"
                            status_reason = f"🥪 Official Lunch & Wellness Break ({self.lunch_start} - {self.lunch_end}) • Relax Period"
                    except Exception:
                        pass
            elif not is_work_day:
                is_active = False
                status_label = "OFF-DUTY"
                status_reason = "Non-Working Day (Office Closed)"
            elif now < start_dt:
                is_active = False
                status_label = "STANDBY"
                diff = start_dt - now
                hrs = int(diff.total_seconds() // 3600)
                mins = int((diff.total_seconds() % 3600) // 60)
                status_reason = f"Shift starts in {hrs}h {mins}m (at {self.shift_start})"
            else:
                is_active = False
                status_label = "OFF-DUTY"
                status_reason = f"Office Hours Closed (Shift ended at {self.shift_end})"

        # Calculate shift elapsed percentage
        shift_total_sec = max(1, (end_dt - start_dt).total_seconds())
        if now < start_dt:
            progress_pct = 0.0
        elif now > end_dt:
            progress_pct = 100.0
        else:
            elapsed_sec = (now - start_dt).total_seconds()
            progress_pct = min(100.0, max(0.0, round((elapsed_sec / shift_total_sec) * 100, 1)))

        return {
            "is_active": is_active,
            "status_label": status_label,
            "status_reason": status_reason,
            "shift_start": self.shift_start,
            "shift_end": self.shift_end,
            "schedule_enabled": self.schedule_enabled,
            "override_schedule": self.override_schedule,
            "progress_pct": progress_pct,
            "is_lunch": is_lunch,
            "lunch_enabled": self.lunch_enabled,
            "lunch_start": self.lunch_start,
            "lunch_end": self.lunch_end,
            "current_time": now.strftime("%H:%M:%S")
        }

    def update_shift_settings(self, shift_start: str = None, shift_end: str = None, 
                              schedule_enabled: bool = None, override_schedule: bool = None,
                              working_days: list[int] = None):
        """Update and persist office shift settings."""
        if shift_start is not None:
            self.shift_start = shift_start.strip()
            set_setting("shift_start", self.shift_start)
        if shift_end is not None:
            self.shift_end = shift_end.strip()
            set_setting("shift_end", self.shift_end)
        if schedule_enabled is not None:
            self.schedule_enabled = bool(schedule_enabled)
            set_setting("schedule_enabled", "1" if self.schedule_enabled else "0")
        if override_schedule is not None:
            self.override_schedule = bool(override_schedule)
            set_setting("override_schedule", "1" if self.override_schedule else "0")
        if working_days is not None:
            self.working_days = working_days
            set_setting("working_days", json.dumps(self.working_days))

    def check_custom_rules(self, proc_name: str, window_title: str) -> dict | None:
        """Check user-configured custom blacklist rules."""
        try:
            rules = get_custom_rules()
            proc_lower = proc_name.lower().strip()
            title_lower = window_title.lower().strip()
            for r in rules:
                pat = r['pattern'].lower().strip()
                if not pat:
                    continue
                if r['rule_type'] == 'process' and pat in proc_lower:
                    return {
                        "name": r['label'],
                        "category": r['category'],
                        "severity": "HIGH",
                        "action": r.get('action', 'alert')
                    }
                elif r['rule_type'] == 'keyword' and pat in title_lower:
                    return {
                        "name": r['label'],
                        "category": r['category'],
                        "severity": "HIGH",
                        "action": r.get('action', 'alert')
                    }
        except Exception:
            pass
        return None

    def _sync_hosts_for_shift(self, active: bool):
        """DNS sinkhole (hosts file) is only in force during office hours: removed off-duty, restored at shift start."""
        if getattr(self, "_hosts_active", None) == active:
            return
        self._hosts_active = active
        try:
            from anuvadini_detector.firewall import FIREWALL_START_TAG
            hosts_path = firewall_engine.hosts_path
            if not active:
                if hosts_path.exists() and FIREWALL_START_TAG in hosts_path.read_text(encoding="utf-8", errors="ignore"):
                    firewall_engine.remove_hosts_sinkhole()
                    set_setting("hosts_removed_offhours", "1")
            elif get_setting("hosts_removed_offhours", "0") == "1":
                firewall_engine.sync_hosts_sinkhole()
                set_setting("hosts_removed_offhours", "0")
        except Exception:
            pass

    def _monitoring_loop(self):
        _tick = 0  # counts loop iterations for rate-limiting heavy scans
        while self.is_running:
            try:
                _tick += 1
                # Heavy anti-tamper scans (PE header, network sockets) run every ~30s
                # (every 6 ticks at 5s interval) to avoid constant process-list pressure.
                _run_heavy = (_tick % 6 == 0)

                shift_info = self.get_shift_status()
                in_shift = shift_info["is_active"]
                is_lunch = shift_info.get("is_lunch", False)

                active_win = get_active_window()
                proc_name = active_win.get("process_name", "unknown")
                window_title = active_win.get("title", "")
                pid = active_win.get("pid", 0)
                is_fs = active_win.get("is_fullscreen", False)
                self.last_active_window = {"title": window_title, "process": proc_name, "pid": pid, "is_fullscreen": is_fs}
                idle_sec = get_idle_seconds()
                ctrl_info = is_controller_connected()
                
                is_idle = idle_sec >= IDLE_THRESHOLD_SECONDS
                is_gaming = False
                matched_rule = None
                background_game = None

                # Enforcement (tab firewall + violations) only runs during office hours (and never during the lunch
                # grace period) unless the admin forced "Override". Outside that, employees are left alone.
                enforcing = (in_shift or self.override_schedule) and (not is_lunch or self.override_schedule)
                self._sync_hosts_for_shift(bool(in_shift or self.override_schedule))

                # 1. Workplace Website & Network Firewall — LOG ONLY, no tab closing.
                # enforce_silent_intercept (force-closes browser tabs) is disabled to avoid
                # disrupting employees. Violations are still recorded for admin review.
                fw_match = None
                if enforcing:
                    fw_match = firewall_engine.check_window_interceptor(window_title, proc_name, pid, active_win.get("hwnd", 0))
                if fw_match:
                    # Do NOT call enforce_silent_intercept — just log it silently.
                    matched_rule = {
                        "name": fw_match["name"],
                        "category": fw_match["category"],
                        "severity": "HIGH",
                        "silent": True      # logged only — no tab close, no popup, no sound
                    }

                # Only run active violation detection and enforcement during shift (or when override is on)
                if (in_shift or self.override_schedule) and not matched_rule:
                    # 2. Custom blacklist rules
                    matched_rule = self.check_custom_rules(proc_name, window_title)
                    
                    # 3. Known process signatures
                    if not matched_rule and not is_productivity_process(proc_name):
                        matched_rule = check_process_signature(proc_name)
                    
                    # 4. Window title keywords (Poki, Twitch, Games, Stake, Roblox, etc.)
                    if not matched_rule:
                        matched_rule = check_window_title_signature(window_title)

                    # 5. Deep Heuristic: Fullscreen + Gamepad / High CPU non-work process
                    if not matched_rule and proc_name.lower() not in FULLSCREEN_HEURISTIC_EXEMPT:
                        if is_fs and ctrl_info.get("connected"):
                            matched_rule = {
                                "name": f"Unknown Game ({proc_name})",
                                "category": "Gamepad Gaming (Heuristic)",
                                "severity": "HIGH",
                                "process_name": proc_name,
                                "pid": pid,
                                "window_title": window_title
                            }

                    # 6. Background / Minimized Game Scan
                    if not matched_rule:
                        visible_wins = get_visible_windows()
                        for vw in visible_wins:
                            v_proc = vw.get("process_name", "")
                            v_title = vw.get("title", "")
                            if not is_productivity_process(v_proc):
                                sig = check_process_signature(v_proc) or check_window_title_signature(v_title)
                                if sig:
                                    background_game = {
                                        **sig,
                                        "process_name": v_proc,
                                        "pid": vw.get("pid", 0),
                                        "window_title": v_title
                                    }
                                    break

                    # 7-9: Heavy anti-tamper scans — run every ~30s only (rate-limited via _run_heavy).
                    # These call psutil.process_iter + network socket scan + PE header reads on every
                    # running process, which is expensive. Throttling them keeps CPU/RAM low.
                    if _run_heavy:
                        # 7. Anti-Bypass: Cloud Gaming & Remote Desktop Tunneling (Parsec, GeForce NOW, AnyDesk)
                        if not matched_rule and not background_game:
                            evasions = scan_evasion_processes()
                            if evasions:
                                ev = evasions[0]
                                matched_rule = {
                                    "name": ev["evasion_title"],
                                    "category": ev["category"],
                                    "severity": "HIGH",
                                    "pid": ev["pid"],
                                    "process_name": ev["process_name"],
                                    "window_title": window_title
                                }

                        # 8. Anti-Bypass: Deep Gaming Network Socket Inspection (Renamed or Hidden Game Executables)
                        if not matched_rule and not background_game:
                            net_sockets = scan_gaming_network_sockets()
                            if net_sockets:
                                ns = net_sockets[0]
                                matched_rule = {
                                    "name": f"Stealth Game: {ns['game_service']}",
                                    "category": "Network Gaming Traffic (Renamed Executable)",
                                    "severity": "HIGH",
                                    "pid": ns["pid"],
                                    "process_name": ns["process_name"],
                                    "window_title": window_title
                                }

                        # 9. Anti-Bypass: PE Header Metadata Cloaking (Detects cs2.exe renamed to notepad.exe or calc.exe)
                        if not matched_rule and not background_game:
                            cloaked_procs = scan_disguised_processes_pe()
                            if cloaked_procs:
                                cp = cloaked_procs[0]
                                matched_rule = {
                                    "name": f"Cloaked Game: {cp['product_name']}",
                                    "category": "Disguised Executable (PE Cloaking)",
                                    "severity": "HIGH",
                                    "pid": cp["pid"],
                                    "process_name": cp["process_name"],
                                    "window_title": window_title
                                }

                    # 10. Heuristic: Synthetic Mouse Jiggler & Mechanical Macro Detection
                    if not matched_rule and not background_game:
                        jiggler = analyze_cursor_movement()
                        if jiggler.get("is_synthetic"):
                            matched_rule = {
                                "name": f"Synthetic AFK Bot ({jiggler.get('reason', 'Jiggler')})",
                                "category": "Anti-AFK Bypass / Synthetic Movement",
                                "severity": "HIGH",
                                "pid": pid,
                                "process_name": proc_name,
                                "window_title": window_title
                            }

                    # Ensure mutual supervisor watchdog is guarding the agent
                    try:
                        ensure_watchdog_alive()
                    except Exception:
                        pass

                # Determine State & Violation Actions
                now = time.time()
                violation_occurred = False
                current_detection = None

                if matched_rule:
                    is_gaming = True
                    self.current_state = "GAMING"
                    violation_occurred = True
                    current_detection = {
                        "game_name": matched_rule["name"],
                        "category": matched_rule["category"],
                        "severity": matched_rule.get("severity", "HIGH"),
                        "process_name": matched_rule.get("process_name", proc_name),
                        "pid": matched_rule.get("pid", pid),
                        "window_title": matched_rule.get("window_title", window_title),
                        "is_background": False,
                        "silent": bool(matched_rule.get("silent")),
                        "hostname": self.hostname,
                        "username": self.username,
                        "employee_id": self.employee_id,
                        "department": self.department
                    }
                elif background_game:
                    is_gaming = True
                    self.current_state = "BACKGROUND_GAMING"
                    violation_occurred = True
                    current_detection = {
                        "game_name": background_game["name"],
                        "category": background_game["category"],
                        "severity": background_game.get("severity", "MEDIUM"),
                        "process_name": background_game["process_name"],
                        "pid": background_game["pid"],
                        "window_title": background_game["window_title"],
                        "is_background": True,
                        "hostname": self.hostname,
                        "username": self.username,
                        "employee_id": self.employee_id,
                        "department": self.department
                    }
                elif not (in_shift or self.override_schedule):
                    self.current_state = "OFF_DUTY"
                elif is_idle:
                    self.current_state = "IDLE"
                else:
                    is_lunch = shift_info.get("is_lunch", False)
                    if is_lunch and not self.override_schedule:
                        self.current_state = "LUNCH_BREAK"
                    else:
                        self.current_state = "WORK"

                # Handle Violation Actions
                if violation_occurred and current_detection:
                    self.active_violation = current_detection
                    game_key = f"{current_detection['game_name']}::{current_detection['process_name']}"
                    time_since_last = now - getattr(self, "last_violation_log_time", 0)
                    is_new_violation = (game_key != getattr(self, "last_violation_game", "")) or (time_since_last > 15.0)

                    if is_new_violation:
                        self.last_violation_game = game_key
                        self.last_violation_log_time = now

                        # 1. Take Screenshot Evidence (Rate limited)
                        screenshot_file = None
                        if SCREENSHOT_ON_VIOLATION and (now - self.last_screenshot_time > SCREENSHOT_COOLDOWN_SECONDS):
                            screenshot_file = capture_violation_screenshot(
                                violation_id=str(int(now)),
                                game_name=current_detection["game_name"],
                                window_title=current_detection["window_title"]
                            )
                            self.last_screenshot_time = now

                        # 2. Log Violation to MongoDB
                        v_id = log_violation(
                            hostname=self.hostname,
                            username=self.username,
                            game_name=current_detection["game_name"],
                            category=current_detection["category"],
                            window_title=current_detection["window_title"],
                            process_name=current_detection["process_name"],
                            pid=current_detection["pid"],
                            screenshot_filename=screenshot_file,
                            severity=current_detection["severity"]
                        )
                        current_detection["id"] = v_id
                        current_detection["screenshot_filename"] = screenshot_file

                        # Run NVIDIA NIM AI Analysis on detected event
                        try:
                            ai_verdict = nvidia_auditor.analyze_screen(
                                pil_image=None,
                                window_title=current_detection["window_title"],
                                process_name=current_detection["process_name"]
                            )
                            current_detection["ai_confidence"] = ai_verdict.get("confidence", 0.95)
                            current_detection["ai_summary"] = ai_verdict.get("visual_summary", "")
                            current_detection["ai_model"] = ai_verdict.get("model", "NVIDIA NIM")
                        except Exception:
                            pass

                        # Real-Time Admin Webhook Alert Dispatch
                        try:
                            threading.Thread(target=send_violation_webhook, args=(current_detection,), daemon=True).start()
                        except Exception:
                            pass

                        # 3. Popup enforcement & sound alert (Suppressed during official Lunch Break unless overridden)
                        if (not is_lunch or self.override_schedule) and not current_detection.get("silent"):
                            if self.show_popup:
                                trigger_warning_popup(current_detection["game_name"])
                            if self.play_sound:
                                play_alert_chime()

                    # 4. Auto-Kill Process if enabled
                    if self.auto_kill and current_detection["pid"] > 0 and not current_detection.get("silent"):
                        kill_process_by_pid(current_detection["pid"])
                elif not violation_occurred:
                    self.active_violation = None
                    self.last_violation_game = ""

                # Log activity heartbeat
                category = "Gaming" if is_gaming else ("Idle" if is_idle else "Productive Work")
                log_activity_tick(
                    process_name=proc_name,
                    window_title=window_title,
                    category=category,
                    is_idle=is_idle,
                    is_gaming=is_gaming,
                    tick_duration=POLL_INTERVAL_SECONDS
                )

                # Automated Zero-Touch Attendance Tick
                record_attendance_tick(
                    employee_id=self.employee_id,
                    username=self.username,
                    department=self.department,
                    hostname=self.hostname,
                    is_idle=is_idle,
                    is_gaming=is_gaming,
                    tick_duration=POLL_INTERVAL_SECONDS
                )
                # Upsert local PC in fleet table
                upsert_workstation(
                    hostname=self.hostname,
                    username=self.username,
                    department=self.department,
                    ip_address="127.0.0.1",
                    status="GAMING_ALERT" if violation_occurred else ("IDLE" if is_idle else "ONLINE"),
                    current_app=proc_name,
                    window_title=window_title,
                    pid=pid,
                    idle_seconds=idle_sec,
                    is_fullscreen=is_fs,
                    employee_id=self.employee_id,
                    tunnel_status="CONNECTED"
                )

                # Broadcast Telemetry via WebSocket
                telemetry = {
                    "timestamp": datetime.now().strftime("%H:%M:%S"),
                    "state": self.current_state,
                    "shift": shift_info,
                    "active_window": {
                        "title": window_title,
                        "process": proc_name,
                        "pid": pid,
                        "is_fullscreen": is_fs,
                        "cpu_percent": active_win.get("cpu_percent", 0),
                        "memory_mb": active_win.get("memory_mb", 0)
                    },
                    "idle_seconds": round(idle_sec, 1),
                    "is_idle": is_idle,
                    "controller": ctrl_info,
                    "violation": current_detection,
                    "auto_kill": self.auto_kill,
                    "hostname": self.hostname,
                    "username": self.username
                }
                self._broadcast(telemetry)

            except Exception as e:
                print(f"[Anuvadini Engine Loop Error]: {e}")

            time.sleep(POLL_INTERVAL_SECONDS)

    def simulate_violation(self, game_name: str, window_title: str, category: str = "Simulated Gaming"):
        """Instant simulation trigger for live test demonstrations."""
        now = time.time()
        screenshot_file = None
        if SCREENSHOT_ON_VIOLATION:
            screenshot_file = capture_violation_screenshot(
                violation_id=str(int(now)),
                game_name=game_name,
                window_title=window_title
            )

        v_id = log_violation(
            hostname=self.hostname,
            username=self.username,
            game_name=game_name,
            category=category,
            window_title=window_title,
            process_name=f"{game_name.lower().replace(' ', '_')}.exe",
            pid=9999,
            screenshot_filename=screenshot_file,
            severity="HIGH"
        )

        sim_detection = {
            "id": v_id,
            "game_name": game_name,
            "category": category,
            "severity": "HIGH",
            "process_name": f"{game_name.lower().replace(' ', '_')}.exe",
            "pid": 9999,
            "window_title": window_title,
            "screenshot_filename": screenshot_file,
            "is_background": False
        }
        self.active_violation = sim_detection
        self.current_state = "GAMING"

        if self.show_popup:
            trigger_warning_popup(game_name)
        if self.play_sound:
            play_alert_chime()

        # Broadcast simulated event
        self._broadcast({
            "timestamp": datetime.now().strftime("%H:%M:%S"),
            "state": "GAMING",
            "shift": self.get_shift_status(),
            "active_window": {
                "title": window_title,
                "process": f"{game_name.lower().replace(' ', '_')}.exe",
                "pid": 9999,
                "is_fullscreen": True,
                "cpu_percent": 34.5,
                "memory_mb": 1420.0
            },
            "idle_seconds": 0.0,
            "is_idle": False,
            "controller": {"connected": False, "status_text": "No Controller Detected"},
            "violation": sim_detection,
            "auto_kill": self.auto_kill,
            "hostname": self.hostname,
            "username": self.username
        })
        return sim_detection

# Global Engine Singleton
engine = DetectionEngine()
