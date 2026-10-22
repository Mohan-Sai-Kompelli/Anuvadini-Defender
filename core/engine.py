"""
Anuvadini Detector - Core Detection Engine & Autonomous Shift Scheduler
Implements the 8-stage detection pipeline:
  Stage 1: Custom Rules
  Stage 2: Process Signatures
  Stage 3: Window-Title Scan
  Stage 4: Fullscreen + Gamepad Heuristic
  Stage 5: Background / Minimized Window Scan (Alt+Tab Defense)
  Stage 6: Anti-Bypass Evasion Processes
  Stage 7: Gaming Network Sockets
  Stage 8: PE Header Cloaking / Disguise

Maintains 6 system states:
  WORK, GAMING, BACKGROUND_GAMING, IDLE, OFF_DUTY, LUNCH_BREAK

Autonomous Shift Scheduler:
  Active 09:30 -> 17:30, Mon-Sat
  Lunch grace 13:00 -> 14:00
  Manual Override (AUTO, FORCE_WORK, FORCE_STANDBY)
  Progress, countdown, and status-reason telemetry.
"""

import datetime
import os
import psutil
import socket
import time
from typing import Dict, Any, List, Optional, Tuple, Callable

from .signatures import (
    GAME_PROCESSES, GAME_LAUNCHERS, EMULATORS, ANTI_AFK_JIGGLERS,
    TRADING_PROCESSES, BROWSER_PATTERNS, PRODUCTIVITY_WHITELIST
)

from .watcher import get_active_window, enumerate_all_visible_windows
from .afk import get_hardware_idle_seconds
from .controller import detect_gamepads
from .anti_tamper import AntiTamperEngine
from .evidence import capture_desktop_gdi, create_tamper_evident_proof
from .database import get_connection

class ShiftScheduler:
    """
    Autonomous 09:30 - 17:30 Shift Engine with Lunch Grace (13:00 - 14:00),
    countdown timer, and progress calculation.
    """
    def __init__(self):
        self.shift_start = (9, 30)   # 09:30 AM
        self.shift_end = (17, 30)    # 05:30 PM
        self.lunch_start = (13, 0)   # 01:00 PM
        self.lunch_end = (14, 0)     # 02:00 PM
        self.work_days = [0, 1, 2, 3, 4, 5] # Monday (0) to Saturday (5)
        self.manual_override = "AUTO" # AUTO, FORCE_WORK, FORCE_STANDBY

    def reload_from_db(self):
        """Loads persistent shift settings from system_settings table."""
        try:
            conn = get_connection()
            c = conn.cursor()
            c.execute("SELECT key, value FROM system_settings WHERE key LIKE 'shift_%' OR key LIKE 'lunch_%' OR key = 'manual_override'")
            for row in c.fetchall():
                k, v = row["key"], row["value"]
                if k == "shift_start" and ":" in v:
                    h, m = map(int, v.split(":"))
                    self.shift_start = (h, m)
                elif k == "shift_end" and ":" in v:
                    h, m = map(int, v.split(":"))
                    self.shift_end = (h, m)
                elif k == "lunch_start" and ":" in v:
                    h, m = map(int, v.split(":"))
                    self.lunch_start = (h, m)
                elif k == "lunch_end" and ":" in v:
                    h, m = map(int, v.split(":"))
                    self.lunch_end = (h, m)
                elif k == "manual_override":
                    self.manual_override = v
            conn.close()
        except Exception:
            pass

    def evaluate(self, now: Optional[datetime.datetime] = None) -> Dict[str, Any]:
        """
        Evaluates current shift status, countdown, progress %, and reason.
        """
        if now is None:
            now = datetime.datetime.now()

        # Check manual override
        if self.manual_override == "FORCE_WORK":
            return {
                "in_shift": True,
                "is_lunch": False,
                "status_reason": "Manual Override: Surveillance Active",
                "countdown_seconds": 0,
                "countdown_text": "Manual Work",
                "progress_percent": 100.0,
                "state": "WORK"
            }
        elif self.manual_override == "FORCE_STANDBY":
            return {
                "in_shift": False,
                "is_lunch": False,
                "status_reason": "Manual Override: Standby / Off-Duty",
                "countdown_seconds": 0,
                "countdown_text": "Manual Standby",
                "progress_percent": 0.0,
                "state": "OFF_DUTY"
            }

        weekday = now.weekday()
        if weekday not in self.work_days:
            return {
                "in_shift": False,
                "is_lunch": False,
                "status_reason": "Weekend: Office Closed (Standby)",
                "countdown_seconds": 0,
                "countdown_text": "Sunday Standby",
                "progress_percent": 0.0,
                "state": "OFF_DUTY"
            }

        cur_min = now.hour * 60 + now.minute
        start_min = self.shift_start[0] * 60 + self.shift_start[1]
        end_min = self.shift_end[0] * 60 + self.shift_end[1]
        l_start_min = self.lunch_start[0] * 60 + self.lunch_start[1]
        l_end_min = self.lunch_end[0] * 60 + self.lunch_end[1]

        # 1. Before Shift
        if cur_min < start_min:
            diff_secs = (start_min - cur_min) * 60 - now.second
            return {
                "in_shift": False,
                "is_lunch": False,
                "status_reason": f"Pre-Shift Standby (Starts at {self.shift_start[0]:02d}:{self.shift_start[1]:02d})",
                "countdown_seconds": max(0, diff_secs),
                "countdown_text": f"Starts in {diff_secs // 3600:02d}:{(diff_secs % 3600) // 60:02d}:{(diff_secs % 60):02d}",
                "progress_percent": 0.0,
                "state": "OFF_DUTY"
            }

        # 2. After Shift
        if cur_min >= end_min:
            return {
                "in_shift": False,
                "is_lunch": False,
                "status_reason": f"Shift Ended at {self.shift_end[0]:02d}:{self.shift_end[1]:02d} (Graceful Standby)",
                "countdown_seconds": 0,
                "countdown_text": "Shift Completed",
                "progress_percent": 100.0,
                "state": "OFF_DUTY"
            }

        # 3. Lunch Break Grace
        if l_start_min <= cur_min < l_end_min:
            diff_secs = (l_end_min - cur_min) * 60 - now.second
            return {
                "in_shift": True,
                "is_lunch": True,
                "status_reason": f"Lunch Break Grace (Resumes at {self.lunch_end[0]:02d}:{self.lunch_end[1]:02d})",
                "countdown_seconds": max(0, diff_secs),
                "countdown_text": f"Lunch ends in {(diff_secs % 3600) // 60:02d}:{(diff_secs % 60):02d}",
                "progress_percent": round(((cur_min - start_min) / (end_min - start_min)) * 100, 1),
                "state": "LUNCH_BREAK"
            }

        # 4. Active Shift Hours
        total_shift_minutes = end_min - start_min
        elapsed_minutes = cur_min - start_min
        progress_pct = max(0.0, min(100.0, round((elapsed_minutes / total_shift_minutes) * 100, 1)))

        secs_until_end = (end_min - cur_min) * 60 - now.second
        hrs_left = secs_until_end // 3600
        mins_left = (secs_until_end % 3600) // 60
        secs_left = secs_until_end % 60

        return {
            "in_shift": True,
            "is_lunch": False,
            "status_reason": f"Autonomous Shift Active ({self.shift_start[0]:02d}:{self.shift_start[1]:02d} - {self.shift_end[0]:02d}:{self.shift_end[1]:02d})",
            "countdown_seconds": max(0, secs_until_end),
            "countdown_text": f"{hrs_left:02d}:{mins_left:02d}:{secs_left:02d} remaining",
            "progress_percent": progress_pct,
            "state": "WORK"
        }

class DetectionEngine:
    """
    High-Throughput 8-Stage Detection Pipeline running at 1.5s cadence.
    """
    def __init__(self, workstation_id: Optional[str] = None):
        self.workstation_id = workstation_id or f"{socket.gethostname()}_{os.getenv('USERNAME', os.getenv('USER', 'User'))}"
        self.shift_scheduler = ShiftScheduler()
        self.anti_tamper = AntiTamperEngine()
        self.subscribers: List[Callable[[Dict[str, Any]], None]] = []
        self._running = False

    def subscribe(self, callback: Callable[[Dict[str, Any]], None]):
        """Adds live telemetry subscriber."""
        self.subscribers.append(callback)

    def run_8stage_pipeline(self) -> Dict[str, Any]:
        """
        Executes the full 8-stage detection pipeline on the local machine.
        Returns unified telemetry verdict.
        """
        # Step 0: Shift Schedule Assessment
        shift_info = self.shift_scheduler.evaluate()
        if not shift_info["in_shift"]:
            return {
                "state": shift_info["state"],
                "reason": shift_info["status_reason"],
                "stage": 0,
                "shift": shift_info,
                "violation": None
            }
        if shift_info["is_lunch"]:
            return {
                "state": "LUNCH_BREAK",
                "reason": shift_info["status_reason"],
                "stage": 0,
                "shift": shift_info,
                "violation": None
            }

        # Probe hardware state
        active_win = get_active_window()
        idle_secs = get_hardware_idle_seconds()
        gamepad_info = detect_gamepads()

        # Step 0.5: AFK Check
        if idle_secs >= 180.0:
            return {
                "state": "IDLE",
                "reason": f"Hardware away/idle for {int(idle_secs)}s",
                "stage": 0,
                "idle_seconds": idle_secs,
                "active_window": active_win,
                "shift": shift_info,
                "violation": None
            }

        # =========================================================================
        # Stage 1: Custom Policy Rules (DB)
        # =========================================================================
        try:
            conn = get_connection()
            c = conn.cursor()
            c.execute("SELECT name, rule_type, pattern, action FROM custom_rules WHERE enabled = 1")
            for rule in c.fetchall():
                r_type = rule["rule_type"]
                pattern = rule["pattern"].lower()
                if r_type == "process" and pattern in active_win["process_name"].lower():
                    conn.close()
                    return {
                        "state": "GAMING",
                        "reason": f"Custom Rule Violation: {rule['name']} (Process {pattern})",
                        "stage": 1,
                        "action": rule["action"],
                        "violation": {"title": rule["name"], "process": active_win["process_name"]},
                        "active_window": active_win,
                        "shift": shift_info
                    }
                elif r_type == "window_keyword" and pattern in active_win["title"].lower():
                    conn.close()
                    return {
                        "state": "GAMING",
                        "reason": f"Custom Rule Keyword Match: {rule['name']} ({pattern})",
                        "stage": 1,
                        "action": rule["action"],
                        "violation": {"title": rule["name"], "process": active_win["process_name"]},
                        "active_window": active_win,
                        "shift": shift_info
                    }
            conn.close()
        except Exception:
            pass

        # =========================================================================
        # Stage 2: Process Signature Scan (Active Foreground Window)
        # =========================================================================
        proc_lower = active_win["process_name"].lower()
        if proc_lower in GAME_PROCESSES:
            return {
                "state": "GAMING",
                "reason": f"Active PC Game Process Detected: {active_win['process_name']}",
                "stage": 2,
                "violation": {"title": active_win["title"], "process": active_win["process_name"]},
                "active_window": active_win,
                "shift": shift_info
            }
        if proc_lower in GAME_LAUNCHERS:
            return {
                "state": "GAMING",
                "reason": f"Game Launcher In Foreground: {active_win['process_name']}",
                "stage": 2,
                "violation": {"title": active_win["title"], "process": active_win["process_name"]},
                "active_window": active_win,
                "shift": shift_info
            }
        if proc_lower in EMULATORS:
            return {
                "state": "GAMING",
                "reason": f"Game Emulator Running: {active_win['process_name']}",
                "stage": 2,
                "violation": {"title": active_win["title"], "process": active_win["process_name"]},
                "active_window": active_win,
                "shift": shift_info
            }
        if proc_lower in ANTI_AFK_JIGGLERS:
            return {
                "state": "GAMING",
                "reason": f"Anti-AFK Mouse Jiggler / Macro Bot: {active_win['process_name']}",
                "stage": 2,
                "violation": {"title": "Anti-AFK Jiggler Detected", "process": active_win["process_name"]},
                "active_window": active_win,
                "shift": shift_info
            }
        if proc_lower in TRADING_PROCESSES:
            return {
                "state": "GAMING",
                "reason": f"Trading / Crypto App Detected: {active_win['process_name']}",
                "stage": 2,
                "violation": {"title": f"Trading App ({active_win['process_name']})", "process": active_win["process_name"]},
                "active_window": active_win,
                "shift": shift_info
            }

        # =========================================================================
        # Stage 3: Window-Title Scan (Web Games, Streaming, Betting, Trading)
        # =========================================================================

        title_lower = active_win["title"].lower()
        for bp in BROWSER_PATTERNS:
            if bp["pattern"].lower() in title_lower:
                return {
                    "state": "GAMING",
                    "reason": f"{bp['category']} Detected: {bp['name']}",
                    "stage": 3,
                    "violation": {"title": bp["name"], "category": bp["category"], "process": active_win["process_name"]},
                    "active_window": active_win,
                    "shift": shift_info
                }

        # =========================================================================
        # Stage 4: Fullscreen + Gamepad Heuristic
        # =========================================================================
        if active_win.get("is_fullscreen") and gamepad_info.get("connected"):
            # If not in whitelist
            if proc_lower not in PRODUCTIVITY_WHITELIST:
                return {
                    "state": "GAMING",
                    "reason": f"Heuristic: Fullscreen application with active Gamepad ({gamepad_info['details']})",
                    "stage": 4,
                    "violation": {"title": f"Fullscreen Controller App ({active_win['title']})", "process": active_win["process_name"]},
                    "active_window": active_win,
                    "shift": shift_info
                }

        # =========================================================================
        # Stage 5: Background / Minimized Window Scan (The Alt+Tab Defense!)
        # =========================================================================
        all_visible = enumerate_all_visible_windows()
        for win in all_visible:
            w_proc = win.get("process_name", "").lower()
            w_title = win.get("title", "").lower()

            # Check if a game is hiding in background
            if w_proc in GAME_PROCESSES or w_proc in EMULATORS:
                return {
                    "state": "BACKGROUND_GAMING",
                    "reason": f"Background Minimized Game Detected (Alt+Tab): {win.get('process_name')} ({win.get('title')})",
                    "stage": 5,
                    "violation": {"title": f"Minimized: {win.get('title')}", "process": win.get("process_name"), "pid": win.get("pid")},
                    "active_window": active_win,
                    "shift": shift_info
                }

            # Check if a betting or web game tab is open in background
            for bp in BROWSER_PATTERNS:
                if bp["category"] == "Gambling" and bp["pattern"].lower() in w_title:
                    return {
                        "state": "BACKGROUND_GAMING",
                        "reason": f"Background Gambling Portal: {bp['name']}",
                        "stage": 5,
                        "violation": {"title": f"Minimized Portal: {bp['name']}", "process": win.get("process_name")},
                        "active_window": active_win,
                        "shift": shift_info
                    }

        # =========================================================================
        # Stage 6: Anti-Bypass Evasion Processes
        # =========================================================================
        evasion_list = self.anti_tamper.scan_evasion_processes()
        if evasion_list:
            top_evasion = evasion_list[0]
            return {
                "state": "GAMING",
                "reason": f"Prohibited Evasion Tool: {top_evasion['name']} ({top_evasion['type']})",
                "stage": 6,
                "violation": {"title": f"Evasion Process: {top_evasion['name']}", "process": top_evasion["name"], "pid": top_evasion.get("pid")},
                "active_window": active_win,
                "shift": shift_info
            }

        # =========================================================================
        # Stage 7: Gaming Network Sockets Scan
        # =========================================================================
        gaming_sockets = self.anti_tamper.scan_gaming_network_sockets()
        if gaming_sockets:
            top_sock = gaming_sockets[0]
            return {
                "state": "GAMING",
                "reason": f"Active Gaming Socket: {top_sock['service']} -> {top_sock['remote_ip']}:{top_sock['remote_port']}",
                "stage": 7,
                "violation": {"title": f"Socket: {top_sock['service']}", "process": "network_traffic", "pid": top_sock.get("pid")},
                "active_window": active_win,
                "shift": shift_info
            }

        # =========================================================================
        # Stage 8: PE Header Cloaking / Disguise Scan
        # =========================================================================
        cloaked_procs = self.anti_tamper.scan_pe_header_cloaking()
        if cloaked_procs:
            top_cloak = cloaked_procs[0]
            return {
                "state": "GAMING",
                "reason": f"PE Disguise / Spoof Detected: {top_cloak['name']} located at {top_cloak['path']}",
                "stage": 8,
                "violation": {"title": f"Spoofed Process: {top_cloak['name']}", "process": top_cloak["name"], "pid": top_cloak.get("pid")},
                "active_window": active_win,
                "shift": shift_info
            }

        # All 8 stages passed clean: Normal productive work
        return {
            "state": "WORK",
            "reason": "Normal enterprise workflow",
            "stage": 8,
            "idle_seconds": idle_secs,
            "gamepad": gamepad_info,
            "active_window": active_win,
            "shift": shift_info,
            "violation": None
        }
