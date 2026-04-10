<#
.SYNOPSIS
    一键启动 DeepSearch Explorer 本地预览（含 Mock 后端）

.DESCRIPTION
    此脚本会：
    1. 检查 Node.js 环境
    2. 安装依赖（如有缺失）
    3. 启动 CRA 开发服务器 + Mock API 代理
    4. 自动打开浏览器到预览页面

.NOTES
    文件:   dev-preview.ps1
    用途:   本地化测试 / UI 预览 / i18n 验证
#>

param(
    [switch]$NoBrowser,        # 不自动打开浏览器
    [switch]$Chinese,          # 默认使用中文界面
    [int]$Port = 3210          # 开发服务器端口
)

$ErrorActionPreference = "Stop"

# ---------- 颜色输出工具函数 ----------
function Write-Step($msg)    { Write-Host "▸ $msg" -ForegroundColor Cyan }
function Write-Success($msg) { Write-Host "✓ $msg" -ForegroundColor Green }
function Write-Warn($msg)    { Write-Host "⚠ $msg" -ForegroundColor Yellow }

$projectRoot = Split-Path -Parent $PSScriptRoot  # usdsearch-client/
$webDir      = Join-Path $projectRoot "web"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║   DeepSearch Explorer - 本地预览启动器       ║" -ForegroundColor Yellow
Write-Host "║   Mock API Mode (无需后端服务器)             ║" -ForegroundColor Yellow
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Yellow
Write-Host ""

# ---------- Step 1: 环境检查 ----------
Write-Step "检查 Node.js 环境..."
try {
    $nodeVersion = & node --version 2>&1
    Write-Success "Node.js $nodeVersion"
} catch {
    Write-Host "✗ 未找到 Node.js，请先安装: https://nodejs.org/" -ForegroundColor Red
    exit 1
}

try {
    $npmVersion = & npm --version 2>&1
    Write-Success "npm v$npmVersion"
} catch {
    Write-Host "✗ 未找到 npm" -ForegroundColor Red
    exit 1
}

# ---------- Step 2: 安装依赖 ----------
Write-Step "检查项目依赖..."
$nodeModules = Join-Path $webDir "node_modules"
if (-not (Test-Path $nodeModules)) {
    Write-Warn "node_modules 不存在，正在安装依赖..."
    Push-Location $webDir
    & npm install
    Pop-Location
    Write-Success "依赖安装完成"
} else {
    Write-Success "依赖已就绪"
}

# ---------- Step 3: 验证 Mock Proxy ----------
Write-Step "验证 Mock API 代理..."
$proxyFile = Join-Path $webDir "src\setupProxy.js"
if (Test-Path $proxyFile) {
    Write-Success "setupProxy.js 已就绪 → 后端 API 请求将返回模拟数据"
} else {
    Write-Warn "setupProxy.js 不存在！将使用真实后端（如已配置）"
}

# ---------- Step 4: 配置语言 ----------
if ($Chinese) {
    Write-Step "预设界面语言为中文..."
    Write-Host "  (应用启动后也可通过右上角按钮切换)" -ForegroundColor DarkGray
}

# ---------- Step 5: 启动开发服务器 ----------
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Step "启动开发服务器 (端口: $Port)..."
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray

$env:PORT = $Port
$env:BROWSER = "none"  # 先禁用 CRA 自动开浏览器，我们手动控制

Push-Location $webDir

# 启动浏览器（延迟几秒等服务器启动）
if (-not $NoBrowser) {
    $url = "http://localhost:$Port"
    if ($Chinese) {
        # 通过 URL fragment 暗示中文（localStorage 会在 LanguageContext 中处理）
        $url = "$url#lang=zh"
    }
    Start-Job -ScriptBlock {
        param($url, $seconds)
        Start-Sleep -Seconds $seconds
        Start-Process $url
    } -ArgumentList $url, 6 | Out-Null
    
    Write-Host ""
    Write-Success "浏览器将在服务器就绪后自动打开: $url"
    Write-Host ""
}

Write-Host "  提示:" -ForegroundColor DarkGray
Write-Host "  • 按 Ctrl+C 停止服务器" -ForegroundColor DarkGray
Write-Host "  • 修改代码后浏览器会自动热更新" -ForegroundColor DarkGray
Write-Host "  • 右上角按钮可切换 中文/English" -ForegroundColor DarkGray
Write-Host ""

# 启动 CRA dev server
& npm start

Pop-Location
