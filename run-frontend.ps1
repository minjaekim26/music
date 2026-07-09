$ErrorActionPreference = "Stop"
$env:Path = "C:\Program Files\nodejs;" + $env:Path
Set-Location $PSScriptRoot\frontend

if (-not (Test-Path "node_modules")) {
    Write-Host "[music] Installing npm packages..." -ForegroundColor Cyan
    npm install
}

$portInUse = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
if ($portInUse) {
    $procId = $portInUse.OwningProcess
    Write-Host ""
    Write-Host "WARNING: Port 5173 is already in use (PID $procId)." -ForegroundColor Yellow
    Write-Host "  Another Vite app may be running. Close it or use the URL Vite prints below." -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "[music] Frontend -> http://localhost:5173" -ForegroundColor Green
Write-Host "[music] Requires backend on port 8020 (run run-backend.ps1 in another terminal)" -ForegroundColor Cyan
npm run dev
