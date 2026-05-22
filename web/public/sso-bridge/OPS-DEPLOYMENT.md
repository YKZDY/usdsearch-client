＃ SSO Bridge 桥接页 — 运维部署指南

> **场景**：本地开发者（`localhost:3000`）需要在本机调试 SSO 登录流程。  
> **问题**：SSO 弹窗运行在 `lightart-dev.woa.com`，token 写到弹窗域的 localStorage，主页（localhost）跨域读不到。  
> **方案**：在 lightart-dev.woa.com 上部署一段桥接脚本，登录成功后通过 `postMessage` 把 token 跨域投递回开发者主页。  
> **影响范围**：仅开发体验改进，**不影响生产环境（ov.qq.com）的 SSO 登录流程**。生产环境同域部署，无需此桥接。

---

## 一、需要部署的文件

来自 git 仓库 `usdsearch-client/web/public/sso-bridge/`：

| 文件            | 说明                                            | 大小   |
| --------------- | ----------------------------------------------- | ------ |
| `index.html`    | 备用入口页（直接访问 `/sso-bridge/` 时显示）    | ~12 KB |
| `post-token.js` | **核心桥接脚本**（注入到 `/omni/auth/` 响应中） | ~9 KB  |

---

## 二、部署步骤（共 5 步，约 10 分钟）

### 步骤 1：上传文件到服务器

```bash
# 在跳板机或本机执行
ssh ops@lightart-dev.woa.com

sudo mkdir -p /var/www/sso-bridge
sudo chown -R nginx:nginx /var/www/sso-bridge
sudo chmod 755 /var/www/sso-bridge

exit

# 上传文件（在本地执行）
scp web/public/sso-bridge/index.html      ops@lightart-dev.woa.com:/var/www/sso-bridge/
scp web/public/sso-bridge/post-token.js   ops@lightart-dev.woa.com:/var/www/sso-bridge/
```

### 步骤 2：在 nginx 加 location，暴露 `/sso-bridge/`

找到 lightart-dev.woa.com 当前的 nginx server 配置文件（通常在 `/etc/nginx/conf.d/` 或 `/etc/nginx/sites-available/` 下，名字类似 `lightart-dev.conf`）。

在该 `server { ... }` 块内**追加**：

```nginx
# === SSO Bridge: 静态文件入口 ===
location /sso-bridge/ {
    alias /var/www/sso-bridge/;
    index index.html;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    add_header X-Content-Type-Options "nosniff";
}
```

### 步骤 3：在 `/omni/auth/` 加 `sub_filter`，注入桥接脚本

找到现有的 `location /omni/auth/ { ... }` 块（demo 的 [nginx-server-block.conf](file:///D:/period/usdsearch-explorer/nginx-server-block.conf) 里有），在里面**追加** sub_filter 相关指令：

```nginx
location /omni/auth/ {
    proxy_pass http://nucleus-auth-usdsearch:3180;

    # === 已有的 proxy_set_header 等保留 ===
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # === 新增：SSO Bridge 注入 ===
    # 关闭 gzip，否则 sub_filter 拿不到原始 HTML
    proxy_set_header Accept-Encoding "";

    # 在 </body> 前插入桥接脚本
    sub_filter_once on;
    sub_filter_types text/html;
    sub_filter '</body>' '<script src="/sso-bridge/post-token.js"></script></body>';
}
```

> **说明**：`sub_filter` 是 nginx 内置模块（`ngx_http_sub_module`），大多数发行版默认编译进去。  
> 验证是否可用：`nginx -V 2>&1 | grep -o with-http_sub_module`，有输出即可用。

### 步骤 4：重载 nginx

```bash
sudo nginx -t              # 必须先做语法检查
sudo nginx -s reload       # 平滑重启，不中断现有连接
```

### 步骤 5：验证部署

#### 5.1 桥接页可访问

```bash
curl -I https://lightart-dev.woa.com/sso-bridge/post-token.js
# 期望：HTTP/1.1 200 OK
#       Content-Type: application/javascript
```

#### 5.2 sub_filter 生效

```bash
curl -s https://lightart-dev.woa.com/omni/auth/login | grep "post-token.js"
# 期望：能看到 <script src="/sso-bridge/post-token.js"></script></body>
```

#### 5.3 浏览器端测试（开发者侧）

1. 开发者本地启动：`cd web && npm start`
2. 浏览器打开 `http://localhost:3000/?server=ov.qq.com`
3. 点 SSO 登录按钮 → 弹窗打开
4. URL 应是 `https://lightart-dev.woa.com/omni/auth/login?opener_origin=http%3A%2F%2Flocalhost%3A3000`
5. 完成 SSO 流程
6. 弹窗右上角应出现金色边框小提示框："登录成功，正在返回主页…"
7. 0.5 秒后弹窗自动关闭，主页变为已登录状态 ✅

---

## 三、安全说明

桥接脚本有严格的安全设计，**不会泄露 token 给未授权的页面**：

1. **Origin 白名单**：只接受来自以下 origin 的 opener：
   - `http://localhost:3000`
   - `http://127.0.0.1:3000`
   - `https://lightart-dev.woa.com`
   - `https://market.lightart-dev.woa.com`
2. **必须是弹窗模式**：没有 `window.opener` 时脚本直接 `return`，对普通用户使用 SSO 完全无影响。
3. **Origin 必须显式声明**：通过 query 参数 `?opener_origin=...` 传入，且必须在白名单里才会发 postMessage。
4. **JWT 格式校验**：写入 localStorage 的字符串必须符合 JWT 三段式（`xxx.xxx.xxx`）才会被发送，避免发送脏数据。
5. **不修改 Nucleus Auth 任何 DOM/CSS/JS**：纯独立脚本，对原页面零侵入。
6. **不影响普通用户**：直接访问 `/omni/auth/login`（不带 opener_origin 或不在弹窗里）的用户，脚本静默退出。

---

## 四、回滚方案

如果需要撤销部署，**两步即可**：

```bash
# 1. 编辑 nginx 配置，删除两个新增的 location 块（或注释掉）
sudo vi /etc/nginx/conf.d/lightart-dev.conf

# 2. reload
sudo nginx -t && sudo nginx -s reload

# 3. （可选）删除文件
sudo rm -rf /var/www/sso-bridge
```

回滚后立即恢复到部署前状态，不影响现有 SSO 登录流程。

---

## 五、常见问题

### Q1：为什么需要关闭 gzip（`Accept-Encoding ""`）？

A：sub_filter 工作在 nginx 的 HTTP filter 层，如果上游返回的是 gzip 压缩内容，nginx 拿到的是二进制压缩流，无法做字符串替换。强制 `Accept-Encoding ""` 让上游返回未压缩 HTML。

### Q2：会不会影响 Nucleus Auth 的页面性能？

A：脚本只有 9 KB（uncompressed），且加载在 `</body>` 前，不阻塞渲染。对正常用户体验无感知。

### Q3：能否限制只对开发环境注入？

A：当前实现是无差别注入，但脚本内已自带 `if (!window.opener) return;` 短路逻辑——只有从弹窗打开（opener 存在）且 query 带白名单 origin 时才激活。普通用户访问完全静默，等同于没注入。

### Q4：生产环境（ov.qq.com）需要部署吗？

A：**不需要**。生产环境主页和 SSO 弹窗同域（都在 `ov.qq.com`），localStorage 同源共享，原生流程已能跑通。本桥接仅用于本地开发跨域。

### Q5：如何打开调试日志？

A：开发者在浏览器 Console 执行 `window.__SSO_BRIDGE_DEBUG__ = true` 后再触发登录，会看到 `[SSO-Bridge] ...` 日志。

---

## 六、联系人

- 项目侧：UsdSearch Client 前端开发者
- 仓库：`usdsearch-client`（fork 自 NVIDIA-Omniverse）
- 部署文件源路径：`web/public/sso-bridge/`
- 设计文档：`docs/superpowers/specs/2026-05-14-sso-login-migration-design.md`
