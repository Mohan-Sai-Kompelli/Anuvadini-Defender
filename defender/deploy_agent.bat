@echo off
title Anuvadini Detector - Enterprise Workstation Agent Setup
color 0A
echo ========================================================
echo   ANUVADINI DETECTOR - ENTERPRISE CLIENT AGENT SETUP
echo   Zero-Bypass ^& Tamper-Resistant Deployment
echo ========================================================
echo.
set /p SERVER_URL="Enter Central Server URL [default: http://127.0.0.1:8055]: "
if "%SERVER_URL%"=="" set SERVER_URL=http://127.0.0.1:8055

set /p DEPT="Enter Department Name [default: Engineering]: "
if "%DEPT%"=="" set DEPT=Engineering

echo.
echo [1/3] Checking Python dependencies...
python -m pip install -r requirements.txt --quiet

echo.
echo [2/3] Registering Anti-Tamper Mutual Watchdog...
start /b python -m anuvadini_detector.watchdog

echo.
echo [3/3] Registering Windows Scheduled Task for Auto-Start on Logon...
schtasks /create /tn "AnuvadiniDetectorAgent" /tr "\"%~dp0python_agent_launcher.vbs\"" /sc onlogon /rl HIGHEST /f >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Windows Scheduled Task successfully installed with HIGHEST privileges.
) else (
    echo [NOTE] Running under standard user privileges.
)

echo.
echo ========================================================
echo   Starting Anuvadini Client Agent (Department: %DEPT%)
echo   Connecting to Central Server: %SERVER_URL%
echo ========================================================
echo.
wscript "%~dp0python_agent_launcher.vbs"
pause
