@echo off
cd /d "%~dp0"
where node >nul 2>&1 || (echo Instala Node.js 24 LTS primero. & pause & exit /b 1)
if not exist node_modules call npm.cmd ci
if errorlevel 1 (pause & exit /b 1)
call npm.cmd run build
if errorlevel 1 (pause & exit /b 1)
start "" http://localhost:3000
node server.mjs
pause
