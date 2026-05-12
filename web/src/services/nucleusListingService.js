/**
 * nucleusListingService.js
 *
 * 通过现有 /search_hybrid 接口反推 Nucleus 目录结构。
 *
 * ─────────────────────────────────────────────────────────────
 * 为什么走 search 反推而不是 listing 直连？
 *   - Batch-1 调查结论：
 *     · 后端无 listing 端点、无 omni-client 引用
 *     · 前端 @omniverse SDK（auth/discovery/idl）不暴露 browse 客户端
 *     · 真实 Omniverse Web Viewer 走 wss IDL，但浏览器 hook 只能抓首屏后建立的连接，
 *       无法在不修改 SDK 的前提下复用其 PathService 协议
 *   - search_hybrid 是已有稳定接口，对指定 search_path 可拉到该路径下的真实文件命中，
 *     按"/" 分段聚合即可得到该路径的直接子目录列表
 *   - 唯一缺点：只能看到"被索引过的目录"。NVIDIA / .system 这种系统目录可能为空，
 *     由 STATIC_PATH_TREE 的根节点占位兜底
 * ─────────────────────────────────────────────────────────────
 *
 * API 契约（与 plan 一致）：
 *   listFolder(server, path, opts?) => Promise<{ name, path, children: TreeNode[] }>
 *
 * TreeNode（与 data/pathTree.js 一致）：
 *   { name, path, count, children: null|TreeNode[], origin: 'live'|'static' }
 *
 * 失败抛 Error，由调用方决定是否降级到静态快照。
 */

import { apiUrl } from '../config';
import { getStoredAuth } from '../utils/authStorage';
import * as cache from '../utils/nucleusTreeCache';

const DEFAULT_LIMIT = 500;        // 单次反推取多少 hits
const DEFAULT_TIMEOUT_MS = 5000;  // listing 请求超时 5s

/**
 * 从 hits[] 中提取 prefix 下的直接子目录列表
 *
 * 规则：
 *   - 仅处理 hit.source.path / base_key / url（与 usePathSuggestions 完全一致）
 *   - 剥协议头 + 折叠 // + 剥文件名（含 . 视为文件）
 *   - 仅当 cleaned 以 prefix 开头时纳入
 *   - 取 prefix 之后的下一段作为子目录名，按"出现次数"排序
 *
 * @param {Array} hits
 * @param {string} prefix 必须以 / 开头，且不带末尾 /（如 '/Library'）
 * @returns {Map<string, number>} childName -> count
 */
function extractDirectChildren(hits, prefix) {
  const counts = new Map();
  // 规范化 prefix：保证以 / 开头、不以 / 结尾（除非就是 '/'）
  let p = prefix || '/';
  if (!p.startsWith('/')) p = '/' + p;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);

  for (const hit of hits || []) {
    const raw = hit?.source?.path || hit?.source?.base_key || hit?.source?.url || '';
    if (!raw) continue;
    // 与 usePathSuggestions 同款的清洗：剥协议、折叠斜杠
    let cleaned = String(raw).replace(/^[a-z]+:\/+/i, '/').replace(/\/+/g, '/');
    if (!cleaned.startsWith('/')) cleaned = '/' + cleaned;
    // 文件名识别：最后一段含 . 即视为文件，剥掉
    const lastSlash = cleaned.lastIndexOf('/');
    const tail = cleaned.slice(lastSlash + 1);
    if (tail.includes('.')) cleaned = cleaned.slice(0, lastSlash);
    if (!cleaned) continue;

    // 必须严格在 prefix 下
    if (p === '/') {
      // 顶层：取第一段
      const segs = cleaned.split('/').filter(Boolean);
      if (segs.length === 0) continue;
      counts.set(segs[0], (counts.get(segs[0]) || 0) + 1);
    } else {
      // 子目录：cleaned 必须以 p + '/' 开头，或正好等于 p（叶子）
      if (cleaned === p) continue; // 自身不算 child
      if (!cleaned.startsWith(p + '/')) continue;
      const rest = cleaned.slice(p.length + 1);
      const child = rest.split('/')[0];
      if (!child) continue;
      counts.set(child, (counts.get(child) || 0) + 1);
    }
  }
  return counts;
}

/**
 * 构造请求 headers（与 HybridDeepSearchUI.getHeaders 一致）
 * @param {string} server selectedBackend 字符串
 */
function buildHeaders(server) {
  const headers = { 'Content-Type': 'application/json' };
  if (server) headers['x-usdsearch-storage-backend'] = server;

  const auth = getStoredAuth(server);
  if (auth.apiKey && auth.apiKey.trim()) {
    headers['x-api-key'] = auth.apiKey;
  } else if (auth.username && auth.username.trim()) {
    headers['Authorization'] = 'Basic ' + btoa(`${auth.username}:${auth.password || ''}`);
  } else if (auth.nucleusToken && auth.nucleusToken.trim()) {
    headers['Authorization'] = 'Basic ' + btoa(`$omni-api-token:${auth.nucleusToken}`);
  }
  return headers;
}

/**
 * 调 /search_hybrid 拉某个 prefix 下的 hits
 * @param {string} server
 * @param {string} prefix 形如 '/Library' 或 '' 表示顶层
 * @param {AbortSignal} [signal]
 */
async function fetchHits(server, prefix, signal) {
  const body = {
    limit: DEFAULT_LIMIT,
    return_images: false,
    return_metadata: true,
    return_vision_generated_metadata: false,
    return_usd_properties: false,
    return_usd_dimensions: false,
    return_tags: false,
  };
  // 仅当 prefix 非空时透传 search_path（与原搜索筛选语义一致）
  if (prefix && prefix !== '/') body.search_path = prefix;

  const res = await fetch(`${apiUrl}/search_hybrid`, {
    method: 'POST',
    headers: buildHeaders(server),
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    throw new Error(`listing fetch failed: HTTP ${res.status}`);
  }
  const data = await res.json();
  if (Array.isArray(data?.hits)) return data.hits;
  if (Array.isArray(data)) return data;
  return [];
}

/**
 * 对外主接口：列出 path 下的直接子目录
 *
 * @param {string} server
 * @param {string} path 形如 '/' 或 '/Library' 或 '/Library/Test'
 * @param {object} [opts]
 * @param {boolean} [opts.skipCache=false] 强制跳过缓存（用于"刷新"按钮）
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{ name: string, path: string, children: TreeNode[] }>}
 */
export async function listFolder(server, path, opts = {}) {
  const { skipCache = false, signal } = opts;

  // 规范化 path
  let p = path || '/';
  if (!p.startsWith('/')) p = '/' + p;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);

  // 1. 缓存命中
  if (!skipCache) {
    const cached = cache.get(server, p);
    if (cached) {
      return { name: pathName(p), path: p, children: cached };
    }
  }

  // 2. 超时控制：与外部 signal 合并
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
  const merged = mergeSignals(signal, ctrl.signal);

  let hits;
  // eslint-disable-next-line no-useless-catch
  try {
    hits = await fetchHits(server, p, merged);
  } finally {
    clearTimeout(timeoutId);
  }

  // 3. 反推子目录
  const counts = extractDirectChildren(hits, p);
  const children = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({
      name,
      path: p === '/' ? `/${name}` : `${p}/${name}`,
      count,
      children: null, // 懒加载占位
      origin: 'live',
      live: true,
    }));

  // 4. 写缓存
  cache.set(server, p, children);

  return { name: pathName(p), path: p, children };
}

/** 取 path 的尾段名 */
function pathName(p) {
  if (!p || p === '/') return '/';
  const segs = p.split('/').filter(Boolean);
  return segs[segs.length - 1] || p;
}

/** 合并多个 AbortSignal 为一个（任一 abort 都会触发） */
function mergeSignals(...signals) {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  for (const s of signals) {
    if (!s) continue;
    if (s.aborted) {
      ctrl.abort();
      break;
    }
    s.addEventListener('abort', onAbort, { once: true });
  }
  return ctrl.signal;
}

export default { listFolder };
