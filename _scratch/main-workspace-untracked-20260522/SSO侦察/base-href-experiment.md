# DevTools 实验剧本：验证 H2（base 标签写死 ov.qq.com 导致 SAML 400）

> **创建时间**：2026-05-15
> **配套文档**：[saml-api-400-trace.md](./saml-api-400-trace.md) / [requirements.md](../../../period/.codebuddy/plan/sso-saml-400-rootcause/requirements.md)
> **目标**：用最小操作（5 分钟）验证假设 H2 — `<base href="https://ov.qq.com:443/omni/auth/login/">` 是不是 `POST /omni/auth/api/sso/saml` 返回 400 的真因
> **执行方**：必须用 **真实 Edge / Chrome**（不要 Playwright，IdP 端可能风控），桌面 UA（关掉设备模拟）

---

## 0. 实验前置条件

| 项      | 要求                                                                                                     |
| ------- | -------------------------------------------------------------------------------------------------------- |
| 浏览器  | Edge 148+ / Chrome 148+                                                                                  |
| UA      | **桌面**（按 `Ctrl+Shift+M` 确认设备模拟已关闭）                                                         |
| OA 状态 | 已登录 OA Passport（避免被打回登录页）                                                                   |
| Cookie  | 清掉 `market.lightart-dev.woa.com` 域的所有 cookie（DevTools → Application → Storage → Clear site data） |
| 标签数  | 仅打开 1 个目标标签                                                                                      |

---

## 1. 实验步骤（一步一动作）

### Step 1：访问入口

地址栏输入：

```
https://market.lightart-dev.woa.com/omni/auth/login
```

按回车 → 走完 IOA → 太湖 → 快速登录 → 浏览器自动 302 到：

```
https://market.lightart-dev.woa.com/omni/auth/login/sso/eyJ0eXBlIjoi...?saml=PHNh...
```

页面 HTML 加载后**先不要让 JS 跑完**——快速按 `Esc`（停止页面加载）或者：网速快的话**直接打开 DevTools**（`F12`）。

### Step 2：在 DevTools 控制台改 base href（**核心动作**）

`F12` → **Console** 面板，粘贴以下脚本一次性执行：

```js
// === 第一步：阻止 JS 进一步执行 ===
(function () {
  // 读出当前 base
  const base = document.querySelector("base");
  console.log(
    "[实验] 当前 base href =",
    base ? base.getAttribute("href") : "(无)",
  );

  // 改成 market 域
  if (base) {
    base.setAttribute(
      "href",
      "https://market.lightart-dev.woa.com/omni/auth/login/",
    );
    console.log("[实验] 已改写 base href =", base.getAttribute("href"));
  }

  // 注入 fetch / WebSocket 拦截器，记录所有请求
  const origFetch = window.fetch;
  window.__capturedRequests = [];
  window.fetch = function (...args) {
    window.__capturedRequests.push({
      type: "fetch",
      url: args[0],
      options: args[1],
    });
    console.log("[拦截] fetch →", args[0]);
    return origFetch.apply(this, args);
  };
  const origWS = window.WebSocket;
  window.WebSocket = function (url, ...rest) {
    window.__capturedRequests.push({ type: "WebSocket", url });
    console.log("[拦截] WebSocket →", url);
    return new origWS(url, ...rest);
  };
  Object.assign(window.WebSocket, origWS);

  console.log("[实验] 拦截器已就位");
})();
```

**确认 Console 输出**：

- ✅ 应该看到 `[实验] 当前 base href = https://ov.qq.com:443/omni/auth/login/`
- ✅ 应该看到 `[实验] 已改写 base href = https://market.lightart-dev.woa.com/omni/auth/login/`

### Step 3：让 JS 继续跑

如果你刚才按了 Esc 阻止加载——刷新一下页面（`F5`），但这次让 base 改写**先于** JS 调用 `/omni/auth/api/sso/saml`。

> 💡 **注意**：刷新后我们的拦截器可能会丢，所以更稳妥的做法是用 Step 4 的方法（**通过 chrome-extension Override** 永久改写 base）。

### Step 4（备选 / 推荐）：用 Local Overrides 永久改写 base

DevTools 提供 **Sources → Overrides** 功能，可以**修改任意网页的资源**（包括 HTML），刷新后仍生效：

1. F12 → **Sources** 面板
2. 左侧 → **Overrides** 标签 → **Select folder for overrides**，选个空目录（如 `C:\Users\bybluewang\dev-overrides\`）
3. 点开 **Network** → 找到那个落地页请求（GET `/omni/auth/login/sso/eyJ...?saml=...`）
4. 右键 → **Save for overrides**
5. 在 Sources → Overrides 里找到这个文件 → 把 `<base id="public-url" href="https://ov.qq.com:443/omni/auth/login/"/>` 改成：
   ```html
   <base
     id="public-url"
     href="https://market.lightart-dev.woa.com/omni/auth/login/"
   />
   ```
6. 保存 → **不刷新**，先确认 Network 面板的 saml 请求还能复现 → 然后**完整重走一次登录流程**（清 cookie → 访问 `/omni/auth/login` → IOA → 太湖 → 落地）

---

## 2. 期望观察的 4 种结果

实验跑完后，去 **Network** 面板找 `POST /omni/auth/api/sso/saml`，看响应状态码 + 响应体：

| 结果   | 状态码         | 响应体内容                                                                          | 含义                                                                                | H2 结论                                                             |
| ------ | -------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **R1** | **200**        | 含 token / JSON / 重定向指令                                                        | base 改对了，端点也是 HTTP，bug 就是 base 写死                                      | ✅ **H2 完全坐实，最简修复路径已找到（运维改 base href 一行即可）** |
| **R2** | **400**        | 仍是 `Failed to open a WebSocket connection: did not receive a valid HTTP request.` | base 改了但仍 400 → 说明前端 JS 用 WebSocket 调用是写死在 main.js 里的，base 不影响 | ⚠️ **H2 部分坐实**——base 写死是"症状之一"，但根因是端点协议错配     |
| **R3** | **400**        | 不同的错误文本（如 `Invalid SAML signature` / `Audience mismatch`）                 | base 改了让请求格式变了，但 SAML 校验本身也有问题                                   | ⚠️ 出现新假设 H3，需要看新错误文本定位                              |
| **R4** | **未发出请求** | /                                                                                   | base 改写没生效（Override 没正确应用）                                              | ❌ 实验失败，需要重新检查 Override 设置                             |

---

## 3. 同步要捕获的"成功路径"证据（如果 R1 命中）

如果实验结果是 R1（200 响应），**这是黄金机会**——立即按 [requirements.md 需求 3](../../../period/.codebuddy/plan/sso-saml-400-rootcause/requirements.md) 抓 4 类证据：

```js
// 在 Console 跑这段，立即 dump 所有可见状态
JSON.stringify(
  {
    url: location.href,
    localStorage: Object.fromEntries(Object.entries(localStorage)),
    sessionStorage: Object.fromEntries(Object.entries(sessionStorage)),
    cookies: document.cookie,
    capturedRequests: window.__capturedRequests || [],
  },
  null,
  2,
);
```

把输出贴到 `saml-success-injection-trace.md`（待新建）的 §1 章节。

**特别看几个关键 key**：

- `localStorage.omni_access_token` 是否出现？长度多少？
- `localStorage.omni_refresh_token` 是否出现？
- `localStorage.omni_username` 是否出现？
- `document.cookie` 里是否有 `nucleus_token` / `nucleus_refresh` / `nucleus`？
- `Set-Cookie` 响应头里 cookie 的 Domain 是 `.lightart-dev.woa.com` 还是 `market.lightart-dev.woa.com`？（决定能否跨子域共享）

---

## 4. 如果实验做不出来 — 备选方案

如果 Local Overrides 配不通 / SAML 时间窗失效（NotOnOrAfter 只有 3 分钟），可以走**简化版**实验：

### 简化版：用 Console 直接发请求（验证端点协议）

不走完整 SAML 流程，只验证"`/omni/auth/api/sso/saml` 端点是 HTTP 还是 WebSocket"：

```js
// A. 试 HTTP POST（伪 SAML payload）
const r = await fetch("/omni/auth/api/sso/saml", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ saml: "<test/>" }),
});
console.log("[A] HTTP POST:", r.status, await r.text());

// B. 试 WebSocket 连接
try {
  const ws = new WebSocket(
    "wss://market.lightart-dev.woa.com/omni/auth/api/sso/saml",
  );
  ws.onopen = () => console.log("[B] WebSocket 连接成功");
  ws.onerror = (e) => console.log("[B] WebSocket 错误", e);
  ws.onclose = (e) => console.log("[B] WebSocket 关闭", e.code, e.reason);
} catch (e) {
  console.log("[B] WebSocket 抛错", e);
}
```

期望的发现：

| 现象                                                                    | 含义                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| A 返回 400 + WebSocket 错误文本，B WebSocket 立即关闭（code 1006/1011） | market 后端**根本没实现** SAML 接收（无论 HTTP 还是 WS）     |
| A 返回 400 + WS 错误文本，B WebSocket 连接成功                          | market 后端**只接受 WebSocket**，前端 fetch 是错的           |
| A 返回 400 + 不同错误（如 invalid saml），B 失败                        | market 后端是 HTTP，但 payload 校验更严，需要改 payload 格式 |

---

## 5. 实验结果回传给我后，我要做什么

| 你给我的结果           | 我立刻做的事                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| R1（200）              | 把 H2 标记为 100% 坐实 → 写一份 5 句话 bug 报告给光哥/Calvin → 同时在 plan-A-spec.md 加 "S1 方案：纯 redirect" 章节 |
| R2（400 + WS 错误）    | 升级到 H4：协议错配是根因，写一份 "需要后端确认 endpoint 协议" 的对接需求                                           |
| R3（400 + 新错误）     | 进入 H5 调查路径，按新错误信息重新定位                                                                              |
| R4（实验失败）         | 重新设计 base href Override 的正确姿势                                                                              |
| 简化版 A 失败 + B 成功 | 立刻知道 market 后端只支持 WS，可以**前端写 WebSocket 客户端**绕过                                                  |

---

## 6. 安全提示

- ⚠️ Console 注入的 fetch / WebSocket 拦截器**只在当前页面生效**，刷新后失效，不会影响其他页面
- ⚠️ Local Overrides 改写的文件**永久存储在你电脑上**，下次访问同 URL 会自动应用——做完实验**记得去 Sources → Overrides 取消勾选 / 删除该文件**，避免污染未来访问
- ✅ 整个实验**只动浏览器本地状态**，不影响任何线上服务 / 后端 / 同事

---

## 7. 速查表（5 分钟最短路径）

```
1. 关设备模拟（Ctrl+Shift+M）
2. 清 cookie（Application → Clear site data）
3. F12 → Sources → Overrides → 选目录
4. 访问 /omni/auth/login → 走完 IOA
5. Network 找落地页 HTML → 右键 Save for overrides → 改 base href → 保存
6. 清 cookie 再走一次完整登录流程
7. Network 找 /omni/auth/api/sso/saml → 看状态码 + 响应体
8. 把状态码 + 响应体明文贴给我
```

---

**📨 实验做完后，请把以下 4 条信息打包贴给我**：

1. `POST /omni/auth/api/sso/saml` 的状态码（200 / 400 / 其他）
2. 响应体明文（前 200 字符即可，含错误信息）
3. `localStorage` dump（用 §3 的 console 脚本生成）
4. `Set-Cookie` 响应头里所有 cookie 的 Domain / SameSite / Secure 元数据
