@echo off
set SERVER_HOST=%1
if "%SERVER_HOST%"=="" set SERVER_HOST=127.0.0.1
set SERVER_PORT=8000

echo [*] Deploying Anuvadini Detector Agent to workstation...
echo [*] Target Server: http://%SERVER_HOST%:%SERVER_PORT%

mkdir "C:\ProgramData\AnuvadiniDetector" 2>nul
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'http://%SERVER_HOST%:%SERVER_PORT%/download/ApexMonitor.exe' -OutFile 'C:\ProgramData\AnuvadiniDetector\ApexMonitor.exe'"

powershell -Command "Invoke-WebRequest -Uri 'http://%SERVER_HOST%:%SERVER_PORT%/download/app_config.json' -OutFile 'C:\ProgramData\AnuvadiniDetector\app_config.json'"

schtasks /create /tn "AnuvadiniAgent" /tr "'C:\ProgramData\AnuvadiniDetector\ApexMonitor.exe'" /sc onlogon /rl highest /f

start "" "C:\ProgramData\AnuvadiniDetector\ApexMonitor.exe"
echo [✓] Deployment complete!
