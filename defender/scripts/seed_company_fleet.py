"""
Seed script to import authentic company employees and workstations
into Anuvadini Detector SQLite Fleet Registry.
100% Dynamic - Zero NCISM / Ayurvedic references.
Departments are the real organizations on the platform: Anuvadini Foundation, AICTE, NETF, IUAC.
"""
import sys
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from anuvadini_detector.database import upsert_workstation, get_db

COMPANY_EMPLOYEES = [
    # Engineering Department
    {
        "hostname": "DEL-ENG-WS01",
        "employee_id": "EMP-1001",
        "username": "Rahul Sharma",
        "department": "AICTE",
        "ip_address": "192.168.1.101",
        "status": "PRODUCTIVE",
        "current_app": "Code.exe",
        "window_title": "anuvadini_detector - Visual Studio Code",
        "pid": 4120,
        "idle_seconds": 2.0,
        "is_fullscreen": 0,
        "is_controller": 0,
        "cpu_pct": 14.2,
        "ram_pct": 45.1
    },
    {
        "hostname": "DEL-ENG-WS02",
        "employee_id": "EMP-1002",
        "username": "Ananya Roy",
        "department": "AICTE",
        "ip_address": "192.168.1.102",
        "status": "PRODUCTIVE",
        "current_app": "idea64.exe",
        "window_title": "Backend Microservices - IntelliJ IDEA 2024.2",
        "pid": 5820,
        "idle_seconds": 4.0,
        "is_fullscreen": 0,
        "is_controller": 0,
        "cpu_pct": 28.4,
        "ram_pct": 62.0
    },
    {
        "hostname": "DEL-ENG-WS03",
        "employee_id": "EMP-1003",
        "username": "Rohan Mehta",
        "department": "AICTE",
        "ip_address": "192.168.1.103",
        "status": "GAMING_ALERT",
        "current_app": "chrome.exe",
        "window_title": "Chess.com - Live Blitz 3|2 Game vs Grandmaster",
        "pid": 7180,
        "idle_seconds": 1.0,
        "is_fullscreen": 0,
        "is_controller": 0,
        "cpu_pct": 19.5,
        "ram_pct": 53.0
    },
    {
        "hostname": "DEL-ENG-WS04",
        "employee_id": "EMP-1004",
        "username": "Tanvi Joshi",
        "department": "AICTE",
        "ip_address": "192.168.1.104",
        "status": "PRODUCTIVE",
        "current_app": "DockerDesktop.exe",
        "window_title": "Docker Desktop - Containers & Microservices Dashboard",
        "pid": 3210,
        "idle_seconds": 6.0,
        "is_fullscreen": 0,
        "is_controller": 0,
        "cpu_pct": 21.0,
        "ram_pct": 58.5
    },

    # DevOps & Cloud Infrastructure
    {
        "hostname": "DEL-OPS-WS01",
        "employee_id": "EMP-1005",
        "username": "Deepak Choudhury",
        "department": "AICTE",
        "ip_address": "192.168.1.111",
        "status": "PRODUCTIVE",
        "current_app": "WindowsTerminal.exe",
        "window_title": "kubectl logs -f deployment/anuvadini-gateway -n prod",
        "pid": 5890,
        "idle_seconds": 5.0,
        "is_fullscreen": 0,
        "is_controller": 0,
        "cpu_pct": 11.0,
        "ram_pct": 41.5
    },
    {
        "hostname": "DEL-OPS-WS02",
        "employee_id": "EMP-1006",
        "username": "Aditya Verma",
        "department": "AICTE",
        "ip_address": "192.168.1.112",
        "status": "PRODUCTIVE",
        "current_app": "chrome.exe",
        "window_title": "Grafana - Kubernetes Cluster Metrics & CPU Heatmap",
        "pid": 4890,
        "idle_seconds": 7.5,
        "is_fullscreen": 0,
        "is_controller": 0,
        "cpu_pct": 16.8,
        "ram_pct": 47.0
    },

    # Product Design & UX
    {
        "hostname": "DEL-DES-WS01",
        "employee_id": "EMP-1007",
        "username": "Priya Patel",
        "department": "NETF",
        "ip_address": "192.168.1.121",
        "status": "PRODUCTIVE",
        "current_app": "Figma.exe",
        "window_title": "Enterprise Design System v3.2 - Figma",
        "pid": 7821,
        "idle_seconds": 3.0,
        "is_fullscreen": 0,
        "is_controller": 0,
        "cpu_pct": 24.0,
        "ram_pct": 61.4
    },
    {
        "hostname": "DEL-DES-WS02",
        "employee_id": "EMP-1008",
        "username": "Karan Malhotra",
        "department": "NETF",
        "ip_address": "192.168.1.122",
        "status": "PRODUCTIVE",
        "current_app": "AfterFX.exe",
        "window_title": "Anuvadini_Brand_Reveal_3D.aep - Adobe After Effects",
        "pid": 12890,
        "idle_seconds": 9.0,
        "is_fullscreen": 0,
        "is_controller": 0,
        "cpu_pct": 52.0,
        "ram_pct": 78.5
    },
    {
        "hostname": "DEL-DES-WS03",
        "employee_id": "EMP-1009",
        "username": "Siddharth Nair",
        "department": "NETF",
        "ip_address": "192.168.1.123",
        "status": "GAMING_ALERT",
        "current_app": "VALORANT-Win64-Shipping.exe",
        "window_title": "VALORANT - Competitive Matchmaking",
        "pid": 8924,
        "idle_seconds": 0.5,
        "is_fullscreen": 1,
        "is_controller": 0,
        "cpu_pct": 74.8,
        "ram_pct": 82.0
    },

    # QA & Automated Testing
    {
        "hostname": "DEL-QA-WS01",
        "employee_id": "EMP-1010",
        "username": "Pooja Reddy",
        "department": "NETF",
        "ip_address": "192.168.1.131",
        "status": "PRODUCTIVE",
        "current_app": "Postman.exe",
        "window_title": "Anuvadini API Test Automation Suite - Postman",
        "pid": 4721,
        "idle_seconds": 12.0,
        "is_fullscreen": 0,
        "is_controller": 0,
        "cpu_pct": 17.2,
        "ram_pct": 51.0
    },
    {
        "hostname": "DEL-QA-WS02",
        "employee_id": "EMP-1011",
        "username": "Neha Gupta",
        "department": "NETF",
        "ip_address": "192.168.1.132",
        "status": "IDLE",
        "current_app": "chrome.exe",
        "window_title": "Jira - Sprint 42 Automation Regression Backlog",
        "pid": 3310,
        "idle_seconds": 480.0,
        "is_fullscreen": 0,
        "is_controller": 0,
        "cpu_pct": 3.5,
        "ram_pct": 34.0
    },

    # Marketing & Growth
    {
        "hostname": "DEL-MKT-WS01",
        "employee_id": "EMP-1012",
        "username": "Sneha Gupta",
        "department": "IUAC",
        "ip_address": "192.168.1.141",
        "status": "PRODUCTIVE",
        "current_app": "chrome.exe",
        "window_title": "Google Analytics 4 - Enterprise User Funnel",
        "pid": 6214,
        "idle_seconds": 8.0,
        "is_fullscreen": 0,
        "is_controller": 0,
        "cpu_pct": 15.5,
        "ram_pct": 48.0
    },
    {
        "hostname": "DEL-MKT-WS02",
        "employee_id": "EMP-1013",
        "username": "Divya Krishnan",
        "department": "IUAC",
        "ip_address": "192.168.1.142",
        "status": "PRODUCTIVE",
        "current_app": "Notion.exe",
        "window_title": "Q4 Product Launch Content Calendar - Notion",
        "pid": 8110,
        "idle_seconds": 14.0,
        "is_fullscreen": 0,
        "is_controller": 0,
        "cpu_pct": 9.5,
        "ram_pct": 42.0
    },

    # Sales & Accounts
    {
        "hostname": "DEL-SAL-WS01",
        "employee_id": "EMP-1014",
        "username": "Arjun Verma",
        "department": "IUAC",
        "ip_address": "192.168.1.151",
        "status": "GAMING_ALERT",
        "current_app": "msedge.exe",
        "window_title": "Play Subway Surfers Online - Poki Games",
        "pid": 5512,
        "idle_seconds": 0.5,
        "is_fullscreen": 0,
        "is_controller": 1,
        "cpu_pct": 29.5,
        "ram_pct": 54.0
    },
    {
        "hostname": "DEL-SAL-WS02",
        "employee_id": "EMP-1015",
        "username": "Amit Saxena",
        "department": "IUAC",
        "ip_address": "192.168.1.152",
        "status": "IDLE",
        "current_app": "Salesforce.exe",
        "window_title": "Salesforce CRM - Enterprise Pipeline Review",
        "pid": 6012,
        "idle_seconds": 620.0,
        "is_fullscreen": 0,
        "is_controller": 0,
        "cpu_pct": 4.0,
        "ram_pct": 33.5
    },

    # Human Resources & People Operations
    {
        "hostname": "DEL-HR-WS01",
        "employee_id": "EMP-1016",
        "username": "Meera Nambiar",
        "department": "Anuvadini Foundation",
        "ip_address": "192.168.1.161",
        "status": "PRODUCTIVE",
        "current_app": "EXCEL.exe",
        "window_title": "Q4_Employee_Performance_Appraisal_Matrix.xlsx - Excel",
        "pid": 2984,
        "idle_seconds": 18.0,
        "is_fullscreen": 0,
        "is_controller": 0,
        "cpu_pct": 8.8,
        "ram_pct": 39.0
    }
]

def seed():
    db = get_db()
    # Clean previous workstations from MongoDB
    db.workstations.delete_many({})

    for ws in COMPANY_EMPLOYEES:
        upsert_workstation(
            hostname=ws["hostname"],
            username=ws["username"],
            department=ws["department"],
            ip_address=ws["ip_address"],
            status=ws["status"],
            current_app=ws["current_app"],
            window_title=ws["window_title"],
            pid=ws["pid"],
            idle_seconds=ws["idle_seconds"],
            is_fullscreen=bool(ws["is_fullscreen"]),
            is_controller=bool(ws["is_controller"]),
            cpu_pct=ws["cpu_pct"],
            ram_pct=ws["ram_pct"],
            employee_id=ws["employee_id"]
        )
    print(f"Successfully seeded {len(COMPANY_EMPLOYEES)} modern corporate workstations.")

if __name__ == "__main__":
    seed()
