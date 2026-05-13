# =============================================================================
# DeepSearch UI 一键构建并打包脚本
# -----------------------------------------------------------------------------
# 功能：
#   1. 在 web/ 目录执行 `npm run build`
#   2. 把 build/ 内容打包成 zip（带时间戳，便于版本追溯）
#   3. 在工作目录留一个固定名 `deepsearch-ui-build-latest.zip` 方便覆盖发送
#
# 使用：
#   - 双击同目录下 build-and-pack.bat
#   - 或在 PowerShell 中执行：
#       powershell -ExecutionPolicy Bypass -File scripts\build-and-pack.ps1
#
# 可选参数：
#   -SkipBuild     仅打包，不重新构建（用于已构建完想换个 zip 名）
#   -OutDir <路径> 指定 zip 输出目录（默认：web/ 目录下）
# =============================================================================

[CmdletBinding()]
param(
    [switch]$SkipBuild,
    [string]$OutDir
)

$ErrorActionPreference = "Stop"

# --- 路径解析 ---------------------------------------------------------------
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$WebDir    = Resolve-Path (Join-Path $ScriptDir "..\web")
$BuildDir  = Join-Path $WebDir "build"

if (-not $OutDir) { $OutDir = $WebDir }
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

# --- 1) 构建 ----------------------------------------------------------------
if (-not $SkipBuild) {
    Write-Host ""
    Write-Host "[1/2] Running 'npm run build' in $WebDir ..." -ForegroundColor Cyan
    Push-Location $WebDir
    try {
        & npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "npm run build failed with exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "[1/2] Skipped build (using existing build/ directory)" -ForegroundColor Yellow
}

if (-not (Test-Path $BuildDir)) {
    throw "build directory not found: $BuildDir"
}

# --- 2) 打包 ----------------------------------------------------------------
$Stamp        = Get-Date -Format "yyyyMMdd-HHmmss"
$StampedZip   = Join-Path $OutDir "deepsearch-ui-build-$Stamp.zip"
$LatestZip    = Join-Path $OutDir "deepsearch-ui-build-latest.zip"

Write-Host ""
Write-Host "[2/2] Zipping build/* -> $StampedZip" -ForegroundColor Cyan
Compress-Archive -Path (Join-Path $BuildDir "*") -DestinationPath $StampedZip -Force

# 同步一份固定名，方便重复发送（覆盖式）
Copy-Item -Path $StampedZip -Destination $LatestZip -Force

# --- 结果汇总 ---------------------------------------------------------------
$info = Get-Item $StampedZip
$sizeMB = [math]::Round($info.Length / 1MB, 2)

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " Done!  Size: $sizeMB MB" -ForegroundColor Green
Write-Host "   - $StampedZip" -ForegroundColor Green
Write-Host "   - $LatestZip  (always points to the latest)" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
