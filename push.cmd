@echo off
REM push.cmd - wrapper so the .ps1 runs even when execution policy is Restricted.
REM Usage:  push "commit message"
REM         push
REM         push "message" -NoPush
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push.ps1" %*
exit /b %ERRORLEVEL%
