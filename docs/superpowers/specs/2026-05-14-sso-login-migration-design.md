# SSO 弹窗登录改造设计

## 背景

usdsearch-client 当前使用 Nucleus Device Flow 认证，用户需要手动复制8位验证码 → 打开 Nucleus 登录页 → 粘贴代码完成验证。流程繁琐，用户体验差。

同事的 demo（usdsearch-explorer）已验证了更简单的 SSO 弹窗登录方式：点击登录 → 弹窗中点击"Log in with 离岸太湖 SSO" → 自动完成认证。我们要将 usdsearch-client 改造为这种方式。

## 目标

- 用户只能看到 SSO 登录方式，不能看到 Device Flow 选项
- 登录流程：点击登录按钮 → 弹窗 SSO → 一键完成
- Tag 功能在改造后必须正常工作
- Device Flow 代码保留但对用户不可见

## 认证流程

```
用户点击"登录"按钮
  ↓
window.open('/omni/auth/login', 'sso_login', 'width=500,height=600')
  ↓
弹窗显示 Nucleus Auth SAML 登录页
  ↓
用户点击"Log in with 离岸太湖 SSO"
  ↓
SAML 认证完成，Nucleus Auth 将 JWT 写入弹窗 localStorage（key: omni_access_token）
  ↓
主页每 500ms 轮询 localStorage.getItem('omni_access_token')
  ↓
检测到 token → 关闭弹窗
  ↓
调用 createApiToken(server, jwt, tokenName, null) 创建永久 API Token
  ↓
永久 Token 存入 localStorage（格式与 Device Flow 一致）
  ↓
派发 auth-updated 事件，UI 更新为已登录状态
```

## 核心设计

### 1. AuthForm 组件改造

**文件：** `web/src/index.js`

将 AuthForm 从三种认证方式（Basic/API Key/Device Flow）改为只显示 SSO 登录按钮。

改造点：
- 移除三种 auth method 的切换 UI
- 显示单个"Log in with 离岸太湖 SSO"按钮
- 点击后打开弹窗并启动 localStorage 轮询
- 检测到 token 后调用 createApiToken() 并保存

### 2. Token 存储策略

SSO 登录成功后的存储方式（保持与 Device Flow 一致）：

```javascript
// SSO JWT（原始）
localStorage.setItem('omni_access_token', jwt);

// 永久 API Token（通过 createApiToken 创建）
localStorage.setItem(`${host}_username`, '$omni-api-token');
localStorage.setItem(`${host}_password`, permanentApiToken);
localStorage.setItem(`${host}_nucleus_api_token`, permanentApiToken);

// access token 用于 Tag 功能的 WebSocket 连接
localStorage.setItem(`${host}_nucleus_access_token`, jwt);
localStorage.setItem(`${host}_nucleus_access_token_expiry`, String(Date.now() + 25 * 60 * 1000));
```

### 3. 请求头构造

**文件：** `web/src/hooks/useAuthGuard.js`

API 请求认证优先级：
1. `omni_access_token` (SSO JWT) → `Authorization: Bearer <token>`
2. `${host}_password` (永久 API Token) → `Authorization: Basic $omni-api-token:<token>`
3. 回退到 Basic Auth（username:password）

### 4. Tag 功能兼容

**关键机制：** SSO 登录后立即调用 `createApiToken()` 创建永不过期的 API Token。

- `createApiToken(serverUrl, accessToken, tokenName, null)` — `null` 表示永不过期
- 永久 Token 写入 `${host}_username` + `${host}_password`
- Tag 的 3 层 token 查找链（host-prefixed → alias-prefixed → bare key）能正常找到
- Tag 的 WebSocket 连接使用永久 API Token 或 access_token
- 用户不退出登录就永远不会过期

### 5. Device Flow 代码处理

- **不删除** `nucleus.jsx` 中的 Device Flow 代码
- **不删除** `useDeviceFlowAuth`、`useCreateApiToken` hooks
- 通过 AuthForm UI 层隐藏 Device Flow 入口（用户看不到）
- 保留 `createApiToken()` 函数供 SSO 流程复用

### 6. UI 设计要求

登录组件的 UI 需要：
- 与当前项目的暗色主题风格保持一致
- 视觉上美观、专业
- 使用 frontend-design 或相关 UI skills 确保组件设计质量
- 登录按钮样式参照 demo 的"Log in with 离岸太湖 SSO"绿色按钮风格

### 7. 开发环境支持

**文件：** `web/src/setupProxy.js`

添加 `/omni/auth/` 代理路径：
```javascript
app.use('/omni/auth', createProxyMiddleware({
  target: PROXY_TARGET,
  changeOrigin: true
}));
```

### 8. Nginx 部署配置

确保以下路由存在（参照 usdsearch-explorer 的 nginx 配置）：

```nginx
location /omni/auth/api/ {
  set $auth_backend "nucleus-auth-usdsearch.lightart-base.svc.cluster.local";
  rewrite ^/omni/auth/api/(.*) /$1 break;
  proxy_pass http://$auth_backend:8000;
}

location /omni/auth/ {
  set $auth_backend "nucleus-auth-usdsearch.lightart-base.svc.cluster.local";
  rewrite ^/omni/auth/(.*) /$1 break;
  proxy_pass http://$auth_backend:3180;
}
```

## 需要修改的文件

| 文件 | 改动说明 |
|------|---------|
| `web/src/index.js` | AuthForm 组件：SSO 按钮 + 弹窗逻辑 + createApiToken 调用 |
| `web/src/hooks/useAuthGuard.js` | 请求头构造：优先读取 omni_access_token |
| `web/src/utils/authStorage.js` | 新增 SSO token key 的读写方法 |
| `web/src/setupProxy.js` | 添加 /omni/auth/ 代理 |
| `web/src/config.jsx` | 可能需要添加 SSO 相关配置常量 |

## 登出逻辑

```javascript
function logout() {
  localStorage.removeItem('omni_access_token');
  localStorage.removeItem('omni_refresh_token');
  localStorage.removeItem(`${host}_username`);
  localStorage.removeItem(`${host}_password`);
  localStorage.removeItem(`${host}_nucleus_api_token`);
  localStorage.removeItem(`${host}_nucleus_access_token`);
  localStorage.removeItem(`${host}_nucleus_access_token_expiry`);
  localStorage.removeItem(`${host}_nucleus_refresh_token`);
  // 标记用户主动退出
  localStorage.setItem(`${host}_auth_cleared`, 'true');
}
```

## 弹窗拦截处理

内部工具环境下弹窗拦截概率低，但作为兜底：
- 如果 `window.open()` 返回 null，显示提示"请允许弹窗"
- 或提供备用链接让用户手动在新标签页打开

## 验证计划

1. **SSO 登录流程**：点击登录 → 弹窗 → SSO → 关闭弹窗 → 显示已登录
2. **Token 创建**：登录后检查 localStorage 是否包含永久 API Token
3. **搜索功能**：登录后搜索请求携带正确的 Authorization 头
4. **Tag 功能**：登录后能正常添加/删除 Tag，WebSocket 连接正常
5. **登出功能**：退出后 localStorage 清空，回到登录页
6. **跨标签页**：一个标签页登录后，其他标签页自动同步
7. **页面刷新**：登录后刷新页面保持登录态
