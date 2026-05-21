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
  getTaggingTokenWithMeta,
  clearTaggingTokenCache,
  isValidNucleusHost,
  TaggingError,
} from '../services/taggingService';
// [P0 fix/lm-tag-wss-auth-expiry] wss 鉴权失败时统一触发 auth-guard-open 重登录引导
import { requestReauth } from '../utils/authReauthBus';
import {
  scheduleReindex,
  cancelReindex,
} from '../services/reindexService';
import { resolveNucleusHost } from '../config';

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

// [A3] 收集环境快照，用于诊断卡片展示与"复制诊断信息"
// 不含任何 token / 敏感信息，可放心展示与复制
function collectEnvSnapshot() {
  try {
    return {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      protocol: typeof window !== 'undefined' && window.location ? window.location.protocol : '',
      clientNow: new Date().toISOString(),
    };
  } catch (_) {
    return { userAgent: '', protocol: '', clientNow: new Date().toISOString() };
  }
}

// [TagFailureSurface] 把任意 error 规范化为 lastError 对象
//   - TaggingError 直接抽字段
//   - 普通 Error 兜底为 kind='unknown'
function buildLastError(err, extra = {}) {
  const env = collectEnvSnapshot();
  const at = Date.now();
  if (err instanceof TaggingError) {
    return {
      kind: err.kind || 'unknown',
      stage: err.stage || 'unknown',
      message: err.message || '',
      hostUsed: err.hostUsed || extra.hostUsed || '',
      method: err.method || extra.method || '',
      tokenSource: err.tokenSource || extra.tokenSource || null,
      closeCode: err.closeCode,
      serverCode: err.serverCode,
      jwtExp: err.jwtExp,
      clockSkewSuspected: err.clockSkewSuspected,
      env,
      at,
    };
  }
  return {
    kind: 'unknown',
    stage: 'unknown',
    message: err?.message || String(err),
    hostUsed: extra.hostUsed || '',
    method: extra.method || '',
    tokenSource: extra.tokenSource || null,
    env,
    at,
  };
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
  //
  // [Tag Deploy Fix - 防线 2] 不再"非空即用"，而是先校验合法性：
  // - 部署环境 selectedBackend="omniverse" 这种裸 key 会被 SERVER_MAPPING 兜底解析；
  // - 解析后再用 isValidNucleusHost 兜底校验；
  // - 全部失败时返回空串 → 上游 useEffect 跳过 wss，hasWritePermission 自动转 false，
  //   UI 显示"无写权限"而非凭空消失。
  const effectiveServerUrl = useMemo(() => {
    // 1) props.serverUrl 走 resolveNucleusHost 规范化（处理 omniverse://、别名等）
    const fromProps = resolveNucleusHost(serverUrl);
    if (fromProps && isValidNucleusHost(fromProps)) return fromProps;

    // 2) 从 assetPath 中提取 host 兜底（omniverse://ov.qq.com/Library/...）
    if (typeof assetPath === 'string') {
      const fromAsset = resolveNucleusHost(assetPath);
      if (fromAsset && isValidNucleusHost(fromAsset)) return fromAsset;
    }

    // 3) 全部失败：日志一次，返回空串让上游跳过写操作
    if (serverUrl || assetPath) {
      console.warn('[useTagManager] cannot resolve a valid nucleus host', {
        serverUrl,
        assetPath,
      });
    }
    return '';
  }, [serverUrl, assetPath]);

  // ─── [TagStorageKeyFix] storage key 别名候选 ──────────────────────────
  //
  // 真实 host (effectiveServerUrl) 是经 resolveNucleusHost 解析后的值（如 'ov.qq.com'），
  // 但 index.js DeviceFlow 登录时用的是 URL ?server= 原值（如 'omniverse'）作 storage key 前缀。
  // 这里从 URL 读出原值（处理过编码），作为 alias 传给 taggingService 让三级查找能命中。
  //
  // 例：
  //   ?server=omniverse           → effectiveServerUrl='ov.qq.com', aliases=['omniverse']
  //   ?server=nucleus             → effectiveServerUrl='ov.qq.com', aliases=['nucleus','omniverse'] （v2 补强 1：兼容老 storage）
  //   ?server=omniverse://ov.qq.com → effectiveServerUrl='ov.qq.com', aliases=[] （剥协议后等于 host，去重掉）
  //   ?server=https://ov.qq.com   → effectiveServerUrl='ov.qq.com', aliases=[]
  //
  // [v2 补强 1] 永远把 'omniverse' / 'nucleus' 两个固定值塞进候选集：
  //   场景：用户从外部直接把 URL 改成 ?server=nucleus，但 storage 里只有 omniverse_* 单前缀（极旧版本登录），
  //   原本只把 raw='nucleus' 加进 aliases 找不到 token，会被迫 fallback 到只读 API Token 失败。
  //   补固定值后 aliases=['nucleus','omniverse']，命中 omniverse_* 后 useTagManager L244+ 的存量迁移
  //   会自动复制 alias→host，老用户免重登。
  const storageKeyAliases = useMemo(() => {
    if (typeof window === 'undefined') return [];
    let raw = '';
    try {
      raw = new URLSearchParams(window.location.search).get('server') || '';
    } catch (_) {
      return [];
    }
    // 收集候选：原值 + 剥协议头后的形式 + 固定 'omniverse' / 'nucleus' 兜底
    const cands = new Set();
    if (raw) {
      cands.add(raw);
      const stripped = raw.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/^omniverse:\/\//, '').replace(/^omni:\/\//, '');
      if (stripped && stripped !== raw) cands.add(stripped);
    }
    // [v2 补强 1] 始终塞进 omniverse / nucleus，护老用户切到新 URL 后 Tag 仍命中
    cands.add('omniverse');
    cands.add('nucleus');
    // 过滤掉空串和等于 effectiveServerUrl 的
    return Array.from(cands).filter(c => c && c !== effectiveServerUrl);
  }, [effectiveServerUrl]);

  // ─── State ──────────────────────────────────────────────────────
  const [tags, setTags] = useState(() =>
    (initialTags || []).map(t => ({
      name: typeof t === 'string' ? t : (t.tag || t.name || ''),
      tag_namespace: t.tag_namespace || 'appearance',
      value: t.value || '',
      status: 'normal', // 'normal' | 'pending' | 'removing' | 'failed'
    }))
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isFreshLoaded, setIsFreshLoaded] = useState(false); // 用于 fade 过渡
  const [suggestions, setSuggestions] = useState([]);
  const [hasWritePermission, setHasWritePermission] = useState(true); // 默认乐观
  // [TagSearchFix] reindex 状态：'idle' | 'pending' | 'timeout'
  // 用于 EditableTagsPanel 在 timeout 时露出"立即重试"提示
  const [reindexState, setReindexState] = useState('idle');
  // [TagFailureSurface] 最近一次失败的诊断信息，结构见 buildLastError
  const [lastError, setLastError] = useState(null);

  // ─── Refs ───────────────────────────────────────────────────────
  const queueRef = useRef(Promise.resolve()); // serial queue
  const undoTimersRef = useRef(new Map());    // tagName → { timer, originalTags }
  const mountedRef = useRef(true);
  const tokenRef = useRef(null);
  const tokenSourceRef = useRef(null);        // [TagFailureSurface] 当前 token 来源（用于诊断）
  const hostRef = useRef('');
  const tagsRef = useRef([]);                 // 最新 tags 快照（用于 cleanup 时同步）
  const reindexUrlRef = useRef(null);         // [TagSearchFix] 用于 unmount cleanup 读取最新 reindexUrl
  const lastErrorByKindAtRef = useRef(new Map()); // [TagFailureSurface] kind → 最近一次触发时间戳，用于 8s 去抖
  const migratedRef = useRef(false);          // [TagStorageKeyFix] 本组件实例是否已执行存量 token key 迁移

  // ─── 错误管理 ───────────────────────────────────────────────────
  const clearLastError = useCallback(() => {
    setLastError(null);
    lastErrorByKindAtRef.current.clear();
  }, []);

  // [TagFailureSurface] 同 kind 8s 内只触发一次，防止连续失败刷屏
  // 始终更新 state（让 UI 能拿到最新一次诊断字段），但返回 boolean 表示"是否应该触发副作用（toast）"
  const setLastErrorDedup = useCallback((err, extra = {}) => {
    const payload = buildLastError(err, extra);
    setLastError(payload);
    const prevAt = lastErrorByKindAtRef.current.get(payload.kind) || 0;
    const shouldNotify = Date.now() - prevAt > 8000;
    if (shouldNotify) {
      lastErrorByKindAtRef.current.set(payload.kind, Date.now());
    }
    // 同时把结构化错误打到 console，方便 Calvin 直接 F12 截图（不含 token）
    try {
      // eslint-disable-next-line no-console
      console.error('[TagManager] operation failed', {
        kind: payload.kind,
        stage: payload.stage,
        method: payload.method,
        hostUsed: payload.hostUsed,
        tokenSource: payload.tokenSource,
        closeCode: payload.closeCode,
        serverCode: payload.serverCode,
        jwtExp: payload.jwtExp,
        clockSkewSuspected: payload.clockSkewSuspected,
        env: payload.env,
        message: payload.message,
      });
    } catch (_) { /* ignore */ }
    return { payload, shouldNotify };
  }, []);

  // ─── Derived ────────────────────────────────────────────────────
  useEffect(() => {
    hostRef.current = extractHost(effectiveServerUrl);

    // [TagStorageKeyFix] 存量静默迁移：在第一次取 token 之前，把 alias key 的 token 复制到 host key。
    // 治"已登录但 key 错位"的旧用户（如本机 ?server=omniverse 时 index.js 写了 omniverse_*，
    // 但 service 用 ov.qq.com_* 去读）。只 setItem 不 removeItem，保留原 key 作副本以防迁移逻辑出错。
    if (!migratedRef.current && effectiveServerUrl && storageKeyAliases.length > 0) {
      migratedRef.current = true;
      const hostKey = `${effectiveServerUrl}_nucleus_access_token`;
      const hostHas = !!localStorage.getItem(hostKey);
      if (!hostHas) {
        for (const alias of storageKeyAliases) {
          const aToken = localStorage.getItem(`${alias}_nucleus_access_token`);
          // 校验非空 && 非脏数据
          if (!aToken || aToken === 'null' || aToken === 'undefined') {
            if (aToken !== null) {
              console.warn('[TagManager] alias token dirty, skip migration', { alias, value: aToken });
            }
            continue;
          }
          try {
            localStorage.setItem(`${effectiveServerUrl}_nucleus_access_token`, aToken);
            const aRefresh = localStorage.getItem(`${alias}_nucleus_refresh_token`);
            if (aRefresh && aRefresh !== 'null' && aRefresh !== 'undefined') {
              localStorage.setItem(`${effectiveServerUrl}_nucleus_refresh_token`, aRefresh);
            }
            const aExpiry = localStorage.getItem(`${alias}_nucleus_access_token_expiry`);
            if (aExpiry && aExpiry !== 'null' && aExpiry !== 'undefined') {
              localStorage.setItem(`${effectiveServerUrl}_nucleus_access_token_expiry`, aExpiry);
            }
            console.info('[TagManager] token storage migrated', {
              from: `${alias}_nucleus_*`,
              to: `${effectiveServerUrl}_nucleus_*`,
            });
            break; // 第一个有效 alias 命中即可
          } catch (e) {
            console.error('[TagManager] token storage migration failed', e);
          }
        }
      }
    }

    // 初始化时先用同步方式取 token（API Token），后续操作会异步 refresh
    tokenRef.current = extractTokenFromHeaders(getHeaders);
    tokenSourceRef.current = tokenRef.current ? 'headers' : null;
    // 异步获取有写权限的 tagging token（带 meta 记录来源 + 别名候选）
    if (effectiveServerUrl) {
      getTaggingTokenWithMeta(effectiveServerUrl, getHeaders, { storageKeyAliases }).then(meta => {
        if (meta?.token) {
          tokenRef.current = meta.token;
          tokenSourceRef.current = meta.source || null;
        }
      }).catch(() => { /* ignore - 后续操作会再次尝试 */ });
    }
  }, [effectiveServerUrl, getHeaders, storageKeyAliases]);

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

  // ─── [A2] tab 间 token 同步 ────────────────────────────────────
  // 监听 'storage'（另一 tab 写入 localStorage）和 'auth-updated'（DeviceFlow 登录成功本地 dispatch）。
  // 命中后：清缓存 → 重拉 token → 清空 lastError（让 UI 自动恢复可写）。
  // 不响应所有 storage 事件，只关心 nucleus_*_token 相关 key 的变化。
  useEffect(() => {
    const isRelevantStorageKey = (key) => {
      if (!key || typeof key !== 'string') return false;
      // 关心的 key 模式：
      //   nucleus_access_token / nucleus_refresh_token / nucleus_access_token_expiry
      //   <host>_nucleus_access_token / <host>_nucleus_refresh_token / ..._expiry
      return /nucleus_(access|refresh)_token(_expiry)?$/.test(key);
    };

    const refresh = () => {
      try { clearTaggingTokenCache(hostRef.current); } catch (_) { /* ignore */ }
      const host = hostRef.current;
      if (!host) return;
      getTaggingTokenWithMeta(host, getHeaders, { storageKeyAliases }).then(meta => {
        if (!mountedRef.current) return;
        if (meta?.token) {
          tokenRef.current = meta.token;
          tokenSourceRef.current = meta.source || null;
          // 成功拿到新 token 时把 hasWritePermission 复位，并清掉 auth 类失败的状态
          setHasWritePermission(true);
          setLastError(prev => (prev && prev.kind === 'auth' ? null : prev));
        }
      }).catch(() => { /* ignore */ });
    };

    const onStorage = (ev) => {
      // ev.key 在跨 tab 时是变更的 key；同 tab 内 setItem 不会触发 storage 事件
      // 注意：index.js 用 new Event('storage') 手动 dispatch 时 ev.key === undefined
      //       → 会被这里过滤掉，但同 tab 路径有 'auth-updated' 兜底，所以不丢消息
      if (!ev || !isRelevantStorageKey(ev.key)) return;
      refresh();
    };
    const onAuthUpdated = () => { refresh(); };

    window.addEventListener('storage', onStorage);
    window.addEventListener('auth-updated', onAuthUpdated);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('auth-updated', onAuthUpdated);
    };
  }, [getHeaders, storageKeyAliases]);

  // ─── 初始化：异步拉最新 tags ──────────────────────────────────
  useEffect(() => {
    if (!effectiveServerUrl || !normPath) return;

    let cancelled = false;
    setIsLoading(true);

    const host = extractHost(effectiveServerUrl);

    // 异步获取 token 后再拉 tags（用 *WithMeta 拿到 source 供诊断）
    getTaggingTokenWithMeta(effectiveServerUrl, getHeaders, { storageKeyAliases }).then(meta => {
      if (cancelled || !mountedRef.current) return;
      const token = meta?.token;
      if (!token) {
        setIsLoading(false);
        setHasWritePermission(false);
        // [A1] localStorage 里有 token 但已过期 → 直接暴露 preflight auth 错误
        if (meta?.isExpired) {
          setLastErrorDedup(new TaggingError({
            kind: 'auth',
            stage: 'preflight',
            hostUsed: host,
            method: 'get_tags',
            tokenSource: meta.source,
            jwtExp: meta.jwtExp,
            clockSkewSuspected: meta.clockSkewSuspected,
            message: 'Tagging token expired, please re-login Nucleus',
          }));
        }
        return;
      }

      tokenRef.current = token;
      tokenSourceRef.current = meta.source || null;
      apiGetTags(host, token, normPath, { tokenSource: meta.source })
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
          // get_tags 失败不算"操作失败"（只是初始拉取），不主动 toast；
          // 但若是 auth 类，把写权限关掉并记录 lastError（让诊断卡片可见）
          if (err instanceof TaggingError && err.kind === 'auth') {
            setHasWritePermission(false);
            setLastErrorDedup(err);
          } else if (err?.message?.includes('Forbidden') || err?.message?.includes('Unauthorized')) {
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
  }, [effectiveServerUrl, normPath, getHeaders, setLastErrorDedup, storageKeyAliases]);

  // ─── Serial Queue 执行器 ────────────────────────────────────────
  // [TagFailureSurface] 不再静默吞错：onError 回调让上层（addTag/removeTag）感知失败
  // 注意 queueRef 链上仍然 .catch(()=>{}) 让 serial 继续推进，但 onError 已经在 fn 内被调用
  const enqueue = useCallback((fn) => {
    queueRef.current = queueRef.current.then(fn).catch(() => {});
  }, []);

  // ─── 全量覆写（内部方法）─────────────────────────────────────────
  // 返回 { ok: true } 或抛出 TaggingError；抛错让 addTag/removeTag 的 catch 能拿到结构化错误。
  // [A1] preflight：取 token 时若 isExpired 直接抛 auth 错误，不发 wss。
  const syncToServer = useCallback(async (currentTags) => {
    const host = hostRef.current;
    if (!host || !normPath) {
      throw new TaggingError({
        kind: 'invalid-host',
        stage: 'preflight',
        hostUsed: host,
        method: 'modify_tags',
        message: !host ? 'Nucleus host is empty' : 'Asset path is empty',
      });
    }

    // 取 token + meta
    const meta = await getTaggingTokenWithMeta(host, getHeaders, { storageKeyAliases });
    if (!meta?.token) {
      throw new TaggingError({
        kind: 'auth',
        stage: 'preflight',
        hostUsed: host,
        method: 'modify_tags',
        tokenSource: meta?.source,
        jwtExp: meta?.jwtExp,
        clockSkewSuspected: meta?.clockSkewSuspected,
        message: 'No tagging token available, please re-login Nucleus',
      });
    }
    // [A1] localStorage 有 token 但已过期（refresh 也失败 → fallback 到 headers token），
    // 写操作大概率被 server 拒。提前 setLastError 让 UI 知道，但仍尝试一次（API Token 也可能有写权限）。
    if (meta.isExpired) {
      // [P0 fix/lm-tag-wss-auth-expiry] preflight short-circuit：
      //   过期场景下不再让 wss 拨号 10s 后超时，直接抛 auth 错并触发重登录引导。
      //   - addTag/removeTag 的 catch 仍会标 'failed' 状态 + setLastErrorDedup（UI 行为不变）
      //   - requestReauth 派发 'auth-guard-open' reason='wss-token-expired'，useAuthGuard 幂等接管
      // eslint-disable-next-line no-console
      console.warn('[TagManager] preflight: tagging token expired, short-circuit + request reauth', {
        source: meta.source,
        jwtExp: meta.jwtExp,
        clockSkewSuspected: meta.clockSkewSuspected,
        hostUsed: host,
      });
      requestReauth('wss-token-expired', { serverUrl: host });
      throw new TaggingError({
        kind: 'auth',
        stage: 'preflight',
        hostUsed: host,
        method: 'modify_tags',
        tokenSource: meta.source,
        jwtExp: meta.jwtExp,
        clockSkewSuspected: meta.clockSkewSuspected,
        message: 'Tagging token expired (preflight short-circuit), please re-login Nucleus',
      });
    }
    tokenRef.current = meta.token;
    tokenSourceRef.current = meta.source || null;

    const userTags = currentTags
      .filter(t => t.status !== 'removing')
      .map(t => ({ name: t.name, tag_namespace: t.tag_namespace, value: t.value }));

    return apiModifyTags(host, meta.token, normPath, userTags, 2, { tokenSource: meta.source });
  }, [normPath, getHeaders, storageKeyAliases]);

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
  // [TagFailureSurface] 失败时不再 filter 掉 pending tag，而是标记为 status='failed'
  // 让用户能看到红色的失败 chip + 重试按钮，而不是"加了又消失"。
  const addTag = useCallback((tagName) => {
    if (!tagName?.trim()) return;
    const name = tagName.trim();

    // 去重
    setTags(prev => {
      if (prev.some(t => t.name === name && t.status !== 'removing' && t.status !== 'failed')) return prev;
      // 如果之前有同名 failed tag，重置为 pending（相当于"重试"）
      const hadFailed = prev.some(t => t.name === name && t.status === 'failed');
      let next;
      if (hadFailed) {
        next = prev.map(t => t.name === name && t.status === 'failed' ? { ...t, status: 'pending' } : t);
      } else {
        const newTag = { name, tag_namespace: 'appearance', value: '', status: 'pending' };
        next = [...prev, newTag];
      }

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
          // [TagFailureSurface] 失败：标 failed（不删），并暴露 lastError
          if (mountedRef.current) {
            setTags(cur =>
              cur.map(t => t.name === name && t.status === 'pending' ? { ...t, status: 'failed' } : t)
            );
            setLastErrorDedup(err, {
              method: 'modify_tags',
              hostUsed: hostRef.current,
              tokenSource: tokenSourceRef.current,
            });
            // auth 类错误顺手把写权限关掉，UI 收 input
            if (err instanceof TaggingError && err.kind === 'auth') {
              setHasWritePermission(false);
              // [P0 fix/lm-tag-wss-auth-expiry] wss 鉴权失败 → 统一触发重登录引导
              //   - 复用 useAuthGuard.hasShownRef 幂等：连续点 5 次 tag 仅弹 1 次 Modal
              //   - preflight short-circuit 路径也会抛 kind='auth'，会被这里命中；
              //     虽然 syncToServer 已经主动 requestReauth 过一次，但二次派发被 hasShownRef 兜底，
              //     不会造成重复弹窗
              if (err.stage !== 'preflight') {
                requestReauth('wss-auth-fail', { serverUrl: hostRef.current });
              }
            }
          }
        }
      });

      return next;
    });

    addToRecent(name);
  }, [enqueue, syncToServer, triggerReindexAfterSync, setLastErrorDedup]);

  // ─── addMultipleTags（粘贴拆分用）──────────────────────────────
  const addMultipleTags = useCallback((names) => {
    names.forEach(n => addTag(n));
  }, [addTag]);

  // ─── retryFailedTag ─────────────────────────────────────────────
  // [TagFailureSurface] 用户点击红色 chip 时调用，复用 addTag 的"failed → pending"路径
  const retryFailedTag = useCallback((tagName) => {
    if (!tagName) return;
    // 失败 chip 触发重试时，清掉 lastError（让 UI 立刻恢复"无错误"状态）
    clearLastError();
    addTag(tagName);
  }, [addTag, clearLastError]);

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
        } catch (err) {
          // [TagFailureSurface] 失败时：把 tag 加回去（撤销删除），并 setLastError
          if (mountedRef.current) {
            setTags(cur => {
              const exists = cur.some(t => t.name === tagName);
              if (exists) {
                // 还在数组里（status=removing 已过 200ms 应该已 filter，但兜底）
                return cur.map(t => t.name === tagName ? { ...t, status: 'normal' } : t);
              }
              return [...cur, { name: tagName, tag_namespace: 'appearance', value: '', status: 'normal' }];
            });
            setLastErrorDedup(err, {
              method: 'modify_tags',
              hostUsed: hostRef.current,
              tokenSource: tokenSourceRef.current,
            });
            if (err instanceof TaggingError && err.kind === 'auth') {
              setHasWritePermission(false);
              // [P0 fix/lm-tag-wss-auth-expiry] removeTag 鉴权失败同样触发重登录引导
              // preflight 阶段 syncToServer 已主动派发，这里仅处理 wss 实际握手失败的情况
              if (err.stage !== 'preflight') {
                requestReauth('wss-auth-fail', { serverUrl: hostRef.current });
              }
            }
          }
        }
      });
    }, 3000);

    // 保存 undo 信息
    undoTimersRef.current.set(tagName, {
      timer: undoTimer,
      removeTimeout,
    });
  }, [enqueue, syncToServer, triggerReindexAfterSync, setLastErrorDedup]);

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
      const result = await apiTagQuery(host, token, parentPath, { tokenSource: tokenSourceRef.current });
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
    // [TagFailureSurface] tags 只过滤 removing；failed 保留下来让 UI 能渲染红色失败 chip
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
    // [TagFailureSurface] 错误诊断 API
    lastError,
    clearLastError,
    retryFailedTag,
    // [TagFailureSurface] 当前 host & token 来源（即便没失败也可在诊断卡片展示）
    diagnosticsContext: {
      host: hostRef.current,
      tokenSource: tokenSourceRef.current,
      // [TagStorageKeyFix] 暴露别名候选给诊断卡片，方便展示 storageKeys 一行
      storageKeyAliases,
      effectiveServerUrl,
    },
  };
}
