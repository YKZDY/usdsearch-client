/**
 * useTagManager - Tag 管理 Hook
 * 
 * 管理 tags 状态、乐观更新、撤销队列、自动补全缓存。
 * 采用 serial queue 保证操作按序执行（不用 debounce，避免全量覆写丢操作）。
 * 
 * @param {object} options
 * @param {string} options.serverUrl - Nucleus server URL
 * @param {string} options.assetPath - 资产路径
 * @param {Array} options.initialTags - 初始 tags（来自搜索引擎缓存）
 * @param {Function} options.getHeaders - 获取 auth headers 的函数
 * @param {string} [options.apiUrl] - USD Search API base URL（用于 reindex；未提供时跳过 reindex）
 * @param {string} [options.assetUrl] - 完整 omniverse:// URL（用于 /process/asset；未提供时退化为 assetPath）
 * @returns {object}
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  getTags as apiGetTags,
  modifyTags as apiModifyTags,
  tagQuery as apiTagQuery,
  extractTokenFromHeaders,
  extractHost,
  normalizeAssetPath,
  normalizeParentPath,
  getTaggingToken,
} from '../services/taggingService';
import {
  scheduleReindex,
  cancelReindex,
} from '../services/reindexService';

// tag_query 缓存（5 分钟 TTL）
const queryCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

// 最近使用的 tags（LRU，跨组件共享）
const recentTags = [];
const MAX_RECENT = 10;

function addToRecent(tagName) {
  const idx = recentTags.indexOf(tagName);
  if (idx !== -1) recentTags.splice(idx, 1);
  recentTags.unshift(tagName);
  if (recentTags.length > MAX_RECENT) recentTags.pop();
}

export default function useTagManager({ serverUrl, assetPath, initialTags = [], getHeaders, apiUrl, assetUrl }) {
  // ─── 路径规范化（协议要求纯路径，去掉 omniverse://host 前缀）──────
  const normPath = useMemo(() => normalizeAssetPath(assetPath), [assetPath]);

  // ─── reindex 用的完整 URL（优先使用 assetUrl，回退用 assetPath）──
  // 注意：/process/asset 接口需要带 schema 的完整 URL（如 omniverse://host/path），
  // 而 wss tagging 协议需要去掉 schema 的纯路径（normPath）。
  const reindexUrl = useMemo(() => {
    if (typeof assetUrl === 'string' && assetUrl) return assetUrl;
    if (typeof assetPath === 'string' && assetPath.startsWith('omniverse://')) return assetPath;
    return null;
  }, [assetUrl, assetPath]);

  // ─── serverUrl fallback：当 serverUrl 为空时从 assetPath 提取 host ──────
  const effectiveServerUrl = useMemo(() => {
    if (serverUrl) return serverUrl;
    // 从 omniverse://ov.qq.com/Library/... 中提取 host
    if (typeof assetPath === 'string') {
      let s = assetPath;
      if (s.startsWith('omniverse://')) s = s.slice('omniverse://'.length);
      else if (s.startsWith('omni://')) s = s.slice('omni://'.length);
      else return '';
      const slashIdx = s.indexOf('/');
      if (slashIdx > 0) return s.substring(0, slashIdx);
      return s || '';
    }
    return '';
  }, [serverUrl, assetPath]);

  // ─── State ──────────────────────────────────────────────────────
  const [tags, setTags] = useState(() =>
    (initialTags || []).map(t => ({
      name: typeof t === 'string' ? t : (t.tag || t.name || ''),
      tag_namespace: t.tag_namespace || 'appearance',
      value: t.value || '',
      status: 'normal', // 'normal' | 'pending' | 'removing'
    }))
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isFreshLoaded, setIsFreshLoaded] = useState(false); // 用于 fade 过渡
  const [suggestions, setSuggestions] = useState([]);
  const [hasWritePermission, setHasWritePermission] = useState(true); // 默认乐观
  // [TagSearchFix] reindex 状态：'idle' | 'pending' | 'timeout'
  // 用于 EditableTagsPanel 在 timeout 时露出"立即重试"提示
  const [reindexState, setReindexState] = useState('idle');

  // ─── Refs ───────────────────────────────────────────────────────
  const queueRef = useRef(Promise.resolve()); // serial queue
  const undoTimersRef = useRef(new Map());    // tagName → { timer, originalTags }
  const mountedRef = useRef(true);
  const tokenRef = useRef(null);
  const hostRef = useRef('');
  const tagsRef = useRef([]);                 // 最新 tags 快照（用于 cleanup 时同步）
  const reindexUrlRef = useRef(null);         // [TagSearchFix] 用于 unmount cleanup 读取最新 reindexUrl

  // ─── Derived ────────────────────────────────────────────────────
  useEffect(() => {
    hostRef.current = extractHost(effectiveServerUrl);
    // 初始化时先用同步方式取 token（API Token），后续操作会异步 refresh
    tokenRef.current = extractTokenFromHeaders(getHeaders);
    // 异步获取有写权限的 tagging token
    if (effectiveServerUrl) {
      getTaggingToken(effectiveServerUrl, getHeaders).then(t => {
        if (t) tokenRef.current = t;
      });
    }
  }, [effectiveServerUrl, getHeaders]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // 保持 tagsRef 与 state 同步（用于 cleanup 时读取最新快照）
  useEffect(() => {
    tagsRef.current = tags;
  }, [tags]);

  // [TagSearchFix] 保持 reindexUrlRef 同步，让 unmount cleanup 能读到最新值
  useEffect(() => {
    reindexUrlRef.current = reindexUrl;
  }, [reindexUrl]);

  // ─── 初始化：异步拉最新 tags ──────────────────────────────────
  useEffect(() => {
    if (!effectiveServerUrl || !normPath) return;

    let cancelled = false;
    setIsLoading(true);

    const host = extractHost(effectiveServerUrl);

    // 异步获取 token 后再拉 tags
    getTaggingToken(effectiveServerUrl, getHeaders).then(token => {
      if (cancelled || !mountedRef.current) return;
      if (!token) {
        setIsLoading(false);
        setHasWritePermission(false);
        return;
      }

      tokenRef.current = token;
      apiGetTags(host, token, normPath)
        .then(result => {
          if (cancelled || !mountedRef.current) return;
          const freshTags = (result.tags || []).map(t => ({
            name: t.name || '',
            tag_namespace: t.tag_namespace || 'appearance',
            value: t.value || '',
            status: 'normal',
          }));
          setTags(freshTags);
          setIsFreshLoaded(true);
          setTimeout(() => mountedRef.current && setIsFreshLoaded(false), 200);
        })
        .catch(err => {
          if (cancelled) return;
          if (err.message?.includes('Forbidden') || err.message?.includes('Unauthorized')) {
            setHasWritePermission(false);
          }
        })
        .finally(() => {
          if (!cancelled && mountedRef.current) setIsLoading(false);
        });
    }).catch(() => {
      if (!cancelled && mountedRef.current) setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [effectiveServerUrl, normPath, getHeaders]);

  // ─── Serial Queue 执行器 ────────────────────────────────────────
  const enqueue = useCallback((fn) => {
    queueRef.current = queueRef.current.then(fn).catch(() => {});
  }, []);

  // ─── 全量覆写（内部方法）─────────────────────────────────────────
  const syncToServer = useCallback(async (currentTags) => {
    const host = hostRef.current;
    if (!host || !normPath) return;

    // 确保用有写权限的 token
    const token = await getTaggingToken(host, getHeaders);
    if (!token) return;
    tokenRef.current = token;

    const userTags = currentTags
      .filter(t => t.status !== 'removing')
      .map(t => ({ name: t.name, tag_namespace: t.tag_namespace, value: t.value }));

    return apiModifyTags(host, token, normPath, userTags);
  }, [normPath, getHeaders]);

  // ─── [TagSearchFix] 触发自动 reindex（静默 + debounce + 完成后有条件重搜）─────
  // 完成回调里检查当前搜索词（URL ?q= 或 search 历史）是否包含 queryHint，
  // 是则 dispatch trigger-search 让结果刷新；否则只 console.debug，不打扰用户。
  // P2: debounce 3500ms 错开 3s 撤销窗口
  // P8: 仅当 query 包含 tag 时刷新结果
  // P9: 删 tag 也要触发，避免"删了还能搜到"
  const triggerReindexAfterSync = useCallback((queryHint) => {
    if (!apiUrl || !reindexUrl) {
      // 没有 reindex 信息时跳过（向后兼容旧调用方）
      return;
    }
    if (mountedRef.current) setReindexState('pending');
    scheduleReindex(apiUrl, reindexUrl, getHeaders, {
      delayMs: 3500,
      poll: true,
      silent: true,
      queryHint: queryHint || null,
      onComplete: ({ queryHint: hint } = {}) => {
        if (mountedRef.current) setReindexState('idle');
        // 读取当前搜索词
        try {
          const currentQuery = new URLSearchParams(window.location.search).get('q') || '';
          const lowered = currentQuery.toLowerCase();
          const hintLower = (hint || '').toLowerCase();
          if (hintLower && lowered.includes(hintLower)) {
            // 当前搜索与刚写入/删除的 tag 相关，刷新结果让 tag 命中可见
            window.dispatchEvent(new Event('trigger-search'));
            console.debug('[TagReindex] complete + refresh', { hint, currentQuery });
          } else {
            console.debug('[TagReindex] complete (no refresh)', { hint, currentQuery });
          }
        } catch (e) {
          // 读 URL 失败也不打扰
        }
      },
      onTimeout: () => {
        if (mountedRef.current) setReindexState('timeout');
      },
    });
  }, [apiUrl, reindexUrl, getHeaders]);

  // ─── addTag ─────────────────────────────────────────────────────
  const addTag = useCallback((tagName) => {
    if (!tagName?.trim()) return;
    const name = tagName.trim();

    // 去重
    setTags(prev => {
      if (prev.some(t => t.name === name && t.status !== 'removing')) return prev;

      const newTag = { name, tag_namespace: 'appearance', value: '', status: 'pending' };
      const next = [...prev, newTag];

      // 入队发送
      enqueue(async () => {
        try {
          await syncToServer(next);
          if (mountedRef.current) {
            setTags(cur =>
              cur.map(t => t.name === name && t.status === 'pending' ? { ...t, status: 'normal' } : t)
            );
          }
          // [TagSearchFix P2/P8/P9] 同步成功后触发自动 reindex
          triggerReindexAfterSync(name);
        } catch (err) {
          // 回滚
          if (mountedRef.current) {
            setTags(cur => cur.filter(t => !(t.name === name && t.status === 'pending')));
          }
          throw err; // 让外层 catch 产生 toast
        }
      });

      return next;
    });

    addToRecent(name);
  }, [enqueue, syncToServer, triggerReindexAfterSync]);

  // ─── addMultipleTags（粘贴拆分用）──────────────────────────────
  const addMultipleTags = useCallback((names) => {
    names.forEach(n => addTag(n));
  }, [addTag]);

  // ─── removeTag ──────────────────────────────────────────────────
  const removeTag = useCallback((tagName) => {
    // 先标记为 removing（UI 动画）
    setTags(prev => prev.map(t =>
      t.name === tagName ? { ...t, status: 'removing' } : t
    ));

    // 300ms 后真正从数组移除（等动画完成）
    const removeTimeout = setTimeout(() => {
      if (!mountedRef.current) return;
      setTags(prev => {
        const next = prev.filter(t => t.name !== tagName);
        return next;
      });
    }, 200);

    // 3 秒 undo 窗口，超时后同步到服务器
    const undoTimer = setTimeout(() => {
      undoTimersRef.current.delete(tagName);
      // 此时 tags state 已经没有该 tag，同步到服务器
      enqueue(async () => {
        const snapshot = tagsRef.current.filter(t => t.status !== 'removing');
        try {
          await syncToServer(snapshot);
          // [TagSearchFix P9] 删除 tag 后也触发 reindex，避免"删了还能搜到"
          triggerReindexAfterSync(tagName);
        } catch (_) {
          // 失败时重新拉取
          const token = tokenRef.current;
          const host = hostRef.current;
          if (token && host && normPath) {
            try {
              const r = await apiGetTags(host, token, normPath);
              if (mountedRef.current) {
                setTags((r.tags || []).map(t => ({ ...t, status: 'normal' })));
              }
            } catch (_e) { /* ignore */ }
          }
        }
      });
    }, 3000);

    // 保存 undo 信息
    undoTimersRef.current.set(tagName, {
      timer: undoTimer,
      removeTimeout,
    });
  }, [enqueue, syncToServer, normPath, triggerReindexAfterSync]);

  // ─── undoRemove ─────────────────────────────────────────────────
  const undoRemove = useCallback((tagName) => {
    const entry = undoTimersRef.current.get(tagName);
    if (entry) {
      clearTimeout(entry.timer);
      clearTimeout(entry.removeTimeout);
      undoTimersRef.current.delete(tagName);
    }
    // 恢复 tag
    setTags(prev => {
      // 如果 tag 还在（status=removing），恢复它
      const exists = prev.some(t => t.name === tagName);
      if (exists) {
        return prev.map(t => t.name === tagName ? { ...t, status: 'normal' } : t);
      }
      // 如果已经被移除，重新加回
      return [...prev, { name: tagName, tag_namespace: 'appearance', value: '', status: 'normal' }];
    });
  }, []);

  // ─── 自动补全 ──────────────────────────────────────────────────
  const loadSuggestions = useCallback(async () => {
    const token = tokenRef.current;
    const host = hostRef.current;
    if (!token || !host || !normPath) return;

    // 用父路径作为 query path（基于规范化后的路径，避免 schema/host 污染缓存 key）
    const lastSlash = normPath.lastIndexOf('/');
    const rawParent = lastSlash >= 0 ? normPath.substring(0, lastSlash + 1) : '/';
    const parentPath = normalizeParentPath(rawParent);
    const cacheKey = `${host}:${parentPath}`;

    // 检查缓存
    const cached = queryCache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      setSuggestions(cached.data);
      return;
    }

    try {
      const result = await apiTagQuery(host, token, parentPath);
      const tagNames = (result.tags || []).map(t => t.name);
      queryCache.set(cacheKey, { data: tagNames, time: Date.now() });
      if (mountedRef.current) setSuggestions(tagNames);
    } catch (_) {
      // 补全失败不影响主流程
    }
  }, [normPath]);

  // ─── filterSuggestions（前端过滤 + 排序）────────────────────────
  const filterSuggestions = useCallback((input) => {
    if (!input?.trim()) {
      // 无输入时显示最近使用 + 热门
      const existingNames = new Set(tags.filter(t => t.status !== 'removing').map(t => t.name));
      const recent = recentTags
        .filter(n => !existingNames.has(n))
        .slice(0, 3)
        .map(n => ({ name: n, isRecent: true }));
      const others = suggestions
        .filter(n => !existingNames.has(n) && !recent.some(r => r.name === n))
        .slice(0, 6 - recent.length)
        .map(n => ({ name: n, isRecent: false }));
      return [...recent, ...others];
    }

    const query = input.trim().toLowerCase();
    const existingNames = new Set(tags.filter(t => t.status !== 'removing').map(t => t.name));

    return suggestions
      .filter(n => n.toLowerCase().includes(query) && !existingNames.has(n))
      .slice(0, 6)
      .map(n => ({ name: n, isRecent: recentTags.includes(n) }));
  }, [tags, suggestions]);

  // ─── Cleanup ────────────────────────────────────────────────────
  useEffect(() => {
    const timers = undoTimersRef.current;
    return () => {
      // [TagSearchFix] unmount 时取消 in-flight reindex（含 debounce timer）
      const url = reindexUrlRef.current;
      if (url) {
        try { cancelReindex(url); } catch (_) { /* noop */ }
      }
      if (timers.size > 0) {
        // 有 pending 删除操作（undo 窗口未到期），unmount 时立即同步
        timers.forEach(entry => {
          clearTimeout(entry.timer);
          clearTimeout(entry.removeTimeout);
        });
        const pendingDeleteNames = new Set(timers.keys());
        timers.clear();

        // 从最新 tags 快照中排除被删除的，同步到服务器
        const survivingTags = tagsRef.current
          .filter(t => t.status !== 'removing' && !pendingDeleteNames.has(t.name))
          .map(t => ({ name: t.name, tag_namespace: t.tag_namespace, value: t.value }));

        const host = hostRef.current;
        const path = normPath;
        if (host && path) {
          // fire-and-forget：组件已 unmount，无需更新 state
          getTaggingToken(host, getHeaders).then(token => {
            if (!token) return;
            apiModifyTags(host, token, path, survivingTags).catch(() => {});
          }).catch(() => {});
        }
      }
    };
  }, []);

  return {
    tags: tags.filter(t => t.status !== 'removing'),
    allTags: tags, // 包含 removing 状态的（用于动画）
    isLoading,
    isFreshLoaded,
    hasWritePermission,
    addTag,
    addMultipleTags,
    removeTag,
    undoRemove,
    suggestions,
    loadSuggestions,
    filterSuggestions,
    // [TagSearchFix] 暴露 reindex 状态给 UI（用于 timeout 时的"立即重试"提示）
    reindexState,
    // 当前 reindex URL（供 EditableTagsPanel 在"立即重试"按钮中调 triggerReindexNow）
    reindexUrl,
  };
}
