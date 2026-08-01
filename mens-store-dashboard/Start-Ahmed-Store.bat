@echo off
setlocal
title Ahmed Store Launcher

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo Node.js is required to run Ahmed Store locally.
  echo Install Node.js on this store computer, then run this file again.
  echo.
  pause
  exit /b 1
)

rem Start the local SQLite server only when it is not already listening.
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (-not (Test-NetConnection -ComputerName 127.0.0.1 -Port 3000 -InformationLevel Quiet -WarningAction SilentlyContinue)) { Start-Process -FilePath node -ArgumentList 'server.mjs' -WorkingDirectory '%~dp0local-server' -WindowStyle Hidden }"

powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 2"
start "Ahmed Store" "http://localhost:3000"

endlocal
