# Market 站 Device Flow 完整成功证据

> **录制时间**：2026-05-15 15:18-15:32 (CST)
> **录制工具**：Playwright MCP（市场站正式 Chrome session 同步）
> **入口 URL**：`https://market.lightart-dev.woa.com/?server=nucleus`
> **鉴权方**：`server=nucleus` → 走 Nucleus 内置 Device Code Flow
> **结论**：✅ **Device Flow 完整跑通，业务 200 成功，Tag 接口正常**
> **本文目的**：把这条目前唯一可用的登录链路，连同所有原始证据，固化为"基线参考"。任何未来改造都不能让这条路径退化。

---

## 0. 一行结论

输 8 位码 → SAML 已认证用户在 ov.qq.com 那边 Verify 通过 → SPA 不知道走了哪条暗道把 **9 个 token** 写进了 `localStorage` → SPA 读这些 token 拼出 `Authorization: Basic` 请求业务接口 → 全部 200。

> 🔍 **未解之谜**：那 9 个 token 到底是被哪条网络请求写入 localStorage 的？目前在 Playwright 的请求列表里**没看到**任何 token 创建/查询请求，所以这是下一步必查项（见 `token-injection-trace.md`，待补）。

---

## 1. 时序总览

```mermaid
sequenceDiagram
    participant U as 用户
    participant SPA as SPA (market 主页)
    participant LS as localStorage
    participant OV as ov.qq.com (device 页)
    participant SAML as 太湖 SAML
    participant API as market 业务接口

    U->>SPA: 访问 /?server=nucleus
    SPA->>SPA: 启动，检测无 token
    SPA->>U: 弹出 Device Code 对话框（码 7A99C931）
    Note right of SPA: 此时 SPA 已轮询 ov.qq.com/omni/discovery/healthcheck<br/>持续 426 Upgrade Required（不影响主流程）

    U->>OV: 点"打开 Nucleus 登录页面"<br/>新 tab 跳 ov.qq.com/omni/auth/login/device
    OV->>SAML: 自动 SAML（已登录态）
    SAML-->>OV: bybluewang 已认证
    OV->>U: 显示 8 个 input + Verify 按钮（顶栏：bybluewang）

    U->>OV: 填 7A99C931 + 点 Verify
    OV-->>OV: 校验通过（页面变成 ✓ logged in）
    Note right of OV: ⚠️ 这一步具体网络请求被 Playwright 列表过滤了<br/>很可能是 navigation 类 form submit

    Note over SPA,LS: 神秘的 token 注入瞬间<br/>（暗道，待查）
    LS->>SPA: 9 个 token 出现

    SPA->>API: POST /search_hybrid<br/>Authorization: Basic base64($omni-api-token:JWT)
    API-->>SPA: 200 OK
    SPA->>API: GET /search/stats/usd_properties (Tag 接口)
    API-->>SPA: 200 OK
    SPA->>API: GET /images?asset_url=...
    API-->>SPA: 200 OK
```

---

## 2. 网络请求时序表（Playwright 实录）

> 全部请求来自主标签 `https://market.lightart-dev.woa.com/?server=nucleus`，按到达顺序编号（与 Playwright 原始编号对齐）。

| #      | Method | URL                                              | Status       | 含义                                                 |
| ------ | ------ | ------------------------------------------------ | ------------ | ---------------------------------------------------- |
| 1-4    | GET    | SPA bundle / 静态资源                            | 200          | 加载                                                 |
| 5      | GET    | `/info/backend/storage`                          | 200          | SPA 启动探测后端存储类型（无需 token）               |
| 6      | GET    | `/info/plugins`                                  | 200          | SPA 启动探测插件                                     |
| 7      | GET    | `/info/backend/storage`                          | 200          | 重复探测                                             |
| **8**  | POST   | `/search_hybrid`                                 | **401** ❌   | 第一次业务请求被拒（此时无 token）                   |
| 11-45  | GET    | `https://ov.qq.com/omni/discovery/healthcheck`   | **426** × 35 | SPA 轮询心跳，全程 426（独立链路，**不阻塞**主流程） |
| —      | —      | （用户在 ov.qq.com tab 输 7A99C931 + 点 Verify） | —            | **token 注入暗道，未捕获**                           |
| **46** | POST   | `/search_hybrid`                                 | **200** ✅   | 业务请求通了！登录态已建立                           |
| 47     | GET    | `/info/backend/storage`                          | 200          | SPA 复查                                             |
| **48** | GET    | `/search/stats/usd_properties`                   | **200** ✅   | **Tag 接口**——硬性要求项，正常                       |
| 49     | GET    | `/info/plugins`                                  | 200          | —                                                    |
| 50     | GET    | `/info/backend/storage`                          | 200          | —                                                    |
| 51     | POST   | `/search_hybrid`                                 | 200          | 后续搜索 OK                                          |
| 52,53  | GET    | `/images?asset_url=omniverse://ov.qq.com/...`    | 200          | 资产缩略图                                           |

**关键观察**：

- ❌ **没有任何 `device/code`、`device/token`、`createApiToken`、`refresh` 请求**进入 Playwright 的 fetch 列表
- ❌ **没有任何 `Authorization` 改变前的"取 token"请求**
- ✅ **#8（401）→ #46（200）之间发生了状态翻转**，但翻转的载体不在 fetch/xhr 列表里

> **可能性**：那条暗道是 ov.qq.com VERIFY 提交的 form post（被 Playwright 的 navigation 过滤掉了），后端 302 时通过某种机制（document.referrer / postMessage / window.opener / 共享 cookie）让主标签 SPA 拿到 token。**必须在下一次重录时用 `--all=true` 模式 + 监听 `storage` 事件验证。**

---

## 3. localStorage 的 9 个 token（决定性证据）

VERIFY 通过后，主标签 `localStorage` 同时写入这 9 个键：

| 键名                                    | 内容类型 | 解码后关键字段                                                           |
| --------------------------------------- | -------- | ------------------------------------------------------------------------ |
| `nucleus_username`                      | string   | `$omni-api-token` ⚡ **特殊用户名**——表示后续走 Basic Auth               |
| `nucleus_password`                      | JWT      | sub=bybluewang, profile.provider=SAML, **无 exp 字段（永久 API Token）** |
| `nucleus_nucleus_access_token`          | JWT      | sub=bybluewang, iat=t, exp=t+1800（**30 分钟**）                         |
| `nucleus_nucleus_refresh_token`         | JWT      | sub=bybluewang, iat=t, exp=t+604800（**7 天**）                          |
| `nucleus_nucleus_access_token_expiry`   | int13    | access_token 的 ms 级过期时间戳                                          |
| `ov.qq.com_nucleus_access_token`        | JWT      | 同 `nucleus_nucleus_access_token`                                        |
| `ov.qq.com_nucleus_access_token_expiry` | int13    | 同上                                                                     |
| `ov.qq.com_nucleus_refresh_token`       | JWT      | 同 `nucleus_nucleus_refresh_token`                                       |
| `chakra-ui-color-mode` (无关)           | string   | `dark`                                                                   |

> 命名规律：同一个 token 被写两份——一份用 **`nucleus_` 前缀**（SPA 内部 server alias），一份用 **`ov.qq.com_` 前缀**（实际 nucleus server hostname）。
> 这是 NVIDIA Omniverse Web 客户端的标准做法（见 `omni-web-clients` SDK），用于支持同时连多个 server。

### 3.1 三种 JWT 的 payload 共性

```jsonc
{
  "sub": "bybluewang",
  "profile": {
    "first_name": null, "last_name": null,
    "email": "bybluewang",
    "admin": false, "nucleus_ro": false, "readonly": false,
    "provider": "SAML",            // ← 关键：来源是 SAML
    "enabled": true, "activated": true
  },
  "jti": "<unique-id>",
  "iat": <issued_at>,
  "exp": <expiry>                   // api_token 没有这个字段 → 永久
}
```

### 3.2 三种 JWT 的差异

| 类型                                  | 用途                  | 有效期   | 是否在请求 header 直接出现          |
| ------------------------------------- | --------------------- | -------- | ----------------------------------- |
| `access_token`                        | 短期访问凭证（备用）  | 30 min   | **不直接用**（SPA 改用 Basic Auth） |
| `refresh_token`                       | 长期刷新（备用）      | 7 day    | 不直接用                            |
| `api_token`<br/>(=`nucleus_password`) | **Basic Auth 的密码** | **永久** | ✅ **每次业务请求都带它**           |

---

## 4. Basic Auth 鉴权 —— 鉴权方式终结之谜

### 4.1 实录请求 #46 的 request headers（脱敏）

```
authorization: Basic JG9tbmktYXBpLXRva2VuOmV5SmhiR2NpT2lKU1V6...（base64 段，长 ~1500 字符）
content-type: application/json
referer: https://market.lightart-dev.woa.com/?server=nucleus
x-usdsearch-storage-backend: nucleus
user-agent: Mozilla/5.0 ... Chrome/148.0.0.0
```

### 4.2 base64 解码

```
$omni-api-token:eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...（永久 JWT）
└─ username ──┘ └────────────── password ──────────┘
```

### 4.3 SPA 端拼接公式（推断）

```js
const username = localStorage.getItem("nucleus_username"); // "$omni-api-token"
const password = localStorage.getItem("nucleus_password"); // 永久 JWT
const auth = "Basic " + btoa(`${username}:${password}`);
fetch("/search_hybrid", { headers: { authorization: auth /*...*/ } });
```

### 4.4 后端识别逻辑（推断）

后端对 Basic Auth 解出：

- 如果 username = `$omni-api-token` → 把 password 当 JWT 验证（RS256 + Nucleus 公钥）
- 如果 username = 普通用户名 → 走传统密码验证（不适用本场景）

> 这是 **NVIDIA Omniverse Nucleus 标准约定**：`$omni-api-token` 是 magic username，告诉服务端"我送的是个 JWT，你按 token 解析"。

---

## 5. 端到端验证

| 验证项                                      | 期望                   | 实测          |
| ------------------------------------------- | ---------------------- | ------------- |
| 主搜索 `/search_hybrid`                     | 200，返回资产列表      | ✅            |
| **Tag 功能** `/search/stats/usd_properties` | 200，返回 USD 属性统计 | ✅ 硬要求达成 |
| 缩略图 `/images?asset_url=...`              | 200，返回图片          | ✅            |
| 主页搜索框可输入 + 显示资产                 | UI 工作                | ✅            |
| 顶栏服务器 chip 显示 `OV.QQ.COM`            | UI 工作                | ✅            |

---

## 6. ov.qq.com 这边发生了什么（已知/未知）

### 6.1 已知（看得到）

- 跳转到 `/omni/auth/login/device` 时 ov.qq.com 已识别 SAML 登录态（顶栏 `bybluewang`）
- 8 input + Verify 按钮渲染
- 填码 + Verify 通过 → 页面变成 ✅ "logged in"

### 6.2 未知（暗道）

- VERIFY 那一刻发出的请求是什么？form POST？fetch？
- 服务端怎么把"码 7A99C931 已被认领"这个状态告诉 market 主标签？
  - **可能性 A**：market 主标签上 SPA 一直在轮询某个我们没看到的 endpoint（被列表过滤）
  - **可能性 B**：跨 tab postMessage / BroadcastChannel
  - **可能性 C**：ov.qq.com 那边 form POST 的响应里直接 redirect 到 market.lightart-dev.woa.com 的 token 注入页（跨 tab）
- 9 个 token 是从哪个 endpoint 拉下来写到 localStorage 的？
  - **最可能**：SPA 在 device flow 轮询时调过 `/omni/auth/login/device/token`（GraphQL/REST）这种端点，但被 Playwright 网络列表过滤了

> ⚠️ **下一步必做实验**（参见 `token-injection-trace.md`，待补）：
>
> 1. 重录登录，使用 Playwright `--all=true` 模式 + 主动注入 `localStorage` setter 拦截器
> 2. 在主标签注入 `addEventListener('storage', e => console.log(e.key, e.newValue))`
> 3. 在主标签 hook `XMLHttpRequest.prototype.open` 和 `fetch`，强制打印所有调用（不依赖列表过滤）
> 4. 找出 token 写入的真正源头

---

## 7. 跟 demo 站对比的核心差异

| 维度                | demo 站 `lightart-dev.woa.com/usdsearch` | market 站 `?server=nucleus`（本文） |
| ------------------- | ---------------------------------------- | ----------------------------------- |
| 顶部入口            | `Login with 离岸太湖 SSO` 按钮（页面上） | 自动弹 Device Code 对话框           |
| 登录方式            | 直接 SAML SSO                            | Device Flow（用户填 8 位码）        |
| token 落地位置      | 直接写 `localStorage`                    | 也写 `localStorage`（异曲同工）     |
| 鉴权 header         | （demo 用 token）                        | `Authorization: Basic`              |
| 用户操作步骤数      | **1 次点击**                             | **3 次点击 + 1 次输码**（影响 UX）  |
| 是否需要跨 tab/跨域 | 否                                       | 是（ov.qq.com 子流程）              |

> **业务诉求**：把 market 站从右列搬到左列——免输码，1 次点击直达搜索结果。

---

## 8. 待办（驱动下一份文档）

- [ ] **token-injection-trace.md**：抓 token 写入 localStorage 的真正源头
- [ ] **sso-login-trace.md**：完整记录 `/omni/auth/login` SAML 同域路径的请求时序（你今天发现这条路径但 token 落地是 cookie 不是 localStorage）
- [ ] **plan-A-spec.md（更新）**：基于上面两份证据重写实施方案

---

## 附录 A：Playwright 重录脚本（精简版）

```js
// 1. 清干净
await page.goto("https://market.lightart-dev.woa.com/?server=nucleus");
await page.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
});
await page.reload();

// 2. 注入监听（关键！下一轮要做的）
await page.evaluate(() => {
  const _set = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    console.log("[LS-WRITE]", k, "=", v.slice(0, 60));
    return _set.apply(this, arguments);
  };
  const _fetch = window.fetch;
  window.fetch = function (...args) {
    console.log("[FETCH]", args[0]);
    return _fetch.apply(this, args);
  };
});

// 3. 等用户操作完 device flow
// 4. 取 console + network + localStorage 三方对比
```

## 附录 B：原始 9 个 token 字段全集（脱敏 jti）

见上文 §3。本文未粘贴完整 base64 token 内容（避免凭证泄漏）；如需复现，重跑一次即可拿到自己的。
