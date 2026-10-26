@echo off
setlocal
cd /d "%~dp0"
set "NODE_BIN=%~dp0runtime\node.exe"
if not exist "%NODE_BIN%" set "NODE_BIN=node"
if not exist "dist\client\index.html" goto build
if not exist "dist\server.cjs" goto build
goto run
:build
call npm run build
if errorlevel 1 goto failed
:run
"%NODE_BIN%" scripts\serve.mjs
if errorlevel 1 goto failed
exit /b 0
:failed
echo Khoi dong that bai. Xem loi ben tren va README.md.
pause
exit /b 1
