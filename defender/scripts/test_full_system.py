"""
Anuvadini Detector - Comprehensive System & Function Test Suite
Runs in-depth validation across:
1. MongoDB Database Functions
2. FastAPI REST APIs & Streaming Endpoints
3. Monitoring & Watcher Subsystems (Active Window, AFK, Controller)
4. Anti-Tamper & Security Scanners
5. Firewall & Blacklist Rules
6. Fleet Registration & Heartbeat Pipeline
7. Package Bundle & Installer Distribution
"""

import sys
import os
import time
import json
import urllib.request
import urllib.error
from datetime import datetime

# Path setup
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

# Ensure UTF-8 stdout on Windows
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

# Colors & Status markers
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

passed_tests = 0
failed_tests = 0

def report(name: str, passed: bool, extra: str = ""):
    global passed_tests, failed_tests
    if passed:
        passed_tests += 1
        print(f" {GREEN}[OK PASS]{RESET} {name} {extra}")
    else:
        failed_tests += 1
        print(f" {RED}[X FAIL]{RESET} {name} {extra}")

def test_database_functions():
    print(f"\n{CYAN}{BOLD}--- 1. Testing MongoDB Database Functions ---{RESET}")
    from anuvadini_detector.database import (
        get_db,
        upsert_workstation,
        get_fleet_workstations,
        get_fleet_stats,
        get_workstation_detail,
        log_violation,
        get_recent_violations,
        log_activity_tick,
        get_today_analytics,
        add_custom_rule,
        get_custom_rules,
        delete_custom_rule,
        queue_workstation_command,
        pop_workstation_commands,
        add_firewall_rule,
        get_firewall_rules,
        toggle_firewall_rule,
        delete_firewall_rule,
        log_firewall_event,
        get_firewall_logs,
        get_employee_by_id
    )

    db = get_db()
    # 1. DB Connectivity
    try:
        stats = db.command("dbstats")
        report("MongoDB Database Connectivity", True, f"(Collections: {stats.get('collections')}, Size: {round(stats.get('dataSize', 0)/1024, 1)} KB)")
    except Exception as e:
        report("MongoDB Database Connectivity", False, str(e))

    # 2. Workstation Upsert & Retrieval
    try:
        upsert_workstation(
            hostname="TEST-UNIT-PC",
            username="Test Employee",
            department="QA Testing",
            ip_address="192.168.1.99",
            status="ONLINE",
            current_app="vscode.exe",
            window_title="Visual Studio Code - Test",
            pid=12345,
            idle_seconds=12,
            is_fullscreen=False,
            is_controller=False,
            cpu_pct=4.5,
            ram_pct=32.0,
            employee_id="EMP-9999"
        )
        ws = get_workstation_detail("TEST-UNIT-PC")
        report("Workstation Upsert & Detail Lookup", ws is not None and ws.get("employee_id") == "EMP-9999", f"(Host: {ws.get('hostname') if ws else 'None'})")
    except Exception as e:
        report("Workstation Upsert & Detail Lookup", False, str(e))

    # 3. Employee ID Lookup
    try:
        emp = get_employee_by_id("EMP-9999")
        report("Employee UID Direct Lookup", emp is not None and emp.get("username") == "Test Employee")
    except Exception as e:
        report("Employee UID Direct Lookup", False, str(e))

    # 4. Fleet Stats
    try:
        fstats = get_fleet_stats()
        report("Fleet Analytics & Stats Calculation", fstats.get("total_workstations", 0) > 0, f"(Total: {fstats.get('total_workstations')}, Score: {fstats.get('health_score')}%)")
    except Exception as e:
        report("Fleet Analytics & Stats Calculation", False, str(e))

    # 5. Violation Logging & Query
    try:
        log_violation(
            hostname="TEST-UNIT-PC",
            username="Test Employee",
            game_name="Valorant Test",
            category="FPS Game",
            window_title="Valorant Client",
            process_name="valorant.exe",
            pid=12345,
            severity="HIGH"
        )
        viols = get_recent_violations(limit=25)
        found = any(v.get("game_name") == "Valorant Test" for v in viols)
        report("Violation Logging & Retrieval", found, f"(Recent Violations count: {len(viols)})")
    except Exception as e:
        report("Violation Logging & Retrieval", False, str(e))

    # 6. Activity Tick Logging & Analytics Pipeline
    try:
        log_activity_tick(process_name="code.exe", window_title="VSCode", category="Development", is_idle=False, is_gaming=False, tick_duration=2.0)
        log_activity_tick(process_name="cs2.exe", window_title="Counter-Strike 2", category="PC Game", is_idle=False, is_gaming=True, tick_duration=2.0)
        today_an = get_today_analytics()
        report("Activity Tick & MongoDB Aggregation Analytics", "work_pct" in today_an and "hourly_breakdown" in today_an, f"(Work: {today_an.get('work_pct')}%, Gaming: {today_an.get('gaming_pct')}%)")
    except Exception as e:
        report("Activity Tick & MongoDB Aggregation Analytics", False, str(e))

    # 7. Custom Rules CRUD & Sequence Generation
    try:
        ok_add = add_custom_rule(rule_type="process", pattern="cheatengine.exe", label="Cheat Engine", category="Hacking Tool")
        rules = get_custom_rules()
        created_rule = next((r for r in rules if r.get("pattern") == "cheatengine.exe"), None)
        ok_del = delete_custom_rule(created_rule["id"]) if created_rule else False
        report("Custom Rule Add / Sequence ID / Delete", ok_add and created_rule is not None and ok_del, f"(Created ID: {created_rule.get('id') if created_rule else 'None'})")
    except Exception as e:
        report("Custom Rule Add / Sequence ID / Delete", False, str(e))

    # 8. Command Queue & Pop
    try:
        queue_workstation_command("TEST-UNIT-PC", "show_warning", {"game_name": "Test Alert"})
        cmds = pop_workstation_commands("TEST-UNIT-PC")
        report("Remote Command Queue & FIFO Pop", len(cmds) > 0 and cmds[0].get("command_type") == "show_warning")
    except Exception as e:
        report("Remote Command Queue & FIFO Pop", False, str(e))

    # 9. Firewall Rules & Logs
    try:
        add_firewall_rule("test-block-target.xyz", "Testing Category", enabled=1)
        frules = get_firewall_rules()
        target_frule = next((r for r in frules if r.get("domain") == "test-block-target.xyz"), None)
        if target_frule:
            toggle_firewall_rule(target_frule["id"], 0)
            delete_firewall_rule(target_frule["id"])
        
        log_firewall_event("TEST-UNIT-PC", "Test Employee", "test-block-target.xyz", "Testing Category")
        flogs = get_firewall_logs(limit=5)
        event_found = any(l.get("domain") == "test-block-target.xyz" for l in flogs)
        report("Firewall Rules CRUD & Event Audit Logging", target_frule is not None and event_found)
    except Exception as e:
        report("Firewall Rules CRUD & Event Audit Logging", False, str(e))

    # 10. Automated Zero-Touch Attendance Timesheet
    try:
        from anuvadini_detector.database import record_attendance_tick, get_daily_timesheet
        record_attendance_tick("EMP-TEST", "Test Attendant", "Engineering", "TEST-UNIT-PC", is_idle=False, is_gaming=False, tick_duration=10.0)
        ts = get_daily_timesheet()
        found_ts = any(r.get("employee_id") == "EMP-TEST" for r in ts)
        report("Automated Zero-Touch Attendance Timesheet Engine", found_ts, f"(Timesheet records today: {len(ts)})")
        db.attendance_records.delete_one({"employee_id": "EMP-TEST"})
    except Exception as e:
        report("Automated Zero-Touch Attendance Timesheet Engine", False, str(e))

    # 11. In-Dashboard Incident Notification Engine
    try:
        from anuvadini_detector.database import add_admin_notification, get_admin_notifications, mark_notifications_read, clear_admin_notifications
        test_notif = add_admin_notification("EMP-9999", "Test Gamer", "TEST-HOST-01", "QA", "Grand Theft Auto V", "PC Game", "gta5.exe", 1234, "CRITICAL")
        notifs, unread = get_admin_notifications(limit=10, unread_only=True)
        found_notif = any(n.get("game_name") == "Grand Theft Auto V" for n in notifs)
        mark_notifications_read([test_notif.get("id")])
        _, unread_after = get_admin_notifications(limit=10, unread_only=True)
        report("In-Dashboard Incident Notification Engine", found_notif and unread_after < unread, f"(Created ID: {test_notif.get('id')})")
        db.admin_notifications.delete_one({"id": test_notif.get("id")})
    except Exception as e:
        report("In-Dashboard Incident Notification Engine", False, str(e))

    # Clean up test workstation
    db.workstations.delete_one({"hostname": "TEST-UNIT-PC"})

def test_monitoring_subsystems():
    print(f"\n{CYAN}{BOLD}--- 2. Testing Monitoring & Watcher Subsystems ---{RESET}")
    from anuvadini_detector.watcher import get_active_window, get_visible_windows, get_monitor_count
    from anuvadini_detector.afk import get_idle_seconds
    from anuvadini_detector.controller import is_controller_connected
    from anuvadini_detector.signatures import check_process_signature, check_window_title_signature
    from anuvadini_detector.anti_tamper import scan_gaming_network_sockets, scan_evasion_processes, scan_disguised_processes_pe
    from anuvadini_detector.heuristics import analyze_cursor_movement
    from anuvadini_detector.enforcer import lock_workstation

    # 1. Active Window & Multi-Monitor Count
    try:
        w = get_active_window()
        m_count = get_monitor_count()
        report("Active Window & Multi-Monitor Detection", isinstance(w, dict) and m_count >= 1, f"(Proc: {w.get('process_name')}, Monitors: {m_count})")
    except Exception as e:
        report("Active Window & Multi-Monitor Detection", False, str(e))

    # 2. Visible Windows
    try:
        wins = get_visible_windows()
        report("Desktop Visible Windows Enumeration", isinstance(wins, list), f"(Found {len(wins)} windows)")
    except Exception as e:
        report("Desktop Visible Windows Enumeration", False, str(e))

    # 3. AFK Tracker
    try:
        idle = get_idle_seconds()
        report("Cross-Platform AFK / Idle Detection", isinstance(idle, (int, float)) and idle >= 0, f"(Current idle: {idle:.1f}s)")
    except Exception as e:
        report("Cross-Platform AFK / Idle Detection", False, str(e))

    # 4. Controller Tracker
    try:
        ctrl = is_controller_connected()
        report("Gamepad / XInput Controller Tracker", isinstance(ctrl, dict) and "connected" in ctrl, f"(Status: {ctrl.get('status_text')})")
    except Exception as e:
        report("Gamepad / XInput Controller Tracker", False, str(e))

    # 5. Signatures
    try:
        sig_p = check_process_signature("cs2.exe")
        sig_w = check_window_title_signature("Poki - Free Online Games - Google Chrome")
        report("Game & Evasion Signatures Matching", sig_p is not None and sig_w is not None, f"(CS2 -> {sig_p.get('name') if sig_p else 'None'}, Title -> {sig_w.get('name') if sig_w else 'None'})")
    except Exception as e:
        report("Game & Evasion Signatures Matching", False, str(e))

    # 6. Anti-Tamper Scanners
    try:
        s = scan_gaming_network_sockets()
        e = scan_evasion_processes()
        c = scan_disguised_processes_pe()
        report("Anti-Tamper & Sockets / Evasion / Cloaking Scanners", isinstance(s, list) and isinstance(e, list) and isinstance(c, list))
    except Exception as e:
        report("Anti-Tamper & Sockets / Evasion / Cloaking Scanners", False, str(e))

    # 7. AI Synthetic Jiggler Movement Heuristics
    try:
        j = analyze_cursor_movement()
        report("AI Synthetic Jiggler & Bot Vector Analyzer", isinstance(j, dict) and "is_synthetic" in j, f"(Reason: {j.get('reason')})")
    except Exception as e:
        report("AI Synthetic Jiggler & Bot Vector Analyzer", False, str(e))

def test_api_endpoints():
    print(f"\n{CYAN}{BOLD}--- 3. Testing Backend REST & Streaming APIs (Port 8055) ---{RESET}")
    base_url = "http://127.0.0.1:8055"

    endpoints_get = [
        ("/", "Admin Web Dashboard UI (HTML)"),
        ("/download", "Official Client Download Portal (HTML)"),
        ("/api/status", "Core Engine State API"),
        ("/api/system/health", "System Diagnostics & MongoDB Health"),
        ("/api/fleet/stats", "Fleet Analytics Metrics"),
        ("/api/fleet", "Workstation Fleet Registry"),
        ("/api/fleet/lookup/EMP-1001", "Employee UID Lookup API"),
        ("/api/rules", "Custom Security Policy Rules"),
        ("/api/firewall/status", "Firewall Status & Sinkhole Health"),
        ("/api/firewall/rules", "Firewall Domain Blacklist Rules"),
        ("/api/firewall/logs", "Firewall Intercept Audit Logs"),
        ("/api/analytics", "Workplace Productivity & Gaming Analytics"),
        ("/api/violations", "Incident Violation Records"),
        ("/api/anti-tamper/audit", "Anti-Bypass & Dead-Man Switch Audit"),
        ("/api/attendance/timesheet", "Automated Daily Attendance Timesheet"),
        ("/api/attendance/timesheet/export", "Attendance Timesheet CSV Export"),
        ("/api/notifications", "In-Dashboard Notification Alert Feed"),
        ("/api/download/installer", "Windows 1-Click Installer (.bat)"),
        ("/api/download/mac-installer", "MacBook Client Installer (.sh)"),
        ("/api/download/client-bundle.zip", "Standalone Client Security Package (.zip)"),
        ("/api/report/csv", "Executive CSV Audit Report Generator")
    ]

    for path, desc in endpoints_get:
        url = base_url + path
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=5) as resp:
                status = resp.status
                ct = resp.headers.get("Content-Type", "")
                data = resp.read()
                report(f"{desc} [{path}]", status == 200 and len(data) > 0, f"(HTTP {status}, {len(data)} bytes)")
        except Exception as e:
            report(f"{desc} [{path}]", False, str(e))

    # POST Test: Register Workstation
    try:
        reg_url = base_url + "/api/fleet/register"
        reg_payload = json.dumps({
            "hostname": "API-TEST-HOST",
            "employee_id": "EMP-8888",
            "username": "Rest Test User",
            "department": "Engineering",
            "ip_address": "127.0.0.1"
        }).encode("utf-8")
        req = urllib.request.Request(reg_url, data=reg_payload, headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            report("Workstation Fleet Registration [POST /api/fleet/register]", data.get("success") is True)
    except Exception as e:
        report("Workstation Fleet Registration [POST /api/fleet/register]", False, str(e))

    # POST Test: Heartbeat
    try:
        hb_url = base_url + "/api/fleet/heartbeat"
        hb_payload = json.dumps({
            "hostname": "API-TEST-HOST",
            "employee_id": "EMP-8888",
            "username": "Rest Test User",
            "department": "Engineering",
            "ip_address": "127.0.0.1",
            "status": "ONLINE",
            "current_app": "pycharm.exe",
            "window_title": "Project - PyCharm",
            "pid": 5555,
            "idle_seconds": 5,
            "is_fullscreen": False,
            "anti_tamper": {
                "has_cloaked_pe": False,
                "has_gaming_sockets": False,
                "has_evasion_tools": False
            }
        }).encode("utf-8")
        req = urllib.request.Request(hb_url, data=hb_payload, headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            report("Workstation Heartbeat Telemetry [POST /api/fleet/heartbeat]", data.get("success") is True and "pending_commands" in data)
    except Exception as e:
        report("Workstation Heartbeat Telemetry [POST /api/fleet/heartbeat]", False, str(e))

    # POST Test: Simulate Notification Alert
    try:
        sim_url = base_url + "/api/notifications/simulate"
        sim_payload = json.dumps({
            "game_name": "Counter-Strike 2",
            "employee_id": "EMP-1002",
            "hostname": "DESKTOP-OPS-04",
            "severity": "CRITICAL"
        }).encode("utf-8")
        req = urllib.request.Request(sim_url, data=sim_payload, headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            report("Simulate In-Dashboard Incident Alert [POST /api/notifications/simulate]", data.get("success") is True and "notification" in data)
    except Exception as e:
        report("Simulate In-Dashboard Incident Alert [POST /api/notifications/simulate]", False, str(e))

    # POST Test: Mark Notifications Read
    try:
        read_url = base_url + "/api/notifications/read"
        req = urllib.request.Request(read_url, data=b"{}", headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            report("Mark In-Dashboard Notifications Read [POST /api/notifications/read]", data.get("success") is True and data.get("unread_count") == 0)
    except Exception as e:
        report("Mark In-Dashboard Notifications Read [POST /api/notifications/read]", False, str(e))

    # POST Test: Remote Command Lock Workstation
    try:
        cmd_url = base_url + "/api/fleet/API-TEST-HOST/command"
        cmd_payload = json.dumps({
            "command_type": "lock_workstation",
            "payload": {}
        }).encode("utf-8")
        req = urllib.request.Request(cmd_url, data=cmd_payload, headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            report("Remote Workstation Lock Command [POST /api/fleet/{host}/command]", data.get("queued") is True)
    except Exception as e:
        report("Remote Workstation Lock Command [POST /api/fleet/{host}/command]", False, str(e))

    # Clean up test host from DB
    from anuvadini_detector.database import get_db
    get_db().workstations.delete_one({"hostname": "API-TEST-HOST"})

def main():
    print(f"\n{BOLD}{'=' * 75}{RESET}")
    print(f"{BOLD}  ANUVADINI DETECTOR - COMPLETE SYSTEM & FUNCTION TEST SUITE{RESET}")
    print(f"{BOLD}  Validating: MongoDB, APIs, Watchers, Anti-Tamper, Stealth & Mac Flow{RESET}")
    print(f"{BOLD}{'=' * 75}{RESET}")

    test_database_functions()
    test_monitoring_subsystems()
    test_api_endpoints()

    print(f"\n{BOLD}{'=' * 75}{RESET}")
    print(f"{BOLD}  TEST RESULTS SUMMARY:{RESET}")
    print(f"  Passed: {GREEN}{passed_tests}{RESET}")
    print(f"  Failed: {RED}{failed_tests}{RESET}")
    total = passed_tests + failed_tests
    pct = round((passed_tests / total) * 100, 1) if total > 0 else 0
    print(f"  Success Rate: {BOLD}{pct}%{RESET}")
    print(f"{BOLD}{'=' * 75}{RESET}\n")

    if failed_tests > 0:
        sys.exit(1)
    else:
        sys.exit(0)

if __name__ == "__main__":
    main()
