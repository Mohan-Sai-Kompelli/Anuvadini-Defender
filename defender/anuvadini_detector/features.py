"""
Anuvadini Detector - Feature access per team or per person.

"camera" is OFF by default and is switched on by the admin (per person or team).
An employee can also switch their own camera off on their PC (see camera_allowed).

The admin turns a feature on or off for a whole team or for one person. Right now the only
feature is "music" (the YouTube music bar in the employee exe).

Rules:
  * A person's own setting wins over their team's setting.
  * If a person has no setting of their own, they get the feature when any of their teams has it on.
  * Everyone (one setting for all employees) applies last, only when neither the person nor their teams decide it.
  * Nothing set = feature off.
"""
from __future__ import annotations

from datetime import datetime

FEATURES = ("music", "camera")
TARGET_TYPES = ("person", "team", "everyone")


def list_feature_access(feature: str | None = None) -> list[dict]:
    from anuvadini_detector.database import get_db
    db = get_db()
    query = {"feature": feature} if feature else {}
    return list(db.feature_access.find(query, {"_id": 0}).sort("id", 1))


def set_feature_access(feature: str, target_type: str, target: str, enabled: bool, label: str = "") -> tuple[bool, str]:
    from anuvadini_detector.database import get_db, get_next_sequence
    if feature not in FEATURES:
        return False, "Unknown feature."
    if target_type == "everyone":
        target = "all"   # one setting for every employee
    if target_type not in TARGET_TYPES or not target:
        return False, "Choose a person, a team or everyone."
    db = get_db()
    existing = db.feature_access.find_one({"feature": feature, "target_type": target_type, "target": target})
    if existing:
        db.feature_access.update_one({"_id": existing["_id"]}, {"$set": {"enabled": bool(enabled), "label": label or target}})
        return True, "Updated."
    db.feature_access.insert_one({
        "id": get_next_sequence("feature_access"),
        "feature": feature,
        "target_type": target_type,
        "target": target,
        "label": label or target,
        "enabled": bool(enabled),
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    })
    return True, "Saved."


def delete_feature_access(feature_row_id: int) -> bool:
    from anuvadini_detector.database import get_db
    return get_db().feature_access.delete_one({"id": int(feature_row_id)}).deleted_count > 0


def employee_has_feature(feature: str, employee_id: str) -> bool:
    """True when this employee may use the feature (own setting first, then their teams)."""
    if not employee_id or feature not in FEATURES:
        return False
    from anuvadini_detector.database import get_db
    db = get_db()
    rows = list(db.feature_access.find({"feature": feature}, {"_id": 0}))
    own = [r for r in rows if r.get("target_type") == "person" and r.get("target") == employee_id]
    if own:
        return bool(own[0].get("enabled"))
    team_names = {(r.get("target") or "").lower() for r in rows if r.get("target_type") == "team" and r.get("enabled")}
    if team_names:
        for role in db.firewall_roles.find({}, {"_id": 0, "name": 1, "members": 1}):
            if (role.get("name") or "").lower() in team_names:
                if any(m.get("employee_id") == employee_id for m in (role.get("members") or [])):
                    return True
    # Everyone: applies to anyone whose own or team setting does not decide it
    return any(r.get("target_type") == "everyone" and r.get("enabled") for r in rows)


def camera_allowed(employee_id: str) -> bool:
    """Camera runs only when the admin enabled it for this employee AND the employee has not switched it off."""
    if not employee_id:
        return False
    if not employee_has_feature("camera", employee_id):
        return False
    from anuvadini_detector.database import get_db
    row = get_db().kv_store.find_one({"_id": f"camera_self_off:{employee_id}"}) or {}
    return not bool(row.get("off"))

def set_camera_self_off(employee_id: str, off: bool) -> None:
    from anuvadini_detector.database import get_db
    get_db().kv_store.update_one({"_id": f"camera_self_off:{employee_id}"},
                                 {"$set": {"off": bool(off), "at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}},
                                 upsert=True)
