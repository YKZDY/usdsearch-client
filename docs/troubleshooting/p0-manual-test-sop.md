# P0 修复手动测试 SOP — fix/lm-tag-wss-auth-expiry

> **目的**：验证「页面长挂后 token 过期 → 增删 tag 失败 → 弹出统一重登录引导」这条核心修复路径。
> **执行人**：王博扬（或 calvin 协助）
> **预计耗时**：15-20 分钟
> **通过标准**：4 个 P0 用例全部 ✅
>
> 关联文档：`docs/plans/2026-05-21-tag-wss-token-expiry-design.md`
> Commit: `0619bef`

---

## 0. 准备工作

### 0.1 启动环境

```powershell
# 终端 1：确认在 fix/lm 分支的 worktree
cd d:\period\usdsearch-client\.worktrees\fix-lm-tag-wss-auth-expiry
git branch --show-current
# 应输出: fix/lm-tag-wss-auth-expiry

# 终端 2：启动 dev server（如果还没跑）
cd d:\period\usdsearch-client\.worktrees\fix-lm-tag-wss-auth-expiry\web
npm start
# 等待 "Compiled successfully" 并记下实际端口（3000 / 3002 / ...）
```

### 0.2 浏览器准备

1. 用 Chrome / Edge（**不要用 MCP 占用过的 profile**）
2. 打开 `http://localhost:<端口>/?server=nucleus`
3. **F12 打开 DevTools**，切到 Console 标签，**勾选 "Preserve log"**（关键：不勾的话刷新会清掉日志，看不到关键证据）
4. 正常通过 Device Flow Modal 完成一次 Nucleus 登录（让 localStorage 里有真实的 access_token / refresh_token）
5. 搜一个有结果的关键词（如 `building` / `tree` / `car`），确保至少能看到 ≥ 1 张资产卡片

> ⚠️ 如果 dev server 起不来或始终弹 Device Flow Modal 拿不到资产，先去 fix 这个环境问题，再回来跑 SOP。

---

## 1. ✅ TC-1：基线 — 正常态下 tag 增删工作

**目的**：确认未注入故障时基本功能 OK，避免后续测试假阳性。

**步骤**：
1. 找到一张资产卡片，进入详情或在卡片上找到 tag 输入框
2. 输入一个测试 tag（如 `_p0test_001`），按回车
3. 等待 2-3 秒

**预期**：
- ✅ tag chip 显示绿色（成功），不变红
- ✅ Console **没有** `[TagManager] preflight: tagging token expired` 警告
- ✅ Console 出现 `[TaggingService] dialing` 日志，且**对象里有 `jwtExp` 和 `jwtTtlSeconds` 字段**（这是 T0 改动的关键证据）
  - 例：`{host: "...", method: "modify_tags", jwtExp: 1779384567, jwtTtlSeconds: 1380, ...}`
- ✅ `jwtTtlSeconds` 为正数（token 还有效）

**失败处理**：
- 如果 tag 显示红色 → token 已经有问题，跳到 TC-2 看修复是否正确兜底
- 如果 dialing 日志没有 `jwtExp` 字段 → 代码可能没正确编译进 bundle，跳到底部「故障排查 A」

---

## 2. ✅ TC-2：核心 — 模拟 token 过期 + 增 tag 触发重登录引导

**目的**：这是修复的核心场景，必须通过。

**步骤**：
1. 在 Console 里**逐行**执行以下脚本（先看清楚再回车）：

```javascript
// 步骤 1：备份当前可用的 token，以便测后还原
const backup = {};
Object.keys(localStorage).forEach(k => {
  if (k.includes('nucleus')) backup[k] = localStorage.getItem(k);
});
console.log('[SOP] backup saved, keys:', Object.keys(backup));

// 步骤 2：把所有 expiry 改成 1 小时前 + 删除 refresh_token
const expiredTs = String(Date.now() - 3600 * 1000);
Object.keys(localStorage).forEach(k => {
  if (k.includes('nucleus_access_token_expiry')) {
    localStorage.setItem(k, expiredTs);
    console.log('[SOP] expired:', k);
  }
  if (k.includes('nucleus_refresh_token')) {
    localStorage.removeItem(k);
    console.log('[SOP] removed:', k);
  }
});

// 步骤 3：安装重登录事件监听器，用于稍后验证
window.__sopReauthEvents = [];
window.addEventListener('auth-guard-open', (e) => {
  window.__sopReauthEvents.push({
    reason: e?.detail?.reason,
    serverUrl: e?.detail?.serverUrl,
    at: new Date().toISOString(),
  });
  console.log('[SOP] auth-guard-open fired:', e.detail);
});
console.log('[SOP] listener installed, ready to test');
```

2. **不要刷新页面**！直接在页面上对任意一张资产卡片**尝试增一个新 tag**（如 `_p0test_expired`），按回车

**预期**（按时间顺序）：
- ✅ Console 出现 `[TagManager] preflight: tagging token expired, short-circuit + request reauth`，对象里含 `source / jwtExp / hostUsed`
- ✅ Console 出现 `[AuthReauthBus] reauth requested` 或类似 dispatch 日志
- ✅ Console 出现 `[SOP] auth-guard-open fired: {reason: 'wss-token-expired', serverUrl: 'ov.qq.com'}`
- ✅ **弹出「通过 Nucleus 认证」Modal**（Device Flow code 形如 `XXXXXXXX`）
- ✅ tag chip 变红（status='failed'），可以看到错误诊断卡（含 kind='auth' / stage='preflight'）
- ✅ **整个流程在 1-2 秒内完成**（如果等到 10 秒后才出错 → preflight short-circuit 没生效，是 bug）

**失败处理**：
- ❌ 如果没弹 Modal、Console 也没 `auth-guard-open fired` → `requestReauth` 调用链断了，跳到「故障排查 B」
- ❌ 如果等了 10+ 秒才出错 → short-circuit 没生效，跳到「故障排查 C」
- ❌ 如果弹了 Modal 但 reason 不是 `wss-token-expired` → 走错了分支，但功能上仍可用，记下实际 reason 反馈给我

---

## 3. ✅ TC-3：幂等性 — 连续点 5 次只弹 1 个 Modal

**目的**：验证 `useAuthGuard.hasShownRef` 幂等机制 + 我的 dispatch 不会刷屏。

**步骤**：
1. **接 TC-2 的状态**（localStorage 仍然 expired，Modal 已经弹出来）
2. **不要关 Modal**，把 Modal 拖到旁边或暂时不管
3. 在同一张或多张资产卡片上**连续快速增 5 个 tag**（如 `_p0test_a`、`_p0test_b`、... `_p0test_e`）
4. 完成后在 Console 跑：

```javascript
console.log('[SOP] reauth events count:', window.__sopReauthEvents.length);
console.log('[SOP] events:', window.__sopReauthEvents);
console.log('[SOP] modal still open?', !!document.querySelector('[role="dialog"]'));
```

**预期**：
- ✅ `reauth events count` ≥ 5（每次都派发了，证明监听通畅）
- ✅ **页面上只有 1 个 Modal**（不是 5 个叠加 / 不是刷屏）
- ✅ 没有 React 报错、没有 unhandled promise rejection

**失败处理**：
- ❌ 出现多个 Modal 叠加 → `hasShownRef` 失效，可能跟 `auth-updated` 事件触发 reset 有关，记下复现路径
- ❌ Console 满屏红错 → 立刻截图反馈

---

## 4. ✅ TC-4：HTTP 链路不受影响（A 没被误清）

**目的**：验证 `clearWssCredentialsOnly` **没误删 API Token**，HTTP 链路（如搜索 / 目录树）仍能工作。

**步骤**：
1. **接 TC-2 / TC-3 的状态**（localStorage 已经 expired，没有 refresh_token）
2. **关掉 Device Flow Modal**（点取消，不要真的去登录）
3. 在 Console 验证 API Token 还在：

```javascript
const apiTokenKeys = Object.keys(localStorage).filter(k => 
  /username|password|api[_-]?key|nucleus_token$/i.test(k) && !k.includes('access_token')
);
console.log('[SOP] API Token keys still in localStorage:', apiTokenKeys);
apiTokenKeys.forEach(k => console.log('  -', k, '=', localStorage.getItem(k)?.slice(0, 10) + '...'));
```

4. **重新做一次搜索**（如改搜 `chair`）

**预期**：
- ✅ `apiTokenKeys` **不为空**（API Token 仍在 localStorage 中）
- ✅ 搜索能返回结果（或仍然 401 弹 Modal，**但不是因为 API Token 被我误清了**）
- ✅ 用户名 / 密码字段（如果当时是用 Basic Auth 登录的）仍在 localStorage

**失败处理**：
- ❌ 如果 API Token 不见了 → `clearWssCredentialsOnly` 误清了 key，跳到「故障排查 D」

---

## 5. 收尾：还原环境

**重要**：测完一定要还原，否则下次开页面又会被自己挖的坑绊倒。

**步骤**：在 Console 跑：

```javascript
// 还原备份的 token
if (window.backup || typeof backup !== 'undefined') {
  const b = window.backup || backup;
  Object.entries(b).forEach(([k, v]) => localStorage.setItem(k, v));
  console.log('[SOP] restored', Object.keys(b).length, 'keys');
} else {
  console.warn('[SOP] no backup found, just clear all nucleus keys instead');
  Object.keys(localStorage).filter(k => k.includes('nucleus')).forEach(k => localStorage.removeItem(k));
}

// 清理测试遗留
delete window.__sopReauthEvents;

// 刷新页面回到干净态
location.reload();
```

如果备份没保留（比如关过 DevTools），就：
1. `localStorage.clear()`
2. 刷新页面
3. 重新走 Device Flow 登录

---

## 6. 验收结果记录

复制下面这个表，填好发给我：

| 用例 | 通过？ | 备注 |
|---|---|---|
| TC-1 基线 tag 正常 | ⬜ | dialing 日志含 jwtExp? |
| TC-2 过期 → 弹 Modal | ⬜ | reason 是不是 wss-token-expired? Modal 是不是 1-2s 内弹? |
| TC-3 连点 5 次只 1 个 Modal | ⬜ | events count? Modal 数量? |
| TC-4 HTTP 链路 / API Token 仍在 | ⬜ | api token keys? 搜索能否工作? |

**4 个全 ✅ → 直接 push 到远端、合回 lm。**
**任一项 ❌ → 截图 + Console 全文反馈给我，先修再合。**

---

## 7. 故障排查

### A. dialing 日志没 jwtExp 字段
- 检查：`http://localhost:<端口>/static/js/bundle.js` 搜 "jwtTtlSeconds" 应有匹配
- 可能原因：dev server 跑在了主工作区 / 缓存没清，重启 dev server

### B. requestReauth 没派发
- 在 Console 检查：`typeof window.dispatchEvent` 应是 function
- 在 Console 手动跑：`window.dispatchEvent(new CustomEvent('auth-guard-open', { detail: { reason: 'wss-test' } }))` 看 useAuthGuard 是否响应（如果响应说明 useAuthGuard 接收正常，问题在 useTagManager 没调用 requestReauth）
- 检查 useTagManager.js L486 那行 `requestReauth('wss-token-expired', ...)` 是否真的执行了

### C. 等了 10s 才出错（short-circuit 没生效）
- 检查：`meta.isExpired` 是否被正确判定。在 Console 跑：
  ```javascript
  // 直接调用 getTaggingTokenWithMeta，看返回值
  // 需要先找到 host，假设是 ov.qq.com
  const { getTaggingTokenWithMeta } = await import('/static/js/bundle.js'); // 不一定能 import，看 webpack 暴露
  ```
- 更简单的：检查 useTagManager.js L474 if (meta.isExpired) 这个分支是否进入（加个 debugger 或多打几条 console.log）

### D. API Token 被误清
- 检查 authStorage.js 中 clearWssCredentialsOnly 的 WSS_KEYS 数组：应该只含 ['nucleus_access_token', 'nucleus_access_token_expiry', 'nucleus_refresh_token']
- **绝对不能**有 username / password / api_key 等

---

## 8. 跑完后做什么

### 全 ✅
```powershell
cd d:\period\usdsearch-client\.worktrees\fix-lm-tag-wss-auth-expiry
git push -u origin fix/lm-tag-wss-auth-expiry
# 然后开 MR / 直接合 lm
```

### 有 ❌
保留现场，截图 Console + 网络面板，附上失败的 TC 编号，发给 AI 协助。**不要急着合 lm**。
