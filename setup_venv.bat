@echo off
setlocal
cd /d "%~dp0"

echo ======================================================
echo    ApexMonitor Enterprise - Virtual Environment Setup
echo ======================================================

echo [1/3] Creating Python Virtual Environment in .venv...
python -m venv .venv
if errorlevel 1 (
    echo [ERROR] Failed to create virtual environment. Ensure Python 3.9+ is in PATH.
    pause
    exit /b 1
)

echo [2/3] Activating virtual environment and upgrading pip...
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip

echo [3/3] Installing Server and Client dependencies...
pip install -r server\requirements.txt
pip install -r client\requirements.txt

echo.
echo ======================================================
echo  [SUCCESS] ApexMonitor virtual environment is ready!
echo  Run start_server.bat to start the monitoring hub.
echo ======================================================
pause
