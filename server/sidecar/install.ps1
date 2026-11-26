# ════════════════════════════════════════════════════════════════════════════
# ⚡ VALOR LOCAL MEDIA ENGINE — WINDOWS POWERSHELL INSTALLER
# Usage:
#   irm http://<your-valor-host>/api/sidecar/install.ps1 | iex
# ════════════════════════════════════════════════════════════════════════════

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   ⚡ VALOR LOCAL MEDIA COMPANION ENGINE INSTALLER" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Determine target host from caller script URL or default
$HostOrigin = "http://127.0.0.1:80"
if ($MyInvocation.MyCommand.Path) {
    try {
        $uri = [System.Uri]$MyInvocation.MyCommand.Path
        $HostOrigin = "$($uri.Scheme)://$($uri.Authority)"
    } catch {}
}

$InstallDir = Join-Path $HOME ".valor-service"
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

$ServiceFile = Join-Path $InstallDir "valor-service.mjs"
$BatFile = Join-Path $InstallDir "run-valor-service.bat"
$DesktopBat = Join-Path ([Environment]::GetFolderPath("Desktop")) "Run Valor Engine.bat"

# Check Node.js
Write-Host "[1/3] Checking Node.js runtime..." -ForegroundColor Yellow
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "  (!) Node.js was not found on your system." -ForegroundColor Red
    Write-Host "  Installing Node.js via winget..." -ForegroundColor Yellow
    try {
        winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    } catch {}
    
    if (-not $nodeCmd) {
        Write-Host "  Please install Node.js (v18+) from https://nodejs.org and rerun this script." -ForegroundColor Red
        return
    }
}
Write-Host "  ✓ Node.js detected: $(node -v)" -ForegroundColor Green

# Download Service Script
Write-Host "[2/3] Downloading Valor Local Media Engine..." -ForegroundColor Yellow
$DownloadUrl = "$HostOrigin/api/sidecar/valor-service.mjs"
try {
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $ServiceFile -UseBasicParsing
    Write-Host "  ✓ Engine downloaded to $ServiceFile" -ForegroundColor Green
} catch {
    Write-Host "  Could not download from $DownloadUrl. Checking fallback local source..." -ForegroundColor Yellow
}

# Create 1-click batch launcher
$BatContent = @"
@echo off
title Valor Local Media Companion Engine
cls
echo ============================================================
echo   ⚡ VALOR LOCAL MEDIA ENGINE (Port 45454)
echo ============================================================
echo Starting service...
node "%~dp0valor-service.mjs"
pause
"@
Set-Content -Path $BatFile -Value $BatContent -Encoding ASCII

# Copy launcher to Desktop for easy access
try {
    Copy-Item -Path $BatFile -Destination $DesktopBat -Force
    Write-Host "  ✓ Created Desktop shortcut: 'Run Valor Engine.bat'" -ForegroundColor Green
} catch {}

# Start the Service
Write-Host "[3/3] Starting Valor Local Media Engine on http://127.0.0.1:45454..." -ForegroundColor Yellow
Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor Cyan
Write-Host "  Engine is starting now in this window." -ForegroundColor White
Write-Host "  Keep this terminal open while watching remote media in Valor." -ForegroundColor Gray
Write-Host "------------------------------------------------------------" -ForegroundColor Cyan
Write-Host ""

& node $ServiceFile
