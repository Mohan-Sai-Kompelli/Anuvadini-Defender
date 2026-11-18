# =========================================================================
# Anuvadini Attendance & Defender - Build All Script
# =========================================================================

param (
    [switch]$WebOnly,
    [switch]$AndroidOnly
)

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:Path = "C:\Program Files\nodejs;" + $env:Path

if (-not $AndroidOnly) {
    Write-Host "=====================================================" -ForegroundColor Cyan
    Write-Host " Building React Client Production Assets..." -ForegroundColor Cyan
    Write-Host "=====================================================" -ForegroundColor Cyan
    Set-Location "$projectRoot\client"
    $env:CI = "false"
    $env:GENERATE_SOURCEMAP = "false"
    npm run build
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Web build succeeded! Output: client/build" -ForegroundColor Green
    } else {
        Write-Host "Web build failed." -ForegroundColor Red
        exit 1
    }
}

if (-not $WebOnly) {
    Write-Host "=====================================================" -ForegroundColor Cyan
    Write-Host " Building Android Debug APK..." -ForegroundColor Cyan
    Write-Host "=====================================================" -ForegroundColor Cyan
    $env:JAVA_HOME = "C:\Users\010\.jdks\jbr-21.0.11"
    $env:ANDROID_HOME = "C:\Users\010\AppData\Local\Android\Sdk"
    $env:Path = "$env:JAVA_HOME\bin;C:\Users\010\AppData\Local\Android\Sdk\platform-tools;" + $env:Path

    Set-Location "$projectRoot\android"
    .\gradlew assembleDebug --no-daemon --console=plain "-PreactNativeArchitectures=arm64-v8a,armeabi-v7a" "-PdevSuffix=.dev"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Android APK build succeeded!" -ForegroundColor Green
        Write-Host "APK Location: android\app\build\outputs\apk\debug\app-debug.apk" -ForegroundColor White
    } else {
        Write-Host "Android APK build failed." -ForegroundColor Red
        exit 1
    }
}

Set-Location $projectRoot
Write-Host "All build steps finished successfully!" -ForegroundColor Green

