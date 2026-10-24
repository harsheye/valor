@echo off
title Valor Local Media Companion Engine
cls
echo ============================================================
echo   ⚡ VALOR LOCAL MEDIA ENGINE (Port 45454)
echo ============================================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in your PATH.
    echo Please install Node.js (v18+) from https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo Starting Valor Companion Service...
node "%~dp0valor-service.mjs"
pause
