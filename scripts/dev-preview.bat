@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
title DeepSearch Explorer - Local Preview

echo.
echo ========================================
echo   DeepSearch Explorer - Local Preview
echo   Mock API Mode
echo ========================================
echo.

:: Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found!
    echo.
    echo Please install Node.js v18+: https://nodejs.org/
    echo Then restart terminal and run this script again.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do (
    echo [OK] Node.js %%v
)

:: Navigate to web directory
cd /d "%~dp0..\web"
echo [OK] Working directory: %cd%

:: Install dependencies if needed
if not exist "node_modules" (
    echo.
    echo [INFO] Installing dependencies, please wait...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed!
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed
) else (
    echo [OK] Dependencies ready
)

:: Check setupProxy.js
if exist "src\setupProxy.js" (
    echo [OK] Mock API proxy ready
) else (
    echo [WARN] setupProxy.js not found, will use real backend
)

echo.
echo ----------------------------------------
echo   Starting dev server...
echo   URL: http://localhost:3210
echo   Press Ctrl+C to stop
echo ----------------------------------------
echo.

:: Delay-open browser
start "" /B cmd /c "timeout /t 8 /nobreak >nul & start http://localhost:3210"

:: Start dev server
set PORT=3210
set BROWSER=none
call npm start

endlocal
