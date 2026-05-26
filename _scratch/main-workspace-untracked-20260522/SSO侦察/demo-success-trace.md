# Demo 站首次成功登录链路（基线）

> **录制时间**：2026-05-15 14:42 (CST)
> **录制工具**：Playwright MCP（半自动 — 真人不需要扫脸，但需点 2 次按钮）
> **入口 URL**：`https://lightart-dev.woa.com/usdsearch?q=test`
> **结论**：✅ 登录成功，`omni_access_token` 写入 localStorage，主页可正常调业务接口

---

## 0. 关键事实速览

> 这一节是给"5 分钟读完"的人看的。详细数据见后续章节。

| 维度                        | 结果                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| 入口路径                    | `/omni/auth/login`（弹窗）                                                                          |
| SSO IdP                     | `tai.it.tencent.com/odc-login/login?from=lightmarket` ← **太湖 SSO，不是 ov.qq.com**                |
| 真正的 Identity Provider 域 | `tai.it.tencent.com`                                                                                |
| 登录成功后的 token 落点     | `localStorage.omni_access_token` + `localStorage.omni_refresh_token` + `localStorage.omni_username` |
| Cookie 落点                 | `document.cookie.nucleus_token`（同域 cookie，HttpOnly 不设）                                       |
| Token 类型                  | RS256 JWT（3-part），长度 731 字符                                                                  |
| Token payload 字段          | `sub` / `profile` / `jti` / `iat` / `exp`                                                           |
| 业务接口认证方式            | **Cookie 认证**（`nucleus_token`）— 业务请求 header 里**没有**`Authorization`                       |
| 弹窗与主页关系              | 同源（都是 `lightart-dev.woa.com`）；弹窗写完 localStorage 后自动关闭，主页可读到                   |
| **跨域问题？**              | 无 — 整条链路最终回到 `lightart-dev.woa.com`，所以 localStorage 共享                                |

---

## 1. 完整跳转链表

> 编号沿用 Playwright `browser_network_requests` 返回的 index。
> 真实请求 / 响应中的 token、SAML、cookie 值已经按 README 脱敏约定清洗。

### 1.1 第 1 层：OA Passport 鉴权（决定能否访问 lightart-dev.woa.com）

| #    | Method | URL（脱敏）                                                                                                                                                | Status | 备注                                              |
| ---- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------- |
| 1    | GET    | `https://lightart-dev.woa.com/usdsearch?q=test`                                                                                                            | 302    | 主入口，未鉴权 → 跳 OA Passport                   |
| 2    | GET    | `https://std.passport.woa.com/modules/passport/signin.ashx?oauth=true&appkey=ngn&url=...lightart-dev.woa.com/_auth_login/...&state=...&code_challenge=...` | 200    | OA 登录页（已检测当前 OA 用户，仅需点"快速登录"） |
| 3-29 | GET    | OA 登录页静态资源（CSS/JS/图片）                                                                                                                           | 200    | 与 SSO 流程无关                                   |
| 35   | POST   | `https://std.passport.woa.com/modules/passport/signin.ashx?loginMethod=5&...`                                                                              | 302    | 用户点"快速登录"提交                              |
| 36   | GET    | `https://lightart-dev.woa.com/_auth_login/?url=...&code=TOF4T<REDACTED>&state=...`                                                                         | 302    | 携带 `code` 回到 lightart-dev.woa.com             |
| 37   | GET    | `https://lightart-dev.woa.com/usdsearch?q=test`                                                                                                            | 200    | ✅ 进入主页（未触发离岸 SSO）                     |
| 38   | GET    | `https://lightart-dev.woa.com/usdsearch/static/js/main.<hash>.js`                                                                                          | 200    | SPA 主 bundle                                     |

> 此时业务接口 `/usdsearch/info/backend/storage` 返回 **500**（任务 41/43），因为业务层认证缺失。SPA 据此弹出 "Please login to use search" 卡片，触发用户**手动**点 "Log in with 离岸太湖 SSO"。

### 1.2 第 2 层：离岸太湖 SSO（业务功能鉴权 — 我们真正要侦察的）

> 这层发生在**新弹出的标签页**中。Playwright 在弹窗关闭后会丢失子标签的网络历史，因此下表为**实地观测 + URL 重建**。

| 步  | Method      | URL（脱敏）                                                                                                | Status    | 关键观察                                                                                                                                 |
| --- | ----------- | ---------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| A   | GET         | `https://lightart-dev.woa.com/omni/auth/login`                                                             | 200       | **新标签**打开（`window.open` 而非 iframe）。落地是后端渲染的"Login"页，仍然显示一个 "Log in with 离岸太湖 SSO" 按钮（用户必须再点一次） |
| B   | GET         | `https://lightart-dev.woa.com/omni/auth/login/sso/<base64-redirect-config>`                                | 302       | 用户点弹窗内按钮后，后端构造 SAML AuthnRequest 并 302                                                                                    |
| C   | GET         | `https://tai.it.tencent.com/odc-login/login?from=lightmarket&login_challenge=&verify_types=`               | 200       | 太湖 SSO 登录页。**注意 `from=lightmarket`** — 该参数对应一个已注册到太湖的 SSO Application                                              |
| D   | (form POST) | `tai.it.tencent.com` 内部表单提交（员工登录）                                                              | —         | 用户点"腾讯员工登录"（已有 OA cookie，秒过）                                                                                             |
| E   | GET / POST  | SAML callback 回到 `https://lightart-dev.woa.com/omni/auth/login/sso/<base64>?saml=<REDACTED_SAML_BASE64>` | 200 / 302 | **关键**：回调落点**完全同域**于业务主页                                                                                                 |
| F   | (前端 JS)   | 弹窗的 onbeforeunload / 主动 `window.opener.postMessage` 或直接 `window.close()`                           | —         | 弹窗关闭，主页 localStorage 立即出现 token                                                                                               |

**步骤 E 的核心意义**：

- SAML callback 的 `Recipient` / 落地 URL 是 `lightart-dev.woa.com`
- 因此 IdP（`tai.it.tencent.com`）**不**写 cookie 到 IdP 域，而是把签名后的 SAML Response 透传给 lightart-dev.woa.com 的 `/omni/auth/login/sso/...` 端点
- 该端点接收 SAML Response → 校验签名 → 颁发 `omni_access_token` JWT → 写到弹窗的 `localStorage`（注意：弹窗的 origin 与主页相同，所以同一份 localStorage）→ 关闭弹窗
- 主页通过 `storage` 事件 / 轮询 / `BroadcastChannel` 感知 token 出现 → 切换到已登录态

---

## 2. 登录后状态快照

### 2.1 localStorage（主页 origin = `https://lightart-dev.woa.com`）

```jsonc
{
  "omni_refresh_token": "<REDACTED_TOKEN length=731>", // RS256 JWT, 3-part
  "omni_access_token": "<REDACTED_TOKEN length=731>", // RS256 JWT, 3-part, exp=1778829322
  "omni_username": "<REDACTED_UID length=10>", // 工号字符串
  "chakra-ui-color-mode": "dark", // 与登录无关
}
```

### 2.2 SessionStorage

空（未使用）。

### 2.3 Cookies（document.cookie 可见部分）

```
nucleus_token=<REDACTED_COOKIE>; Domain=<lightart-dev.woa.com 隐含>; Path=/
```

> 该 cookie **同域非 HttpOnly**（document.cookie 能读到），用于业务接口（`POST /usdsearch/search_hybrid` 等）认证。
> 没有可见的 SameSite/Secure 元数据 — 详细元数据需后端配合或 `chrome://settings` 查 cookie 详情。

### 2.4 omni_access_token JWT 解码（脱敏）

```jsonc
// header
{ "alg": "RS256", "typ": "JWT" }
// payload
{
  "sub": "<REDACTED_UID>",
  "profile": "<REDACTED>",      // 该字段存在，值未具体抄录
  "jti": "<REDACTED>",          // 唯一 ID
  "iat": <REDACTED_TIMESTAMP>,
  "exp": 1778829322             // 2026-05 后约 1 个月
}
// signature
<REDACTED RS256 signature>
```

---

## 3. 关键响应详情（脱敏）

### 跳转 #36（OA Passport 回调到 lightart-dev.woa.com）

- 请求 URL：`https://lightart-dev.woa.com/_auth_login/?url=...usdsearch%3Fq%3Dtest&app_name=unknown&code=TOF4T<REDACTED_CODE>&state=...`
- 响应状态：302
- 响应 headers（关键）：
  - `Location: https://lightart-dev.woa.com/usdsearch?q=test`
  - `x-proxy-by: AIO-Forward`
  - `x-rio-seq: <REDACTED>`
  - **没有** `Set-Cookie` — 该层鉴权信息可能由 nginx / 上游网关在更早阶段写入（HttpOnly cookie，前端 doc.cookie 看不到）
- 响应 body：空（302 跳转）

### 跳转 #47（业务接口验证可用性）

- 请求 URL：`POST https://lightart-dev.woa.com/usdsearch/search_hybrid`
- 请求 headers（关键）：
  - `referer: https://lightart-dev.woa.com/usdsearch?q=test`
  - `content-type: application/json`
  - **没有** `Authorization` header
  - **没有** 显式 `Cookie` 字段（浏览器会自动带上 nucleus_token）
- 响应状态：200 ✅

> 这一跳证明：**业务接口认证靠 cookie，不是 Bearer Token**。前端发请求**不需要**手动从 localStorage 读 omni_access_token 加到 Authorization。
>
> 那 localStorage 里的 omni_access_token 干什么用？— 推测用于 token 续期（`omni_refresh_token`）、识别"是否已登录"以切换 UI 状态、调用与 nucleus 不在同域的服务时手动加 header。

---

## 4. 控制台错误（不影响登录成功）

```
- 5 errors / 1 warning
```

主要是 `/usdsearch/info/backend/storage` 在登录前返回 500、PWA manifest 加载失败、几个 Aegis 监控埋点 — 与 SSO 流程无关。

---

## 5. 与原始假设的对照

| 假设（曾经认为）                                                  | 实际事实                                                                                                                       |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| demo 站靠 HttpOnly cookie 认证，前端读不到 token                  | ❌ 错。`omni_access_token` 明明在 localStorage（length=731）                                                                   |
| demo 站和 market 站的 SSO 后端是两套（一个 ov.qq.com 一个新架构） | ✅ 部分正确：demo 走的是 **`tai.it.tencent.com` 太湖 SSO + `lightart-dev.woa.com/omni/auth/...` 自有 SAML SP**，不是 ov.qq.com |
| `/omni/auth/login` 是个简单 redirect                              | ❌ 实际是后端渲染的"Login"页，需要用户点第二次按钮触发真正的 SAML AuthnRequest                                                 |
| SAML callback 会把 token "推" 给主页                              | ✅ 是的，但**不是 postMessage**，而是写**同域 localStorage**（弹窗与主页 origin 相同所以共享）                                 |
| 必须做"前端弹窗 + postMessage 桥接"                               | ⚠️ 不需要 postMessage — 同源 localStorage 已经够用。**唯一前提是弹窗最终落地必须同源**                                         |

---

## 6. 对 market 站的关键启示（待 task 4 验证）

1. market 站若想复用此机制，**SAML callback 必须落到 `market.lightart-dev.woa.com`**，而不是 `ov.qq.com`
2. 太湖 SSO 接受 `from=` 参数指定不同 Application —— 需要后端在太湖 SSO 注册 `from=lightmarket-market`（或类似）的 SP
3. `/omni/auth/login` 这个端点是 demo 站后端实现的，不是浏览器内置；market 站的反代必须能正确路由到同等服务

> 这些是侦察推断，必须在 task 4（market 失败链路）和 task 6（差异分析）中用真实数据验证。

---

## 7. 数据采集环境

- 浏览器：Chrome 148.0.0.0（Windows，via Playwright MCP）
- 视口：默认（未调整）
- OA 状态：已登录 `<REDACTED_UID>` （触发了"快速登录"而非扫脸）
- IdP cookie 状态：触发太湖 SSO 时，浏览器有有效 OA cookie，因此员工登录秒过
- 录制起止：2026-05-15 14:41:43 → 14:45:22 CST，约 3 分 39 秒

---

## 8. 数据脱敏与原始日志位置

- 本文档所有真实 token / cookie / 工号 / 邮箱已替换为 `<REDACTED_*>` 占位符
- 原始 Playwright network log 由 MCP 服务自动管理，**不入 git**
- 截图（如需补充）保存到 `.playwright-mcp/` 目录（已在 `.gitignore`）

---

## 9. 【2026-05-15 修订】事实保留，结论修正

> 本节是侦察后期补的"事后纠偏"。前面 § 0–§ 7 的**网络录制事实全部正确**，但 § 5 / § 6 部分**结论解读偏差**已在此修正。

### 9.1 demo 站登录的"两层"独立性（关键纠偏）

之前以为 demo 站登录就是 `omni_access_token` 一锤子买卖。实地代码核对后发现：

```
第 1 层：身份层（本文档录制到的部分）
   太湖 SSO  ──> /omni/auth/login/sso/...  ──> localStorage.omni_access_token (RS256 JWT)
                                          ──> document.cookie.nucleus_token

第 2 层：业务/Tag 层（本文档没录到，但项目代码里一直存在）
   omni_access_token (临时 access token)
        │
        │  调用 nucleus.createApiToken(serverUrl, omni_access_token, tokenName)
        ▼
   永久 API Token  ──> localStorage.<host>_nucleus_access_token
        │
        ▼
   业务 / Tag 接口请求头：Authorization: Basic btoa("$omni-api-token:" + 永久 token)
```

也就是说：**`omni_access_token` 只是临时入场券，真正给业务和 Tag 功能用的是永久 API Token**，
两者通过 [`nucleus.jsx:187 createApiToken()`](../../web/src/nucleus.jsx) 衔接。

### 9.2 demo 站为什么业务接口"看起来不用 Authorization"

§ 3 录到 `POST /usdsearch/search_hybrid` **没带 Authorization** 仍 200。这是因为：

- `lightart-dev.woa.com` 的业务后端**额外接受** `nucleus_token` 这种同域 cookie（属于 NVIDIA + 太湖联合鉴权的另一条路径）
- 而我们 fork 出来的 [`HybridDeepSearchUI.jsx:1336-1337`](../../web/src/HybridDeepSearchUI.jsx) 业务调用走的是 **Basic Auth + 永久 API Token** 路径，**不依赖** cookie

→ 因此 demo 站的 cookie 路径**不能直接照抄到 market 站**，但 demo 站的 `omni_access_token → createApiToken → 永久 token` 路径**可以照抄**，而且这正是 market 站现有 Device Flow 已经在做的事。

### 9.3 给 market 改造的最终启示

| 原结论（§ 5 / § 6）                              | 修正后结论                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| market 站要"复用此机制" = 写 `omni_access_token` | ⚠️ 不够。还要立刻调 `createApiToken` 把它换成 `<host>_nucleus_access_token`，**否则 Tag 功能立即失效** |
| "前端弹窗 + postMessage 桥接不需要"              | ✅ 仍然成立（同域 localStorage 即可）                                                                  |
| 太湖 SSO 接受 `from=` 指定 Application           | ✅ 仍然成立                                                                                            |
| `/omni/auth/login` 后端要 market 站独立部署      | ✅ 已经部署好（见 [market-failure-trace.md § 1.2](./market-failure-trace.md)）                         |

### 9.4 红线（适用于本目录所有后续设计）

> **Tag 功能 100% 不能挂** = `localStorage.<host>_nucleus_access_token` 这个 key 必须存在且是永久 API Token；
> 业务请求 `Basic btoa("$omni-api-token:" + token)` 必须能跑通。
> 因此任何新登录方案的最后一步**必须**调 `createApiToken` 完成 token 转换，[BatchTagModal](../../web/src/components/BatchTagModal.jsx) / [useBatchTagger](../../web/src/hooks/useBatchTagger.js) / [useGlobalTags](../../web/src/hooks/useGlobalTags.js) / [EditableTagsPanel](../../web/src/components/EditableTagsPanel.jsx) **一行不动**。
