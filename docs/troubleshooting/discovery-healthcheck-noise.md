# Discovery Healthcheck 噪音 — Console 大堆报错根因 (lm)

> **观察日期**：2026-05-22
> **观察人**：王博扬（calvin 演示场景） + AI 调研
> **关联分支**：lm / fix/lm-tag-wss-auth-expiry
> **状态**：✅ **已修复（2026-05-22，与 P0 同 commit 提交）**

## ✅ 修复落地

| 改动 | 文件 | 行号 | 效果 |
|---|---|---|---|
| 缓存 DiscoverySearch 实例（per server） | `web/src/nucleus.jsx` | L50-138 | 同 server 复用 _ws，避免重复 healthcheck |
| connectToService 改用 getDiscovery | `web/src/nucleus.jsx` | L173-191 | 移除 finally close，client transport 仍各自 close |
| polling 默认 interval 5s → 10s | `web/src/nucleus.jsx` | L420-426 | 配合缓存把噪音再压一半 |
| 监听 auth-updated/storage 自动清缓存 | `web/src/nucleus.jsx` | L139-153 | 切服务器/登录态时不持有 stale 连接 |
| 紧急关闭开关 | `web/src/nucleus.jsx` | L74-83 | `sessionStorage.disableDiscoveryCache=1` 后刷新即回退 |

### 实测对比（Playwright MCP 真实验证）

| 指标 | 修复前 | 修复后 | 改善 |
|---|---|---|---|
| 登录态进首页 console errors | 16 | **0** | **-100%** ✅ |
| 登出后 15s discovery fetch 次数 | ~9 | **3** | -67% |
| 登出后 41s 累计 fetch | 27 | **5（不再涨）** | **-81%** ✅ |
| 登出后 1min+ 累计 errors | 112+ | **4（永久稳定）** | **-96%** ✅ |
| Device Flow Modal 正常弹出 | ✅ | ✅ | 不退化 |
| P0 修复 wss auth 链路 | ✅ | ✅ | 不退化 |

### 紧急回滚方案

如果线上出现 stale 连接问题：

```javascript
// DevTools Console:
sessionStorage.setItem('disableDiscoveryCache', '1');
location.reload();
// 立即回退到 lm 原行为（每次 new DiscoverySearch + close）
```

---

## 🔍 原始现象（修复前）

每次进入页面（未登录态）或点击「清除令牌」（登出）后，DevTools Console 在数十秒内涌出 **60-120+ 个 error**，且持续累积，永不停歇。

典型片段：


```
[ERROR] Access to fetch at 'http://ov.qq.com/omni/discovery/healthcheck' from origin 'http://localhost:3000' has been blocked by CORS policy
[ERROR] Failed to load resource: net::ERR_FAILED  @ http://ov.qq.com/omni/discovery/healthcheck:0
[ERROR] Failed to load resource: 426 (Upgrade Required)  @ https://ov.qq.com/omni/discovery/healthcheck:0
[INFO]  Found the (wss:) path-based deployment via HTTP for https://ov.qq.com/omni/discovery/healthcheck.
[INFO]  Found the port-based deployment via HTTP for http://ov.qq.com:3333/healthcheck.
... (每 5 秒重复一次三连)
```

---

## 📊 实测数据（2026-05-22 fix/lm worktree, dev server localhost:3000）

| 时间点 | console errors | fetch 次数 | 说明 |
|---|---|---|---|
| 进首页 0s | 16 | - | 首次 SDK 探测 |
| 5s 后 | 31 | - | 第一次 pollForToken 重探 |
| 41s 后 | 64 | 27 | 8 次轮询 × 3 次 fetch / 轮 |
| 关掉 Device Flow Modal 后稳定 | **112** (不再涨) | - | polling 停止 |

**每轮 polling 3 次 fetch**：
- `http://ov.qq.com/omni/discovery/healthcheck` (CORS 拦)
- `https://ov.qq.com/omni/discovery/healthcheck` (426 Upgrade Required)
- `http://ov.qq.com:3333/healthcheck` (port-based fallback)

---

## 🧬 根因链

```
进入页面（未登录态 / 登出后）
  ↓
useAuthGuard 主动校验 → /search_hybrid 401（红错 #1，预期但级别不当）
  ↓
弹出 Device Flow Modal，开始 pollForToken（interval=5s, web/src/nucleus.jsx:325）
  ↓
每 5 秒一次 pollForToken
  ↓
每次都 new DiscoverySearch() → discovery.find()（nucleus.jsx:89）
  ↓
SDK 内部 healthcheck 探测，触发三连：
  1. HTTP   → CORS 拦截        (红错 #2)
  2. ERR_FAILED                (红错 #3)
  3. HTTPS  → 426 Upgrade      (红错 #4)
  4. INFO   → wss 切换成功     (✓ 静默成功，但前三条红错已经写进 console)
  ↓
循环不止（5 秒 × 8 次 = 40 秒就有 24 个红错）
```

### 关键源码位置

| 文件 | 行号 | 现象 |
|---|---|---|
| `web/src/nucleus.jsx:89` | `const discovery = new DiscoverySearch(normalizedUrl);` | 每次调 nucleus 服务都新建实例 |
| `web/src/nucleus.jsx:120,155,188,226,258` | `connectToService(...)` 被 5 个 entry 调用 | startDeviceFlow / pollForToken / createApiToken / refreshAccessToken / authenticateWithCredentials |
| `web/src/nucleus.jsx:325` | `startPolling(serverUrl, deviceCode, interval = 5)` | 默认轮询 5s |
| `web/src/nucleus.jsx:348` | `pollingRef.current = setTimeout(poll, interval * 1000)` | 递归轮询，每次 poll 都重做 connectToService |
| `web/src/index.js:265` | `deviceFlowAuth.startPolling(backend, result.device_code, result.interval)` | 触发点 |

---

## 🎭 错误分类（共 5 类）

| 类别 | 占比 | 真假 | 是否可治 |
|---|---|---|---|
| **A. `discovery/healthcheck` 三连**（CORS + ERR_FAILED + 426） | ~85% | ❌ **完全噪音** | 部分可治（见方案 A） |
| **B. `/search_hybrid 401`** | ~5% | 🟡 预期但级别不当 | 可治：改成 warning 级别或加 suppress |
| **C. `useNucleusTree 401`** | ~5% | 🟡 预期 warning | 已经是 warning，可接受 |
| **D. `net::ERR_FAILED`** | ~5% | ❌ A 的级联 | 跟 A 同源，治 A 即治 D |

### 关于 426 不是 bug

> `426 Upgrade Required` 是后端正确响应「请用 wss 协议升级」，紧跟的 INFO 日志 `Found the (wss:) path-based deployment` 就是 SDK 切到 wss 成功的标志。

但浏览器把 426 自动当 error 打到 console，**前端代码无法抑制**（XMLHttpRequest / fetch 失败由浏览器底层日志触发，不经 user-space 代码）。

---

## 🛠️ 治理方案

| 方案 | 工作量 | 可消除噪音 | 风险 | 推荐度 |
|---|---|---|---|---|
| **A. 缓存 DiscoverySearch 实例**（singleton per serverUrl） | 2-3h | ~80% | 低 | ⭐⭐⭐⭐⭐ |
| **B. 调长 pollForToken 间隔**（5s → 10s 或自适应） | 5min | 50% | 极低 | ⭐⭐⭐ |
| **C. 关掉 Modal 时立刻 abort polling**（已实现？需 review） | 已部分实现 | 间接 | 无 | ⭐⭐⭐⭐ |
| **D. 拦截 SDK 的 CORS / 426 error 日志** | 不可行 | - | - | ❌ |
| **E. SDK 探测改成 wss-only（跳过 HTTP 那步）** | 改 SDK / 不可行 | 100% | - | ❌ |

### 方案 A 详细设计（推荐先做这个）

```javascript
// web/src/nucleus.jsx
const discoveryCache = new Map();

function getDiscovery(serverUrl) {
  const normalized = normalizeServerUrl(serverUrl);
  if (!discoveryCache.has(normalized)) {
    discoveryCache.set(normalized, new DiscoverySearch(normalized));
  }
  return discoveryCache.get(normalized);
}

async function connectToService(serverUrl, clientType, capabilities = {}) {
  const discovery = getDiscovery(serverUrl);  // ← 复用，不再每次 new
  // ... rest 不变
}
```

**预期效果**：
- pollForToken 第一次会触发 healthcheck 三连（无法避免）
- 后续每 5s 一次的 polling **不再触发 healthcheck**（DiscoverySearch 内部缓存了端点）
- console error 数量从 "每 5s +3" 降到 "首次 +3，之后 0"

**风险**：
- 如果 DiscoverySearch 内部对 stale state 不容忍（如服务器切换 / 网络异常），缓存可能持有失效连接
- 缓解：在 `clearAuthByUserAction` / `auth-updated` 事件触发时 `discoveryCache.clear()`

---

## 🔄 登出场景的额外糟糕之处

用户点「清除令牌」→ `clearAuthByUserAction()`：

1. 清掉 username/password → `notifyAuthChanged()` 派发 `auth-updated`
2. `useAuthGuard` 收到 `auth-updated` → 重置内部状态
3. 重新主动校验 → `/search_hybrid 401` 又来一遍
4. 再次自动启动 Device Flow → polling 又开始
5. **跟初始未登录态一样的"三连"噪音 + 5s 一次**

这就是用户反馈"登入登出后控制台一大堆报错"的物理原因。

---

## ❗ 与 P0 修复（fix/lm-tag-wss-auth-expiry）的关系

**这堆噪音 lm 分支早就有了，跟 P0 修复完全无关。**

证据：
- `nucleus.jsx` 的 `connectToService` 实现在 lm 之前就存在
- P0 修复只动了 `taggingService.js` / `useTagManager.js` / `useAuthGuard.js` / `authStorage.js`，没动 `nucleus.jsx`
- P0 修复**不引入新噪音**（ESLint 0 errors / build 通过）

**P0 修复可以先合 lm，噪音治理另立 plan**。

---

## 🚦 优先级建议

| 优先级 | 任务 | 理由 |
|---|---|---|
| **P0** | tag wss auth 修复合 lm（本次） | 影响核心 Tag 功能演示 |
| **P1** | 方案 A：DiscoverySearch 缓存 | 改善开发体验，演示时 console 更干净 |
| **P2** | 方案 B：调长 polling 间隔 + 自适应 | 治标缓解 |
| **P3** | 整体 SDK 升级 / 替换 | 投入大，效益不确定 |

---

## 🔗 相关文档

- 调研报告：`docs/plans/2026-05-21-tag-wss-token-expiry-design.md`
- 速查表：`docs/troubleshooting/console-error-cheatsheet.md`
- MCP 登录处理：`docs/testing-sop/playwright-mcp-login-handling.md`
- 验证截图：`docs/troubleshooting/p0-mcp-verification-final.png`
