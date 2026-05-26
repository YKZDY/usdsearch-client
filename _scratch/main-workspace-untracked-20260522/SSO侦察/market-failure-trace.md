# Market 站首次失败登录链路（实地测试）

> ## ⛔ 已废弃 — 仅作历史快照保留
>
> **作废时间**：2026-05-15 15:30 (CST)
> **作废原因**：本文 §0 表格中的两行结论已被 2026-05-15 15:18-15:32 重测推翻：
>
> | 字段                    | 本文（旧）结论        | 实测真相（新）                                                                                                            |
> | ----------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
> | 登录成功后 localStorage | ❌ 空的               | ✅ **写入 9 个 token**（含 `nucleus_username=$omni-api-token`、`nucleus_password=永久 JWT`、access/refresh token 各两份） |
> | 登录成功后 cookie       | ✅ `nucleus_token` 等 | ❌ **document.cookie 是空的**（至少 SPA 可见层面）                                                                        |
>
> **新的、可信的 Device Flow 成功证据**：[market-deviceflow-success-trace.md](./market-deviceflow-success-trace.md)
>
> 本文剩余内容（§1.2 关于 `/omni/auth/login` SAML 同域路径的观察）目前仍可参考，但**鉴权落地是否真的写 cookie 还需要重新核查**。
>
> ---

> **录制时间**：2026-05-15 14:48-14:51 (CST)
> **录制工具**：Playwright MCP
> **入口 URL**：`https://market.lightart-dev.woa.com/?server=nucleus`
> **结论**：⚠️ **失败原因不是跨域、不是 nginx，是 SPA 前端用错了登录入口**

---

## 0. 关键事实速览（颠覆性发现）

> 这次侦察推翻了之前所有"跨域 / nginx 配置 / 后端要新开 endpoint"的假设。

| 维度                                             | 实地测试结果                                                                                                                                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SPA 主页**（`/?server=nucleus`）的当前登录方式 | **Device Flow（设备码）** — 弹出 8 位代码，跳 `https://ov.qq.com/omni/auth/login/device`（**跨域**）                                                                       |
| Device Flow 失败原因                             | ① `ov.qq.com` 跨域；② SPA 持续轮询 `https://ov.qq.com/omni/discovery/healthcheck` 返回 **426 Upgrade Required**（端点期望 WebSocket，但用了 GET）                          |
| **隐藏的 IOA SAML 入口**（`/omni/auth/login`）   | ✅ **完全可用**！直接访问会渲染 "Log in with IOA" 按钮                                                                                                                     |
| IOA SAML 流程                                    | 弹窗（同域）→ `tai.it.tencent.com/api/saml2/...`（太湖 IdP）→ 回调 `market.lightart-dev.woa.com/omni/auth/login/sso/...?saml=...` → 渲染 "You have successfully logged in" |
| **弹窗最终落地域**                               | `market.lightart-dev.woa.com`（**完全同域**）                                                                                                                              |
| 登录成功后 localStorage                          | ❌ **空的**！只有 `chakra-ui-color-mode`，**没有** `omni_access_token`                                                                                                     |
| 登录成功后 cookie                                | ✅ `nucleus_token` + `nucleus_refresh` + `nucleus` 都写入了同域 cookie                                                                                                     |
| nginx 反代                                       | ✅ **本来就是通的**！`/omni/auth/login` 端点完整可用                                                                                                                       |
| 后端 SAML SP 配置                                | ✅ **本来就是通的**！太湖 SAML 已注册，签名校验通过                                                                                                                        |

> **真相**：market 站**完全有能力做 SAML SSO**，只是 SPA 前端代码当前调用的是 Device Flow（兜底）路径，没用 SAML 弹窗路径。

---

## 1. 完整链路（按测试时间序）

### 1.1 阶段 A：SPA 主页 + Device Flow（当前失败路径）

| #     | Method                           | URL（脱敏）                                           | Status                   | 备注                                                                                                                         |
| ----- | -------------------------------- | ----------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 1     | GET                              | `https://market.lightart-dev.woa.com/?server=nucleus` | 200                      | 主入口                                                                                                                       |
| 2-4   | GET                              | SPA bundle / 静态资源                                 | 200                      | —                                                                                                                            |
| 5     | GET                              | `/info/backend/storage`                               | 200                      | 与 demo 同                                                                                                                   |
| 6     | GET                              | `/info/plugins`                                       | 200                      | —                                                                                                                            |
| 7     | GET                              | `/info/backend/storage`                               | 200                      | 重复                                                                                                                         |
| 8     | POST                             | `/search_hybrid`                                      | **401**                  | ❌ 业务接口未授权（无 cookie 无 token）                                                                                      |
| 11-26 | GET                              | `https://ov.qq.com/omni/discovery/healthcheck`        | **426** Upgrade Required | ❌ 跨域 + 端点要求 WebSocket，SPA 用 GET 调用 → 永远失败                                                                     |
| —     | （用户点 "从 Nucleus 获取令牌"） | `/omni/auth/login/device` 流程                        | —                        | SPA 弹出 Device Code 对话框（如 `4IDDGI5B`），链接 `https://ov.qq.com/omni/auth/login/device`（跨域，无法自动写本地 cookie） |

**当前 SPA 卡点**：

- SPA 通过 `OV.QQ.COM` 服务器配置走 Nucleus Device Flow
- Device Flow 要求用户去 `ov.qq.com/omni/auth/login/device` 输入代码
- 即使在那边输入完成，因为是跨域，token 也写不回 `market.lightart-dev.woa.com`

### 1.2 阶段 B：直接访问 `/omni/auth/login`（IOA SAML 路径，**实测可用**）

| 步  | Method          | URL（脱敏）                                                                                    | 关键观察                                                                                                          |
| --- | --------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| α   | GET             | `https://market.lightart-dev.woa.com/omni/auth/login`                                          | ✅ **200，渲染 Login 页面**（Server="market.lightart-dev.woa.com"，按钮 "Log in with IOA"）                       |
| β   | (点击 IOA 按钮) | 后端构造 SAML AuthnRequest 并 302 → 太湖 IdP                                                   | —                                                                                                                 |
| γ   | GET / POST      | `https://tai.it.tencent.com/api/saml2/...`                                                     | 太湖 SAML 验证 OA 身份                                                                                            |
| δ   | GET             | `https://market.lightart-dev.woa.com/omni/auth/login/sso/<base64>?saml=<REDACTED_SAML_BASE64>` | ✅ **回调同域**，后端校验 SAML 签名 → 写 cookie                                                                   |
| ε   | (页面渲染)      | 同上 URL                                                                                       | ✅ "You have successfully logged in. You can continue to work in your application." 显示 RTX 名头像 + Logout 链接 |

**实测结果**：

- localStorage：空（只有 chakra）
- cookies：`nucleus_token`、`nucleus_refresh`、`nucleus`（**3 个 HttpOnly cookie 都被写入了同域**）
- SAML Response 是合法的 RS256 签名版本（IdP 同 demo 站：`tai.it.tencent.com/api/saml2/metadata`）

---

## 2. 登录后状态快照（IOA SAML 路径成功后）

### 2.1 localStorage（❗ 为空）

```jsonc
{
  "chakra-ui-color-mode": "dark", // 与登录无关
}
```

> ⚠️ 这里和 demo 站差异巨大：demo 站会写 `omni_access_token` / `omni_refresh_token` / `omni_username`。
> market 站的 IOA 流程**只写 cookie**，不写 localStorage token。

### 2.1.1 🔥 决定性截图：SAML 已成功但 localStorage 未写入（2026-05-21 用户实测）

> **本段是给后端看的最直接证据。** 之前 § 2.1 只是抓包结论，本段把"为什么 localStorage 没被写入"的因果链**视觉化**坐实——所有信息都在用户的一张 Chrome DevTools 截图里。

#### 截图来源

用户在 market 站手动点击 "Login With IOA" 走 SAML SSO 流程后，落到 callback URL `https://market.lightart-dev.woa.com/omni/auth/login/sso/eyJ0eXBlIjoiU0FNTCIs...`，页面文案显示 "You have successfully logged in. You can continue to work in your application."，但同时 Network 面板里 `POST /omni/auth/api/sso/saml` 标记为 `400 Bad Request`。

#### 10 条观察点（每条独立可验证）

| #   | 观察点              | 数值                                                                             | 含义                                                                                           |
| --- | ------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | 浏览器地址栏        | `market.lightart-dev.woa.com/omni/auth/login/sso/eyJ0eXBlIjoiU0FNTCIs...`        | **SAML 链路已走到 callback 阶段**（不是初始 `/omni/auth/login`）                               |
| 2   | 页面文案            | "You have successfully logged in. You can continue to work in your application." | **后端 SAML 验证已经通过了** ✅                                                                |
| 3   | 失败请求路径        | `POST /omni/auth/api/sso/saml`                                                   | 就是 [`saml-api-400-trace.md`](./saml-api-400-trace.md) 盯了一整天的那个 endpoint              |
| 4   | 响应状态            | `400 Bad Request`                                                                | ❌ 这一步失败了                                                                                |
| 5   | 响应 Content-Length | `77` 字节                                                                        | 与 `Failed to open a WebSocket connection: did not receive a valid HTTP request.` 字面长度吻合 |
| 6   | 响应 Content-Type   | `text/plain`                                                                     | 不是 JSON，是 WS 升级失败的纯文本错误                                                          |
| 7   | 请求 Content-Length | `11303` 字节                                                                     | 请求体 = **完整的 SAML response Base64**                                                       |
| 8   | 请求 Content-Type   | `application/json`                                                               | 前端 `Gs` 调度器把 SAML 当 JSON body 发过去                                                    |
| 9   | console 日志        | `Found the (wss:) path-based deployment via HTTP for [healthcheck]`              | NVIDIA `Gs` 调度器**自己说的**："这个站是 wss 部署"，但它仍然先发了 HTTP POST                  |
| 10  | 网络面板时序        | `sso?SAMLRequest=...` → `saml`(400) → `discovery`(WSS) → ...                     | 确认 SAML 在 callback 后立刻发出，且 400 之后又起了一个 wss 连接（Gs 降级路径走错端点）        |

#### 关键解读：截图揭示的"两件事被分开"

> **页面已经显示 "You have successfully logged in"** —— 说明 SAML 在某条路径上已经成功（cookie 已 Set-Cookie，见 § 2.2）；
> **但 400 是这条登录链路的 _additional_ 步骤失败** —— 不是登录本身失败，而是**前端 `Gs` 调度器在 SAML 走完后额外发起的"用 SAML response 换 OmniRPC access_token 写 localStorage"那一步失败**。

#### 因果链（修正版）

```
[用户点击 IOA] → [IDP 重定向回 callback] → [后端 SAML 验证 ✅ + Set-Cookie ✅]
                                              ↓
                                    [callback HTML 渲染 "successfully logged in"]
                                              ↓
                          [前端 Gs 调度器：POST /omni/auth/api/sso/saml 想换 token]
                                              ↓
                                  ❌ 400（market 这个端点是 WebSocket-only）
                                              ↓
                                  [localStorage 9 个 token 字段全空]
                                              ↓
                            [业务接口（/api/tags 等）只认 Authorization Header]
                                              ↓
                                  [业务接口全 401] ← 这就是用户感知到的"登录失败"
```

#### 这张图给后端看的核心信息

> **后端的 SAML 验证流程没问题**（"successfully logged in" 是后端自己渲染的），**只是 callback HTML 里少了一段把 access_token 写 localStorage 的 JS**——demo 站已经这么做了，market 站漏了。

详细话术见 [`plan-A-spec.md`](./plan-A-spec.md) § 2.2「给后端的话术」。

### 2.2 Cookies（document.cookie 可见）

```
nucleus_token=<REDACTED_COOKIE>; Domain=market.lightart-dev.woa.com (隐含); Path=/
nucleus_refresh=<REDACTED_COOKIE>
nucleus=<REDACTED_COOKIE>
```

> 同域、可读（`document.cookie` 拿到了 key）。具体 SameSite/Secure 元数据需打开 Chrome DevTools 看。

---

## 3. SAML Response 结构（脱敏后核心字段）

> 用户在 history_question 里曾贴过完整的 SAML Base64，这里仅摘录关键属性。

```xml
<samlp:Response
    ID="id-c90e9374..."
    InResponseTo="id0a8fb775..."
    Destination="https://ov.qq.com:8006/result"        <!-- ⚠️ 仍指向 ov.qq.com:8006 -->
    Version="2.0"
    IssueInstant="2026-05-15T06:51:37.379Z">
  <saml:Issuer>https://tai.it.tencent.com/api/saml2/metadata</saml:Issuer>
  <ds:Signature>...RS256 签名（已脱敏）...</ds:Signature>
  <samlp:Status><samlp:StatusCode Value="...:Success"/></samlp:Status>
  <saml:Assertion>
    <saml:Subject>
      <saml:NameID
          Format="...:nameid-format:transient"
          NameQualifier="https://tai.it.tencent.com/api/saml2/metadata"
          SPNameQualifier="https://ov.qq.com:8006/">     <!-- ⚠️ 仍指向旧 SP -->
        <REDACTED_UID>
      </saml:NameID>
      <saml:SubjectConfirmation Method="urn:...:bearer">
        <saml:SubjectConfirmationData
            Address="127.0.0.1:57056"                    <!-- IdP 端记录的 IP -->
            Recipient="https://ov.qq.com:8006/result"/>  <!-- ⚠️ Recipient 也是旧 -->
      </saml:SubjectConfirmation>
    </saml:Subject>
    <saml:Conditions>
      <saml:AudienceRestriction>
        <saml:Audience>https://ov.qq.com:8006/</saml:Audience>  <!-- ⚠️ Audience 也是旧 -->
      </saml:AudienceRestriction>
    </saml:Conditions>
    <saml:AttributeStatement>
      <!-- uid / email / cn / sn / givenName / eduPersonAffiliation 等 -->
      <REDACTED_ATTRIBUTES />
    </saml:AttributeStatement>
  </saml:Assertion>
</samlp:Response>
```

**脏数据点（不影响 SP 接受，但严格意义上违规）**：

- `Destination` / `Recipient` / `Audience` / `SPNameQualifier` 都是 `https://ov.qq.com:8006/...`（旧）
- 浏览器实际 redirect 落地是 `https://market.lightart-dev.woa.com/omni/auth/login/sso/...`（新）
- 严格 SAML 实现会拒绝 `Recipient` 与实际 URL 不匹配的 Response，但 **NVIDIA Nucleus Auth 的 SAML SP 实现似乎放宽了 Recipient 校验**，所以登录还是成功了。这是个隐含风险，未来 NVIDIA 升级 SAML 库可能突然失效。

---

## 4. 关键请求详情（脱敏）

### 跳转 #8（业务 search_hybrid，401）

- 请求 URL：`POST https://market.lightart-dev.woa.com/search_hybrid`
- 请求 headers：
  - `referer: https://market.lightart-dev.woa.com/?server=nucleus`
  - `content-type: application/json`
  - `x-usdsearch-storage-backend: nucleus`
  - **没有** `Authorization`，**没有** `Cookie`（清空了）
- 响应状态：**401**
- 响应 headers：`x-process-time: 0.001`（快速失败，未走业务逻辑）

### 跳转 #11（ov.qq.com healthcheck，426）

- 请求 URL：`GET https://ov.qq.com/omni/discovery/healthcheck`
- 响应 headers：
  - `upgrade: websocket` ← ⚠️ 端点期望 WebSocket
  - `connection: keep-alive`
  - `access-control-allow-origin: *` （CORS 放行）
- 响应状态：**426 Upgrade Required**
- 含义：SPA 在轮询一个**协议不兼容**的端点。这是另一个独立 bug（与 SSO 无关，但说明 `OV.QQ.COM` 旧服务器的 discovery 已经废弃）

---

## 5. 与原始假设的对照（颠覆性更新）

| 假设 / 之前判断                                                        | 实地结果                                                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| market 站 nginx 没配 `/omni/auth/login` 反代，所以登录跳转走 ov.qq.com | ❌ 错。`/omni/auth/login` **早就配好了**，可访问可用                                       |
| 后端要新开 endpoint                                                    | ❌ 错。所有需要的 endpoint 都已经存在并工作                                                |
| 跨域 cookie 写不进 → token 落不到 market 域                            | ❌ 错。**SAML callback 落地完全同域**，cookie 也写到了 market 域                           |
| 必须改 nginx 让运维加 location                                         | ⚠️ 不需要新加；但需要确认现有 nginx 配置永久保留                                           |
| 必须做"前端弹窗 + postMessage 桥接"                                    | ❌ 不需要。同域 cookie 已经够                                                              |
| demo 站靠 localStorage `omni_access_token`，所以 market 也得照搬       | ⚠️ **不一定**。market 站 IOA 路径靠 cookie 就能跑业务接口（只要 SPA 别再去走 Device Flow） |
| 之前点登录卡在弹窗不关                                                 | 真因：**SPA 当前走的是 Device Flow（跨域 ov.qq.com）**，根本没走 IOA SAML（同域）          |

---

## 6. 真正的根因（一句话总结）

> **SPA 前端代码（在 `feature/sso-login-migration` 分支的当前提交）触发的登录入口是 Device Flow（跨域到 ov.qq.com），而 market 站后端早已支持的 IOA SAML 弹窗（同域 `/omni/auth/login`）从未被前端调用。**

修复方向（任务 7 详细设计，这里只列要点）：

1. **前端**：把"从 Nucleus 获取令牌"按钮的点击逻辑从 Device Flow 改成 `window.open('/omni/auth/login')`，类似 demo 站做法
2. **前端**：登录完成后，主页通过 `storage`/`BroadcastChannel`/轮询 cookie/调用业务接口检测 cookie 是否生效来切换登录态（而不是检查 `omni_access_token`）
3. **前端**：业务请求依赖 `nucleus_token` cookie（浏览器自动带），无需手动加 Authorization header
4. **可选**：把 `Show Discovery healthcheck` 那段 `ov.qq.com` 跨域轮询关掉，避免 426 噪音
5. **可选**：让后端 SAML SP 配置升级 `SPEntityID` 为 `https://market.lightart-dev.woa.com/omni/auth/login/sso/`，避免未来严格 Recipient 校验

---

## 7. 数据采集环境

- 浏览器：Chrome 148.0.0.0（via Playwright MCP）
- 录制起止：2026-05-15 14:48:43 → 14:51:38 CST
- OA 状态：已登录，触发 IOA 时秒过
- 主标签：market 主页（Device Flow 卡点）
- 副标签：market `/omni/auth/login`（IOA SAML 路径，**成功**）

---

## 8. 截图建议（手动补充）

可在 `.playwright-mcp/` 找到本次录制的自动截图。建议手动选取：

- Device Code 对话框（"通过 Nucleus 认证 / 4IDDGI5B"）
- IOA "Log in with IOA" 按钮页
- "You have successfully logged in" 成功页

均需要在保存前**涂掉真实 RTX 名/工号**（"bybluewang" 等）。

---

## 9. 【2026-05-15 修订】"失败"措辞不准确，事实重新定性

> 本节是侦察后期补的纠偏。前面 § 0–§ 7 的**网络数据全部正确**，但用词上把 Device Flow 当作"失败路径"是错的——它**一直能跑通**，只是**用户体验差**。

### 9.1 Device Flow 不是失败，是 UX 痛点

| 真实情况                            | 之前文档措辞 ❌    | 修正后措辞 ✅                                                |
| ----------------------------------- | ------------------ | ------------------------------------------------------------ |
| Device Flow 一直能完整登录          | "Device Flow 失败" | **"Device Flow 体验差"**：用户要跨域跳 ov.qq.com 复制 8 位码 |
| Device Flow 拿到 token → 调 API 200 | "卡在弹窗不关"     | "弹窗只是显示 8 位码，用户复制粘贴完成后业务接口正常"        |
| 业务方让我们改的真正原因            | "登录失败"         | **"复制粘贴 UX 烂"**（光哥/用户反馈）                        |

→ 本次重设计的目标是**把 UX 难看的前段（手输 8 位码）换成弹窗自动登录**，
而**不是修一个原本就不坏的东西**。

### 9.2 § 0 / § 1 表格里那个"401"和"426"的正确解读

| 现象                                | 旧解读 ❌                              | 正确解读 ✅                                                                                                                                                                            |
| ----------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /search_hybrid → 401`         | "登录失败 → 业务 API 拒绝"             | **预期行为**。SPA 这一刻还没登录，没读到 `<host>_nucleus_access_token`，[`HybridDeepSearchUI.jsx:1336-1337`](../../web/src/HybridDeepSearchUI.jsx) 没拼 Basic Auth → 后端 401 完全合理 |
| `ov.qq.com/healthcheck → 426`       | "登录链路坏掉了"                       | **与登录无关的独立 bug**。Discovery 检测端点在新版 Light Up 已切换到 WebSocket，旧 GET 永远 426。**保留它**没害处，未来可清理                                                          |
| IOA SAML 写了 cookie 但业务还是 401 | "cookie 不被业务接受 → 登录链路有 bug" | **预期行为**。market 业务接口**不依赖 cookie**，依赖 `Basic btoa("$omni-api-token:" + 永久 token)`；IOA 路径**没有走 createApiToken**，所以业务 API 当然 401                           |

### 9.3 当前现状的完整因果链（修正版）

```
SPA 启动
  ├─ 自动尝试调业务 API → 401（合理，没登录哪来 token）
  ├─ 用户点"从 Nucleus 获取令牌"
  │   └─ 走 Device Flow（旧链路，UX 烂但能用）
  │       ├─ 弹 8 位 user_code
  │       ├─ 用户跳 ov.qq.com 输码 + VERIFY
  │       ├─ SPA 轮询拿到临时 access_token (JWT)
  │       ├─ 调 createApiToken(serverUrl, accessToken, "...") → 永久 API Token
  │       ├─ 写到 localStorage.<host>_nucleus_access_token
  │       └─ 业务 / Tag 全部恢复正常 ✅
  └─ 现在要做的事：把"用户跳 ov.qq.com 输码"这一段，换成"弹窗自动 IOA 登录"
       后面 createApiToken → 永久 token → localStorage 这一段一字不动
```

### 9.4 § 6 "真正的根因"修订

旧句子（保留可读）："SPA 触发的登录入口是 Device Flow（跨域到 ov.qq.com），而 IOA SAML 弹窗（同域）从未被前端调用。"

修正后："**Device Flow 当前在用且功能完整**，问题在于它要求用户手动复制 8 位 user_code、跨域跳 ov.qq.com，UX 不达标。市场上想替换的是这一段交互，不是替换整条登录链路。**`createApiToken → 永久 API Token → <host>_nucleus_access_token` 这条 Tag 功能依赖的内部链路在新方案中必须保持完全不变。**"

### 9.5 红线（与 demo trace § 9.4 同步）

> **Tag 功能 100% 不能挂**。任何新方案的最后一步**必须**调 [`createApiToken`](../../web/src/nucleus.jsx) 把临时 access_token 换成永久 API Token，写到 `localStorage.<host>_nucleus_access_token`。
> [BatchTagModal](../../web/src/components/BatchTagModal.jsx) / [useBatchTagger](../../web/src/hooks/useBatchTagger.js) / [useGlobalTags](../../web/src/hooks/useGlobalTags.js) / [EditableTagsPanel](../../web/src/components/EditableTagsPanel.jsx) **一行不动**。
