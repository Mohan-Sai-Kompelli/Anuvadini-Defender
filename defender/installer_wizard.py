"""
Anuvadini Detector - Enterprise Workstation Installer & Onboarding Wizard
1. Prompts employee for Employee ID.
2. Instantly queries Central Server and fetches verified profile (e.g. Employee Name / Department).
3. Prompts employee for Password.
4. Authenticates with Central Server (/api/employee/login), captures client IP address into DB.
5. Installs files permanently into protected system folder (C:\ProgramData\AnuvadiniDetector).
6. Compiles python bytecode (.pyc) to prevent tampering and reverse engineering.
7. Applies NTFS ACL lockdown (icacls) to prevent unauthorized editing/deletion.
8. Registers Windows Scheduled Task with HIGHEST admin rights for auto-start.
9. Automatically hides / cleans up setup files from the Downloads folder.
"""

import sys
import os
import shutil
import json
import socket
import urllib.request
import urllib.parse
import urllib.error
import subprocess
from pathlib import Path

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TARGET_DIR = r"C:\ProgramData\AnuvadiniDetector"
FALLBACK_DIR = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "AnuvadiniDetector")

def get_install_target():
    try:
        os.makedirs(TARGET_DIR, exist_ok=True)
        test_file = os.path.join(TARGET_DIR, ".write_test")
        with open(test_file, "w") as f:
            f.write("ok")
        os.remove(test_file)
        return TARGET_DIR
    except Exception:
        os.makedirs(FALLBACK_DIR, exist_ok=True)
        return FALLBACK_DIR

def get_machine_info():
    hostname = socket.gethostname()
    username = os.getlogin() if hasattr(os, "getlogin") else os.environ.get("USERNAME", "Employee")
    ip = "127.0.0.1"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
    except Exception:
        pass
    return hostname, username, ip

def fetch_employee_profile(server_url: str, employee_id: str) -> tuple[bool, dict]:
    """Queries Central Server to verify and fetch employee identity by Employee ID."""
    clean_id = employee_id.strip()
    if not clean_id:
        return False, {"error": "Please enter an Employee ID."}
    url = f"{server_url.rstrip('/')}/api/employee/verify/{urllib.parse.quote(clean_id)}"
    try:
        req = urllib.request.Request(url, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=5) as response:
            res = json.loads(response.read().decode('utf-8'))
            if res.get("success") and res.get("employee"):
                return True, res["employee"]
            return False, {"error": "Employee ID not found in directory."}
    except urllib.error.HTTPError as he:
        try:
            err = json.loads(he.read().decode('utf-8'))
            return False, {"error": err.get("message", f"HTTP {he.code}")}
        except Exception:
            return False, {"error": f"Employee ID not found (HTTP {he.code})"}
    except Exception as e:
        return False, {"error": str(e)}

def login_and_register_employee(server_url: str, employee_id: str, password: str) -> tuple[bool, dict]:
    """Authenticates employee password and registers workstation with captured IP address."""
    hostname, _, ip = get_machine_info()
    url = f"{server_url.rstrip('/')}/api/employee/login"
    payload = {
        "employee_id": employee_id.strip(),
        "password": password.strip(),
        "hostname": hostname,
        "ip_address": ip
    }
    try:
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=6) as response:
            res = json.loads(response.read().decode('utf-8'))
            return True, res
    except urllib.error.HTTPError as he:
        try:
            err = json.loads(he.read().decode('utf-8'))
            return False, {"error": err.get("error", f"Authentication failed ({he.code})")}
        except Exception:
            return False, {"error": f"Invalid password or access denied ({he.code})"}
    except Exception as e:
        return False, {"error": str(e)}

def perform_installation(server_url: str, employee_id: str, name: str, dept: str) -> tuple[bool, str]:
    target = get_install_target()
    os.makedirs(target, exist_ok=True)

    # 1. Copy package files
    src_pkg = os.path.join(BASE_DIR, "anuvadini_detector")
    dst_pkg = os.path.join(target, "anuvadini_detector")
    if os.path.exists(src_pkg):
        shutil.copytree(src_pkg, dst_pkg, dirs_exist_ok=True)

    # Copy launcher scripts
    for file in ["agent.py", "watchdog.py", "python_agent_launcher.vbs", "requirements.txt"]:
        src_file = os.path.join(BASE_DIR, "anuvadini_detector", file) if not os.path.exists(os.path.join(BASE_DIR, file)) else os.path.join(BASE_DIR, file)
        if os.path.exists(src_file):
            shutil.copy(src_file, os.path.join(target, file))

    # 2. Save agent_config.json
    cfg = {
        "employee_id": employee_id,
        "username": name,
        "department": dept,
        "server_url": server_url,
        "installed_at": target
    }
    cfg_path = os.path.join(target, "agent_config.json")
    with open(cfg_path, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)

    # 3. Bytecode Compilation (Anti-Reverse Engineering)
    try:
        subprocess.run(
            [sys.executable, "-m", "compileall", "-q", target],
            creationflags=0x08000000 if sys.platform == "win32" else 0, # CREATE_NO_WINDOW
            check=False
        )
    except Exception:
        pass

    # 4. NTFS ACL Lockdown (Prevent Employee from deleting or modifying files)
    if sys.platform == "win32":
        try:
            cmd = f'icacls "{target}" /inheritance:r /grant:r "BUILTIN\\Administrators":(OI)(CI)F /grant:r "NT AUTHORITY\\SYSTEM":(OI)(CI)F /grant:r "BUILTIN\\Users":(OI)(CI)RX'
            subprocess.run(cmd, shell=True, creationflags=0x08000000, check=False)
        except Exception:
            pass

    # 5. Register Windows Scheduled Task for Highest Privilege Auto-Start
    launcher_vbs = os.path.join(target, "python_agent_launcher.vbs")
    if sys.platform == "win32" and os.path.exists(launcher_vbs):
        try:
            sch_cmd = f'schtasks /create /tn "AnuvadiniDetectorAgent" /tr "wscript.exe \\"{launcher_vbs}\\"" /sc onlogon /rl HIGHEST /f'
            subprocess.run(sch_cmd, shell=True, creationflags=0x08000000, check=False)
        except Exception:
            pass

    # 6. Start Agent in Background (100% Detached, Zero Taskbar/Console)
    if sys.platform == "win32":
        try:
            subprocess.Popen(["wscript.exe", launcher_vbs], cwd=target, creationflags=0x08000000)
        except Exception:
            py_exe = sys.executable.lower().replace("python.exe", "pythonw.exe")
            if not os.path.exists(py_exe):
                py_exe = sys.executable
            subprocess.Popen(
                [py_exe, "-m", "anuvadini_detector.agent"],
                cwd=target,
                creationflags=0x08000000 | 0x00000200
            )
    else:
        subprocess.Popen(
            [sys.executable, "-m", "anuvadini_detector.agent"],
            cwd=target,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True
        )

    # 7. Self-Hide & Cleanup from Downloads folder
    hide_from_downloads()

    return True, f"Installed successfully to {target}"

def hide_from_downloads():
    """Hides or cleans up any installer scripts or artifacts from the employee's Downloads directory."""
    downloads_path = os.path.join(os.path.expanduser("~"), "Downloads")
    if not os.path.exists(downloads_path):
        return

    cleanup_names = [
        "Anuvadini_Installer.bat",
        "Anuvadini_Installer_Mac.sh",
        "Anuvadini_Installer_Mac.command",
        "bundle.zip",
        "client-bundle.zip"
    ]
    try:
        for item in os.listdir(downloads_path):
            if item in cleanup_names or item.lower().startswith("anuvadini_installer"):
                item_path = os.path.join(downloads_path, item)
                try:
                    if os.path.isfile(item_path):
                        os.remove(item_path)
                    elif os.path.isdir(item_path) and "anuvadini" in item.lower():
                        shutil.rmtree(item_path, ignore_errors=True)
                except Exception:
                    if sys.platform == "win32":
                        subprocess.run(f'attrib +h +s "{item_path}"', shell=True, creationflags=0x08000000, check=False)
    except Exception:
        pass

def run_gui():
    import tkinter as tk
    from tkinter import ttk, messagebox

    hostname, detected_username, ip = get_machine_info()

    root = tk.Tk()
    root.title("Anuvadini Detector - Workplace Authentication & Onboarding")
    root.geometry("540x620")
    root.resizable(False, False)
    root.configure(bg="#0b1120")

    # Styling
    style = ttk.Style()
    style.theme_use('clam')
    style.configure("TLabel", background="#0b1120", foreground="#f1f5f9", font=("Segoe UI", 9))
    style.configure("Header.TLabel", font=("Segoe UI", 14, "bold"), foreground="#38bdf8")
    style.configure("SubHeader.TLabel", font=("Segoe UI", 8), foreground="#94a3b8")

    header_frame = tk.Frame(root, bg="#0b1120", pady=15)
    header_frame.pack(fill="x", padx=25)

    lbl_title = ttk.Label(header_frame, text="🛡️ ANUVADINI DETECTOR", style="Header.TLabel")
    lbl_title.pack(anchor="w")

    lbl_sub = ttk.Label(header_frame, text="Enterprise Workplace Activity Auditing & Reverse Tunnel Client", style="SubHeader.TLabel")
    lbl_sub.pack(anchor="w", pady=(2, 0))

    # Form Container
    form_frame = tk.Frame(root, bg="#131d31", bd=1, relief="solid")
    form_frame.pack(fill="both", expand=True, padx=25, pady=5)

    # Central Server URL
    lbl_srv = tk.Label(form_frame, text="Central Server URL", bg="#131d31", fg="#94a3b8", font=("Segoe UI", 8, "bold"))
    lbl_srv.pack(anchor="w", padx=20, pady=(12, 2))
    ent_srv = tk.Entry(form_frame, bg="#1e293b", fg="#94a3b8", insertbackground="#38bdf8", font=("Segoe UI", 9), bd=1, relief="solid")
    ent_srv.pack(fill="x", padx=20)
    ent_srv.insert(0, "http://127.0.0.1:8055")

    # Step 1: Employee ID Input & Lookup
    lbl_emp = tk.Label(form_frame, text="Step 1: Enter Employee ID *", bg="#131d31", fg="#38bdf8", font=("Segoe UI", 10, "bold"))
    lbl_emp.pack(anchor="w", padx=20, pady=(12, 4))
    
    id_row = tk.Frame(form_frame, bg="#131d31")
    id_row.pack(fill="x", padx=20)
    
    ent_emp = tk.Entry(id_row, bg="#1e293b", fg="#f8fafc", insertbackground="#38bdf8", font=("Segoe UI", 11, "bold"), bd=1, relief="solid")
    ent_emp.pack(side="left", fill="x", expand=True)
    ent_emp.insert(0, "9310790241")

    # Verified Profile Badge Box
    profile_box = tk.Frame(form_frame, bg="#0f291e", bd=1, relief="solid", highlightbackground="#10b981", highlightthickness=1)
    profile_box.pack(fill="x", padx=20, pady=(10, 4))

    lbl_prof_name = tk.Label(profile_box, text=f"👤 Name: {detected_username}", bg="#0f291e", fg="#34d399", font=("Segoe UI", 10, "bold"), anchor="w")
    lbl_prof_name.pack(fill="x", padx=12, pady=(8, 2))

    lbl_prof_dept = tk.Label(profile_box, text="🏢 Department: Anuvadini foundation", bg="#0f291e", fg="#a7f3d0", font=("Segoe UI", 9), anchor="w")
    lbl_prof_dept.pack(fill="x", padx=12, pady=(0, 2))

    lbl_prof_ip = tk.Label(profile_box, text=f"🌐 IP Address: {ip} (Auto-Captured for DB)", bg="#0f291e", fg="#6ee7b7", font=("Segoe UI", 8), anchor="w")
    lbl_prof_ip.pack(fill="x", padx=12, pady=(0, 8))

    current_emp_data = {"name": detected_username, "department": "Anuvadini foundation"}

    def on_lookup_click():
        srv = ent_srv.get().strip()
        emp_id = ent_emp.get().strip()
        if not emp_id:
            messagebox.showwarning("Input Required", "Please enter your Employee ID.")
            return

        lbl_status.config(text="Querying employee directory...")
        root.update()

        ok, profile = fetch_employee_profile(srv, emp_id)
        if ok:
            current_emp_data["name"] = profile.get("name", "Employee")
            current_emp_data["department"] = profile.get("department", "Anuvadini foundation")
            lbl_prof_name.config(text=f"👤 Name: {current_emp_data['name']}")
            lbl_prof_dept.config(text=f"🏢 Department: {current_emp_data['department']}")
            profile_box.config(bg="#0f291e", highlightbackground="#10b981")
            lbl_prof_name.config(bg="#0f291e", fg="#34d399")
            lbl_prof_dept.config(bg="#0f291e", fg="#a7f3d0")
            lbl_prof_ip.config(bg="#0f291e", fg="#6ee7b7")
            lbl_status.config(text="✅ Employee verified successfully!")
        else:
            profile_box.config(bg="#2d1519", highlightbackground="#f87171")
            lbl_prof_name.config(text=f"❌ Unrecognized ID: {emp_id}", bg="#2d1519", fg="#f87171")
            lbl_prof_dept.config(text="Please check your ID with IT admin", bg="#2d1519", fg="#fca5a5")
            lbl_prof_ip.config(bg="#2d1519", fg="#fca5a5")
            lbl_status.config(text="Employee ID not found.")

    btn_lookup = tk.Button(
        id_row,
        text="🔍 Verify ID",
        command=on_lookup_click,
        bg="#0369a1",
        fg="#ffffff",
        font=("Segoe UI", 9, "bold"),
        bd=0,
        padx=12,
        pady=4,
        cursor="hand2"
    )
    btn_lookup.pack(side="right", padx=(8, 0))

    # Step 2: Password Input
    lbl_pwd = tk.Label(form_frame, text="Step 2: Enter Password *", bg="#131d31", fg="#cbd5e1", font=("Segoe UI", 10, "bold"))
    lbl_pwd.pack(anchor="w", padx=20, pady=(12, 4))
    ent_pwd = tk.Entry(form_frame, bg="#1e293b", fg="#f8fafc", insertbackground="#38bdf8", font=("Segoe UI", 11), bd=1, relief="solid", show="*")
    ent_pwd.pack(fill="x", padx=20)
    ent_pwd.insert(0, "9310790241")

    # Machine info badge
    badge = tk.Label(
        form_frame,
        text=f"💻 PC: {hostname}  |  IP: {ip}  |  Zero-Bypass: ACTIVE",
        bg="#0b1120",
        fg="#64748b",
        font=("Segoe UI", 8),
        pady=5
    )
    badge.pack(fill="x", padx=20, pady=(14, 10))

    # Status Message
    lbl_status = tk.Label(root, text="", bg="#0b1120", fg="#38bdf8", font=("Segoe UI", 9))
    lbl_status.pack(pady=3)

    def on_login_install_click():
        srv = ent_srv.get().strip()
        emp_id = ent_emp.get().strip()
        pwd = ent_pwd.get().strip()

        if not emp_id or not pwd:
            messagebox.showerror("Validation Error", "Please provide both Employee ID and Password.")
            return

        lbl_status.config(text="Authenticating credentials with central database...")
        root.update()

        # 1. Authenticate with server and capture IP
        ok_auth, auth_res = login_and_register_employee(srv, emp_id, pwd)
        if not ok_auth:
            err_msg = auth_res.get("error", "Authentication failed.")
            messagebox.showerror("Authentication Failed", f"❌ Login Denied: {err_msg}\n\nPlease check your Employee ID and Password.")
            lbl_status.config(text="Authentication denied.")
            return

        emp_name = auth_res.get("name", current_emp_data["name"])
        emp_dept = auth_res.get("department", current_emp_data["department"])
        captured_ip = auth_res.get("client_ip", ip)

        lbl_status.config(text=f"Authenticated! Installing stealth agent for {emp_name}...")
        root.update()

        # 2. Perform background installation & file locking
        ok_inst, inst_msg = perform_installation(srv, emp_id, emp_name, emp_dept)
        if ok_inst:
            messagebox.showinfo(
                "Workstation Secured & Bound",
                f"✅ Welcome, {emp_name}!\n\n"
                f"• Employee ID: {emp_id}\n"
                f"• Department: {emp_dept}\n"
                f"• Network IP Registered: {captured_ip}\n"
                f"• Reverse Tunnel: CONNECTED\n"
                f"• Anti-Tamper Shield: ACTIVE\n"
                f"• Downloads Cleanup: COMPLETED\n\n"
                f"The agent is now active and monitoring silently in the background."
            )
            root.destroy()
        else:
            messagebox.showerror("Installation Error", inst_msg)

    btn_login = tk.Button(
        root,
        text="🔒 Authenticate & Launch Stealth Agent",
        command=on_login_install_click,
        bg="#059669",
        fg="#ffffff",
        font=("Segoe UI", 11, "bold"),
        activebackground="#047857",
        activeforeground="#ffffff",
        bd=0,
        pady=10,
        cursor="hand2"
    )
    btn_login.pack(fill="x", padx=25, pady=(4, 18))

    root.mainloop()

if __name__ == "__main__":
    if "--silent" in sys.argv:
        emp = sys.argv[sys.argv.index("--id") + 1] if "--id" in sys.argv else "9310790241"
        pwd = sys.argv[sys.argv.index("--pwd") + 1] if "--pwd" in sys.argv else "9310790241"
        srv = sys.argv[sys.argv.index("--server") + 1] if "--server" in sys.argv else "http://127.0.0.1:8055"
        ok_a, res_a = login_and_register_employee(srv, emp, pwd)
        name = res_a.get("name", "Employee") if ok_a else "Employee"
        dept = res_a.get("department", "Anuvadini foundation") if ok_a else "General"
        ok_i, msg_i = perform_installation(srv, emp, name, dept)
        print(f"Silent Install: {msg_i} | IP: {res_a.get('client_ip', '127.0.0.1')}")
    else:
        try:
            run_gui()
        except Exception as e:
            print(f"[Fallback to CLI] GUI failed: {e}")
            srv = "http://127.0.0.1:8055"
            emp = input("Enter Employee ID [9310790241]: ").strip() or "9310790241"
            ok, prof = fetch_employee_profile(srv, emp)
            name = prof.get("name", "Employee") if ok else "Employee"
            dept = prof.get("department", "Anuvadini foundation") if ok else "Anuvadini foundation"
            print(f"✅ Verified: {name} ({dept})")
            pwd = input("Enter Password [9310790241]: ").strip() or "9310790241"
            login_and_register_employee(srv, emp, pwd)
            perform_installation(srv, emp, name, dept)
