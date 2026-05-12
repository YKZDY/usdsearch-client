/**
 * nucleusTreeCache.js
 *
 * Nucleus 目录树的本地缓存层（内存 Map + sessionStorage 二级缓存）
 *
 * 设计目标：
 * - 避免在同一会话内对相同 (server, path) 重复调 listing 服务
 * - 切换服务器/登录态时按 server 失效，避免跨用户串数据
 * - sessionStorage 仅保留少量元信息（key + 时间戳），不持久化大对象
 * - TTL 默认 5 分钟，超时即视为过期；用户主动 refresh 时强制忽略缓存
 *
 * Key 格式：`${server}:${path}` —— server 取自 selectedBackend / authStorage 的 server 字段
 *
 * 不依赖 React，纯函数 + 模块单例 Map，可被 hook / service / 组件任意调用。
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 min
const SESSION_PREFIX = 'nucleus_tree_cache:'; // sessionStorage key 前缀
const VERSION = 1; // 缓存格式版本，schema 变化时手动 +1 触发 invalidate

// 内存层（一级缓存）
// Map<key, { value, expiresAt, server }>
const memCache = new Map();

/** 拼装 cache key */
function makeKey(server, path) {
  // server 为空时也允许（默认服务器场景），用 '_' 占位
  const s = server || '_';
  // path 末尾不带斜杠（避免 /Library/ 与 /Library 视为不同 key）
  let p = path || '/';
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return `${s}:${p}`;
}

/**
 * 读缓存：返回 value 或 null
 * @param {string} server
 * @param {string} path
 * @returns {Array<TreeNode>|null}
 */
export function get(server, path) {
  const key = makeKey(server, path);
  const entry = memCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memCache.delete(key);
    return null;
  }
  return entry.value;
}

/**
 * 写缓存
 * @param {string} server
 * @param {string} path
 * @param {Array<TreeNode>} value
 * @param {number} [ttl=DEFAULT_TTL_MS]
 */
export function set(server, path, value, ttl = DEFAULT_TTL_MS) {
  const key = makeKey(server, path);
  memCache.set(key, {
    value,
    expiresAt: Date.now() + ttl,
    server: server || '_',
  });
  // sessionStorage 只记录元信息，不写大对象（避免 5MB 配额）
  try {
    sessionStorage.setItem(
      `${SESSION_PREFIX}${key}`,
      JSON.stringify({ v: VERSION, t: Date.now(), n: Array.isArray(value) ? value.length : 0 })
    );
  } catch (e) {
    // 配额超限静默忽略
  }
}

/**
 * 失效某个 server 下的所有缓存
 * @param {string} server
 */
export function invalidate(server) {
  const target = server || '_';
  for (const [key, entry] of memCache) {
    if (entry.server === target) memCache.delete(key);
  }
  try {
    const prefix = `${SESSION_PREFIX}${target}:`;
    const toRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(prefix)) toRemove.push(k);
    }
    toRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch (e) {}
}

/** 失效所有 server 的缓存 */
export function invalidateAll() {
  memCache.clear();
  try {
    const toRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(SESSION_PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch (e) {}
}

/**
 * 强制刷新某个 (server, path)：先删缓存，由调用方重新 fetch
 * @param {string} server
 * @param {string} path
 */
export function forceRefresh(server, path) {
  const key = makeKey(server, path);
  memCache.delete(key);
  try {
    sessionStorage.removeItem(`${SESSION_PREFIX}${key}`);
  } catch (e) {}
}

/**
 * 监听 auth-updated 事件 —— 切换服务器/登录态时清空全部缓存
 * 保守策略：不区分哪个 server，全清；下一次拉取自然会重建。
 *
 * 通过模块加载时一次性绑定（避免内存泄漏：handler 是固定引用）。
 */
function onAuthChanged() {
  invalidateAll();
}
if (typeof window !== 'undefined') {
  window.addEventListener('auth-updated', onAuthChanged);
  // storage 事件由 authStorage.notifyAuthChanged 同时派发；保险起见也监听一份
  window.addEventListener('storage', (e) => {
    if (!e.key) return;
    if (e.key.includes('api_key') || e.key.includes('nucleus_api_token') || e.key.includes('username')) {
      invalidateAll();
    }
  });
}

export default {
  get,
  set,
  invalidate,
  invalidateAll,
  forceRefresh,
};
