/**
 * useAssetAdvancedData
 *
 * 资产「高级数据」共享 Hook：依赖图 / 反向依赖图 / USD 属性表
 *  - 与 NVIDIA 原版 AssetDetailsModal 中三段 loadDependencies / loadInverseDependencies / loadUSDProperties
 *    行为一致，但增加：
 *      1) 会话内 useRef Map 缓存（key = `${assetUrl}::${assetGuid}`），命中缓存不重复请求
 *      2) AbortController：资产切换 / 卸载时取消未完成请求，防止"上一个资产数据闪进当前 Drawer"
 *      3) 错误状态 + 重试入口（errors.deps / errors.inverseDeps / errors.usdProps）
 *  - 不在 hook 内做 reindex；triggerReindexAllPlugins / triggerReindexIndividualPlugin
 *    继续由 HybridDeepSearchUI 透传（保持 NVIDIA 合入安全）
 *
 * 用法：
 *   const adv = useAssetAdvancedData({ asset, getHeaders });
 *   adv.loadDependencies();          // 懒加载，命中缓存直接返回
 *   adv.deps;                        // { nodes, edges } | null
 *   adv.loading.deps;                // boolean
 *   adv.errors.deps;                 // null | Error
 *   adv.refreshAll();                // 刷新依赖 / 反向依赖 / USD（强制重新请求）
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl } from "../config";

const buildCacheKey = (asset) => {
  if (!asset) return null;
  const src = asset.source || {};
  const url = src.base_key || src.url || asset.id || "";
  const guid = src.guid || src.asset_guid || "";
  if (!url) return null;
  return `${url}::${guid}`;
};

const getBaseKey = (asset) => {
  if (!asset) return null;
  const src = asset.source || {};
  return src.base_key || src.url || asset.id || null;
};

export default function useAssetAdvancedData({ asset, getHeaders }) {
  const [deps, setDeps] = useState(null);
  const [inverseDeps, setInverseDeps] = useState(null);
  const [usdProps, setUsdProps] = useState(null);

  const [loading, setLoading] = useState({
    deps: false,
    inverseDeps: false,
    usdProps: false,
  });
  const [errors, setErrors] = useState({
    deps: null,
    inverseDeps: null,
    usdProps: null,
  });

  // 会话内缓存：Map<cacheKey, { deps, inverseDeps, usdProps }>
  const cacheRef = useRef(new Map());
  // 三个独立的 AbortController，便于精细取消
  const abortRef = useRef({ deps: null, inverseDeps: null, usdProps: null });
  // 当前资产 cacheKey，便于异步回调里判断"资产是否已切换"
  const currentKeyRef = useRef(null);

  const cacheKey = buildCacheKey(asset);
  const baseKey = getBaseKey(asset);

  // 资产切换：取消未完成请求 + 从缓存恢复 / 清空展示数据
  useEffect(() => {
    currentKeyRef.current = cacheKey;
    // 取消上一资产仍在进行的请求
    Object.values(abortRef.current).forEach((c) => {
      if (c) {
        try { c.abort(); } catch (e) { /* ignore */ }
      }
    });
    abortRef.current = { deps: null, inverseDeps: null, usdProps: null };

    if (!cacheKey) {
      setDeps(null);
      setInverseDeps(null);
      setUsdProps(null);
      setLoading({ deps: false, inverseDeps: false, usdProps: false });
      setErrors({ deps: null, inverseDeps: null, usdProps: null });
      return;
    }

    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setDeps(cached.deps ?? null);
      setInverseDeps(cached.inverseDeps ?? null);
      setUsdProps(cached.usdProps ?? null);
    } else {
      setDeps(null);
      setInverseDeps(null);
      setUsdProps(null);
    }
    setLoading({ deps: false, inverseDeps: false, usdProps: false });
    setErrors({ deps: null, inverseDeps: null, usdProps: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  // 卸载时取消所有请求，防内存泄漏
  useEffect(() => {
    return () => {
      Object.values(abortRef.current).forEach((c) => {
        if (c) {
          try { c.abort(); } catch (e) { /* ignore */ }
        }
      });
    };
  }, []);

  const writeCache = useCallback((key, patch) => {
    if (!key) return;
    const prev = cacheRef.current.get(key) || {};
    cacheRef.current.set(key, { ...prev, ...patch });
  }, []);

  // 通用 fetch 工具：处理 abort + 资产切换检查
  const runRequest = useCallback(
    async ({ field, endpoint, parseData, forceReload }) => {
      const keyAtCall = cacheKey;
      if (!baseKey || !getHeaders || !keyAtCall) return;

      // 命中缓存且非强制：跳过
      const cached = cacheRef.current.get(keyAtCall) || {};
      if (!forceReload && cached[field] != null) {
        return;
      }
      // loading 中且非强制：跳过
      if (!forceReload && loading[field]) {
        return;
      }

      // 取消上一次同字段请求
      if (abortRef.current[field]) {
        try { abortRef.current[field].abort(); } catch (e) { /* ignore */ }
      }
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      abortRef.current[field] = controller;

      setLoading((prev) => ({ ...prev, [field]: true }));
      setErrors((prev) => ({ ...prev, [field]: null }));

      try {
        const headers = getHeaders();
        const response = await fetch(endpoint, {
          method: "GET",
          headers,
          signal: controller ? controller.signal : undefined,
        });
        // 资产已切换：丢弃响应
        if (currentKeyRef.current !== keyAtCall) return;

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const json = await response.json();
        if (currentKeyRef.current !== keyAtCall) return;

        const data = parseData ? parseData(json) : json;
        writeCache(keyAtCall, { [field]: data });

        if (field === "deps") setDeps(data);
        else if (field === "inverseDeps") setInverseDeps(data);
        else if (field === "usdProps") setUsdProps(data);
      } catch (err) {
        if (err && err.name === "AbortError") return;
        if (currentKeyRef.current !== keyAtCall) return;
        // 仅记录非取消类错误
        // eslint-disable-next-line no-console
        console.error(`[useAssetAdvancedData] load ${field} failed:`, err);
        setErrors((prev) => ({ ...prev, [field]: err }));
      } finally {
        if (currentKeyRef.current === keyAtCall) {
          setLoading((prev) => ({ ...prev, [field]: false }));
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cacheKey, baseKey, getHeaders]
  );

  const loadDependencies = useCallback(
    (forceReload = false) =>
      runRequest({
        field: "deps",
        endpoint:
          `${apiUrl}/dependency_graph/graph?` +
          new URLSearchParams({ root_node_url: baseKey || "", limit: 10000 }).toString(),
        parseData: (json) => json || [],
        forceReload,
      }),
    [runRequest, baseKey]
  );

  const loadInverseDependencies = useCallback(
    (forceReload = false) =>
      runRequest({
        field: "inverseDeps",
        endpoint:
          `${apiUrl}/dependency_graph/inverse/graph?` +
          new URLSearchParams({ root_node_url: baseKey || "", limit: 10000 }).toString(),
        parseData: (json) => json || [],
        forceReload,
      }),
    [runRequest, baseKey]
  );

  const loadUSDProperties = useCallback(
    (forceReload = false) =>
      runRequest({
        field: "usdProps",
        endpoint:
          `${apiUrl}/asset_graph/usd/scene_summary/?` +
          new URLSearchParams({ scene_url: baseKey || "" }).toString(),
        parseData: (json) => json?.default_prim?.properties || {},
        forceReload,
      }),
    [runRequest, baseKey]
  );

  const refreshAll = useCallback(() => {
    // 强制刷新三类数据；先把缓存对应字段清掉
    if (cacheKey) {
      const prev = cacheRef.current.get(cacheKey) || {};
      cacheRef.current.set(cacheKey, { ...prev, deps: undefined, inverseDeps: undefined, usdProps: undefined });
    }
    loadDependencies(true);
    loadInverseDependencies(true);
    loadUSDProperties(true);
  }, [cacheKey, loadDependencies, loadInverseDependencies, loadUSDProperties]);

  return {
    // 数据
    deps,
    inverseDeps,
    usdProps,
    // 状态
    loading,
    errors,
    // 加载器
    loadDependencies,
    loadInverseDependencies,
    loadUSDProperties,
    refreshAll,
    // 工具
    baseKey,
    cacheKey,
  };
}
