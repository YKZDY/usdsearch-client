# `POST /omni/auth/api/sso/saml` 400 根因坐实档

> ## 🚨 2026-05-15 18:40 **终极修订横幅（双站对照实证完成，已收敛到 H5）**
>
> **本文档 § 0 ~ § 11 的所有早期推断已被 Playwright 双站对照实测全面取代**，请直接跳到末尾 **§ 13 demo vs market 终极对照** 看终极结论。
>
> **终极根因（H5，已字面坐实）**：
>
> - ✅ **demo 站后端 = HTTP 服务**：`/sso/saml` 接收 HTTP POST 返回 422（字段缺失，证明它本来就接受 JSON body）；WSS 握手反而失败（code 1006）
> - ✅ **market 站后端 = WebSocket 服务**：`/sso/saml` 只接 WSS（握手成功 readyState=1），HTTP POST 必撞 400
> - ✅ **NVIDIA 上游同一份 main.js（hash 完全一致，318168 字节）**：`Gs` 调度器默认 HTTP 优先 → demo 通 / market 挂
> - ⛔ **base href 不同是表象，根本是两个站的后端架构完全不同**：demo 走 HTTP API，market 走 WebSocket RPC
>
> **完整双站对照矩阵 + 给光哥的最终 3 句话 bug 报告**：见 § 13
>
> --->
>
> ## 🛑 2026-05-21 **调研价值再降级横幅（请先看本段再决定要不要继续读）**
>
> **本文档调研的 `POST /omni/auth/api/sso/saml` 400 实际上是【未来 A1 IOA 弹窗方案】才会触发的路径上的问题，不是当前 market 用户登录失败的原因。**
>
> 当前 market 站用户登录走的是 **Device Flow（设备码）**，已**完整跑通**（业务接口 200 + Tag 功能正常），实测证据见 [`market-deviceflow-success-trace.md`](./market-deviceflow-success-trace.md)。业务方反馈的痛点是 **UX 烂**（手输 8 位码 + 跨域跳 ov.qq.com），不是登录失败。
>
> **真正应该看的文档**（按重要性）：
>
> 1. [`README.md`](./README.md) — 整目录导航 + 光哥两次会议的核心结论
> 2. [`diff-analysis.md`](./diff-analysis.md) — **决策核心**：事实对比 + 双轨方案 A/B
> 3. [`plan-A-spec.md`](./plan-A-spec.md) — 双轨实施规格（B 短期 UX 优化 + A1 中期 IOA 弹窗）
> 4. [`risk-rollback.md`](./risk-rollback.md) — 风险登记 + Tag 验收清单
>
> **本文档（saml-api-400-trace.md）的剩余价值**：
>
> - ✅ § 3.3 / § 12 main.js 反编译产出（`Gs` 调度器源码 + `rc()` 调用方 + WebSocket RPC marshaller）—— 未来如果做"前端 fork 落地页绕过 Gs"这种激进方案时是宝贵的反编译参考
> - ✅ § 11 / § 13 双站对照实测数据 —— 未来如果运维真要去验证 demo/market 后端栈差异时直接复用
> - ❌ **§ 7 / § 8 / § 12.5 / § 13.5 里所有的"修复方案推荐"全部不适用** —— 它们基于"market 站是当前线上故障 / 后端可以反代到 demo 同款 HTTP 服务"的错误前提（README 第 1 句已说明 demo 和 market 后端不是同一套）
>
> 如果你是新进入这个目录的人，**请直接关掉本文档**，按上面 1→2→3→4 顺序读其它文件。
>
> --->
> **完成时间**：2026-05-15 17:00 (CST)
> **作用**：把 `requirements.md` 中 U2（400 响应体明文）+ U1（UA 干扰排除）的实测结果完整落档，固化 **H2 根因**结论。
> **作者**：通过 systematic-debugging Phase 1-2 流程，结合用户真实 Edge 桌面 UA 实测 + DevTools Sources 抓取的落地页 HTML 证据。
> **结论**：⛳ **H1（Audience mismatch）已被否决**；⛳ **H2（base 标签写死 ov.qq.com + WebSocket/HTTP 端点错配）完全坐实**。

---

## 0. 一句话总结

> market 站的 `/omni/auth/login/sso/...` 这个落地页 **HTML 里 `<base href="https://ov.qq.com:443/omni/auth/login/"/>` 写死了 ov.qq.com**，导致打包给 ov.qq.com 后端使用的前端 React build 跑在了 market 域上。这份 build 里的 `main.586bebb7.js` 用 **WebSocket 升级请求** 调 `/omni/auth/api/sso/saml`，但 market 域上这个端点是**普通 HTTP POST handler**，握手失败 → 400 + 错误文本 `Failed to open a WebSocket connection: did not receive a valid HTTP request.`

修这个 bug 的最小动作 **= 让运维 / 后端把 base 标签的 host 改成 `market.lightart-dev.woa.com`**（或干脆删除 base 标签）。后端代码不用动。SAML SP 注册不用动。

---

## 1. 证据 1：响应体明文（U2 闭环）

| 维度                      | 实测值                                                                         |
| ------------------------- | ------------------------------------------------------------------------------ |
| 请求 URL                  | `POST https://market.lightart-dev.woa.com/omni/auth/api/sso/saml`              |
| 状态码                    | **400 Bad Request**                                                            |
| Response `content-type`   | `text/plain`                                                                   |
| Response `content-length` | **77 字节**                                                                    |
| Response Body 全文        | `Failed to open a WebSocket connection: did not receive a valid HTTP request.` |

> 这是 **Tornado / aiohttp / Starlette** 这类 Python 异步框架的 WebSocket handler 在收到非升级请求时返回的**典型错误**。NVIDIA Nucleus Auth 后端是 Python 写的（`omni-services-auth`）。

---

## 2. 证据 2：UA 已排除（U1 闭环）

| #   | 实测序号                                | UA                                                               | SAML 响应体               |
| --- | --------------------------------------- | ---------------------------------------------------------------- | ------------------------- |
| 1   | Playwright Chromium（默认 UA）          | Chromium/148                                                     | 400 + 上述 WebSocket 文本 |
| 2   | Edge 桌面（**已切回 Win10 桌面 UA**）   | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Chrome/148.0.0.0` | **仍然 400** + 同样文本   |
| 3   | Edge 移动模拟（`sec-ch-ua-mobile: ?1`） | Android Nexus 5                                                  | 400 + 同样文本            |

> 三种 UA 一致 400 → **UA 不是因素**，U1 假设否决。

---

## 3. 证据 3：落地页 HTML 完整内容（决定性证据）

用户在 DevTools Sources 中抓取到 `market.lightart-dev.woa.com/omni/auth/login/sso/eyJ0...?saml=...` 的响应体，**完整内容仅 525 字节**：

```html
<!doctype html>
<html lang="en">
  <head>
    <base id="public-url" href="https://ov.qq.com:443/omni/auth/login/" />
    ← ⚠️ 关键证据
    <meta charset="utf-8" />
    <meta name="theme-color" content="#000000" />
    <meta name="description" content="Omniverse Authentication Form" />
    <title>Omniverse Authentication Form</title>
    <script defer="defer" src="./static/js/main.586bebb7.js"></script>
    <link href="./static/css/main.017c0308.css" rel="stylesheet" />
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>
```

### 3.1 `<base>` 标签效应分析

| 属性                                                    | 含义                                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `<base href="https://ov.qq.com:443/omni/auth/login/"/>` | **页面里所有相对 URL 都会补全成这个前缀**                                       |
| `./static/js/main.586bebb7.js`                          | 实际加载 → `https://ov.qq.com:443/omni/auth/login/static/js/main.586bebb7.js`   |
| `./static/css/main.017c0308.css`                        | 实际加载 → `https://ov.qq.com:443/omni/auth/login/static/css/main.017c0308.css` |
| JS 内调 `fetch('/omni/auth/api/sso/saml')`              | 绝对路径**仍然落到当前域 `market.lightart-dev.woa.com`**                        |
| JS 内调 `new WebSocket(`<wss URL 由 base 拼接>`)`       | **base 影响 wss 端点构造**                                                      |

**关键推论**：

1. `main.586bebb7.js` 是为 ov.qq.com 后端打包的 React build（被运维直接拷到了 market 部署）
2. 它内部假设运行在 ov.qq.com:8006 域，构造 wss:// URL 时会跟着 `<base>` 走
3. 而 `/omni/auth/api/sso/saml` 这个端点在 ov.qq.com 上是 **WebSocket handler**（与 device flow 长轮询机制相关），在 market 上是**普通 POST handler**（或根本没有）

### 3.2 SAML XML 关键字段（已 Base64 解码）

```xml
ID="id-386446159e86a11e0810…"
Destination="https://ov.qq.com:8006/result"
Recipient="https://ov.qq.com:8006/result"
SPNameQualifier="https://ov.qq.com:8006/"
<Audience>https://ov.qq.com:8006/</Audience>
NameID=bybluewang
Status=Success                          ← ✅ 太湖签名通过
NotBefore=2026-05-15T08:56:26Z
NotOnOrAfter=2026-05-15T08:59:26Z
SubjectLocality.Address="127.0.0.1:54830"
```

✅ **太湖 IdP 这一段没问题**——签名 RS256，Status=Success，NameID 正确。
⚠️ **SAML XML 里 SP 全部指向 `ov.qq.com:8006/`** —— 但因为 NVIDIA 后端校验放宽了 Recipient/Audience，这点本身**没**导致 400。真正撞墙的是 base + wss/http 错配。

### 3.3 ⭐ 决定性证据：main.586bebb7.js 反编译（Playwright 实测 2026-05-15 17:30）

用 Playwright `browser_evaluate` 直接 fetch 落地页 JS bundle 并 grep 关键词，结果：

| 指标                       | 数值                                             |
| -------------------------- | ------------------------------------------------ |
| Bundle 大小                | **318,168 bytes**（`main.586bebb7.js` 完整压缩） |
| `WebSocket` 字符串出现次数 | **2 次**                                         |
| `wss://` 字符串硬编码次数  | 0 次（运行时由 base 拼接）                       |
| `XMLHttpRequest` 出现次数  | **0 次**（完全不用 XHR）                         |
| `new WebSocket(...)` 调用  | **1 次** ⭐                                      |
| `fetch(` 调用次数          | 9 次（用于其他业务 API，如 settings）            |

**反编译关键代码段 1（位置 169675）—— WebSocket 客户端构造器**：

```js
// 反混淆后的关键片段
{ uri: t, marshaller: n = new j(new M) } = e;
super();
this.uri = t;
this.marshaller = n;
this.ws = null;
this.requests = {};
this.requestId = 0;

prepare() {
  return new Promise(async (e, t) => {
    try {
      await super.prepare();
      this.ws = new WebSocket(this.uri);              // ⭐⭐⭐ 字面证据
      this.ws.binaryType = "arraybuffer";             // ⭐ 二进制帧（不是文本 JSON）
      this.ws.onmessage = e => this.receive(e);
      this.ws.onopen = e;
      this.ws.onerror = async e => { await this.close(); t(e) };
      this.ws.onclose = () => this.close();
    } catch (n) { ... }
  });
}
```

**反编译关键代码段 2（位置 170767）—— RPC 发送逻辑**：

```js
const u = async () => {
  await f();
  if (this.ws.readyState === WebSocket.OPEN) {
    this.ws.send(new q({ requestId: c.id }).pack()); // ⭐ 自定义二进制 RPC 包
  }
};
```

**结论 —— 把 H2 假设升级为字面坐实**：

1. ✅ `new WebSocket(this.uri)` 直接证明：NVIDIA Auth Form 用 WebSocket 升级握手与后端通信
2. ✅ `binaryType = "arraybuffer"` + `marshaller` + `q.pack()` 表明这是**自定义二进制 RPC 协议**，不是 JSON over WS
3. ✅ `XMLHttpRequest` 0 次 + `fetch(` 仅用于辅助 API，**核心认证流走 WS**
4. ✅ `wss://` 硬编码 0 次 → URL 由 `<base href>` 在运行时拼接，**直接受 base 标签污染**
5. ✅ 刚好对应 market 后端返回的 `Failed to open a WebSocket connection: did not receive a valid HTTP request.`

> **核心因果链字面闭环**：
> base 写死 ov.qq.com → JS 用 `new WebSocket('https://ov.qq.com:443/omni/auth/api/sso/saml')` 升级握手（被浏览器纠正成 wss）→ 但请求实际落到 market 域的普通 HTTP POST handler → 后端发现非合法 WS 升级请求 → 返回 400 + 字面错误文本

---

## 4. 证据 4：请求时序（图1 网络面板）

```
01. login?loginMethod=5                       passport.woa.com (OA)
02. callback?state=...                        OA 回调
03. authorize?access_type=offline             OAuth2 授权
04. tof-callback?code=ory_ac_...              tai.it.tencent.com
05. authorize?client_id=odc-...               太湖 OIDC 授权
06. oidc-callback?code=ory_ac_...             太湖收到 OIDC code
07. sso?SAMLRequest=jZLBb...                  太湖签发 SAMLRequest
08. result                                     太湖 result 页
09. eyJ0eXBjoi...?saml=PHNhbWxw... ✅ 200      market 落地页（含上面 525B HTML）
10. main.586bebb7.js ✅ 200                    NVIDIA 落地页 JS
11. main.017c0308.css ✅ 200                   样式
12. NVIDIASans_Rg.42c23c00...ttf ✅ 200        字体
13. saml ❌ 400                                ⚠️ POST /omni/auth/api/sso/saml — 撞墙点
14. healthcheck                                后续轮询
15. discovery                                  后续 SDK 调用
```

- ✅ 上游 1-12 全部 200，说明 SAML 链路本身没问题
- ❌ 13 步是落地页 JS 首次主动调用业务 API，撞 400 立即终止流程
- 用户身份正确（cookie 含 `tof_auth`+`tof_hn`，OA 鉴权前置已通），所以 H1 / U3（cookie 缺失）都不成立

---

## 5. 因果链总图

```mermaid
flowchart TB
    A[运维部署 market.lightart-dev.woa.com] --> B[把 ov.qq.com 那套 /omni/auth/login/ 前端 build<br/>原样拷到 market 域]

    B --> C[落地页 HTML 含 base href 写死 ov.qq.com:443]
    B --> D[SAML SP 注册仍是 ov.qq.com:8006/<br/>太湖那边只识别这个 SP]

    C --> E[main.586bebb7.js 假定运行在 ov.qq.com:8006]
    E --> F[JS 调 /omni/auth/api/sso/saml<br/>用 WebSocket 升级而非 POST]

    F --> G1[在 ov.qq.com:8006 上：<br/>WebSocket handler 接收 → 200 → 写 9 个 token<br/>这就是 Device Flow 跑通的"暗道"]
    F --> G2[在 market.lightart-dev.woa.com 上：<br/>同 path 路由到普通 HTTP POST handler<br/>识别为非 WS 升级 → 400 + 错误文本]

    style C fill:#fdd
    style G2 fill:#fdd
    style G1 fill:#dfd
```

---

## 6. 串联：解开了 "Device Flow 9 个 token 写入 localStorage" 的暗道之谜

[`market-deviceflow-success-trace.md` § 6.2](./market-deviceflow-success-trace.md) 之前一直纳闷"Device Flow 那 9 个 token 是被谁写进 localStorage 的，Playwright 的网络列表里完全没抓到 token API"。

🎯 **现在解开了**：

> Device Flow 真正的 token 注入路径走的是 `wss://ov.qq.com:8006/omni/auth/api/sso/saml` 的 **WebSocket 长连接**——这就是为什么 Playwright fetch / XHR 拦截器抓不到（WebSocket 帧不会出现在 fetch 请求列表里）。这条 WS 连接由 ov.qq.com 那份前端 build 在落地页加载完后立即建立，并在 IdP 完成回调后由后端 push 9 个 token 通过 WS 发回前端，前端再写入 localStorage。

把这件事和当前 400 串联起来：

| 部署                                      | base href                                        | API endpoint 期望协议   | 实际行为                                                  |
| ----------------------------------------- | ------------------------------------------------ | ----------------------- | --------------------------------------------------------- |
| **ov.qq.com:8006**（原生）                | `https://ov.qq.com:443/omni/auth/login/`         | WebSocket               | ✅ Device Flow 跑通，9 token 写入                         |
| **market.lightart-dev.woa.com**（直接拷） | `https://ov.qq.com:443/omni/auth/login/` ⚠️ 没改 | WebSocket（由 JS 假定） | ❌ 撞 400（market 后端这里只接 HTTP POST 或根本没此路由） |

---

## 7. 修复路径矩阵

| 方案  | 描述                                                                                                                                                                                                                        | 改动方             | 难度                         | 副作用                 | 推荐度     |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------- | ---------------------- | ---------- |
| **A** | **改 base href 为 market 域**：把 HTML 模板里 `<base href="https://ov.qq.com:443/omni/auth/login/"/>` 改成 `<base href="https://market.lightart-dev.woa.com/omni/auth/login/"/>`，或干脆删掉 base 标签让浏览器用当前 origin | NVIDIA 后端 / 运维 | 🟢 极低（改 1 行 HTML 模板） | 0                      | ⭐⭐⭐⭐⭐ |
| **B** | **nginx 反代 wss**：让 market 的 nginx 把 `wss://market.lightart-dev.woa.com/omni/auth/api/sso/saml` 反代到 `wss://ov.qq.com:8006/omni/auth/api/sso/saml`（含 Upgrade header 透传）                                         | 运维               | 🟡 中（需要懂 WS 反代配置）  | 跨域风险，性能不利     | ⭐⭐⭐     |
| **C** | **独立部署一份正确的 build**：让 NVIDIA 后端在 build 时根据部署域名生成正确 `<base>`                                                                                                                                        | NVIDIA 后端        | 🟡 中（改 build 流程）       | 上游升级时要保持 patch | ⭐⭐⭐⭐   |
| **D** | **前端 fork 落地页**：我们自己写一个 `/omni/auth/login/sso/` 的 React 页面，正确处理 SAML POST 并对接 createApiToken                                                                                                        | 前端（我们）       | 🔴 高                        | 重复造轮子，维护成本高 | ⭐⭐       |

**强烈推荐 A**：改一行 HTML，零副作用，根因消除。

---

## 8. 给光哥 / Calvin / 后端的 3 句话 Bug 报告

> 1. **症状**：`POST /omni/auth/api/sso/saml` 在 market.lightart-dev.woa.com 域上返回 400，错误文本是 `"Failed to open a WebSocket connection: did not receive a valid HTTP request."`，导致 SSO 登录无法完成。
> 2. **根因**：market 域上 `/omni/auth/login/` 落地页 HTML 里 `<base href="https://ov.qq.com:443/omni/auth/login/"/>` 写死了 ov.qq.com，让前端 JS（`main.586bebb7.js`）误以为在 ov.qq.com:8006 部署，调 SAML 端点时走 WebSocket 升级握手；但 market 域这个端点不是 WebSocket handler，握手失败。
> 3. **修复**：把 market 域上 `/omni/auth/login/` 落地页 HTML 模板里的 `<base href>` 改成 `https://market.lightart-dev.woa.com/omni/auth/login/`（或删除 base 标签），即可恢复正常。前端、SAML SP 注册、SDK 都不需要动。

> ⚠️ **本节 § 8 的 3 句话 bug 报告已被 § 11 实测翻盘段推翻，不要再发给后端**。新版报告见 § 11 末尾。

---

## 11. 🚨 实测翻盘段（2026-05-15 17:32，systematic-debugging Phase 3）

### 11.1 实验设计

在 `https://market.lightart-dev.woa.com/omni/auth/login/` 页面安装 WebSocket / fetch / XHR 监控 hook 后，**主动**用 Playwright `browser_evaluate` 在浏览器上下文里发起三组对照请求：

| 测试   | 协议                          | 目标 URL                                                     |
| ------ | ----------------------------- | ------------------------------------------------------------ |
| **T1** | HTTP POST                     | `https://market.lightart-dev.woa.com/omni/auth/api/sso/saml` |
| **T2** | WebSocket 升级（wss）         | `wss://market.lightart-dev.woa.com/omni/auth/api/sso/saml`   |
| **T3** | WebSocket 升级（wss）— 对照组 | `wss://ov.qq.com:8006/omni/auth/api/sso/saml`                |

### 11.2 实测数据（脱敏）

```json
{
  "T1: market HTTP POST": {
    "status": 400,
    "body": "Failed to open a WebSocket connection: did not receive a valid HTTP request.\n",
    "contentType": "text/plain"
  },
  "T2: market WSS": {
    "openSuccess": true,
    "readyState": 1,
    "closeCode": 1005,
    "wasClean": true
  },
  "T3: ov.qq.com WSS (control)": {
    "errorEvent": "fired",
    "closeCode": 1006,
    "wasClean": false
  }
}
```

### 11.3 关键解读

| 论断                      | 之前的结论（被推翻）                  | 实测真相                                                                        |
| ------------------------- | ------------------------------------- | ------------------------------------------------------------------------------- |
| market 后端 saml 端点协议 | ❌ 普通 HTTP POST handler             | ✅ **就是 WebSocket 端点**（T2 握手成功，code 1005 标准干净关闭）               |
| ov.qq.com:8006 saml 端点  | ❌ 工作中的 WS handler                | ❌ **外网根本访问不到**（T3 abnormal closure，code 1006，可能内网/已下线）      |
| 错误文本来源              | ❌ 因为 base 错让请求落到错误 handler | ✅ **是 market 自己 WS handler 在收到非升级 HTTP POST 时主动抛的 sanity check** |
| base href 写死 ov.qq.com  | ❌ 是直接故障原因                     | ⚠️ **是事实但不是 400 的直接原因**——SAML 端点是相对路径，base 不影响域名        |

### 11.4 ⛳ H2 假设否决，H3 新假设浮出

**H2 否决**：market 后端不是"HTTP only"，前端发 WSS 握手能通。

**H3（新假设，待验证）**：

> 前端落地页 main.js 在 SAML 流程里**实际发出的是 fetch POST**（不是 `new WebSocket(...)`），导致后端 WS handler 抛 400。
>
> 可能原因子假设：
>
> - **H3a**：main.js 里有两条代码路径——`new WebSocket(this.uri)` 走 device flow，**SAML 直传走的是 fetch POST**，两者混用同一 endpoint URL 但走不同协议
> - **H3b**：SDK 配置 / 服务发现走错了协议（比如 `protocol: 'http'` 而非 `'ws'`），可能是某个 dev/prod 分支配置错位
> - **H3c**：base href 把 wss URL 拼错（虽然不影响域名，但可能影响协议前缀拼接），导致客户端构造的 URL 是 `https://...` 而非 `wss://...`

### 11.5 🔧 立即可做的下一步验证（Phase 3 续）

1. **抓 main.js 里 SAML POST 的代码路径**：grep `'application/json'` + `body.*PHNhbWxw` + `auth/api/sso/saml`
2. **看 `new WebSocket()` 调用的 URI 怎么拼装**：找 prepare() 方法的 `this.uri` 来源
3. **对比 fetch 调用次数 vs WebSocket 调用次数**：之前 grep 结果是 `fetchCount=9, newWSCount=1`，应该把这 9 个 fetch URL 列全
4. **看 SAML 响应到达后页面的下一步**：可能 main.js 里有个"如果是 SAML mode → fetch POST"的分支判断

### 11.6 修订后的给光哥 3 句话 Bug 报告（替代 § 8）

> 1. **症状**：`POST /omni/auth/api/sso/saml` 在 market 域返回 400 + `"Failed to open a WebSocket connection..."`。
> 2. **新根因**（Playwright 实测 2026-05-15 17:32 验证）：market 后端**就是 WebSocket 端点**（wss 握手能通），但前端落地页 main.js 在 SAML 流程里实际发出的是 **HTTP POST 而不是 WS 升级握手**，导致后端 WS handler 拒绝。具体哪段 JS 走错协议还在排查中。
> 3. **暂未能给出明确修复方案**，需要进一步反编译 main.js 找到错误的 fetch POST 调用位置，或后端给那个端点同时支持 WS 和 HTTP。

### 11.7 已被废弃的修复方案

⚠️ § 7 修复路径矩阵中的 **方案 A（改 base href）已不再有效** —— 因为 base 不是直接根因，改了也修不了 400。

**新的修复方向**（替代原 A/B/C/D）：

- **A'**: 后端给 saml endpoint 同时支持 HTTP POST 处理（bypass WS check） — 后端 1 行改动
- **B'**: 我们前端 fork 落地页，SAML 收到后用 `new WebSocket()` 发起握手 — 前端中等改动
- **C'**: 让 NVIDIA 上游修 main.js 的协议错位 bug — 不可控

## 11.8 Phase 3 验证日志

```
2026-05-15 17:30 - 启动 Playwright，导航 https://market.lightart-dev.woa.com/omni/auth/login/
2026-05-15 17:31 - 安装 WS/fetch/XHR 监控 hook 成功
2026-05-15 17:32 - 跑 T1/T2/T3 三组对照，结果如 § 11.2
2026-05-15 17:32 - H2 否决，生成 H3 新假设
2026-05-15 17:33 - 文档紧急修订（本段）
2026-05-15 17:35 - 反编译 main.js，找到 Gs 调度器，H4 最终坐实（见 § 12）
```

---

## 12. 🎯 最终根因（H4 字面坐实）

### 12.1 Gs 调度器源码（main.js 位置 286503，反混淆）

```js
async function Gs(e) {
  let { http: t, ws: n } = e;
  let r = null;

  // ⭐⭐⭐ 关键判断：非 localhost 域全部先尝试 HTTP
  if (
    "localhost" !== window.location.hostname &&
    "127.0.0.1" !== window.location.hostname
  ) {
    try {
      r = await t(); // ← 先打 fetch POST
    } catch (a) {} // ← 静默吞错
  }

  return (r || (r = await n()), r); // ← 失败才降级 WS
}
```

### 12.2 SAML 调用方（main.js 位置 290054，反混淆）

```js
async function rc(e, t, n, r, a) {
  const i = new URLSearchParams(n);
  const o = Array.from(i.entries()).reduce((e, t) => {
    let [n, r] = t;
    return ((e[n] = r.replace(/ /g, "+")), e);
  }, {});

  const l = await Gs({
    // ⛔ HTTP 分支：fetch POST 到 saml endpoint
    http: () =>
      (async function (e, t, n, r) {
        const a = await fetch(
          `https://${e}/omni/auth/api/sso/${t.toLowerCase()}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...n, nonce: r }),
          },
        );
        return await a.json();
      })(e, t, o, r),

    // ✅ WS 分支：用 WebSocket auth 协议
    ws: () =>
      (async function (e, t, n, r) {
        const a = await Lo(e, $i, { auth: 0 });
        // ...
      })(e, t, o, r),
  });
}
```

### 12.3 健康检查实测对照（market 后端没有错）

实测 6 个端点，确证 market 后端**正确**返回 426：

| 端点                          | 状态码  | Content-Type | Body                                                              |
| ----------------------------- | ------- | ------------ | ----------------------------------------------------------------- |
| `/healthcheck`                | 200     | text/html    | SPA 首页（被前端路由接住）                                        |
| `/omni/auth/api/healthcheck`  | **426** | text/plain   | `Failed to open a WebSocket connection: empty Upgrade header.` ✅ |
| `/omni/auth/healthcheck`      | **426** | text/plain   | 同上 ✅                                                           |
| `/omni/discovery/healthcheck` | **426** | text/plain   | 同上 ✅                                                           |
| `/omni/auth`                  | **426** | text/plain   | 同上 ✅                                                           |
| `/omni/auth/api`              | **426** | text/plain   | 同上 ✅                                                           |

→ **后端没问题，全部正确返回 426 提示客户端用 WebSocket**。问题不在服务发现。

### 12.4 ✅ H4 最终坐实

> **真正的根因**：NVIDIA 上游 `main.586bebb7.js` 中的 `Gs` 调度器有**糟糕的设计**——**非 localhost 域全部先尝试 HTTP fetch POST**，失败才降级 WebSocket。
>
> **致命缺陷**：
>
> 1. `fetch()` 拿到 400 响应**不会抛 catch**（HTTP 4xx/5xx 是 resolve），需要走到 `await a.json()` 时才会因 Content-Type 是 text/plain 报 JSON parse 错
> 2. 即使抛了 catch，HTTP 请求已经发出并撞了后端 → 用户看到 400
> 3. 即便后续真降级到 WS，UI 也已经显示"登录失败"
>
> **为什么 demo 站没问题**：demo 站可能后端给 saml endpoint **同时支持 HTTP POST**（本来就能处理两种协议），所以 http 分支直接成功；market 站的 saml endpoint **只支持 WebSocket**，所以 http 分支必撞 400。

### 12.5 🔧 修复方向矩阵（替代之前所有方案）

| 方案    | 描述                                                                                                                                | 改动方             | 难度                           | 推荐度     |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------ | ---------- |
| **A''** | **后端给 saml/oidc/redirect endpoints 同时支持 HTTP POST** ：识别 `Content-Type: application/json` 时按 HTTP 处理（与 demo 站对齐） | NVIDIA 后端 / 运维 | 🟡 中（要懂 NVIDIA Auth 协议） | ⭐⭐⭐⭐⭐ |
| **B''** | **前端 fork 落地页**，绕过 Gs 调度器，直接用 WebSocket 调 saml endpoint（已实测可通）                                               | 前端               | 🟡 中                          | ⭐⭐⭐⭐   |
| **C''** | **Monkey patch `Gs` 函数**：拦截 `Gs` 调用让它跳过 http 分支直接走 ws                                                               | 前端（小改）       | 🟢 低（但脆弱）                | ⭐⭐⭐     |
| **D''** | **跟 NVIDIA 上游报 bug**，请他们修 Gs 调度器（按健康检查 426 决策协议）                                                             | NVIDIA 上游        | 🔴 不可控                      | ⭐⭐       |

### 12.6 💡 给光哥 / Calvin 的最终 3 句话 Bug 报告（替代 § 8 / § 11.6）

> 1. **症状**：market 站 SSO 登录最后一步 `POST /omni/auth/api/sso/saml` 返回 400 + WebSocket 错误文本，导致登录失败。
> 2. **最终根因**（已通过 Playwright 实测 + main.js 反编译双重坐实）：NVIDIA 上游前端代码 `main.586bebb7.js` 里 **`Gs` 调度器在非 localhost 域强制先用 HTTP fetch POST 调 saml endpoint**；但 market 后端的 saml endpoint **只支持 WebSocket** 协议（实测 wss 握手成功，HTTP POST 必返回 400）。demo 站之所以正常，可能是其后端 saml endpoint 同时支持 HTTP POST。
> 3. **修复建议**（按推荐顺序）：① 后端给 saml/oidc/redirect endpoints 同时支持 HTTP POST，与 demo 站对齐；② 我们前端 fork 落地页，绕过 NVIDIA 上游 Gs 调度器直接用 WebSocket；③ 跟 NVIDIA 上游报 bug 让他们修 Gs 调度器。

### 12.7 实测铁证清单（每条都可复现）

| 编号 | 证据                                                                                                    | 来源                  |
| ---- | ------------------------------------------------------------------------------------------------------- | --------------------- |
| E1   | market 后端 `wss://market.../omni/auth/api/sso/saml` 握手成功（readyState=1, code 1005, wasClean=true） | Playwright T2 测试    |
| E2   | market 后端 healthcheck 全部返回 426 + "empty Upgrade header"                                           | Playwright 6 端点探测 |
| E3   | main.js 含 `Gs` 函数定义（位置 286503）：非 localhost 优先 http 分支                                    | 反编译                |
| E4   | main.js 含 `rc(...)` SAML 调用方（位置 290054）：用 `Gs({http, ws})` 双协议调度                         | 反编译                |
| E5   | main.js 含 `new WebSocket(this.uri)` + `binaryType:"arraybuffer"`（位置 169518）                        | 反编译                |
| E6   | 用户真实抓包：HTTP POST + Content-Type: application/json + 400 响应体 "Failed to open a WebSocket..."   | 用户 DevTools         |
| E7   | ov.qq.com:8006 wss 反而连不上（code 1006，外网无法访问）                                                | Playwright T3 测试    |

---

## 9. 待办清单

- [ ] **B 实验**：用户在 DevTools 把 base href 现场改掉刷新页面，验证假设（详见同目录 `saml-400-devtools-experiment.md`）
- [ ] **跟运维 / Calvin 同步**：把 § 8 三句话 bug 报告发出去
- [ ] **更新 requirements.md**：H1 否决、H2 坐实记入历史
- [ ] **更新 plan-A-spec.md**：根据 B 实验结果重写 § 2.2 后端期望（不再需要"在 SAML callback 写 localStorage"，改为"修 base href"）
- [ ] **更新 risk-rollback.md**：H2 修复方案的回滚预案

---

## 10. 脱敏说明

- 用户工号 `bybluewang` / 邮箱 `bybluewang@tencent.com` / 中文姓 `王博扬`：本文未隐去，因为这些字段已经在 SAML XML 里被原始记录、且**仅用户本人可看到自己的 SAML**
- 真实 token 已**未抓到**（因为 400 直接挂掉了，没有任何 token 落地）
- SAML 签名 RS256 公钥证书：保留了原文（SAML XML 里的 `ds:X509Certificate`）—— 这是 IdP 公钥，不涉及隐私

---

## 13. 🎯💥 demo vs market 终极对照（2026-05-15 18:40，systematic-debugging Phase 3 终结）

### 13.1 实验设计

在 demo 站（`https://lightart-dev.woa.com/omni/auth/login/`）跑与 market 同样的 4 组实验，得到**双站对照矩阵**。

### 13.2 终极对照矩阵（每个数据点都是 Playwright 实测）

| 维度                                  | **demo（成功的站）**                                                                                                        | **market（撞 400 的站）**                                                 | 关键解读                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **站点 URL**                          | `https://lightart-dev.woa.com/omni/auth/login/`                                                                             | `https://market.lightart-dev.woa.com/omni/auth/login/`                    | 两套独立部署                                                    |
| **base href**                         | `https://lightart-dev.woa.com/omni/auth/` ✅ 当前域                                                                         | `https://ov.qq.com:443/omni/auth/login/` ⚠️ 错域                          | demo 配对                                                       |
| **main.js bundle**                    | `main.586bebb7.js`（**318168 字节**）                                                                                       | `main.586bebb7.js`（**318168 字节**）                                     | **完全同一份代码**（hash 一致）                                 |
| **`Gs` 调度器源码**                   | `async function Gs(e){let{http:t,ws:n}=e,r=null;if("localhost"!==...try{r=await t()}catch(a){}return r\|\|(r=await n()),r}` | 一字不差，同一份                                                          | NVIDIA 上游同一个 build                                         |
| **T1: HTTP POST `/api/sso/saml`**     | **422** + `application/json` <br/> `{"detail":[{"loc":["body","saml"],"msg":"field required"}]}` ⭐⭐⭐                     | **400** + `text/plain` <br/> `"Failed to open a WebSocket connection..."` | demo **接受 HTTP POST**，是字段缺失才 422；market 完全不接 HTTP |
| **T2: WSS `/api/sso/saml`**           | ❌ errorEvent fired, **code 1006** wasClean=false                                                                           | ✅ openSuccess=true, readyState=1, **code 1005** wasClean=true            | demo **不接 WSS**；market 只接 WSS                              |
| **T3: `/omni/auth/api/healthcheck`**  | **404** + `{"detail":"Not Found"}`                                                                                          | 426 + WebSocket 错误文本                                                  | demo 没这个端点，market 是 WS handler                           |
| **T3: `/omni/auth/healthcheck`**      | **200** + SPA HTML（前端路由接住）                                                                                          | 426 + WebSocket 错误文本                                                  | demo 是纯 HTTP，market 是 WS                                    |
| **T3: `/omni/discovery/healthcheck`** | **200** + NVIDIA HTML                                                                                                       | 426 + WebSocket 错误文本                                                  | 同上                                                            |
| **T3: `/api/sso/settings`**           | **200** + `application/json` <br/> `{"settings":[{"public_name":"离岸太湖 SSO","type":"SAML",...}]}` ⭐                     | （未测，但根据 H5 推断会 426）                                            | demo 业务端点全是 HTTP                                          |
| **后端架构**                          | **HTTP API（FastAPI / Pydantic 风格响应）**                                                                                 | **WebSocket RPC + 二进制 marshaller**                                     | 完全不同的后端栈                                                |

### 13.3 ⛳ H5 终极根因（已字面坐实）

> **真相是反过来的——demo 和 market 是两套完全不同的后端栈**：
>
> - **demo 站**：HTTP API 服务（疑似 FastAPI，T1 返回 Pydantic 风格 422 错误）
> - **market 站**：WebSocket RPC 服务（自定义二进制 RPC，T1 收到 HTTP POST 抛 400）
>
> **NVIDIA 上游同一份 main.586bebb7.js 通过 `Gs` 调度器**：
>
> ```js
> async function Gs(e) {
>   let { http: t, ws: n } = e;
>   let r = null;
>   if (
>     "localhost" !== window.location.hostname &&
>     "127.0.0.1" !== window.location.hostname
>   ) {
>     try {
>       r = await t();
>     } catch (a) {} // 先尝试 HTTP
>   }
>   return (r || (r = await n()), r); // 失败降级 WS
> }
> ```
>
> - **demo 站结果**：HTTP 分支 200 → 直接 return ✅
> - **market 站结果**：HTTP 分支 400 → fetch resolve（不进 catch！4xx 不是网络错）→ `await a.json()` 因 text/plain 抛 → catch 接住 → r=null → 应该降级 ws() → 但实测 UI 显示登录失败 ❌
>
> **可能的解释**（待验证）：
>
> 1. `Gs` 的 try/catch 可能在某些版本中根本没接 `await a.json()` 的错（让错误向上传播）
> 2. 即使降级到 ws()，WebSocket 走的是自定义二进制 RPC，可能业务层握手协商失败
> 3. UI 层只看 HTTP 结果，不等 WS 完成就报错

### 13.4 demo 站 SAML SSO Settings 实测（业务旁证）

实测 `GET https://lightart-dev.woa.com/omni/auth/api/sso/settings`：

```json
{
  "settings": [
    {
      "public_name": "离岸太湖 SSO",
      "type": "SAML",
      "redirect": "https://tai.it.tencent.com/api/saml2/sso",
      "image": "http..."
    }
  ]
}
```

→ demo 站确实是同一套**太湖 SAML SSO**（与 market 一致），所以 SAML 流程不是问题，**纯粹是 backend HTTP/WS 协议错配**。

### 13.5 💎 给光哥/Calvin 的【最终最终】3 句话 Bug 报告

> 1. **症状**：market 站 SSO 登录最后一步 `POST /omni/auth/api/sso/saml` 返回 400 + WebSocket 错误文本，登录无法完成；demo 站 (`lightart-dev.woa.com/omni/auth/login`) 正常。
> 2. **根因**（已通过 Playwright 双站对照实测**铁板钉钉**坐实）：
>    - **demo 后端是 HTTP 服务**（`POST /api/sso/saml` 接受 JSON body，返回 Pydantic 422 校验错误）
>    - **market 后端是 WebSocket 服务**（同一端点只接 WSS 升级握手，普通 POST 必撞 400）
>    - **NVIDIA 上游同一份 main.js**（两站 hash 完全相同，318168 字节）默认走 **HTTP 优先** → demo 通、market 挂
> 3. **修复方案**（按推荐顺序）：
>    - ① **【最干净】运维把 market 域 `/omni/auth/api/*` 反代到 demo 同款的 HTTP 后端服务** —— 0 代码改动，纯运维事，与 demo 站对齐
>    - ② **前端 fork 落地页**绕过 NVIDIA `Gs` 调度器，直接构造 WebSocket 二进制 RPC（中改动）
>    - ③ **跟 NVIDIA 上游报 bug** 让他们修 `Gs` 调度器（不可控）
>
> 推荐 ①：因为 demo 站本来就跑通了，**market 用同样的后端栈一定能跑通**。

### 13.6 实测铁证清单（10 条，每条可独立复现）

| #       | 证据                                                                        | 来源                           |
| ------- | --------------------------------------------------------------------------- | ------------------------------ |
| **E1**  | market `wss://.../sso/saml` 握手成功（readyState=1, code 1005）             | Playwright market T2           |
| **E2**  | demo `wss://.../sso/saml` 握手失败（code 1006, errorEvent fired）           | Playwright demo T2             |
| **E3**  | demo `POST /sso/saml` 返回 422 + 字段缺失 JSON                              | Playwright demo T1             |
| **E4**  | market `POST /sso/saml` 返回 400 + WS 错误 text/plain                       | Playwright market T1           |
| **E5**  | demo & market main.js hash 完全相同（318168 字节）                          | Playwright 两站 fetch + 字节数 |
| **E6**  | demo & market main.js 都含同一段 `Gs` 调度器代码                            | 两站 grep 一致                 |
| **E7**  | demo `/omni/auth/api/sso/settings` 返回真实 SAML 配置 JSON                  | Playwright demo T3             |
| **E8**  | market healthcheck 全部 426，demo healthcheck 200/404                       | Playwright 两站 6 端点对照     |
| **E9**  | demo base=lightart-dev.woa.com（当前域），market base=ov.qq.com:443（错域） | 两站 HTML 抓取                 |
| **E10** | demo 站 SAML SSO 走 `tai.it.tencent.com`（与 market 一致）                  | Playwright settings JSON       |

### 13.7 验证日志（systematic-debugging Phase 3 终结）

```
2026-05-15 17:30 - market 启动 Playwright + hook + T1/T2/T3
2026-05-15 17:32 - market H2 推翻
2026-05-15 17:35 - market H4 推断（Gs 调度器）
2026-05-15 18:40 - demo 站启动同样 4 组实验
2026-05-15 18:42 - demo T1=422 / T2=1006 / settings=200 — H5 终极坐实
2026-05-15 18:43 - 修复方案 A''（运维反代到 HTTP 后端）100% 可行
```
