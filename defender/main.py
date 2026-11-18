"""
Anuvadini Detector - Main Application Entrypoint
Starts the Workplace Gaming Detection Engine and Web Dashboard.
"""
import os
import sys
import uvicorn
import webbrowser
import threading
import time
from anuvadini_detector.config import SERVER_HOST, SERVER_PORT

def open_browser():
    time.sleep(1.2)
    url = f"http://{SERVER_HOST}:{SERVER_PORT}"
    print(f"\n[Anuvadini Detector] Opening Web Dashboard at: {url}")
    webbrowser.open(url)

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if sys.platform == "win32":
        import asyncio
        try:
            asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        except Exception:
            pass
    print("=" * 65)
    print("     ANUVADINI DETECTOR - WORKPLACE SHIELD v2.0")
    print("     Passive monitoring server (engine off by default)")
    print("=" * 65)
    print(f"[*] Engine API: http://{SERVER_HOST}:{SERVER_PORT}")
    print("[*] Status: STARTING (detection engine disabled - low resource mode)")

    # Open browser in a background thread

    # Launch Uvicorn ASGI Server
    uvicorn.run(
        "anuvadini_detector.server:app",
        host=SERVER_HOST,
        port=SERVER_PORT,
        log_level="info",
        reload=False
    )
