"""
Anuvadini Detector - Per-person usage history.

Every heartbeat from an employee PC adds its time to that person's record for the day:
  * usage_site_daily  -> time per unique site / app per day  (chatgpt, gmail, excel, ...)
  * usage_day_summary -> active / focused / idle seconds per day (the 8-hour score)

Records are kept per day forever (no TTL), so any past day can be viewed later and
rolled up by week, month or year.

Site names merge repeats: "ChatGPT - Google Chrome", "ChatGPT", "(2) ChatGPT - Brave"
all become the one site "chatgpt".
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta

WORK_DAY_HOURS = 8.0

BROWSER_PROCESSES = {
    "chrome.exe", "msedge.exe", "firefox.exe", "brave.exe", "opera.exe", "opera_gx.exe", "vivaldi.exe",
    "arc.exe", "iexplore.exe", "waterfox.exe", "librewolf.exe", "chromium.exe",
}

# Browser names that trail a page title, e.g. "ChatGPT - Google Chrome".
_BROWSER_SUFFIX_RE = re.compile(
    r"\s[-–|]\s*(google chrome|microsoft edge|mozilla firefox|firefox|brave|opera gx|opera|vivaldi|arc|chromium|safari)\s*$",
    re.IGNORECASE,
)
_NOTIFY_COUNT_RE = re.compile(r"^\(\d+\)\s*")
_DOMAIN_RE = re.compile(r"\b([a-z0-9-]+\.)+(com|org|net|io|ai|in|co|dev|app|edu|gov|tv)\b", re.IGNORECASE)

# Web sites that count as focused work when the employee is active on them.
PRODUCTIVE_SITE_KEYS = {
    "gmail", "outlook", "google drive", "google docs", "google sheets", "google slides", "google calendar",
    "microsoft teams", "office", "onedrive", "sharepoint", "notion", "slack", "github", "gitlab",
    "jira", "confluence", "chatgpt", "claude", "gemini", "antigravity", "stack overflow", "figma",
    "docs.google.com", "sheets.google.com", "drive.google.com", "mail.google.com",
}


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()


def site_key_for(process: str, title: str) -> tuple[str, str, str]:
    """Return (key, label, kind) for a window.

    kind == "web": key is the site name (lower-case), e.g. "chatgpt", "youtube", "gmail".
    kind == "app": key is the process name, e.g. "excel.exe".
    """
    proc = (process or "").strip().lower()
    if proc in BROWSER_PROCESSES:
        t = _clean(title)
        t = _NOTIFY_COUNT_RE.sub("", t)
        t = _BROWSER_SUFFIX_RE.sub("", t).strip()
        t = re.sub(r"\S+@\S+", "", t).strip()  # e-mail addresses in titles are not website names
        m = _DOMAIN_RE.search(t)
        if m:
            key = m.group(0).lower()
            if key.startswith("www."):
                key = key[4:]
            return key, key, "web"
        parts = [p.strip() for p in re.split(r"\s[-–|]\s", t) if p.strip()]
        name = parts[-1] if len(parts) >= 2 else (parts[0] if parts else "")
        name = name.strip(" .:").lower()
        if not name:
            return "browser (other pages)", "Browser (other pages)", "web"
        return name[:60], name[:60], "web"
    if not proc:
        return "unknown", "Unknown", "app"
    return proc, proc, "app"


def is_focused(process: str, title: str) -> bool:
    """True when this window is productive work (apps on the work whitelist, or work sites)."""
    key, _label, kind = site_key_for(process, title)
    if kind == "web":
        return key in PRODUCTIVE_SITE_KEYS
    from anuvadini_detector.signatures import is_productivity_process
    return bool(is_productivity_process(process))


def _iso_week_label(d: date) -> str:
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def bucket_for(day: str, granularity: str) -> str:
    d = datetime.strptime(day, "%Y-%m-%d").date()
    if granularity == "week":
        return _iso_week_label(d)
    if granularity == "month":
        return d.strftime("%Y-%m")
    if granularity == "year":
        return d.strftime("%Y")
    return day


# ---------------------------------------------------------------------------
# Writing (called on every heartbeat)
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Exclusions: admin decides what is NOT tracked, for a person, a team or everyone.
#   scope "everything" -> the whole screen is not tracked for them
#   scope "site"       -> only this website (site key, e.g. "chatgpt") is not tracked
#   scope "app"        -> only this program (process name, e.g. "excel.exe") is not tracked
# Past history is kept. Rules are read from the database and cached briefly.
# ---------------------------------------------------------------------------

import time as _time

EXCLUSION_SCOPES = ("everything", "site", "app")
_excl_cache = {"at": 0.0, "rules": [], "team_members": {}}


def _refresh_exclusions(db) -> None:
    now = _time.time()
    if now - _excl_cache["at"] < 20:
        return
    rules = list(db.usage_exclusions.find({}, {"_id": 0}))
    team_names = {(r.get("target") or "").lower() for r in rules if r.get("target_type") == "team"}
    team_members = {}
    if team_names:
        for role in db.firewall_roles.find({}, {"_id": 0, "name": 1, "members": 1}):
            name = (role.get("name") or "").lower()
            if name in team_names:
                for m in role.get("members") or []:
                    if m.get("employee_id"):
                        team_members.setdefault(m["employee_id"], set()).add(name)
    _excl_cache.update({"at": now, "rules": rules, "team_members": team_members})


def _rule_matches_person(rule: dict, employee_id: str) -> bool:
    if rule.get("target_type") == "everyone":
        return True
    if rule.get("target_type") == "person":
        return rule.get("target") == employee_id
    if rule.get("target_type") == "team":
        return (rule.get("target") or "").lower() in _excl_cache["team_members"].get(employee_id, set())
    return False


def _site_host(value: str) -> str:
    """'https://www.Pwn.College/x?y' -> 'pwn.college' (a typed website, whatever form it was typed in)."""
    v = (value or "").strip().lower()
    v = re.sub(r"^[a-z]+://", "", v)
    host = v.split("/")[0].split("?")[0].split("#")[0].strip()
    return host[4:] if host.startswith("www.") else host


def _site_matches(value: str, key: str) -> bool:
    """True when a recorded website key belongs to the excluded website.
    The whole domain counts, with any subdomain and any page path: rule 'pwn.college' covers
    'pwn.college', 'www.pwn.college', 'learn.pwn.college' and every page on them.
    A name is enough too: rule 'chatgpt.com' or 'chatgpt' matches the recorded key 'chatgpt'."""
    host = _site_host(value)
    k = (key or "").strip().lower()
    if not host or not k:
        return False
    if "." not in host:   # a bare name such as 'chatgpt' matches 'chatgpt' and 'chatgpt.com'
        return k == host or k.split(".")[0] == host
    return k == host or k.endswith("." + host) or k == host.split(".")[0]


def is_usage_excluded(employee_id: str, process: str, key: str, kind: str) -> bool:
    """True when this person's current window must not be tracked (whole screen, this site or this app)."""
    from anuvadini_detector.database import get_db
    _refresh_exclusions(get_db())
    for rule in _excl_cache["rules"]:
        if not _rule_matches_person(rule, employee_id):
            continue
        scope = rule.get("scope") or "everything"   # rules created before scopes existed = whole screen
        if scope == "everything":
            return True
        value = (rule.get("value") or "").strip().lower()
        if scope == "site" and kind == "web" and _site_matches(rule.get("value"), key):
            return True
        if scope == "app" and kind == "app" and value and value == (process or "").strip().lower():
            return True
    return False


def list_exclusions() -> list[dict]:
    from anuvadini_detector.database import get_db
    db = get_db()
    return list(db.usage_exclusions.find({}, {"_id": 0}).sort("id", 1))


def add_exclusion(target_type: str, target: str, label: str = "", scope: str = "everything",
                  value: str = "") -> tuple[bool, str]:
    from anuvadini_detector.database import get_db, get_next_sequence
    if target_type == "everyone":
        target = "all"   # every employee
    if target_type not in ("person", "team", "everyone") or not target:
        return False, "Choose a person, a team or everyone."
    if scope not in EXCLUSION_SCOPES:
        return False, "Choose what to exclude."
    value = (value or "").strip().lower()
    if scope in ("site", "app") and not value:
        return False, "Enter the website or program name."
    if scope == "everything":
        value = ""
    if scope == "site":
        value = _site_host(value) or value   # keep only the website part, e.g. 'pwn.college'
    db = get_db()
    if db.usage_exclusions.find_one({"target_type": target_type, "target": target, "scope": scope, "value": value}):
        return False, "This exclusion already exists."
    db.usage_exclusions.insert_one({
        "id": get_next_sequence("usage_exclusions"),
        "target_type": target_type,
        "target": target,
        "scope": scope,
        "value": value,
        "label": label or target,
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    })
    _excl_cache["at"] = 0.0
    return True, "Exclusion saved. Future activity matching it is not recorded; past history is kept."


def delete_exclusion(exclusion_id: int) -> bool:
    from anuvadini_detector.database import get_db
    db = get_db()
    ok = db.usage_exclusions.delete_one({"id": int(exclusion_id)}).deleted_count > 0
    _excl_cache["at"] = 0.0
    return ok


def record_usage_tick(employee_id: str, hostname: str, department: str, process: str, title: str,
                      is_idle: bool, seconds: float = 5.0) -> None:
    """Add one heartbeat's time to today's site and day-summary records."""
    if not employee_id:
        return
    from anuvadini_detector.database import get_db
    db = get_db()
    now = datetime.now()
    day = now.strftime("%Y-%m-%d")
    key, label, kind = site_key_for(process, title)
    if is_usage_excluded(employee_id, process, key, kind):
        return

    if not is_idle:
        db.usage_site_daily.update_one(
            {"date_str": day, "employee_id": employee_id, "site_key": key},
            {
                "$setOnInsert": {"date_str": day, "employee_id": employee_id, "site_key": key,
                                 "label": label, "kind": kind, "hostname": hostname,
                                 "department": department or ""},
                "$set": {"last_seen": now.strftime("%H:%M:%S")},
                "$inc": {"seconds": float(seconds)},
            },
            upsert=True,
        )

    focused = (not is_idle) and is_focused(process, title)
    inc = {
        "active_seconds": 0.0 if is_idle else float(seconds),
        "focused_seconds": float(seconds) if focused else 0.0,
        "idle_seconds": float(seconds) if is_idle else 0.0,
    }
    db.usage_day_summary.update_one(
        {"date_str": day, "employee_id": employee_id},
        {
            "$setOnInsert": {"date_str": day, "employee_id": employee_id},
            "$set": {"hostname": hostname, "department": department or ""},
            "$inc": inc,
        },
        upsert=True,
    )
    # Keep the live 'open right now' snapshot current for PCs that send only the foreground app.
    usage_live_update(employee_id, hostname, department or "",
                      {"process": process, "label": label, "kind": kind, "focused": focused},
                      is_idle, [], now)


# ---------------------------------------------------------------------------
# Reading (admin dashboard)
# ---------------------------------------------------------------------------

def _range(start: str | None, end: str | None) -> tuple[str, str]:
    today = date.today()
    end_s = end or today.strftime("%Y-%m-%d")
    start_s = start or (today - timedelta(days=6)).strftime("%Y-%m-%d")
    if start_s > end_s:
        start_s, end_s = end_s, start_s
    return start_s, end_s


def _score(day_rows: list[dict]) -> dict:
    """Active and focused hours per day, plus their share of an 8-hour work day."""
    days = len(day_rows)
    active = sum(r.get("active_seconds", 0) for r in day_rows) / 3600
    # Focused time counts only inside keyboard or mouse time recorded for the same day
    focused = sum(min(float(r.get("focused_seconds", 0) or 0), float(r.get("input_seconds", 0) or 0))
                  for r in day_rows) / 3600
    screen_on = sum(r.get("screen_on_seconds", 0) for r in day_rows) / 3600
    idle = sum(r.get("idle_seconds", 0) for r in day_rows) / 3600
    hands_on = sum(r.get("input_seconds", 0) for r in day_rows) / 3600
    firsts = [r["first_seen"] for r in day_rows if r.get("first_seen")]
    lasts = [r["last_seen"] for r in day_rows if r.get("last_seen")]
    return {
        "days_with_data": days,
        "active_hours": round(active, 2),
        "focused_hours": round(focused, 2),
        "screen_on_hours": round(screen_on, 2),
        "idle_hours": round(idle, 2),
        "hands_on_hours": round(hands_on, 2),
        "first_seen": min(firsts) if firsts else None,
        "last_seen": max(lasts) if lasts else None,
        "avg_active_hours_per_day": round(active / days, 2) if days else 0.0,
        "avg_focused_hours_per_day": round(focused / days, 2) if days else 0.0,
        "active_score_pct": round(active / (days * WORK_DAY_HOURS) * 100, 1) if days else 0.0,
        "focus_score_pct": round(focused / (days * WORK_DAY_HOURS) * 100, 1) if days else 0.0,
    }


def usage_report(employee_ids: list[str], start: str | None = None, end: str | None = None,
                 granularity: str = "day") -> dict:
    """Usage for one person or a whole team over a date range, grouped by day/week/month/year."""
    from anuvadini_detector.database import get_db
    db = get_db()
    start_s, end_s = _range(start, end)
    granularity = granularity if granularity in ("day", "week", "month", "year") else "day"

    site_rows = list(db.usage_site_daily.find(
        {"employee_id": {"$in": employee_ids}, "date_str": {"$gte": start_s, "$lte": end_s}},
        {"_id": 0}))
    day_rows = _day_rows_with_fallback(db, employee_ids, start_s, end_s, site_rows)

    # Buckets (day / week / month / year)
    grouped: dict[str, list[dict]] = {}
    for r in day_rows:
        grouped.setdefault(bucket_for(r["date_str"], granularity), []).append(r)
    buckets = []
    for label in sorted(grouped):
        rows = grouped[label]
        buckets.append({"bucket": label, **_score(rows)})

    # Unique sites / apps across the range: one row per site, with total time
    sites: dict[str, dict] = {}
    for r in site_rows:
        s = sites.setdefault(r["site_key"], {
            "site_key": r["site_key"], "label": r.get("label", r["site_key"]), "kind": r.get("kind", "app"),
            "seconds": 0.0, "days": set(),
        })
        s["seconds"] += float(r.get("seconds", 0))
        s["days"].add(r["date_str"])
    site_list = []
    for s in sites.values():
        site_list.append({
            "site_key": s["site_key"], "label": s["label"], "kind": s["kind"],
            "hours": round(s["seconds"] / 3600, 2), "minutes": round(s["seconds"] / 60, 1),
            "days_used": len(s["days"]),
        })
    site_list.sort(key=lambda x: x["hours"], reverse=True)

    return {
        "start": start_s, "end": end_s, "granularity": granularity,
        "employee_ids": employee_ids,
        "overall": _score(day_rows),
        "buckets": buckets,
        "sites": site_list,
    }


def usage_day_detail(employee_id: str, day: str) -> dict:
    """Everything one person did on one specific day."""
    from anuvadini_detector.database import get_db
    db = get_db()
    sites = list(db.usage_site_daily.find({"employee_id": employee_id, "date_str": day}, {"_id": 0}))
    summary = db.usage_day_summary.find_one({"employee_id": employee_id, "date_str": day}, {"_id": 0})
    if not summary and sites:
        summary = _derived_day_summary(day, employee_id, sites)
    summary = summary or {}
    sites.sort(key=lambda x: x.get("seconds", 0), reverse=True)
    return {
        "employee_id": employee_id,
        "date": day,
        "summary": summary,
        "score": _score([summary]) if summary else _score([]),
        "sites": [{"site_key": s["site_key"], "label": s.get("label", s["site_key"]), "kind": s.get("kind", "app"),
                   "hours": round(s.get("seconds", 0) / 3600, 2), "last_seen": s.get("last_seen", "")}
                  for s in sites],
    }


# ---------------------------------------------------------------------------
# Screen time from the PC sampler. The PC counts every app that is open (in front,
# minimised, or on a split screen) once per second and sends the totals with each
# heartbeat. The server only stores and reports them.
# ---------------------------------------------------------------------------

# Windows shell pieces are not apps the person uses (desktop, start menu, search, lock screen).
SHELL_PROCESSES = {
    "explorer.exe", "shellexperiencehost.exe", "startmenuexperiencehost.exe", "searchhost.exe",
    "searchapp.exe", "textinputhost.exe", "lockapp.exe", "sihost.exe", "dwm.exe", "taskmgr.exe",
}
REPORT_FG_LIMIT = 10
REPORT_BG_LIMIT = 40
REPORT_OPEN_LIMIT = 25
LIVE_FRESH_SECONDS = 30


def _clamp_seconds(value) -> float:
    try:
        return max(0.0, min(float(value or 0.0), 60.0))
    except (TypeError, ValueError):
        return 0.0


def _is_focused_site(kind: str, key: str, process: str) -> bool:
    if kind == "web":
        return key in PRODUCTIVE_SITE_KEYS
    from anuvadini_detector.signatures import is_productivity_process
    return bool(is_productivity_process(process or key))


def _derived_day_summary(day: str, employee_id: str, site_rows: list[dict]) -> dict:
    """Totals for a day that has no summary row, rebuilt from its per-app rows."""
    app = 0.0
    focused = 0.0
    for r in site_rows:
        secs = float(r.get("seconds", 0) or 0)
        app += secs
        if _is_focused_site(r.get("kind", "app"), r.get("site_key", ""), r.get("process") or r.get("site_key", "")):
            focused += secs
    return {"date_str": day, "employee_id": employee_id, "active_seconds": app, "app_seconds": app,
            "focused_seconds": focused, "idle_seconds": 0.0, "screen_on_seconds": 0.0,
            "input_seconds": 0.0}


def _day_rows_with_fallback(db, employee_ids: list[str], start_s: str, end_s: str, site_rows: list[dict]) -> list[dict]:
    """Day summaries; a day with app rows but no summary (an older write error) is rebuilt from those rows."""
    rows = list(db.usage_day_summary.find(
        {"employee_id": {"$in": employee_ids}, "date_str": {"$gte": start_s, "$lte": end_s}},
        {"_id": 0}))
    have = {(r.get("employee_id"), r.get("date_str")) for r in rows}
    by_day: dict[tuple, list[dict]] = {}
    for r in site_rows:
        by_day.setdefault((r.get("employee_id"), r.get("date_str")), []).append(r)
    for (emp, day), srows in by_day.items():
        if (emp, day) not in have:
            rows.append(_derived_day_summary(day, emp, srows))
    return rows


def usage_live_update(employee_id: str, hostname: str, department: str, foreground: dict | None,
                      idle: bool, open_apps: list[dict] | None = None, now: datetime | None = None,
                      hands_on: bool = False) -> None:
    """Keep the 'open right now' snapshot for one person (shown live on the People page)."""
    if not employee_id:
        return
    import time as _t
    from anuvadini_detector.database import get_db
    db = get_db()
    now = now or datetime.now()
    apps = []
    for item in (open_apps or [])[:REPORT_OPEN_LIMIT]:
        proc = str(item.get("process") or "")[:260].lower()
        if not proc or proc in SHELL_PROCESSES:
            continue
        apps.append({"process": proc, "title": _clean(str(item.get("title") or ""))[:120], "fg": bool(item.get("fg"))})
    fg = None
    if foreground:
        fg = {"process": str(foreground.get("process") or "")[:260].lower(),
              "label": str(foreground.get("label") or "")[:120],
              "kind": "web" if foreground.get("kind") == "web" else "app",
              "focused": bool(foreground.get("focused"))}
    db.usage_live.update_one(
        {"employee_id": employee_id},
        {"$set": {"employee_id": employee_id, "hostname": hostname, "department": department or "",
                  "date_str": now.strftime("%Y-%m-%d"), "updated_at": now.strftime("%H:%M:%S"),
                  "seen_at": _t.time(), "idle": bool(idle), "hands_on": bool(hands_on),
                  "foreground": fg, "open_apps": apps}},
        upsert=True,
    )


def usage_live_get(employee_id: str) -> dict:
    import time as _t
    from anuvadini_detector.database import get_db
    doc = get_db().usage_live.find_one({"employee_id": employee_id}, {"_id": 0}) or {}
    if not doc:
        return {"employee_id": employee_id, "online": False, "foreground": None, "open_apps": []}
    seen = float(doc.pop("seen_at", 0) or 0)
    doc["online"] = (_t.time() - seen) < LIVE_FRESH_SECONDS
    doc["seconds_ago"] = round(_t.time() - seen, 1) if seen else None
    return doc


def record_usage_report(employee_id: str, hostname: str, department: str, report: dict,
                        now: datetime | None = None) -> None:
    """Add one PC sampler report (sent with a heartbeat) to the person's records for today."""
    if not employee_id or not isinstance(report, dict):
        return
    from pymongo import UpdateOne
    from anuvadini_detector.database import get_db
    db = get_db()
    now = now or datetime.now()
    day = now.strftime("%Y-%m-%d")
    stamp = now.strftime("%H:%M:%S")
    dept = department or ""
    interval = _clamp_seconds(report.get("interval"))
    idle = bool(report.get("idle"))
    # Keyboard and mouse activity (seconds). Only the time is kept, never which key or where the pointer was.
    try:
        input_total = max(0.0, min(float(report.get("input_seconds") or 0.0), interval + 1.0))
    except (TypeError, ValueError):
        input_total = 0.0

    ops = []
    fg_total = 0.0
    focused_total = 0.0
    bg_total = 0.0
    fg_top = None

    # Foreground: the website or app in front. Counted whether or not the person is typing.
    for item in (report.get("fg") or [])[:REPORT_FG_LIMIT]:
        secs = _clamp_seconds(item.get("seconds"))
        if secs <= 0:
            continue
        process = str(item.get("process") or "")[:260].lower()
        key = str(item.get("key") or process or "unknown")[:120]
        kind = "web" if item.get("kind") == "web" else "app"
        if is_usage_excluded(employee_id, process, key, kind):
            continue
        focused = bool(item.get("focused"))
        fg_total += secs
        focused_total += secs if focused else 0.0
        if fg_top is None or secs >= fg_top["_secs"]:
            fg_top = {"process": process, "label": str(item.get("label") or key)[:120],
                      "kind": kind, "focused": focused, "_secs": secs}
        ops.append(UpdateOne(
            {"date_str": day, "employee_id": employee_id, "site_key": key},
            {
                "$setOnInsert": {"date_str": day, "employee_id": employee_id, "site_key": key,
                                 "label": str(item.get("label") or key)[:120], "kind": kind,
                                 "hostname": hostname, "department": dept},
                "$set": {"last_seen": stamp, "process": process},
                "$inc": {"seconds": secs, "fg_seconds": secs},
            },
            upsert=True,
        ))

    # Background: apps that are open but not in front (minimised or on a split screen).
    for process, value in list((report.get("bg") or {}).items())[:REPORT_BG_LIMIT]:
        process = str(process or "")[:260].lower()
        secs = _clamp_seconds(value)
        if not process or secs <= 0 or process in SHELL_PROCESSES or process in BROWSER_PROCESSES:
            continue
        if is_usage_excluded(employee_id, process, process, "app"):
            continue
        bg_total += secs
        ops.append(UpdateOne(
            {"date_str": day, "employee_id": employee_id, "site_key": process},
            {
                "$setOnInsert": {"date_str": day, "employee_id": employee_id, "site_key": process,
                                 "label": process, "kind": "app", "hostname": hostname, "department": dept},
                "$set": {"last_seen": stamp, "process": process},
                "$inc": {"seconds": secs, "bg_seconds": secs},
            },
            upsert=True,
        ))

    if ops:
        db.usage_site_daily.bulk_write(ops, ordered=False)

    db.usage_day_summary.update_one(
        {"date_str": day, "employee_id": employee_id},
        {
            "$setOnInsert": {"date_str": day, "employee_id": employee_id},
            "$set": {"hostname": hostname, "department": dept},
            "$min": {"first_seen": stamp},
            "$max": {"last_seen": stamp},
            "$inc": {
                "active_seconds": fg_total,
                "app_seconds": fg_total + bg_total,
                "focused_seconds": focused_total,
                "idle_seconds": interval if idle else 0.0,
                "screen_on_seconds": interval,
                "input_seconds": input_total,
            },
        },
        upsert=True,
    )

    open_apps = [{"process": x.get("process"), "title": x.get("title"), "fg": x.get("fg")}
                 for x in (report.get("open_apps") or []) if isinstance(x, dict)]
    own_fg = report.get("foreground")
    if isinstance(own_fg, dict):
        fg_public = own_fg          # the app in front at the last sample
    else:
        fg_public = {k: v for k, v in fg_top.items() if k != "_secs"} if fg_top else None
    usage_live_update(employee_id, hostname, dept, fg_public, idle, open_apps, now,
                      hands_on=input_total > 0)
