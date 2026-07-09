$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

& "$PSScriptRoot\build.ps1"

Set-Location $PSScriptRoot\backend

Write-Host "[music] Installing Python dependencies..." -ForegroundColor Cyan
python -m pip install -r requirements.txt

$port = if ($env:PORT) { $env:PORT } else { "8080" }
$hostAddr = if ($env:HOST) { $env:HOST } else { "0.0.0.0" }

$env:SERVE_STATIC = "1"

Write-Host "[music] Production server -> http://127.0.0.1:$port" -ForegroundColor Green
Write-Host "[music] API + UI on one port (SERVE_STATIC=1)" -ForegroundColor Cyan
python -m uvicorn main:app --host $hostAddr --port $port
