"""
Anuvadini Detector - MongoDB Database & Persistence Layer
Stores violations, activity logs, custom rules, workplace fleet telemetry, and firewall policies.
Powered by MongoDB.
"""
import os
import re
import json
import socket
from datetime import datetime, date
from pathlib import Path
# Safe dnspython resolver initialization on Windows
try:
    import dns._features
    _orig_have = dns._features.have
    def _safe_have(feat):
        if feat == 'wmi':
            return False
        return _orig_have(feat)
    dns._features.have = _safe_have
    import dns.resolver
    _res = dns.resolver.get_default_resolver()
    if not _res.nameservers:
        _res.nameservers = ['8.8.8.8', '1.1.1.1', '8.8.4.4']
except Exception:
    pass

import pymongo
from pymongo import MongoClient, ReturnDocument

from anuvadini_detector.config import MONGO_URI, MONGO_DB_NAME, EVIDENCE_DIR
from anuvadini_detector.security import hash_password, verify_password, is_hashed

_client: MongoClient | None = None
_db = None

def get_mongo_client() -> MongoClient:
    """Singleton MongoDB Client."""
    global _client
    if _client is None:
        _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=4000)
    return _client

def get_db():
    """Retrieve active MongoDB Database reference."""
    global _db
    if _db is None:
        client = get_mongo_client()
        _db = client[MONGO_DB_NAME]
    return _db

# Backwards compatibility alias
def get_connection():
    return get_db()

def get_next_sequence(sequence_name: str) -> int:
    """Atomic auto-incrementing integer sequence generator for API ID compatibility."""
    db = get_db()
    res = db.counters.find_one_and_update(
        {"_id": sequence_name},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER
    )
    return res["seq"]

def init_db():
    """Initialize MongoDB collections and performance indexes."""
    try:
        db = get_db()

        # 1. Violations Collection
        db.violations.create_index([("date_str", pymongo.ASCENDING)])
        db.violations.create_index([("id", pymongo.DESCENDING)])
        db.violations.create_index([("hostname", pymongo.ASCENDING)])
        db.violations.create_index([("process_name", pymongo.ASCENDING)])

        # 2. Activity Logs Collection
        db.activity_logs.create_index([("date_str", pymongo.ASCENDING), ("hour", pymongo.ASCENDING)])

        # 3. Custom Rules Collection
        db.custom_rules.create_index([("pattern", pymongo.ASCENDING)], unique=True)
        db.custom_rules.create_index([("id", pymongo.ASCENDING)])

        # 3b. Firewall exemptions (people/roles allowed to bypass part of the blocklist)
        db.firewall_exemptions.create_index([("id", pymongo.ASCENDING)])
        db.firewall_exemptions.create_index([("employee_id", pymongo.ASCENDING)])
        db.firewall_exemptions.create_index([("target_type", pymongo.ASCENDING), ("role", pymongo.ASCENDING)])
        db.firewall_roles.create_index([("name", pymongo.ASCENDING)], unique=True)
        db.firewall_roles.create_index([("id", pymongo.ASCENDING)])

        # 4. System Settings Collection
        db.system_settings.create_index([("key", pymongo.ASCENDING)], unique=True)

        # 5. Workstations Collection (Company-wide Multi-Employee Fleet)
        db.workstations.create_index([("hostname", pymongo.ASCENDING)], unique=True)
        db.workstations.create_index([("department", pymongo.ASCENDING)])
        db.workstations.create_index([("status", pymongo.ASCENDING)])
        db.workstations.create_index([("employee_id", pymongo.ASCENDING)])

        # 6. Pending Remote Commands Queue
        db.pending_commands.create_index([("hostname", pymongo.ASCENDING), ("status", pymongo.ASCENDING)])
        db.pending_commands.create_index([("id", pymongo.ASCENDING)])

        # 7. Firewall Rules Collection
        db.firewall_rules.create_index([("domain", pymongo.ASCENDING)], unique=True)
        db.firewall_rules.create_index([("id", pymongo.ASCENDING)])

        # 8. Firewall Logs Collection
        db.firewall_logs.create_index([("timestamp", pymongo.DESCENDING)])
        db.firewall_logs.create_index([("employee_id", pymongo.ASCENDING)])
        db.firewall_logs.create_index([("id", pymongo.DESCENDING)])

        # 9. Attendance & Timesheets Collection (Zero-Touch Biometric Tracking)
        db.attendance_records.create_index([("date_str", pymongo.ASCENDING), ("employee_id", pymongo.ASCENDING)], unique=True)
        db.attendance_records.create_index([("status", pymongo.ASCENDING)])

        # 10. Admin In-Dashboard Notifications Collection
        db.admin_notifications.create_index([("created_at", pymongo.DESCENDING)])
        db.admin_notifications.create_index([("is_read", pymongo.ASCENDING)])
        db.admin_notifications.create_index([("id", pymongo.DESCENDING)])

        # 11. Employees Registry Collection (ID, Name, Dept, Credentials)
        db.employees.create_index([("employee_id", pymongo.ASCENDING)], unique=True)
        db.employees.create_index([("name", pymongo.ASCENDING)])
        db.employees.create_index([("department", pymongo.ASCENDING)])

        # 12. Per-App Activity Timeline Collection
        # One doc per (date, employee_id, app_name) — accumulates seconds spent in that app
        db.app_activity.create_index(
            [("date_str", pymongo.ASCENDING), ("employee_id", pymongo.ASCENDING), ("app_name", pymongo.ASCENDING)],
            unique=True
        )
        db.app_activity.create_index([("date_str", pymongo.ASCENDING), ("employee_id", pymongo.ASCENDING)])

        # 13. App Switch Events — raw timeline (every time employee switches app, one row)
        db.app_events.create_index([("date_str", pymongo.ASCENDING), ("employee_id", pymongo.ASCENDING)])
        db.app_events.create_index([("ts", pymongo.DESCENDING)])

        # Seed employee registry and demo fleet
        seed_employees_registry()
        migrate_plaintext_passwords()
        seed_demo_fleet_if_empty()
        ensure_firewall_roles()
    except Exception as e:
        print(f"[MongoDB Error] init_db: {e}")

# True when the last log_violation() call created a NEW incident row (not a merge into an existing one).
LAST_VIOLATION_IS_NEW = False

def log_violation(hostname: str, username: str, game_name: str, category: str,
                  window_title: str, process_name: str, pid: int,
                  screenshot_filename: str = None, severity: str = "HIGH", merge: bool = True) -> int:
    """Insert or update a violation event in MongoDB."""
    global LAST_VIOLATION_IS_NEW
    LAST_VIOLATION_IS_NEW = False
    db = get_db()
    now = datetime.now()
    now_str = now.strftime("%Y-%m-%d %H:%M:%S")
    date_str = now.strftime("%Y-%m-%d")

    # Check if a recent violation for this process is already ongoing (within current day)
    recent = None if not merge else db.violations.find_one(
        {"date_str": date_str, "hostname": hostname, "process_name": process_name, "game_name": game_name, "status": "DETECTED"},
        sort=[("id", pymongo.DESCENDING)]
    )

    if recent:
        v_id = recent.get("id", 1)
        new_dur = (recent.get("duration_seconds") or 0.0) + 2.0
        db.violations.update_one(
            {"_id": recent["_id"]},
            {"$set": {"duration_seconds": new_dur, "timestamp": now_str}}
        )
        return v_id
    else:
        v_id = get_next_sequence("violations")
        doc = {
            "id": v_id,
            "timestamp": now_str,
            "date_str": date_str,
            "hostname": hostname,
            "username": username,
            "game_name": game_name,
            "category": category,
            "window_title": window_title,
            "process_name": process_name,
            "pid": pid,
            "duration_seconds": 2.0,
            "screenshot_filename": screenshot_filename,
            "severity": severity,
            "status": "DETECTED"
        }
        db.violations.insert_one(doc)
        LAST_VIOLATION_IS_NEW = True
        return v_id

def log_activity_tick(process_name: str, window_title: str, category: str, is_idle: bool, is_gaming: bool, tick_duration: float = 2.0):
    """Log an activity heartbeat to aggregate daily productivity."""
    db = get_db()
    now = datetime.now()
    now_str = now.strftime("%Y-%m-%d %H:%M:%S")
    date_str = now.strftime("%Y-%m-%d")
    hour = now.hour

    doc = {
        "timestamp": now_str,
        "date_str": date_str,
        "hour": hour,
        "process_name": process_name,
        "window_title": window_title,
        "category": category,
        "is_idle": 1 if is_idle else 0,
        "is_gaming": 1 if is_gaming else 0,
        "duration_seconds": tick_duration
    }
    db.activity_logs.insert_one(doc)

def get_recent_violations(limit: int = 50) -> list[dict]:
    """Retrieve latest logged violations from MongoDB."""
    db = get_db()
    cursor = db.violations.find({}, {"_id": 0}).sort("id", pymongo.DESCENDING).limit(limit)
    return list(cursor)

def get_today_analytics() -> dict:
    """Calculate today's productivity ratios, top games, and hourly activity."""
    db = get_db()
    today_str = date.today().strftime("%Y-%m-%d")

    # Productivity Ratios
    pipeline = [
        {"$match": {"date_str": today_str}},
        {"$group": {
            "_id": None,
            "gaming_time": {"$sum": {"$cond": [{"$eq": ["$is_gaming", 1]}, "$duration_seconds", 0]}},
            "idle_time": {"$sum": {"$cond": [{"$and": [{"$eq": ["$is_idle", 1]}, {"$eq": ["$is_gaming", 0]}]}, "$duration_seconds", 0]}},
            "work_time": {"$sum": {"$cond": [{"$and": [{"$eq": ["$is_idle", 0]}, {"$eq": ["$is_gaming", 0]}]}, "$duration_seconds", 0]}},
            "total_ticks": {"$sum": 1}
        }}
    ]
    res = list(db.activity_logs.aggregate(pipeline))
    if res:
        r = res[0]
        gaming_sec = r.get("gaming_time", 0.0)
        idle_sec = r.get("idle_time", 0.0)
        work_sec = r.get("work_time", 0.0)
    else:
        gaming_sec, idle_sec, work_sec = 0.0, 0.0, 0.0

    total_sec = gaming_sec + idle_sec + work_sec
    if total_sec > 0:
        gaming_pct = round((gaming_sec / total_sec) * 100, 1)
        idle_pct = round((idle_sec / total_sec) * 100, 1)
        work_pct = round((work_sec / total_sec) * 100, 1)
    else:
        gaming_pct, idle_pct, work_pct = 0.0, 0.0, 100.0

    # Top Games Detected Today
    top_pipeline = [
        {"$match": {"date_str": today_str}},
        {"$group": {
            "_id": "$game_name",
            "category": {"$first": "$category"},
            "total_duration": {"$sum": "$duration_seconds"},
            "incidents": {"$sum": 1}
        }},
        {"$sort": {"total_duration": pymongo.DESCENDING}},
        {"$limit": 5}
    ]
    top_games = []
    for g in db.violations.aggregate(top_pipeline):
        top_games.append({
            "game_name": g["_id"],
            "category": g["category"],
            "total_duration": g["total_duration"],
            "incidents": g["incidents"]
        })

    # Hourly Breakdown (09:00 to 18:00)
    hourly_pipeline = [
        {"$match": {"date_str": today_str}},
        {"$group": {
            "_id": "$hour",
            "gaming_time": {"$sum": {"$cond": [{"$eq": ["$is_gaming", 1]}, "$duration_seconds", 0]}},
            "work_time": {"$sum": {"$cond": [{"$and": [{"$eq": ["$is_idle", 0]}, {"$eq": ["$is_gaming", 0]}]}, "$duration_seconds", 0]}}
        }}
    ]
    hourly_map = {h["_id"]: h for h in db.activity_logs.aggregate(hourly_pipeline)}
    hourly_breakdown = []
    for h in range(9, 19):
        hour_label = f"{h:02d}:00"
        h_data = hourly_map.get(h, {})
        hourly_breakdown.append({
            "hour": hour_label,
            "gaming_mins": round(h_data.get("gaming_time", 0.0) / 60, 1),
            "work_mins": round(h_data.get("work_time", 0.0) / 60, 1)
        })

    total_violations = db.violations.count_documents({"date_str": today_str})

    return {
        "work_pct": work_pct,
        "gaming_pct": gaming_pct,
        "idle_pct": idle_pct,
        "total_violations": total_violations,
        "top_games": top_games,
        "hourly_breakdown": hourly_breakdown
    }

def get_custom_rules() -> list[dict]:
    """Retrieve all custom detection rules from MongoDB."""
    db = get_db()
    return list(db.custom_rules.find({}, {"_id": 0}).sort("id", pymongo.ASCENDING))

def add_custom_rule(rule_type: str, pattern: str, label: str, category: str, action: str = "alert") -> bool:
    """Add or update a custom rule in MongoDB."""
    try:
        db = get_db()
        pattern = pattern.strip()
        existing = db.custom_rules.find_one({"pattern": pattern})
        r_id = existing["id"] if existing else get_next_sequence("custom_rules")
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        db.custom_rules.update_one(
            {"pattern": pattern},
            {"$set": {
                "id": r_id,
                "rule_type": rule_type,
                "pattern": pattern,
                "label": label,
                "category": category,
                "action": action,
                "created_at": now_str
            }},
            upsert=True
        )
        return True
    except Exception as e:
        print(f"[MongoDB Error] add_custom_rule: {e}")
        return False

def delete_custom_rule(rule_id: int) -> bool:
    """Delete a custom rule by ID from MongoDB."""
    db = get_db()
    res = db.custom_rules.delete_one({"id": rule_id})
    return res.deleted_count > 0

def get_setting(key: str, default: str = "") -> str:
    """Fetch setting value from MongoDB."""
    try:
        db = get_db()
        doc = db.system_settings.find_one({"key": key})
        return doc["value"] if doc and "value" in doc else default
    except Exception:
        return default

def set_setting(key: str, value: str) -> bool:
    """Save setting key-value pair to MongoDB."""
    try:
        db = get_db()
        db.system_settings.update_one(
            {"key": key},
            {"$set": {"value": str(value)}},
            upsert=True
        )
        return True
    except Exception as e:
        print(f"[MongoDB Error] set_setting: {e}")
        return False

def upsert_workstation(
    hostname: str,
    username: str,
    department: str = "Engineering",
    ip_address: str = "127.0.0.1",
    status: str = "ONLINE",
    current_app: str = "Idle",
    window_title: str = "",
    pid: int = 0,
    idle_seconds: float = 0.0,
    is_fullscreen: bool = False,
    is_controller: bool = False,
    cpu_pct: float = None,
    ram_pct: float = None,
    employee_id: str = "EMP-001",
    tunnel_status: str = "CONNECTED"
) -> bool:
    """Insert or update a workstation record in MongoDB."""
    try:
        db = get_db()
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        update_doc = {
            "hostname": hostname,
            "username": username,
            "department": department,
            "ip_address": ip_address,
            "status": status,
            "tunnel_status": tunnel_status,
            "current_app": current_app,
            "window_title": window_title,
            "pid": pid,
            "idle_seconds": idle_seconds,
            "is_fullscreen": 1 if is_fullscreen else 0,
            "is_controller": 1 if is_controller else 0,
            "last_heartbeat": now_str
        }
        # Only store telemetry the agent actually reported (never invent CPU / RAM figures).
        if cpu_pct is not None:
            update_doc["cpu_pct"] = cpu_pct
        if ram_pct is not None:
            update_doc["ram_pct"] = ram_pct
        if employee_id:
            update_doc["employee_id"] = employee_id

        db.workstations.update_one(
            {"hostname": hostname},
            {"$set": update_doc},
            upsert=True
        )
        return True
    except Exception as e:
        print(f"[MongoDB Error] upsert_workstation: {e}")
        return False

def get_fleet_workstations(department: str = None, status: str = None, search: str = None) -> list[dict]:
    """Query workstations with filtering by department, alert status, and search string."""
    db = get_db()
    query = {}

    if department and department.upper() != "ALL":
        query["department"] = department

    if status and status.upper() != "ALL":
        if status == "GAMING_ALERT":
            query["status"] = "GAMING_ALERT"
        elif status == "IDLE":
            query["status"] = "IDLE"
        elif status == "PRODUCTIVE":
            query["status"] = {"$in": ["PRODUCTIVE", "ONLINE"]}

    if search:
        s = search.strip()
        reg = {"$regex": re.escape(s), "$options": "i"}
        query["$or"] = [
            {"hostname": reg},
            {"username": reg},
            {"employee_id": reg},
            {"current_app": reg},
            {"window_title": reg}
        ]

    workstations = list(db.workstations.find(query, {"_id": 0}))

    # Sort: Current machine first, then GAMING_ALERT (1), IDLE next (2), else (3)
    curr_host = socket.gethostname().lower()
    def sort_key(w):
        st = w.get("status", "")
        h = (w.get("hostname") or "").lower()
        is_me = 0 if h == curr_host else 1
        prio = 1 if st == "GAMING_ALERT" else (2 if st == "IDLE" else 3)
        return (is_me, prio, w.get("hostname", ""))

    workstations.sort(key=sort_key)
    return workstations

def get_fleet_stats() -> dict:
    """Return fleet overview counters and company productivity score from MongoDB.

    Offline PCs (agent killed / not reporting) are counted separately and are NOT part of the compliance score:
    a machine that is not reporting must never be shown as "on-task".
    """
    db = get_db()
    total = db.workstations.count_documents({})
    slacking = db.workstations.count_documents({"status": "GAMING_ALERT"})
    idle = db.workstations.count_documents({"status": "IDLE"})
    offline = db.workstations.count_documents({"status": {"$in": ["TAMPER_ALERT", "OFFLINE"]}})
    productive = db.workstations.count_documents({"status": {"$in": ["PRODUCTIVE", "ONLINE"]}})
    controllers = db.workstations.count_documents({"is_controller": 1})
    reporting = max(0, total - offline)

    # Share of REPORTING machines that are on-task (idle counts half). 0 reporting machines -> 0, not a fake 100.
    health_score = round(((productive + (idle * 0.5)) / reporting) * 100) if reporting > 0 else 0

    return {
        "total_workstations": total,
        "reporting_count": reporting,
        "offline_count": offline,
        "slacking_count": slacking,
        "idle_count": idle,
        "productive_count": productive,
        "controller_count": controllers,
        "health_score": health_score
    }

def delete_workstation(hostname: str) -> bool:
    """Remove a workstation record (offline / retired / demo PC) from the fleet. Incident history is kept."""
    try:
        db = get_db()
        res = db.workstations.delete_one({"hostname": hostname})
        db.pending_commands.delete_many({"hostname": hostname})
        try:
            _screen_frame_path(hostname).unlink()
        except Exception:
            pass
        return res.deleted_count > 0
    except Exception as e:
        print(f"[MongoDB Error] delete_workstation: {e}")
        return False

def get_workstation_detail(hostname: str) -> dict | None:
    """Retrieve detailed workstation info along with its recent violation events."""
    db = get_db()
    ws = db.workstations.find_one({"hostname": hostname}, {"_id": 0})
    if not ws:
        return None
    violations = list(db.violations.find({"hostname": hostname}, {"_id": 0}).sort("id", pymongo.DESCENDING).limit(10))
    ws["recent_violations"] = violations
    return ws

def queue_workstation_command(hostname: str, command_type: str, payload: dict) -> bool:
    """Queue a remote IT administrative command for an agent workstation."""
    try:
        db = get_db()
        c_id = get_next_sequence("pending_commands")
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        doc = {
            "id": c_id,
            "hostname": hostname,
            "command_type": command_type,
            "payload": payload,
            "status": "PENDING",
            "created_at": now_str
        }
        db.pending_commands.insert_one(doc)
        return True
    except Exception as e:
        print(f"[MongoDB Error] queue_workstation_command: {e}")
        return False

def pop_workstation_commands(hostname: str) -> list[dict]:
    """Retrieve pending commands for an agent and mark them EXECUTED."""
    try:
        db = get_db()
        pending = list(db.pending_commands.find({"hostname": hostname, "status": "PENDING"}, {"_id": 0}).sort("id", pymongo.ASCENDING))
        if pending:
            ids = [p["id"] for p in pending]
            db.pending_commands.update_many({"id": {"$in": ids}}, {"$set": {"status": "EXECUTED"}})
        return pending
    except Exception as e:
        print(f"[MongoDB Error] pop_workstation_commands: {e}")
        return []

def seed_employees_registry():
    """Populates verified enterprise employee credentials and profiles into MongoDB."""
    try:
        db = get_db()
        official_employees = [
            {
                "employee_id": "9310790241",
                "name": "Authorized Officer",
                "department": "Anuvadini foundation",
                "password": "9310790241",
                "role": "Super Administrator & Lead",
                "status": "ACTIVE"
            },
            {
                "employee_id": "EMP-1001",
                "name": "Rahul Sharma",
                "department": "Engineering",
                "password": "9310790241",
                "role": "Senior Software Engineer",
                "status": "ACTIVE"
            },
            {
                "employee_id": "EMP-1002",
                "name": "Ananya Roy",
                "department": "Engineering",
                "password": "9310790241",
                "role": "Backend Architect",
                "status": "ACTIVE"
            },
            {
                "employee_id": "EMP-1003",
                "name": "Rohan Mehta",
                "department": "Engineering",
                "password": "9310790241",
                "role": "Frontend Developer",
                "status": "ACTIVE"
            },
            {
                "employee_id": "EMP-1005",
                "name": "Deepak Choudhury",
                "department": "DevOps",
                "password": "9310790241",
                "role": "SRE & Cloud Infra",
                "status": "ACTIVE"
            },
            {
                "employee_id": "EMP-1007",
                "name": "Priya Patel",
                "department": "Design",
                "password": "9310790241",
                "role": "Lead UX/UI Designer",
                "status": "ACTIVE"
            },
            {
                "employee_id": "EMP-1010",
                "name": "Pooja Reddy",
                "department": "QA",
                "password": "9310790241",
                "role": "QA Test Engineer",
                "status": "ACTIVE"
            },
            {
                "employee_id": "EMP-1012",
                "name": "Sneha Gupta",
                "department": "Marketing",
                "password": "9310790241",
                "role": "Product Marketing Manager",
                "status": "ACTIVE"
            },
            {
                "employee_id": "EMP-1014",
                "name": "Arjun Verma",
                "department": "Sales",
                "password": "9310790241",
                "role": "Enterprise Account Exec",
                "status": "ACTIVE"
            },
            {
                "employee_id": "EMP-1016",
                "name": "Meera Nambiar",
                "department": "HR",
                "password": "9310790241",
                "role": "HR & People Operations",
                "status": "ACTIVE"
            }
        ]
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        # Sample EMP-xxxx staff are demo data: opt-in only (DEFENDER_SEED_DEMO=1), never created on a normal start.
        if os.environ.get("DEFENDER_SEED_DEMO") != "1":
            official_employees = [e for e in official_employees if not str(e.get("employee_id", "")).startswith("EMP-")]
        for emp in official_employees:
            doc = dict(emp)
            initial_password = doc.pop("password", None)
            doc["updated_at"] = now_str
            update = {"$set": doc}
            if initial_password:
                # Only set on first creation (hashed); a restart must never reset a changed password.
                update["$setOnInsert"] = {"password": hash_password(initial_password)}
            db.employees.update_one(
                {"employee_id": emp["employee_id"]},
                update,
                upsert=True
            )
    except Exception as e:
        print(f"[MongoDB Error] seed_employees_registry: {e}")

def migrate_plaintext_passwords() -> int:
    """Hash any employee password still stored as plaintext. Returns how many were upgraded."""
    try:
        db = get_db()
        n = 0
        for emp in db.employees.find({"password": {"$exists": True}}, {"password": 1}):
            pwd = emp.get("password")
            if isinstance(pwd, str) and pwd and not is_hashed(pwd):
                db.employees.update_one({"_id": emp["_id"]}, {"$set": {"password": hash_password(pwd)}})
                n += 1
        return n
    except Exception as e:
        print(f"[MongoDB Error] migrate_plaintext_passwords: {e}")
        return 0

def seed_demo_fleet_if_empty():
    """Populates initial company fleet workstations in MongoDB if none exist."""
    db = get_db()
    current_host = socket.gethostname()
    
    # Always register current machine as the primary workstation for Authorized Officer
    upsert_workstation(
        hostname=current_host,
        employee_id="9310790241",
        username="Authorized Officer",
        department="Anuvadini foundation",
        ip_address="127.0.0.1",
        status="ONLINE",
        tunnel_status="CONNECTED",
        current_app="Code.exe",
        window_title="anuvadini_detector - Visual Studio Code",
        pid=2048,
        idle_seconds=0.0,
        is_fullscreen=False,
        is_controller=False,
        cpu_pct=14.5,
        ram_pct=42.0
    )
    # Clean up redundant legacy mock hostnames if present
    db.workstations.delete_many({"hostname": {"$in": ["HQ-ANUVADINI-01", "ANUVADINI-LAPTOP-01"]}})

    cnt = db.workstations.count_documents({})
    if cnt > 1:
        return
    # Demo workstations are opt-in (DEFENDER_SEED_DEMO=1); a real deployment only lists real, enrolled PCs.
    if os.environ.get("DEFENDER_SEED_DEMO") != "1":
        return

    demo_workstations = [
        {
            "hostname": current_host,
            "employee_id": "9310790241",
            "username": "Authorized Officer",
            "department": "Anuvadini foundation",
            "ip_address": "127.0.0.1",
            "status": "ONLINE",
            "tunnel_status": "CONNECTED",
            "current_app": "Code.exe",
            "window_title": "anuvadini_detector - Visual Studio Code",
            "pid": 2048,
            "idle_seconds": 0.0,
            "is_fullscreen": 0,
            "is_controller": 0,
            "cpu_pct": 14.5,
            "ram_pct": 42.0
        },
        {
            "hostname": "DEL-ENG-WS01",
            "employee_id": "EMP-1001",
            "username": "Rahul Sharma",
            "department": "Engineering",
            "ip_address": "192.168.1.101",
            "status": "PRODUCTIVE",
            "tunnel_status": "CONNECTED",
            "current_app": "Code.exe",
            "window_title": "anuvadini_detector - Visual Studio Code",
            "pid": 4120,
            "idle_seconds": 2.0,
            "is_fullscreen": 0,
            "is_controller": 0,
            "cpu_pct": 14.2,
            "ram_pct": 45.1
        },
        {
            "hostname": "DEL-ENG-WS02",
            "employee_id": "EMP-1002",
            "username": "Ananya Roy",
            "department": "Engineering",
            "ip_address": "192.168.1.102",
            "status": "PRODUCTIVE",
            "tunnel_status": "CONNECTED",
            "current_app": "idea64.exe",
            "window_title": "Backend Microservices - IntelliJ IDEA 2024.2",
            "pid": 5820,
            "idle_seconds": 4.0,
            "is_fullscreen": 0,
            "is_controller": 0,
            "cpu_pct": 28.4,
            "ram_pct": 62.0
        },
        {
            "hostname": "DEL-ENG-WS03",
            "employee_id": "EMP-1003",
            "username": "Rohan Mehta",
            "department": "Engineering",
            "ip_address": "192.168.1.103",
            "status": "GAMING_ALERT",
            "tunnel_status": "CONNECTED",
            "current_app": "chrome.exe",
            "window_title": "Chess.com - Live Blitz 3|2 Game vs Grandmaster",
            "pid": 7180,
            "idle_seconds": 1.0,
            "is_fullscreen": 0,
            "is_controller": 0,
            "cpu_pct": 19.5,
            "ram_pct": 53.0
        },
        {
            "hostname": "DEL-OPS-WS01",
            "employee_id": "EMP-1005",
            "username": "Deepak Choudhury",
            "department": "DevOps",
            "ip_address": "192.168.1.111",
            "status": "PRODUCTIVE",
            "tunnel_status": "CONNECTED",
            "current_app": "WindowsTerminal.exe",
            "window_title": "kubectl logs -f deployment/anuvadini-gateway -n prod",
            "pid": 5890,
            "idle_seconds": 5.0,
            "is_fullscreen": 0,
            "is_controller": 0,
            "cpu_pct": 11.0,
            "ram_pct": 41.5
        },
        {
            "hostname": "DEL-DES-WS01",
            "employee_id": "EMP-1007",
            "username": "Priya Patel",
            "department": "Design",
            "ip_address": "192.168.1.121",
            "status": "PRODUCTIVE",
            "tunnel_status": "CONNECTED",
            "current_app": "Figma.exe",
            "window_title": "Enterprise Design System v3.2 - Figma",
            "pid": 7821,
            "idle_seconds": 3.0,
            "is_fullscreen": 0,
            "is_controller": 0,
            "cpu_pct": 24.0,
            "ram_pct": 61.4
        },
        {
            "hostname": "DEL-QA-WS01",
            "employee_id": "EMP-1010",
            "username": "Pooja Reddy",
            "department": "QA",
            "ip_address": "192.168.1.131",
            "status": "PRODUCTIVE",
            "tunnel_status": "CONNECTED",
            "current_app": "Postman.exe",
            "window_title": "Anuvadini API Test Automation Suite - Postman",
            "pid": 4721,
            "idle_seconds": 12.0,
            "is_fullscreen": 0,
            "is_controller": 0,
            "cpu_pct": 17.2,
            "ram_pct": 51.0
        },
        {
            "hostname": "DEL-MKT-WS01",
            "employee_id": "EMP-1012",
            "username": "Sneha Gupta",
            "department": "Marketing",
            "ip_address": "192.168.1.141",
            "status": "PRODUCTIVE",
            "tunnel_status": "CONNECTED",
            "current_app": "chrome.exe",
            "window_title": "Google Analytics 4 - Enterprise User Funnel",
            "pid": 6214,
            "idle_seconds": 8.0,
            "is_fullscreen": 0,
            "is_controller": 0,
            "cpu_pct": 15.5,
            "ram_pct": 48.0
        },
        {
            "hostname": "DEL-SAL-WS01",
            "employee_id": "EMP-1014",
            "username": "Arjun Verma",
            "department": "Sales",
            "ip_address": "192.168.1.151",
            "status": "GAMING_ALERT",
            "tunnel_status": "CONNECTED",
            "current_app": "msedge.exe",
            "window_title": "Play Subway Surfers Online - Poki Games",
            "pid": 5512,
            "idle_seconds": 0.5,
            "is_fullscreen": 0,
            "is_controller": 1,
            "cpu_pct": 29.5,
            "ram_pct": 54.0
        },
        {
            "hostname": "DEL-HR-WS01",
            "employee_id": "EMP-1016",
            "username": "Meera Nambiar",
            "department": "HR",
            "ip_address": "192.168.1.161",
            "status": "PRODUCTIVE",
            "tunnel_status": "CONNECTED",
            "current_app": "EXCEL.exe",
            "window_title": "Q4_Employee_Performance_Appraisal_Matrix.xlsx - Excel",
            "pid": 2984,
            "idle_seconds": 18.0,
            "is_fullscreen": 0,
            "is_controller": 0,
            "cpu_pct": 8.8,
            "ram_pct": 39.0
        }
    ]

    for ws in demo_workstations:
        upsert_workstation(
            hostname=ws["hostname"],
            username=ws["username"],
            department=ws["department"],
            ip_address=ws["ip_address"],
            status=ws["status"],
            tunnel_status=ws.get("tunnel_status", "CONNECTED"),
            current_app=ws["current_app"],
            window_title=ws["window_title"],
            pid=ws["pid"],
            idle_seconds=ws["idle_seconds"],
            is_fullscreen=bool(ws["is_fullscreen"]),
            is_controller=bool(ws["is_controller"]),
            cpu_pct=ws["cpu_pct"],
            ram_pct=ws["ram_pct"],
            employee_id=ws["employee_id"]
        )

def lookup_employee_by_id(employee_id: str) -> dict | None:
    """Lookup employee profile by exact or partial employee UID in MongoDB."""
    try:
        db = get_db()
        emp_id = str(employee_id).strip()
        # 1. Search employees collection
        emp = db.employees.find_one({"employee_id": emp_id}, {"_id": 0, "password": 0})
        if not emp:
            emp = db.employees.find_one({"employee_id": {"$regex": f"^{re.escape(emp_id)}$", "$options": "i"}}, {"_id": 0, "password": 0})
        if emp:
            return {
                "found": True,
                "employee_id": emp.get("employee_id"),
                "name": emp.get("name"),
                "department": emp.get("department", "Anuvadini foundation"),
                "role": emp.get("role", "Employee"),
                "status": emp.get("status", "ACTIVE")
            }
        # 2. Fallback search workstations
        ws = db.workstations.find_one({"employee_id": {"$regex": re.escape(emp_id), "$options": "i"}}, {"_id": 0})
        if ws:
            return {
                "found": True,
                "employee_id": ws.get("employee_id"),
                "name": ws.get("username"),
                "department": ws.get("department", "Engineering"),
                "role": "Staff",
                "status": "ACTIVE"
            }
        return None
    except Exception as e:
        print(f"[MongoDB Error] lookup_employee_by_id: {e}")
        return None

def authenticate_employee_credentials(employee_id: str, password: str, client_ip: str, hostname: str) -> dict:
    """Authenticate employee credentials and register their workstation with IP address in MongoDB."""
    try:
        db = get_db()
        emp_id = str(employee_id).strip()
        pwd = str(password).strip()
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        emp = db.employees.find_one({"employee_id": emp_id})
        if not emp:
            emp = db.employees.find_one({"employee_id": {"$regex": f"^{re.escape(emp_id)}$", "$options": "i"}})

        # Same message for unknown ID and wrong password so IDs cannot be enumerated through login.
        if not emp or not verify_password(pwd, emp.get("password")):
            return {"success": False, "error": "Invalid employee ID or password."}

        if not is_hashed(emp.get("password")):
            db.employees.update_one({"_id": emp["_id"]}, {"$set": {"password": hash_password(pwd)}})

        # Update employee profile with latest login, captured IP and machine hostname
        db.employees.update_one(
            {"_id": emp["_id"]},
            {"$set": {
                "last_login": now_str,
                "last_ip": client_ip,
                "last_hostname": hostname,
                "tunnel_status": "CONNECTED"
            }}
        )

        # Bind and register workstation with this employee and captured IP
        upsert_workstation(
            hostname=hostname,
            username=emp.get("name", "Employee"),
            department=emp.get("department", "Anuvadini foundation"),
            ip_address=client_ip,
            status="ONLINE",
            tunnel_status="CONNECTED",
            current_app="Client Enrolled",
            window_title=f"Workstation Bound to {emp.get('name')} ({emp_id})",
            employee_id=emp_id
        )

        return {
            "success": True,
            "message": f"Welcome, {emp.get('name')}! Workstation verified and encrypted tunnel active.",
            "employee_id": emp.get("employee_id"),
            "name": emp.get("name"),
            "department": emp.get("department"),
            "client_ip": client_ip,
            "hostname": hostname,
            "tunnel_status": "CONNECTED"
        }
    except Exception as e:
        print(f"[MongoDB Error] authenticate_employee_credentials: {e}")
        return {"success": False, "error": str(e)}

def _screen_frame_path(hostname: str) -> Path:
    """Path of a workstation's latest screen frame. The hostname is sanitised: it comes from the network."""
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", str(hostname or ""))[:100] or "unknown"
    return EVIDENCE_DIR / f"screen_{safe}.jpg"

def get_workstation_screen_frame_age(hostname: str) -> float | None:
    """Seconds since the agent last uploaded a frame (None = never)."""
    try:
        target = _screen_frame_path(hostname)
        if target.exists():
            return max(0.0, datetime.now().timestamp() - target.stat().st_mtime)
    except Exception:
        pass
    return None

def save_workstation_screen_frame(hostname: str, frame_bytes: bytes) -> bool:
    """Save an uploaded screen JPEG frame to EVIDENCE_DIR for live wall feed streaming."""
    try:
        target = _screen_frame_path(hostname)
        with open(target, "wb") as f:
            f.write(frame_bytes)
        db = get_db()
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        db.workstations.update_one(
            {"hostname": hostname},
            {"$set": {
                "last_frame_at": now_str,
                "last_heartbeat": now_str,
                "has_live_screen": True,
                "status": "ONLINE"
            }}
        )
        return True
    except Exception as e:
        print(f"[Screen Frame Save Error]: {e}")
        return False

def get_workstation_screen_frame(hostname: str) -> bytes | None:
    """Read latest stored screen frame JPEG for a workstation."""
    try:
        target = _screen_frame_path(hostname)
        if target.exists():
            with open(target, "rb") as f:
                return f.read()
        return None
    except Exception:
        return None

def get_employee_by_id(employee_id: str) -> dict | None:
    """Lookup employee workstation record by exact or partial employee UID in MongoDB."""
    try:
        db = get_db()
        emp_id = str(employee_id).strip()
        # 1. Search verified employee directory
        emp = db.employees.find_one({"employee_id": emp_id}, {"_id": 0, "password": 0})
        if not emp:
            emp = db.employees.find_one({"employee_id": {"$regex": f"^{re.escape(emp_id)}$", "$options": "i"}}, {"_id": 0, "password": 0})
        if emp:
            ws = db.workstations.find_one({"employee_id": emp["employee_id"]}, {"_id": 0})
            return {
                "employee_id": emp.get("employee_id"),
                "username": emp.get("name"),
                "name": emp.get("name"),
                "department": emp.get("department", "Anuvadini foundation"),
                "role": emp.get("role", "Super Administrator"),
                "status": emp.get("status", "ACTIVE"),
                "hostname": ws.get("hostname", "PENDING_BINDING") if ws else "PENDING_BINDING",
                "ip_address": ws.get("ip_address", "127.0.0.1") if ws else "127.0.0.1"
            }
        # 2. Fallback search workstations collection
        reg = {"$regex": re.escape(emp_id), "$options": "i"}
        ws = db.workstations.find_one({"employee_id": reg}, {"_id": 0})
        return ws
    except Exception as e:
        print(f"[MongoDB Error] get_employee_by_id: {e}")
        return None

def get_firewall_rules() -> list[dict]:
    """Retrieve all configured firewall domain blocking rules from MongoDB."""
    db = get_db()
    return list(db.firewall_rules.find({}, {"_id": 0}).sort("id", pymongo.DESCENDING))

FIREWALL_SCOPES = ("all", "department", "employee")

def rule_applies_to(rule: dict, employee_id: str = "", department: str = "") -> bool:
    """True when a firewall rule targets this PC's employee / department (or everyone)."""
    scope = rule.get("scope") or "all"
    if scope == "all":
        return True
    if scope == "department":
        wanted = {d.strip().lower() for d in (rule.get("departments") or []) if d}
        return (department or "").strip().lower() in wanted
    if scope == "employee":
        wanted = {e.strip() for e in (rule.get("employee_ids") or []) if e}
        return (employee_id or "").strip() in wanted
    return True

def add_firewall_rule(domain: str, category: str, enabled: int = 1, scope: str = "all",
                      departments: list | None = None, employee_ids: list | None = None) -> bool:
    """Insert or update a firewall domain blocking rule in MongoDB.
    scope: 'all' (every PC), 'department' (PCs of the listed departments), 'employee' (PCs of the listed employees)."""
    clean_domain = domain.strip().lower()
    if clean_domain.startswith("http://"): clean_domain = clean_domain[7:]
    if clean_domain.startswith("https://"): clean_domain = clean_domain[8:]
    clean_domain = clean_domain.split("/")[0]
    scope = scope if scope in FIREWALL_SCOPES else "all"
    departments = [d.strip() for d in (departments or []) if d and d.strip()]
    employee_ids = [e.strip() for e in (employee_ids or []) if e and e.strip()]

    try:
        db = get_db()
        existing = db.firewall_rules.find_one({"domain": clean_domain})
        r_id = existing["id"] if existing else get_next_sequence("firewall_rules")
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        db.firewall_rules.update_one(
            {"domain": clean_domain},
            {"$set": {
                "id": r_id,
                "domain": clean_domain,
                "category": category,
                "enabled": enabled,
                "scope": scope,
                "departments": departments if scope == "department" else [],
                "employee_ids": employee_ids if scope == "employee" else [],
                "created_at": now_str
            }},
            upsert=True
        )
        return True
    except Exception as e:
        print(f"[MongoDB Error] add_firewall_rule: {e}")
        return False

def delete_firewall_rule(rule_id: int) -> bool:
    """Delete a firewall rule by ID from MongoDB."""
    db = get_db()
    res = db.firewall_rules.delete_one({"id": rule_id})
    return res.deleted_count > 0

def toggle_firewall_rule(rule_id: int, enabled: int) -> bool:
    """Toggle a firewall rule enabled/disabled in MongoDB."""
    db = get_db()
    res = db.firewall_rules.update_one({"id": rule_id}, {"$set": {"enabled": enabled}})
    return res.modified_count > 0

EXEMPTION_SCOPES = ("all", "category", "domain")
EXEMPTION_TARGETS = ("person", "role")
DEFAULT_FIREWALL_ROLE = "Social Media"
DEFAULT_FIREWALL_ROLE_CATEGORY = "Social Media"


def _find_firewall_role(db, name: str):
    """Look a role up by name, ignoring case and surrounding whitespace."""
    name = (name or "").strip()
    if not name:
        return None
    return db.firewall_roles.find_one({"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}})


def ensure_firewall_roles():
    """Create the built-in Social Media role (and its category exception) once."""
    try:
        db = get_db()
        if db.firewall_roles.find_one({"name": DEFAULT_FIREWALL_ROLE}):
            return
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        db.firewall_roles.insert_one({
            "id": get_next_sequence("firewall_roles"),
            "name": DEFAULT_FIREWALL_ROLE,
            "builtin": True,
            "description": "People who manage the organisation's social media accounts.",
            "members": [],
            "created_at": now_str,
        })
        db.firewall_exemptions.insert_one({
            "id": get_next_sequence("firewall_exemptions"),
            "target_type": "role",
            "role": DEFAULT_FIREWALL_ROLE,
            "employee_id": "",
            "name": DEFAULT_FIREWALL_ROLE,
            "department": "",
            "scope": "category",
            "value": DEFAULT_FIREWALL_ROLE_CATEGORY,
            "created_at": now_str,
        })
    except Exception as e:
        print(f"[MongoDB Error] ensure_firewall_roles: {e}")


def get_firewall_roles() -> list[dict]:
    """Role groups (Social Media, etc.) with their members and enrolled PCs."""
    ensure_firewall_roles()
    db = get_db()
    hosts: dict[str, list] = {}
    for w in db.workstations.find({}, {"_id": 0, "employee_id": 1, "hostname": 1}):
        if w.get("employee_id") and w.get("hostname"):
            hosts.setdefault(w["employee_id"], []).append(w["hostname"])
    out = []
    for r in db.firewall_roles.find({}, {"_id": 0}).sort("name", pymongo.ASCENDING):
        members = r.get("members") or []
        hosts_for_role = []
        for m in members:
            for h in hosts.get(m.get("employee_id"), []):
                if h not in hosts_for_role:
                    hosts_for_role.append(h)
        out.append({**r, "members": members, "member_count": len(members), "hostnames": hosts_for_role})
    return out


def add_firewall_role(name: str) -> tuple[bool, str]:
    """Create a role group (idempotent, case-insensitive)."""
    name = " ".join((name or "").split())[:60]
    if len(name) < 2:
        return False, "Give the role a name."
    if "/" in name or "\\" in name:
        return False, "Role names cannot contain slashes."
    try:
        db = get_db()
        if _find_firewall_role(db, name):
            return True, "That role already exists."
        db.firewall_roles.insert_one({
            "id": get_next_sequence("firewall_roles"),
            "name": name,
            "builtin": False,
            "description": "",
            "members": [],
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        })
        return True, f"{name} role created."
    except Exception as e:
        print(f"[MongoDB Error] add_firewall_role: {e}")
        return False, "Could not create the role."


def delete_firewall_role(name: str) -> bool:
    """Delete a role group and every exception that targets it."""
    try:
        db = get_db()
        role = _find_firewall_role(db, name)
        if not role:
            return False
        db.firewall_exemptions.delete_many({"target_type": "role", "role": role["name"]})
        return db.firewall_roles.delete_one({"_id": role["_id"]}).deleted_count > 0
    except Exception as e:
        print(f"[MongoDB Error] delete_firewall_role: {e}")
        return False


def add_firewall_role_member(role_name: str, employee_id: str, name: str = "", department: str = "") -> tuple[bool, str]:
    """Put one person into a role group. Their enrolled PCs inherit the role's exceptions."""
    role_name = " ".join((role_name or "").split())[:60]
    employee_id = (employee_id or "").strip()
    if not role_name or not employee_id:
        return False, "Choose a role and a person."
    try:
        db = get_db()
        role = _find_firewall_role(db, role_name)
        if not role:
            ok, msg = add_firewall_role(role_name)
            if not ok:
                return False, msg
            role = _find_firewall_role(db, role_name)
        if not role:
            return False, "Could not find that role."
        person = next((p for p in get_firewall_people() if p["employee_id"] == employee_id), {})
        member = {
            "employee_id": employee_id,
            "name": (name or person.get("name") or employee_id).strip()[:120],
            "department": (department or person.get("department") or "").strip()[:120],
        }
        members = [m for m in (role.get("members") or []) if m.get("employee_id") != employee_id]
        members.append(member)
        db.firewall_roles.update_one({"name": role["name"]}, {"$set": {"members": members}})
        return True, f"{member['name']} added to the {role['name']} role."
    except Exception as e:
        print(f"[MongoDB Error] add_firewall_role_member: {e}")
        return False, "Could not add that person to the role."


def remove_firewall_role_member(role_name: str, employee_id: str) -> bool:
    """Remove one person from a role group."""
    role_name = (role_name or "").strip()
    employee_id = (employee_id or "").strip()
    if not role_name or not employee_id:
        return False
    try:
        db = get_db()
        role = _find_firewall_role(db, role_name)
        if not role:
            return False
        members = [m for m in (role.get("members") or []) if m.get("employee_id") != employee_id]
        db.firewall_roles.update_one({"_id": role["_id"]}, {"$set": {"members": members}})
        return True
    except Exception as e:
        print(f"[MongoDB Error] remove_firewall_role_member: {e}")
        return False


def get_firewall_exemptions() -> list[dict]:
    """People/roles who may bypass part of the blocklist (e.g. the social media team and Instagram).
    Person rows carry the hostnames of that person's enrolled PCs; role rows carry every member's PCs."""
    db = get_db()
    hosts: dict[str, list] = {}
    for w in db.workstations.find({}, {"_id": 0, "employee_id": 1, "hostname": 1}):
        if w.get("employee_id") and w.get("hostname"):
            hosts.setdefault(w["employee_id"], []).append(w["hostname"])
    roles = {(r.get("name") or "").strip().lower(): r for r in db.firewall_roles.find({}, {"_id": 0})}
    rows = list(db.firewall_exemptions.find({}, {"_id": 0}).sort("id", pymongo.ASCENDING))
    for r in rows:
        if r.get("target_type") == "role" or r.get("role"):
            role_name = r.get("role") or r.get("name") or ""
            role = roles.get(role_name.strip().lower()) or {}
            role_name = role.get("name") or role_name
            members = role.get("members") or []
            role_hosts = []
            for m in members:
                for h in hosts.get(m.get("employee_id"), []):
                    if h not in role_hosts:
                        role_hosts.append(h)
            r["target_type"] = "role"
            r["role"] = role_name
            r["members"] = members
            r["member_count"] = len(members)
            r["hostnames"] = role_hosts
        else:
            r["target_type"] = "person"
            r["hostnames"] = hosts.get(r.get("employee_id"), [])
            r["member_count"] = 1 if r.get("employee_id") else 0
    return rows


def add_firewall_exemption(employee_id: str, scope: str, value: str = "", name: str = "", department: str = "",
                           target_type: str = "person", role: str = "") -> tuple[bool, str]:
    """Allow a person, or everyone in a role, to bypass: every blocked site ('all'),
    one category, or one domain."""
    employee_id = (employee_id or "").strip()
    scope = (scope or "").strip().lower()
    value = (value or "").strip()
    target_type = (target_type or "person").strip().lower()
    role = " ".join((role or "").split())[:60]
    if target_type not in EXEMPTION_TARGETS:
        return False, "Unknown exception target."
    if target_type == "person" and not employee_id:
        return False, "Choose a person."
    if target_type == "role" and not role:
        return False, "Choose a role."
    if scope not in EXEMPTION_SCOPES:
        return False, "Unknown exemption type."
    if scope == "domain":
        value = value.lower()
        for prefix in ("http://", "https://"):
            if value.startswith(prefix):
                value = value[len(prefix):]
        value = value.split("/")[0]
        if value.startswith("www."):
            value = value[4:]
    if scope == "all":
        value = ""
    elif not value:
        return False, "Choose what they may access."
    try:
        db = get_db()
        if target_type == "role":
            ok, msg = add_firewall_role(role)
            if not ok:
                return False, msg
            saved_role = _find_firewall_role(db, role)
            if not saved_role:
                return False, "Could not find that role."
            role = saved_role["name"]
            existing = db.firewall_exemptions.find_one(
                {"target_type": "role", "role": role, "scope": scope, "value": value})
            ex_id = existing["id"] if existing else get_next_sequence("firewall_exemptions")
            db.firewall_exemptions.update_one(
                {"target_type": "role", "role": role, "scope": scope, "value": value},
                {"$set": {
                    "id": ex_id, "target_type": "role", "role": role, "employee_id": "",
                    "name": role, "department": "", "scope": scope, "value": value,
                    "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                }},
                upsert=True,
            )
            return True, f"{role} role exception saved."
        # The person usually comes from the Attendance staff list, so they may not be enrolled in Defender yet.
        person = next((p for p in get_firewall_people() if p["employee_id"] == employee_id), None)
        if not person:
            if not (name or "").strip():
                return False, "That person was not found."
            person = {"employee_id": employee_id, "name": name.strip()[:120], "department": (department or "").strip()[:120], "hostnames": []}
        existing = db.firewall_exemptions.find_one({"employee_id": employee_id, "scope": scope, "value": value})
        ex_id = existing["id"] if existing else get_next_sequence("firewall_exemptions")
        db.firewall_exemptions.update_one(
            {"employee_id": employee_id, "scope": scope, "value": value},
            {"$set": {
                "id": ex_id, "target_type": "person", "employee_id": employee_id,
                "name": person["name"], "department": person.get("department", ""),
                "scope": scope, "value": value,
                "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            }},
            upsert=True,
        )
        return True, "Exception saved."
    except Exception as e:
        print(f"[MongoDB Error] add_firewall_exemption: {e}")
        return False, "Could not save the exception."

def delete_firewall_exemption(exemption_id: int) -> bool:
    db = get_db()
    return db.firewall_exemptions.delete_one({"id": exemption_id}).deleted_count > 0

def get_firewall_people() -> list[dict]:
    """Everyone who can be given an exception: the employee registry plus any enrolled workstation."""
    db = get_db()
    people: dict[str, dict] = {}
    for e in db.employees.find({}, {"_id": 0, "employee_id": 1, "name": 1, "department": 1}):
        if e.get("employee_id"):
            people[e["employee_id"]] = {"employee_id": e["employee_id"], "name": e.get("name") or e["employee_id"],
                                        "department": e.get("department", ""), "hostnames": []}
    for w in db.workstations.find({}, {"_id": 0, "employee_id": 1, "username": 1, "department": 1, "hostname": 1}):
        eid = w.get("employee_id")
        if not eid:
            continue
        p = people.setdefault(eid, {"employee_id": eid, "name": w.get("username") or eid, "department": w.get("department", ""), "hostnames": []})
        if w.get("hostname") and w["hostname"] not in p["hostnames"]:
            p["hostnames"].append(w["hostname"])
    return sorted(people.values(), key=lambda p: p["name"].lower())

def log_firewall_event(hostname: str, username: str, domain: str, category: str, action_taken: str = "SILENTLY_BLOCKED", employee_id: str = "") -> int:
    """Log an intercepted firewall violation attempt with Employee ID into MongoDB."""
    db = get_db()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    emp_id = (employee_id or "").strip()
    if not emp_id:
        try:
            ws = db.workstations.find_one({"$or": [{"hostname": hostname}, {"username": username}]})
            if ws and ws.get("employee_id"):
                emp_id = ws["employee_id"]
        except Exception:
            pass
    if not emp_id:
        emp_id = "EMP-1001"

    l_id = get_next_sequence("firewall_logs")
    doc = {
        "id": l_id,
        "timestamp": now_str,
        "hostname": hostname,
        "username": username,
        "employee_id": emp_id,
        "domain": domain,
        "category": category,
        "action_taken": action_taken
    }
    db.firewall_logs.insert_one(doc)
    return l_id

def get_firewall_logs(limit: int = 50) -> list[dict]:
    """Retrieve recent firewall block events from MongoDB."""
    db = get_db()
    return list(db.firewall_logs.find({}, {"_id": 0}).sort("id", pymongo.DESCENDING).limit(limit))

# Automated Shift Attendance & Timesheet Engine
def record_attendance_tick(employee_id: str, username: str, department: str, hostname: str, is_idle: bool, is_gaming: bool, tick_duration: float = 2.0):
    """Aggregate real-time workstation attendance and daily clock-in / clock-out in MongoDB."""
    if not employee_id:
        return
    db = get_db()
    now = datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H:%M:%S")

    productive_inc = tick_duration if (not is_idle and not is_gaming) else 0.0
    gaming_inc = tick_duration if is_gaming else 0.0
    idle_inc = tick_duration if (is_idle and not is_gaming) else 0.0

    existing = db.attendance_records.find_one({"date_str": today_str, "employee_id": employee_id})
    if not existing:
        doc = {
            "date_str": today_str,
            "employee_id": employee_id,
            "username": username,
            "department": department,
            "hostname": hostname,
            "clock_in": time_str,
            "clock_out": time_str,
            "total_seconds": tick_duration,
            "productive_seconds": productive_inc,
            "gaming_seconds": gaming_inc,
            "idle_seconds": idle_inc,
            "status": "PRESENT"
        }
        db.attendance_records.insert_one(doc)
    else:
        new_gaming = existing.get("gaming_seconds", 0.0) + gaming_inc
        new_idle = existing.get("idle_seconds", 0.0) + idle_inc
        new_total = existing.get("total_seconds", 0.0) + tick_duration
        
        status = "PRESENT"
        if new_gaming >= 300: # 5 minutes of detected gaming during work
            status = "SLACKING_FLAGGED"
        elif new_idle >= (new_total * 0.6) and new_total >= 3600:
            status = "EXCESSIVE_IDLE"

        db.attendance_records.update_one(
            {"date_str": today_str, "employee_id": employee_id},
            {
                "$set": {
                    "clock_out": time_str,
                    "username": username,
                    "department": department,
                    "hostname": hostname,
                    "status": status
                },
                "$inc": {
                    "total_seconds": tick_duration,
                    "productive_seconds": productive_inc,
                    "gaming_seconds": gaming_inc,
                    "idle_seconds": idle_inc
                }
            }
        )

def _clean_app_name(raw: str) -> str:
    """Turn 'EXCEL.EXE' → 'Microsoft Excel', 'chrome.exe' → 'Google Chrome', etc."""
    if not raw:
        return "Unknown"
    known = {
        "excel.exe": "Microsoft Excel",
        "winword.exe": "Microsoft Word",
        "powerpnt.exe": "Microsoft PowerPoint",
        "outlook.exe": "Microsoft Outlook",
        "teams.exe": "Microsoft Teams",
        "chrome.exe": "Google Chrome",
        "msedge.exe": "Microsoft Edge",
        "firefox.exe": "Mozilla Firefox",
        "code.exe": "VS Code",
        "pycharm64.exe": "PyCharm",
        "idea64.exe": "IntelliJ IDEA",
        "slack.exe": "Slack",
        "zoom.exe": "Zoom",
        "notepad.exe": "Notepad",
        "notepad++.exe": "Notepad++",
        "explorer.exe": "File Explorer",
        "cmd.exe": "Command Prompt",
        "powershell.exe": "PowerShell",
        "windowsterminal.exe": "Windows Terminal",
        "acrobat.exe": "Adobe Acrobat",
        "acrord32.exe": "Adobe Reader",
        "mspaint.exe": "MS Paint",
        "taskmgr.exe": "Task Manager",
    }
    key = raw.lower().strip()
    return known.get(key, raw.replace(".exe", "").replace(".EXE", "").title())


def record_app_activity_tick(
    employee_id: str, hostname: str, app_name: str, window_title: str,
    is_idle: bool, tick_duration: float = 5.0
):
    """
    Called on every heartbeat. Accumulates per-app time for the employee.
    Also logs an app-switch event when the active app changes.
    """
    if not employee_id or not app_name:
        return
    db = get_db()
    now = datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    time_str  = now.strftime("%H:%M:%S")

    display_name = _clean_app_name(app_name)

    # Skip idle ticks from app accumulation (mouse/keyboard dead for 3min)
    seconds_inc = 0.0 if is_idle else tick_duration

    # Upsert the per-app aggregate for today
    db.app_activity.update_one(
        {"date_str": today_str, "employee_id": employee_id, "app_name": app_name},
        {
            "$setOnInsert": {
                "date_str": today_str,
                "employee_id": employee_id,
                "hostname": hostname,
                "app_name": app_name,
                "display_name": display_name,
                "first_seen": time_str,
            },
            "$set": {
                "last_seen": time_str,
                "last_title": window_title[:200] if window_title else "",
            },
            "$inc": {"seconds": seconds_inc},
        },
        upsert=True,
    )

    # Record an app-switch event when the employee moves to a new app
    last_key = f"app_last:{employee_id}"
    last_doc = db.kv_store.find_one({"_id": last_key}) or {}
    last_app  = last_doc.get("app_name", "")
    if last_app != app_name:
        db.app_events.insert_one({
            "date_str":     today_str,
            "employee_id":  employee_id,
            "hostname":     hostname,
            "app_name":     app_name,
            "display_name": display_name,
            "window_title": (window_title or "")[:200],
            "ts":           time_str,
            "epoch":        now.timestamp(),
        })
        db.kv_store.update_one(
            {"_id": last_key},
            {"$set": {"app_name": app_name, "ts": time_str}},
            upsert=True,
        )


def get_app_activity(employee_id: str, date_str: str = None) -> dict:
    """
    Returns per-app time breakdown + chronological switch timeline for one employee on one day.
    """
    db = get_db()
    target_date = date_str or date.today().strftime("%Y-%m-%d")

    # Per-app totals, sorted by seconds desc
    apps = list(
        db.app_activity.find(
            {"date_str": target_date, "employee_id": employee_id},
            {"_id": 0}
        ).sort("seconds", pymongo.DESCENDING)
    )
    for a in apps:
        a["minutes"] = round(a.get("seconds", 0) / 60, 1)
        a["hours"]   = round(a.get("seconds", 0) / 3600, 2)

    # Chronological app-switch events (timeline)
    events = list(
        db.app_events.find(
            {"date_str": target_date, "employee_id": employee_id},
            {"_id": 0}
        ).sort("epoch", pymongo.ASCENDING)
    )

    total_seconds = sum(a.get("seconds", 0) for a in apps)
    for a in apps:
        a["percent"] = round(a["seconds"] / total_seconds * 100, 1) if total_seconds > 0 else 0

    return {
        "date_str":      target_date,
        "employee_id":   employee_id,
        "total_seconds": total_seconds,
        "total_hours":   round(total_seconds / 3600, 2),
        "apps":          apps,
        "timeline":      events,
    }


def get_fleet_app_activity(date_str: str = None) -> list[dict]:
    """All employees' app activity for a given date — for the fleet dashboard."""
    db = get_db()
    target_date = date_str or date.today().strftime("%Y-%m-%d")
    pipeline = [
        {"$match": {"date_str": target_date}},
        {"$group": {
            "_id": {"employee_id": "$employee_id", "hostname": "$hostname"},
            "apps": {"$push": {
                "app_name": "$app_name", "display_name": "$display_name",
                "seconds": "$seconds", "first_seen": "$first_seen", "last_seen": "$last_seen"
            }},
            "total_seconds": {"$sum": "$seconds"},
        }},
        {"$sort": {"total_seconds": -1}},
    ]
    results = []
    for row in db.app_activity.aggregate(pipeline):
        emp_id  = row["_id"]["employee_id"]
        hostname = row["_id"]["hostname"]
        apps = sorted(row["apps"], key=lambda x: x.get("seconds", 0), reverse=True)
        results.append({
            "employee_id":   emp_id,
            "hostname":      hostname,
            "total_seconds": row["total_seconds"],
            "total_hours":   round(row["total_seconds"] / 3600, 2),
            "top_app":       apps[0]["display_name"] if apps else "—",
            "apps":          apps[:10],
        })
    return results


def get_daily_timesheet(date_str: str = None) -> list[dict]:
    """Retrieve official daily attendance & timesheet audit from MongoDB."""
    db = get_db()
    target_date = date_str or date.today().strftime("%Y-%m-%d")
    records = list(db.attendance_records.find({"date_str": target_date}, {"_id": 0}).sort("employee_id", pymongo.ASCENDING))
    for r in records:
        tot = r.get("total_seconds", 0.0)
        prod = r.get("productive_seconds", 0.0)
        r["compliance_score"] = round((prod / tot * 100), 1) if tot > 0 else 100.0
        r["productive_hours"] = round(prod / 3600, 2)
        r["gaming_hours"] = round(r.get("gaming_seconds", 0.0) / 3600, 2)
        r["idle_hours"] = round(r.get("idle_seconds", 0.0) / 3600, 2)
        r["total_hours"] = round(tot / 3600, 2)
    return records

def add_admin_notification(
    employee_id: str,
    username: str,
    hostname: str,
    department: str,
    game_name: str,
    category: str,
    process_name: str,
    pid: int,
    severity: str = "HIGH",
    details: str = "",
    window_title: str = ""
) -> dict:
    """Stores an in-dashboard notification alert in MongoDB."""
    try:
        db = get_db()
        seq_id = get_next_sequence("admin_notifications")
        now_dt = datetime.now()
        doc = {
            "id": seq_id,
            "employee_id": employee_id or "EMP-1001",
            "username": username or "Employee",
            "hostname": hostname or "DESKTOP-WS",
            "department": department or "Operations",
            "game_name": game_name,
            "category": category,
            "process_name": process_name,
            "pid": pid,
            "severity": severity or "HIGH",
            "details": details,
            "window_title": window_title,
            "timestamp": now_dt.strftime("%Y-%m-%d %H:%M:%S"),
            "time_ago": "Just now",
            "is_read": False,
            "created_at": now_dt
        }
        db.admin_notifications.insert_one(doc)
        # Keep the alert feed bounded (it had grown to >12,000 rows): retain only the newest 1,000
        db.admin_notifications.delete_many({"id": {"$lte": seq_id - 1000}})
        doc.pop("_id", None)
        return doc
    except Exception as e:
        print(f"[MongoDB Error] add_admin_notification: {e}")
        return {}

def get_admin_notifications(limit: int = 50, unread_only: bool = False) -> tuple[list[dict], int]:
    """Retrieve in-dashboard notifications and unread count."""
    try:
        db = get_db()
        query = {"is_read": False} if unread_only else {}
        cursor = db.admin_notifications.find(query).sort("created_at", pymongo.DESCENDING).limit(limit)
        items = []
        now_dt = datetime.now()
        for doc in cursor:
            doc.pop("_id", None)
            if "created_at" in doc and isinstance(doc["created_at"], datetime):
                diff = (now_dt - doc["created_at"]).total_seconds()
                if diff < 60:
                    doc["time_ago"] = "Just now"
                elif diff < 3600:
                    doc["time_ago"] = f"{int(diff // 60)}m ago"
                else:
                    doc["time_ago"] = f"{int(diff // 3600)}h ago"
                doc["created_at"] = doc["created_at"].isoformat()
            items.append(doc)
        unread_count = db.admin_notifications.count_documents({"is_read": False})
        return items, unread_count
    except Exception as e:
        print(f"[MongoDB Error] get_admin_notifications: {e}")
        return [], 0

def mark_notifications_read(notification_ids: list[int] = None) -> bool:
    """Mark specific or all notifications as read."""
    try:
        db = get_db()
        if notification_ids:
            db.admin_notifications.update_many({"id": {"$in": notification_ids}}, {"$set": {"is_read": True}})
        else:
            db.admin_notifications.update_many({}, {"$set": {"is_read": True}})
        return True
    except Exception as e:
        print(f"[MongoDB Error] mark_notifications_read: {e}")
        return False

def clear_admin_notifications() -> bool:
    """Clear all admin notifications from the database."""
    try:
        db = get_db()
        db.admin_notifications.delete_many({})
        return True
    except Exception as e:
        print(f"[MongoDB Error] clear_admin_notifications: {e}")
        return False

# Initialize MongoDB immediately on import
if os.environ.get("ANUVADINI_AGENT_MODE") != "1":   # employee PCs have no database
    init_db()


# ---------------------------------------------------------------------------
# Live camera frames (webcam) — stored like screen frames, one file per PC
# ---------------------------------------------------------------------------

def _camera_frame_path(hostname: str) -> Path:
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", str(hostname or ""))[:100] or "unknown"
    return EVIDENCE_DIR / f"camera_{safe}.jpg"

def get_workstation_camera_frame_age(hostname: str) -> float | None:
    try:
        target = _camera_frame_path(hostname)
        if target.exists():
            return max(0.0, datetime.now().timestamp() - target.stat().st_mtime)
    except Exception:
        pass
    return None

def save_workstation_camera_frame(hostname: str, frame_bytes: bytes) -> bool:
    try:
        target = _camera_frame_path(hostname)
        with open(target, "wb") as f:
            f.write(frame_bytes)
        db = get_db()
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        db.workstations.update_one(
            {"hostname": hostname},
            {"$set": {"last_camera_at": now_str, "has_live_camera": True}}
        )
        return True
    except Exception as e:
        print(f"[Camera Frame Save Error]: {e}")
        return False

def get_workstation_camera_frame(hostname: str) -> bytes | None:
    try:
        target = _camera_frame_path(hostname)
        if target.exists():
            with open(target, "rb") as f:
                return f.read()
        return None
    except Exception:
        return None

# ---------------------------------------------------------------------------
# Proctor (watch list, events, challenges) — thin wrappers around proctor/db.py
# ---------------------------------------------------------------------------

def _pdb():
    import anuvadini_detector.proctor.db as _p
    return _p

def is_employee_watched(employee_id: str) -> bool:
    return _pdb().is_watched(employee_id)
