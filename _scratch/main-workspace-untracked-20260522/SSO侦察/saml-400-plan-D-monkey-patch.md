# 方案 D：market 站浏览器 monkey-patch `Gs` 调度器实测脚本

> **目的**：验证 § 13 H5 终极根因的"反向命题"——
> **如果前端不走 HTTP 分支，只走 WS 分支，market 站能不能登录成功？**
>
> 如果能成功 → 加第 11 条铁证：market 后端 WSS 路径完全工作，前端只要绕过 NVIDIA `Gs` 的 HTTP 优先即可。
> 如果仍失败 → 揭示一个未解之谜：HTTP 失败后即便降级到 WS 也救不回来（业务层握手协商可能也有问题）。
>
> **预期耗时**：5 分钟
> **风险**：极低，纯前端 monkey-patch，不动后端、不改文件
> **关联文档**：[`saml-api-400-trace.md`](./saml-api-400-trace.md) § 12 `Gs` 调度器源码 + § 13 双站对照矩阵

---

## 0. TL;DR — 你只要做这件事

1. 打开 `https://market.lightart-dev.woa.com/omni/auth/login/`
2. F12 打开 DevTools → Console
3. **在你点击 SSO 登录按钮 _之前_，把下面 § 2 的脚本整段复制粘贴到 console 回车执行**
4. 看到 `[plan-D] ✅ 探针就绪，请点击 SSO 登录按钮` 后，正常走 SSO 登录
5. 观察 console 里 `[plan-D]` 前缀的日志，按 § 4 的判定表得出结论

---

## 1. 背景：为什么不能直接 monkey-patch `Gs`

`Gs` 是 webpack 打包后的**模块内私有函数**（main.js 位置 286503），既不挂在 `window` 上，也不是某个全局对象的方法。调用方 `rc()`（位置 290054）通过闭包引用 `Gs`，链路在 build 时已经定型。

所以我们用**两条侧路**让 `Gs` 自己绕开 HTTP 分支：

| 策略       | 原理                                                                                                                                            | 优势                                | 风险                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------- |
| **策略 A** | `Object.defineProperty` 伪装 `window.location.hostname === 'localhost'` → `Gs` 自己 if 判断后跳过 HTTP 直接走 ws()                              | 最干净，触发 NVIDIA 自留的 dev 路径 | 部分浏览器对 `location` 防御严格可能失败          |
| **策略 B** | 拦截 `fetch`，让所有发往 `/omni/auth/api/sso/saml` 的 POST 立即 `reject(new TypeError('plan-D blocked'))` → `Gs` 的 try/catch 接住后降级到 ws() | 兼容性最好                          | 如果业务层在 `Gs` 之外还有别的 fetch 路径会被牵连 |

下面的脚本**两个策略都打开**，互为兜底。

---

## 2. 完整 console 脚本（整段复制粘贴）

```js
/* ============================================================
 * SSO Plan-D Monkey-Patch — 强制 Gs 调度器只走 WS 分支
 * 用途：验证 market 后端 WSS 路径能否完成登录
 * 关联：saml-api-400-trace.md § 12 / § 13
 * ============================================================ */
(() => {
  const TAG = "[plan-D]";
  const SAML_PATH_RE = /\/omni\/auth\/api\/sso\/(saml|oidc|redirect)/i;

  // ---------------- 策略 A：伪装 hostname 为 localhost ----------------
  // Gs 函数体里有判断：
  //   if ("localhost" !== window.location.hostname && "127.0.0.1" !== ...) { try { r = await t(); } catch(a) {} }
  // 把 hostname 伪装成 localhost，Gs 就跳过 HTTP 分支直接 await n()
  let strategyAOk = false;
  try {
    const realLocation = window.location;
    const realHostname = realLocation.hostname;
    Object.defineProperty(window, "location", {
      configurable: true,
      get() {
        // 返回一个代理：除了 hostname 外其他全部透传给原 location
        return new Proxy(realLocation, {
          get(target, prop) {
            if (prop === "hostname") return "localhost";
            const v = target[prop];
            return typeof v === "function" ? v.bind(target) : v;
          },
        });
      },
    });
    if (window.location.hostname === "localhost") {
      strategyAOk = true;
      console.log(
        `${TAG} ✅ 策略 A 生效：hostname 已伪装为 localhost（真实=${realHostname}）`,
      );
    }
  } catch (e) {
    console.warn(
      `${TAG} ⚠️ 策略 A 失败：${e && e.message}（这是浏览器防御，正常）`,
    );
  }

  // ---------------- 策略 B：拦截 fetch 让 HTTP 分支 reject ----------------
  // 即使策略 A 失败了，让 fetch 直接报网络错误，Gs 的 try/catch 会接住降级 WS
  const realFetch = window.fetch.bind(window);
  let httpBlockedCount = 0;
  window.fetch = function patchedFetch(input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (SAML_PATH_RE.test(url)) {
      httpBlockedCount++;
      console.warn(
        `${TAG} 🚫 拦截 HTTP 分支 (#${httpBlockedCount}): ${(init && init.method) || "GET"} ${url}`,
      );
      return Promise.reject(
        new TypeError(`plan-D blocked: forced HTTP rejection on ${url}`),
      );
    }
    return realFetch(input, init);
  };
  console.log(
    `${TAG} ✅ 策略 B 生效：fetch 已劫持，匹配 ${SAML_PATH_RE} 的请求会被拒绝`,
  );

  // ---------------- 探针：监控 WebSocket 生命周期 ----------------
  const RealWS = window.WebSocket;
  let wsCount = 0;
  const wsRecords = [];
  function PatchedWS(url, protocols) {
    wsCount++;
    const id = wsCount;
    const ws = protocols ? new RealWS(url, protocols) : new RealWS(url);
    const rec = {
      id,
      url,
      openedAt: null,
      closedAt: null,
      closeCode: null,
      wasClean: null,
      framesIn: 0,
      framesOut: 0,
      errors: 0,
    };
    wsRecords.push(rec);
    console.log(`${TAG} 🔌 [WS #${id}] new WebSocket("${url}")`);

    ws.addEventListener("open", () => {
      rec.openedAt = Date.now();
      console.log(
        `${TAG} 🟢 [WS #${id}] OPEN  readyState=${ws.readyState} protocol=${ws.protocol || "(none)"}`,
      );
    });
    ws.addEventListener("message", (e) => {
      rec.framesIn++;
      const sz =
        e.data instanceof ArrayBuffer
          ? e.data.byteLength + "B (binary)"
          : typeof e.data === "string"
            ? e.data.length + "B (text)"
            : "?";
      if (rec.framesIn <= 10)
        console.log(`${TAG} 📥 [WS #${id}] frame in #${rec.framesIn} ${sz}`);
      else if (rec.framesIn === 11)
        console.log(
          `${TAG} 📥 [WS #${id}] ... (further frames suppressed, see wsRecords)`,
        );
    });
    ws.addEventListener("error", (e) => {
      rec.errors++;
      console.warn(`${TAG} 🔴 [WS #${id}] ERROR fired`);
    });
    ws.addEventListener("close", (e) => {
      rec.closedAt = Date.now();
      rec.closeCode = e.code;
      rec.wasClean = e.wasClean;
      console.log(
        `${TAG} ⚫ [WS #${id}] CLOSE code=${e.code} wasClean=${e.wasClean} reason="${e.reason || ""}" framesIn=${rec.framesIn}`,
      );
    });

    // 拦截 send 统计出帧数
    const realSend = ws.send.bind(ws);
    ws.send = function (data) {
      rec.framesOut++;
      const sz =
        data instanceof ArrayBuffer
          ? data.byteLength + "B (binary)"
          : typeof data === "string"
            ? data.length + "B (text)"
            : "?";
      if (rec.framesOut <= 5)
        console.log(`${TAG} 📤 [WS #${id}] frame out #${rec.framesOut} ${sz}`);
      return realSend(data);
    };
    return ws;
  }
  PatchedWS.prototype = RealWS.prototype;
  PatchedWS.CONNECTING = RealWS.CONNECTING;
  PatchedWS.OPEN = RealWS.OPEN;
  PatchedWS.CLOSING = RealWS.CLOSING;
  PatchedWS.CLOSED = RealWS.CLOSED;
  window.WebSocket = PatchedWS;

  // ---------------- 暴露调试句柄 ----------------
  window.__planD = {
    strategyAOk,
    httpBlockedCount: () => httpBlockedCount,
    wsRecords,
    summary() {
      console.table(
        wsRecords.map((r) => ({
          id: r.id,
          url: r.url.length > 60 ? r.url.slice(0, 57) + "..." : r.url,
          opened: !!r.openedAt,
          framesIn: r.framesIn,
          framesOut: r.framesOut,
          closeCode: r.closeCode,
          wasClean: r.wasClean,
        })),
      );
      console.log(`${TAG} httpBlocked=${httpBlockedCount}, wsCount=${wsCount}`);
    },
  };

  console.log(
    `${TAG} ✅ 探针就绪，请点击 SSO 登录按钮。完成后跑 __planD.summary()`,
  );
})();
```

---

## 3. 操作步骤

1. **新开** 一个隐身/无痕窗口（避免旧 token 干扰判定）
2. 访问：`https://market.lightart-dev.woa.com/`
3. F12 → Console，**先**整段粘贴 § 2 脚本回车，看到 `[plan-D] ✅ 探针就绪…`
4. 点击 SSO 登录按钮，正常走太湖 OIDC + 太湖 SAML 流程
5. 回到 market 站落地页时，观察 console 输出
6. 登录流程跑完（成功或失败）后，在 console 跑：
   ```js
   __planD.summary();
   ```
7. 把 console 输出和 `summary()` 表格截图保存到本目录 `saml-400-plan-D-result.png`

---

## 4. 结果判定表

| 实测现象                                                           | 结论                                                                                                                                        | 下一步                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| ✅ 登录跑通 + localStorage 出现 9 个 token + WS framesIn ≥ 1       | **铁证 +1**：market 后端 WSS 路径**完全可用**，前端绕过 `Gs` HTTP 优先即可修复。方案 ②（前端 fork）100% viable。                            | 把这条铁证补到 trace.md § 13.6（编号 E11），明天直接给光哥发"3 个修复方案任选" |
| ⚠️ WS 握手成功 (open) 但没收到 framesIn / 收到很少 / close 非 1000 | market 后端 WS handler **能接，但业务层 RPC 协议握手或 SAML 鉴权环节有问题**。方案 ② 仍可能 viable，但要先解码 marshaller / pack() 协议格式 | 先做策略 A→ ws 协议反编译；再决定 ② 是否值得做                                 |
| ❌ HTTP 拦截计数=0 + WS 计数=0                                     | `Gs` 调度器在 SAML 阶段没被触发，可能 SAML 阶段走了别的代码路径                                                                             | 重新读 main.js `rc()` 上下文（位置 290054）找真正调用方                        |
| ❌ HTTP 拦截计数 ≥1 但 WS 计数=0                                   | `Gs` 的降级路径有 bug：HTTP 失败后**没有真的 await n()**（可能 try/catch 把 r 设成了 undefined 而不是 null）。这正是 § 13.3 未解之谜的答案  | 把这条铁证补到 trace.md，明天给 NVIDIA 上游报 bug                              |
| ❌ HTTP 被拦截 + WS open=true + close 1006 立刻断                  | WS 握手层成功但 server 立即拒绝，可能 cookie/auth header 没透传。                                                                           | 检查 `Sec-WebSocket-Protocol` 子协议 header                                    |

---

## 5. 已知风险 / 注意事项

1. **策略 A `Object.defineProperty(window, 'location', ...)` 在某些浏览器（尤其是新版 Edge/Chrome 高版本）可能被原生防御**。如果失败，控制台会有 `⚠️ 策略 A 失败` 的提示，**这不影响实验**——策略 B（fetch 拦截）依然生效。
2. **第三方脚本可能也走 fetch**：策略 B 的拦截只匹配 `/omni/auth/api/sso/(saml|oidc|redirect)`，不会误伤 settings / discovery / healthcheck 等其他端点。
3. **OIDC 重定向期间脚本会丢失**：太湖 SSO 流程会跳转 `tai.it.tencent.com`，回到 market 站时是新页面，monkey-patch 失效。**所以必须在第 6 步前重新跑一遍脚本**——
   **修订步骤**：先访问 `/omni/auth/login/`（不点登录），跑脚本，再点 SSO 登录跳走，回到落地页时**赶在 `Gs` 触发之前**再贴一次脚本（落地页加载到 `Gs` 调用大概 200~500ms，时间够）。
   - **更稳的做法**：用 Chrome 扩展 / Tampermonkey / DevTools Sources Snippets → "Run on page load"
4. **数据脱敏**：截图时遮挡 cookie / token 列；本目录已有 `*-trace.md` 的脱敏惯例，照搬即可。

---

## 6. 推荐：用 DevTools Snippet 而非 console 直接粘贴

为了解决"重定向后脚本丢失"问题，强烈推荐：

1. F12 → Sources → 左边栏 `>>` → **Snippets** → New snippet
2. 命名 `plan-D-monkey-patch.js`
3. 粘贴 § 2 脚本保存
4. 每次落地页刷新后，在 Snippets 里右键 → **Run** （或 Ctrl+Enter），秒级生效
5. 完整流程里你只需要在两个时机 Run：
   - 第一次：登录前的落地页加载完
   - 第二次：太湖回跳到 market 落地页加载完（`Gs` 触发前）

---

## 7. 实验记录（待填）

```
执行时间：YYYY-MM-DD HH:MM
执行人：
浏览器：Edge / Chrome 版本号
策略 A 是否生效：
HTTP 拦截次数：
WS 连接数：
WS 帧入/出：
最终登录结果：成功 / 失败
关键截图：./saml-400-plan-D-result.png
```

---

## 8. 收尾：把铁证补回 trace.md

实验完成后，根据 § 4 判定表，把对应铁证编号（E11~E15）补到 `saml-api-400-trace.md` § 13.6：

```diff
| #       | 证据                                                                        | 来源                           |
| ------- | --------------------------------------------------------------------------- | ------------------------------ |
| **E10** | demo 站 SAML SSO 走 `tai.it.tencent.com`（与 market 一致）                  | Playwright settings JSON       |
+ | **E11** | market 站 monkey-patch `Gs` 强制走 ws() 后登录跑通（plan-D 实测）           | DevTools console 实测          |
```

然后 § 13.5 给光哥的 3 句话报告里，方案 ② 后面可以加一句"**已通过 plan-D monkey-patch 字面验证可行**"。
