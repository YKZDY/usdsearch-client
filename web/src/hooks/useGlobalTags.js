/**
 * useGlobalTags - 通过 wss tagQuery 获取 Nucleus 上所有已有的 tag
 *
 * 用途：供 TagsFilter 展示全量可用标签（而非仅当前 50 条搜索结果中的 tag）。
 * 缓存 5 分钟。未登录（无 token）时返回空数组，不报错。
 *
 * @param {object} options
 * @param {string} options.serverUrl - Nucleus host（如 'ov.qq.com'）
 * @param {Function} options.getHeaders - 获取 auth headers 的函数
 * @returns {{ globalTags: string[], isLoading: boolean, refresh: Function }}
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  tagQuery as apiTagQuery,
  extractHost,
  getTaggingToken,
  isValidNucleusHost,
} from '../services/taggingService';
import { resolveNucleusHost } from '../config';

const CACHE_TTL = 5 * 60 * 1000; // 5 分钟缓存

// 模块级缓存（跨组件共享，避免重复 wss 调用）
let _cache = { host: '', tags: [], time: 0 };

// [GlobalTagSync] 模块级订阅者集合：任一 hook 实例改 _cache 时，
// 通知所有挂载中的 useGlobalTags 实例同步 React state，
// 保证 A 卡新建 tag 后 B 卡 popover 立刻能看到。
const _listeners = new Set();
function _notify() {
  _listeners.forEach(fn => {
    try { fn(_cache.tags); } catch (_) { /* ignore */ }
  });
}

export default function useGlobalTags({ serverUrl, getHeaders }) {
  const [globalTags, setGlobalTags] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // [GlobalTagSync] 订阅模块级 cache 变更
  useEffect(() => {
    const handler = (nextTags) => {
      if (mountedRef.current) setGlobalTags(nextTags);
    };
    _listeners.add(handler);
    return () => { _listeners.delete(handler); };
  }, []);

  // 稳定化 effectiveHost
  const effectiveHost = resolveNucleusHost(serverUrl) || '';

  useEffect(() => {
    if (!effectiveHost || !isValidNucleusHost(effectiveHost)) {
      setGlobalTags([]);
      return;
    }

    // 缓存命中
    if (_cache.host === effectiveHost && Date.now() - _cache.time < CACHE_TTL && _cache.tags.length > 0) {
      setGlobalTags(_cache.tags);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    getTaggingToken(effectiveHost, getHeaders)
      .then(token => {
        if (cancelled || !token) {
          if (mountedRef.current) setIsLoading(false);
          return;
        }
        const host = extractHost(effectiveHost);
        return apiTagQuery(host, token, '/');
      })
      .then(result => {
        if (cancelled || !mountedRef.current) return;
        const tagNames = (result?.tags || [])
          .map(t => t.name || t.tag || (typeof t === 'string' ? t : ''))
          .filter(Boolean);
        _cache = { host: effectiveHost, tags: tagNames, time: Date.now() };
        setGlobalTags(tagNames);
      })
      .catch(() => {
        // tagQuery 失败静默降级（用户未登录 / 无权限）
        if (mountedRef.current) setGlobalTags([]);
      })
      .finally(() => {
        if (mountedRef.current) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [effectiveHost, getHeaders]);

  // 允许外部强制刷新（如用户刚加了 tag 后想看到新候选）
  const refresh = useCallback(() => {
    _cache = { host: '', tags: [], time: 0 };
    setGlobalTags([]);
    _notify();
  }, []);

  // [TagDeleteSync] 乐观移除指定 tag（用户删除 tag 后立即从候选列表消失）
  const removeTag = useCallback((tagName) => {
    if (!tagName) return;
    // 同步更新模块级缓存（作为唯一真相）
    if (_cache.tags.includes(tagName)) {
      _cache = { ..._cache, tags: _cache.tags.filter(t => t !== tagName) };
    }
    // [GlobalTagSync] 广播给所有订阅者（含本实例自身）
    _notify();
  }, []);

  // [TagDeleteSync] 乐观添加新 tag（用户添加 tag 后立即出现在候选列表）
  const addTag = useCallback((tagName) => {
    if (!tagName) return;
    // 同步更新模块级缓存（作为唯一真相）
    if (!_cache.tags.includes(tagName)) {
      _cache = {
        host: _cache.host || '',
        tags: [..._cache.tags, tagName],
        time: _cache.time || Date.now(),
      };
    }
    // [GlobalTagSync] 广播给所有订阅者（含本实例自身）
    _notify();
  }, []);

  return { globalTags, isLoading, refresh, removeTag, addTag };
}
