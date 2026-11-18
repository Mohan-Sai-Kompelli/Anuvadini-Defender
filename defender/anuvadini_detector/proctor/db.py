"""
proctor.db — MongoDB persistence for the Proctor feature.

Collections
-----------
proctor_watches     One doc per watched employee (status: active)
proctor_events      Append-only event log (app_switch, snapshot, idle_alert, …)
proctor_challenges  Liveness challenge records (pending → responded | missed)

All functions follow the same error-handling convention as the rest of database.py:
catch every exception, print a debug line, and return a safe zero-value.
"""
import re
from datetime import datetime, date
from pathlib import Path

import pymongo

from anuvadini_detector.config import EVIDENCE_DIR
from anuvadini_detector.database import get_db, get_next_sequence

_GAZE_INDEX_READY = False


# ─── Internal helpers ──────────────────────────────────────────────────────────

def _snapshot_path(hostname: str, ts: int, kind: str = "screen") -> Path:
    safe   = re.sub(r"[^A-Za-z0-9._-]", "_", str(hostname or ""))[:60] or "unknown"
    prefix = "proctor_cam" if kind == "webcam" else "proctor"
    return EVIDENCE_DIR / f"{prefix}_{safe}_{ts}.jpg"


# ─── Watch list ────────────────────────────────────────────────────────────────

def add_watch(employee_id: str, reason: str = "", added_by: str = "Admin") -> tuple[bool, str]:
    """Put an employee on Proctor Watch. Returns (ok, message)."""
    employee_id = (employee_id or "").strip()
    if not employee_id:
        return False, "Employee ID required."
    try:
        db  = get_db()
        emp = db.employees.find_one({"employee_id": employee_id}, {"_id": 0, "password": 0})
        ws  = db.workstations.find_one({"employee_id": employee_id}, {"_id": 0})
        if not emp and not ws:
            return False, f"Employee '{employee_id}' not found."

        watch_id = get_next_sequence("proctor_watches")
        now_str  = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        doc = {
            "id":            watch_id,
            "employee_id":   employee_id,
            "employee_name": (emp or ws or {}).get("name") or (emp or ws or {}).get("username") or employee_id,
            "department":    (emp or ws or {}).get("department", ""),
            "hostname":      (ws or {}).get("hostname", ""),
            "reason":        (reason or "").strip()[:300],
            "added_by":      added_by,
            "added_at":      now_str,
            "status":        "active",
        }
        db.proctor_watches.update_one(
            {"employee_id": employee_id},
            {"$set": doc},
            upsert=True,
        )
        log_event(employee_id, (ws or {}).get("hostname", ""), "watch_added",
                  f"Added to Proctor Watch by {added_by}. Reason: {reason or 'Not specified.'}")
        return True, "Employee added to Proctor Watch."
    except Exception as e:
        print(f"[Proctor.db] add_watch: {e}")
        return False, str(e)


def remove_watch(employee_id: str) -> bool:
    try:
        db  = get_db()
        res = db.proctor_watches.delete_one({"employee_id": employee_id})
        return res.deleted_count > 0
    except Exception as e:
        print(f"[Proctor.db] remove_watch: {e}")
        return False


def get_watches() -> list[dict]:
    """All active watches, enriched with live workstation + attendance data."""
    try:
        db        = get_db()
        watches   = list(db.proctor_watches.find({"status": "active"}, {"_id": 0}).sort("added_at", pymongo.DESCENDING))
        ws_map    = {w.get("employee_id"): w for w in db.workstations.find({}, {"_id": 0})}
        today_str = date.today().strftime("%Y-%m-%d")
        att_map   = {r.get("employee_id"): r for r in db.attendance_records.find({"date_str": today_str}, {"_id": 0})}
        for w in watches:
            eid = w["employee_id"]
            ws  = ws_map.get(eid) or {}
            att = att_map.get(eid) or {}
            w.update({
                "hostname":       ws.get("hostname",      w.get("hostname", "")),
                "current_app":    ws.get("current_app",   ""),
                "window_title":   ws.get("window_title",  ""),
                "status_live":    ws.get("status",        "OFFLINE"),
                "idle_seconds":   ws.get("idle_seconds",  0),
                "last_heartbeat": ws.get("last_heartbeat",""),
                "display_name":   w.get("employee_name",  eid),
            })
            tot  = att.get("total_seconds", 0)
            prod = att.get("productive_seconds", 0)
            w["activity_score"] = round(prod / tot * 100, 1) if tot > 0 else 0
            w["today_hours"]    = round(tot / 3600, 2)
            sent      = db.proctor_challenges.count_documents({"employee_id": eid, "date_str": today_str})
            responded = db.proctor_challenges.count_documents({"employee_id": eid, "date_str": today_str, "status": "responded"})
            missed    = db.proctor_challenges.count_documents({"employee_id": eid, "date_str": today_str, "status": "missed"})
            w["challenges_sent"]      = sent
            w["challenges_responded"] = responded
            w["challenges_missed"]    = missed
        return watches
    except Exception as e:
        print(f"[Proctor.db] get_watches: {e}")
        return []


def is_watched(employee_id: str) -> bool:
    """Lightweight check — called on every agent heartbeat."""
    if not employee_id:
        return False
    try:
        return get_db().proctor_watches.count_documents(
            {"employee_id": employee_id, "status": "active"}
        ) > 0
    except Exception:
        return False


# ─── Event log ─────────────────────────────────────────────────────────────────

def log_event(
    employee_id: str,
    hostname:    str,
    event_type:  str,
    detail:      str,
    screenshot_path: str | None = None,
) -> int:
    """
    Append one entry to proctor_events.

    event_type values:
        app_switch | idle_alert | returned_from_idle
        snapshot | webcam_snapshot
        challenge_sent | challenge_responded | challenge_missed
        watch_added | watch_removed
    """
    try:
        db    = get_db()
        now   = datetime.now()
        ev_id = get_next_sequence("proctor_events")
        db.proctor_events.insert_one({
            "id":              ev_id,
            "employee_id":     employee_id or "",
            "hostname":        hostname or "",
            "event_type":      (event_type or "")[:40],
            "detail":          (detail or "")[:500],
            "screenshot_path": screenshot_path,
            "ts":              now.strftime("%H:%M:%S"),
            "timestamp":       now.strftime("%Y-%m-%d %H:%M:%S"),
            "date_str":        now.strftime("%Y-%m-%d"),
            "epoch":           now.timestamp(),
        })
        return ev_id
    except Exception as e:
        print(f"[Proctor.db] log_event: {e}")
        return 0


def get_events(employee_id: str, date_str: str = None, limit: int = 100) -> list[dict]:
    try:
        db     = get_db()
        target = date_str or date.today().strftime("%Y-%m-%d")
        return list(
            db.proctor_events
            .find({"employee_id": employee_id, "date_str": target}, {"_id": 0})
            .sort("epoch", pymongo.DESCENDING)
            .limit(limit)
        )
    except Exception as e:
        print(f"[Proctor.db] get_events: {e}")
        return []


# ─── Liveness challenges ───────────────────────────────────────────────────────

def create_challenge(employee_id: str, hostname: str) -> int:
    """Create and log a new challenge. Returns the challenge ID, or 0 on failure."""
    try:
        db    = get_db()
        now   = datetime.now()
        ch_id = get_next_sequence("proctor_challenges")
        db.proctor_challenges.insert_one({
            "id":               ch_id,
            "employee_id":      employee_id,
            "hostname":         hostname,
            "status":           "pending",
            "sent_at":          now.strftime("%Y-%m-%d %H:%M:%S"),
            "date_str":         now.strftime("%Y-%m-%d"),
            "epoch_sent":       now.timestamp(),
            "responded_at":     None,
            "response_time_ms": None,
        })
        log_event(employee_id, hostname, "challenge_sent",
                  f"Liveness challenge #{ch_id} sent.")
        return ch_id
    except Exception as e:
        print(f"[Proctor.db] create_challenge: {e}")
        return 0


def record_response(challenge_id: int, response_time_ms: int) -> bool:
    try:
        db     = get_db()
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        ch = db.proctor_challenges.find_one({"id": challenge_id, "status": "pending"})
        if not ch:
            return False
        db.proctor_challenges.update_one(
            {"id": challenge_id, "status": "pending"},
            {"$set": {"status": "responded", "responded_at": now_str,
                       "response_time_ms": response_time_ms}},
        )
        log_event(
            ch.get("employee_id", ""), ch.get("hostname", ""),
            "challenge_responded",
            f"Liveness challenge #{challenge_id} responded in {response_time_ms}ms.",
        )
        return True
    except Exception as e:
        print(f"[Proctor.db] record_response: {e}")
        return False


def expire_missed(timeout_seconds: int = 90) -> int:
    """Mark all pending challenges older than timeout_seconds as missed."""
    try:
        db     = get_db()
        cutoff = datetime.now().timestamp() - timeout_seconds
        missed = 0
        for ch in db.proctor_challenges.find({"status": "pending"}):
            if ch.get("epoch_sent", 0) < cutoff:
                db.proctor_challenges.update_one(
                    {"_id": ch["_id"]}, {"$set": {"status": "missed"}}
                )
                log_event(
                    ch.get("employee_id", ""), ch.get("hostname", ""),
                    "challenge_missed",
                    f"Liveness challenge #{ch.get('id')} missed — no response within {timeout_seconds}s.",
                )
                missed += 1
        return missed
    except Exception as e:
        print(f"[Proctor.db] expire_missed: {e}")
        return 0


# ─── Evidence snapshots ────────────────────────────────────────────────────────

def save_snapshot(
    hostname:    str,
    employee_id: str,
    frame_bytes: bytes,
    kind: str = "screen",   # "screen" | "webcam"
) -> str | None:
    """Write JPEG bytes to disk, log the snapshot event. Returns filename or None."""
    try:
        ts   = int(datetime.now().timestamp())
        path = _snapshot_path(hostname, ts, kind)
        path.write_bytes(frame_bytes)
        filename   = path.name
        event_type = "webcam_snapshot" if kind == "webcam" else "snapshot"
        log_event(employee_id, hostname, event_type,
                  f"Evidence snapshot saved: {filename}",
                  screenshot_path=filename)
        return filename
    except Exception as e:
        print(f"[Proctor.db] save_snapshot: {e}")
        return None


def get_snapshots(
    employee_id: str,
    date_str: str = None,
    limit: int = 20,
    kind: str = "all",   # "screen" | "webcam" | "all"
) -> list[dict]:
    """Return evidence snapshots (screen, webcam, and challenge evidence) newest-first."""
    try:
        db     = get_db()
        target = date_str or date.today().strftime("%Y-%m-%d")
        if kind == "all":
            type_filter = {"event_type": {"$in": [
                "snapshot", "webcam_snapshot",
                "challenge_responded", "challenge_missed",
            ]}}
        elif kind == "webcam":
            type_filter = {"event_type": "webcam_snapshot"}
        else:
            type_filter = {"event_type": "snapshot"}
        query = {
            "employee_id": employee_id,
            "date_str":    target,
            "screenshot_path": {"$ne": None},
            **type_filter,
        }
        return list(
            db.proctor_events
            .find(query, {"_id": 0})
            .sort("epoch", pymongo.DESCENDING)
            .limit(limit)
        )
    except Exception as e:
        print(f"[Proctor.db] get_snapshots: {e}")
        return []


# ─── Eye-movement record (numbers only, never video) ───────────────────────────

def _num(v, default: float = 0.0) -> float:
    try:
        f = float(v)
        return f if (f == f and abs(f) < 1e12) else default   # drops NaN and absurd values
    except (TypeError, ValueError):
        return default


def _clean_gaze_summary(s: dict) -> dict:
    """Keep only the numbers the Proctor page shows, and bound every list."""
    away_in = s.get("away") if isinstance(s.get("away"), dict) else {}
    episodes = []
    for e in (s.get("episodes") or [])[:200]:
        if isinstance(e, dict):
            episodes.append({
                "at": _num(e.get("at")),
                "sec": _num(e.get("sec")),
                "dir": str(e.get("dir") or "")[:8],
            })
    timeline = []
    for b in (s.get("timeline") or [])[:400]:
        if isinstance(b, dict):
            timeline.append({
                "t": _num(b.get("t")),
                "n": _num(b.get("n")),
                "sec": _num(b.get("sec")),
                "onPct": _num(b.get("onPct")),
            })
    return {
        "samples": int(_num(s.get("samples"))),
        "onScreenSec": int(_num(s.get("onScreenSec"))),
        "away": {d: int(_num(away_in.get(d))) for d in ("left", "right", "up", "down")},
        "closedSec": int(_num(s.get("closedSec"))),
        "noFaceSec": int(_num(s.get("noFaceSec"))),
        "lookAways": int(_num(s.get("lookAways"))),
        "longestSec": int(_num(s.get("longestSec"))),
        "bucketSec": int(_num(s.get("bucketSec"), 15)),
        "episodes": episodes,
        "timeline": timeline,
        "startedAt": _num(s.get("startedAt")),
        "sentAt": _num(s.get("sentAt")),
    }


def save_gaze_summary(employee_id: str, hostname: str, summary: dict) -> bool:
    """
    Store the cumulative eye record of one run. One document per (employee, run); a later summary
    replaces the earlier one, but a smaller (late or repeated) one never overwrites a bigger one.
    """
    global _GAZE_INDEX_READY
    try:
        run = str((summary or {}).get("run") or "")[:64]
        if not employee_id or not run:
            return False
        clean = _clean_gaze_summary(summary or {})
        db = get_db()
        if not _GAZE_INDEX_READY:
            db.proctor_gaze.create_index([("employee_id", 1), ("run", 1)], unique=True)
            _GAZE_INDEX_READY = True
        existing = db.proctor_gaze.find_one({"employee_id": employee_id, "run": run}, {"samples": 1})
        if existing and existing.get("samples", 0) > clean["samples"]:
            return False
        started = clean["startedAt"]
        day = (datetime.fromtimestamp(started / 1000) if started else datetime.now()).strftime("%Y-%m-%d")
        doc = {
            "employee_id": employee_id,
            "hostname": (hostname or "")[:100],
            "run": run,
            "day": day,
            **clean,
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }
        db.proctor_gaze.update_one({"employee_id": employee_id, "run": run}, {"$set": doc}, upsert=True)
        return True
    except Exception as e:
        print(f"[Proctor.db] save_gaze_summary: {e}")
        return False


def get_gaze(employee_id: str, date_str: str | None = None) -> dict:
    """The eye record for one employee on one day: each run (newest first) and the day's totals."""
    day = date_str or datetime.now().strftime("%Y-%m-%d")
    totals = {"samples": 0, "onScreenSec": 0, "onScreenPct": 0, "lookAways": 0, "longestSec": 0,
              "closedSec": 0, "noFaceSec": 0, "away": {"left": 0, "right": 0, "up": 0, "down": 0}}
    runs = []
    try:
        db = get_db()
        rows = list(
            db.proctor_gaze.find({"employee_id": employee_id, "day": day}, {"_id": 0})
            .sort("startedAt", -1).limit(20)
        )
        for r in rows:
            runs.append(r)
            totals["samples"] += int(r.get("samples", 0))
            totals["onScreenSec"] += int(r.get("onScreenSec", 0))
            totals["lookAways"] += int(r.get("lookAways", 0))
            totals["longestSec"] = max(totals["longestSec"], int(r.get("longestSec", 0)))
            totals["closedSec"] += int(r.get("closedSec", 0))
            totals["noFaceSec"] += int(r.get("noFaceSec", 0))
            for d in ("left", "right", "up", "down"):
                totals["away"][d] += int((r.get("away") or {}).get(d, 0))
        if totals["samples"]:
            totals["onScreenPct"] = round(totals["onScreenSec"] / totals["samples"] * 100)
    except Exception as e:
        print(f"[Proctor.db] get_gaze: {e}")
    return {"employee_id": employee_id, "date_str": day, "runs": runs, "totals": totals}
