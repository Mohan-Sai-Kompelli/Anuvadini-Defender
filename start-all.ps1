$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host "Starting all services..." -ForegroundColor Cyan

# 1. Backend API on 5001
Start-Process "powershell.exe" -ArgumentList "-NoExit", "-Command", `
  "Write-Host 'BACKEND :5001' -ForegroundColor Green; cd '$projectRoot\server'; node index.js"

# 2. Client portal on 3005
Start-Process "powershell.exe" -ArgumentList "-NoExit", "-Command", `
  "Write-Host 'PORTAL  :19055 (internal)' -ForegroundColor Yellow; cd '$projectRoot\client'; npm start"

# 3. Website (Vite) on 3010 — proxies everything above
Start-Process "powershell.exe" -ArgumentList "-NoExit", "-Command", `
  "Write-Host 'WEBSITE :3010' -ForegroundColor Magenta; cd '$projectRoot\website'; npm run dev"

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  Open: http://localhost:3010" -ForegroundColor White
Write-Host "  Sab kuch 3010 pe hi milega" -ForegroundColor White
Write-Host "=====================================" -ForegroundColor Cyan
