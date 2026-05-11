/**
 * ReindexService - 集中管理资产 reindex 触发与状态轮询
 *
 * 修复"打了 tag 但搜不到"的核心 bug 中的链路 B：写 tag 自动 reindex 闭环。
 *
 * 核心 API：
 *   - scheduleReindex(apiUrl, assetUrl, getHeaders, options)    防抖+去重的静默触发
 *   - triggerReindexNow(apiUrl, assetUrl, getHeaders, options)  立即触发（带 15s 超时 + 1 次 retry）
 *   - pollIndexingStatus(apiUrl, assetUrl, getHeaders, options) 轮询 plugin 完成状态
 *   - flushPending(assetUrl?)                                    立即 flush 所有挂起的 debounce 队列
 *   - getStats() / window.__tagReindexStats                      DevTools 可观测内存统计
 *
 * 关键设计：
 *   - 3500ms debounce 错开现有 3s 撤销窗口（P2）
 *   - 同 assetUrl 并发去重（Map 持有 controller/timer）
 *   - 网络层 AbortController 15s 超时 + 1 次自动 retry（P7）
 *   - 完成回调按 queryHint 让上层判断是否触发 trigger-search（P8）
 *   - flushPending 供搜索框 onSubmit 即时触发（P11）
 *   - 内存 stats 挂 window.__tagReindexStats（P12）
 */

const LOG_PREFIX = "[TagReindex]";

const DEFAULT_DEBOUNCE_MS = 3500;       // P2: 3s undo + 500ms safety
const DEFAULT_FETCH_TIMEOUT_MS = 15000; // P7
const DEFAULT_RETRIES = 1;              // P7
const RETRY_BACKOFF_MS = 2000;          // P7
const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 20;           // 30s 上限

/**
 * pending 条目：每个 assetUrl 一份。
 * @typedef {Object} PendingEntry
 * @property {ReturnType<typeof setTimeout>|null} debounceTimer
 * @property {AbortController|null} controller
 * @property {number|null} startedAt        实际触发 reindex 时间戳
 * @property {string|null} queryHint        最近写入/删除的 tag 文本，传给完成回调
 * @property {Function|null} onComplete
 * @property {Function|null} onTimeout
 * @property {Object|null} lastOptions      最后一次 schedule 时的 options（flush 时复用）
 * @property {Function|null} lastGetHeaders flush 时复用的 getHeaders
 * @property {string|null} apiUrl
 */

/** @type {Map<string, PendingEntry>} */
const pendingMap = new Map();

// P12: 可观测性 stats
const stats = {
  total: 0,
  success: 0,
  timeout: 0,
  failed: 0,
  totalDurationMs: 0,
  get avgDurationMs() {
    return this.success > 0 ? Math.round(this.totalDurationMs / this.success) : 0;
  },
};

if (typeof window !== "undefined") {
  // 只读快照（DevTools 友好）
  Object.defineProperty(window, "__tagReindexStats", {
    configurable: true,
    get() {
      return {
        total: stats.total,
        success: stats.success,
        timeout: stats.timeout,
        failed: stats.failed,
        avgDurationMs: stats.avgDurationMs,
        pending: pendingMap.size,
      };
    },
  });
}

function getOrCreateEntry(assetUrl) {
  let entry = pendingMap.get(assetUrl);
  if (!entry) {
    entry = {
      debounceTimer: null,
      controller: null,
      startedAt: null,
      queryHint: null,
      onComplete: null,
      onTimeout: null,
      lastOptions: null,
      lastGetHeaders: null,
      apiUrl: null,
    };
    pendingMap.set(assetUrl, entry);
  }
  return entry;
}

function cleanupEntry(assetUrl) {
  const entry = pendingMap.get(assetUrl);
  if (!entry) return;
  if (entry.debounceTimer) {
    clearTimeout(entry.debounceTimer);
    entry.debounceTimer = null;
  }
  if (entry.controller) {
    try { entry.controller.abort(); } catch (_) { /* noop */ }
    entry.controller = null;
  }
  pendingMap.delete(assetUrl);
}

/**
 * 带超时与 retry 的 fetch（P7）。
 * 注意：成功的判定是 response.ok；网络错误/超时才走 retry，HTTP 4xx/5xx 不 retry。
 */
async function fetchWithTimeoutAndRetry(url, init, { timeoutMs, retries }) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    // 复合外部 signal 与超时 signal
    const externalSignal = init.signal;
    if (externalSignal) {
      if (externalSignal.aborted) throw new DOMException("Aborted", "AbortError");
      externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      return resp;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      // 用户主动 abort 不 retry
      if (externalSignal?.aborted) throw err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/**
 * 核心：执行 /process/asset 调用 + 可选轮询。
 * 不抛错；返回 { success, timedOut, status }。
 */
async function executeReindex(apiUrl, assetUrl, getHeaders, options = {}) {
  const {
    silent = true,
    poll = true,
    timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    signal,
    onComplete,
    onTimeout,
    queryHint,
  } = options;

  stats.total += 1;
  const startedAt = Date.now();

  const params = new URLSearchParams();
  params.append("url", assetUrl);
  // 防御性补齐：即使后端默认值已是 true，显式传也不亏
  params.append("refresh_tags", "true");
  params.append("refresh_metadata", "true");
  params.append("refresh_plugins", "true");

  let success = false;
  let timedOut = false;
  let status = 0;

  try {
    const headers = getHeaders ? getHeaders() : {};
    const resp = await fetchWithTimeoutAndRetry(
      `${apiUrl}/process/asset?${params.toString()}`,
      { method: "GET", headers, signal },
      { timeoutMs, retries }
    );
    status = resp.status;

    if (resp.status === 401) {
      stats.failed += 1;
      if (!silent) console.warn(`${LOG_PREFIX} unauthorized`, { assetUrl });
      else console.debug(`${LOG_PREFIX} unauthorized`, { assetUrl });
      return { success: false, timedOut: false, status: 401 };
    }

    if (!resp.ok) {
      stats.failed += 1;
      console.warn(`${LOG_PREFIX} failed`, { assetUrl, status: resp.status });
      return { success: false, timedOut: false, status: resp.status };
    }

    if (!poll) {
      success = true;
      stats.success += 1;
      stats.totalDurationMs += Date.now() - startedAt;
      if (silent) console.debug(`${LOG_PREFIX} triggered (no poll)`, { assetUrl });
      return { success: true, timedOut: false, status };
    }

    // 轮询完成
    const pollResult = await pollIndexingStatus(apiUrl, assetUrl, getHeaders, {
      intervalMs: POLL_INTERVAL_MS,
      maxAttempts: POLL_MAX_ATTEMPTS,
      startedAt,
      signal,
    });
    timedOut = pollResult.timedOut;
    success = pollResult.finished;
    if (success) {
      stats.success += 1;
      stats.totalDurationMs += Date.now() - startedAt;
    } else if (timedOut) {
      stats.timeout += 1;
      console.warn(`${LOG_PREFIX} poll timeout`, { assetUrl });
    }
    return { success, timedOut, status };
  } catch (err) {
    if (err?.name === "AbortError") {
      console.debug(`${LOG_PREFIX} aborted`, { assetUrl });
      return { success: false, timedOut: false, status: 0 };
    }
    stats.failed += 1;
    console.warn(`${LOG_PREFIX} failed`, { assetUrl, error: err?.message || err });
    return { success: false, timedOut: false, status: 0 };
  } finally {
    try {
      if (success && onComplete) onComplete({ queryHint });
      else if (timedOut && onTimeout) onTimeout({ queryHint });
    } catch (cbErr) {
      console.warn(`${LOG_PREFIX} callback error`, cbErr);
    }
  }
}

/**
 * 防抖+并发去重的静默触发。
 * 同一 assetUrl 在 delayMs 内多次调用只会真正触发 1 次 reindex。
 *
 * @param {string} apiUrl
 * @param {string} assetUrl 完整 omniverse:// URL
 * @param {() => Record<string,string>} getHeaders
 * @param {{
 *   delayMs?: number,
 *   poll?: boolean,
 *   silent?: boolean,
 *   queryHint?: string,
 *   onComplete?: ({ queryHint }) => void,
 *   onTimeout?: ({ queryHint }) => void,
 * }} [options]
 */
export function scheduleReindex(apiUrl, assetUrl, getHeaders, options = {}) {
  if (!apiUrl || !assetUrl) {
    console.debug(`${LOG_PREFIX} scheduleReindex skipped (missing apiUrl/assetUrl)`);
    return;
  }
  const {
    delayMs = DEFAULT_DEBOUNCE_MS,
    poll = true,
    silent = true,
    queryHint = null,
    onComplete = null,
    onTimeout = null,
  } = options;

  const entry = getOrCreateEntry(assetUrl);

  // 取消旧的 debounce timer
  if (entry.debounceTimer) {
    clearTimeout(entry.debounceTimer);
    entry.debounceTimer = null;
  }

  // 记录最后一次 options（供 flushPending 复用）
  entry.apiUrl = apiUrl;
  entry.lastGetHeaders = getHeaders;
  entry.queryHint = queryHint;
  entry.onComplete = onComplete;
  entry.onTimeout = onTimeout;
  entry.lastOptions = { poll, silent };

  entry.debounceTimer = setTimeout(() => {
    fireEntry(assetUrl);
  }, delayMs);

  console.debug(`${LOG_PREFIX} scheduled (debounce ${delayMs}ms)`, { assetUrl, queryHint });
}

/**
 * 立即触发某 assetUrl 当前挂起的 reindex（取消 debounce 直接执行）。
 * 不传 assetUrl 则 flush 全部。供搜索框 onSubmit 调用（P11）。
 */
export function flushPending(assetUrl) {
  if (assetUrl) {
    const entry = pendingMap.get(assetUrl);
    if (entry?.debounceTimer) fireEntry(assetUrl);
    return;
  }
  // flush 全部
  for (const [url, entry] of pendingMap.entries()) {
    if (entry.debounceTimer) fireEntry(url);
  }
}

function fireEntry(assetUrl) {
  const entry = pendingMap.get(assetUrl);
  if (!entry) return;
  if (entry.debounceTimer) {
    clearTimeout(entry.debounceTimer);
    entry.debounceTimer = null;
  }
  // 已经 in-flight 则跳过（去重）
  if (entry.controller) {
    console.debug(`${LOG_PREFIX} dedupe (in-flight)`, { assetUrl });
    return;
  }
  const controller = new AbortController();
  entry.controller = controller;
  entry.startedAt = Date.now();
  const apiUrl = entry.apiUrl;
  const getHeaders = entry.lastGetHeaders;
  const opts = entry.lastOptions || {};
  const queryHint = entry.queryHint;
  const onComplete = entry.onComplete;
  const onTimeout = entry.onTimeout;

  executeReindex(apiUrl, assetUrl, getHeaders, {
    ...opts,
    queryHint,
    onComplete,
    onTimeout,
    signal: controller.signal,
  }).finally(() => {
    // 清理 entry（无论成败）
    const e = pendingMap.get(assetUrl);
    if (e && e.controller === controller) {
      e.controller = null;
      // 若期间又被 schedule 了一个新 timer，则保留 entry；否则删除
      if (!e.debounceTimer) pendingMap.delete(assetUrl);
    }
  });
}

/**
 * 立即触发 reindex（用于详情页"重新索引"按钮的 toast 模式）。
 * 与 scheduleReindex 不共用 pending 队列：每次都立即发起。
 *
 * @returns {Promise<{ success: boolean; status: number; timedOut?: boolean }>}
 */
export function triggerReindexNow(apiUrl, assetUrl, getHeaders, options = {}) {
  if (!apiUrl || !assetUrl) {
    return Promise.resolve({ success: false, status: 0 });
  }
  return executeReindex(apiUrl, assetUrl, getHeaders, {
    silent: false,
    poll: true,
    ...options,
  });
}

/**
 * 轮询 /info/indexing/asset/status 直到所有 plugin 完成或超时。
 * 完成判定：plugins_statuses 中所有 plugin 的最新 status 都不是 "Pending"/"Processing"。
 *
 * @returns {Promise<{ finished: boolean; timedOut: boolean }>}
 */
export async function pollIndexingStatus(apiUrl, assetUrl, getHeaders, options = {}) {
  const {
    intervalMs = POLL_INTERVAL_MS,
    maxAttempts = POLL_MAX_ATTEMPTS,
    signal,
  } = options;

  const isInProgress = (statusStr) => {
    if (!statusStr) return false;
    const s = String(statusStr).toLowerCase();
    return s === "pending" || s === "processing" || s === "running" || s === "queued";
  };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) {
      return { finished: false, timedOut: false };
    }
    try {
      const headers = getHeaders ? getHeaders() : {};
      const resp = await fetch(
        `${apiUrl}/info/indexing/asset/status?url=${encodeURIComponent(assetUrl)}`,
        { headers, signal }
      );
      if (resp.ok) {
        const data = await resp.json();
        const plugins = data?.plugins_statuses;
        if (plugins && typeof plugins === "object") {
          let anyInProgress = false;
          for (const pluginData of Object.values(plugins)) {
            const history = pluginData?.plugin_status_history;
            if (Array.isArray(history) && history.length > 0) {
              if (isInProgress(history[0].status)) {
                anyInProgress = true;
                break;
              }
            }
          }
          if (!anyInProgress) {
            return { finished: true, timedOut: false };
          }
        }
      }
    } catch (err) {
      if (err?.name === "AbortError") {
        return { finished: false, timedOut: false };
      }
      // 网络错误不抛，只 debug，继续重试
      console.debug(`${LOG_PREFIX} poll error (will retry)`, { error: err?.message });
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { finished: false, timedOut: true };
}

/**
 * 取消某 assetUrl 的 in-flight reindex 与挂起的 debounce timer。
 * 供 useTagManager 的 unmount cleanup 使用。
 */
export function cancelReindex(assetUrl) {
  cleanupEntry(assetUrl);
}

// ─── 批量 reindex（V2 U8） ──────────────────────────────────────────────────

const batchStats = {
  batches: 0,
  itemsTotal: 0,
  itemsSuccess: 0,
  triggerSearchDispatched: 0,
  triggerSearchSkippedByGuard: 0,
};

if (typeof window !== "undefined") {
  Object.defineProperty(window, "__batchReindexStats", {
    configurable: true,
    get() { return { ...batchStats }; },
  });
}

/**
 * 批量 reindex + 合并 trigger-search。
 *
 * - 对 assetUrls[] 并发触发 triggerReindexNow（silent=true, poll=true）
 * - 全部完成或超时后，仅在 searchQuery 未发生变化时才 dispatch 1 次 'trigger-search'（U8 守卫）
 * - onAllDone 总是会被调（无论是否派发事件），供上层关闭进度条
 *
 * @param {string} apiUrl
 * @param {string[]} assetUrls
 * @param {() => Record<string,string>} getHeaders
 * @param {{
 *   onAllDone?: (result: { success: string[]; failed: string[]; timedOut: string[] }) => void,
 *   onProgress?: (done: number, total: number, currentAssetUrl: string) => void,
 *   timeoutMs?: number,            // 单个 item 超时
 *   concurrency?: number,          // 并发数，默认 5
 *   originalQuery?: string,        // U8 守卫用；未提供则跳过守卫（直接派发）
 *   getCurrentQuery?: () => string // U8 守卫用；返回当前 searchQuery，和 originalQuery 对比
 * }} [options]
 * @returns {Promise<{ success: string[]; failed: string[]; timedOut: string[] }>}
 */
export async function scheduleReindexBatch(apiUrl, assetUrls, getHeaders, options = {}) {
  const {
    onAllDone,
    onProgress,
    timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
    concurrency = 5,
    originalQuery,
    getCurrentQuery,
  } = options;

  if (!apiUrl || !Array.isArray(assetUrls) || assetUrls.length === 0) {
    onAllDone?.({ success: [], failed: [], timedOut: [] });
    return { success: [], failed: [], timedOut: [] };
  }

  batchStats.batches += 1;
  batchStats.itemsTotal += assetUrls.length;

  const success = [];
  const failed = [];
  const timedOut = [];

  let done = 0;
  const total = assetUrls.length;
  const queue = assetUrls.slice();

  const worker = async () => {
    while (queue.length > 0) {
      const url = queue.shift();
      if (!url) break;
      try {
        const r = await triggerReindexNow(apiUrl, url, getHeaders, {
          silent: true,
          poll: true,
          timeoutMs,
        });
        if (r.success) { success.push(url); batchStats.itemsSuccess += 1; }
        else if (r.timedOut) { timedOut.push(url); }
        else { failed.push(url); }
      } catch (e) {
        failed.push(url);
      } finally {
        done += 1;
        try { onProgress?.(done, total, url); } catch (_) { /* noop */ }
      }
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, assetUrls.length) }, () => worker());
  await Promise.all(workers);

  // U8 守卫：比对 searchQuery 再派发
  const shouldDispatch = (() => {
    if (typeof originalQuery !== "string") return true; // 未传则不守卫
    if (typeof getCurrentQuery !== "function") return true;
    try {
      const current = getCurrentQuery();
      return current === originalQuery;
    } catch (_) {
      return true;
    }
  })();

  if (shouldDispatch) {
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("trigger-search", { detail: { source: "batchReindex" } }));
      }
      batchStats.triggerSearchDispatched += 1;
    } catch (_) { /* noop */ }
  } else {
    batchStats.triggerSearchSkippedByGuard += 1;
    console.debug(`${LOG_PREFIX} batch trigger-search skipped by searchQuery guard`, {
      originalQuery, current: getCurrentQuery?.(),
    });
  }

  const result = { success, failed, timedOut };
  try { onAllDone?.(result); } catch (e) { console.warn(`${LOG_PREFIX} onAllDone error`, e); }
  return result;
}

/** 仅供测试/调试使用：返回当前 stats 快照。 */
export function getStats() {
  return {
    total: stats.total,
    success: stats.success,
    timeout: stats.timeout,
    failed: stats.failed,
    avgDurationMs: stats.avgDurationMs,
    pending: pendingMap.size,
  };
}
