"""
proctor.routes — FastAPI route handlers for the Proctor feature.

Registered in server.py with:
    app.include_router(proctor_router)
"""
import base64
import re

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from anuvadini_detector.config import EVIDENCE_DIR
from anuvadini_detector.database import get_workstation_detail, queue_workstation_command
import anuvadini_detector.proctor.db as pdb

proctor_router = APIRouter()


# ─── Request models ────────────────────────────────────────────────────────────

class WatchRequest(BaseModel):
    employee_id: str = Field(max_length=64)
    reason: str = Field(default="", max_length=300)


class EventRequest(BaseModel):
    hostname:       str  = Field(max_length=100)
    employee_id:    str  = Field(default="", max_length=64)
    event_type:     str  = Field(max_length=40)
    detail:         str  = Field(default="", max_length=500)
    screenshot_b64: str  = Field(default="")


class ChallengeResponseRequest(BaseModel):
    hostname:         str = Field(max_length=100)
    employee_id:      str = Field(default="", max_length=64)
    challenge_id:     int
    response_time_ms: int = 0


# ─── Admin — watch list ────────────────────────────────────────────────────────

@proctor_router.get("/api/proctor/watches")
async def get_watches():
    """All employees currently on Proctor Watch, enriched with live state."""
    return pdb.get_watches()


@proctor_router.post("/api/proctor/watches")
async def add_watch(req: WatchRequest):
    ok, msg = pdb.add_watch(req.employee_id, req.reason)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"success": True, "message": msg}


@proctor_router.delete("/api/proctor/watches/{employee_id}")
async def remove_watch(employee_id: str):
    ok = pdb.remove_watch(employee_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Watch entry not found.")
    return {"success": True}


# ─── Admin — event log & snapshots ────────────────────────────────────────────

@proctor_router.get("/api/proctor/events/{employee_id}")
async def get_events(employee_id: str, date_str: str = None, limit: int = 100):
    events = pdb.get_events(employee_id, date_str, limit=min(limit, 500))
    return {"employee_id": employee_id, "date_str": date_str, "events": events}


@proctor_router.get("/api/proctor/snapshots/{employee_id}")
async def get_snapshots(
    employee_id: str,
    date_str: str = None,
    limit: int = 20,
    kind: str = "all",
):
    snaps = pdb.get_snapshots(employee_id, date_str, limit=min(limit, 50), kind=kind)
    return {"employee_id": employee_id, "kind": kind, "snapshots": snaps}


# ─── Admin — send liveness challenge ──────────────────────────────────────────

@proctor_router.post("/api/proctor/challenge/{hostname}")
async def send_challenge(hostname: str):
    """Admin triggers a liveness challenge on a watched employee's workstation."""
    ws = get_workstation_detail(hostname)
    if not ws:
        raise HTTPException(status_code=404, detail="Workstation not found.")
    employee_id = ws.get("employee_id", "")
    ch_id = pdb.create_challenge(employee_id, hostname)
    if not ch_id:
        raise HTTPException(status_code=500, detail="Failed to create challenge.")
    queue_workstation_command(hostname, "proctor_challenge", {"challenge_id": ch_id})
    return {"success": True, "challenge_id": ch_id}


# ─── Agent-facing (no auth required — added to PUBLIC_API_EXACT in server.py) ─

@proctor_router.post("/api/fleet/proctor-event")
async def fleet_proctor_event(req: EventRequest):
    """
    Agent posts a proctor event.
    If screenshot_b64 is present it's saved to disk; the save itself logs the event.
    Otherwise just log a metadata-only event.
    """
    snapshot_path = None
    if req.screenshot_b64 and len(req.screenshot_b64) < 6_000_000:
        try:
            raw  = base64.b64decode(req.screenshot_b64, validate=True)
            kind = "webcam" if req.event_type == "webcam_snapshot" else "screen"
            snapshot_path = pdb.save_snapshot(req.hostname, req.employee_id, raw, kind=kind)
        except Exception:
            pass

    if not snapshot_path:
        pdb.log_event(req.employee_id, req.hostname, req.event_type, req.detail)

    return {"success": True}


class GazeRequest(BaseModel):
    hostname:    str = Field(default="", max_length=100)
    employee_id: str = Field(default="", max_length=64)
    summary:     dict = Field(default_factory=dict)


@proctor_router.post("/api/fleet/proctor-gaze")
async def fleet_proctor_gaze(req: GazeRequest):
    """Agent posts the cumulative eye record of a run (numbers only). Kept only while the employee is on the watch list."""
    if not req.employee_id or not pdb.is_watched(req.employee_id):
        return {"success": False, "reason": "not_watched"}
    ok = pdb.save_gaze_summary(req.employee_id, req.hostname, req.summary)
    return {"success": bool(ok)}


@proctor_router.get("/api/proctor/gaze/{employee_id}")
async def get_gaze(employee_id: str, date_str: str = None):
    """Admin: the eye record for one employee on one day (runs and totals)."""
    return pdb.get_gaze(employee_id, date_str)


@proctor_router.post("/api/fleet/proctor-challenge-response")
async def fleet_challenge_response(req: ChallengeResponseRequest):
    """Agent posts the employee's liveness-challenge response."""
    ok = pdb.record_response(req.challenge_id, req.response_time_ms)
    return {"success": ok}


# ─── Evidence snapshot file serving ───────────────────────────────────────────

@proctor_router.get("/api/evidence/proctor/{filename}")
async def serve_snapshot(filename: str):
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", filename)[:120]
    fp   = EVIDENCE_DIR / safe
    if not fp.exists():
        raise HTTPException(status_code=404, detail="Snapshot not found.")
    return FileResponse(str(fp), media_type="image/jpeg")
