/**
 * useNucleusTree - Nucleus 真实目录树编排 hook
 *
 * 职责：
 * - 在 server / 登录态变化时拉取顶层目录（'/'）
 * - 节点懒加载：UI 调 loadChildren(path) 时拉取该路径的直接子目录
 * - 暴露 status（idle/loading/ok/error）+ error 信息给 UI 用于空状态/失败横幅
 * - 通过 nucleusListingService 走 search 反推；失败时 UI 自动降级到静态快照
 *
 * 节点合并策略：
 * - 初始 tree = cloneStaticPathTree()（5 个真实根目录占位 + 已知二级目录）
 * - 顶层拉取后：用 listing 结果合并到树（已存在节点保留 origin，更新 count；
 *   listing 中新增的 root 子目录追加为新节点）
 * - 懒加载子节点：直接把 listing 结果填入 node.children
 *
 * 关键不变量：
 * - tree state 始终是合法的 TreeNode[]，下游 PathTreeBrowser / usePathSuggestions 可直接消费
 * - 所有 Listing 调用支持 AbortController，server 切换时旧请求自动取消，避免 race condition
 *
 * 与 useDeviceFlowAuth / authStorage 的关系：
 * - 不直接调认证 API，依赖 fetch 时 authStorage.getStoredAuth(server) 自动塞 header
 * - 监听 'auth-updated' 事件，在收到新凭证时重新拉一次顶层
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { cloneStaticPathTree } from '../data/pathTree';
import { listFolder } from '../services/nucleusListingService';
import * as cache from '../utils/nucleusTreeCache';

/**
 * 在树里递归找节点，返回引用（注意：调用方需要自己处理 immutability）
 */
function findNode(tree, path) {
  for (const node of tree) {
    if (node.path === path) return node;
    if (Array.isArray(node.children) && node.children.length) {
      const found = findNode(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 把 listing 结果合并到树的指定节点
 *
 * @param {TreeNode[]} tree 原始树（不可变更新）
 * @param {string} parentPath 要更新 children 的父路径；'/' 表示更新根层
 * @param {TreeNode[]} liveChildren listing 返回的直接子目录（含 count）
 * @returns {TreeNode[]} 新的树（深拷贝）
 */
function mergeChildren(tree, parentPath, liveChildren) {
  // 深拷贝（保持 immutability，避免 React 误判未变更）
  const cloned = JSON.parse(JSON.stringify(tree));

  if (parentPath === '/' || !parentPath) {
    // 根层合并：保留静态节点顺序，listing 中新出现的根追加
    const existingByPath = new Map(cloned.map((n) => [n.path, n]));
    for (const live of liveChildren) {
      const existing = existingByPath.get(live.path);
      if (existing) {
        // 已存在：合并 count，保留 origin（static 优先）；如果原本 children===null，
        // 不在这一步填子节点（懒加载 loadChildren 才负责）
        existing.count = Math.max(existing.count || 0, live.count || 0);
        existing.live = true;
      } else {
        cloned.push({
          ...live,
          loaded: false,
          loading: false,
          loadError: null,
        });
      }
    }
    return cloned;
  }

  // 非根层：找 parent，把它的 children 替换为合并结果
  const parent = findNode(cloned, parentPath);
  if (!parent) return cloned; // 找不到说明 parent 已不在树（race condition），丢弃

  // 已有 children（如静态预留的）保留并 merge；live 新出现的追加
  const existingChildren = Array.isArray(parent.children) ? parent.children : [];
  const byPath = new Map(existingChildren.map((n) => [n.path, n]));
  for (const live of liveChildren) {
    const existing = byPath.get(live.path);
    if (existing) {
      existing.count = Math.max(existing.count || 0, live.count || 0);
      existing.live = true;
    } else {
      byPath.set(live.path, {
        ...live,
        loaded: false,
        loading: false,
        loadError: null,
      });
    }
  }
  parent.children = Array.from(byPath.values());
  parent.loaded = true;
  parent.loading = false;
  parent.loadError = null;
  return cloned;
}

/**
 * 给某个节点打上 loading / loadError 标记（不可变更新）
 */
function patchNode(tree, path, patch) {
  const cloned = JSON.parse(JSON.stringify(tree));
  const node = findNode(cloned, path);
  if (node) Object.assign(node, patch);
  return cloned;
}

/**
 * useNucleusTree
 *
 * @param {string} server 当前选中的 Nucleus 服务器（来自 selectedBackend）
 * @returns {{
 *   tree: TreeNode[],
 *   status: 'idle'|'loading'|'ok'|'error',
 *   error: string|null,
 *   loadChildren: (path: string) => Promise<void>,
 *   refresh: () => Promise<void>,
 * }}
 */
export function useNucleusTree(server) {
  const [tree, setTree] = useState(() => cloneStaticPathTree());
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  // 用于取消上一次的拉取（server 切换 / refresh 时）
  const rootCtrlRef = useRef(null);
  const childCtrlsRef = useRef(new Map()); // path -> AbortController

  /**
   * 拉取顶层目录 listing 并合并
   */
  const loadRoot = useCallback(
    async ({ skipCache = false } = {}) => {
      // 取消上一次
      if (rootCtrlRef.current) rootCtrlRef.current.abort();
      const ctrl = new AbortController();
      rootCtrlRef.current = ctrl;

      setStatus('loading');
      setError(null);

      const result = await listFolder(server, '/', { skipCache, signal: ctrl.signal }).catch((err) => {
        if (err?.name === 'AbortError') return null; // 静默
        return err; // 标记失败，但不抛出
      });

      if (ctrl.signal.aborted) return;

      if (!result || result instanceof Error) {
        // 失败时保留静态树，UI 用 status='error' 展示横幅
        const msg = result instanceof Error ? result.message : 'listing failed';
        console.warn('[useNucleusTree] root listing failed:', msg);
        setStatus('error');
        setError(msg);
        return;
      }

      setTree((prev) => mergeChildren(prev, '/', result.children || []));
      setStatus('ok');
      setError(null);
    },
    [server]
  );

  /**
   * 拉取某个节点的直接子目录（懒加载）
   * 多次同时调用同一 path 会取消前一次
   */
  const loadChildren = useCallback(
    async (path) => {
      if (!path || path === '/') return loadRoot();

      // 取消前一次
      const prevCtrl = childCtrlsRef.current.get(path);
      if (prevCtrl) prevCtrl.abort();
      const ctrl = new AbortController();
      childCtrlsRef.current.set(path, ctrl);

      // 标记 loading
      setTree((prev) => patchNode(prev, path, { loading: true, loadError: null }));

      const result = await listFolder(server, path, { signal: ctrl.signal }).catch((err) => {
        if (err?.name === 'AbortError') return null;
        return err;
      });

      if (ctrl.signal.aborted) return;
      childCtrlsRef.current.delete(path);

      if (!result || result instanceof Error) {
        const msg = result instanceof Error ? result.message : 'listing failed';
        console.warn(`[useNucleusTree] children listing failed for ${path}:`, msg);
        setTree((prev) => patchNode(prev, path, { loading: false, loadError: msg }));
        return;
      }

      setTree((prev) => mergeChildren(prev, path, result.children || []));
    },
    [server, loadRoot]
  );

  /**
   * 用户主动刷新：清缓存 + 重新拉顶层 + 重置子节点 loaded 标记
   */
  const refresh = useCallback(async () => {
    cache.invalidate(server);
    setTree(cloneStaticPathTree()); // 重置为静态骨架
    await loadRoot({ skipCache: true });
  }, [server, loadRoot]);

  // 初次进入 / server 变化时自动拉顶层
  useEffect(() => {
    loadRoot();
    return () => {
      // 清理：取消所有飞行中请求
      if (rootCtrlRef.current) rootCtrlRef.current.abort();
      for (const ctrl of childCtrlsRef.current.values()) ctrl.abort();
      childCtrlsRef.current.clear();
    };
  }, [loadRoot]);

  // auth-updated 事件：重新拉顶层（cache 模块自己也监听并清缓存，这里只负责重拉）
  useEffect(() => {
    const onAuth = () => {
      // 重置静态骨架后再拉
      setTree(cloneStaticPathTree());
      loadRoot({ skipCache: true });
    };
    window.addEventListener('auth-updated', onAuth);
    return () => window.removeEventListener('auth-updated', onAuth);
  }, [loadRoot]);

  return { tree, status, error, loadChildren, refresh };
}

export default useNucleusTree;
