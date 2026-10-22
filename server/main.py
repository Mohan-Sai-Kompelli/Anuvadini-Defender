"""
Anuvadini Apex — Enterprise Monitoring Hub
High-throughput REST API & WebSocket Server with 35 endpoints, SQLite persistence,
8-stage detection synchronization, 7-tab enterprise UI, and live delta streaming.
"""

import asyncio
import base64
import socket
import csv
import datetime
import io
import json
import os
import random
import re
import time
from typing import Dict, Any, Set, Optional, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Query, Body, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import psutil

# Safe import of core modules
import sys
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from core.evidence import capture_desktop_gdi, create_tamper_evident_proof
from core.signatures import (
    GAME_PROCESSES, GAME_LAUNCHERS, EMULATORS, ANTI_AFK_JIGGLERS,
    BROWSER_PATTERNS, PRODUCTIVITY_WHITELIST
)
from core.database import (
    init_db, seed_demo_fleet_if_empty, record_activity_and_violation,
    get_hourly_analytics, get_fleet_health_score, get_top_games,
    queue_remote_command, fetch_pending_commands, get_connection,
    get_daily_employee_reports, get_employee_audit_trail, upsert_employee, list_employees
)
from core.engine import ShiftScheduler
from core.nvidia_nim import NvidiaNimVisionAuditor, NIM_MODELS
from core.anti_tamper import AntiTamperEngine
from core.enforcer import kill_process_by_pid_or_name, show_system_warning_modal

# Directories
DASHBOARD_DIR = os.path.join(BASE_DIR, "dashboard")
TEMPLATES_DIR = os.path.join(DASHBOARD_DIR, "templates")
STATIC_DIR = os.path.join(DASHBOARD_DIR, "static")

app = FastAPI(
    title="Anuvadini Apex Enterprise",
    description="Automated monitoring, anti-slacking, and PC gaming defense platform",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

templates = Jinja2Templates(directory=TEMPLATES_DIR)

# In-memory registry for connected client agents
ACTIVE_CLIENTS: Dict[str, Dict[str, Any]] = {}
CLIENT_WEBSOCKETS: Dict[str, WebSocket] = {}
ADMIN_CONNECTIONS: Set[WebSocket] = set()
LIVE_CONNECTIONS: Set[WebSocket] = set()
INSPECTING_CLIENTS: Set[str] = set()  # client_ids currently being viewed in HD mode

SERVER_START_TIME = time.time()

shift_engine = ShiftScheduler()
anti_tamper_hub = AntiTamperEngine()
nim_auditor = NvidiaNimVisionAuditor()

# Categorized Blacklists for Distinct Violation Classification
GAMING_KEYWORDS = [
    "steam", "epic games", "valorant", "roblox", "minecraft", "poki", "crazygames",
    "cs2", "csgo", "battlenet", "riot games", "dota 2", "league of legends", "fortnite",
    "gta5", "gtav", "freecell", "solitaire", "minesweeper", "chess.com", "krunker.io"
]

TRADING_KEYWORDS = [
    "tradingview", "trading", "crypto", "forex", "binance", "bybit", "okx", "kucoin",
    "zerodha", "kite.zerodha", "groww", "upstox", "angelone", "wazirx", "coindcx",
    "olymptrade", "binomo", "iqoption", "quotex", "pocketoption", "exness", "octafx",
    "dhan", "fyers", "nifty", "banknifty", "sensex", "nasdaq", "dow jones", "s&p 500",
    "candlestick", "unnamed - brave", "unnamed - chrome", "btc/usd", "eth/usd", "xau/usd",
    "▲", "▼", "terminal64", "metatrader"
]

ENTERTAINMENT_KEYWORDS = [
    "youtube", "netflix", "spotify", "twitch", "prime video", "primevideo", "disney+",
    "hulu", "hotstar", "jiocinema", "jio cinema", "zee5", "zee 5", "sonyliv", "sony liv",
    "mx player", "mxplayer", "voot", "altbalaji", "lionsgate", "aha video",
    "tiktok", "instagram", "facebook", "reddit", "twitter",
    "x.com", "discord", "torrent", "piratebay", "1337x", "fitgirl"
]


BETTING_KEYWORDS = [
    "stake", "bet365", "1xbet", "dream11", "rummy", "parimatch", "dafabet", "casino",
    "bovada", "888casino", "pokerstars", "betway", "melbet", "mostbet"
]

# Combined for client sync
MONITORED_BLACKLIST = list(dict.fromkeys(
    GAMING_KEYWORDS + TRADING_KEYWORDS + ENTERTAINMENT_KEYWORDS + BETTING_KEYWORDS
))


def matches_keyword(kw: str, text: str) -> bool:
    """Matches keyword using word boundaries to avoid false positives (e.g. 'twitching' for 'twitch' or 'upstream' for 'steam')."""
    kw = (kw or "").strip()
    if not kw or not text:
        return False
    pattern = rf"(?<![a-zA-Z0-9]){re.escape(kw.lower())}(?![a-zA-Z0-9])"
    return bool(re.search(pattern, text.lower()))


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

def clean_window_title(window_title: str) -> str:
    """Removes ignored invisible hooks and overlay primers from [Background: ...] tags."""
    if not window_title:
        return ""
    if " [Background: " in window_title:
        parts = window_title.split(" [Background: ", 1)
        fg = parts[0].strip()
        bg = parts[1].rstrip("]").strip()
        if any(ign in bg.lower() for ign in IGNORED_BACKGROUND_PATTERNS):
            return fg
    return window_title


def classify_violation(window_title: str, process_name: str = "") -> tuple[str, str, str]:
    """
    Classifies activity into (state, status_badge, matched_keyword).
    Returns ("", "", "") if clean.
    Filters out invisible background hooks like 'Epic Games Launcher Overlay Primer'.
    """
    cleaned_window = clean_window_title(window_title)
    fg_title = cleaned_window.split(" [Background: ", 1)[0].strip()
    bg_title = cleaned_window.split(" [Background: ", 1)[1].rstrip("]").strip() if " [Background: " in cleaned_window else ""

    is_productive = any(pw in fg_title.lower() for pw in PRODUCTIVE_WORK_KEYWORDS)

    # 1. Check foreground window and process
    fg_combined = f"{fg_title} {process_name}"

    for kw in TRADING_KEYWORDS:
        if matches_keyword(kw, fg_combined):
            return "TRADING", "📈 Trading", kw

    for kw in ENTERTAINMENT_KEYWORDS:
        if matches_keyword(kw, fg_combined):
            return "ENTERTAINMENT", "🍿 Entertainment", kw

    for kw in GAMING_KEYWORDS:
        if matches_keyword(kw, fg_combined):
            return "GAMING", "🎮 Gaming", kw

    for kw in BETTING_KEYWORDS:
        if matches_keyword(kw, fg_combined):
            return "GAMING", "🎲 Gambling", kw

    # 2. Check legitimate background window (if present and not ignored)
    if bg_title:
        launcher_keywords = (
            "epic games", "steam", "riot games", "riot client", "battlenet",
            "battle.net", "origin", "ubisoft connect", "ea app", "gog galaxy"
        )
        for kw in TRADING_KEYWORDS:
            if matches_keyword(kw, bg_title):
                return "TRADING", "📈 Trading", kw

        for kw in ENTERTAINMENT_KEYWORDS:
            if matches_keyword(kw, bg_title):
                return "ENTERTAINMENT", "🍿 Entertainment", kw

        for kw in GAMING_KEYWORDS:
            # Game launchers in background are normal system utilities, not active gaming violations
            if kw in launcher_keywords:
                continue
            if matches_keyword(kw, bg_title):
                return "GAMING", "🎮 Gaming", kw

        for kw in BETTING_KEYWORDS:
            if matches_keyword(kw, bg_title):
                return "GAMING", "🎲 Gambling", kw

    return "", "", ""




async def broadcast_to_admins(message: dict):
    """Broadcasts delta updates to all connected admin and live viewers."""
    all_targets = ADMIN_CONNECTIONS.union(LIVE_CONNECTIONS)
    if not all_targets:
        return

    dead = set()
    async def _send(ws: WebSocket):
        try:
            await ws.send_json(message)
        except Exception:
            dead.add(ws)

    await asyncio.gather(*[_send(ws) for ws in all_targets], return_exceptions=True)
    for ws in dead:
        ADMIN_CONNECTIONS.discard(ws)
        LIVE_CONNECTIONS.discard(ws)

# ============================================================================
# Core UI Endpoint
# ============================================================================
@app.get("/", response_class=HTMLResponse)
async def admin_dashboard(request: Request):
    """Renders the high-throughput 7-Tab Anuvadini Apex Dashboard."""
    server_host = request.headers.get("host", "127.0.0.1").split(":")[0]
    lan_ip = get_server_lan_ip()
    tunnel_domain, tunnel_port = get_tunnel_host()
    effective_ip = tunnel_domain or (lan_ip if server_host in ("127.0.0.1", "localhost", "0.0.0.0") else server_host)
    effective_port = tunnel_port or (8000 if not tunnel_domain else 443)
    shift_info = shift_engine.evaluate()
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "blacklist": MONITORED_BLACKLIST,
            "title": "Anuvadini Apex - Enterprise Monitoring Platform",
            "server_host": server_host,
            "server_lan_ip": effective_ip,
            "server_port": effective_port,
            "tunnel_domain": tunnel_domain,
            "local_lan_ip": lan_ip,
            "shift_info": shift_info
        }
    )

# ============================================================================
# 1. Fleet & Workstations Endpoints
# ============================================================================
@app.get("/api/fleet")
async def get_fleet(
    department: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None
):
    """Returns workstation fleet grid with department filter, search, and real metrics."""
    conn = get_connection()
    c = conn.cursor()

    query = "SELECT * FROM workstations WHERE 1=1"
    params = []

    if department and department.lower() != "all":
        query += " AND LOWER(department) = LOWER(?)"
        params.append(department)

    if status and status.lower() != "all":
        if status.lower() == "alerts":
            query += " AND (status LIKE '%GAMING%' OR status LIKE '%Alert%')"
        elif status.lower() == "active" or status.lower() == "productive":
            query += " AND status = 'WORK'"
        elif status.lower() == "idle":
            query += " AND status = 'IDLE'"
        elif status.lower() == "offline":
            query += " AND (status = 'Offline' OR (CAST(strftime('%s', 'now') AS INTEGER) - CAST(last_seen AS INTEGER) > 30))"
        else:
            query += " AND LOWER(status) = LOWER(?)"
            params.append(status)

    if search:
        s = f"%{search.lower()}%"
        query += " AND (LOWER(hostname) LIKE ? OR LOWER(username) LIKE ? OR LOWER(active_window) LIKE ? OR LOWER(department) LIKE ?)"
        params.extend([s, s, s, s])

    query += " ORDER BY CASE WHEN status LIKE '%GAMING%' THEN 0 WHEN status = 'IDLE' THEN 1 ELSE 2 END, hostname ASC"
    c.execute(query, params)
    rows = [dict(r) for r in c.fetchall()]
    conn.close()

    # Merge with real-time active thumbnail cache if present
    now = time.time()
    for row in rows:
        cid = row["id"]
        if cid in ACTIVE_CLIENTS:
            cdata = ACTIVE_CLIENTS[cid]
            row["connected"] = cdata.get("connected", True)
            row["screenshot"] = cdata.get("screenshot", "")
            row["idle_seconds"] = cdata.get("idle_seconds", 0)
        else:
            row["connected"] = (now - row.get("last_seen", 0)) < 30
            row["screenshot"] = ""

    return JSONResponse({"workstations": rows, "count": len(rows)})

@app.get("/api/fleet/{workstation_id}")
async def get_workstation(workstation_id: str):
    """Retrieves deep telemetry for focused workstation inspector."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM workstations WHERE id = ?", (workstation_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Workstation not found")

    station = dict(row)
    # Fetch recent violations
    c.execute("""
        SELECT * FROM violations WHERE workstation_id = ?
        ORDER BY id DESC LIMIT 5
    """, (workstation_id,))
    station["recent_violations"] = [dict(r) for r in c.fetchall()]
    conn.close()

    if workstation_id in ACTIVE_CLIENTS:
        station["live_data"] = ACTIVE_CLIENTS[workstation_id]

    return JSONResponse(station)

@app.delete("/api/fleet/{workstation_id}")
async def delete_workstation(workstation_id: str):
    """Removes a decommissioned workstation from fleet registry."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM workstations WHERE id = ?", (workstation_id,))
    c.execute("DELETE FROM violations WHERE workstation_id = ?", (workstation_id,))
    conn.commit()
    conn.close()
    if workstation_id in ACTIVE_CLIENTS:
        del ACTIVE_CLIENTS[workstation_id]
    return JSONResponse({"success": True, "message": f"Workstation {workstation_id} deleted."})

@app.post("/api/fleet/{workstation_id}/department")
async def update_workstation_department(workstation_id: str, payload: dict = Body(...)):
    """Assigns workstation to a specific company department."""
    dept = payload.get("department", "Engineering")
    conn = get_connection()
    c = conn.cursor()
    c.execute("UPDATE workstations SET department = ? WHERE id = ?", (dept, workstation_id))
    conn.commit()
    conn.close()
    return JSONResponse({"success": True, "department": dept})

@app.post("/api/auth/supervisor")
async def authenticate_supervisor(payload: dict = Body(...)):
    """Validates supervisor credentials on the server side."""
    username = payload.get("username", "").strip()
    password = payload.get("password", "").strip()
    server_pwd = os.getenv("ADMIN_PASSWORD", "admin")
    if password == server_pwd:
        return JSONResponse({
            "success": True,
            "username": username or "Supervisor",
            "message": "Authentication successful"
        })
    return JSONResponse(
        status_code=401,
        content={"success": False, "error": "Invalid supervisor password."}
    )

# ============================================================================
# 2. Incidents & Violations Endpoints
# ============================================================================
@app.get("/api/violations")
async def list_violations(status: Optional[str] = None, limit: int = 50):
    """Returns incident feed with tamper-evident audit evidence thumbnails."""
    conn = get_connection()
    c = conn.cursor()
    query = "SELECT * FROM violations"
    params = []
    if status:
        query += " WHERE status = ?"
        params.append(status)
    query += " ORDER BY id DESC LIMIT ?"
    params.append(limit)

    c.execute(query, params)
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return JSONResponse({"violations": rows, "count": len(rows)})

@app.get("/api/violations/{violation_id}")
async def get_violation(violation_id: int):
    """Fetches full tamper-evident audit proof for a single incident."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM violations WHERE id = ?", (violation_id,))
    row = c.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Violation record not found")
    return JSONResponse(dict(row))

@app.post("/api/violations/{violation_id}/resolve")
async def resolve_violation(violation_id: int):
    """Marks violation resolved by IT administrator."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("UPDATE violations SET status = 'RESOLVED' WHERE id = ?", (violation_id,))
    conn.commit()
    conn.close()
    return JSONResponse({"success": True, "id": violation_id, "status": "RESOLVED"})

@app.delete("/api/violations/{violation_id}")
async def delete_violation(violation_id: int):
    """Deletes violation record."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM violations WHERE id = ?", (violation_id,))
    conn.commit()
    conn.close()
    return JSONResponse({"success": True, "id": violation_id})

@app.get("/api/violations/export/csv")
async def export_violations_csv():
    """Generates an executive forensic CSV audit log of all compliance violations."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT id, workstation_id, username, title, process_name,
               duration_seconds, ai_verdict, status,
               datetime(timestamp, 'unixepoch') as logged_time
        FROM violations ORDER BY id DESC
    """)
    rows = c.fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Incident ID", "Workstation", "User", "Violation Title", "Process", "Duration (Sec)", "AI Verdict", "Status", "Timestamp UTC"])
    for r in rows:
        writer.writerow([r["id"], r["workstation_id"], r["username"], r["title"], r["process_name"], r["duration_seconds"], r["ai_verdict"], r["status"], r["logged_time"]])

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=Anuvadini_Incidents_{int(time.time())}.csv"}
    )

# ============================================================================
# 3. Analytics & Fleet Health Endpoints
# ============================================================================
@app.get("/api/analytics/hourly")
async def api_hourly_analytics():
    """Returns hourly 08:00–19:00 Work vs Gaming vs AFK distribution."""
    return JSONResponse(get_hourly_analytics())

@app.get("/api/analytics/health")
async def api_fleet_health():
    """Returns fleet health compliance score (0-100) and state ratios."""
    return JSONResponse(get_fleet_health_score())

@app.get("/api/analytics/top-games")
async def api_top_games():
    """Returns top unauthorized game activities across company."""
    return JSONResponse(get_top_games())

# ============================================================================
# 3b. 200+ Employee Daily Reports & Audit Infrastructure
# ============================================================================
@app.get("/api/reports/daily")
async def api_daily_employee_reports(date: Optional[str] = Query(None)):
    """
    Returns full daily productivity, active time, idle time, and violation metrics
    for all 200+ employees and workstations across departments.
    """
    target_date = date or datetime.date.today().isoformat()
    reports = get_daily_employee_reports(target_date)
    return JSONResponse({
        "success": True,
        "date": target_date,
        "total_employees": len(reports),
        "reports": reports
    })

@app.get("/api/reports/employee/{workstation_id}")
async def api_employee_audit_trail(workstation_id: str, date: Optional[str] = Query(None)):
    """
    Returns detailed audit trail of every violation, process name, and exact timeline
    for a specific employee/workstation on a specific date.
    """
    target_date = date or datetime.date.today().isoformat()
    audit = get_employee_audit_trail(workstation_id, target_date)
    return JSONResponse(audit)

@app.get("/api/reports/export/csv")
async def export_daily_reports_csv(date: Optional[str] = Query(None)):
    """Exports full enterprise daily employee attendance & productivity report as CSV."""
    target_date = date or datetime.date.today().isoformat()
    reports = get_daily_employee_reports(target_date)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Employee Code", "Employee Name", "Workstation ID", "Department",
        "Designation", "Date", "Active Work Time", "Idle Time",
        "Total Violation Time", "Violations Count", "Productivity Score (%)", "Current Status"
    ])
    for r in reports:
        writer.writerow([
            r["employee_id"], r["employee_name"], r["workstation_id"],
            r["department"], r["designation"], r["date"],
            r["active_formatted"], r["idle_formatted"], r["violation_formatted"],
            r["violations_count"], f"{r['productivity_score']}%", r["status"]
        ])

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=Anuvadini_Daily_Employee_Report_{target_date}.csv"}
    )

@app.get("/api/employees")
async def api_list_employees():
    """Lists all registered employees in directory."""
    return JSONResponse({"employees": list_employees()})

@app.post("/api/employees")
async def api_create_employee(payload: dict = Body(...)):
    """Creates or updates employee mapping."""
    emp_id = payload.get("id") or f"EMP-{int(time.time()) % 100000}"
    name = payload.get("name", "")
    if not name:
        raise HTTPException(status_code=400, detail="Employee name required")
    res = upsert_employee(
        emp_id=emp_id,
        name=name,
        email=payload.get("email", ""),
        department=payload.get("department", "Technology"),
        designation=payload.get("designation", "Software Engineer"),
        workstation_id=payload.get("workstation_id", "")
    )
    return JSONResponse(res)

# ============================================================================
# 4. Remote IT Actions & Commands (Fixes known Action vs Type bug!)
# Helper to locate active client WebSocket by exact or case-insensitive ID
def get_client_ws(client_id: str) -> Optional[WebSocket]:
    if not client_id:
        return None
    if client_id in CLIENT_WEBSOCKETS:
        return CLIENT_WEBSOCKETS[client_id]
    target_lower = client_id.lower().strip()
    for cid, ws in CLIENT_WEBSOCKETS.items():
        if cid.lower().strip() == target_lower:
            return ws
    return None

# ============================================================================
# Remote Action Endpoints (Process Termination, Modal Warnings, Fleet Actions)
# ============================================================================
@app.post("/api/commands/kill")
async def dispatch_kill_command(payload: dict = Body(...)):
    """Dispatches remote process termination command to target workstation."""
    target_ws = payload.get("workstation_id", "")
    process_target = payload.get("process", "") # PID, process name, or window keyword

    if not target_ws:
        raise HTTPException(status_code=400, detail="workstation_id required")

    # Queue command with BOTH action and type keys in database
    cmd_id = queue_remote_command(target_ws, action="KILL_PROCESS", payload=str(process_target))

    # Push IMMEDIATELY over active WebSocket connection if available
    ws = get_client_ws(target_ws)
    direct_sent = False
    if ws:
        try:
            await ws.send_json({
                "type": "KILL_PROCESS",
                "action": "KILL_PROCESS",
                "payload": str(process_target)
            })
            direct_sent = True
        except Exception as e:
            logger.warning(f"Direct push of kill command to {target_ws} failed: {e}")

    # Also broadcast event to admin UI dashboards
    await broadcast_to_admins({
        "type": "remote_command_dispatched",
        "workstation_id": target_ws,
        "action": "KILL_PROCESS",
        "target": process_target,
        "direct_sent": direct_sent
    })

    return JSONResponse({
        "success": True,
        "command_id": cmd_id,
        "workstation_id": target_ws,
        "action": "KILL_PROCESS",
        "target": process_target,
        "direct_sent": direct_sent,
        "message": f"Kill command dispatched to {target_ws} for '{process_target}'"
    })

@app.post("/api/commands/warn")
async def dispatch_warn_command(payload: dict = Body(...)):
    """Dispatches system-level warning modal directly to employee monitor."""
    target_ws = payload.get("workstation_id", "")
    message = payload.get("message", "Unauthorized activity detected. Please return to work immediately.")

    if not target_ws:
        raise HTTPException(status_code=400, detail="workstation_id required")

    cmd_id = queue_remote_command(target_ws, action="WARN_POPUP", payload=message)

    # Push IMMEDIATELY over active WebSocket connection if available
    ws = get_client_ws(target_ws)
    direct_sent = False
    if ws:
        try:
            await ws.send_json({
                "type": "WARN_POPUP",
                "action": "WARN_POPUP",
                "payload": message
            })
            direct_sent = True
        except Exception as e:
            logger.warning(f"Direct push of warn command to {target_ws} failed: {e}")

    await broadcast_to_admins({
        "type": "remote_command_dispatched",
        "workstation_id": target_ws,
        "action": "WARN_POPUP",
        "message": message,
        "direct_sent": direct_sent
    })

    return JSONResponse({
        "success": True,
        "command_id": cmd_id,
        "workstation_id": target_ws,
        "action": "WARN_POPUP",
        "direct_sent": direct_sent,
        "message": f"Warning modal dispatched to {target_ws}"
    })

@app.post("/api/commands/bulk-warn-slacking")
async def bulk_warn_slacking():
    """Sends warning popup to ALL workstations currently in GAMING or IDLE state."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT id FROM workstations WHERE status LIKE '%GAMING%' OR status = 'IDLE'")
    offenders = [r["id"] for r in c.fetchall()]
    conn.close()

    count = 0
    for ws_id in offenders:
        msg = "Official Compliance Warning: Non-work activity flagged."
        queue_remote_command(ws_id, action="WARN_POPUP", payload=msg)
        ws = get_client_ws(ws_id)
        if ws:
            try:
                await ws.send_json({
                    "type": "WARN_POPUP",
                    "action": "WARN_POPUP",
                    "payload": msg
                })
            except Exception:
                pass
        count += 1

    return JSONResponse({"success": True, "warned_count": count, "targets": offenders})

@app.post("/api/commands/bulk-kill-gaming")
async def bulk_kill_gaming():
    """Dispatches process kill to ALL workstations currently running game processes."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT id, active_window FROM workstations WHERE status LIKE '%GAMING%'")
    rows = c.fetchall()
    conn.close()

    count = 0
    for r in rows:
        ws_id = r["id"]
        proc_hint = r["active_window"].split()[0].lower() + ".exe"
        queue_remote_command(ws_id, action="KILL_PROCESS", payload=proc_hint)
        ws = get_client_ws(ws_id)
        if ws:
            try:
                await ws.send_json({
                    "type": "KILL_PROCESS",
                    "action": "KILL_PROCESS",
                    "payload": proc_hint
                })
            except Exception:
                pass
        count += 1

    return JSONResponse({"success": True, "killed_count": count})

@app.post("/api/client/{client_id}/mode")
async def set_client_stream_mode(client_id: str, payload: dict = Body(...)):
    """Switches an endpoint between standard low-bandwidth buffer and crystal-clear HD inspection mode."""
    mode = payload.get("mode", "normal")  # 'hd' or 'normal'
    if mode == "hd":
        INSPECTING_CLIENTS.add(client_id)
    else:
        INSPECTING_CLIENTS.discard(client_id)

    # If client is connected via WebSocket, send the mode switch immediately!
    ws_client = CLIENT_WEBSOCKETS.get(client_id)
    if ws_client:
        try:
            await ws_client.send_json({
                "type": "SET_STREAM_MODE",
                "action": "SET_STREAM_MODE",
                "mode": mode,
                "interval": 0.8 if mode == "hd" else 2.5,
                "quality": 92 if mode == "hd" else 38,
                "resolution": "native" if mode == "hd" else "thumb"
            })
        except Exception:
            pass

    return JSONResponse({
        "success": True,
        "client_id": client_id,
        "mode": mode,
        "message": f"Workstation {client_id} stream set to {mode.upper()} mode."
    })

@app.get("/api/commands/pending/{workstation_id}")

async def get_pending_commands(workstation_id: str):
    """
    Endpoint polled by agent to retrieve instructions.
    Returns both 'action' and 'type' so agent never fails!
    """
    cmds = fetch_pending_commands(workstation_id)
    return JSONResponse({"commands": cmds, "count": len(cmds)})

# ============================================================================
# 5. Shift Schedule & Automation Endpoints
# ============================================================================
@app.get("/api/shift/status")
async def api_shift_status():
    """Returns autonomous 09:30-17:30 shift telemetry, countdown, and progress."""
    shift_engine.reload_from_db()
    return JSONResponse(shift_engine.evaluate())

@app.post("/api/shift/settings")
async def update_shift_settings(payload: dict = Body(...)):
    """Updates office shift operating hours and lunch break."""
    conn = get_connection()
    c = conn.cursor()
    for k in ["shift_start", "shift_end", "lunch_start", "lunch_end", "shift_days"]:
        if k in payload:
            c.execute("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)", (k, payload[k], time.time()))
    conn.commit()
    conn.close()
    shift_engine.reload_from_db()
    return JSONResponse({"success": True, "settings": payload})

@app.post("/api/shift/override")
async def set_shift_override(payload: dict = Body(...)):
    """Manual Shift Override: AUTO | FORCE_WORK | FORCE_STANDBY."""
    mode = payload.get("mode", "AUTO")
    conn = get_connection()
    c = conn.cursor()
    c.execute("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('manual_override', ?, ?)", (mode, time.time()))
    conn.commit()
    conn.close()
    shift_engine.reload_from_db()
    return JSONResponse({"success": True, "mode": mode, "status": shift_engine.evaluate()})

# ============================================================================
# 6. Policy Rules Endpoints
# ============================================================================
@app.get("/api/rules")
async def get_rules():
    """Lists enterprise compliance policy rules."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM custom_rules ORDER BY id DESC")
    rules = [dict(r) for r in c.fetchall()]
    conn.close()
    return JSONResponse({"rules": rules, "count": len(rules)})

@app.post("/api/rules")
async def add_rule(payload: dict = Body(...)):
    """Creates a custom policy enforcement rule."""
    name = payload.get("name", "Custom Rule")
    r_type = payload.get("rule_type", "process")
    pattern = payload.get("pattern", "")
    action = payload.get("action", "ALERT")
    severity = payload.get("severity", "HIGH")

    if not pattern:
        raise HTTPException(status_code=400, detail="Rule pattern required")

    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        INSERT INTO custom_rules (name, rule_type, pattern, action, severity, enabled, created_at)
        VALUES (?, ?, ?, ?, ?, 1, ?)
    """, (name, r_type, pattern, action, severity, time.time()))
    rule_id = c.lastrowid
    conn.commit()
    conn.close()
    return JSONResponse({"success": True, "rule_id": rule_id})

@app.put("/api/rules/{rule_id}/toggle")
async def toggle_rule(rule_id: int):
    """Enables or disables a custom rule."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("UPDATE custom_rules SET enabled = 1 - enabled WHERE id = ?", (rule_id,))
    conn.commit()
    conn.close()
    return JSONResponse({"success": True, "rule_id": rule_id})

@app.delete("/api/rules/{rule_id}")
async def delete_rule(rule_id: int):
    """Deletes custom policy rule."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM custom_rules WHERE id = ?", (rule_id,))
    conn.commit()
    conn.close()
    return JSONResponse({"success": True, "rule_id": rule_id})

# ============================================================================
# 7. NVIDIA NIM AI Vision Endpoints
# ============================================================================
@app.get("/api/nim/config")
async def get_nim_config():
    """Returns current NVIDIA NIM AI settings and available models."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT value FROM system_settings WHERE key = 'nim_api_key'")
    row_k = c.fetchone()
    c.execute("SELECT value FROM system_settings WHERE key = 'nim_model'")
    row_m = c.fetchone()
    conn.close()

    raw_key = row_k["value"] if row_k else ""
    masked_key = f"{raw_key[:4]}...{raw_key[-4:]}" if len(raw_key) > 8 else ("Configured" if raw_key else "Not Set")

    return JSONResponse({
        "configured": bool(raw_key),
        "masked_key": masked_key,
        "current_model": row_m["value"] if row_m else "meta/llama-3.2-11b-vision-instruct",
        "available_models": NIM_MODELS
    })

@app.post("/api/nim/config")
async def save_nim_config(payload: dict = Body(...)):
    """Saves NVIDIA NIM API key and model selection."""
    api_key = payload.get("api_key", "").strip()
    model = payload.get("model", "meta/llama-3.2-11b-vision-instruct")

    conn = get_connection()
    c = conn.cursor()
    if api_key:
        c.execute("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('nim_api_key', ?, ?)", (api_key, time.time()))
    if model:
        c.execute("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('nim_model', ?, ?)", (model, time.time()))
    conn.commit()
    conn.close()

    nim_auditor.set_config(api_key, model)
    return JSONResponse({"success": True, "model": model})

@app.post("/api/nim/test")
async def test_nim_connection(payload: dict = Body(...)):
    """Tests connection to NVIDIA NIM endpoint."""
    api_key = payload.get("api_key") or nim_auditor.api_key
    model = payload.get("model") or nim_auditor.model
    temp_auditor = NvidiaNimVisionAuditor(api_key, model)
    result = temp_auditor.test_connection()
    return JSONResponse(result)

@app.post("/api/nim/classify")
async def classify_screen(payload: dict = Body(...)):
    """Classifies a screenshot Base64 image using NVIDIA NIM Vision or local heuristic."""
    img_b64 = payload.get("image_b64", "")
    window_title = payload.get("window_title", "")
    result = nim_auditor.classify_screenshot(img_b64, window_title)
    return JSONResponse(result)

# ============================================================================
# 8. Anti-Tamper & Dead-Man Heartbeat Audit Endpoints
# ============================================================================
@app.get("/api/anti-tamper/status")
async def get_anti_tamper_status():
    """Returns dead-man frozen clients and integrity alerts."""
    tampered_stations = anti_tamper_hub.check_dead_man_heartbeats(timeout_seconds=25.0)
    return JSONResponse({
        "dead_man_timeout_seconds": 25.0,
        "tampered_workstations": tampered_stations,
        "is_fleet_secure": len(tampered_stations) == 0,
        "total_monitored": len(anti_tamper_hub.last_heartbeats)
    })

@app.post("/api/anti-tamper/reset/{workstation_id}")
async def reset_tamper_alert(workstation_id: str):
    """Clears tamper flag for workstation."""
    anti_tamper_hub.record_heartbeat(workstation_id)
    return JSONResponse({"success": True, "workstation_id": workstation_id})

# ============================================================================
# 9. 1-Click Test Simulator Triggers (Solitaire, Poki, CS2, Stake, Roblox)
# ============================================================================
@app.post("/api/simulator/trigger")
async def trigger_simulator_event(payload: dict = Body(...)):
    """
    Triggers 1-click test simulation to instantly demonstrate platform capabilities.
    Supported: 'solitaire', 'poki', 'cs2', 'stake', 'roblox'
    """
    test_type = payload.get("type", "cs2").lower()
    target_id = payload.get("workstation_id", "WS-ENG-02")

    presets = {
        "cs2": {
            "title": "Counter-Strike 2 - Competitive Mirage",
            "process": "cs2.exe",
            "state": "GAMING",
            "dept": "Engineering",
            "reason": "PC Game Detected (cs2.exe)",
            "gamepad": True
        },
        "poki": {
            "title": "Poki Games - Subway Surfers Online",
            "process": "chrome.exe",
            "state": "GAMING",
            "dept": "Design",
            "reason": "Web Game Portal (Poki)",
            "gamepad": False
        },
        "stake": {
            "title": "Stake.com - Crash & Live Roulette Betting",
            "process": "msedge.exe",
            "state": "GAMING",
            "dept": "Finance",
            "reason": "Gambling Portal Detected (Stake.com)",
            "gamepad": False
        },
        "solitaire": {
            "title": "Microsoft Solitaire Collection",
            "process": "solitaire.exe",
            "state": "GAMING",
            "dept": "HR",
            "reason": "Desktop Game Detected (Solitaire)",
            "gamepad": False
        },
        "roblox": {
            "title": "Roblox Player - Blox Fruits",
            "process": "robloxplayerbeta.exe",
            "state": "GAMING",
            "dept": "Sales",
            "reason": "PC Game Detected (Roblox)",
            "gamepad": True
        }
    }

    preset = presets.get(test_type, presets["cs2"])

    # Generate watermarked synthetic audit proof
    proof_b64, _ = create_tamper_evident_proof(
        workstation_id=target_id,
        user_id="Simulated Employee",
        violation_title=preset["title"]
    )

    # Record violation into DB
    record_activity_and_violation(
        workstation_id=target_id,
        hostname=target_id,
        username=f"User_{target_id}",
        department=preset["dept"],
        state=preset["state"],
        window_title=preset["title"],
        process_name=preset["process"],
        idle_seconds=0,
        cpu_percent=round(random.uniform(25.0, 65.0), 1),
        ram_percent=round(random.uniform(45.0, 75.0), 1),
        gamepad_connected=preset["gamepad"],
        ip="192.168.1.105",
        evidence_b64=proof_b64,
        violation_title=preset["title"]
    )

    # Broadcast delta update to all connected admins
    await broadcast_to_admins({
        "type": "client_update",
        "client_id": target_id,
        "data": {
            "client_id": target_id,
            "hostname": target_id,
            "username": f"User_{target_id}",
            "department": preset["dept"],
            "status": "Alert/Game",
            "state": "GAMING",
            "window": preset["title"],
            "process": preset["process"],
            "screenshot": proof_b64,
            "gamepad_connected": preset["gamepad"],
            "connected": True,
            "last_seen": time.time()
        }
    })

    return JSONResponse({
        "success": True,
        "preset": test_type,
        "workstation_id": target_id,
        "violation": preset["title"],
        "message": f"Simulated {preset['title']} on {target_id}."
    })

@app.post("/api/simulator/reset")
async def reset_simulator():
    """Resets simulator fleet to productive state."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("UPDATE workstations SET status = 'WORK', active_window = 'VS Code - main.py'")
    c.execute("UPDATE violations SET status = 'RESOLVED'")
    conn.commit()
    conn.close()

    await broadcast_to_admins({"type": "fleet_reset"})
    return JSONResponse({"success": True, "message": "Fleet reset to productive WORK state."})

# ============================================================================
# 10. Backward-Compatible ApexMonitor Endpoints
# ============================================================================
@app.api_route("/download/ApexMonitor.exe", methods=["GET", "HEAD"])
@app.api_route("/download/agent", methods=["GET", "HEAD"])
async def download_agent():
    """Provides direct download of standalone Windows executable."""
    exe_path = os.path.join(BASE_DIR, "ApexMonitor.exe")
    if not os.path.exists(exe_path):
        dist_path = os.path.join(BASE_DIR, "dist", "ApexMonitor.exe")
        if os.path.exists(dist_path):
            exe_path = dist_path
        else:
            return JSONResponse({"error": "ApexMonitor.exe not found on server"}, status_code=404)

    return FileResponse(
        path=exe_path,
        filename="ApexMonitor.exe",
        media_type="application/vnd.microsoft.portable-executable"
    )

def get_tunnel_host() -> tuple[Optional[str], Optional[int]]:
    """Detects active public tunnel (bore TCP tunnel or Cloudflare) if running."""
    try:
        bore_log = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "bore.log")
        if os.path.exists(bore_log):
            with open(bore_log, "r") as f:
                content = f.read()
                import re
                matches = re.findall(r"bore\.pub:(\d+)", content)
                if matches:
                    return ("bore.pub", int(matches[-1]))
    except Exception:
        pass

    try:
        log_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "cloudflared.log")
        if os.path.exists(log_path):
            with open(log_path, "r") as f:
                content = f.read()
                import re
                matches = re.findall(r"https://([-a-zA-Z0-9@:%._+~#=]*\.trycloudflare\.com)", content)
                if matches:
                    return (matches[-1], 443)
    except Exception:
        pass
    return (None, None)

def get_server_lan_ip() -> str:
    """Detects server's primary local network IP (e.g. 10.150.0.6) for external endpoints."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "10.150.0.6"

@app.get("/download/app_config.json")
async def download_config(
    request: Request,
    host: Optional[str] = None,
    port: Optional[int] = None,
    department: Optional[str] = "Engineering"
):
    """Generates pre-configured app_config.json pointing to this server."""
    req_host = request.headers.get("host", "").split(":")[0]
    lan_ip = get_server_lan_ip()

    tunnel_domain, tunnel_port = get_tunnel_host()

    # Determine best host to provide
    target_host = host
    if not target_host or target_host in ("127.0.0.1", "localhost", "0.0.0.0"):
        if tunnel_domain:
            target_host = tunnel_domain
        elif req_host and req_host not in ("127.0.0.1", "localhost", "0.0.0.0"):
            target_host = req_host
        else:
            target_host = lan_ip

    target_port = port or (tunnel_port if (tunnel_domain and target_host == tunnel_domain) else 8000)
    target_dept = department or "Engineering"

    config_content = {
        "server_host": target_host,
        "server_port": target_port,
        "department": target_dept,
        "frame_interval": 2.5
    }
    return JSONResponse(
        content=config_content,
        headers={"Content-Disposition": "attachment; filename=app_config.json"}
    )

@app.get("/api/stats")
async def get_stats():
    """Returns server and fleet health telemetry with REAL CPU/RAM metrics."""
    now = time.time()
    health = get_fleet_health_score()

    # Real hardware stats from psutil
    cpu_usage = psutil.cpu_percent(interval=None)
    ram_usage = psutil.virtual_memory().percent

    return JSONResponse({
        "uptime_seconds": int(now - SERVER_START_TIME),
        "online_count": health["total_workstations"],
        "alerts_count": int(health["total_workstations"] * (health["gaming_pct"] / 100)),
        "idle_count": int(health["total_workstations"] * (health["idle_pct"] / 100)),
        "productive_count": int(health["total_workstations"] * (health["work_pct"] / 100)),
        "fleet_health_score": health["score"],
        "admin_connections": len(ADMIN_CONNECTIONS) + len(LIVE_CONNECTIONS),
        "server_cpu_percent": cpu_usage,
        "server_ram_percent": ram_usage
    })

@app.get("/api/blacklist")
async def get_blacklist():
    """Endpoint for clients to fetch blacklist terms."""
    return {"blacklist": MONITORED_BLACKLIST}

# ============================================================================
# 11. WebSocket Pipelines (Client Streaming & Admin Feeds)
# ============================================================================
@app.websocket("/ws/client/{client_id}")
async def client_websocket(websocket: WebSocket, client_id: str):
    """
    Receives high-frequency telemetry from endpoints.
    Dispatches pending remote commands back to the client immediately.
    """
    await websocket.accept()
    CLIENT_WEBSOCKETS[client_id] = websocket
    client_ip = websocket.client.host if websocket.client else "Unknown"

    anti_tamper_hub.record_heartbeat(client_id)

    # Initial handshake
    await websocket.send_json({
        "type": "handshake",
        "blacklist": MONITORED_BLACKLIST,
        "recommended_interval": 3.0
    })


    try:
        while True:
            payload = await websocket.receive_json()
            now = time.time()
            anti_tamper_hub.record_heartbeat(client_id)

            status = payload.get("status", "Normal")
            raw_window = payload.get("window", "Unknown")
            window = clean_window_title(raw_window)
            department = payload.get("department", "Technology")
            process_name = payload.get("process_name", "")
            idle_secs = payload.get("idle_seconds", 0)
            cpu_pct = payload.get("cpu_percent", 0)
            ram_pct = payload.get("ram_percent", 0)
            gamepad = payload.get("gamepad_connected", False)
            screenshot = payload.get("screenshot", "")

            # Server-Side Classification into distinct categories: GAMING, TRADING, ENTERTAINMENT
            v_state, v_status, v_kw = classify_violation(window, process_name)
            server_matched_kw = v_kw

            if v_state:
                state = v_state
                status = v_status
            elif status == "Idle" or idle_secs >= 180:
                state = "IDLE"
                status = "Idle"
            else:
                state = "WORK"
                status = "Normal"

            is_violation_state = state in ("GAMING", "TRADING", "ENTERTAINMENT")

            # Persist to DB
            record_activity_and_violation(
                workstation_id=client_id,
                hostname=client_id,
                username=payload.get("username", f"User_{client_id}"),
                department=department,
                state=state,
                window_title=window,
                process_name=process_name or (window.split()[0].lower() + ".exe"),
                idle_seconds=idle_secs,
                cpu_percent=cpu_pct,
                ram_percent=ram_pct,
                gamepad_connected=gamepad,
                ip=client_ip,
                evidence_b64=screenshot if is_violation_state else "",
                violation_title=f"[{state}] {window}"
            )


            client_data = {
                "client_id": client_id,
                "hostname": client_id,
                "username": payload.get("username", f"User_{client_id}"),
                "department": department,
                "ip": client_ip,
                "window": window,
                "process_name": process_name or (window.split()[0].lower() + ".exe" if window else ""),
                "status": status,
                "state": state,
                "matched_keyword": payload.get("matched_keyword", "") or server_matched_kw,
                "idle_seconds": idle_secs,
                "screenshot": screenshot,

                "cpu_percent": cpu_pct,
                "ram_percent": ram_pct,
                "gamepad_connected": gamepad,
                "last_seen": now,
                "connected": True
            }

            ACTIVE_CLIENTS[client_id] = client_data

            # Broadcast delta to admins
            await broadcast_to_admins({
                "type": "client_update",
                "client_id": client_id,
                "data": client_data
            })

            # Check for any queued pending commands to send to this agent
            pending = fetch_pending_commands(client_id)
            if pending:
                for cmd in pending:
                    # Provide BOTH action and type so agent receives it properly
                    await websocket.send_json({
                        "type": cmd["type"],
                        "action": cmd["action"],
                        "payload": cmd.get("payload", "")
                    })

    except WebSocketDisconnect:
        CLIENT_WEBSOCKETS.pop(client_id, None)
        INSPECTING_CLIENTS.discard(client_id)
        if client_id in ACTIVE_CLIENTS:
            ACTIVE_CLIENTS[client_id]["connected"] = False
            ACTIVE_CLIENTS[client_id]["status"] = "Offline"
            ACTIVE_CLIENTS[client_id]["last_seen"] = time.time()
            await broadcast_to_admins({
                "type": "client_offline",
                "client_id": client_id,
                "timestamp": time.time()
            })
    except Exception as e:
        CLIENT_WEBSOCKETS.pop(client_id, None)
        INSPECTING_CLIENTS.discard(client_id)
        print(f"[Client WS Error] {client_id}: {e}")


@app.websocket("/ws/admin")
@app.websocket("/ws/live")
async def live_admin_websocket(websocket: WebSocket):
    """Real-time live WebSocket stream for 7-Tab Dashboard."""
    await websocket.accept()
    LIVE_CONNECTIONS.add(websocket)
    try:
        # Send full snapshot of all active and DB workstations
        conn = get_connection()
        c = conn.cursor()
        c.execute("SELECT * FROM workstations ORDER BY hostname ASC")
        db_stations = {r["id"]: dict(r) for r in c.fetchall()}
        conn.close()

        # Merge in-memory screenshot state
        for cid, db_info in db_stations.items():
            if cid in ACTIVE_CLIENTS:
                db_info["screenshot"] = ACTIVE_CLIENTS[cid].get("screenshot", "")
                db_info["connected"] = ACTIVE_CLIENTS[cid].get("connected", True)
            else:
                db_info["connected"] = (time.time() - db_info.get("last_seen", 0)) < 30
                db_info["screenshot"] = ""

        await websocket.send_json({
            "type": "snapshot",
            "clients": db_stations,
            "shift": shift_engine.evaluate(),
            "health": get_fleet_health_score(),
            "server_time": time.time()
        })

        while True:
            # Keep alive and listen for client commands
            msg = await websocket.receive_text()
    except WebSocketDisconnect:
        LIVE_CONNECTIONS.discard(websocket)
    except Exception:
        LIVE_CONNECTIONS.discard(websocket)

# ============================================================================
# Background Sweeper & Startup
# ============================================================================
async def sweep_stale_clients():
    while True:
        await asyncio.sleep(10)
        now = time.time()
        for client_id, info in list(ACTIVE_CLIENTS.items()):
            if info.get("connected") and (now - info.get("last_seen", 0) > 25.0):
                info["connected"] = False
                info["status"] = "Offline"
                await broadcast_to_admins({
                    "type": "client_offline",
                    "client_id": client_id,
                    "timestamp": now
                })

@app.on_event("startup")
async def startup_event():
    init_db()
    seed_demo_fleet_if_empty()
    shift_engine.reload_from_db()
    asyncio.create_task(sweep_stale_clients())

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
