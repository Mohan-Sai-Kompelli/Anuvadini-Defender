"""
Anuvadini Detector - In-Dashboard Workplace Incident Alert System
Handles real-time security alerts inside the Admin Console Dashboard:
- Captures violation metadata (Employee ID, Name, Department, Game Name, PID, Severity, Timestamp)
- Stores unread alerts in MongoDB `admin_notifications`
- Broadcasts real-time alert events to active Dashboard WebSocket sessions
"""

from datetime import datetime
from anuvadini_detector.database import (
    add_admin_notification,
    get_admin_notifications,
    mark_notifications_read,
    clear_admin_notifications,
    get_workstation_detail
)

_ws_broadcaster = None

def register_broadcaster(broadcaster_func):
    """Registers an async or sync callback to broadcast notifications over WebSockets."""
    global _ws_broadcaster
    _ws_broadcaster = broadcaster_func

def dispatch_incident_notification(violation_data: dict) -> dict:
    """
    Central dispatcher called when an employee launches a prohibited game or attempts bypass.
    Saves in MongoDB and pushes to the Admin Dashboard Notification Center.
    """
    hostname = violation_data.get("hostname", "")
    emp_info = {}
    if hostname:
        emp_info = get_workstation_detail(hostname) or {}

    employee_id = violation_data.get("employee_id") or emp_info.get("employee_id") or "EMP-1001"
    username = violation_data.get("username") or emp_info.get("employee_name") or emp_info.get("username") or "Employee"
    department = violation_data.get("department") or emp_info.get("department") or "Operations"

    doc = add_admin_notification(
        employee_id=employee_id,
        username=username,
        hostname=hostname or emp_info.get("hostname", "DESKTOP-WS"),
        department=department,
        game_name=violation_data.get("game_name", "Unauthorized App"),
        category=violation_data.get("category", "Gaming"),
        process_name=violation_data.get("process_name", ""),
        pid=violation_data.get("pid", 0),
        severity=violation_data.get("severity", "HIGH"),
        details=violation_data.get("details", f"Caught running {violation_data.get('game_name', 'prohibited game')} during office shift"),
        window_title=violation_data.get("window_title", "")
    )

    # Broadcast to dashboard WebSocket sessions
    if _ws_broadcaster and callable(_ws_broadcaster):
        try:
            _ws_broadcaster({
                "type": "new_incident_alert",
                "notification": doc
            })
        except Exception as e:
            print(f"[Notifier Broadcast Error]: {e}")

    return doc

# Alias for backwards compatibility with any engine callers
send_violation_webhook = dispatch_incident_notification

