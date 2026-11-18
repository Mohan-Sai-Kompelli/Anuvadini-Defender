"""
People & teams downloads: CSV files (one row per person per day, one row per app or website, one row per
incident) and a PDF report, for one person, one team, or everyone, over a date range.

They use the same stored data as the People & teams page. Server side only: the PC agent does not use this module.
"""
from __future__ import annotations

import csv
import io
import re
from collections import defaultdict
from datetime import date, datetime
from xml.sax.saxutils import escape

from anuvadini_detector.usage import WORK_DAY_HOURS, _day_rows_with_fallback, _score

EXPORT_SCOPES = ("person", "team", "everyone")
EXPORT_KINDS = ("csv", "apps_csv", "incidents_csv", "pdf")
MAX_DAYS = 370                 # a whole year, plus a little
PDF_APP_LIMIT = 30
PDF_INCIDENT_LIMIT = 200
CHART_MAX_DAYS = 62
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

DAY_HEADER = ["Employee ID", "Name", "Department", "Teams", "Date", "Screen time (hours)", "Focused time (hours)",
              "Hands-on time (hours)", "Idle time (hours)", "Active score (%)", "Focus score (%)",
              "First seen", "Last seen", "Incidents", "Top apps and sites"]
APP_HEADER = ["Employee ID", "Name", "Department", "Teams", "App or website", "Type", "Hours", "Minutes", "Days used"]
INCIDENT_HEADER = ["Date", "Time", "Employee ID", "Name", "PC", "Category", "Detected", "Severity", "Window title"]


class ExportError(ValueError):
    """A bad request. The message is shown to the admin as it is."""


class ExportNotFound(ExportError):
    pass


class PdfUnavailable(RuntimeError):
    pass


def _text(value) -> str:
    return "" if value is None else str(value)


def _hours(seconds) -> float:
    try:
        return round(float(seconds or 0) / 3600, 2)
    except (TypeError, ValueError):
        return 0.0


def _csv_safe(value) -> str:
    """A cell that starts with = + - or @ could run as a formula in Excel. Prefix it so it stays plain text."""
    s = _text(value)
    return "'" + s if s[:1] in ("=", "+", "-", "@") else s


def _clock(stamp: str) -> str:
    """'2026-11-17 09:05:00' -> '09:05'."""
    s = _text(stamp)
    return s[11:16] if len(s) >= 16 else s


def _teams_by_employee() -> dict[str, list[str]]:
    from anuvadini_detector.database import get_firewall_roles
    teams: dict[str, list[str]] = defaultdict(list)
    for role in get_firewall_roles():
        for m in role.get("members") or []:
            if m.get("employee_id"):
                teams[str(m["employee_id"])].append(role.get("name") or "")
    return teams


def _member(emp_id: str, name, department, teams: dict[str, list[str]]) -> dict:
    return {
        "employee_id": emp_id,
        "name": _text(name) or emp_id,
        "department": _text(department),
        "teams": ", ".join(sorted({t for t in teams.get(emp_id, []) if t})),
    }


def _members(scope: str, target: str) -> tuple[str, list[dict]]:
    """The label for the file name and the people it covers."""
    from anuvadini_detector.database import get_firewall_people, get_firewall_roles
    teams = _teams_by_employee()
    if scope == "everyone":
        return "Everyone", [_member(str(p["employee_id"]), p.get("name"), p.get("department"), teams)
                            for p in get_firewall_people() if p.get("employee_id")]
    if scope == "person":
        found = next((p for p in get_firewall_people() if str(p.get("employee_id")) == target), None) or {}
        return _text(found.get("name")) or target, [_member(target, found.get("name"), found.get("department"), teams)]
    wanted = target.strip().lower()
    for role in get_firewall_roles():
        if (role.get("name") or "").lower() == wanted:
            members = [_member(str(m["employee_id"]), m.get("name"), m.get("department"), teams)
                       for m in role.get("members") or [] if m.get("employee_id")]
            return _text(role.get("name")) or target, members
    raise ExportNotFound("That team was not found.")


def collect(scope: str, target: str, start_s: str, end_s: str) -> dict:
    """Everything the downloads need for one scope and date range (dates are YYYY-MM-DD, inclusive)."""
    from anuvadini_detector.database import get_db
    db = get_db()
    label, members = _members(scope, target)
    by_id = {m["employee_id"]: m for m in members}
    ids = list(by_id)

    site_rows: list[dict] = []
    day_rows: list[dict] = []
    real_days: set = set()   # (employee, day) with a stored daily summary
    if ids:
        site_rows = list(db.usage_site_daily.find(
            {"employee_id": {"$in": ids}, "date_str": {"$gte": start_s, "$lte": end_s}}, {"_id": 0}))
        day_rows = _day_rows_with_fallback(db, ids, start_s, end_s, site_rows)
        real_days = {(str(d.get("employee_id")), d.get("date_str")) for d in db.usage_day_summary.find(
            {"employee_id": {"$in": ids}, "date_str": {"$gte": start_s, "$lte": end_s}},
            {"_id": 0, "employee_id": 1, "date_str": 1})}

    # Incidents: by the PCs the members use. With no PC on record, by their name (the same rule the page uses).
    host_to_emp: dict[str, str] = {}
    for w in db.workstations.find({}, {"_id": 0, "employee_id": 1, "hostname": 1}):
        emp = str(w.get("employee_id") or "")
        if emp in by_id and w.get("hostname"):
            host_to_emp[w["hostname"]] = emp
    name_to_emp = {m["name"]: m["employee_id"] for m in members}
    incidents: list[tuple[str, dict]] = []
    if ids:
        for v in db.violations.find({"date_str": {"$gte": start_s, "$lte": end_s}}, {"_id": 0}).sort("id", -1):
            emp = host_to_emp.get(v.get("hostname")) if host_to_emp else name_to_emp.get(v.get("username"))
            if emp:
                incidents.append((emp, v))

    incidents_by_emp: dict[str, int] = defaultdict(int)
    incidents_by_day: dict[tuple, int] = defaultdict(int)
    incident_rows = []
    for emp, v in incidents:
        stamp = _text(v.get("timestamp"))
        day = _text(v.get("date_str")) or stamp[:10]
        incidents_by_emp[emp] += 1
        incidents_by_day[(emp, day)] += 1
        incident_rows.append({
            "date": day, "time": stamp[11:19], "employee_id": emp, "name": by_id[emp]["name"],
            "pc": _text(v.get("hostname")), "category": _text(v.get("category")),
            "detected": _text(v.get("game_name")) or _text(v.get("process_name")),
            "severity": _text(v.get("severity")), "window_title": _text(v.get("window_title")),
        })

    # One row per person per day
    apps_by_day: dict[tuple, list[dict]] = defaultdict(list)
    for r in site_rows:
        apps_by_day[(str(r.get("employee_id")), r.get("date_str"))].append(r)
    daily = []
    for r in day_rows:
        emp = str(r.get("employee_id"))
        if emp not in by_id:
            continue
        day = _text(r.get("date_str"))
        m = by_id[emp]
        measured = (emp, day) in real_days
        apps = sorted(apps_by_day.get((emp, day), []), key=lambda a: float(a.get("seconds") or 0), reverse=True)
        active = float(r.get("active_seconds") or 0) / 3600
        focused = min(float(r.get("focused_seconds") or 0), float(r.get("input_seconds") or 0)) / 3600
        daily.append({
            "employee_id": emp, "name": m["name"], "department": m["department"], "teams": m["teams"],
            "date": day,
            "derived": not measured,
            "idle_recorded": measured and r.get("idle_seconds") is not None,
            "hands_on_recorded": measured and r.get("input_seconds") is not None,
            "screen_hours": round(active, 2),
            "focused_hours": round(focused, 2),
            "hands_on_hours": _hours(r.get("input_seconds")),
            "idle_hours": _hours(r.get("idle_seconds")),
            "active_score_pct": round(active / WORK_DAY_HOURS * 100, 1),
            "focus_score_pct": round(focused / WORK_DAY_HOURS * 100, 1),
            "first_seen": _text(r.get("first_seen")),
            "last_seen": _text(r.get("last_seen")),
            "incidents": incidents_by_day.get((emp, day), 0),
            "top_apps": "; ".join(f"{_text(a.get('label') or a.get('site_key'))} {_hours(a.get('seconds'))}h"
                                  for a in apps[:3]),
        })
    daily.sort(key=lambda d: (d["name"].lower(), d["employee_id"], d["date"]))

    # One row per person with their totals (for a team or everyone: only people with something to show)
    days_by_emp: dict[str, list[dict]] = defaultdict(list)
    for r in day_rows:
        days_by_emp[str(r.get("employee_id"))].append(r)
    summary = []
    for m in members:
        emp = m["employee_id"]
        rows = days_by_emp.get(emp, [])
        if scope != "person" and not rows and not incidents_by_emp.get(emp):
            continue
        s = _score(rows)
        summary.append({
            "employee_id": emp, "name": m["name"], "department": m["department"], "teams": m["teams"],
            "screen_hours": s["active_hours"], "focused_hours": s["focused_hours"],
            "hands_on_hours": s["hands_on_hours"], "idle_hours": s["idle_hours"],
            "active_score_pct": s["active_score_pct"], "focus_score_pct": s["focus_score_pct"],
            "days_with_data": s["days_with_data"], "incidents": incidents_by_emp.get(emp, 0),
            "hands_on_recorded": any((emp, _text(r.get("date_str"))) in real_days and r.get("input_seconds") is not None
                                     for r in rows),
        })
    summary.sort(key=lambda x: x["name"].lower())

    # Apps and websites: per person, and across the group
    per_person: dict[tuple, dict] = {}
    group: dict[str, dict] = {}
    for r in site_rows:
        emp = str(r.get("employee_id"))
        key = _text(r.get("site_key"))
        app = _text(r.get("label")) or key
        kind = "Website" if _text(r.get("kind")) == "web" else "App"
        secs = float(r.get("seconds") or 0)
        p = per_person.setdefault((emp, key), {"m": by_id.get(emp, {}), "app": app, "type": kind,
                                               "seconds": 0.0, "days": set()})
        p["seconds"] += secs
        p["days"].add(r.get("date_str"))
        g = group.setdefault(key, {"app": app, "type": kind, "seconds": 0.0, "people": set(), "days": set()})
        g["seconds"] += secs
        g["people"].add(emp)
        g["days"].add(r.get("date_str"))
    apps = []
    for (emp, _key), p in per_person.items():
        m = p["m"] or {"name": emp, "department": "", "teams": ""}
        apps.append({"employee_id": emp, "name": m["name"], "department": m["department"], "teams": m["teams"],
                     "app": p["app"], "type": p["type"], "hours": _hours(p["seconds"]),
                     "minutes": round(p["seconds"] / 60, 1), "days_used": len(p["days"])})
    apps.sort(key=lambda a: (a["name"].lower(), -a["hours"]))
    group_apps = [{"app": g["app"], "type": g["type"], "hours": _hours(g["seconds"]),
                   "people": len(g["people"]), "days_used": len(g["days"])}
                  for g in sorted(group.values(), key=lambda g: g["seconds"], reverse=True)]

    return {
        "scope": scope, "label": label, "start": start_s, "end": end_s,
        "generated": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "summary": summary, "daily": daily, "apps": apps, "group_apps": group_apps,
        "incidents": incident_rows,
    }


# ----------------------------------------------------------------------------- CSV

def _csv_bytes(header: list[str], rows: list[list]) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(header)
    writer.writerows(rows)
    # UTF-8 with a byte-order mark, so Excel shows names and accents correctly
    return buf.getvalue().encode("utf-8-sig")


def days_csv(data: dict) -> bytes:
    rows = [[_csv_safe(d["employee_id"]), _csv_safe(d["name"]), _csv_safe(d["department"]), _csv_safe(d["teams"]),
             d["date"], d["screen_hours"], d["focused_hours"], d["hands_on_hours"], d["idle_hours"],
             d["active_score_pct"], d["focus_score_pct"], _csv_safe(d["first_seen"]), _csv_safe(d["last_seen"]),
             d["incidents"], _csv_safe(d["top_apps"])] for d in data["daily"]]
    return _csv_bytes(DAY_HEADER, rows)


def apps_csv(data: dict) -> bytes:
    rows = [[_csv_safe(a["employee_id"]), _csv_safe(a["name"]), _csv_safe(a["department"]), _csv_safe(a["teams"]),
             _csv_safe(a["app"]), a["type"], a["hours"], a["minutes"], a["days_used"]] for a in data["apps"]]
    return _csv_bytes(APP_HEADER, rows)


def incidents_csv(data: dict) -> bytes:
    rows = [[i["date"], i["time"], _csv_safe(i["employee_id"]), _csv_safe(i["name"]), _csv_safe(i["pc"]),
             _csv_safe(i["category"]), _csv_safe(i["detected"]), _csv_safe(i["severity"]),
             _csv_safe(i["window_title"])] for i in data["incidents"]]
    return _csv_bytes(INCIDENT_HEADER, rows)


# ----------------------------------------------------------------------------- PDF

def _pdf_text(value) -> str:
    """Text the PDF's built-in font can draw. Symbols and emoji are left out (they showed as black boxes);
    letters the font cannot draw (most non-Latin scripts) show as '?', so nothing is silently dropped."""
    import unicodedata
    out = []
    for ch in _text(value):
        try:
            ch.encode("cp1252")
            out.append(ch)
            continue
        except UnicodeEncodeError:
            pass
        cat = unicodedata.category(ch)[0]
        out.append("" if cat in "SCM" else (" " if cat == "Z" else "?"))
    return re.sub(r" {2,}", " ", "".join(out)).strip()

def pdf_bytes(data: dict) -> bytes:
    try:
        from reportlab.graphics.charts.barcharts import VerticalBarChart
        from reportlab.graphics.shapes import Drawing
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    except ImportError as exc:
        raise PdfUnavailable("The PDF needs the reportlab package on the server. Ask for it to be installed, then try again.") from exc

    page = landscape(A4)
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=page, leftMargin=14 * mm, rightMargin=14 * mm,
                            topMargin=14 * mm, bottomMargin=14 * mm,
                            title="People and teams usage report", author="Anuvadini Defender")
    base = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=base["Title"], fontSize=18, leading=22, alignment=0, spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=base["Heading2"], fontSize=12, leading=15, spaceBefore=10, spaceAfter=4,
                        textColor=colors.HexColor("#1e293b"), keepWithNext=1)   # a heading stays with its table
    meta = ParagraphStyle("meta", parent=base["Normal"], fontSize=9, leading=12, textColor=colors.HexColor("#475569"))
    cell = ParagraphStyle("cell", parent=base["Normal"], fontSize=7.5, leading=9)
    head = ParagraphStyle("head", parent=cell, fontName="Helvetica-Bold", textColor=colors.white)
    note = ParagraphStyle("note", parent=meta, fontSize=8, leading=10)

    def table(header: list[str], rows: list[list], widths_mm: list[float]) -> Table:
        grid = [[Paragraph(escape(_pdf_text(h)), head) for h in header]]
        grid += [[Paragraph(escape(_pdf_text(c)), cell) for c in row] for row in rows]
        t = Table(grid, colWidths=[w * mm for w in widths_mm], repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a8a")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ]))
        return t

    def chart(daily: list[dict]) -> Drawing:
        values = [d["screen_hours"] for d in daily]
        drawing = Drawing(760, 175)
        bc = VerticalBarChart()
        bc.x, bc.y, bc.width, bc.height = 40, 30, 690, 125
        bc.data = [values]
        step = max(1, -(-len(daily) // 20))   # label about 20 days at most
        bc.categoryAxis.categoryNames = [d["date"][5:] if i % step == 0 else "" for i, d in enumerate(daily)]
        bc.categoryAxis.labels.fontSize = 6
        bc.valueAxis.valueMin = 0
        bc.valueAxis.valueMax = max(1.0, max(values) * 1.15)
        bc.valueAxis.labels.fontSize = 7
        bc.bars[0].fillColor = colors.HexColor("#2563eb")
        drawing.add(bc)
        return drawing

    scope_name = {"person": "Person", "team": "Team"}.get(data["scope"], "")
    who = _pdf_text(f"{scope_name}: {data['label']}" if scope_name else data["label"])
    story = [
        Paragraph("People &amp; teams usage report", h1),
        Paragraph(escape(f"{who}   |   Period: {data['start']} to {data['end']}"
                         f"   |   Generated {data['generated']}"), meta),
        Paragraph("Summary", h2),
    ]
    if data["summary"]:
        rows = [[s["name"], s["employee_id"], s["department"], s["teams"] or "-", f"{s['screen_hours']:.2f}",
                 f"{s['focused_hours']:.2f}", f"{s['hands_on_hours']:.2f}" if s["hands_on_recorded"] else "not recorded",
                 f"{s['active_score_pct']:.1f}%",
                 f"{s['focus_score_pct']:.1f}%", s["days_with_data"], s["incidents"]] for s in data["summary"]]
        story.append(table(["Name", "Employee ID", "Department", "Teams", "Screen time (h)", "Focused (h)",
                            "Hands-on (h)", "Active score", "Focus score", "Days with data", "Incidents"],
                           rows, [38, 22, 28, 40, 22, 20, 21, 19, 19, 19, 18]))
    else:
        story.append(Paragraph("No usage was recorded in this period.", note))
    story.append(Spacer(1, 3))
    story.append(Paragraph(escape(
        "Time counts every app or process open on the PC, including background system processes. "
        "A day marked * was rebuilt from app records because no daily summary was stored: for that day, "
        "idle time, hands-on time and first and last seen are not recorded. "
        "'Not recorded' means no value was stored for that day."), note))

    if data["scope"] == "person" and data["daily"] and len(data["daily"]) <= CHART_MAX_DAYS:
        story.append(Paragraph("Screen time by day (hours)", h2))
        story.append(chart(data["daily"]))

    if data["scope"] == "person":
        story.append(Paragraph("Day by day", h2))
        if data["daily"]:
            rows = [[d["date"] + (" *" if d["derived"] else ""), f"{d['screen_hours']:.2f}", f"{d['focused_hours']:.2f}",
                     f"{d['hands_on_hours']:.2f}" if d["hands_on_recorded"] else "not recorded",
                     f"{d['idle_hours']:.2f}" if d["idle_recorded"] else "not recorded",
                     f"{d['active_score_pct']:.1f}%",
                     _clock(d["first_seen"]) if (d["first_seen"] and not d["derived"]) else "not recorded",
                     _clock(d["last_seen"]) if (d["last_seen"] and not d["derived"]) else "not recorded",
                     d["incidents"], d["top_apps"]] for d in data["daily"]]
            story.append(table(["Date", "Screen time (h)", "Focused (h)", "Hands-on (h)", "Idle (h)", "Active score",
                                "First seen", "Last seen", "Incidents", "Top apps and sites"],
                               rows, [24, 22, 22, 22, 20, 22, 20, 20, 18, 79]))
        else:
            story.append(Paragraph("No usage was recorded in this period.", note))
    else:
        story.append(Paragraph("The day-by-day detail for a team or everyone is in the CSV download "
                               "(Download CSV, days).", note))

    story.append(Paragraph("Apps and websites (all time in the period)", h2))
    if data["group_apps"]:
        rows = [[g["app"], g["type"], f"{g['hours']:.2f}", g["people"], g["days_used"]]
                for g in data["group_apps"][:PDF_APP_LIMIT]]
        story.append(table(["App or website", "Type", "Hours", "People", "Days used"], rows, [121, 40, 40, 34, 34]))
        if len(data["group_apps"]) > PDF_APP_LIMIT:
            story.append(Paragraph(f"Top {PDF_APP_LIMIT} of {len(data['group_apps'])} shown. "
                                   "The full list is in the CSV download (Download CSV, apps).", note))
    else:
        story.append(Paragraph("No apps or websites were recorded in this period.", note))

    story.append(Spacer(1, 4))
    story.append(Paragraph(f"Incidents ({len(data['incidents'])})", h2))
    if data["incidents"]:
        rows = [[i["date"], i["time"], i["name"], i["pc"], i["category"], i["detected"], i["severity"]]
                for i in data["incidents"][:PDF_INCIDENT_LIMIT]]
        story.append(table(["Date", "Time", "Employee", "PC", "Category", "Detected", "Severity"], rows,
                           [22, 18, 50, 50, 42, 60, 27]))
        if len(data["incidents"]) > PDF_INCIDENT_LIMIT:
            story.append(Paragraph(f"First {PDF_INCIDENT_LIMIT} of {len(data['incidents'])} shown. "
                                   "The full list is in the CSV download (Download CSV, incidents).", note))
    else:
        story.append(Paragraph("No incidents in this period.", note))

    def footer(canvas, document):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(colors.HexColor("#64748b"))
        canvas.drawString(14 * mm, 8 * mm, "Anuvadini Defender - People and teams usage report")
        canvas.drawRightString(page[0] - 14 * mm, 8 * mm, f"Page {document.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()


# ----------------------------------------------------------------------------- entry point

def export_file(scope: str, target: str, start: str, end: str, kind: str) -> tuple[bytes, str, str]:
    """Returns (file bytes, file name, media type). Raises ExportError for a bad request."""
    scope = (scope or "").strip().lower()
    kind = (kind or "").strip().lower()
    target = (target or "").strip()[:120]
    if scope not in EXPORT_SCOPES:
        raise ExportError("Choose a person, a team or everyone.")
    if kind not in EXPORT_KINDS:
        raise ExportError("Choose CSV (days), CSV (apps), CSV (incidents) or PDF.")
    if scope != "everyone" and not target:
        raise ExportError("Choose a person or a team.")
    if not (DATE_RE.match(start or "") and DATE_RE.match(end or "")):
        raise ExportError("Choose a start and an end date.")
    try:
        d1, d2 = date.fromisoformat(start), date.fromisoformat(end)
    except ValueError as exc:
        raise ExportError("Those dates are not valid.") from exc
    if d1 > d2:
        d1, d2 = d2, d1
    if (d2 - d1).days + 1 > MAX_DAYS:
        raise ExportError(f"Choose a period of up to {MAX_DAYS} days.")
    start_s, end_s = d1.isoformat(), d2.isoformat()

    data = collect(scope, target, start_s, end_s)
    slug = re.sub(r"[^A-Za-z0-9]+", "_", data["label"]).strip("_")[:40] or scope
    part = {"csv": "days", "apps_csv": "apps", "incidents_csv": "incidents", "pdf": "report"}[kind]
    stem = f"anuvadini_{part}_{scope}_{slug}_{start_s}_to_{end_s}"
    if kind == "csv":
        return days_csv(data), stem + ".csv", "text/csv; charset=utf-8"
    if kind == "apps_csv":
        return apps_csv(data), stem + ".csv", "text/csv; charset=utf-8"
    if kind == "incidents_csv":
        return incidents_csv(data), stem + ".csv", "text/csv; charset=utf-8"
    return pdf_bytes(data), stem + ".pdf", "application/pdf"
