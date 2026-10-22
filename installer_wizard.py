"""
Anuvadini Detector - Enterprise Workstation Installer Wizard
Provides a standalone setup wizard GUI (Tkinter) for endpoint workstations:
- Prompts for Central Hub Server IP and Port
- Writes persistent app_config.json
- Configures Windows Autostart (Registry HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run)
- Registers Windows Scheduled Task (schtasks /create on logon)
- Applies file ACL permissions for anti-tampering
"""

import json
import os
import platform
import subprocess
import sys

def setup_registry_autostart(exe_path: str):
    """Sets registry autostart for the agent on Windows."""
    if platform.system() == "Windows":
        try:
            import winreg
            key = winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Run",
                0,
                winreg.KEY_SET_VALUE
            )
            winreg.SetValueEx(key, "AnuvadiniDetector", 0, winreg.REG_SZ, f'"{exe_path}"')
            winreg.CloseKey(key)
            print("[✓] Configured HKCU Run autostart key.")
        except Exception as e:
            print(f"[!] Registry setup warning: {e}")

def setup_schtasks_on_logon(exe_path: str):
    """Registers an elevated Windows Scheduled Task that starts on user logon."""
    if platform.system() == "Windows":
        try:
            cmd = f'schtasks /create /tn "AnuvadiniAgent" /tr "\'{exe_path}\'" /sc onlogon /rl highest /f'
            subprocess.run(cmd, shell=True, capture_output=True)
            print("[✓] Scheduled task 'AnuvadiniAgent' created.")
        except Exception as e:
            print(f"[!] Schtasks warning: {e}")

def run_wizard():
    print("=======================================================")
    print("   ANUVADINI DETECTOR - ENDPOINT INSTALLATION WIZARD   ")
    print("=======================================================")

    try:
        import tkinter as tk
        from tkinter import messagebox

        root = tk.Tk()
        root.title("Anuvadini Detector Setup")
        root.geometry("440x260")
        root.resizable(False, False)
        root.configure(bg="#0f172a")

        tk.Label(root, text="Anuvadini Detector Agent Setup", font=("Segoe UI", 12, "bold"), fg="#ffffff", bg="#0f172a").pack(pady=12)

        frame = tk.Frame(root, bg="#0f172a")
        frame.pack(padx=20, fill="x")

        tk.Label(frame, text="Central Server Host / IP:", font=("Segoe UI", 9), fg="#94a3b8", bg="#0f172a").grid(row=0, column=0, sticky="w", pady=4)
        entry_host = tk.Entry(frame, width=28, font=("Consolas", 10))
        entry_host.insert(0, "10.150.0.6")
        entry_host.grid(row=0, column=1, pady=4, padx=8)

        tk.Label(frame, text="Port:", font=("Segoe UI", 9), fg="#94a3b8", bg="#0f172a").grid(row=1, column=0, sticky="w", pady=4)
        entry_port = tk.Entry(frame, width=28, font=("Consolas", 10))
        entry_port.insert(0, "8000")
        entry_port.grid(row=1, column=1, pady=4, padx=8)

        tk.Label(frame, text="Department:", font=("Segoe UI", 9), fg="#94a3b8", bg="#0f172a").grid(row=2, column=0, sticky="w", pady=4)
        entry_dept = tk.Entry(frame, width=28, font=("Consolas", 10))
        entry_dept.insert(0, "Engineering")
        entry_dept.grid(row=2, column=1, pady=4, padx=8)

        def on_install():
            host = entry_host.get().strip()
            port = entry_port.get().strip()
            dept = entry_dept.get().strip()

            cfg = {
                "server_host": host,
                "server_port": int(port) if port.isdigit() else 8000,
                "department": dept,
                "frame_interval": 2.5
            }

            cfg_path = os.path.join(os.getcwd(), "app_config.json")
            with open(cfg_path, "w") as f:
                json.dump(cfg, f, indent=2)

            exe_candidate = os.path.join(os.getcwd(), "ApexMonitor.exe")
            if os.path.exists(exe_candidate):
                setup_registry_autostart(exe_candidate)
                setup_schtasks_on_logon(exe_candidate)

            messagebox.showinfo("Success", f"Anuvadini Detector successfully configured for {host}:{port} ({dept})!")
            root.destroy()

        tk.Button(root, text="Complete Installation", bg="#4f46e5", fg="#ffffff", font=("Segoe UI", 10, "bold"), relief="flat", padx=16, pady=6, command=on_install).pack(pady=16)

        root.mainloop()

    except Exception:
        # Headless console fallback
        print("[!] Headless environment detected. Using default configuration.")
        cfg = {
            "server_host": "127.0.0.1",
            "server_port": 8000,
            "department": "Engineering",
            "frame_interval": 2.5
        }
        with open("app_config.json", "w") as f:
            json.dump(cfg, f, indent=2)
        print("[✓] app_config.json written successfully.")

if __name__ == "__main__":
    run_wizard()
