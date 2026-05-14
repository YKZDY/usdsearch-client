# SSO 弹窗登录改造 - 实现计划

## Context

usdsearch-client 项目需要将登录方式从复杂的 Device Flow（手动复制粘贴验证码）改为简单的 SSO 弹窗登录（一键登录）。参照 usdsearch-explorer demo 的实现方式。详细设计文档见 `docs/superpowers/specs/2026-05-14-sso-login-migration-design.md`。

## 关键文件

- `D:\period\usdsearch-client\web\src\index.js` — AuthForm 组件（主要改造目标）
- `D:\period\usdsearch-client\web\src\hooks\useAuthGuard.js` — Token 验证 & 请求头构造
- `D:\period\usdsearch-client\web\src\utils\authStorage.js` — Token 存储管理
- `D:\period\usdsearch-client\web\src\nucleus.jsx` — createApiToken() 函数（复用）
- `D:\period\usdsearch-client\web\src\setupProxy.js` — 开发代理配置
- `D:\period\usdsearch-client\web\src\config.jsx` — 服务器配置
- `D:\period\usdsearch-explorer\index.html` — Demo 参考实现
- `D:\period\usdsearch-explorer\nginx-server-block.conf` — Nginx 路由参考

## 实现步骤

### Step 1: 添加开发代理路径

**文件：** `web/src/setupProxy.js`

添加 `/omni/auth/` 路径到代理配置，让本地开发时 SSO 弹窗能正常工作。

### Step 2: authStorage.js 扩展

**文件：** `web/src/utils/authStorage.js`

新增方法：
- `getSSOToken()` — 从 localStorage 读取 `omni_access_token`
- `persistSSOToken(server, jwt, apiToken)` — SSO 登录后存储所有必要 token（JWT + 永久 API Token）
- `clearSSOToken()` — 清除 SSO 相关 token
- 修改 `getStoredAuth(server)` — 增加对 `omni_access_token` 的检测

### Step 3: AuthForm 组件改造

**文件：** `web/src/index.js`

核心改造：
- 新增 SSO 登录逻辑：`window.open('/omni/auth/login')` + localStorage 轮询
- 检测到 JWT 后调用 `createApiToken()` 创建永久 Token
- 存储 token 到 localStorage（复用现有 persistNucleusToken 格式）
- 隐藏 Device Flow / Basic Auth / API Key 的 UI 选项
- 只显示"Log in with 离岸太湖 SSO"按钮
- UI 使用 frontend-design skill 确保与项目暗色主题一致

### Step 4: useAuthGuard.js 适配

**文件：** `web/src/hooks/useAuthGuard.js`

修改请求头构造逻辑：
- 优先检查 `omni_access_token`（Bearer token）
- 回退到已有的 Basic Auth 逻辑
- 修改 token 验证逻辑以支持 SSO JWT

### Step 5: 登出逻辑适配

确保退出登录时清除所有 SSO 相关 token：
- `omni_access_token`
- `omni_refresh_token` 
- 以及所有 host-prefixed keys

### Step 6: 集成测试

- 启动开发服务器验证 SSO 弹窗流程
- 验证 Token 创建和存储
- 验证搜索 API 请求携带正确的 Authorization 头
- 验证 Tag 功能正常（WebSocket 连接使用永久 Token）
- 验证登出后状态正确清除
- 验证页面刷新保持登录态

## 验证方式

1. `npm start` 启动开发服务器
2. 访问页面，确认只看到 SSO 登录按钮
3. 点击登录，确认弹窗正常打开
4. 完成 SSO 认证后，确认弹窗关闭、UI 更新
5. 检查 localStorage 确认永久 API Token 已创建
6. 执行搜索操作验证 API 认证
7. 执行 Tag 操作验证 WebSocket 认证
8. 点击退出，确认 token 清除
