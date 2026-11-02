@echo off
setlocal
title AhmedStore
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0mens-store-dashboard\Start-Local.ps1" -OpenBrowser %*
if errorlevel 1 (
  echo.
  echo AhmedStore could not start. Check the error above.
  pause
  exit /b 1
)
exit /b 0
