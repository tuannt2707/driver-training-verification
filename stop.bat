@echo off
setlocal
cd /d "%~dp0"
set "NODE_BIN=%~dp0runtime\node.exe"
if not exist "%NODE_BIN%" set "NODE_BIN=node"
"%NODE_BIN%" scripts\stop.mjs
if errorlevel 1 pause
