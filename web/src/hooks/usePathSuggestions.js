import { useMemo } from 'react';
import { cloneStaticPathTree } from '../data/pathTree';

/**
 * usePathSuggestions
 *
 * 将搜索结果聚合的路径覆盖进静态目录树，得到"动态 + 兜底"的混合树。
 *
 * 行为：
 * - 扫描每条 hit 的 source.path（或 base_key），剥离 omniverse:// 前缀与文件名
 * - 按 / 分段累计 count
 * - 若该路径段不存在于静态树，则动态新增节点（标记 origin: 'live'）
 * - 若已存在，覆盖 count 为 max(static, live)，保证用户至少能看到当前批结果中真实的命中数
 *
 * @param {Array} hits 搜索结果数组（HybridDeepSearchUI 的 hits state）
 * @returns {{ tree, flatPaths }} 合并后的目录树 + 扁平路径列表
 */
export function usePathSuggestions(hits) {
  return useMemo(() => {
    const tree = cloneStaticPathTree();
    const liveCounts = new Map(); // path -> count

    // 1. 扫描结果聚合
    if (Array.isArray(hits)) {
      for (const hit of hits) {
        const raw = hit?.source?.path || hit?.source?.base_key || hit?.source?.url || '';
        if (!raw) continue;

        // 剥离协议头：omniverse:///Projects/Assets/foo.usd → /Projects/Assets/foo.usd
        let cleaned = String(raw).replace(/^[a-z]+:\/+/i, '/').replace(/\/+/g, '/');
        if (!cleaned.startsWith('/')) cleaned = '/' + cleaned;

        // 剥离文件名（最后一段如果带扩展名，视为文件）
        const lastSlash = cleaned.lastIndexOf('/');
        const tail = cleaned.slice(lastSlash + 1);
        if (tail.includes('.')) cleaned = cleaned.slice(0, lastSlash);
        if (!cleaned) continue;

        // 按段累加：/A/B/C → /A, /A/B, /A/B/C 各 +1
        const segs = cleaned.split('/').filter(Boolean);
        let cur = '';
        for (const seg of segs) {
          cur += '/' + seg;
          liveCounts.set(cur, (liveCounts.get(cur) || 0) + 1);
        }
      }
    }

    // 2. 把 liveCounts 合并进静态树
    const hasLiveData = liveCounts.size > 0;
    const visited = new Set();
    const merge = (nodes, parentPath = '') => {
      for (const node of nodes) {
        visited.add(node.path);
        const live = liveCounts.get(node.path);
        if (live != null) {
          // 有真实数据时直接替换（不取 max），让用户看到真实命中数
          node.count = live;
          node.live = true;
        } else if (hasLiveData) {
          // 有搜索结果但该节点没命中 → 清零，避免静态数字误导
          node.count = 0;
        }
        if (node.children?.length) merge(node.children, node.path);
      }
    };
    merge(tree);

    // 3. 把 liveCounts 中静态树没有的路径，动态插入
    for (const [path, count] of liveCounts) {
      if (visited.has(path)) continue;
      // 找到最近祖先节点
      const segs = path.split('/').filter(Boolean);
      let parentList = tree;
      let parentPath = '';
      for (let i = 0; i < segs.length; i++) {
        parentPath += '/' + segs[i];
        let node = parentList.find(n => n.path === parentPath);
        if (!node) {
          node = {
            name: segs[i],
            path: parentPath,
            count: 0,
            children: [],
            origin: 'live',
          };
          parentList.push(node);
        }
        if (parentPath === path) {
          node.count = Math.max(node.count || 0, count);
          node.live = true;
        }
        if (!node.children) node.children = [];
        parentList = node.children;
      }
    }

    // 4. 把空 children 数组清掉（保持叶子节点判定语义）
    const cleanup = (nodes) => {
      for (const node of nodes) {
        if (Array.isArray(node.children)) {
          if (node.children.length === 0) {
            delete node.children;
          } else {
            cleanup(node.children);
          }
        }
      }
    };
    cleanup(tree);

    // 5. 扁平路径（搜索框使用）
    const flatPaths = [];
    const collect = (nodes) => {
      for (const node of nodes) {
        flatPaths.push({ path: node.path, name: node.name, count: node.count || 0 });
        if (node.children?.length) collect(node.children);
      }
    };
    collect(tree);

    return { tree, flatPaths, hasLiveData };
  }, [hits]);
}

export default usePathSuggestions;
