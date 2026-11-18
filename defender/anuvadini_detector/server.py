"""
Anuvadini Detector - FastAPI Server & Real-time WebSockets
Delivers real-time workplace activity telemetry, incident auditing, and remote actions.
"""
import asyncio
import base64
import os
import sys
import time
import zipfile
import platform
import psutil
import re
import ctypes
from pathlib import Path
import socket
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, Response, StreamingResponse
from pydantic import BaseModel, Field
from urllib.parse import urlparse
import io
import csv
from datetime import datetime
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from anuvadini_detector.config import BASE_DIR, EVIDENCE_DIR, SERVER_HOST, SERVER_PORT
from anuvadini_detector.engine import engine
from anuvadini_detector.afk import get_idle_seconds
from anuvadini_detector.controller import is_controller_connected
from anuvadini_detector import security as sec
from anuvadini_detector.evidence import capture_screen_universal
from anuvadini_detector.firewall import firewall_engine

SERVER_START_TIME = time.time()
from anuvadini_detector.features import list_feature_access, set_feature_access, delete_feature_access, employee_has_feature, camera_allowed, set_camera_self_off
from anuvadini_detector.proctor.routes import proctor_router
from anuvadini_detector.database import save_workstation_camera_frame, get_workstation_camera_frame, get_workstation_camera_frame_age, is_employee_watched
from anuvadini_detector.usage import record_usage_tick, record_usage_report, usage_live_get, usage_live_update, usage_report, usage_day_detail, list_exclusions, add_exclusion, delete_exclusion
from anuvadini_detector.usage_export import export_file, ExportError, ExportNotFound, PdfUnavailable
from anuvadini_detector.usage_focus import list_focus_rules, add_focus_rule, delete_focus_rule, focus_rules_report
from anuvadini_detector.database import (
    get_workstation_screen_frame_age,
    delete_workstation,
    log_firewall_event,
    get_recent_violations,
    get_today_analytics,
    get_custom_rules,
    add_custom_rule,
    delete_custom_rule,
    upsert_workstation,
    get_fleet_workstations,
    get_fleet_stats,
    get_workstation_detail,
    queue_workstation_command,
    pop_workstation_commands,
    log_violation,
    get_employee_by_id,
    lookup_employee_by_id,
    authenticate_employee_credentials,
    save_workstation_screen_frame,
    rule_applies_to,
    get_workstation_screen_frame,
    get_firewall_rules,
    add_firewall_rule,
    delete_firewall_rule,
    toggle_firewall_rule,
    get_firewall_logs,
    get_firewall_exemptions,
    add_firewall_exemption,
    delete_firewall_exemption,
    get_firewall_roles,
    add_firewall_role,
    delete_firewall_role,
    add_firewall_role_member,
    remove_firewall_role_member,
    get_firewall_people,
    record_attendance_tick,
    record_app_activity_tick,
    get_app_activity,
    get_fleet_app_activity,
    get_daily_timesheet,
    get_setting,
    set_setting,
    add_admin_notification,
    get_admin_notifications,
    mark_notifications_read,
    clear_admin_notifications
)
from anuvadini_detector.enforcer import kill_process_by_pid, trigger_warning_popup, lock_workstation
from anuvadini_detector.notifier import send_violation_webhook, register_broadcaster
from anuvadini_detector.autostart import is_autostart_enabled, enable_autostart, disable_autostart
from anuvadini_detector.nvidia_nim import nvidia_auditor
from anuvadini_detector.anti_tamper import (
    scan_gaming_network_sockets,
    scan_evasion_processes,
    check_heartbeat_tampering,
    scan_disguised_processes_pe
)

app = FastAPI(title="Anuvadini Detector API", version="2.0.0")

# ==========================================================
# ACCESS CONTROL
# - The admin PC itself (loopback) is trusted; anyone else must log in with the admin password.
# - Agent endpoints and the installer stay open so employee PCs can enrol and report.
# - Cross-site requests from a browser against the admin API are rejected (CSRF / DNS-rebinding protection).
# ==========================================================
MAX_BODY_BYTES = 8 * 1024 * 1024
PUBLIC_API_EXACT = {
    "/api/employee/login", "/api/admin/login", "/api/admin/session",
    "/api/fleet/register", "/api/fleet/heartbeat", "/api/fleet/stream-frame",
    "/api/fleet/firewall-event", "/api/fleet/policy",
    "/api/fleet/stream-frame-bin", "/api/fleet/stream-camera", "/api/fleet/camera-preference",
    "/api/fleet/proctor-event", "/api/fleet/proctor-challenge-response", "/api/fleet/proctor-gaze",
    "/api/agent/register", "/api/agent/heartbeat",
    "/api/download/installer", "/api/download/mac-installer", "/api/download/client-bundle.zip",
}
PUBLIC_API_PREFIXES = ("/api/employee/verify/",)
ADMIN_ONLY_NON_API = ("/docs", "/redoc", "/openapi.json")

def _is_admin_request(request) -> bool:
    peer = request.client.host if request.client else None
    forwarded = request.headers.get("x-forwarded-for") or request.headers.get("forwarded")
    if sec.is_trusted_local(peer, request.headers.get("host"), forwarded):
        return True
    return sec.valid_admin_session(request.cookies.get(sec.ADMIN_COOKIE))

app.include_router(proctor_router)

@app.middleware("http")
async def security_gate(request: Request, call_next):
    path = request.url.path
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > MAX_BODY_BYTES:
        return JSONResponse(status_code=413, content={"detail": "Request body too large"})

    if path.startswith("/api/") or path.startswith(ADMIN_ONLY_NON_API):
        public = path in PUBLIC_API_EXACT or path.startswith(PUBLIC_API_PREFIXES)
        if not public:
            if not _is_admin_request(request):
                return JSONResponse(status_code=401, content={"detail": "Admin authentication required"})
            origin = request.headers.get("origin")
            if origin and request.method not in ("GET", "HEAD", "OPTIONS"):
                if urlparse(origin).netloc.lower() != (request.headers.get("host") or "").lower():
                    return JSONResponse(status_code=403, content={"detail": "Cross-origin request blocked"})
    response = await call_next(request)
    return response


# WebSocket Connection Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast_json(self, message: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(connection)

manager = ConnectionManager()

# Hook engine broadcast into asyncio loop for WebSockets
def _on_engine_telemetry(data: dict):
    # Schedule broadcast in event loop
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.run_coroutine_threadsafe(manager.broadcast_json(data), loop)
    except Exception:
        pass

engine.register_subscriber(_on_engine_telemetry)

# Register notifier broadcaster for instant in-dashboard alerts
def _on_notification_event(data: dict):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.run_coroutine_threadsafe(manager.broadcast_json(data), loop)
    except Exception:
        pass

register_broadcaster(_on_notification_event)

# Lifecycle Event
@app.on_event("startup")
async def startup_event():
    # Detection engine is NOT auto-started — it was causing CPU/thermal spikes on boot
    # (PE header scan of all 150+ processes + network socket scan on first tick).
    # Start it manually from the admin dashboard if needed.
    pass

@app.on_event("shutdown")
async def shutdown_event():
    engine.stop()

class AdminLoginRequest(BaseModel):
    password: str = Field(max_length=200)

@app.post("/api/admin/login")
async def api_admin_login(req: AdminLoginRequest, request: Request):
    peer = request.client.host if request.client else "unknown"
    wait = sec.admin_login_throttle.retry_after(peer)
    if wait:
        return JSONResponse(status_code=429, headers={"Retry-After": str(wait)},
                            content={"detail": f"Too many failed attempts. Try again in {wait} seconds."})
    if not sec.verify_admin_password(req.password):
        sec.admin_login_throttle.record_failure(peer)
        return JSONResponse(status_code=401, content={"detail": "Wrong admin password"})
    sec.admin_login_throttle.record_success(peer)
    resp = JSONResponse(content={"success": True})
    resp.set_cookie(sec.ADMIN_COOKIE, sec.create_admin_session(), httponly=True, samesite="strict",
                    secure=(request.url.scheme == "https"), max_age=12 * 3600)
    return resp

@app.post("/api/admin/logout")
async def api_admin_logout(request: Request):
    sec.end_admin_session(request.cookies.get(sec.ADMIN_COOKIE))
    resp = JSONResponse(content={"success": True})
    resp.delete_cookie(sec.ADMIN_COOKIE)
    return resp

@app.get("/api/admin/session")
async def api_admin_session(request: Request):
    return {"authenticated": _is_admin_request(request)}

# Agent-facing: the enforcement policy + rules an employee PC needs (agents have no database of their own)
@app.get("/api/fleet/policy")
async def api_fleet_policy(employee_id: str = "", department: str = ""):
    policy = _enforcement_policy()
    # Each PC only receives the rules that target its own employee / department (or everyone).
    rules = [{"domain": r["domain"], "category": r.get("category", ""), "enabled": r.get("enabled", 1)}
             for r in get_firewall_rules()
             if r.get("enabled", 1) == 1 and rule_applies_to(r, employee_id[:64], department[:120])]
    custom = [{k: r.get(k) for k in ("rule_type", "pattern", "label", "category", "action")} for r in get_custom_rules()]
    exemptions = [{k: e.get(k) for k in ("employee_id", "hostnames", "scope", "value", "target_type", "role", "member_count")} for e in get_firewall_exemptions()]
    shift = engine.get_shift_status()
    fw_on = firewall_engine.is_enabled() and (bool(shift.get("is_active")) or engine.override_schedule)
    return {**policy, "firewall_enabled": fw_on, "firewall_rules": rules, "custom_rules": custom,
            "firewall_exemptions": exemptions,
            "music_enabled": employee_has_feature("music", employee_id[:64]),
            "camera_enabled": camera_allowed(employee_id[:64]),
            "camera_admin_allowed": employee_has_feature("camera", employee_id[:64])}

class FirewallEventRequest(BaseModel):
    hostname: str = Field(max_length=100)
    username: str = Field(default="Employee", max_length=100)
    employee_id: str = Field(default="", max_length=64)
    domain: str = Field(max_length=253)
    category: str = Field(default="Workplace Policy", max_length=100)
    action_taken: str = Field(default="SILENTLY_BLOCKED", max_length=50)

# Agent-facing: an employee PC reports a tab it closed (the agent cannot write to the database itself)
@app.post("/api/fleet/firewall-event")
async def api_fleet_firewall_event(req: FirewallEventRequest):
    if not _enforcement_policy()["enforce"]:
        return {"success": True, "logged": False, "reason": "outside enforcement hours"}
    log_firewall_event(hostname=req.hostname, username=req.username, domain=req.domain, category=req.category,
                       action_taken=req.action_taken, employee_id=req.employee_id)
    # Also record it as an incident so it appears on the Incidents page (which reads violations).
    try:
        from anuvadini_detector.database import get_db as _get_db
        _now_dt = datetime.now()
        _proc_key = ("website:" + str(req.domain or ""))[:100]
        _prev = _get_db().violations.find_one(
            {"hostname": req.hostname, "process_name": _proc_key, "date_str": _now_dt.strftime("%Y-%m-%d")},
            sort=[("id", -1)])
        _burst = False
        if _prev and _prev.get("timestamp"):
            try:
                _burst = (_now_dt - datetime.strptime(_prev["timestamp"], "%Y-%m-%d %H:%M:%S")).total_seconds() < 15
            except Exception:
                _burst = False
        if _burst:
            return {"success": True, "logged": False, "reason": "repeat event within 15 seconds"}
        log_violation(
            hostname=req.hostname, username=req.username,
            game_name=str(req.domain or "Blocked website")[:200],
            category=str(req.category or "Restricted Website")[:100],
            window_title=str(req.domain or "")[:300],
            process_name=("website:" + str(req.domain or ""))[:100],
            pid=0, screenshot_filename=None, severity="HIGH", merge=False,
        )
        from anuvadini_detector import database as _dbmod
        if _dbmod.LAST_VIOLATION_IS_NEW:
            send_violation_webhook({
                "hostname": req.hostname, "employee_id": req.employee_id or "", "username": req.username,
                "department": "", "game_name": str(req.domain or "Blocked website")[:200],
                "category": str(req.category or "Restricted Website")[:100],
                "process_name": ("website:" + str(req.domain or ""))[:100],
                "pid": 0, "severity": "HIGH", "window_title": str(req.domain or ""), "id": None,
            })
    except Exception:
        pass
    return {"success": True, "logged": True}

# The admin console lives inside Anuvadini Attendance (Defender section). This service is API only,
# so the old page addresses return an empty 404 and show nothing.
@app.get("/", include_in_schema=False)
@app.get("/admin", include_in_schema=False)
@app.get("/admin/login", include_in_schema=False)
@app.get("/download", include_in_schema=False)
async def no_dashboard():
    return Response(status_code=404)

# Client Setup Installer Download (Windows Batch)
@app.get("/api/download/installer")
async def download_installer_batch():
    installer_path = BASE_DIR / "Anuvadini_Installer.bat"
    if not installer_path.exists():
        raise HTTPException(status_code=404, detail="Installer file not found")
    return FileResponse(
        path=str(installer_path),
        filename="Anuvadini_Installer.bat",
        media_type="application/octet-stream"
    )

# Client Setup Installer Download (macOS MacBook Script)
@app.get("/api/download/mac-installer")
async def download_mac_installer():
    installer_path = BASE_DIR / "Anuvadini_Installer_Mac.sh"
    if not installer_path.exists():
        raise HTTPException(status_code=404, detail="macOS installer script not found")
    return FileResponse(
        path=str(installer_path),
        filename="Anuvadini_Installer_Mac.sh",
        media_type="text/x-shellscript"
    )

# Standalone Client Security Bundle Zip (Auto-fetched by 1-Click Installers)
@app.get("/api/download/client-bundle.zip")
async def download_client_bundle():
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        pkg_dir = BASE_DIR / "anuvadini_detector"
        for root, dirs, files in os.walk(pkg_dir):
            if "__pycache__" in root:
                continue
            for file in files:
                if file.endswith((".pyc", ".db")):
                    continue
                full_path = Path(root) / file
                rel_path = full_path.relative_to(BASE_DIR)
                zf.write(full_path, arcname=str(rel_path))

        for extra_file in ["requirements.txt", "installer_wizard.py", "python_agent_launcher.vbs", "Anuvadini_Installer_Mac.sh"]:
            extra_path = BASE_DIR / extra_file
            if extra_path.exists():
                zf.write(extra_path, arcname=extra_file)

    zip_buffer.seek(0)
    return Response(
        content=zip_buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=anuvadini_client_bundle.zip"}
    )

# Employee / Faculty UID Verification API
@app.get("/api/fleet/lookup/{uid}")
async def api_lookup_employee(uid: str):
    emp = get_employee_by_id(uid)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found in Anuvadini fleet registry")
    return emp

class EmployeeLoginRequest(BaseModel):
    employee_id: str = Field(max_length=64)
    password: str = Field(max_length=200)
    hostname: str = Field(default="", max_length=100)
    ip_address: str = Field(default="", max_length=64)

# Client Onboarding Wizard: Employee Identity Verification API
@app.get("/api/employee/verify/{employee_id}")
async def api_verify_employee_id(employee_id: str):
    emp = lookup_employee_by_id(employee_id) or get_employee_by_id(employee_id)
    if not emp:
        return JSONResponse(status_code=404, content={"success": False, "message": f"Employee ID '{employee_id}' not found in corporate directory."})
    return {
        "success": True,
        "employee": {
            "employee_id": emp.get("employee_id"),
            "name": emp.get("name") or emp.get("username"),
            "department": emp.get("department", "Anuvadini foundation"),
            "role": emp.get("role", "Employee"),
            "status": emp.get("status", "ACTIVE")
        }
    }

# Client Onboarding Wizard: Employee Authentication & IP Binding API
@app.post("/api/employee/login")
async def api_employee_login(req: EmployeeLoginRequest, request: Request):
    peer = request.client.host if request.client else "unknown"
    # Trust the address the server actually sees; a client-supplied IP is only used when the installer runs on this PC.
    client_ip = req.ip_address if (peer in ("127.0.0.1", "::1") and req.ip_address) else peer
    acct_key = f"{peer}|{req.employee_id.strip().lower()}"

    wait = max(sec.employee_login_throttle.retry_after(acct_key), sec.employee_ip_throttle.retry_after(peer))
    if wait:
        return JSONResponse(status_code=429, headers={"Retry-After": str(wait)},
                            content={"success": False, "error": f"Too many failed attempts. Try again in {wait} seconds."})

    hostname = req.hostname or socket.gethostname()
    result = authenticate_employee_credentials(
        employee_id=req.employee_id,
        password=req.password,
        client_ip=client_ip,
        hostname=hostname
    )
    if not result.get("success"):
        sec.employee_login_throttle.record_failure(acct_key)
        sec.employee_ip_throttle.record_failure(peer)
        return JSONResponse(status_code=401, content=result)
    sec.employee_login_throttle.record_success(acct_key)
    return result


# API Endpoints
@app.get("/api/status")
async def get_system_status():
    return {
        "engine_running": engine.is_running,
        "auto_kill_enabled": engine.auto_kill,
        "show_popup": engine.show_popup,
        "play_sound": engine.play_sound,
        "popup_cooldown_seconds": _popup_cooldown(),
        "hostname": engine.hostname,
        "username": engine.username,
        "current_state": engine.current_state,
        "active_violation": engine.active_violation,
        "shift": engine.get_shift_status(),
        "autostart_enabled": is_autostart_enabled(),
        "active_window": engine.last_active_window or {},
        "idle_seconds": round(get_idle_seconds(), 1),
        "controller": is_controller_connected(),
    }

class ScheduleUpdateRequest(BaseModel):
    shift_start: str = None
    shift_end: str = None
    schedule_enabled: bool = None
    override_schedule: bool = None
    working_days: list[int] = None

@app.get("/api/schedule")
async def api_get_schedule():
    return {
        "shift": engine.get_shift_status(),
        "working_days": engine.working_days,
        "autostart_enabled": is_autostart_enabled()
    }

@app.post("/api/schedule")
async def api_update_schedule(req: ScheduleUpdateRequest):
    engine.update_shift_settings(
        shift_start=req.shift_start,
        shift_end=req.shift_end,
        schedule_enabled=req.schedule_enabled,
        override_schedule=req.override_schedule,
        working_days=req.working_days
    )
    return {"success": True, "shift": engine.get_shift_status()}

@app.post("/api/schedule/override")
async def api_toggle_override():
    new_override = not engine.override_schedule
    engine.update_shift_settings(override_schedule=new_override)
    return {"override_schedule": engine.override_schedule, "shift": engine.get_shift_status()}

@app.post("/api/autostart/toggle")
async def api_toggle_autostart():
    currently_enabled = is_autostart_enabled()
    if currently_enabled:
        ok, msg = disable_autostart()
    else:
        ok, msg = enable_autostart()
    return {"success": ok, "message": msg, "autostart_enabled": is_autostart_enabled()}

@app.post("/api/toggle-monitor")
async def toggle_monitoring():
    if engine.is_running:
        engine.stop()
    else:
        engine.start()
    return {"engine_running": engine.is_running}

@app.post("/api/toggle-autokill")
async def toggle_autokill():
    engine.auto_kill = not engine.auto_kill
    return {"auto_kill_enabled": engine.auto_kill}

@app.post("/api/toggle-sound")
async def toggle_sound():
    engine.play_sound = not engine.play_sound
    return {"play_sound": engine.play_sound}

class PopupCooldownRequest(BaseModel):
    seconds: int = Field(ge=30, le=3600)

@app.post("/api/settings/popup-cooldown")
async def set_popup_cooldown(req: PopupCooldownRequest):
    set_setting("popup_cooldown_seconds", str(req.seconds))
    return {"success": True, "popup_cooldown_seconds": req.seconds}

@app.post("/api/toggle-popup")
async def toggle_popup():
    engine.show_popup = not engine.show_popup
    return {"show_popup": engine.show_popup}

class SimulationRequest(BaseModel):
    game_name: str = "Poki Online Games"
    window_title: str = "Subway Surfers - Play Free Online on Poki"
    category: str = "Web Gaming"

@app.post("/api/simulate-game")
async def api_simulate_game(req: SimulationRequest = None):
    req = req or SimulationRequest()
    det = engine.simulate_violation(
        game_name=req.game_name,
        window_title=req.window_title,
        category=req.category
    )
    return {"success": True, "violation": det}

@app.get("/api/violations")
async def api_get_violations(limit: int = 50):
    return get_recent_violations(limit=limit)

@app.get("/api/evidence/{filename}")
async def serve_evidence_screenshot(filename: str):
    file_path = EVIDENCE_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Evidence screenshot not found")
    return FileResponse(str(file_path), media_type="image/jpeg")

@app.get("/api/analytics")
async def api_get_analytics():
    return get_today_analytics()

class KillRequest(BaseModel):
    pid: int
    process_name: str = ""

@app.post("/api/enforce/kill")
async def api_kill_process(req: KillRequest):
    success, msg = kill_process_by_pid(req.pid)
    return {"success": success, "message": msg}

class WarningRequest(BaseModel):
    game_name: str

@app.post("/api/enforce/warn")
async def api_send_warning(req: WarningRequest):
    trigger_warning_popup(req.game_name)
    return {"success": True, "message": f"Sent warning alert for {req.game_name}"}

class RuleRequest(BaseModel):
    rule_type: str # 'process' or 'keyword'
    pattern: str
    label: str
    category: str
    action: str = "alert"

@app.get("/api/rules")
async def api_get_rules():
    return get_custom_rules()

@app.post("/api/rules")
async def api_add_rule(rule: RuleRequest):
    ok = add_custom_rule(
        rule_type=rule.rule_type,
        pattern=rule.pattern,
        label=rule.label,
        category=rule.category,
        action=rule.action
    )
    return {"success": ok}

@app.delete("/api/rules/{rule_id}")
async def api_delete_rule(rule_id: int):
    ok = delete_custom_rule(rule_id)
    return {"success": ok}

class SimRequest(BaseModel):
    game_name: str
    window_title: str
    category: str = "Simulated Gaming"

SIM_HOST = "SIMULATED-TEST-PC"

@app.post("/api/simulate")
async def api_simulate_game(sim: SimRequest):
    """Dashboard 'Live Test Radar': shows what a catch looks like. Everything it creates is clearly marked as a test
    and the pretend workstation removes itself after 45 seconds, so it never pollutes the real fleet."""
    test_name = sim.game_name if sim.game_name.startswith("[TEST]") else f"[TEST] {sim.game_name}"
    result = engine.simulate_violation(
        game_name=test_name,
        window_title=sim.window_title,
        category=sim.category
    )
    upsert_workstation(
        hostname=SIM_HOST,
        username="Test Employee (simulated)",
        department="Test",
        ip_address="127.0.0.1",
        status="GAMING_ALERT",
        current_app=test_name,
        window_title=sim.window_title,
        pid=0,
        idle_seconds=0,
        employee_id="TEST-001"
    )
    from anuvadini_detector.notifier import dispatch_incident_notification
    dispatch_incident_notification({
        "employee_id": "TEST-001",
        "username": "Test Employee (simulated)",
        "hostname": SIM_HOST,
        "department": "Test",
        "game_name": test_name,
        "category": sim.category,
        "process_name": "simulated.exe",
        "pid": 0,
        "severity": "HIGH",
        "details": "Simulated incident created from the dashboard Live Test Radar",
        "window_title": sim.window_title
    })

    async def _remove_test_pc():
        await asyncio.sleep(45)
        delete_workstation(SIM_HOST)
    asyncio.create_task(_remove_test_pc())
    return {"success": True, "violation": result}

# Enterprise Multi-Workstation Agent Endpoints
class AgentRegisterRequest(BaseModel):
    hostname: str = Field(max_length=100)
    username: str = Field(max_length=100)
    department: str = Field(default="Engineering", max_length=100)
    ip_address: str = Field(default="127.0.0.1", max_length=64)

@app.post("/api/agent/register")
async def api_agent_register(req: AgentRegisterRequest):
    ok = upsert_workstation(
        hostname=req.hostname,
        username=req.username,
        department=req.department,
        ip_address=req.ip_address,
        status="ONLINE",
        current_app="Idle",
        window_title="",
        pid=0,
        idle_seconds=0
    )
    return {"registered": ok}

class AgentHeartbeatRequest(BaseModel):
    hostname: str = Field(max_length=100)
    username: str = Field(max_length=100)
    department: str = Field(default="Engineering", max_length=100)
    ip_address: str = Field(default="127.0.0.1", max_length=64)
    status: str = "ONLINE"
    current_app: str = Field(default="", max_length=260)
    window_title: str = Field(default="", max_length=500)
    pid: int = 0
    idle_seconds: float = 0
    is_fullscreen: bool = False
    violation: dict = None

@app.post("/api/agent/heartbeat")
async def api_agent_heartbeat(hb: AgentHeartbeatRequest):
    if hb.violation:
        log_violation(
            hostname=hb.hostname,
            username=hb.username,
            game_name=hb.violation.get("game_name", "Game"),
            category=hb.violation.get("category", "PC Game"),
            window_title=hb.violation.get("window_title", ""),
            process_name=hb.violation.get("process_name", ""),
            pid=hb.violation.get("pid", 0),
            screenshot_filename=hb.violation.get("screenshot_filename"),
            severity=hb.violation.get("severity", "HIGH")
        )

    upsert_workstation(
        hostname=hb.hostname,
        username=hb.username,
        department=hb.department,
        ip_address=hb.ip_address,
        status=hb.status,
        current_app=hb.current_app,
        window_title=hb.window_title,
        pid=hb.pid,
        idle_seconds=hb.idle_seconds,
        is_fullscreen=hb.is_fullscreen
    )

    commands = pop_workstation_commands(hb.hostname)
    return {"status": "ok", "commands": commands}

@app.get("/api/fleet")
async def api_get_fleet(department: str = None, status: str = None, search: str = None):
    return get_fleet_workstations(department=department, status=status, search=search)

@app.get("/api/fleet/stats")
async def api_get_fleet_stats():
    return get_fleet_stats()

# ==========================================================
# EMPLOYEE AUTHENTICATION & WORKSTATION REGISTRY (IP CAPTURE)
# ==========================================================
class ClientRegisterRequest(BaseModel):
    hostname: str = Field(max_length=100)
    employee_id: str = Field(max_length=64)
    username: str = Field(max_length=100)
    department: str = Field(default="Engineering", max_length=100)
    ip_address: str = Field(default="127.0.0.1", max_length=64)

@app.post("/api/fleet/register")
async def api_register_workstation(req: ClientRegisterRequest):
    upsert_workstation(
        hostname=req.hostname,
        username=req.username,
        department=req.department,
        ip_address=req.ip_address,
        status="ONLINE",
        tunnel_status="CONNECTED",
        current_app="Agent Initialized",
        window_title=f"Workstation Bound to {req.employee_id}",
        employee_id=req.employee_id
    )
    return {
        "status": "success",
        "success": True,
        "message": f"Workstation {req.hostname} successfully bound to Employee {req.employee_id} ({req.username})",
        "shift_start": engine.shift_start,
        "shift_end": engine.shift_end
    }

class StreamFrameRequest(BaseModel):
    hostname: str = Field(max_length=100)
    employee_id: str = Field(default="", max_length=64)
    frame_b64: str
    username: str = Field(default="", max_length=100)
    current_app: str = Field(default="", max_length=260)
    window_title: str = Field(default="", max_length=500)
    status: str = "ONLINE"

def _record_screen_frame(req, frame_bytes: bytes) -> None:
    """Store one agent screen frame and refresh the PC's record (used by the JSON and the raw-bytes upload)."""
    save_workstation_screen_frame(req.hostname, frame_bytes)
    try:
        db = get_db()
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        up = {"last_heartbeat": now_str}
        if req.status and req.status in ("GAMING_ALERT", "Violations", "IDLE"):
            up["status"] = req.status
        elif req.status:
            # only set ONLINE if not already in alert
            existing = db.workstations.find_one({"hostname": req.hostname})
            if not existing or existing.get("status") not in ("GAMING_ALERT", "Violations"):
                up["status"] = req.status
        if req.current_app:
            up["current_app"] = req.current_app
        if req.window_title:
            up["window_title"] = req.window_title
        if req.username:
            up["username"] = req.username
        if req.employee_id:
            up["employee_id"] = req.employee_id
        db.workstations.update_one({"hostname": req.hostname}, {"$set": up}, upsert=True)
    except Exception:
        pass

@app.post("/api/fleet/stream-frame")
async def api_stream_workstation_frame(req: StreamFrameRequest):
    """Receive live desktop JPEG frame from client agent (base64 inside JSON)."""
    import base64
    try:
        data = req.frame_b64
        if "," in data:
            data = data.split(",")[1]
        frame_bytes = base64.b64decode(data)
        _record_screen_frame(req, frame_bytes)
        return {"success": True, "watch": _viewer_watching(req.hostname), "quality": _effective_quality(req.hostname)}
    except Exception as e:
        return JSONResponse(status_code=400, content={"success": False, "error": str(e)})

@app.post("/api/fleet/stream-frame-bin")
async def api_stream_workstation_frame_bin(request: Request, hostname: str = "", employee_id: str = "",
                                           status: str = "ONLINE"):
    """Receive one live desktop JPEG as raw bytes from the client agent (no base64, so it arrives sooner)."""
    try:
        frame_bytes = await request.body()
        host = (hostname or "").strip()[:100]
        if not frame_bytes or len(frame_bytes) > 8_000_000 or not host:
            return JSONResponse(status_code=400, content={"success": False, "error": "Bad frame"})
        meta = StreamFrameRequest(hostname=host, employee_id=(employee_id or "")[:64], frame_b64="",
                                  status=(status or "ONLINE")[:20])
        _record_screen_frame(meta, frame_bytes)
        return {"success": True, "watch": _viewer_watching(host), "quality": _effective_quality(host)}
    except Exception as e:
        return JSONResponse(status_code=400, content={"success": False, "error": str(e)})

STREAM_STALE_SECONDS = 30.0   # an uploaded frame older than this is not "live" any more

# hostname -> last time a dashboard viewer was watching that PC's live screen.
_VIEWER_SEEN: dict = {}
# (hostname, game, app) -> last time the agent reported it (used to alert once per session).
_ALERT_LAST: dict = {}

# Live-screen quality. Each PC shows the grid default unless an admin picks a level for it.
QUALITY_LEVELS = (240, 360, 480, 720, 1080)
_quality_state: dict = {"default": 240, "pcs": {}}
_quality_loaded = False

def _quality_load() -> None:
    """Load the saved quality settings once (survives engine restarts)."""
    global _quality_loaded
    if _quality_loaded:
        return
    _quality_loaded = True
    try:
        from anuvadini_detector.database import get_db
        doc = get_db().fleet_settings.find_one({"key": "quality"}, {"_id": 0})
        if doc:
            _quality_state["default"] = int(doc.get("default", 240))
            _quality_state["pcs"] = {str(k): int(v) for k, v in (doc.get("pcs") or {}).items()}
    except Exception:
        pass

def _quality_save() -> None:
    try:
        from anuvadini_detector.database import get_db
        get_db().fleet_settings.update_one(
            {"key": "quality"},
            {"$set": {"default": _quality_state["default"], "pcs": _quality_state["pcs"]}},
            upsert=True,
        )
    except Exception:
        pass

def _effective_quality(hostname: str) -> int:
    """Height (px) this PC should capture and upload."""
    _quality_load()
    return int(_quality_state["pcs"].get((hostname or "").strip(), _quality_state["default"]))

class QualityRequest(BaseModel):
    hostname: str = Field(default="", max_length=100)
    height: int = 0          # 0 = "use the grid default" for one PC
    all: bool = False        # True = set the grid default for every PC (clears per-PC choices)

@app.get("/api/fleet/quality")
async def api_get_quality():
    _quality_load()
    return {"default": _quality_state["default"], "levels": list(QUALITY_LEVELS), "pcs": dict(_quality_state["pcs"])}

@app.post("/api/fleet/quality")
async def api_set_quality(req: QualityRequest):
    _quality_load()
    if req.height and req.height not in QUALITY_LEVELS:
        return JSONResponse(status_code=400, content={"success": False, "error": "Unsupported quality"})
    if req.all:
        if not req.height:
            return JSONResponse(status_code=400, content={"success": False, "error": "Choose a quality for all PCs"})
        _quality_state["default"] = req.height
        _quality_state["pcs"] = {}
    else:
        host = (req.hostname or "").strip()
        if not host:
            return JSONResponse(status_code=400, content={"success": False, "error": "Choose a PC"})
        if req.height:
            _quality_state["pcs"][host] = req.height
        else:
            _quality_state["pcs"].pop(host, None)
    _quality_save()
    return {"success": True, "default": _quality_state["default"], "pcs": dict(_quality_state["pcs"])}

def _viewer_watching(hostname: str) -> bool:
    """True while someone has the PC's live screen open (refreshed every ~0.5 s by the viewer)."""
    seen = _VIEWER_SEEN.get((hostname or "").strip(), 0.0)
    return (time.time() - seen) < 12.0

def _is_this_pc(hostname: str) -> bool:
    """True only for the machine the server itself runs on (exact match - never a substring guess)."""
    return (hostname or "").strip().lower() in {engine.hostname.lower(), socket.gethostname().lower()}

def generate_standby_screen_bytes(hostname: str, emp_name: str, emp_id: str, dept: str, last_seen: str = "") -> bytes:
    """'No live signal' placeholder shown instead of a screen when the PC is offline or not streaming."""
    w, h = 800, 450
    img = Image.new("RGB", (w, h), (15, 23, 42))
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, w, 32], fill=(30, 41, 59))
    draw.ellipse([12, 10, 22, 20], fill=(100, 116, 139))
    draw.text((34, 9), f"NO LIVE SIGNAL - {hostname}", fill=(203, 213, 225))
    draw.rectangle([60, 70, w - 60, h - 70], fill=(2, 6, 23), outline=(51, 65, 85), width=2)
    draw.text((w // 2 - 70, 110), "NO LIVE SIGNAL", fill=(245, 158, 11))
    draw.text((100, 165), "This PC is switched off, offline, or its agent is not streaming.", fill=(148, 163, 184))
    draw.text((100, 205), f"Workstation:  {hostname}", fill=(148, 163, 184))
    draw.text((100, 230), f"Employee:     {emp_name} ({emp_id})", fill=(148, 163, 184))
    draw.text((100, 255), f"Department:   {dept}", fill=(148, 163, 184))
    if last_seen:
        draw.text((100, 285), f"Last seen:    {last_seen}", fill=(148, 163, 184))
    draw.rectangle([0, h - 30, w, h], fill=(15, 23, 42))
    draw.text((12, h - 22), f"ANUVADINI SHIELD | {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", fill=(100, 116, 139))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=75)
    return buf.getvalue()

def _standby_for(hostname: str) -> bytes:
    ws = get_workstation_detail(hostname) or {}
    return generate_standby_screen_bytes(
        hostname, ws.get("username", "Employee"), ws.get("employee_id", "-"),
        ws.get("department", "Company Fleet"), str(ws.get("last_heartbeat") or ws.get("last_seen") or ""))

_DEV_EXCLUDES = {
    "code.exe", "devenv.exe", "sublime_text.exe", "notepad++.exe", "notepad.exe",
    "idea64.exe", "pycharm64.exe", "webstorm64.exe", "clion64.exe", "windowsterminal.exe",
    "powershell.exe", "cmd.exe", "git-bash.exe", "mintty.exe", "wt.exe", "cursor.exe"
}
_WHATSAPP_PROCS = {"whatsapp.exe", "whatsapp.native.exe", "whatsapp.root.exe"}
_MAIL_PROCS = {"outlook.exe", "olk.exe", "thunderbird.exe", "hxoutlook.exe", "hxtsr.exe", "mailspring.exe", "emclient.exe", "postbox.exe"}

def _check_local_privacy_shield() -> tuple[bool, str]:
    """Checks if local active window is WhatsApp or Mail. Returns (is_shielded, app_name)."""
    try:
        if sys.platform != "win32":
            return False, ""
        hwnd = ctypes.windll.user32.GetForegroundWindow()
        if not hwnd:
            return False, ""
        length = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
        title = ""
        if length > 0:
            buff = ctypes.create_unicode_buffer(length + 1)
            ctypes.windll.user32.GetWindowTextW(hwnd, buff, length + 1)
            title = buff.value.strip()
        pid = ctypes.c_ulong()
        ctypes.windll.user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        proc = ""
        if pid.value and psutil.pid_exists(pid.value):
            try:
                proc = psutil.Process(pid.value).name()
            except Exception:
                pass
        title_lower = title.lower()
        proc_lower = proc.lower()

        if proc_lower in _DEV_EXCLUDES:
            return False, ""
        if proc_lower in _WHATSAPP_PROCS or ("whatsapp" in proc_lower and "installer" not in proc_lower):
            return True, "WhatsApp"
        if proc_lower in _MAIL_PROCS:
            return True, "Mail"
        if proc_lower == "applicationframehost.exe":
            if title_lower == "mail" or title_lower.endswith(" - mail") or title_lower.startswith("mail -") or "outlook" in title_lower:
                return True, "Mail"
            if "whatsapp" in title_lower:
                return True, "WhatsApp"

        if any(srch in title_lower for srch in (" - google search", " - bing", " - duckduckgo", " - search")):
            return False, ""

        if re.search(r"\bwhatsapp\b", title_lower) or "web.whatsapp.com" in title_lower:
            return True, "WhatsApp"

        if re.search(r"\bgmail\b", title_lower) or "mail.google.com" in title_lower or re.search(r"\bgoogle mail\b", title_lower):
            return True, "Mail"
        if re.search(r"\boutlook\b", title_lower) and any(k in title_lower for k in ("mail", "inbox", "office", "live", "365", "microsoft")):
            return True, "Mail"
        if re.search(r"\boutlook\s*(?:-\s*google chrome|–\s*google chrome|-\s*microsoft edge|–\s*microsoft edge|-\s*mozilla firefox)\b", title_lower):
            return True, "Mail"
        if any(dom in title_lower for dom in ("outlook.live.com", "outlook.office.com", "outlook.office365.com")):
            return True, "Mail"
        if re.search(r"\byahoo!?\s*mail\b", title_lower) or "mail.yahoo.com" in title_lower:
            return True, "Mail"
        if re.search(r"\bproton\s*mail\b", title_lower) or "mail.proton.me" in title_lower:
            return True, "Mail"
        if re.search(r"\bzoho\s*mail\b", title_lower) or "mail.zoho.com" in title_lower:
            return True, "Mail"
        if re.search(r"\b(?:webmail|roundcube|zimbra|fastmail)\b", title_lower):
            return True, "Mail"
    except Exception:
        pass
    return False, ""

def _local_screen_jpeg(label: str, quality: int = 70, height: int = 540) -> bytes | None:
    """Live capture of THIS PC with a small HUD bar (runs in a worker thread: capture + JPEG encode are slow)."""
    try:
        img = capture_screen_universal()
        if not img:
            return None
        img.thumbnail((round(height * 16 / 9), height))   # the resolution chosen for this PC
        # Privacy Shield Check: Strictly WhatsApp / Mail only
        is_shielded, sensitive_app = _check_local_privacy_shield()
        if is_shielded:
            img = img.filter(ImageFilter.GaussianBlur(radius=40))
            draw = ImageDraw.Draw(img)
            w_b, h_b = img.size
            b_h = max(80, int(h_b * 0.25))
            y1 = (h_b - b_h) // 2
            draw.rectangle([(0, y1), (w_b, y1 + b_h)], fill=(15, 23, 42))
            draw.text((w_b // 2, y1 + b_h // 2), f"PRIVACY SHIELD ACTIVE - {sensitive_app.upper()} IN USE", fill=(244, 63, 94), anchor="mm")
        draw = ImageDraw.Draw(img)
        w, h = img.size
        draw.rectangle([0, h - 26, w, h], fill=(15, 23, 42))
        draw.text((12, h - 20), f"LIVE | {label} | {datetime.now().strftime('%H:%M:%S')}", fill=(56, 189, 248))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        return buf.getvalue()
    except Exception:
        return None

def _fresh_agent_frame(hostname: str) -> bytes | None:
    age = get_workstation_screen_frame_age(hostname)
    if age is not None and age <= STREAM_STALE_SECONDS:
        return get_workstation_screen_frame(hostname)
    return None

@app.get("/api/fleet/stream/{hostname}")
async def api_mjpeg_stream(hostname: str):
    """
    Live MJPEG stream for the Screen Wall / CCTV viewer.
    - this PC: live capture (5 fps)
    - an employee PC: the frames its agent uploads (polled twice a second)
    - offline / silent PC: ONE cached "no live signal" frame, re-sent slowly (never rebuilt per frame)
    All blocking work (screen capture, disk, DB, PIL) runs in worker threads so the API stays responsive.
    """
    clean_host = hostname.strip()
    is_local = _is_this_pc(clean_host)

    async def frame_streamer():
        standby, standby_at = None, 0.0
        last_sent, sent_at = None, 0.0
        while True:
            _VIEWER_SEEN[clean_host] = time.time()   # tells the PC's agent someone is watching
            frame, delay = await asyncio.to_thread(_fresh_agent_frame, clean_host), 0.25
            if not frame and is_local:
                frame = await asyncio.to_thread(_local_screen_jpeg, clean_host, 70, _effective_quality(clean_host))
                delay = 0.5
            if not frame:
                now = time.time()
                if standby is None or now - standby_at > 10:
                    standby = await asyncio.to_thread(_standby_for, clean_host)
                    standby_at = now
                frame, delay = standby, 2.0
            elif frame == last_sent and time.time() - sent_at < 2.0:
                await asyncio.sleep(0.1)   # same frame as before: wait for the agent's next one
                continue
            last_sent, sent_at = frame, time.time()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
            await asyncio.sleep(delay)

    return StreamingResponse(frame_streamer(), media_type="multipart/x-mixed-replace; boundary=frame",
                             headers={"Cache-Control": "no-cache, no-store"})

CAMERA_STALE_SECONDS = 30.0  # camera frames are uploaded every 20s (about 1 a second while watched)

# hostname -> last time a dashboard viewer was watching that PC's camera (agent sends frames faster).
_CAM_VIEWER_SEEN: dict = {}

def _cam_viewer_watching(hostname: str) -> bool:
    seen = _CAM_VIEWER_SEEN.get((hostname or "").strip(), 0.0)
    return (time.time() - seen) < 12.0

def _office_closed_bytes(hostname: str) -> bytes:
    """Returned by live-screen and live-camera endpoints outside office hours."""
    w, h = 800, 450
    img  = Image.new("RGB", (w, h), (10, 15, 30))
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, w, 32], fill=(20, 30, 50))
    draw.text((12, 9), f"OFFICE HOURS ENDED  —  {hostname}", fill=(100, 116, 139))
    cx, cy = w // 2, h // 2
    draw.text((cx - 120, cy - 30), "MONITORING PAUSED", fill=(245, 158, 11))
    draw.text((cx - 195, cy + 10), "Live monitoring is only active during office hours.", fill=(148, 163, 184))
    hours_text = f"Office hours:  {engine.shift_start or '09:00'}  –  {engine.shift_end or '17:30'}"
    draw.text((cx - 130, cy + 40), hours_text, fill=(100, 116, 139))
    draw.rectangle([0, h - 30, w, h], fill=(10, 15, 30))
    draw.text((12, h - 22), f"ANUVADINI SHIELD  |  {datetime.now().strftime('%Y-%m-%d  %H:%M:%S')}", fill=(60, 80, 110))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=75)
    return buf.getvalue()

@app.post("/api/fleet/stream-camera")
async def api_stream_camera_frame(req: StreamFrameRequest):
    """Receive live webcam JPEG frame from client agent."""
    import base64
    try:
        data = req.frame_b64
        if "," in data:
            data = data.split(",")[1]
        frame_bytes = base64.b64decode(data)
        # Keep webcam frames only for a person the admin has allowed the webcam for (and who has not switched it off).
        from anuvadini_detector.database import get_db as _get_db
        _ws = _get_db().workstations.find_one({"hostname": req.hostname}, {"_id": 0, "employee_id": 1}) or {}
        if not camera_allowed(str(_ws.get("employee_id") or "")):
            # Not allowed: keep no frame and clear the webcam flags, so nothing shows on the PC's tile
            _get_db().workstations.update_one({"hostname": req.hostname},
                                              {"$unset": {"last_camera_at": "", "has_live_camera": ""}})
            return {"success": False, "camera": "not allowed"}
        save_workstation_camera_frame(req.hostname, frame_bytes)
        # Server-side presence check: is a face visible? Stored on the PC record (None = check unavailable).
        from anuvadini_detector.face_check import face_present
        present = await asyncio.to_thread(face_present, frame_bytes)
        if present is not None:
            from anuvadini_detector.database import get_db
            get_db().workstations.update_one(
                {"hostname": req.hostname},
                {"$set": {"face_present": bool(present), "face_checked_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}},
            )
        return {"success": True, "face_present": present}
    except Exception as e:
        return JSONResponse(status_code=400, content={"success": False, "error": str(e)})

def _generate_no_camera_bytes(hostname: str) -> bytes:
    """Placeholder shown when webcam is not streaming."""
    w, h = 640, 360
    img = Image.new("RGB", (w, h), (10, 10, 20))
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, w, 28], fill=(20, 20, 40))
    draw.text((12, 7), f"NO CAMERA SIGNAL - {hostname}", fill=(150, 150, 180))
    draw.ellipse([w//2 - 40, h//2 - 50, w//2 + 40, h//2 + 50], outline=(60, 60, 100), width=2)
    draw.line([w//2 - 35, h//2 - 35, w//2 + 35, h//2 + 35], fill=(80, 80, 120), width=3)
    draw.text((w//2 - 80, h//2 + 65), "Webcam offline or not connected", fill=(100, 100, 140))
    draw.rectangle([0, h - 24, w, h], fill=(10, 10, 20))
    draw.text((12, h - 18), f"ANUVADINI SHIELD | {datetime.now().strftime('%H:%M:%S')}", fill=(80, 80, 120))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=70)
    return buf.getvalue()

def _fresh_camera_frame(hostname: str) -> bytes | None:
    age = get_workstation_camera_frame_age(hostname)
    if age is not None and age <= CAMERA_STALE_SECONDS:
        return get_workstation_camera_frame(hostname)
    return None

@app.get("/api/fleet/stream-cam/{hostname}")
async def api_mjpeg_camera_stream(hostname: str):
    """Live MJPEG camera stream for the admin dashboard."""
    clean_host = hostname.strip()

    async def cam_streamer():
        standby, standby_at = None, 0.0
        last_sent, sent_at = None, 0.0
        while True:
            _CAM_VIEWER_SEEN[clean_host] = time.time()   # tells the PC's agent to send camera frames faster
            frame = await asyncio.to_thread(_fresh_camera_frame, clean_host)
            delay = 0.25
            if not frame:
                now = time.time()
                if standby is None or now - standby_at > 10:
                    standby = await asyncio.to_thread(_generate_no_camera_bytes, clean_host)
                    standby_at = now
                frame, delay = standby, 3.0
            elif frame == last_sent and time.time() - sent_at < 2.0:
                await asyncio.sleep(0.1)   # same frame as before: wait for the next one
                continue
            last_sent, sent_at = frame, time.time()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
            await asyncio.sleep(delay)

    return StreamingResponse(cam_streamer(), media_type="multipart/x-mixed-replace; boundary=frame",
                             headers={"Cache-Control": "no-cache, no-store"})

@app.get("/api/fleet/live-camera/{hostname}")
async def api_get_live_camera(hostname: str):
    """One-shot latest camera frame (no-cache). Falls back to placeholder."""
    clean_host = hostname.strip()
    _CAM_VIEWER_SEEN[clean_host] = time.time()   # someone is watching: the agent sends camera frames faster
    no_cache = {"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache"}
    shift = engine.get_shift_status()
    if not shift.get("is_active") and not engine.override_schedule:
        frame = await asyncio.to_thread(_office_closed_bytes, clean_host)
        return Response(content=frame, media_type="image/jpeg", headers=no_cache)
    frame = await asyncio.to_thread(_fresh_camera_frame, clean_host)
    if not frame:
        frame = await asyncio.to_thread(_generate_no_camera_bytes, clean_host)
    return Response(content=frame, media_type="image/jpeg", headers=no_cache)

@app.get("/api/fleet/live-screen/{hostname}")
async def api_get_live_screen(hostname: str):
    """One live screenshot of a workstation (no-cache). Falls back to local capture or standby placeholder."""
    clean_host = hostname.strip()
    _VIEWER_SEEN[clean_host] = time.time()   # someone is watching: the agent uploads faster
    no_cache = {"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache"}
    frame = None
    frame = await asyncio.to_thread(_fresh_agent_frame, clean_host)
    live = frame is not None
    if not frame and _is_this_pc(clean_host):
        frame = await asyncio.to_thread(_local_screen_jpeg, clean_host, 70, _effective_quality(clean_host))
        live = frame is not None
    if not frame:
        frame = await asyncio.to_thread(_standby_for, clean_host)
    return Response(content=frame, media_type="image/jpeg", headers={**no_cache, "X-Live": "1" if live else "0"})

class ClientHeartbeatRequest(BaseModel):
    hostname: str = Field(max_length=100)
    employee_id: str = Field(default="EMP-001", max_length=64)
    username: str = Field(default="Employee", max_length=100)
    department: str = Field(default="Engineering", max_length=100)
    ip_address: str = Field(default="127.0.0.1", max_length=64)
    status: str = "ONLINE"
    current_app: str = Field(default="", max_length=260)
    window_title: str = Field(default="", max_length=500)
    pid: int = 0
    idle_seconds: float = 0.0
    is_fullscreen: bool = False
    anti_tamper: dict = {}
    violation: dict | None = None
    screenshot_b64: str | None = None
    usage: dict | None = None   # PC sampler report: screen time and open apps (new PCs only)

POPUP_COOLDOWN_DEFAULT = 300
POPUP_COOLDOWN_MIN, POPUP_COOLDOWN_MAX = 30, 3600

def _popup_cooldown() -> int:
    """Seconds between warning popups for the same app on an employee PC (set from the dashboard)."""
    try:
        value = int(get_setting("popup_cooldown_seconds", str(POPUP_COOLDOWN_DEFAULT)))
    except Exception:
        value = POPUP_COOLDOWN_DEFAULT
    return max(POPUP_COOLDOWN_MIN, min(POPUP_COOLDOWN_MAX, value))

def _enforcement_policy() -> dict:
    """Server-side enforcement policy returned to remote agents on every heartbeat."""
    shift = engine.get_shift_status()
    on_lunch = bool(shift.get("is_lunch")) and not engine.override_schedule
    return {
        "enforce": bool(shift.get("is_active")) and not on_lunch,
        "show_popup": bool(engine.show_popup),
        "play_sound": bool(engine.play_sound),
        "auto_kill": bool(engine.auto_kill),
        "popup_cooldown_seconds": _popup_cooldown(),
    }

def _save_agent_screenshot(hostname: str, b64: str | None) -> str | None:
    """Validate and store a screenshot uploaded by a remote agent as incident evidence."""
    if not b64 or len(b64) > 6_000_000:
        return None
    try:
        data = b64
        if "," in data:
            data = data.split(",")[1]
        raw = base64.b64decode(data)
        safe_host = "".join(c for c in hostname if c.isalnum() or c in "-_")[:40] or "agent"
        filename = f"evidence_{safe_host}_{int(time.time())}.jpg"
        (EVIDENCE_DIR / filename).write_bytes(raw)
        return filename
    except Exception:
        return None

@app.post("/api/fleet/heartbeat")
async def api_client_heartbeat(req: ClientHeartbeatRequest):
    policy = _enforcement_policy()
    violation_logged = False
    if req.violation:
        v = req.violation
        game_name = str(v.get("game_name") or "Unauthorized Activity")[:200]
        v_id = log_violation(
            hostname=req.hostname,
            username=req.username,
            game_name=game_name,
            category=str(v.get("category") or "Restricted Website / App")[:100],
            window_title=str(v.get("window_title") or "")[:300],
            process_name=str(v.get("process_name") or "")[:100],
            pid=int(v.get("pid") or 0),
            screenshot_filename=_save_agent_screenshot(req.hostname, req.screenshot_b64),
            severity=str(v.get("severity") or "HIGH")[:20],
        )
        violation_logged = True
        # The bell gets one notification per NEW incident row (the same rule the Incidents page uses).
        # Repeats of an ongoing detection merge into that row, so they do not notify again.
        from anuvadini_detector import database as _dbmod
        if _dbmod.LAST_VIOLATION_IS_NEW:
            try:
                send_violation_webhook({
                    "hostname": req.hostname, "employee_id": req.employee_id, "username": req.username,
                    "department": req.department, "game_name": game_name,
                    "category": v.get("category", "PC Game"), "process_name": v.get("process_name", ""),
                    "pid": v.get("pid", 0), "severity": v.get("severity", "HIGH"),
                    "window_title": v.get("window_title", ""), "id": v_id,
                })
            except Exception:
                pass

    upsert_workstation(
        hostname=req.hostname,
        username=req.username,
        department=req.department,
        ip_address=req.ip_address,
        status=req.status,
        current_app=req.current_app,
        window_title=req.window_title,
        pid=req.pid,
        idle_seconds=req.idle_seconds,
        is_fullscreen=req.is_fullscreen,
        employee_id=req.employee_id
    )

    # Automated Zero-Touch Attendance Tick
    is_idle = req.idle_seconds >= 180
    is_gaming = req.status == "GAMING_ALERT"
    record_attendance_tick(
        employee_id=req.employee_id,
        username=req.username,
        department=req.department,
        hostname=req.hostname,
        is_idle=is_idle,
        is_gaming=is_gaming,
        tick_duration=5.0
    )

    # Per-person usage history. A PC that sends its sampler report is recorded from that report; older PCs
    # keep the 5-second foreground tick. Never blocks the heartbeat.
    if req.employee_id and isinstance(req.usage, dict):
        try:
            record_usage_report(employee_id=req.employee_id, hostname=req.hostname,
                                department=req.department or "", report=req.usage)
        except Exception as e:
            print(f"[Usage Record Error]: {e}")
    elif req.current_app and req.employee_id:
        try:
            record_usage_tick(
                employee_id=req.employee_id,
                hostname=req.hostname,
                department=req.department or "",
                process=req.current_app,
                title=req.window_title or "",
                is_idle=is_idle,
                seconds=5.0,
            )
        except Exception as e:
            print(f"[Usage Record Error]: {e}")

    # Per-App Activity Tracking (builds "kya kaam kiya" timeline)
    if req.current_app:
        record_app_activity_tick(
            employee_id=req.employee_id,
            hostname=req.hostname,
            app_name=req.current_app,
            window_title=req.window_title,
            is_idle=is_idle,
            tick_duration=5.0,
        )

    pending = pop_workstation_commands(req.hostname)
    watched = is_employee_watched(req.employee_id)
    return {"status": "ok", "success": True, "pending_commands": pending,
            "watch": _viewer_watching(req.hostname),
            "cam_watch": _cam_viewer_watching(req.hostname),
            "quality": _effective_quality(req.hostname),
            "policy": policy, "violation_logged": violation_logged,
            "proctor_active": watched, "camera_enabled": camera_allowed(req.employee_id)}

@app.delete("/api/fleet/{hostname}")
async def api_delete_workstation(hostname: str):
    """Remove an offline / retired workstation from the fleet list (incident history is kept)."""
    if hostname == engine.hostname:
        raise HTTPException(status_code=400, detail="Cannot remove the server's own workstation")
    if not delete_workstation(hostname):
        raise HTTPException(status_code=404, detail="Workstation not found")
    return {"success": True, "removed": hostname}

@app.get("/api/fleet/{hostname}")
async def api_get_workstation(hostname: str):
    data = get_workstation_detail(hostname)
    if not data:
        raise HTTPException(status_code=404, detail="Workstation not found")
    return data

class RemoteCommandRequest(BaseModel):
    command_type: str # 'kill_process', 'show_warning', 'lock_workstation'
    payload: dict = {}

@app.post("/api/fleet/{hostname}/command")
async def api_send_fleet_command(hostname: str, req: RemoteCommandRequest):
    if hostname == engine.hostname:
        if req.command_type == "kill_process":
            kill_process_by_pid(req.payload.get("pid", 0))
        elif req.command_type == "show_warning":
            trigger_warning_popup(req.payload.get("game_name", "Unauthorized Activity"))
        elif req.command_type in ("lock_workstation", "lock"):
            lock_workstation()

    if req.command_type == "kill_process":
        # Reset workstation state to compliant ONLINE
        ws_doc = get_workstation_detail(hostname)
        u_name = ws_doc.get("username", "Employee") if ws_doc else "Employee"
        u_dept = ws_doc.get("department", "General") if ws_doc else "General"
        u_ip = ws_doc.get("ip_address", "127.0.0.1") if ws_doc else "127.0.0.1"
        upsert_workstation(
            hostname=hostname,
            username=u_name,
            department=u_dept,
            ip_address=u_ip,
            status="ONLINE",
            current_app="Desktop / On-Task",
            window_title="Workplace Compliant",
            pid=0,
            idle_seconds=0
        )

    ok = queue_workstation_command(hostname, req.command_type, req.payload)
    return {"queued": ok}

class AdminAlertRequest(BaseModel):
    target_type: str = Field(default="person", max_length=10)   # "person", "team" or "everyone"
    target: str = Field(default="", max_length=100)              # employee ID, or team name
    message: str = Field(default="", max_length=300)

@app.post("/api/alerts/send")
async def api_send_admin_alert(req: AdminAlertRequest):
    """Admin sends an on-screen alert to one person's Work PC(s), or to every member's PC in a team."""
    message = req.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Type a message first.")
    hosts = _audio_hosts(req.target_type, req.target)
    if not hosts:
        return {"success": False, "sent": 0, "hosts": [], "message": _no_pc_message(req.target_type)}
    sent = [h for h in hosts if queue_workstation_command(h, "admin_alert", {"message": message, "sender": "Admin"})]
    return {"success": True, "sent": len(sent), "hosts": sent}

class AdminAudioRequest(BaseModel):
    target_type: str = Field(default="person", max_length=10)   # "person", "team" or "everyone"
    target: str = Field(default="", max_length=100)              # employee ID, or team name
    audio_b64: str = Field(default="", max_length=3_000_000)     # WAV or MP3, at most 2 MB
    name: str = Field(default="message", max_length=80)

def _no_pc_message(target_type: str) -> str:
    return "No Work PC is linked yet." if target_type == "everyone" else "No Work PC is linked to this person or team."

def _audio_hosts(target_type: str, target: str) -> list[str]:
    if target_type == "everyone":
        # Everyone = every workstation that has a PC name
        return sorted({ws.get("hostname") for ws in get_fleet_workstations() if ws.get("hostname")})
    if target_type == "team":
        wanted = target.strip().lower()
        member_ids = {str(m.get("employee_id")) for r in get_firewall_roles()
                      if (r.get("name") or "").lower() == wanted
                      for m in (r.get("members") or [])}
    else:
        member_ids = {target.strip()}
    return sorted({ws.get("hostname") for ws in get_fleet_workstations()
                   if str(ws.get("employee_id") or "") in member_ids and ws.get("hostname")})

@app.post("/api/alerts/audio")
async def api_send_admin_audio(req: AdminAudioRequest):
    """Admin sends a short audio message that plays on the employee's PC speakers. Output only."""
    import base64, binascii
    try:
        raw = base64.b64decode(req.audio_b64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="The audio could not be read.")
    if not raw or len(raw) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Keep the audio under 2 MB (about a minute).")
    if not (raw[:4] == b"RIFF" and raw[8:12] == b"WAVE") and not (raw[:3] == b"ID3" or (raw[0] == 0xFF and (raw[1] & 0xE0) == 0xE0)):
        raise HTTPException(status_code=400, detail="Only WAV and MP3 audio can be sent.")
    hosts = _audio_hosts(req.target_type, req.target)
    if not hosts:
        return {"success": False, "sent": 0, "hosts": [], "message": _no_pc_message(req.target_type)}
    hosts = hosts[:50]
    payload = {"audio_b64": req.audio_b64, "name": (req.name or "message")[:80], "sender": "Admin"}
    sent = [h for h in hosts if queue_workstation_command(h, "admin_audio", payload)]
    return {"success": True, "sent": len(sent), "hosts": sent}

@app.post("/api/fleet/simulate-violation/{hostname}")
async def api_simulate_fleet_violation(hostname: str, game_name: str = "Counter-Strike 2"):
    upsert_workstation(
        hostname=hostname,
        username="Employee",
        status="GAMING_ALERT",
        current_app="cs2.exe",
        window_title="Counter-Strike 2 (DirectX 11 Fullscreen)",
        pid=9999,
        idle_seconds=0,
        is_fullscreen=True
    )
    log_violation(
        hostname=hostname,
        username="Employee",
        game_name=game_name,
        category="PC Game",
        window_title="Counter-Strike 2 (DirectX 11 Fullscreen)",
        process_name="cs2.exe",
        pid=9999,
        severity="HIGH"
    )
    return {"success": True}
 
# Executive CSV Audit Report Generator (HR / Leadership Compliance)
@app.get("/api/report/csv")
@app.get("/api/reports/export")
async def api_export_csv_report():
    violations = get_recent_violations(limit=1000)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Incident ID", "Timestamp", "Date", "Workstation Hostname",
        "Employee Username", "Detected Game / Site", "Category",
        "Window Title", "Process Executable", "PID", "Duration (Seconds)",
        "Severity Level", "Enforcement Status"
    ])
    for v in violations:
        writer.writerow([
            v.get("id"),
            v.get("timestamp"),
            v.get("date_str"),
            v.get("hostname"),
            v.get("username"),
            v.get("game_name"),
            v.get("category"),
            v.get("window_title"),
            v.get("process_name"),
            v.get("pid"),
            v.get("duration_seconds"),
            v.get("severity"),
            v.get("status")
        ])
    output.seek(0)
    today_str = datetime.now().strftime("%Y-%m-%d")
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=anuvadini_audit_report_{today_str}.csv"}
    )

# Automated Daily Attendance Timesheet APIs
@app.get("/api/attendance/timesheet")
async def api_get_attendance_timesheet(date_str: str = None):
    return get_daily_timesheet(date_str)

@app.get("/api/attendance/timesheet/export")
async def api_export_timesheet_csv(date_str: str = None):
    records = get_daily_timesheet(date_str)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Date", "Employee ID", "Full Name", "Department", "Workstation Hostname",
        "Clock In", "Clock Out", "Total Hours", "Productive Work Hours",
        "Gaming Hours", "Idle Hours", "Compliance Score (%)", "Status"
    ])
    for r in records:
        writer.writerow([
            r.get("date_str"),
            r.get("employee_id"),
            r.get("username"),
            r.get("department"),
            r.get("hostname"),
            r.get("clock_in"),
            r.get("clock_out"),
            r.get("total_hours"),
            r.get("productive_hours"),
            r.get("gaming_hours"),
            r.get("idle_hours"),
            r.get("compliance_score"),
            r.get("status")
        ])
    output.seek(0)
    target_date = date_str or datetime.now().strftime("%Y-%m-%d")
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=anuvadini_timesheet_{target_date}.csv"}
    )

# ─── Per-App Activity APIs ────────────────────────────────────────────────────

@app.get("/api/activity/employee/{employee_id}")
async def api_employee_app_activity(employee_id: str, date_str: str = None):
    """
    Per-app time breakdown + switch timeline for one employee on one day.

    Response:
      {
        date_str, employee_id, total_hours,
        apps: [ {app_name, display_name, seconds, minutes, hours, percent,
                 first_seen, last_seen, last_title} ],
        timeline: [ {ts, app_name, display_name, window_title} ]
      }
    """
    return get_app_activity(employee_id, date_str)


@app.get("/api/activity/fleet")
async def api_fleet_app_activity(date_str: str = None):
    """
    All employees' top-app summary for the fleet dashboard.

    Response: [ {employee_id, hostname, total_hours, top_app, apps[]} ]
    """
    return get_fleet_app_activity(date_str)


@app.get("/api/activity/employee/{employee_id}/export")
async def api_export_app_activity(employee_id: str, date_str: str = None):
    """Download per-app time breakdown as CSV for one employee."""
    data = get_app_activity(employee_id, date_str)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Employee ID", "App Name", "Display Name",
                     "Hours", "Minutes", "First Seen", "Last Seen", "Last Window Title"])
    for a in data.get("apps", []):
        writer.writerow([
            data["date_str"], employee_id,
            a.get("app_name"), a.get("display_name"),
            a.get("hours"), a.get("minutes"),
            a.get("first_seen"), a.get("last_seen"), a.get("last_title", ""),
        ])
    output.seek(0)
    target_date = date_str or datetime.now().strftime("%Y-%m-%d")
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=activity_{employee_id}_{target_date}.csv"}
    )


# In-Dashboard Admin Incident Notification Center Endpoints
@app.get("/api/notifications")
async def api_get_notifications(limit: int = 50, unread_only: bool = False):
    items, unread_count = get_admin_notifications(limit=limit, unread_only=unread_only)
    return {
        "notifications": items,
        "unread_count": unread_count,
        "total_count": len(items)
    }

class NotificationReadRequest(BaseModel):
    notification_ids: list[int] = None

@app.post("/api/notifications/read")
async def api_mark_notifications_read(req: NotificationReadRequest = None):
    ids = req.notification_ids if req else None
    ok = mark_notifications_read(ids)
    _, unread_count = get_admin_notifications(limit=1, unread_only=True)
    return {"success": ok, "unread_count": unread_count}

@app.post("/api/notifications/clear")
async def api_clear_notifications():
    ok = clear_admin_notifications()
    return {"success": ok, "unread_count": 0}

class SimulateNotificationRequest(BaseModel):
    game_name: str = "Counter-Strike 2"
    employee_id: str = "EMP-1002"
    hostname: str = "DESKTOP-OPS-04"
    severity: str = "CRITICAL"

@app.post("/api/notifications/simulate")
async def api_simulate_notification(req: SimulateNotificationRequest = None):
    game = req.game_name if req else "Counter-Strike 2"
    emp_id = req.employee_id if req else "EMP-1002"
    host = req.hostname if req else "DESKTOP-OPS-04"
    sev = req.severity if req else "CRITICAL"
    from anuvadini_detector.notifier import dispatch_incident_notification
    doc = dispatch_incident_notification({
        "employee_id": emp_id,
        "username": "Vikram Patel",
        "hostname": host,
        "department": "Engineering",
        "game_name": game,
        "category": "PC Gaming (3D FPS)",
        "process_name": "cs2.exe",
        "pid": 4821,
        "severity": sev,
        "window_title": "Counter-Strike 2 (DirectX 11 Fullscreen)"
    })
    return {"success": True, "notification": doc}

class BulkActionRequest(BaseModel):
    action: str # 'warn_all_slacking' or 'kill_all_gaming'

@app.post("/api/fleet/bulk-action")
async def api_fleet_bulk_action(req: BulkActionRequest):
    workstations = get_fleet_workstations(status="GAMING_ALERT")
    count = 0
    for ws in workstations:
        host = ws["hostname"]
        if req.action == "warn_all_slacking":
            queue_workstation_command(host, "show_warning", {"game_name": ws.get("current_app", "Unauthorized Activity")})
            count += 1
        elif req.action == "kill_all_gaming":
            queue_workstation_command(host, "kill_process", {"pid": ws.get("pid", 0), "app_name": ws.get("current_app", "")})
            upsert_workstation(
                hostname=host,
                username=ws.get("username", "Employee"),
                department=ws.get("department", "General"),
                ip_address=ws.get("ip_address", "127.0.0.1"),
                status="ONLINE",
                current_app="Desktop / On-Task",
                window_title="Workplace Compliant",
                pid=0,
                idle_seconds=0
            )
            count += 1
    return {"success": True, "action": req.action, "affected_workstations": count}

# NVIDIA NIM AI Vision Model Endpoints
@app.get("/api/nvidia/status")
async def api_get_nvidia_status():
    return nvidia_auditor.get_status()

class NvidiaSettingsRequest(BaseModel):
    api_key: str = None
    model: str = None
    enabled: bool = None

@app.post("/api/nvidia/settings")
async def api_save_nvidia_settings(req: NvidiaSettingsRequest):
    return nvidia_auditor.update_settings(
        api_key=req.api_key,
        model=req.model,
        enabled=req.enabled
    )

class NvidiaTestKeyRequest(BaseModel):
    api_key: str

@app.post("/api/nvidia/test-key")
async def api_test_nvidia_key(req: NvidiaTestKeyRequest):
    return nvidia_auditor.test_connection(req.api_key)

@app.post("/api/nvidia/audit-screen")
async def api_audit_screen_with_nvidia():
    img = capture_screen_universal()
    win = engine.last_active_window or {}
    res = nvidia_auditor.analyze_screen(
        pil_image=img,
        window_title=win.get("title", ""),
        process_name=win.get("process", "")
    )
    return res

# Anti-Tamper & Anti-Bypass Security Audit Endpoint
@app.get("/api/anti-tamper/audit")
@app.get("/api/antitamper/status")
async def api_anti_tamper_audit():
    shift_status = engine.get_shift_status()
    in_shift = shift_status.get("is_active", False)
    sockets = scan_gaming_network_sockets()
    evasions = scan_evasion_processes()
    cloaked = scan_disguised_processes_pe()
    tampered_hosts = check_heartbeat_tampering(in_shift=in_shift)
    
    is_secure = not (sockets or evasions or cloaked or tampered_hosts)
    return {
        "status": "SECURE" if is_secure else "THREAT_DETECTED",
        "gaming_sockets_count": len(sockets),
        "gaming_sockets": sockets,
        "evasion_processes_count": len(evasions),
        "evasion_processes": evasions,
        "cloaked_binaries_count": len(cloaked),
        "cloaked_binaries": cloaked,
        "tampered_workstations_count": len(tampered_hosts),
        "tampered_workstations": tampered_hosts,
        "tamper_protection_active": True
    }

# Live Server & Cross-Platform System Health
@app.get("/api/system/health")
async def api_system_health():
    vm = psutil.virtual_memory()
    uptime_secs = int(time.time() - SERVER_START_TIME)
    uptime_hours = round(uptime_secs / 3600, 1)
    
    # Safe platform label
    sys_name = platform.system()
    if sys_name == "Darwin":
        plat_label = f"macOS {platform.mac_ver()[0]} (Retina / Apple Silicon & Intel)"
    elif sys_name == "Windows":
        plat_label = f"Windows {platform.release()} (Enterprise Edition)"
    else:
        plat_label = f"Linux ({platform.platform()})"

    try:
        from anuvadini_detector.database import get_db
        db_stats = get_db().command("dbstats")
        db_size_kb = round(db_stats.get("dataSize", 0) / 1024, 1)
        db_label = "MongoDB (Active)"
    except Exception:
        db_size_kb = 0
        db_label = "MongoDB"

    return {
        "status": "OPERATIONAL",
        "platform": plat_label,
        "os_family": sys_name,
        "python_version": sys.version.split()[0],
        "cpu_usage_pct": psutil.cpu_percent(interval=None),
        "ram_usage_pct": vm.percent,
        "ram_used_mb": round(vm.used / (1024 * 1024)),
        "ram_total_mb": round(vm.total / (1024 * 1024)),
        "uptime_seconds": uptime_secs,
        "uptime_human": f"{uptime_hours} hrs ({uptime_secs}s)",
        "active_ws_connections": len(manager.active_connections),
        "registered_workstations": len(get_fleet_workstations()),
        "database_size_kb": db_size_kb,
        "database_type": db_label,
        "engine_active": engine.is_running,
        "shift_status": engine.get_shift_status()
    }

# Detailed Chronological Audit Log
@app.get("/api/audit/logs")
async def api_get_audit_logs(limit: int = 40):
    violations = get_recent_violations(limit=limit)
    return {
        "total_records": len(violations),
        "logs": violations,
        "audit_timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }


# Workplace Network & Website Firewall Endpoints (Instagram, Snapchat, Poki, Netflix Blocking)
class FirewallRuleRequest(BaseModel):
    domain: str
    category: str = "Custom Blocklist"
    enabled: bool = True
    scope: str = Field(default="all", pattern="^(all|department|employee)$")
    departments: list[str] = Field(default_factory=list, max_length=100)
    employee_ids: list[str] = Field(default_factory=list, max_length=500)

class FirewallToggleRequest(BaseModel):
    enabled: bool

@app.get("/api/firewall/status")
async def api_get_firewall_status():
    return firewall_engine.get_status()

@app.post("/api/firewall/toggle")
async def api_toggle_firewall(req: FirewallToggleRequest):
    ok, msg = firewall_engine.set_enabled(req.enabled)
    return {"success": ok, "message": msg, "enabled": firewall_engine.is_enabled()}

@app.get("/api/firewall/rules")
async def api_get_firewall_rules():
    return get_firewall_rules()

@app.post("/api/firewall/rules")
async def api_add_firewall_rule(rule: FirewallRuleRequest):
    if rule.scope == "department" and not any(d.strip() for d in rule.departments):
        raise HTTPException(status_code=400, detail="Pick at least one department for this rule")
    if rule.scope == "employee" and not any(e.strip() for e in rule.employee_ids):
        raise HTTPException(status_code=400, detail="Pick at least one employee for this rule")
    ok = add_firewall_rule(rule.domain, rule.category, enabled=1 if rule.enabled else 0, scope=rule.scope,
                           departments=rule.departments, employee_ids=rule.employee_ids)
    firewall_engine.sync_hosts_sinkhole()
    return {"success": ok, "domain": rule.domain}

@app.delete("/api/firewall/rules/{rule_id}")
async def api_delete_firewall_rule(rule_id: int):
    ok = delete_firewall_rule(rule_id)
    firewall_engine.sync_hosts_sinkhole()
    return {"success": ok}

@app.post("/api/firewall/rules/{rule_id}/toggle")
async def api_toggle_firewall_rule(rule_id: int):
    rules = get_firewall_rules()
    target = next((r for r in rules if r["id"] == rule_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Rule not found")
    new_state = 0 if target.get("enabled", 1) == 1 else 1
    ok = toggle_firewall_rule(rule_id, new_state)
    firewall_engine.sync_hosts_sinkhole()
    return {"success": ok, "enabled": bool(new_state)}

@app.post("/api/firewall/sync")
async def api_sync_firewall():
    ok, msg = firewall_engine.sync_hosts_sinkhole()
    return {"success": ok, "message": msg}

class FirewallExemptionRequest(BaseModel):
    employee_id: str = Field(default="", max_length=64)
    target_type: str = Field(default="person", max_length=16)
    role: str = Field(default="", max_length=60)
    scope: str = Field(default="category", max_length=16)
    value: str = Field(default="", max_length=253)
    name: str = Field(default="", max_length=120)
    department: str = Field(default="", max_length=120)

@app.get("/api/firewall/roles")
async def api_get_firewall_roles():
    return get_firewall_roles()

class FirewallRoleRequest(BaseModel):
    name: str = Field(max_length=60)

@app.post("/api/firewall/roles")
async def api_add_firewall_role(req: FirewallRoleRequest):
    ok, msg = add_firewall_role(req.name)
    return {"success": ok, "message": msg}

@app.delete("/api/firewall/roles/{role_name}")
async def api_delete_firewall_role(role_name: str):
    ok = delete_firewall_role(role_name)
    firewall_engine.invalidate_exemptions()
    firewall_engine.sync_hosts_sinkhole()
    return {"success": ok}

class FirewallRoleMemberRequest(BaseModel):
    employee_id: str = Field(max_length=64)
    name: str = Field(default="", max_length=120)
    department: str = Field(default="", max_length=120)

@app.post("/api/firewall/roles/{role_name}/members")
async def api_add_firewall_role_member(role_name: str, req: FirewallRoleMemberRequest):
    ok, msg = add_firewall_role_member(role_name, req.employee_id, req.name, req.department)
    firewall_engine.invalidate_exemptions()
    if ok:
        firewall_engine.sync_hosts_sinkhole()
    return {"success": ok, "message": msg}

@app.delete("/api/firewall/roles/{role_name}/members/{employee_id}")
async def api_remove_firewall_role_member(role_name: str, employee_id: str):
    ok = remove_firewall_role_member(role_name, employee_id)
    firewall_engine.invalidate_exemptions()
    if ok:
        firewall_engine.sync_hosts_sinkhole()
    return {"success": ok}

# ---------------------------------------------------------------------------
# Usage history: per person / per team, day / week / month / year (admin only)
# ---------------------------------------------------------------------------

@app.get("/api/usage/person/{employee_id}")
async def api_usage_person(employee_id: str, start: str = "", end: str = "", granularity: str = "day"):
    return usage_report([employee_id[:64]], start or None, end or None, granularity)

@app.get("/api/usage/person/{employee_id}/live")
async def api_usage_person_live(employee_id: str):
    """What this person has open right now (foreground app and all open apps)."""
    return usage_live_get(employee_id[:64])

@app.get("/api/usage/team/{role_name}")
async def api_usage_team(role_name: str, start: str = "", end: str = "", granularity: str = "day"):
    roles = [r for r in get_firewall_roles() if r.get("name", "").lower() == role_name.lower()]
    if not roles:
        raise HTTPException(status_code=404, detail="Team not found")
    members = [m.get("employee_id") for m in (roles[0].get("members") or []) if m.get("employee_id")]
    report = usage_report(members, start or None, end or None, granularity)
    report["team"] = roles[0].get("name")
    report["member_count"] = len(members)
    return report

class UsageExclusionRequest(BaseModel):
    target_type: str = Field(pattern="^(person|team|everyone)$")
    target: str = Field(min_length=1, max_length=120)
    label: str = Field(default="", max_length=120)
    scope: str = Field(default="everything", pattern="^(everything|site|app)$")
    value: str = Field(default="", max_length=120)

@app.get("/api/usage/exclusions")
async def api_usage_exclusions():
    return list_exclusions()

@app.post("/api/usage/exclusions")
async def api_add_usage_exclusion(req: UsageExclusionRequest):
    ok, msg = add_exclusion(req.target_type, req.target.strip(), req.label.strip(), req.scope, req.value.strip())
    return {"success": ok, "message": msg}

@app.delete("/api/usage/exclusions/{exclusion_id}")
async def api_delete_usage_exclusion(exclusion_id: int):
    return {"success": delete_exclusion(exclusion_id)}

@app.get("/api/usage/person/{employee_id}/day/{day}")
async def api_usage_day(employee_id: str, day: str):
    return usage_day_detail(employee_id[:64], day[:10])

class FocusRuleRequest(BaseModel):
    target_type: str = Field(pattern="^(person|team|everyone)$")
    target: str = Field(default="all", max_length=120)
    label: str = Field(default="", max_length=120)
    apps: list[str] = Field(default_factory=list, max_length=50)

@app.get("/api/usage/focus-rules")
async def api_list_focus_rules():
    return list_focus_rules()

@app.post("/api/usage/focus-rules")
async def api_add_focus_rule(req: FocusRuleRequest):
    ok, msg = add_focus_rule(req.target_type, req.target.strip(), req.label.strip(), req.apps)
    return {"success": ok, "message": msg}

@app.delete("/api/usage/focus-rules/{rule_id}")
async def api_delete_focus_rule(rule_id: int):
    return {"success": delete_focus_rule(rule_id)}

@app.get("/api/usage/focus-rules/report")
def api_focus_rules_report(start: str = "", end: str = ""):
    return focus_rules_report(start or None, end or None)

@app.get("/api/usage/export")
def api_usage_export(scope: str = "person", target: str = "", start: str = "", end: str = "", kind: str = "csv"):
    """Download People & teams usage: CSV (days, apps or incidents) or PDF, for a person, a team or everyone."""
    try:
        body, filename, media_type = export_file(scope, target, start, end, kind)
    except ExportNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except PdfUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except ExportError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return Response(content=body, media_type=media_type,
                    headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"})

class FeatureAccessRequest(BaseModel):
    feature: str = Field(pattern="^(music|camera)$")
    target_type: str = Field(pattern="^(person|team|everyone)$")
    target: str = Field(min_length=1, max_length=120)
    label: str = Field(default="", max_length=120)
    enabled: bool = True

@app.get("/api/features/access")
async def api_feature_access(feature: str = ""):
    return list_feature_access(feature or None)

@app.post("/api/features/access")
async def api_set_feature_access(req: FeatureAccessRequest):
    ok, msg = set_feature_access(req.feature, req.target_type, req.target.strip(), req.enabled, req.label.strip())
    return {"success": ok, "message": msg}

@app.delete("/api/features/access/{row_id}")
async def api_delete_feature_access(row_id: int):
    return {"success": delete_feature_access(row_id)}

@app.get("/api/firewall/people")
async def api_firewall_people():
    return get_firewall_people()

@app.get("/api/firewall/exemptions")
async def api_get_firewall_exemptions():
    return get_firewall_exemptions()

@app.post("/api/firewall/exemptions")
async def api_add_firewall_exemption(req: FirewallExemptionRequest):
    ok, msg = add_firewall_exemption(req.employee_id, req.scope, req.value, req.name, req.department,
                                     target_type=req.target_type, role=req.role)
    firewall_engine.invalidate_exemptions()
    if ok:
        firewall_engine.sync_hosts_sinkhole()
    return {"success": ok, "message": msg}

@app.delete("/api/firewall/exemptions/{exemption_id}")
async def api_delete_firewall_exemption(exemption_id: int):
    ok = delete_firewall_exemption(exemption_id)
    firewall_engine.invalidate_exemptions()
    firewall_engine.sync_hosts_sinkhole()
    return {"success": ok}

@app.get("/api/firewall/logs")
async def api_get_firewall_logs(limit: int = 50):
    return get_firewall_logs(limit=limit)


# WebSocket Endpoint
@app.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    peer = websocket.client.host if websocket.client else None
    authorised = sec.is_trusted_local(peer, websocket.headers.get("host"), websocket.headers.get("x-forwarded-for")) \
        or sec.valid_admin_session(websocket.cookies.get(sec.ADMIN_COOKIE))
    origin = websocket.headers.get("origin")
    if origin and urlparse(origin).netloc.lower() != (websocket.headers.get("host") or "").lower():
        authorised = False
    if not authorised:
        await websocket.close(code=1008)
        return
    await manager.connect(websocket)
    try:
        while True:
            # Keep alive & listen for client pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)


@app.websocket("/ws/client/{client_id}")
async def ws_client_endpoint(websocket: WebSocket, client_id: str):
    await websocket.accept()
    await websocket.send_text(json.dumps({"type": "handshake", "blacklist": []}))
    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)
            scr = data.get("screenshot") or data.get("frame_b64") or data.get("screenshot_b64")
            host = data.get("hostname") or client_id
            if scr:
                try:
                    if "," in scr:
                        scr = scr.split(",")[1]
                    raw_bytes = base64.b64decode(scr)
                    save_workstation_screen_frame(host, raw_bytes)
                except Exception as ex:
                    pass
            upsert_workstation(
                hostname=host,
                username=data.get("username") or data.get("employee_name") or "Employee",
                department=data.get("department", "Engineering"),
                status=data.get("status", "ONLINE"),
                current_app=data.get("process_name") or data.get("current_app") or "",
                window_title=data.get("window") or data.get("window_title") or "",
                pid=data.get("pid", 0),
                idle_seconds=data.get("idle_seconds", 0.0),
                cpu_pct=data.get("cpu_percent", 0.0),
                ram_pct=data.get("ram_percent", 0.0),
                employee_id=data.get("employee_id", "")
            )
    except WebSocketDisconnect:
        pass
    except Exception:
        pass

class CameraPreferenceRequest(BaseModel):
    employee_id: str = Field(max_length=64)
    enabled: bool = True

@app.post("/api/fleet/camera-preference")
async def api_camera_preference(req: CameraPreferenceRequest):
    """Employee switches their own camera off (enabled=False) or back on, from the exe."""
    set_camera_self_off(req.employee_id[:64], not req.enabled)
    return {"success": True, "camera_enabled": camera_allowed(req.employee_id[:64])}
