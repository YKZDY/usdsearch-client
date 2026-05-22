/**
 * authStorage.js
 *
 * 统一管理 Nucleus / Basic Auth 的 localStorage 读写。
 *
 * 关键语义区分（避免误清/误判）：
 *  - clearExpiredCredentials(server)：token 失效时由 useAuthGuard 调用。仅 removeItem 凭证字段，
 *    不写 auth_cleared 标记，便于后续自动登录流程立即接管。
 *  - clearAuthByUserAction(server)：用户主动点击「清除令牌」时调用。除 removeItem 外，额外
 *    写入 auth_cleared=true，本会话内 useAuthGuard 不会再骚扰（用户语义 = 退出本次登录）。
 *
 * 抽出原因：原 getServerStorageKey 仅定义在 src/index.js 的 HeaderIcons 闭包内，无法跨文件复用。
 *
 * 不依赖 React，纯函数 + DOM 全局事件，可被 Hook / 组件 / 工具任意调用。
 */

// 与现有 useAuthGuard.js / index.js 中硬编码字段保持一致，避免 schema 漂移
export const AUTH_STORAGE_KEYS = Object.freeze({
  username: 'username',
  password: 'password',
  apiKey: 'api_key',
  nucleusToken: 'nucleus_api_token', // 兼容旧版字段
  cleared: 'auth_cleared',
});

const ALL_VALUE_KEYS = [
  AUTH_STORAGE_KEYS.username,
  AUTH_STORAGE_KEYS.password,
  AUTH_STORAGE_KEYS.apiKey,
  AUTH_STORAGE_KEYS.nucleusToken,
];

/**
 * 拼装带 server 前缀的 storage key（与 src/index.js:608-612 行为一致）。
 * @param {string} key 基础 key
 * @param {string} [server] 服务器标识，空串 / undefined 时返回原 key
 * @returns {string}
 */
export function getServerStorageKey(key, server) {
  if (!server) return key;
  return `${server}_${key}`;
}

/**
 * 读取当前 server 下已存的全部凭证字段（不做有效性校验）。
 * @param {string} [server]
 * @returns {{ username: string, password: string, apiKey: string, nucleusToken: string }}
 */
export function getStoredAuth(server) {
  return {
    username: localStorage.getItem(getServerStorageKey(AUTH_STORAGE_KEYS.username, server)) || '',
    password: localStorage.getItem(getServerStorageKey(AUTH_STORAGE_KEYS.password, server)) || '',
    apiKey: localStorage.getItem(getServerStorageKey(AUTH_STORAGE_KEYS.apiKey, server)) || '',
    nucleusToken: localStorage.getItem(getServerStorageKey(AUTH_STORAGE_KEYS.nucleusToken, server)) || '',
  };
}

/**
 * 是否存在任意一种凭证（仅判定有无，不判定是否真的有效）。
 * @param {string} [server]
 * @returns {boolean}
 */
export function hasStoredCredentials(server) {
  const { username, password, apiKey, nucleusToken } = getStoredAuth(server);
  // username 单独有值（即便 password 为空）也视为有；与现有 useAuthGuard.js:50 行为一致
  return !!(apiKey || nucleusToken || (username && username.trim()));
}

/**
 * 用户是否已主动清除（不再自动骚扰的标记）。
 * @param {string} [server]
 */
export function isUserCleared(server) {
  return localStorage.getItem(getServerStorageKey(AUTH_STORAGE_KEYS.cleared, server)) === 'true';
}

/**
 * 内部工具：清除当前 server 的全部凭证值。
 */
function removeAllAuthValues(server) {
  ALL_VALUE_KEYS.forEach((key) => {
    localStorage.removeItem(getServerStorageKey(key, server));
  });
}

/**
 * 派发 auth-updated + storage 事件（让 HeaderIcons / SearchApp 等监听者立即重读 localStorage）。
 * 注意：window.dispatchEvent('storage') 只在「同一标签内手动派发」时使用，跨标签会由浏览器自动派发。
 */
function notifyAuthChanged() {
  window.dispatchEvent(new Event('auth-updated'));
  window.dispatchEvent(new Event('storage'));
}

/**
 * 自动失效场景：仅清值，不写 cleared 标记。
 * 由 useAuthGuard 在 401/403 / 主动校验失败 时调用。
 * @param {string} [server]
 */
export function clearExpiredCredentials(server) {
  removeAllAuthValues(server);
  // 关键：不写 cleared，否则下次启动会被 isUserCleared 跳过而无法自动登录
  notifyAuthChanged();
}

/**
 * [P0 fix/lm-tag-wss-auth-expiry] 仅清除 wss 鉴权三件套（access_token / expiry / refresh_token）。
 *
 * 与 clearExpiredCredentials 的区别：
 *   - clearExpiredCredentials 会清掉 username/password/apiKey/nucleusToken（API Token），
 *     适用于 HTTP 401 场景（API Token 也已失效）
 *   - clearWssCredentialsOnly 仅清 nucleus_access_token / _expiry / _refresh_token，
 *     适用于 wss 鉴权失败但 HTTP API Token 仍有效的场景，避免误降级 HTTP 链路
 *
 * 双前缀清理：与 services/taggingService.js 中 getTaggingTokenWithMeta 的三级查找
 * （host-prefixed → alias-prefixed → bare）严格对齐，确保下次拉 token 走完整 fallback。
 *
 * 注意：lm 分支的 AUTH_STORAGE_KEYS 不包含 nucleus_access_token 等 wss 专用 key
 * （它们在 taggingService 中内联使用），所以这里直接用字符串字面量，保持单一事实来源。
 *
 * 清完派发 auth-updated 事件，让 useAuthGuard / 其他监听方同步状态。
 *
 * @param {string} server         - 主 host（如 'ov.qq.com'）
 * @param {string[]} [aliases]    - 额外清理的前缀（如 ['nucleus', 'omniverse']）
 */
export function clearWssCredentialsOnly(server, aliases = []) {
  const WSS_KEYS = ['nucleus_access_token', 'nucleus_access_token_expiry', 'nucleus_refresh_token'];

  const prefixes = [server, ...(Array.isArray(aliases) ? aliases : [])].filter(
    (p) => typeof p === 'string' && p.length > 0
  );
  // 去重
  const seen = new Set();
  const uniquePrefixes = prefixes.filter((p) => {
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });

  // 1. 各 prefix 下的三件套
  uniquePrefixes.forEach((prefix) => {
    WSS_KEYS.forEach((key) => {
      try {
        localStorage.removeItem(`${prefix}_${key}`);
      } catch (e) {
        // localStorage 可能被禁用或配额满，单条失败不影响其他
        // eslint-disable-next-line no-console
        console.warn('[authStorage] clearWssCredentialsOnly key failed', { prefix, key, error: e?.message });
      }
    });
  });

  // 2. 无前缀兜底（与 getTaggingTokenWithMeta 的 storage-bare 路径对齐）
  WSS_KEYS.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[authStorage] clearWssCredentialsOnly bare failed', { key, error: e?.message });
    }
  });

  // 3. 通知监听方（useAuthGuard 会重置 lastVerifiedAt 但不会立刻弹窗，由调用方决定）
  notifyAuthChanged();
}

/**
 * 用户主动登出：清值 + 写 cleared，本会话内 useAuthGuard 不再自动弹窗。
 * 取代 src/index.js:225-238 / L383-409 中重复的 handleClear / 已认证分支清除按钮逻辑。
 * @param {string} [server]
 */
export function clearAuthByUserAction(server) {
  removeAllAuthValues(server);
  localStorage.setItem(getServerStorageKey(AUTH_STORAGE_KEYS.cleared, server), 'true');
  notifyAuthChanged();
}

/**
 * 写入登录成功后的 Nucleus 长期 token，并清除 cleared 标记。
 * 与 src/index.js:301-307 行为一致，便于 AuthGuardModal 复用。
 * @param {string} server
 * @param {string} apiToken Nucleus createApiToken 返回的 token
 */
export function persistNucleusToken(server, apiToken) {
  localStorage.setItem(getServerStorageKey(AUTH_STORAGE_KEYS.username, server), '$omni-api-token');
  localStorage.setItem(getServerStorageKey(AUTH_STORAGE_KEYS.password, server), apiToken);
  localStorage.removeItem(getServerStorageKey(AUTH_STORAGE_KEYS.cleared, server));
  notifyAuthChanged();
}

export default {
  AUTH_STORAGE_KEYS,
  getServerStorageKey,
  getStoredAuth,
  hasStoredCredentials,
  isUserCleared,
  clearExpiredCredentials,
  clearWssCredentialsOnly,
  clearAuthByUserAction,
  persistNucleusToken,
};
