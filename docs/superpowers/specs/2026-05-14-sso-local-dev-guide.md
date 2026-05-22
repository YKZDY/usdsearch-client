# SSO 本地开发联调指南（postMessage 中转方案）

> 本文档配套 `2026-05-14-sso-login-migration-design.md` 与 `2026-05-14-sso-local-dev-bridge` 计划，
> 提供从 nginx 配置、文件部署到端到端验证的完整步骤，让任何后续接手者无需读源码即可上线。
>
> 适用范围：`d:/period/usdsearch-client/` —— 远程域 `lightart-dev.woa.com`。

---

## 1. 改造架构一图流

```
┌──────────────────────┐         postMessage           ┌────────────────────────────┐
│ 主页 localhost:3000  │  ◀──────────────────────────  │  弹窗 lightart-dev.woa.com │
│                      │                                │  /omni/auth/  (Nucleus)    │
│  ssoBridge.start()   │                                │   ↑                        │
│  + localStorage poll │                                │   │ sub_filter 注入        │
│  双通道，一次性锁    │                                │   │                        │
└──────────────────────┘                                │  /sso-bridge/post-token.js │
                                                        │   读 localStorage          │
                                                        │   → window.opener.post...  │
                                                        └────────────────────────────┘
```

涉及的远程改动 **只有 nginx 一处文件**：

1. 上传两个静态文件到 nginx 静态目录
2. nginx server block 追加 1 个 location + 1 段 `sub_filter` 指令
3. `nginx -s reload`

后端服务 / SAML 配置 / Nucleus Auth 镜像 **无需任何变动**。

---

## 2. 文件清单（已生成在仓库内）

| 文件                                  | 用途                                                   |
| ------------------------------------- | ------------------------------------------------------ |
| `web/public/sso-bridge/post-token.js` | 中转脚本，注入到 Nucleus Auth 默认页                   |
| `web/public/sso-bridge/index.html`    | fallback 调试页 + 「复制 token」应急通道               |
| `web/src/utils/ssoBridge.js`          | 主页侧 postMessage 监听工具模块                        |
| `web/src/index.js`（已改造）          | `handleSSOLogin` 双通道 + 60s 兜底                     |
| `web/src/config.jsx`（已扩展）        | `AUTH_CONFIG.SSO_BRIDGE_TRUSTED_ORIGINS` / `SSO_DEBUG` |
| `web/.env.local`（已文档化）          | 三个新变量的注释模板                                   |
| `web/src/i18n/{en,zh}.js`（已扩展）   | 22 个 SSO 桥接相关 i18n key                            |

---

## 3. nginx 配置追加片段（diff）

> 在 `lightart-dev.woa.com` 的 nginx server block 中，追加以下两段。

### 3.1 静态资源 location（提供 `/sso-bridge/`）

```nginx
# === LM CUSTOMIZATION: SSO Bridge static — postMessage 跨域 token 桥接静态文件 ===
location /sso-bridge/ {
    alias /var/www/sso-bridge/;          # 与 web/public/sso-bridge 内容保持同步
    expires 5m;                          # 调试期短缓存，正式发布可拉长
    add_header Cache-Control "public, max-age=300";
    types {
        application/javascript js;
        text/html html;
    }
}
# === END LM CUSTOMIZATION: SSO Bridge static ===
```

### 3.2 在 `/omni/auth/` location 内追加 `sub_filter`

> 找到现有的 Nucleus Auth UI 反代 location，在 `proxy_pass` 后追加 `sub_filter` 指令。

```nginx
# 反代 Nucleus Auth UI（已有）
location /omni/auth/ {
    proxy_pass http://nucleus-auth-usdsearch:3180;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # === LM CUSTOMIZATION: SSO Bridge sub_filter — 注入 postMessage 中转脚本 ===
    # 关闭上游 gzip：sub_filter 必须基于明文响应才能匹配替换
    proxy_set_header Accept-Encoding "";
    sub_filter_once on;                  # 仅注入一次，避免重复加载
    sub_filter_types text/html;          # 仅作用于 HTML 响应（不影响 API JSON）
    sub_filter '</body>'
               '<script src="/sso-bridge/post-token.js?v=20260514"></script></body>';
    # === END LM CUSTOMIZATION: SSO Bridge sub_filter ===
}
```

### 3.3 应用配置

```bash
sudo nginx -t                    # 校验语法
sudo nginx -s reload             # 平滑 reload，无需重启服务
```

---

## 4. 部署步骤

```bash
# 1) 在远程服务器创建静态目录
sudo mkdir -p /var/www/sso-bridge
sudo chown -R $(whoami):$(whoami) /var/www/sso-bridge

# 2) 从仓库上传两个文件（示例：用 scp）
scp web/public/sso-bridge/post-token.js  user@lightart-dev.woa.com:/var/www/sso-bridge/
scp web/public/sso-bridge/index.html     user@lightart-dev.woa.com:/var/www/sso-bridge/

# 3) 套用 §3 的 nginx 配置改动 → reload

# 4) 验证（详见 §5）
```

> **版本更新**：每次修改 `post-token.js` 后，把 §3.2 sub_filter 中的 `?v=20260514`
> 改成新日期或文件 hash，浏览器即可立刻拉取新版，不会被长时间缓存吃掉。

---

## 5. 验证命令清单

### 5.1 静态资源可达

```bash
# 期望返回 200 + Content-Type: application/javascript
curl -I https://lightart-dev.woa.com/sso-bridge/post-token.js

# 期望返回 200 + Content-Type: text/html
curl -I https://lightart-dev.woa.com/sso-bridge/

# 真实下载脚本，肉眼检查首行注释 + 关键字
curl -s https://lightart-dev.woa.com/sso-bridge/post-token.js | head -20
```

### 5.2 sub_filter 注入生效

```bash
# 期望在响应体中看到 <script src="/sso-bridge/post-token.js?v=...">
curl -s https://lightart-dev.woa.com/omni/auth/ | grep sso-bridge
```

如未匹配到任何输出，说明 sub_filter 未生效，参考 §7 故障排查的「sub_filter 不工作」章节。

### 5.3 浏览器人工验证

1. 打开 `https://lightart-dev.woa.com/omni/auth/`
2. 浏览器 DevTools → Sources → 应能看到 `/sso-bridge/post-token.js` 文件被加载
3. 控制台无报错（`window.opener` 为 null 时脚本完全静默，符合预期）

---

## 6. 本地开发启动步骤

### 6.1 配置 `.env.local`

打开 `web/.env.local`，按需启用以下变量（取消注释即可）：

```bash
# SSO 弹窗目标 URL（本地开发必填，指向已部署中转脚本的远程域）
REACT_APP_SSO_LOGIN_URL=https://lightart-dev.woa.com/omni/auth/login

# 调试日志（首次联调强烈建议打开）
REACT_APP_SSO_DEBUG=true

# 仅当主页运行在内置白名单之外的域时才需要追加
# REACT_APP_SSO_BRIDGE_TRUSTED_ORIGINS=https://my-extra-test.example.com
```

### 6.2 启动开发服务器

```bash
cd web
npm install                # 首次或依赖变更后
npm start                  # 默认监听 3000 端口
```

### 6.3 验证流程

1. 浏览器打开 http://localhost:3000
2. 顶栏点击「Log in with SSO」按钮
3. 弹窗加载 Nucleus Auth 登录页，URL 应包含 `?opener_origin=http%3A%2F%2Flocalhost%3A3000`
4. 完成 SAML 登录
5. 弹窗右上角出现金色边框浮层「登录成功，正在返回主页…」
6. 弹窗 0.5s 后自动关闭
7. 主页 toast「认证成功！」，顶栏切换为已登录状态

DevTools 控制台开启调试模式后应能看到（前缀 `[SSO]`）：

- `bridge started, trusted origins: [...]`
- `received message: sso-token from origin: https://lightart-dev.woa.com`
- `processing token via channel: postMessage`

---

## 7. 故障排查

### 7.1 弹窗一直白屏 / 报跨域错误

- 检查 `REACT_APP_SSO_LOGIN_URL` 是否使用 **绝对地址**（本地开发必须）
- 检查 `nginx -s reload` 是否成功（`sudo journalctl -u nginx -n 50`）
- 检查 SAML IdP 配置是否仍指向 `lightart-dev.woa.com`（不要改）

### 7.2 弹窗显示 Nucleus Auth 默认页但主页没收到 token

按以下顺序排查：

1. **sub_filter 未生效**：执行 `curl -s https://lightart-dev.woa.com/omni/auth/ | grep sso-bridge`
   - 无输出 → 检查上游是否仍启用 gzip：必须 `proxy_set_header Accept-Encoding "";` 才能让 sub_filter 拿到明文
   - 仍无 → 检查 nginx 是否编译了 `--with-http_sub_module`：`nginx -V 2>&1 | grep -o sub_module`，无输出走 §8 回退
2. **opener_origin 解析失败**：弹窗 URL 必须带 `?opener_origin=...`
   - 在中转脚本中开 `window.__SSO_BRIDGE_DEBUG__ = true`（或访问 `/sso-bridge/` 调试页查看）
3. **白名单不匹配**：弹窗控制台报「opener_origin from query not in whitelist」
   - 在 `post-token.js` 的 `TRUSTED_ORIGINS` 数组里追加你的 origin，或在 `.env.local`
     用 `REACT_APP_SSO_BRIDGE_TRUSTED_ORIGINS` 追加（**主页与中转脚本两处都要改**）
4. **token 格式不合法**：主页 toast「Received invalid token format」
   - 通常是 Nucleus Auth 写入了非 JWT（如 sessionId）；检查 Nucleus Auth 版本

### 7.3 60 秒兜底超时

主页 toast「登录超时」 → 检查：

- 弹窗内是否完成了 SAML 流程
- DevTools 网络面板是否能看到 `/sso-bridge/post-token.js` 200
- 控制台是否有跨域错误（`X-Frame-Options` / CSP）

### 7.4 调试模式开关

打开后输出更详细日志（每次轮询、每条 message、每次 origin 校验）：

- 主页：`.env.local` 里 `REACT_APP_SSO_DEBUG=true`
- 中转脚本：手动在弹窗控制台执行 `window.__SSO_BRIDGE_DEBUG__ = true; location.reload();`

---

## 8. nginx `sub_filter` 缺失时的回退方案

如果运维环境的 nginx 未编译 `http_sub_module`：

**方案 A**：手动改 Nucleus Auth 镜像的 `index.html`，在 `</body>` 前加：

```html
<script src="/sso-bridge/post-token.js?v=20260514"></script>
```

并在 `Dockerfile` 用 `sed` 一次性注入：

```dockerfile
RUN sed -i 's|</body>|<script src="/sso-bridge/post-token.js?v=20260514"></script></body>|' \
    /app/public/index.html
```

**方案 B**：在弹窗 URL 显式带上中转页：先访问 `/sso-bridge/` 调试页，然后由用户手动点 SSO 登录链接 → 但用户体验下降，仅作演示。

---

## 9. 端到端验证清单（本地 / 生产）

每次发布前按照下列清单逐项打勾。

| #   | 步骤                                                          | 期望结果                                                | 对应需求 |
| --- | ------------------------------------------------------------- | ------------------------------------------------------- | -------- |
| 1   | `npm start` 后访问 http://localhost:3000                      | 主页正常加载                                            | 9.1      |
| 2   | 点击「Log in with SSO」按钮                                   | 按钮立即转 loading；弹窗打开                            | 8.1, 9.1 |
| 3   | 弹窗 URL 包含 `?opener_origin=...`                            | URL 正确拼接                                            | 4.4      |
| 4   | 完成 SAML 登录                                                | 弹窗右上角出现金色浮层「登录成功」                      | 1.4      |
| 5   | 弹窗在 500ms 内自动关闭                                       | 弹窗关闭，主页未刷新                                    | 1.4      |
| 6   | 主页 toast「认证成功！」                                      | 顶栏切换为已登录                                        | 9.1      |
| 7   | localStorage 中存在 `omni_access_token` 与 `${host}_password` | DevTools 可见                                           | 9.1      |
| 8   | 已登录状态下执行搜索                                          | 请求头携带 `Authorization: Bearer <jwt>`，结果正常      | 9.2      |
| 9   | 已登录状态下使用 Tag 功能                                     | 永久 API Token 完成 WebSocket 连接，能添删 Tag          | 9.3      |
| 10  | 点击「退出登录」                                              | 所有 token 清空，UI 返回未登录                          | 9.4      |
| 11  | 刷新页面                                                      | 保持登录态（永久 API Token 仍在）                       | 9.5      |
| 12  | 浏览器拦截弹窗时再次点击登录                                  | toast「登录弹窗被浏览器拦截…」                          | 8.5      |
| 13  | 弹窗手动关闭（不完成登录）                                    | 1 秒内 loading 取消，按钮恢复可点                       | 8.3      |
| 14  | 60 秒不操作                                                   | toast「登录超时…」，loading 取消                        | 8.2      |
| 15  | 主页与弹窗同域生产部署（`market.lightart-dev.woa.com`）       | 流程完全一致；postMessage + localStorage 双通道并存     | 9.6, 4.3 |
| 16  | 预发环境（`lightart-dev-test`）部署同一份中转脚本             | 流程一致                                                | 9.7      |
| 17  | DevTools 控制台开启 `REACT_APP_SSO_DEBUG=true`                | 可见 `[SSO]` 前缀完整日志链路                           | 6.1, 6.3 |
| 18  | DevTools 控制台关闭 debug                                     | 仅保留关键日志，无噪音                                  | 6.3      |
| 19  | 直接访问 `https://lightart-dev.woa.com/omni/auth/`（非弹窗）  | 无浮层、无 console 报错（`window.opener` 为 null 静默） | 1.5      |
| 20  | 直接访问 `https://lightart-dev.woa.com/sso-bridge/`           | 调试页正常显示，可点「复制 token」                      | 1.9, 8.4 |

---

## 10. 生产部署核查清单（上线前必查）

- [ ] 中转脚本可达：`curl -I https://lightart-dev.woa.com/sso-bridge/post-token.js` 返回 200
- [ ] sub_filter 注入生效：`curl -s https://lightart-dev.woa.com/omni/auth/ | grep sso-bridge` 有输出
- [ ] postMessage 通道已打通：DevTools 的 `Console` 看到 `[SSO] received message: sso-token`
- [ ] localStorage 兜底通道仍工作：禁用 sub_filter 后，仍能在生产同域下完成登录
- [ ] 退出登录会清理 SSO + 永久 token：localStorage 中 `omni_access_token` / `${host}_password` 同步消失

---

## 11. 安全提示

- `post-token.js` 严格校验 `opener_origin`，仅向白名单 origin 发 postMessage，永远不用 `'*'`
- 主页校验 `event.origin` + `event.source === ssoWindowRef.current` + JWT 三段格式
- 一次性锁防止重复 `createApiToken`：postMessage 与 localStorage 任一就绪即上锁
- 中转脚本中的 `TRUSTED_ORIGINS` 与主页 `AUTH_CONFIG.SSO_BRIDGE_TRUSTED_ORIGINS` 必须保持同步
- 部署时建议给 `/sso-bridge/post-token.js` 设置短期缓存（5 分钟）+ 文件名/query 版本号，
  方便快速回滚或灰度
