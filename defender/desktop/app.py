"""
Anuvadini Defender - desktop setup app.

A small professional window that links a work PC to an employee by QR (scanned
from the attendance app on their phone), then starts the monitoring agent.
Installs and runs like normal software; nothing is downloaded or hidden.

Run:
    python -m defender.desktop.app            (opens the setup/pairing window)
    python -m defender.desktop.app --selftest (headless backend check, no window)
    python -m defender.desktop.app --agent    (headless agent-only mode, no window)
"""

import os
import sys
import time
import threading
import subprocess

# Allow running both as a module and as a bundled exe (where the package root
# is added to sys.path by the launcher / spec).
try:
    from defender.desktop import pairing
    from defender.desktop.ui import HTML
except Exception:  # pragma: no cover - direct / frozen execution
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    from desktop import pairing  # type: ignore
    from desktop.ui import HTML  # type: ignore

_agent_proc = None   # The agent subprocess (when launched from setup window)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _exe_path() -> str:
    """Return the path of this running executable (frozen or script)."""
    if getattr(sys, "frozen", False):
        return sys.executable          # AnuvadiniDefenderSetup.exe
    # Running as a script — use current interpreter + this file
    return f'"{sys.executable}" "{os.path.abspath(__file__)}"'


def _dacl_protect_pid(pid: int) -> bool:
    """
    Win32 DACL hardening: remove PROCESS_TERMINATE & PROCESS_SUSPEND_RESUME
    rights from everyone except SYSTEM and Administrators.
    Stops non-admin employees from using Task Manager or taskkill /pid.
    """
    if sys.platform != "win32":
        return False
    try:
        import ctypes
        k32 = ctypes.windll.kernel32
        adv = ctypes.windll.advapi32
        WRITE_DAC = 0x40000
        h = k32.OpenProcess(WRITE_DAC, False, pid)
        if not h:
            return False
        sddl = "D:P(A;;GA;;;SY)(A;;GA;;;BA)"
        p_sd = ctypes.c_void_p()
        ok = adv.ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl, 1, ctypes.byref(p_sd), None
        )
        if ok:
            adv.SetKernelObjectSecurity(h, 4, p_sd)
            k32.LocalFree(p_sd)
        k32.CloseHandle(h)
        return bool(ok)
    except Exception:
        return False


def _autostart_register_exe() -> bool:
    """
    Register 'AnuvadiniDefenderSetup.exe --agent' in HKCU Run so the agent
    restarts on every Windows logon — even after a reboot or session switch.
    Works only when running as a frozen exe; silently skips in dev mode.
    """
    if sys.platform != "win32" or not getattr(sys, "frozen", False):
        return False
    try:
        import winreg
        exe = sys.executable
        cmd = f'"{exe}" --agent'
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0, winreg.KEY_SET_VALUE,
        )
        winreg.SetValueEx(key, "AnuvadiniDefender", 0, winreg.REG_SZ, cmd)
        winreg.CloseKey(key)
        return True
    except Exception:
        return False


def _autostart_verify_or_repair():
    """
    Called periodically by the agent guardian thread.
    If an employee deleted the registry autostart entry, re-add it.
    """
    if sys.platform != "win32" or not getattr(sys, "frozen", False):
        return
    try:
        import winreg
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0, winreg.KEY_READ,
        )
        try:
            winreg.QueryValueEx(key, "AnuvadiniDefender")
        except FileNotFoundError:
            winreg.CloseKey(key)
            _autostart_register_exe()   # silently re-register
            return
        winreg.CloseKey(key)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Agent mode  (--agent flag: no window, just monitoring)
# ---------------------------------------------------------------------------

def run_agent_mode():
    """
    Headless agent entry point — no UI, just monitoring.
    This is what the autostart registry entry runs on every logon.

    Protection stack applied here (on this process itself):
      1. Win32 DACL hardening  → blocks non-admin taskkill /pid
      2. Autostart re-register  → watches & repairs the registry entry every 5min
      3. Heartbeat dead-man switch on server side  → flags TAMPER_ALERT if we go silent
    """
    # 1. DACL-protect THIS process
    my_pid = os.getpid()
    protected = _dacl_protect_pid(my_pid)
    print(f"[Defender] DACL hardening: {'applied' if protected else 'skipped (need admin or dev mode)'}")

    # 2. Ensure autostart is registered (re-register if deleted)
    if _autostart_register_exe():
        print("[Defender] Autostart registered: runs on every Windows logon.")

    # 3. Background guardian: periodically verify autostart entry still exists
    def _guardian():
        while True:
            time.sleep(300)   # check every 5 minutes
            _autostart_verify_or_repair()

    threading.Thread(target=_guardian, daemon=True, name="anuvadini-guardian").start()

    # 4. Load agent config
    cfg = pairing.read_config()
    server_host = cfg.get("server_host") or pairing.DEFAULT_HOST
    server_url  = pairing.defender_base(server_host)
    print(f"[Defender] Connecting to server: {server_url}")

    # 5. Run the monitoring agent (blocking loop)
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(here)        # .../defender
    if root not in sys.path:
        sys.path.insert(0, root)

    from anuvadini_detector import agent as agent_mod
    agent_mod.run_agent(server_url=server_url)


# ---------------------------------------------------------------------------
# Setup window: spawn the agent as a separate protected process
# ---------------------------------------------------------------------------

def start_monitoring_agent(server_host: str):
    """
    Spawn 'AnuvadiniDefenderSetup.exe --agent' as a SEPARATE OS process
    (not a daemon thread) so it survives the setup window being closed.
    DACL-protect the spawned process immediately after launch.
    """
    global _agent_proc
    if _agent_proc and _agent_proc.poll() is None:
        return   # already running

    # Build the command
    if getattr(sys, "frozen", False):
        # Running as an exe — respawn ourselves with --agent flag
        cmd = [sys.executable, "--agent"]
    else:
        # Dev mode — use the interpreter
        cmd = [sys.executable, os.path.abspath(__file__), "--agent"]

    try:
        flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        _agent_proc = subprocess.Popen(cmd, creationflags=flags)
        # DACL-protect the spawned process (non-admin employees can't kill it)
        time.sleep(0.3)
        protected = _dacl_protect_pid(_agent_proc.pid)
        print(f"[Defender] Agent process {_agent_proc.pid} started. "
              f"DACL: {'protected' if protected else 'standard'}")
    except Exception as e:
        print(f"[Defender] Could not spawn agent process: {e}")
        # Fall back to daemon thread if spawn fails
        def _run():
            try:
                here = os.path.dirname(os.path.abspath(__file__))
                root = os.path.dirname(here)
                if root not in sys.path:
                    sys.path.insert(0, root)
                from anuvadini_detector import agent as agent_mod
                agent_mod.run_agent(server_url=pairing.defender_base(server_host))
            except Exception as ex:
                print(f"[desktop] fallback agent error: {ex}")
        threading.Thread(target=_run, daemon=True, name="anuvadini-agent").start()


# ---------------------------------------------------------------------------
# pywebview bridge (setup window)
# ---------------------------------------------------------------------------

class Api:
    """Bridge exposed to the window's JavaScript (window.pywebview.api.*)."""

    def __init__(self):
        self._window = None
        cfg = pairing.read_config()
        self._host = cfg.get("server_host", "") or pairing.DEFAULT_HOST

    def boot(self):
        cfg = pairing.read_config()
        import socket
        host = socket.gethostname()
        server_host = cfg.get("server_host", "") or pairing.DEFAULT_HOST
        self._host = server_host
        if cfg.get("paired") and cfg.get("employee_id"):
            start_monitoring_agent(server_host)
            return {
                "paired": True,
                "serverHost": server_host,
                "hostname": host,
                "employee": {
                    "uid": cfg.get("employee_id", ""),
                    "name": cfg.get("name", ""),
                    "department": cfg.get("department", ""),
                },
            }
        return {"paired": False, "serverHost": server_host, "hostname": host}

    def create_session(self):
        try:
            s = pairing.create_session(self._host or pairing.DEFAULT_HOST)
            dev = s.get("device", {})
            return {
                "pairId": s["pairId"], "qrImage": s["qrImage"], "pollMs": s["pollMs"],
                "deviceName": dev.get("deviceName", ""), "hostname": dev.get("hostname", ""),
            }
        except Exception:
            return {"error": "Could not start pairing. Is the server reachable?"}

    def poll(self, pair_id):
        r = pairing.poll(self._host or pairing.DEFAULT_HOST, pair_id)
        return {
            "status": r.get("status", "pending"),
            "employee": r.get("employee"),
            "agentToken": r.get("agentToken", ""),
        }

    def finish(self, pair_id):
        host = self._host or pairing.DEFAULT_HOST
        r = pairing.poll(host, pair_id)
        if r.get("status") != "paired" or not r.get("employee"):
            return {"ok": False, "error": "Linking did not complete. Please scan again."}
        emp = r["employee"]
        try:
            pairing.save_paired_identity(host, emp, r.get("agentToken", ""))
            start_monitoring_agent(host)
            return {"ok": True, "employee": emp}
        except Exception:
            return {"ok": False, "error": "Could not save the link on this PC."}

    def minimize(self):
        try:
            if self._window:
                self._window.minimize()
        except Exception:
            pass
        return {"ok": True}


# ---------------------------------------------------------------------------
# Entrypoints
# ---------------------------------------------------------------------------

def selftest():
    """Headless check of the pairing round-trip against a running backend."""
    host = os.environ.get("ANUVADINI_SERVER_HOST", "127.0.0.1")
    print(f"[selftest] server host: {host}")
    s = pairing.create_session(host)
    print(f"[selftest] created pairId={s['pairId'][:12]}... qrImage={len(s['qrImage'])} bytes")
    r = pairing.poll(host, s["pairId"])
    print(f"[selftest] poll status: {r.get('status')}")
    pairing.cancel(host, s["pairId"])
    print("[selftest] cancelled. OK")


def main():
    if "--selftest" in sys.argv:
        selftest()
        return

    if "--agent" in sys.argv:
        # Headless agent mode — no window, just monitoring
        run_agent_mode()
        return

    # Setup / pairing window
    import webview
    api = Api()
    window = webview.create_window(
        "Anuvadini Defender",
        html=HTML,
        js_api=api,
        width=900,
        height=640,
        min_size=(740, 520),
        background_color="#f0f4f8",
        text_select=False,
    )
    api._window = window
    webview.start()


if __name__ == "__main__":
    main()
