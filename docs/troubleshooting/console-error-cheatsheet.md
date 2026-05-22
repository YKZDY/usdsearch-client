# Console 报错速查表（Lightart Web）

> 适用：lm 分支及其衍生（含 fix/lm-tag-wss-auth-expiry P0 修复）  
> 维护人：王博扬  
> 目的：让 calvin / QA / 一线运维在 console 看到报错时，3 分钟内自助定位"是哪类问题"

## 快速决策树

```
看到红字？
├── 包含 "discovery/healthcheck" 或 "426" → ✅ 不是 bug，SDK 正常协议升级（见 §1）
├── 包含 "/search_hybrid" 或 "/info/plugins" + 401 → 🔴 HTTP 凭据失效（见 §2）
├── 包含 "[useNucleusTree]" + 401 → 🔴 同上（HTTP 链路）
├── 包含 "[TaggingService]" → 🔴 wss 链路问题（见 §3）
│   ├── "dialing" + jwtTtlSeconds 是负数 → token 已过期，等 Modal 弹出
│   ├── "wss closed abnormally" + kind="auth" → 鉴权失败，会自动触发 Device Flow
│   ├── "wss closed abnormally" + kind="network" → 检查 Nucleus host 可达性
│   └── "token refresh 失败" → refresh_token 已过期，Modal 会自动弹出
├── 包含 "[AuthGuard]" 或 "[AuthReauthBus]" → 🟡 登录引导路径（见 §4）
└── 其它 → 截图给王博扬
```

---

## §1. discovery 426 Upgrade Required（**非 bug**）

**示例日志**：
```
ov.qq.com/omni/discovery/healthcheck:1  Failed to load resource: the server responded with a status of 426 (Upgrade Required)
index.js:249 Found the (wss:) path-based deployment via HTTP for https://ov.qq.com/omni/discovery/healthcheck.
```

**性质**：@omniverse SDK 用 HTTP GET 探测 wss 端点的正常协议升级握手，紧跟 "Found the (wss:) path-based deployment" 表示成功识别。

**何时出现**：每次需要发起 wss 调用前都会出现（dialing 之前）。

**处理**：忽略。如果太刺眼，可以在 DevTools 控制台过滤器里加 `-/discovery/healthcheck` 黑名单。

---

## §2. HTTP 401 - 凭据失效

**典型日志**：
```
/search_hybrid:1  Failed to load resource: the server responded with a status of 401 ()
installHook.js:1 [useNucleusTree] root listing failed: listing fetch failed: HTTP 401
[AuthGuard] http 401/403 intercepted, auto-clearing
```

**性质**：HTTP 端 Basic Auth / SSO Bearer / API Token 已失效，`useAuthGuard` 全局 fetch 拦截器接管：
1. 清掉过期凭据（`clearExpiredCredentials`，**会清掉 API Token**）
2. 派发 `auth-guard-open` reason='http-401'
3. AuthForm 错位 50ms 后自动启动 Device Flow

**用户应见**：右上角 Popover 弹出 + Device Flow 登录对话框（含 user_code）。

**自助排查**：
- 如果没弹 Modal：检查是不是 `isUserCleared` 标记打开了（用户主动登出过）；DevTools → Application → Local Storage 找 `*_auth_cleared` key
- 如果 Modal 弹了但登不上：可能是 OAuth 服务端问题，截全部 console + Network 反馈

---

## §3. wss 链路问题（Tagging Service）

### 3.1 `[TaggingService] dialing` 日志含义（P0 T0 增强）

修复后的 dialing 日志格式：
```js
[TaggingService] dialing {
  host: 'ov.qq.com',
  method: 'modify_tags',        // get_tags / modify_tags / tag_query
  tokenSource: 'storage-prefixed', // memory / storage-prefixed / storage-alias / storage-bare / refreshed / headers
  tokenLen: 1024,
  tokenHead4: 'eyJh',           // JWT 都以 eyJ 开头；其它前缀说明拿到的是 API Token
  jwtExp: 1748000000,           // null 表示非 JWT（API Token 不带 exp）
  jwtTtlSeconds: 600            // 剩余秒数；负数=已过期
}
```

**速查**：
- `tokenHead4` 不是 `eyJh` → 拿到的是 API Token（Basic Auth），wss 100% 会被拒。来源大概率是 `tokenSource: 'headers'`（fallback）。**修复建议**：等 Modal 自动弹出重新走 Device Flow。
- `jwtTtlSeconds` 是负数 → token 已过期但 refresh 没救活。P0 修复后会自动 short-circuit 并弹 Modal。
- `tokenSource: 'refreshed'` → 刚刷新成功，token 应该有效。如果此时还失败，怀疑后端时钟问题。

### 3.2 `[TaggingService] wss closed abnormally`（P0 T0 增强）

```js
[TaggingService] wss closed abnormally {
  host, method, tokenSource, closeCode, reason,
  kind: 'auth' | 'network',
  stage: 'onclose',
  hint: '...'  // 修复建议文案
}
```

**closeCode 速查**：
| code | 含义 | kind | 处理 |
|---|---|---|---|
| 1000 | Normal Closure | unknown | 请求未收到响应，重试一次 |
| 1005 | No Status | unknown | 同上 |
| 1006 | Abnormal | network | 通常是网络/TLS/DNS，浏览器不暴露真实 status code |
| 1008 | Policy Violation | **auth** | 服务端拒绝（多为 token 失效），P0 修复后自动弹 Modal |
| 1011 | Internal Error | network | 服务端异常 |
| 1015 | TLS failure | network | TLS 证书/握手问题 |

> ⚠️ 浏览器对 wss 握手失败统一返回 1006，**无法 100% 区分 auth 与 network**。如果 kind=network 但反复出现，考虑 `tokenSource='headers'` + `tokenHead4 != 'eyJh'`，大概率仍是 auth 问题伪装成 network。

### 3.3 `[TaggingService] token refresh 失败`

```
[TaggingService] token refresh 失败，fallback 到 API Token: <error message>
[AuthReauthBus] request reauth { reason: 'wss-refresh-failed', serverUrl: 'ov.qq.com' }
```

**性质**：refresh_token 已过期（典型在挂机 4+ 小时后）。

**P0 修复后的连锁反应**：
1. `clearWssCredentialsOnly` 清掉 wss 三件套（**不动 API Token**）
2. `requestReauth('wss-refresh-failed')` → useAuthGuard 接管 → Device Flow Modal 弹出

**用户应见**：Modal 弹出引导重登录。HTTP 资产列表仍可用（API Token 未被清）。

---

## §4. AuthGuard / AuthReauthBus 日志

### 4.1 `[AuthGuard] verify expired`
主动校验失败（启动后 1.5s 内 + visibility 切换时 + 30s throttle）。后续会自动派发 'auth-guard-open' reason='expired'。

### 4.2 `[AuthReauthBus] request reauth { reason: 'wss-*' }`（P0 新增）
wss 路径主动请求重登录。reason 枚举：
- `wss-auth-fail` — addTag/removeTag catch 块的 auth 类错误
- `wss-token-expired` — syncToServer preflight 检测过期
- `wss-refresh-failed` — refreshAccessToken 抛错

**注意**：useAuthGuard 内部有 `hasShownRef` 幂等，连续触发 N 次仅弹一次 Modal。

---

## §5. 自助排查 5 步法

1. **F12 打开 DevTools**，Console + Network 双开
2. 找到第一个**带 `[TaggingService]` 或 `[useNucleusTree]` 或 `[AuthGuard]`** 前缀的红色/黄色日志
3. 看 `tokenSource` 字段：
   - `headers` → 拿到的是 API Token，wss 必败，等 Modal
   - `refreshed` → 刚刷新过，理论应有效，截图反馈
   - 其它 → 看 `jwtTtlSeconds`，负数=过期
4. 看 closeCode：1008 = 服务端拒绝鉴权；1006 = 网络/握手
5. **截图整段日志 + DevTools → Application → Local Storage 中所有以 `nucleus_` 开头的 key**，反馈给王博扬

---

## §6. 已知噪音清单（无需处理）

| 日志 | 来源 | 原因 |
|---|---|---|
| `discovery/healthcheck 426` | @omniverse SDK | 协议升级握手，正常 |
| `Found the (wss:) path-based deployment via HTTP` | @omniverse SDK | 上一条的后续，正常 |
| `Persistent image cache initialized` | index.js | 缩略图缓存初始化 |
| `[Intervention] Images loaded lazily` | Edge 浏览器 | 懒加载提示 |
| `LanguageDetector feature` | Edge content_main.js | 浏览器内置功能提示 |

如发现新的稳定出现且无害的日志，补充到本表。
