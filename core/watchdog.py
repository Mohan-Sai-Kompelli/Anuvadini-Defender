"""
Anuvadini Detector - Self-Healing Watchdog
Supervises monitoring processes, recovers from crashes or forced kills,
and ensures uninterrupted surveillance.
"""

import os
import subprocess
import sys
import time
import threading

class WatchdogSupervisor:
    def __init__(self, target_script: str, restart_delay: float = 3.0):
        self.target_script = target_script
        self.restart_delay = restart_delay
        self.process = None
        self._running = False
        self._thread = None

    def start(self):
        """Starts supervised execution of target script in a background worker."""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._supervise_loop, daemon=True)
        self._thread.start()

    def stop(self):
        """Gracefully halts watchdog supervision."""
        self._running = False
        if self.process and self.process.poll() is None:
            try:
                self.process.terminate()
            except Exception:
                pass

    def _supervise_loop(self):
        while self._running:
            try:
                print(f"[*] Watchdog launching target: {self.target_script}")
                self.process = subprocess.Popen([sys.executable, self.target_script])
                self.process.wait()

                if not self._running:
                    break

                exit_code = self.process.returncode
                print(f"[!] Target process exited with code {exit_code}. Respawning in {self.restart_delay}s...")
                time.sleep(self.restart_delay)
            except Exception as e:
                print(f"[Watchdog Error] {e}")
                time.sleep(self.restart_delay)
