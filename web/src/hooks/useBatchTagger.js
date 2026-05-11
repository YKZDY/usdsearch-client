/**
 * useBatchTagger - 批量打/取 tag 引擎（V2）
 *
 * 核心流程（每个 item）：
 *   1. 若 existingTags 缺失，apiGetTags 读取（快照 A）
 *   2. 若 add 且已有该 tag / remove 且无该 tag → 跳过（reason: 'alreadyHasTag' / 'noSuchTag'）
 *   3. 合并后 apiModifyTags 写入（全量覆写安全）
 *   4. [U2] 再读一次 apiGetTags（快照 B）
 *      若 B 中出现『非自己这次写入』的新增 tag（他人并发插入） → 自动合并重写一次
 *      重写仍失败 → 标记 reason='conflict'
 *   5. 汇总后调 scheduleReindexBatch 合并 reindex
 *
 * 并发：worker pool（concurrency=5，默认）
 * 失败不中断：每个 item 独立 try/catch
 *
 * @typedef {Object} BatchItem
 * @property {string} assetUrl     - 完整 omniverse:// URL（reindex 用）
 * @property {string} serverUrl    - Nucleus host（如 "ov.qq.com"）
 * @property {string} assetPath    - 纯路径（wss 协议用）；若未传则从 assetUrl 推导
 * @property {Array<{name,tag_namespace?,value?}>} [existingTags] - 可选，缺失则现读
 * @property {string} [displayName] - 给进度条 Tooltip 用
 *
 * @typedef {Object} BatchResult
 * @property {Array<{assetUrl,displayName?}>} success
 * @property {Array<{assetUrl,displayName?,reason:string}>} skipped
 * @property {Array<{assetUrl,displayName?,reason:string,error?:string}>} failed
 */

import { useCallback, useRef } from 'react';
import {
  getTags as apiGetTags,
  modifyTags as apiModifyTags,
  extractHost,
  getTaggingToken,
  extractTokenFromHeaders,
  normalizeAssetPath,
} from '../services/taggingService';
import { scheduleReindexBatch } from '../services/reindexService';

const LOG_PREFIX = '[BatchTag]';

// DevTools 可观测
const batchTaggerStats = {
  runs: 0,
  itemsTotal: 0,
  itemsSuccess: 0,
  itemsSkipped: 0,
  itemsFailed: 0,
  conflictDetected: 0,
  conflictResolved: 0,
};

if (typeof window !== 'undefined') {
  Object.defineProperty(window, '__batchTaggerStats', {
    configurable: true,
    get() { return { ...batchTaggerStats }; },
  });
}

/**
 * 从 assetUrl / assetPath 推导用于 wss 协议的纯 path
 */
function deriveAssetPath(item) {
  if (item.assetPath && typeof item.assetPath === 'string') return item.assetPath;
  if (item.assetUrl) return normalizeAssetPath(item.assetUrl);
  return '';
}

/**
 * 把 existingTags（可能是字符串或对象）规范成 { name, tag_namespace, value }
 */
function normalizeTagList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map(t => {
      if (typeof t === 'string') return { name: t, tag_namespace: 'appearance', value: '' };
      if (t && typeof t === 'object') {
        const name = t.name || t.tag || '';
        if (!name) return null;
        return {
          name,
          tag_namespace: t.tag_namespace || 'appearance',
          value: t.value || '',
        };
      }
      return null;
    })
    .filter(Boolean);
}

export default function useBatchTagger({ getHeaders, apiUrl, searchQueryRef } = {}) {
  const cancelledRef = useRef(false);

  /**
   * 执行批量操作
   * @param {{
   *   items: BatchItem[],
   *   tagName: string,
   *   mode?: 'add'|'remove',
   *   concurrency?: number,
   *   onProgress?: (info: {done:number,total:number,item:BatchItem,result:'success'|'skipped'|'failed',reason?:string}) => void,
   *   onComplete?: (result: BatchResult) => void,
   *   skipReindex?: boolean,  // 撤销时由调用方合并 reindex 可关掉
   * }} params
   * @returns {{ cancel:()=>void, promise: Promise<BatchResult> }}
   */
  const executeBatch = useCallback((params) => {
    const {
      items,
      tagName,
      mode = 'add',
      concurrency = 5,
      onProgress,
      onComplete,
      skipReindex = false,
    } = params || {};

    cancelledRef.current = false;
    batchTaggerStats.runs += 1;

    const trimmedTag = (tagName || '').trim();
    const result = { success: [], skipped: [], failed: [] };

    if (!trimmedTag || !Array.isArray(items) || items.length === 0) {
      onComplete?.(result);
      return { cancel: () => {}, promise: Promise.resolve(result) };
    }

    batchTaggerStats.itemsTotal += items.length;
    console.info(`${LOG_PREFIX} start`, { tagName: trimmedTag, mode, itemCount: items.length });

    const total = items.length;
    let done = 0;

    const queue = items.slice();

    const processOne = async (item) => {
      const displayName = item.displayName || item.assetPath || item.assetUrl;
      const assetPath = deriveAssetPath(item);
      const host = extractHost(item.serverUrl || item.assetUrl || '');
      if (!host || !assetPath) {
        const entry = { assetUrl: item.assetUrl, displayName, reason: 'invalid', error: 'missing host or path' };
        result.failed.push(entry);
        batchTaggerStats.itemsFailed += 1;
        onProgress?.({ done: ++done, total, item, result: 'failed', reason: 'invalid' });
        return;
      }

      try {
        // 取 token（复用 useTagManager 的策略）
        let token = await getTaggingToken(host, getHeaders).catch(() => null);
        if (!token) token = extractTokenFromHeaders(getHeaders);
        if (!token) {
          const entry = { assetUrl: item.assetUrl, displayName, reason: 'permission', error: 'no token' };
          result.failed.push(entry);
          batchTaggerStats.itemsFailed += 1;
          onProgress?.({ done: ++done, total, item, result: 'failed', reason: 'permission' });
          return;
        }

        // 1. 读快照 A（existingTags 缺失才读）
        let snapshotA;
        if (Array.isArray(item.existingTags)) {
          snapshotA = normalizeTagList(item.existingTags);
        } else {
          const r = await apiGetTags(host, token, assetPath);
          snapshotA = normalizeTagList(r.tags || []);
        }

        const hasTag = snapshotA.some(t => t.name === trimmedTag);

        // 2. 跳过判定
        if (mode === 'add' && hasTag) {
          result.skipped.push({ assetUrl: item.assetUrl, displayName, reason: 'alreadyHasTag' });
          batchTaggerStats.itemsSkipped += 1;
          onProgress?.({ done: ++done, total, item, result: 'skipped', reason: 'alreadyHasTag' });
          return;
        }
        if (mode === 'remove' && !hasTag) {
          result.skipped.push({ assetUrl: item.assetUrl, displayName, reason: 'noSuchTag' });
          batchTaggerStats.itemsSkipped += 1;
          onProgress?.({ done: ++done, total, item, result: 'skipped', reason: 'noSuchTag' });
          return;
        }

        // 3. 合并后写入
        const nextTags = mode === 'add'
          ? [...snapshotA, { name: trimmedTag, tag_namespace: 'appearance', value: '' }]
          : snapshotA.filter(t => t.name !== trimmedTag);
        await apiModifyTags(host, token, assetPath, nextTags);

        // 4. [U2] 再读快照 B，检测并发写入
        try {
          const rB = await apiGetTags(host, token, assetPath);
          const snapshotB = normalizeTagList(rB.tags || []);
          const expectedNames = new Set(nextTags.map(t => t.name));
          // B 中有、但 expected 中没有的 = 他人并发新增
          const concurrentInserts = snapshotB.filter(t => !expectedNames.has(t.name));
          if (concurrentInserts.length > 0) {
            batchTaggerStats.conflictDetected += 1;
            console.warn(`${LOG_PREFIX} concurrent insert detected; auto-merging`, {
              assetPath, concurrentInserts: concurrentInserts.map(t => t.name),
            });
            // 合并他人 + 自己的变更，重写一次
            const merged = mode === 'add'
              ? [...nextTags, ...concurrentInserts]
              : [...snapshotA.filter(t => t.name !== trimmedTag), ...concurrentInserts];
            // 去重
            const dedupMap = new Map();
            merged.forEach(t => { if (!dedupMap.has(t.name)) dedupMap.set(t.name, t); });
            await apiModifyTags(host, token, assetPath, Array.from(dedupMap.values()));
            batchTaggerStats.conflictResolved += 1;
          }
        } catch (verifyErr) {
          // 校验失败不致命，写入本身已成功；记 warn 即可
          console.debug(`${LOG_PREFIX} post-verify read failed (non-fatal)`, { assetPath, err: verifyErr?.message });
        }

        result.success.push({ assetUrl: item.assetUrl, displayName });
        batchTaggerStats.itemsSuccess += 1;
        onProgress?.({ done: ++done, total, item, result: 'success' });
      } catch (err) {
        const reason = classifyError(err);
        if (reason === 'conflict') batchTaggerStats.conflictDetected += 1;
        result.failed.push({
          assetUrl: item.assetUrl, displayName, reason,
          error: err?.message || String(err),
        });
        batchTaggerStats.itemsFailed += 1;
        onProgress?.({ done: ++done, total, item, result: 'failed', reason });
      }
    };

    const worker = async () => {
      while (queue.length > 0) {
        if (cancelledRef.current) break;
        const it = queue.shift();
        if (!it) break;
        await processOne(it);
      }
    };

    const promise = (async () => {
      const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, () => worker());
      await Promise.all(workers);

      // 5. 汇总 reindex（U8 守卫）
      if (!skipReindex && apiUrl && result.success.length > 0) {
        const originalQuery = typeof searchQueryRef?.current === 'string' ? searchQueryRef.current : undefined;
        try {
          await scheduleReindexBatch(
            apiUrl,
            result.success.map(s => s.assetUrl).filter(Boolean),
            getHeaders,
            {
              originalQuery,
              getCurrentQuery: () => (searchQueryRef?.current ?? ''),
            },
          );
        } catch (e) {
          console.warn(`${LOG_PREFIX} scheduleReindexBatch failed`, e);
        }
      }

      console.info(`${LOG_PREFIX} done`, {
        tagName: trimmedTag,
        success: result.success.length,
        skipped: result.skipped.length,
        failed: result.failed.length,
      });

      onComplete?.(result);
      return result;
    })();

    return {
      cancel: () => { cancelledRef.current = true; },
      promise,
    };
  }, [getHeaders, apiUrl, searchQueryRef]);

  return { executeBatch };
}

function classifyError(err) {
  const msg = (err?.message || String(err || '')).toLowerCase();
  if (msg.includes('timeout')) return 'timeout';
  if (msg.includes('forbidden') || msg.includes('unauthorized') || msg.includes('denied')) return 'permission';
  if (msg.includes('network') || msg.includes('connection')) return 'network';
  if (msg.includes('conflict')) return 'conflict';
  return 'unknown';
}
