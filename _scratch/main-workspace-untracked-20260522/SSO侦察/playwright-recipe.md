# Playwright MCP 录制操作手册

> 本手册是任务 3/4/5 共用的标准动作清单。开始侦察前先读完，避免漏抓。
> 工具来自 `playwright` MCP 服务，所有调用都通过 `use_mcp_tool` 发起。

---

## 0. 前置确认

- [ ] 浏览器是否登录过 demo 站？如有，**先按下文 §3 清空 storage**，否则首次登录链路会被跳过
- [ ] 当前是否在公司内网 / SSO 可达环境？太湖 SSO 仅在内网可用
- [ ] 是否准备好接收"扫脸/点授权"环节？（手机/Authenticator）
- [ ] 是否已经新建好侦察文档（`demo-success-trace.md` 等）的空骨架？录制完后立即写入

---

## 1. 标准操作序列（Recipe）

每次录制按下面 7 步走，每步对应一次 MCP 工具调用：

### Step 1：调整窗口（可选）

```jsonc
// browser_resize
{ "width": 1440, "height": 900 }
```

### Step 2：导航到目标 URL

```jsonc
// browser_navigate
{ "url": "https://lightart-dev.woa.com/usdsearch?q=test" }
// 或
{ "url": "https://market.lightart-dev.woa.com/?server=nucleus" }
```

### Step 3：（首次登录）清空 storage（见 §3）

### Step 4：人工操作 — 在浏览器内点登录、过 SSO

> ⚠️ Playwright **不要**自动点登录按钮，因为后续 SAML 跳转涉及多个域，自动化容易卡在 popup 间。让真人点。

期间可以并行调用：

```jsonc
// browser_snapshot — 任意时刻拍可访问性快照
{}
```

### Step 5：登录完成后，一次性拉全部网络请求

```jsonc
// browser_network_requests
{
  "static": true, // 包含静态资源，不漏抓
  "filter": ".*", // 不过滤；如果太多再缩范围
}
```

需要某条请求的完整 header / body 时：

```jsonc
// browser_network_request
{
  "index": 42, // 上一步列表里的编号
  "part": "response-headers", // 或 "response-body" / "request-headers" / "request-body"
}
```

### Step 6：读取 storage 与 cookie

```jsonc
// browser_evaluate
{
  "function": "() => ({ url: location.href, ls: Object.fromEntries(Object.entries(localStorage)), ss: Object.fromEntries(Object.entries(sessionStorage)), cookieDoc: document.cookie })",
}
```

> 注意：HttpOnly cookie 读不到，只能从 §5 的 network response 里反推 `Set-Cookie` header。

### Step 7：截图收尾

```jsonc
// browser_take_screenshot
{ "type": "png", "fullPage": true, "filename": "demo-after-login.png" }
```

完成后立即把数据写入对应的 trace 文档（`demo-success-trace.md` / `market-failure-trace.md` / `relogin-comparison-trace.md`），**不要存原始 token / cookie 到文档**，只存元数据（见 README.md 的脱敏约定）。

---

## 2. Network 数据精简模板

每条 trace 文档里都用这个表格格式记录跳转链：

```markdown
| #   | Time | Method | URL（脱敏）                                   | Status          | Set-Cookie? | Set-Storage? | 备注     |
| --- | ---- | ------ | --------------------------------------------- | --------------- | ----------- | ------------ | -------- |
| 1   | 0ms  | GET    | https://lightart-dev.woa.com/usdsearch?q=test | 200             | —           | —            | 入口     |
| 2   | 12ms | GET    | /omni/auth/login                              | 302 → ov.qq.com | —           | —            | 触发 SSO |
| 3   | …    | …      | …                                             | …               | …           | …            | …        |
```

每张表后面追加「关键响应详情」段，对**关键跳转**展开：

```markdown
### 跳转 #N 详情

- 完整 URL：`<URL with sensitive params REDACTED>`
- Request Headers：（仅列与认证相关的）
  - `Cookie: <REDACTED_COOKIE keys=[A,B,C]>`
  - `Referer: <URL>`
- Response Headers：
  - `Set-Cookie: omni_token=<REDACTED>; Domain=.woa.com; Path=/; SameSite=Lax; Secure`
  - `Location: https://...`
- Response Body 摘要：（前 200 字符 + 解析后的关键字段名）
```

---

## 3. 清空 storage 与 cookie 片段（首次登录用）

**用途**：录制需求 2（demo 首次成功）和需求 3（market 首次失败）前必须清空，否则浏览器已有的 cookie/storage 会让跳转直接走"复登录快路径"，链路抓不全。

```jsonc
// browser_evaluate
{
  "function": "async () => { localStorage.clear(); sessionStorage.clear(); /* IndexedDB */ if (window.indexedDB && indexedDB.databases) { const dbs = await indexedDB.databases(); await Promise.all(dbs.map(d => new Promise((res) => { const req = indexedDB.deleteDatabase(d.name); req.onsuccess = req.onerror = () => res(); }))); } /* 当前域 cookies */ document.cookie.split(';').forEach(c => { const eq = c.indexOf('='); const name = (eq > -1 ? c.substr(0, eq) : c).trim(); document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`; document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.woa.com`; }); return { ls: localStorage.length, ss: sessionStorage.length, cookies: document.cookie }; }",
}
```

清空后 Playwright 应**返回 `{ ls: 0, ss: 0, cookies: '' }`**。

> ⚠️ `document.cookie` API 清不掉跨域和 HttpOnly cookie。如果发现复登录路径仍秒过，说明 SSO IdP 域（`tai.it.tencent.com` / `ov.qq.com`）还有 cookie 留存。这种情况：
>
> - **方案 A**（推荐）：用 `browser_tabs` 关闭当前标签 → 通过 Playwright 的隐身上下文重开（让真人新开浏览器隐身窗口最稳）
> - **方案 B**：手动在 Chrome DevTools → Application → Storage → Clear site data 清

---

## 4. 保留 cookie 复登录的判定条件（需求 4 用）

录制需求 4 时**禁止**执行 §3 的清空脚本。判定"是否真的是复登录"的条件：

1. `browser_navigate` 到目标 URL 后，对比 network 列表的总跳转数：
   - 首次登录：通常 ≥ 5 跳（含 `tai.it.tencent.com` SAML、`ov.qq.com` 回调等）
   - 复登录：应 ≤ 3 跳（直接命中 cookie 走快路径）
2. 检查 `browser_evaluate` 返回的 `localStorage`：复登录场景下 token 应**已存在**
3. 如果两条都不成立，说明 cookie 已失效（默认有效期可能很短），需要重新走完整链路并标注「复登录失败：cookie 过期」

---

## 5. 已知坑位与排错

| 现象                                | 原因                                | 解法                                                                                |
| ----------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------- |
| `browser_network_requests` 返回为空 | 调用太早，页面还没发请求            | 用 `browser_wait_for { time: 2 }` 或 `browser_wait_for { text: '关键词' }` 等到稳定 |
| 拉到的请求列表只有几条              | 漏开 `static: true`，或 filter 太严 | 显式传 `static: true` 和 `filter: ".*"`                                             |
| 弹窗 popup 抓不到                   | playwright 默认只盯主标签           | 用 `browser_tabs { action: 'list' }` 找出 popup 的 index，再 `select` 切过去录      |
| SAML 跳转中断 / hang                | 内网证书/代理                       | 让真人手动点一次浏览器地址栏刷新；不要靠 `browser_navigate` 重发                    |
| `browser_evaluate` 报跨域           | 在错误的 origin 上跑 JS             | 先 `browser_tabs select` 切到正确标签                                               |
| `Set-Cookie` 看不到完整             | 浏览器把 HttpOnly 隐藏了            | `browser_network_request { part: 'response-headers' }` 拉原始 header                |

---

## 6. 一次完整侦察的最小调用清单（参考）

针对 demo 站首次登录：

1. `browser_resize 1440x900`
2. `browser_navigate https://lightart-dev.woa.com/usdsearch?q=test`
3. `browser_evaluate <清空脚本>`（§3）
4. `browser_navigate <重新进入>`（清空后再进入触发首次登录）
5. **人工**：完成扫脸/授权
6. `browser_wait_for { text: 'Search results' }` 或类似登录后才出现的文案
7. `browser_network_requests { static: true }`
8. 对前 N 条关键跳转：循环 `browser_network_request { index, part }`
9. `browser_evaluate <读 storage 脚本>`（§1 Step 6）
10. `browser_take_screenshot { fullPage: true }`
11. 把上述结果按 §2 模板填入 trace 文档

---

## 7. 脱敏提示

录制结束写文档时，**禁止直接复制粘贴 MCP 返回的原始字符串**，必须先：

1. token / cookie 长字符串 → 替换成 `<REDACTED_TOKEN length=N>` / `<REDACTED_COOKIE>`
2. SAML Base64（出现在 `?saml=eyJ...`）→ 替换成 `<REDACTED_SAML_BASE64 length=N>`，可附"原文起始 16 字节解码后是 `{"type":"SAML",...}`"作为类型佐证
3. 工号、邮箱、姓名 → 见 README.md 脱敏对照表
4. 截图保存前用图片编辑器涂掉账号信息
