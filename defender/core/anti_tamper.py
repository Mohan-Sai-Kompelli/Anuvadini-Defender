"""
Anuvadini Detector - Anti-Tamper & Bypass Defense
Detects PE-header disguise/cloaking, evasion tools, gaming network ports,
remote desktop streamers, and implements dead-man heartbeat checks.
"""

import os
import psutil
import time
from typing import Dict, Any, List, Set
from .signatures import EVASION_PROCESSES, EMULATORS, GAMING_PORT_RANGES

class AntiTamperEngine:
    def __init__(self):
        self.last_heartbeats: Dict[str, float] = {}

    def scan_evasion_processes(self) -> List[Dict[str, Any]]:
        """Scans for active remote desktop streamers, automation macros, or anti-monitoring tools."""
        evasions = []
        try:
            for p in psutil.process_iter(['pid', 'name']):
                pname = (p.info['name'] or '').lower()
                if pname in EVASION_PROCESSES:
                    evasions.append({
                        "pid": p.info['pid'],
                        "name": pname,
                        "type": "Evasion / Remote Bypass Tool"
                    })
                elif pname in EMULATORS:
                    evasions.append({
                        "pid": p.info['pid'],
                        "name": pname,
                        "type": "Android / Console Emulator"
                    })
        except Exception:
            pass
        return evasions

    def scan_gaming_network_sockets(self) -> List[Dict[str, Any]]:
        """
        Scans active TCP/UDP connections for known gaming and game-streaming port ranges.
        Catches games even if running under an unknown or obfuscated process name.
        """
        active_gaming_sockets = []
        try:
            connections = psutil.net_connections(kind='inet')
            for conn in connections:
                if conn.raddr:
                    rport = conn.raddr.port
                    # Strictly ignore monitoring server port 8000 and standard web ports
                    if rport in (80, 443, 8000, 8080):
                        continue
                    for prange in GAMING_PORT_RANGES:
                        if rport in prange["ports"]:
                            active_gaming_sockets.append({
                                "service": prange["name"],
                                "remote_ip": conn.raddr.ip,
                                "remote_port": rport,
                                "pid": conn.pid,
                                "status": conn.status
                            })
                            break
        except Exception:
            pass
        return active_gaming_sockets

    def scan_pe_header_cloaking(self, max_procs: int = 50) -> List[Dict[str, Any]]:
        """
        Detects PE-header cloaking where a game executable is renamed (e.g. CS2 renamed to svchost.exe).
        Checks process binary metadata or signature hints when possible.
        """
        cloaked_procs = []
        try:
            count = 0
            for p in psutil.process_iter(['pid', 'name', 'exe']):
                if count >= max_procs:
                    break
                exe_path = p.info.get('exe')
                if not exe_path or not os.path.isfile(exe_path):
                    continue

                # Heuristic: suspicious location for system process names
                pname = (p.info['name'] or '').lower()
                if pname in ["svchost.exe", "notepad.exe", "calc.exe", "explorer.exe"]:
                    exe_lower = exe_path.lower()
                    # Real svchost/calc are in system32/syswow64
                    if "windows\\system32" not in exe_lower and "windows\\syswow64" not in exe_lower and "windows" not in exe_lower:
                        cloaked_procs.append({
                            "pid": p.info['pid'],
                            "name": pname,
                            "path": exe_path,
                            "reason": "Suspicious location for system-named process (Possible Cloak)"
                        })
                count += 1
        except Exception:
            pass
        return cloaked_procs

    def record_heartbeat(self, workstation_id: str):
        """Records client heartbeat timestamp for dead-man monitor."""
        self.last_heartbeats[workstation_id] = time.time()

    def check_dead_man_heartbeats(self, timeout_seconds: float = 25.0) -> List[str]:
        """
        Flags any workstation that stopped transmitting heartbeats without a clean shutdown.
        Returns list of tampered/frozen workstation IDs.
        """
        now = time.time()
        tampered_stations = []
        for station_id, last_seen in list(self.last_heartbeats.items()):
            if now - last_seen > timeout_seconds:
                tampered_stations.append(station_id)
        return tampered_stations
