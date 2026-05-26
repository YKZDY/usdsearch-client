# 复登录 / 已登录态对比录制

> **录制时间**：2026-05-15 14:51-14:54 (CST)
> **场景**：在任务 4 中 IOA SAML 登录成功后，**不清 cookie**，主标签重新加载 SPA，对比 SPA 是否能识别已登录态。
> **结论**：⚠️ **登录虽然成功（cookie 写入），但 SPA 业务接口还是 401**。这暴露了登录与业务认证之间还有一层"token 转换链"未打通。

---

## 0. 关键事实速览

| 维度                                                      | 实测结果                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 登录后 cookie 状态                                        | ✅ `nucleus_token` / `nucleus_refresh` / `nucleus` 完整存在                           |
| 登录后 localStorage                                       | ❌ 仍为空（IOA 路径不写 localStorage）                                                |
| 主页重新加载后业务接口                                    | ❌ `POST /search_hybrid` **仍 401**（"Unauthorized: Missing or invalid credentials"） |
| `ov.qq.com/healthcheck` 轮询                              | ❌ 仍持续 426（与登录态无关，是 SPA 配置 bug）                                        |
| 用 `fetch()` 手动调业务接口（带 `credentials:'include'`） | ❌ 仍 401，**即使浏览器自动带了 cookie**                                              |

> **意外结论**：cookie 写入了，但**业务后端不认这个 cookie**。说明登录与业务后端走两套独立认证体系。

---

## 1. 复登录链路实测步骤

### 1.1 任务 4 残留状态（开始条件）

- localStorage：仅 `chakra-ui-color-mode`
- cookies：`nucleus_token` / `nucleus_refresh` / `nucleus`（IOA SAML 登录写入）
- 主页：当前停在 market 主页（已被 `?server=nucleus` 加载）

### 1.2 重新加载主页（保留 cookie）

```text
GET https://market.lightart-dev.woa.com/?server=nucleus → 200
```

页面 SPA 加载完成后：

- **没有**弹出"通过 Nucleus 认证"对话框（这是和首次访问的差异点 — 至少 SPA 没有立刻强制走 Device Flow）
- **没有**显示已登录用户头像或 Logout 按钮（SPA 不知道自己已经登录）
- 业务 API `/search_hybrid` 仍走 401 路径

### 1.3 手动 fetch 业务接口（带 cookie）

```jsonc
// browser_evaluate
{
  "function": "async () => fetch('/search_hybrid', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'x-usdsearch-storage-backend': 'nucleus' }, body: JSON.stringify({ query: 'test', limit: 1 }) })",
}
```

返回：

```jsonc
{
  "status": 401,
  "ok": false,
  "bodyLen": 57,
  "bodyPreview": "{\"detail\":\"Unauthorized: Missing or invalid credentials\"}",
  "cookiesNow": ["nucleus_token", "nucleus_refresh", "nucleus"],
}
```

**这是关键发现**：浏览器自动带了 cookie（`credentials:'include'`），但业务后端拒绝。

---

## 2. demo 站 vs market 站复登录对比

| 维度                                    | demo 站（`lightart-dev.woa.com`）          | market 站（`market.lightart-dev.woa.com`）           |
| --------------------------------------- | ------------------------------------------ | ---------------------------------------------------- |
| 登录后 localStorage `omni_access_token` | ✅ 有，长度 731 RS256 JWT                  | ❌ 无                                                |
| 登录后 cookie `nucleus_token`           | ✅ 有（同域）                              | ✅ 有（同域）                                        |
| 业务接口认证依据                        | **Cookie** `nucleus_token`（业务接口 200） | ❓ **未知**（cookie 不被接受，token 也没有）         |
| 复登录是否秒过                          | ✅ 是（cookie 还在，无需重新走 SAML）      | ❓ **不能直接用**（即使 cookie 在，业务 API 仍 401） |

---

## 3. 真正的根因（修正版，比 task 4 更精确）

任务 4 的推断："SPA 用错了登录入口（Device Flow 而非 IOA SAML）"

任务 5 的修正："**即使用对 IOA SAML，登录获得的 cookie 也不能直接给 market 业务 API 用，二者之间还需要一层 token 颁发**"。

可能的原因（待 task 6 / task 7 进一步验证或决策）：

| 假设                                                         | 含义                                                                                                       | 验证方法                                                                                            |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **A. market 业务后端要 Bearer JWT**                          | 需要类似 demo 站的 `omni_access_token`，前端从 cookie 换 token 并加 `Authorization: Bearer <jwt>` 头       | 看 demo 站登录后业务 API 请求 header（已知：demo 没用 Authorization，靠 cookie）→ ❌ 这条假设不成立 |
| **B. market 业务后端 cookie 名字不对**                       | cookie 叫 `nucleus_token`，但业务后端期望叫 `omni_access_token` 或别的                                     | 用 fetch 试不同 cookie 名 / 看后端配置                                                              |
| **C. market 业务后端检查的是另一种 cookie**                  | IOA SAML 写的 cookie 是给 Nucleus Auth UI 用的，业务后端要的是更上游的鉴权（比如 OA Passport TOF4 cookie） | 验证：market 主页是否需要先走 OA Passport 的 `/_auth_login/`，再走 IOA SAML                         |
| **D. 项目代码里的 `taggingService.createApiToken` 才是关键** | demo 站和 market 站可能都需要这步：拿 cookie/login token 调一个 `/auth/api-token` 接口换永久 API Token     | 看 `taggingService.createApiToken` 的实现                                                           |

> **task 7 设计阶段必须先弄清这一点**。当前看 D 假设可能性最高（与项目代码里 `createApiToken` 的存在吻合）。

---

## 4. 数据采集环境

- 浏览器：同任务 4，未关闭未清空
- 录制起止：14:51:38 → 14:54:30 CST
- OA cookies：仍保留
- 主标签：market 主页（重新加载，cookie 保留）
- 副标签：market `/omni/auth/login/sso/...`（已登录状态页）

---

## 5. 给 diff-analysis（task 6）的输入

本次复登录测试**新增**了一组关键事实：

1. ✅ IOA SAML 登录能成功（task 4 已验证）
2. ✅ 写入的 cookie 是同域、可被浏览器自动携带（task 5 验证）
3. ❌ **但 market 业务 API 不认这些 cookie** → 与 demo 站的"cookie 直接用"模式**不同**
4. ❌ **localStorage 也没 omni_access_token** → 与 demo 站的"token 在 localStorage"模式**也不同**

→ market 站需要前端**做一步额外操作**才能让业务 API 通过：

- 选项 1：调用 `/omni/auth/api-token` 类接口，用 cookie 换 API Token
- 选项 2：让后端配置改成接受 `nucleus_token` cookie 直接鉴权
- 选项 3：把 demo 站的 `omni_access_token` 注入逻辑搬到 market 站

> 这三个选项的取舍交给 task 7 设计文档定夺。

---

## 6. 【2026-05-15 修订】§ 3 "根因"完全错了，以下是正确版

> § 0–§ 2 的网络录制事实正确，§ 3 的"根因推断"基于错误前提，必须修正。

### 6.1 cookie 401 不是 bug，是预期行为

之前推断"cookie 写入了但业务后端拒绝 = 登录与业务认证脱节"。

**修正**：market 站业务接口本来就**不认 cookie**，它要的是

```js
Authorization: Basic btoa("$omni-api-token:" + 永久API Token)
```

这个 Basic Auth header（见 [`HybridDeepSearchUI.jsx:1336-1337`](../../web/src/HybridDeepSearchUI.jsx)）。

而**永久 API Token** 是通过 [`nucleus.jsx:187 createApiToken()`](../../web/src/nucleus.jsx) 拿临时 access_token 去换的。

我手动 `fetch('/search_hybrid', { credentials: 'include' })` 401 的原因是：

- IOA SAML 路径在浏览器里走完后**只写了 cookie**，**没有触发 SPA 的 createApiToken**
- localStorage 里的 `<host>_nucleus_access_token` 没被填充
- 业务请求拼不出 Basic Auth header → 后端 401（**完全正常**）

### 6.2 § 3 表格里假设 A/B/C/D 的正解

| 假设                              | 修正后判定                                                                                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. 业务后端要 Bearer JWT          | ❌ 不是。业务后端要的是 Basic Auth + `$omni-api-token:<永久 token>`                                                                                                                                                                   |
| B. cookie 名字不对                | ❌ 不是。cookie 完全不是关键路径                                                                                                                                                                                                      |
| C. 要走 OA Passport 那层          | ❌ 不是。OA Passport 那层是 demo 站访问 lightart-dev.woa.com 时 nginx 的入口鉴权，与业务接口认证无关                                                                                                                                  |
| **D. createApiToken 才是关键** ✅ | **正解**。Device Flow 现在能跑通，正是因为它走完了 Device Code → 临时 access_token → `createApiToken` → 永久 API Token → `localStorage.<host>_nucleus_access_token` 全链路；IOA SAML 浏览器手动登录到第 3 步就停了，所以 Tag 链不通畅 |

### 6.3 复登录测试本身的决策价值（重新评估）

旧定位：复登录测试是为了**验证 cookie 是否被业务接受**。
修正后：cookie 是否被业务接受**不是核心问题**——因为我们项目从来不依赖 cookie 走业务。
所以复登录测试的真实价值变成：

- ✅ 印证了"光走 IOA SAML、不走 createApiToken，业务必 401"这条因果链
- ✅ 印证了"cookie 状态不会自动恢复 SPA 登录态"，登录态恢复必须靠 localStorage 里的永久 API Token

### 6.4 § 5 "三选一"全部作废

| 旧选项                                                   | 修正                                                     |
| -------------------------------------------------------- | -------------------------------------------------------- |
| 选项 1：调 `/omni/auth/api-token` 用 cookie 换 API Token | ❌ 不需要。直接复用现有 `createApiToken` 即可            |
| 选项 2：让后端接受 cookie 鉴权                           | ❌ 不需要也不应该（破坏现有体系）                        |
| 选项 3：把 demo 站 `omni_access_token` 逻辑搬过来        | ⚠️ 部分对——搬的是 access_token 拿到后立刻 createApiToken |

**真正的方案**（详见 `diff-analysis.md` / `plan-A-spec.md`）：

> **替换 Device Flow 的"用户输 8 位码"前段为 IOA 弹窗自动拿 access_token**，
> **后段 `createApiToken → 永久 token → <host>_nucleus_access_token` 一字不动**。

### 6.5 红线（与 demo / market trace 同步）

> **Tag 功能 100% 不能挂** = `localStorage.<host>_nucleus_access_token` 必须有值且为永久 API Token。
> [BatchTagModal](../../web/src/components/BatchTagModal.jsx) / [useBatchTagger](../../web/src/hooks/useBatchTagger.js) / [useGlobalTags](../../web/src/hooks/useGlobalTags.js) / [EditableTagsPanel](../../web/src/components/EditableTagsPanel.jsx) **一行不动**。
