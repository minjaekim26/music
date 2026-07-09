$ErrorActionPreference = "Stop"
$env:Path = "C:\Program Files\nodejs;" + $env:Path
Set-Location $PSScriptRoot\frontend

if (-not (Test-Path "node_modules")) {
    Write-Host "[music] Installing npm packages..." -ForegroundColor Cyan
    npm install
}

Write-Host "[music] Building frontend..." -ForegroundColor Cyan
npm run build

Write-Host "[music] Build complete -> frontend\dist" -ForegroundColor Green
