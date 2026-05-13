@echo off
REM ============================================================
REM  双击入口：调用同目录的 build-and-pack.ps1
REM  完成后窗口保持打开（pause），方便看到输出和报错
REM ============================================================

setlocal
set SCRIPT_DIR=%~dp0

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%build-and-pack.ps1" %*
set EXITCODE=%ERRORLEVEL%

echo.
if %EXITCODE% NEQ 0 (
    echo [ERROR] build-and-pack.ps1 exited with code %EXITCODE%
) else (
    echo [OK] All done.
)

pause
exit /b %EXITCODE%
