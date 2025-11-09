@echo off
setlocal
set PORT=%1
if "%PORT%"=="" set PORT=5500
set DIR=%2
if "%DIR%"=="" set DIR=%cd%

echo Starting local dev server on port %PORT% (dir: %DIR%)
py "%~dp0dev_server.py" %PORT% "%DIR%"
