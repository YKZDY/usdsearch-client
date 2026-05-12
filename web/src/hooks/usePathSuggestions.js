import { useMemo } from 'react';
import { cloneStaticPathTree } from '../data/pathTree';

/**
 * usePathSuggestions
 *
 * 将搜索结果聚合的路径覆盖进目录树（静态快照 或 useNucleusTree 提供的 liveTree），
 * 得到"动态 + 兜底"的混合树，并预计算 deepCount（含子目录的命中总数）。
 *
 * 行为：
 * - 扫描每条 hit 的 source.path（或 base_key / url），剥离 omniverse:// 前缀与文件名
 * - 按 / 分段累计 count
 * - 若该路径段不存在于骨架，则动态新增节点（标记 origin: 'live'）
 * - 若已存在，覆盖 count 为真实命中数
 * - 单次 DFS 计算 deepCount = 自身 count + 所有子节点 deepCount
 *
 * @param {Array} hits 搜索结果数组（HybridDeepSearchUI 的 hits state）
 * @param {object} [opts]
 * @param {Array<TreeNode>} [opts.liveTree] 来自 useNucleusTree 的真实目录骨架；不传则用静态快照
 * @returns {{ tree, flatPaths, hasLiveData }} 合并后的目录树（含 deepCount） + 扁平路径列表
 */
export function usePathSuggestions(hits, opts = {}) {
  const { liveTree } = opts || {};

  return useMemo(() => {
    // 选择骨架：优先 liveTree（来自 useNucleusTree），否则静态快照
    const tree = Array.isArray(liveTree) && liveTree.length > 0
      ? JSON.parse(JSON.stringify(liveTree))
      : cloneStaticPathTree();

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

    // 2. 把 liveCounts 合并进骨架
    //    ⚠️ 使用独立字段 `hasMatch` 而不是 `live` —— `live` 已被 useNucleusTree
    //    占用表示「该节点来自真实 listing」（与搜索结果无关）。两者语义不同，
    //    若复用同一字段会导致目录骨架节点（如 /Projects、/Users）即使无任何搜索
    //    命中也被误判为「含有搜索数据」并亮黄点。
    //
    //    ⚠️ count 处理策略：节点上的 count 字段**统一**反映"当前可见 hits 在该
    //    路径下的命中数"。未命中的节点强制清零（包括从 listing 继承来的 count）。
    //    这样保证：
    //      - 路径树徽章数字 = 顶部"共 N 个资产"在该路径下的细分
    //      - 用户从不会看到「徽章 3 但顶部 0」这种矛盾
    //    代价：用户从未搜索时，徽章不显示 listing 的"该目录共 X 资产"。
    //          可以接受 — 数值一致性比 listing 估算数字更重要。
    const visited = new Set();
    const merge = (nodes) => {
      for (const node of nodes) {
        visited.add(node.path);
        const live = liveCounts.get(node.path);
        if (live != null) {
          node.count = live;
          node.hasMatch = true;
        } else {
          // 未命中 → 统一清零 + 清搜索命中标记
          node.count = 0;
          node.hasMatch = false;
        }
        if (Array.isArray(node.children) && node.children.length) merge(node.children);
      }
    };
    merge(tree);

    const hasLiveData = liveCounts.size > 0;

    // 3. 把 liveCounts 中骨架没有的路径，动态插入
    for (const [path, count] of liveCounts) {
      if (visited.has(path)) continue;
      // 找到最近祖先节点
      const segs = path.split('/').filter(Boolean);
      let parentList = tree;
      let parentPath = '';
      for (let i = 0; i < segs.length; i++) {
        parentPath += '/' + segs[i];
        let node = parentList.find((n) => n.path === parentPath);
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
          node.hasMatch = true;
        }
        if (!Array.isArray(node.children)) node.children = [];
        parentList = node.children;
      }
    }

    // 4. 把空 children 数组清掉（保持叶子节点判定语义）
    //    但是 children: null（懒加载占位）必须保留 —— 不要误删
    const cleanup = (nodes) => {
      for (const node of nodes) {
        if (Array.isArray(node.children)) {
          if (node.children.length === 0) {
            // 区分"懒加载占位"（不存在 children 字段或 null）vs "已加载为空"（[]）：
            // 这里 node.children 是空数组说明已经被聚合逻辑碰过 → 视为叶子，删除字段
            delete node.children;
          } else {
            cleanup(node.children);
          }
        }
      }
    };
    cleanup(tree);

    // 5. 单次 DFS 计算 deepCount = self.count + Σ child.deepCount
    const computeDeep = (nodes) => {
      let total = 0;
      for (const node of nodes) {
        const childTotal = Array.isArray(node.children) && node.children.length
          ? computeDeep(node.children)
          : 0;
        node.deepCount = (node.count || 0) + childTotal;
        // 注意：deepCount 包含自身 count；穿透 popover UI 显示时会拆成「直接 + 子目录」
        total += node.deepCount;
      }
      return total;
    };
    computeDeep(tree);

    // 6. 扁平路径（搜索框使用）
    const flatPaths = [];
    const collect = (nodes) => {
      for (const node of nodes) {
        flatPaths.push({
          path: node.path,
          name: node.name,
          count: node.count || 0,
          deepCount: node.deepCount || 0,
        });
        if (Array.isArray(node.children) && node.children.length) collect(node.children);
      }
    };
    collect(tree);

    return { tree, flatPaths, hasLiveData };
  }, [hits, liveTree]);
}

export default usePathSuggestions;
