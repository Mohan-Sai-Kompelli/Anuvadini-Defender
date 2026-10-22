@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\activate.bat" (
    echo [!] Virtual environment not detected. Running setup_venv.bat first...
    call setup_venv.bat
)

echo [*] Activating venv and launching 50-node synthetic client load simulator...
call .venv\Scripts\activate.bat
python mock_clients.py
pause
