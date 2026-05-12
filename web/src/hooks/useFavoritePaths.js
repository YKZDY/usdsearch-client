/**
 * useFavoritePaths - 路径收藏夹 hook
 *
 * 功能：
 * - 用户右键节点 → 收藏 / 取消收藏
 * - 收藏区在 PathTreeBrowser 顶部 sticky 展示，最多 6 条
 * - 按 server 隔离持久化（不同 Nucleus 服务器收藏不互通）
 * - 跨标签同步（监听 storage 事件）
 *
 * 存储格式：
 *   localStorage key: `${server}_path_favorites`
 *   value: JSON Array<string>  // 路径字符串数组，最新收藏在最前
 *
 * 设计取舍：
 * - 不与 useFilterMemory('path') 共用：useFilterMemory 记的是"完整 includes/excludes 组合"，
 *   收藏夹记的是"单个路径"，语义不同；并且收藏要能跨 server 隔离，FilterMemory 不带 server
 * - 上限 12（UI 展示前 6，更多走横向滚动），避免无界增长
 * - 删除采用值匹配（不依赖 index），跨标签同步后仍可用
 */

import { useCallback, useEffect, useState } from 'react';

const FAVORITES_LIMIT = 12;

function buildKey(server) {
  // 与 authStorage.getServerStorageKey 保持一致的命名约定
  return server ? `${server}_path_favorites` : 'path_favorites';
}

function readFavorites(server) {
  try {
    const raw = localStorage.getItem(buildKey(server));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function writeFavorites(server, list) {
  try {
    localStorage.setItem(buildKey(server), JSON.stringify(list));
  } catch (e) {
    // 配额超限静默忽略
  }
}

/**
 * @param {string} server 当前选中的 Nucleus 服务器（来自 selectedBackend）
 * @returns {{
 *   favorites: string[],
 *   isFavorite: (path: string) => boolean,
 *   add: (path: string) => void,
 *   remove: (path: string) => void,
 *   toggle: (path: string) => boolean,  // 返回切换后的状态
 *   clear: () => void,
 * }}
 */
export function useFavoritePaths(server) {
  const [favorites, setFavorites] = useState(() => readFavorites(server));

  // server 切换时重新读
  useEffect(() => {
    setFavorites(readFavorites(server));
  }, [server]);

  // 跨标签同步
  useEffect(() => {
    const onStorage = (e) => {
      if (!e.key) return;
      if (e.key === buildKey(server)) {
        setFavorites(readFavorites(server));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [server]);

  const isFavorite = useCallback(
    (path) => favorites.includes(path),
    [favorites]
  );

  const add = useCallback(
    (path) => {
      if (!path || typeof path !== 'string') return;
      setFavorites((prev) => {
        if (prev.includes(path)) return prev; // 去重
        const next = [path, ...prev].slice(0, FAVORITES_LIMIT);
        writeFavorites(server, next);
        return next;
      });
    },
    [server]
  );

  const remove = useCallback(
    (path) => {
      setFavorites((prev) => {
        if (!prev.includes(path)) return prev;
        const next = prev.filter((p) => p !== path);
        writeFavorites(server, next);
        return next;
      });
    },
    [server]
  );

  const toggle = useCallback(
    (path) => {
      const willBeFavorite = !favorites.includes(path);
      if (willBeFavorite) add(path);
      else remove(path);
      return willBeFavorite;
    },
    [favorites, add, remove]
  );

  const clear = useCallback(() => {
    setFavorites([]);
    writeFavorites(server, []);
  }, [server]);

  return { favorites, isFavorite, add, remove, toggle, clear };
}

export default useFavoritePaths;
