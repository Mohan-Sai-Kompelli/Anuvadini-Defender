@echo off
title Anuvadini Detector - Automated Enterprise Installer
echo ========================================================
echo   ANUVADINI DETECTOR ENTERPRISE WORKSTATION SETUP
echo ========================================================
echo.
echo [*] Checking Python environment...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Python not found in system PATH.
    echo [*] Checking for standalone ApexMonitor.exe...
    if exist "ApexMonitor.exe" (
        echo [✓] ApexMonitor.exe found. Launching wizard...
        start "" "ApexMonitor.exe"
        goto :end
    )
)

echo [*] Launching Installer Wizard...
python installer_wizard.py
:end
pause
