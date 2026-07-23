@echo off
cd /d "%~dp0"
start "" ".\node.exe" "start-app.js" %*
