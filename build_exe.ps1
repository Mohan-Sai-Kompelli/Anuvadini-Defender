$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "   Building ApexMonitor Standalone Executable (.exe)" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

$pyinstallerExe = Join-Path $scriptDir ".venv\Scripts\pyinstaller.exe"
if (-not (Test-Path $pyinstallerExe)) {
    Write-Host "[*] Installing PyInstaller in .venv..." -ForegroundColor Yellow
    $pipExe = Join-Path $scriptDir ".venv\Scripts\pip.exe"
    & $pipExe install pyinstaller
}

Write-Host "[*] Compiling app.py into ApexMonitor.exe..." -ForegroundColor Yellow
& $pyinstallerExe --noconsole --onefile --name "ApexMonitor" --clean --noconfirm (Join-Path $scriptDir "app.py")

$builtExe = Join-Path $scriptDir "dist\ApexMonitor.exe"
if (Test-Path $builtExe) {
    Copy-Item $builtExe (Join-Path $scriptDir "ApexMonitor.exe") -Force
    Write-Host ""
    Write-Host "======================================================" -ForegroundColor Green
    Write-Host " [SUCCESS] Executable built successfully!" -ForegroundColor Green
    Write-Host " Location: $builtExe" -ForegroundColor Green
    Write-Host " Also copied to: $(Join-Path $scriptDir 'ApexMonitor.exe')" -ForegroundColor Green
    Write-Host "======================================================" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Build failed. Please check output." -ForegroundColor Red
}
