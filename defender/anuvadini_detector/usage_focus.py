"""
Focus rules: the admin picks apps or websites for a person, a team or everyone, and sees the time spent in them
over a period. Shown in Usage history, next to the keyboard-and-mouse focused time (which is not changed here).

Server side only: the PC program is not involved.
"""
from __future__ import annotations

from datetime import datetime

from anuvadini_detector.usage import _range, _site_matches

FOCUS_TARGETS = ("person", "team", "everyone")
MAX_APPS_PER_RULE = 50
MAX_ENTRY_CHARS = 120


def _text(value) -> str:
    return "" if value is None else str(value)


def clean_apps(items) -> list[str]:
    """Lower-case, de-duplicated entries: a program name (excel.exe) or a website (pwn.college)."""
    out: list[str] = []
    for raw in items or []:
        entry = _text(raw).strip().lower()[:MAX_ENTRY_CHARS]
        if entry and entry not in out:
            out.append(entry)
    return out[:MAX_APPS_PER_RULE]


def entry_matches(entry: str, row: dict) -> bool:
    """True when one recorded app or website (a usage row) is the one this entry names."""
    e = (entry or "").strip().lower()
    if not e:
        return False
    key = _text(row.get("site_key")).lower()
    label = _text(row.get("label")).lower()
    if _text(row.get("kind")) == "web":
        # a website: the whole domain counts, with any subdomain and page (same rule as the exclusions)
        return _site_matches(e, key) or (bool(label) and _site_matches(e, label))
    # a program: its name, exactly
    return e in (key, _text(row.get("process")).lower(), label)


def list_focus_rules() -> list[dict]:
    from anuvadini_detector.database import get_db
    return list(get_db().usage_focus_rules.find({}, {"_id": 0}).sort("id", 1))


def add_focus_rule(target_type: str, target: str, label: str, apps) -> tuple[bool, str]:
    from anuvadini_detector.database import get_db, get_next_sequence
    if target_type not in FOCUS_TARGETS:
        return False, "Choose a person, a team or everyone."
    if target_type == "everyone":
        target = "all"
    target = (target or "").strip()
    if not target:
        return False, "Choose a person or a team."
    entries = clean_apps(apps)
    if not entries:
        return False, "Enter at least one app or website."
    db = get_db()
    db.usage_focus_rules.insert_one({
        "id": get_next_sequence("usage_focus_rules"),
        "target_type": target_type,
        "target": target,
        "label": (label or target)[:120],
        "apps": entries,
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    })
    return True, "Saved."


def delete_focus_rule(rule_id: int) -> bool:
    from anuvadini_detector.database import get_db
    return get_db().usage_focus_rules.delete_one({"id": int(rule_id)}).deleted_count > 0


def focus_rules_report(start: str | None, end: str | None) -> dict:
    """Time spent in each rule's apps and websites, for the people the rule covers, over the period."""
    from anuvadini_detector.database import get_db
    from anuvadini_detector.usage_export import _members
    db = get_db()
    start_s, end_s = _range(start, end)
    out = []
    for rule in list_focus_rules():
        try:
            _label, members = _members(rule.get("target_type", ""), rule.get("target", ""))
        except Exception:
            members = []
        names = {m["employee_id"]: m["name"] for m in members}
        ids = list(names)
        per_person: dict[str, float] = {}
        per_app: dict[str, float] = {}
        if ids:
            rows = db.usage_site_daily.find(
                {"employee_id": {"$in": ids}, "date_str": {"$gte": start_s, "$lte": end_s}}, {"_id": 0})
            for row in rows:
                if not any(entry_matches(e, row) for e in rule.get("apps", [])):
                    continue
                secs = float(row.get("seconds") or 0)
                emp = str(row.get("employee_id"))
                per_person[emp] = per_person.get(emp, 0.0) + secs
                app = _text(row.get("label")) or _text(row.get("site_key"))
                per_app[app] = per_app.get(app, 0.0) + secs
        out.append({
            "id": rule.get("id"),
            "label": rule.get("label") or rule.get("target"),
            "target_type": rule.get("target_type"),
            "target": rule.get("target"),
            "apps": rule.get("apps", []),
            "hours": round(sum(per_person.values()) / 3600, 2),
            "people": sorted(
                [{"employee_id": e, "name": names.get(e, e), "hours": round(s / 3600, 2)} for e, s in per_person.items()],
                key=lambda p: p["hours"], reverse=True),
            "apps_breakdown": sorted(
                [{"app": a, "hours": round(s / 3600, 2)} for a, s in per_app.items()],
                key=lambda a: a["hours"], reverse=True)[:10],
        })
    return {"start": start_s, "end": end_s, "rules": out}
