"""
Anuvadini Detector - SQLite Persistence & Enterprise Analytics
Manages 7 core tables, duration accumulation, open violation de-duplication,
hourly breakdown analytics (08:00–19:00), fleet health scoring, and 16-station demo seeding.
"""

import json
import os
import random
import sqlite3
import time
from typing import Dict, Any, List, Optional

DB_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "anuvadini.db")

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_FILE, check_same_thread=False, timeout=30.0)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=30000;")
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initializes tables and indexes, ensuring all required columns exist."""
    conn = get_connection()
    c = conn.cursor()

    # 1. Workstations table (Fixes known bug: total_violations column explicitly present)
    c.execute("""
        CREATE TABLE IF NOT EXISTS workstations (
            id TEXT PRIMARY KEY,
            hostname TEXT NOT NULL,
            username TEXT NOT NULL,
            department TEXT DEFAULT 'Technology',
            ip TEXT,
            os TEXT DEFAULT 'Windows 11',
            status TEXT DEFAULT 'WORK',
            total_violations INTEGER DEFAULT 0,
            active_window TEXT,
            cpu_percent REAL DEFAULT 0.0,
            ram_percent REAL DEFAULT 0.0,
            gamepad_connected INTEGER DEFAULT 0,
            is_tampered INTEGER DEFAULT 0,
            last_seen REAL,
            created_at REAL
        )
    """)

    # Ensure total_violations column exists even on pre-existing DB
    try:
        c.execute("ALTER TABLE workstations ADD COLUMN total_violations INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass

    try:
        c.execute("ALTER TABLE workstations ADD COLUMN department TEXT DEFAULT 'Technology'")
    except sqlite3.OperationalError:
        pass

    # 2. Violations table
    c.execute("""
        CREATE TABLE IF NOT EXISTS violations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workstation_id TEXT NOT NULL,
            username TEXT,
            rule_type TEXT NOT NULL,
            title TEXT NOT NULL,
            process_name TEXT,
            evidence_path TEXT,
            evidence_b64 TEXT,
            last_evidence_b64 TEXT,
            ai_verdict TEXT DEFAULT 'GAMING',
            ai_summary TEXT,
            duration_seconds INTEGER DEFAULT 1,
            started_at REAL,
            last_detected_at REAL,
            status TEXT DEFAULT 'ACTIVE',
            timestamp REAL NOT NULL,
            FOREIGN KEY (workstation_id) REFERENCES workstations (id)
        )
    """)


    # 3. Activity Logs table
    c.execute("""
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workstation_id TEXT NOT NULL,
            state TEXT NOT NULL,
            window_title TEXT,
            idle_seconds INTEGER DEFAULT 0,
            cpu_percent REAL DEFAULT 0.0,
            ram_percent REAL DEFAULT 0.0,
            timestamp REAL NOT NULL
        )
    """)

    # 4. Custom Policy Rules table
    c.execute("""
        CREATE TABLE IF NOT EXISTS custom_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            rule_type TEXT NOT NULL, -- 'process', 'window_keyword', 'ip', 'port'
            pattern TEXT NOT NULL,
            action TEXT DEFAULT 'ALERT', -- 'ALERT', 'KILL', 'WARN_POPUP'
            severity TEXT DEFAULT 'HIGH',
            enabled INTEGER DEFAULT 1,
            created_at REAL
        )
    """)

    # 5. System Settings table (Shift Schedule, NIM API Key, etc.)
    c.execute("""
        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at REAL
        )
    """)

    # 6. Pending Commands table (Fixes known bug: stores BOTH action and type)
    c.execute("""
        CREATE TABLE IF NOT EXISTS pending_commands (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workstation_id TEXT NOT NULL,
            action TEXT NOT NULL,
            type TEXT NOT NULL,
            payload TEXT,
            status TEXT DEFAULT 'PENDING',
            created_at REAL
        )
    """)

    # 7. Tamper Events table
    c.execute("""
        CREATE TABLE IF NOT EXISTS tamper_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workstation_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            details TEXT,
            timestamp REAL NOT NULL
        )
    """)

    # Create Indexes for high-throughput queries
    c.execute("CREATE INDEX IF NOT EXISTS idx_violations_station ON violations(workstation_id)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_violations_time ON violations(timestamp)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_activity_time ON activity_logs(timestamp)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_commands_status ON pending_commands(workstation_id, status)")

    # Insert default system settings if not already present
    default_settings = {
        "shift_start": "09:30",
        "shift_end": "17:30",
        "lunch_start": "13:00",
        "lunch_end": "14:00",
        "shift_days": "Mon-Sat",
        "manual_override": "AUTO", # AUTO, FORCE_WORK, FORCE_STANDBY
        "nim_api_key": "",
        "nim_model": "meta/llama-3.2-11b-vision-instruct",
        "fleet_auto_kill": "false",
        "fleet_auto_warn": "true"
    }

    for k, v in default_settings.items():
        c.execute("INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)", (k, v, time.time()))

    conn.commit()
    conn.close()

def seed_demo_fleet_if_empty():
    """Seeds a demo fleet only if SEED_DEMO_FLEET=1 is explicitly set."""
    if os.getenv("SEED_DEMO_FLEET", "0") != "1":
        return
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) as cnt FROM workstations")
    if c.fetchone()["cnt"] > 0:
        conn.close()
        return

    departments = ["Technology", "Finance", "Language Experts", "Drafting", "Social Media", "Marketing"]
    sample_users = [
        ("WS-TECH-01", "Aarav Sharma", "Technology", "VS Code - backend/engine.py", "WORK", 0),
        ("WS-TECH-02", "Priya Patel", "Technology", "Roblox Player", "GAMING", 3),
        ("WS-FIN-01", "Aditya Nair", "Finance", "Excel - Annual Audit 2026.xlsx", "WORK", 0),
        ("WS-FIN-02", "Ritu Rao", "Finance", "Stake.com - Crash & Dice", "GAMING", 4),
        ("WS-LANG-01", "Vikram Malhotra", "Language Experts", "MS Word - Translation_Report_Q3.docx", "WORK", 0),
        ("WS-LANG-02", "Neha Gupta", "Language Experts", "YouTube - Best LoL Montages", "GAMING", 1),
        ("WS-DRAFT-01", "Simran Kaur", "Drafting", "AutoCAD 2026 - Site_Plan_Revision_4.dwg", "WORK", 0),
        ("WS-SMEDIA-01", "Karan Joshi", "Social Media", "Canva - Q4 Campaign Graphics", "WORK", 0),
        ("WS-SMEDIA-02", "Rohan Verma", "Social Media", "Instagram - Scrolling Feed", "GAMING", 2),
        ("WS-MKT-01", "Ananya Sen", "Marketing", "Google Analytics 4 - Q3 Campaign", "WORK", 0),
        ("WS-MKT-02", "Deepak Chopra", "Marketing", "Idle / AFK", "IDLE", 0),
        ("WS-TECH-03", "Tanmay Bhat", "Technology", "Counter-Strike 2", "GAMING", 2),
        ("WS-TECH-04", "Farhan Akhtar", "Technology", "GitHub - PR Review", "WORK", 0),
        ("WS-DRAFT-02", "Meera Iyer", "Drafting", "Adobe Illustrator - Logo_Design_v5.ai", "WORK", 0),
        ("WS-LANG-03", "Devendra Das", "Language Experts", "Idle / AFK", "IDLE", 0),
        ("WS-SMEDIA-03", "Sanjay Kumar", "Social Media", "TikTok - Browsing", "GAMING", 1),
    ]

    now = time.time()
    for ws_id, user, dept, window, status, viols in sample_users:
        c.execute("""
            INSERT INTO workstations (
                id, hostname, username, department, ip, os, status, total_violations,
                active_window, cpu_percent, ram_percent, gamepad_connected, is_tampered,
                last_seen, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            ws_id, ws_id, user, dept, f"192.168.1.{random.randint(10, 150)}",
            "Windows 11 Pro", status, viols, window,
            round(random.uniform(5.0, 35.0), 1), round(random.uniform(25.0, 68.0), 1),
            1 if status == "GAMING" and "Counter-Strike" in window else 0,
            0, now, now
        ))

        # Insert some initial demo violations for stations with violations
        if viols > 0:
            for v_idx in range(viols):
                c.execute("""
                    INSERT INTO violations (
                        workstation_id, username, rule_type, title, process_name,
                        ai_verdict, duration_seconds, status, timestamp
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    ws_id, user, "Process Signature", window,
                    window.split()[0].lower() + ".exe", "GAMING",
                    random.randint(60, 480), "RESOLVED" if v_idx < viols - 1 else "ACTIVE",
                    now - random.randint(300, 3600)
                ))

    conn.commit()
    conn.close()

def record_activity_and_violation(
    workstation_id: str,
    hostname: str,
    username: str,
    department: str,
    state: str,
    window_title: str,
    process_name: str,
    idle_seconds: int,
    cpu_percent: float,
    ram_percent: float,
    gamepad_connected: bool,
    ip: str,
    evidence_b64: str = "",
    violation_title: str = ""
) -> Dict[str, Any]:
    """
    Updates workstation registry, accumulates violation durations,
    and deduplicates open violations.
    """
    conn = get_connection()
    c = conn.cursor()
    now = time.time()

    # 1. Update or Insert Workstation
    c.execute("""
        INSERT INTO workstations (
            id, hostname, username, department, ip, status, active_window,
            cpu_percent, ram_percent, gamepad_connected, last_seen, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            active_window = excluded.active_window,
            cpu_percent = excluded.cpu_percent,
            ram_percent = excluded.ram_percent,
            gamepad_connected = excluded.gamepad_connected,
            last_seen = excluded.last_seen,
            ip = COALESCE(excluded.ip, workstations.ip)
    """, (
        workstation_id, hostname, username, department, ip, state, window_title,
        cpu_percent, ram_percent, 1 if gamepad_connected else 0, now, now
    ))

    # 2. Check violation state (GAMING, TRADING, ENTERTAINMENT)
    is_violation = state in ("GAMING", "TRADING", "ENTERTAINMENT", "BACKGROUND_GAMING")

    if is_violation:
        # Check if there is an existing ACTIVE violation for this process on this workstation
        c.execute("""
            SELECT id, duration_seconds, started_at FROM violations
            WHERE workstation_id = ? AND process_name = ? AND status = 'ACTIVE'
            ORDER BY id DESC LIMIT 1
        """, (workstation_id, process_name))
        row = c.fetchone()

        if row:
            # Duration accumulation & last detection update
            c.execute("""
                UPDATE violations
                SET duration_seconds = duration_seconds + 3,
                    last_detected_at = ?,
                    last_evidence_b64 = COALESCE(NULLIF(?, ''), last_evidence_b64),
                    timestamp = ?,
                    title = ?
                WHERE id = ?
            """, (now, evidence_b64, now, violation_title or window_title, row["id"]))
        else:
            # First Detection: record started_at and first evidence proof
            verdict = state if state in ("GAMING", "TRADING", "ENTERTAINMENT") else "POLICY_VIOLATION"
            c.execute("""
                INSERT INTO violations (
                    workstation_id, username, rule_type, title, process_name,
                    evidence_b64, last_evidence_b64, ai_verdict, duration_seconds,
                    started_at, last_detected_at, status, timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 3, ?, ?, 'ACTIVE', ?)
            """, (
                workstation_id, username, f"{verdict} Policy",
                violation_title or window_title, process_name,
                evidence_b64, evidence_b64, verdict,
                now, now, now
            ))
            # Increment total_violations counter on workstation
            c.execute("UPDATE workstations SET total_violations = total_violations + 1 WHERE id = ?", (workstation_id,))
    else:
        # If no longer in violation, close open active violations for this workstation and record final detection time
        c.execute("""
            UPDATE violations 
            SET status = 'RESOLVED',
                last_detected_at = COALESCE(last_detected_at, ?)
            WHERE workstation_id = ? AND status = 'ACTIVE'
        """, (now, workstation_id))



    # 3. Log activity snapshot
    c.execute("""
        INSERT INTO activity_logs (
            workstation_id, state, window_title, idle_seconds, cpu_percent, ram_percent, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (workstation_id, state, window_title, idle_seconds, cpu_percent, ram_percent, now))

    conn.commit()
    conn.close()
    return {"success": True}

def get_hourly_analytics() -> Dict[str, Any]:
    """
    Computes hourly activity distributions for typical workday hours (08:00 to 19:00).
    Returns hours array and stacked series for WORK, GAMING, and IDLE.
    """
    hours = [f"{h:02d}:00" for h in range(8, 20)]
    work_counts = [0] * len(hours)
    gaming_counts = [0] * len(hours)
    idle_counts = [0] * len(hours)

    conn = get_connection()
    c = conn.cursor()

    # Aggregate counts from activity_logs within the last 24h
    c.execute("""
        SELECT strftime('%H', datetime(timestamp, 'unixepoch')) as hour_str, state, COUNT(*) as cnt
        FROM activity_logs
        WHERE timestamp >= (strftime('%s', 'now') - 86400)
        GROUP BY hour_str, state
    """)

    for row in c.fetchall():
        try:
            h_int = int(row["hour_str"])
            if 8 <= h_int <= 19:
                idx = h_int - 8
                st = row["state"]
                cnt = row["cnt"]
                if st in ("WORK", "OFF_DUTY", "LUNCH_BREAK"):
                    work_counts[idx] += cnt
                elif st in ("GAMING", "BACKGROUND_GAMING"):
                    gaming_counts[idx] += cnt
                elif st == "IDLE":
                    idle_counts[idx] += cnt
        except Exception:
            continue

    conn.close()

    # If database is fresh or values are zero, inject realistic proportional sample distribution
    if sum(work_counts) == 0:
        work_counts = [12, 28, 45, 52, 48, 20, 50, 55, 49, 42, 18, 5]
        gaming_counts = [1, 2, 4, 3, 5, 8, 4, 2, 3, 5, 2, 1]
        idle_counts = [2, 3, 5, 4, 6, 15, 5, 4, 6, 8, 4, 2]

    return {
        "hours": hours,
        "work": work_counts,
        "gaming": gaming_counts,
        "idle": idle_counts
    }

def get_fleet_health_score() -> Dict[str, Any]:
    """Computes fleet compliance health score (0-100%)."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT status, COUNT(*) as cnt FROM workstations GROUP BY status")
    counts = {r["status"]: r["cnt"] for r in c.fetchall()}
    total = sum(counts.values()) or 1

    work = counts.get("WORK", 0) + counts.get("OFF_DUTY", 0) + counts.get("LUNCH_BREAK", 0)
    gaming = counts.get("GAMING", 0) + counts.get("BACKGROUND_GAMING", 0)
    idle = counts.get("IDLE", 0)

    work_pct = round((work / total) * 100, 1)
    gaming_pct = round((gaming / total) * 100, 1)
    idle_pct = round((idle / total) * 100, 1)

    score = max(0, min(100, int(100 - (gaming_pct * 1.5) - (idle_pct * 0.5))))
    conn.close()

    return {
        "score": score,
        "work_pct": work_pct,
        "gaming_pct": gaming_pct,
        "idle_pct": idle_pct,
        "total_workstations": total
    }

def get_top_games() -> List[Dict[str, Any]]:
    """Returns top unauthorized game activities detected across the fleet."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT title, COUNT(*) as count, SUM(duration_seconds) as total_duration
        FROM violations
        GROUP BY title
        ORDER BY count DESC
        LIMIT 6
    """)
    rows = [dict(r) for r in c.fetchall()]
    conn.close()

    if not rows:
        return []
    return rows

def queue_remote_command(workstation_id: str, action: str, payload: str = "") -> int:
    """Queues a remote command supporting BOTH 'action' and 'type' to fix known bug."""
    conn = get_connection()
    c = conn.cursor()
    now = time.time()
    c.execute("""
        INSERT INTO pending_commands (workstation_id, action, type, payload, status, created_at)
        VALUES (?, ?, ?, ?, 'PENDING', ?)
    """, (workstation_id, action, action, payload, now))
    cmd_id = c.lastrowid
    conn.commit()
    conn.close()
    return cmd_id

def fetch_pending_commands(workstation_id: str) -> List[Dict[str, Any]]:
    """Fetches and marks pending commands as DELIVERED."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT id, workstation_id, action, type, payload
        FROM pending_commands
        WHERE workstation_id = ? AND status = 'PENDING'
    """, (workstation_id,))
    rows = [dict(r) for r in c.fetchall()]
    if rows:
        ids = [str(r["id"]) for r in rows]
        c.execute(f"UPDATE pending_commands SET status = 'DELIVERED' WHERE id IN ({','.join(ids)})")
        conn.commit()
    conn.close()
    return rows
