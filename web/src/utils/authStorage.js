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
  // SSO 相关 keys
  ssoAccessToken: 'omni_access_token',
  ssoRefreshToken: 'omni_refresh_token',
  nucleusAccessToken: 'nucleus_access_token',
  nucleusAccessTokenExpiry: 'nucleus_access_token_expiry',
  nucleusRefreshToken: 'nucleus_refresh_token',
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
 * @returns {{ username: string, password: string, apiKey: string, nucleusToken: string, ssoToken: string }}
 */
export function getStoredAuth(server) {
  return {
    username: localStorage.getItem(getServerStorageKey(AUTH_STORAGE_KEYS.username, server)) || '',
    password: localStorage.getItem(getServerStorageKey(AUTH_STORAGE_KEYS.password, server)) || '',
    apiKey: localStorage.getItem(getServerStorageKey(AUTH_STORAGE_KEYS.apiKey, server)) || '',
    nucleusToken: localStorage.getItem(getServerStorageKey(AUTH_STORAGE_KEYS.nucleusToken, server)) || '',
    ssoToken: localStorage.getItem(AUTH_STORAGE_KEYS.ssoAccessToken) || '',
  };
}

/**
 * 是否存在任意一种凭证（仅判定有无，不判定是否真的有效）。
 * @param {string} [server]
 * @returns {boolean}
 */
export function hasStoredCredentials(server) {
  const { username, password, apiKey, nucleusToken, ssoToken } = getStoredAuth(server);
  // SSO token 或传统凭证任意存在即视为有凭证
  return !!(ssoToken || apiKey || nucleusToken || (username && username.trim()));
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
  // 同时清除 SSO JWT（可能已过期）
  localStorage.removeItem(AUTH_STORAGE_KEYS.ssoAccessToken);
  // 关键：不写 cleared，否则下次启动会被 isUserCleared 跳过而无法自动登录
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

// ─── SSO 相关方法 ─────────────────────────────────────────────────────────────

/**
 * 读取 SSO Token（omni_access_token）。
 * SSO 登录成功后 Nucleus Auth 页面会将 JWT 写入 localStorage。
 * @returns {string|null}
 */
export function getSSOToken() {
  return localStorage.getItem(AUTH_STORAGE_KEYS.ssoAccessToken) || null;
}

/**
 * SSO 登录成功后持久化所有必要的 token。
 * 同时将永久 API Token 写入传统 key（兼容现有 Tag 功能的 3 层查找链）。
 *
 * @param {string} server 服务器标识（如 'nucleus' 或解析后的 host）
 * @param {string} jwt SSO 获取的 JWT access_token
 * @param {string} apiToken 通过 createApiToken 创建的永久 API Token
 * @param {string} [resolvedHost] 解析后的真实主机名（如 'ov.qq.com'），供 Tag 服务 host-prefixed 查找
 */
export function persistSSOLogin(server, jwt, apiToken, resolvedHost) {
  // 1. 保存原始 SSO JWT
  localStorage.setItem(AUTH_STORAGE_KEYS.ssoAccessToken, jwt);

  // 2. 永久 API Token（与 Device Flow 存储格式完全一致）
  localStorage.setItem(getServerStorageKey(AUTH_STORAGE_KEYS.username, server), '$omni-api-token');
  localStorage.setItem(getServerStorageKey(AUTH_STORAGE_KEYS.password, server), apiToken);

  // 3. access_token 供 Tag WebSocket 使用
  const expiryStr = String(Date.now() + 25 * 60 * 1000);
  localStorage.setItem(getServerStorageKey(AUTH_STORAGE_KEYS.nucleusAccessToken, server), jwt);
  localStorage.setItem(getServerStorageKey(AUTH_STORAGE_KEYS.nucleusAccessTokenExpiry, server), expiryStr);

  // 4. 如果有独立的 host 前缀（如 server='nucleus' 但 host='ov.qq.com'），双写一份
  if (resolvedHost && resolvedHost !== server) {
    localStorage.setItem(getServerStorageKey(AUTH_STORAGE_KEYS.username, resolvedHost), '$omni-api-token');
    localStorage.setItem(getServerStorageKey(AUTH_STORAGE_KEYS.password, resolvedHost), apiToken);
    localStorage.setItem(getServerStorageKey(AUTH_STORAGE_KEYS.nucleusAccessToken, resolvedHost), jwt);
    localStorage.setItem(getServerStorageKey(AUTH_STORAGE_KEYS.nucleusAccessTokenExpiry, resolvedHost), expiryStr);
  }

  // 5. 清除 auth_cleared 标记
  localStorage.removeItem(getServerStorageKey(AUTH_STORAGE_KEYS.cleared, server));
  if (resolvedHost && resolvedHost !== server) {
    localStorage.removeItem(getServerStorageKey(AUTH_STORAGE_KEYS.cleared, resolvedHost));
  }

  notifyAuthChanged();
}

/**
 * 清除所有 SSO 相关 token（登出时使用）。
 * @param {string} [server]
 * @param {string} [resolvedHost]
 */
export function clearSSOLogin(server, resolvedHost) {
  // SSO JWT
  localStorage.removeItem(AUTH_STORAGE_KEYS.ssoAccessToken);
  localStorage.removeItem(AUTH_STORAGE_KEYS.ssoRefreshToken);

  // server-prefixed keys
  removeAllAuthValues(server);
  localStorage.removeItem(getServerStorageKey(AUTH_STORAGE_KEYS.nucleusAccessToken, server));
  localStorage.removeItem(getServerStorageKey(AUTH_STORAGE_KEYS.nucleusAccessTokenExpiry, server));
  localStorage.removeItem(getServerStorageKey(AUTH_STORAGE_KEYS.nucleusRefreshToken, server));

  // host-prefixed keys
  if (resolvedHost && resolvedHost !== server) {
    removeAllAuthValues(resolvedHost);
    localStorage.removeItem(getServerStorageKey(AUTH_STORAGE_KEYS.nucleusAccessToken, resolvedHost));
    localStorage.removeItem(getServerStorageKey(AUTH_STORAGE_KEYS.nucleusAccessTokenExpiry, resolvedHost));
    localStorage.removeItem(getServerStorageKey(AUTH_STORAGE_KEYS.nucleusRefreshToken, resolvedHost));
  }

  // 标记用户主动退出
  localStorage.setItem(getServerStorageKey(AUTH_STORAGE_KEYS.cleared, server), 'true');
  if (resolvedHost && resolvedHost !== server) {
    localStorage.setItem(getServerStorageKey(AUTH_STORAGE_KEYS.cleared, resolvedHost), 'true');
  }

  notifyAuthChanged();
}

export default {
  AUTH_STORAGE_KEYS,
  getServerStorageKey,
  getStoredAuth,
  hasStoredCredentials,
  isUserCleared,
  clearExpiredCredentials,
  clearAuthByUserAction,
  persistNucleusToken,
  getSSOToken,
  persistSSOLogin,
  clearSSOLogin,
};
