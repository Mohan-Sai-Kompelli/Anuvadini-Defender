"""
Anuvadini Detector - Silent Workstation Agent
Runs in the background on employee computers to detect games and report violations.
"""
import time
import sys
from anuvadini_detector.engine import engine

def main():
    print("[Anuvadini Silent Agent] Initializing background watcher...")
    engine.start()
    print("[Anuvadini Silent Agent] Running silently. Press Ctrl+C to exit.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[Anuvadini Silent Agent] Stopping watcher...")
        engine.stop()
        sys.exit(0)

if __name__ == "__main__":
    main()
