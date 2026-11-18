# Launches multiple face-back (check.py) instances, one per port, each in its
# own PowerShell window — for the "multiple instances behind a load balancer"
# scaling fix (see server/services/faceVerifyService.js's FACE_API_URLS).
#
# Every instance runs the SAME code/models and reads the SAME shared MongoDB
# embeddings collection live on every request — running several does not
# change match accuracy, only how many check-ins can be worked on at once
# (each instance still caps concurrent requests at FACE_API_THREADS, default 8).
#
# Usage:
#   .\start-instances.ps1                # 4 instances on 50011-50014 (default)
#   .\start-instances.ps1 -Count 6        # 6 instances on 50011-50016
#   .\start-instances.ps1 -BasePort 50021 -Count 3
#
# Stop: close each instance's window (or Ctrl+C in it) — there's no single
# "stop all" here on purpose, so you can take one instance down for
# maintenance without killing the others mid-shift.

param(
  [int]$Count = 4,
  [int]$BasePort = 50011,
  [int]$ThreadsPerInstance = 8
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$runner = Join-Path $scriptDir "run-instance.ps1"
$urls = @()

for ($i = 0; $i -lt $Count; $i++) {
  $port = $BasePort + $i
  $urls += "http://localhost:$port"

  Write-Host "Starting face-back instance $($i + 1)/$Count on port $port..."

  Start-Process powershell -ArgumentList "-NoExit", "-File", $runner, "-Port", $port, "-Threads", $ThreadsPerInstance
}

Write-Host ""
Write-Host "$Count instance(s) starting. Set this on the Node server (.env or environment) to use the pool:" -ForegroundColor Yellow
Write-Host "  FACE_API_URLS=$($urls -join ',')" -ForegroundColor Cyan
Write-Host ""
Write-Host "(FACE_API_URL, singular, still works for a single instance -- FACE_API_URLS is only needed to add more.)"
