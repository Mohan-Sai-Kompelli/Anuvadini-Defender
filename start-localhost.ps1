# =========================================================================
# Anuvadini Attendance & Defender - Localhost Launcher
# =========================================================================

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host " Starting Anuvadini Full Stack on Localhost " -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

# 1. Start Node.js Backend Server (Port 5001)
Write-Host "[1/3] Starting Backend API on http://localhost:5001..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$projectRoot\server'; `$env:Path = 'C:\Program Files\nodejs;' + `$env:Path; node index.js"

# 2. Start Python Defender Engine (Port 8055)
Write-Host "[2/3] Starting Defender Engine on http://127.0.0.1:8055..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$projectRoot\defender'; python -m uvicorn anuvadini_detector.server:app --host 127.0.0.1 --port 8055"

# 3. Start React Web Client Dev Server (Port 19055/3005)
Write-Host "[3/3] Starting React Web Client on http://localhost:3005..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$projectRoot\client'; `$env:Path = 'C:\Program Files\nodejs;' + `$env:Path; npm start"

Write-Host ""
Write-Host "All local services have been launched in separate windows!" -ForegroundColor Yellow
Write-Host "  • Backend API:      http://localhost:5001/api" -ForegroundColor White
Write-Host "  • Web Dashboard:    http://localhost:3005 (or unified on http://localhost:5001)" -ForegroundColor White
Write-Host "  • Defender Engine:  http://127.0.0.1:8055/api/status" -ForegroundColor White

