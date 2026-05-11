/**
 * Static path tree snapshot — fallback when no live data is available.
 *
 * 数据来源：
 * - 通过 mock 数据 (setupProxy.mock.js) 与日常搜索观测的真实 Nucleus 路径整理
 * - 节点 children 数为 null 表示「叶子或未加载」，懒加载场景下可由聚合数据补全
 *
 * 节点格式：
 *   {
 *     name: 'Projects',          // 该层级路径段名称
 *     path: '/Projects',         // 完整路径（含前导 /）
 *     count: 1240,               // 静态估计资产数量（用作 hint，非精确）
 *     children: [...]            // 子节点；若不存在则视为叶子
 *   }
 *
 * 设计取舍：
 * - 后续接入真实 listing API 时，只需把这份数据替换为 fetch 结果即可，组件无需改动
 * - count 字段会被 usePathSuggestions hook 在搜索结果回流时实时覆盖
 */

// 注意：count 字段为静态估计值，仅在无搜索结果时作为参考提示。
// 搜索后 usePathSuggestions 会用真实聚合数替换这些数字。
const STATIC_PATH_TREE = [
  {
    name: 'Library',
    path: '/Library',
    count: 0, // 搜索后由聚合数据填充
    children: [
      {
        name: 'Test',
        path: '/Library/Test',
        count: 0,
        children: [
          {
            name: 'Assets',
            path: '/Library/Test/Assets',
            count: 0,
            children: [
              { name: 'RuralCabin', path: '/Library/Test/Assets/RuralCabin', count: 0 },
              { name: 'test', path: '/Library/Test/Assets/test', count: 0 },
              { name: 'Props', path: '/Library/Test/Assets/Props', count: 0 },
              { name: 'Environment', path: '/Library/Test/Assets/Environment', count: 0 },
              { name: 'Industrial', path: '/Library/Test/Assets/Industrial', count: 0 },
              { name: 'Urban', path: '/Library/Test/Assets/Urban', count: 0 },
            ],
          },
        ],
      },
    ],
  },
  {
    name: 'Users',
    path: '/Users',
    count: 0,
    children: [
      { name: 'bailetang', path: '/Users/bailetang', count: 0 },
      { name: 'lloydlu', path: '/Users/lloydlu', count: 0 },
      { name: 'peipeizhou', path: '/Users/peipeizhou', count: 0 },
      { name: 'maoyuwen', path: '/Users/maoyuwen', count: 0 },
    ],
  },
];

/**
 * 深拷贝一份静态树（避免 hook 修改原对象）
 */
export function cloneStaticPathTree() {
  return JSON.parse(JSON.stringify(STATIC_PATH_TREE));
}

/**
 * 扁平化所有节点路径（用于搜索过滤）
 */
export function flattenPathNodes(tree = STATIC_PATH_TREE, acc = []) {
  for (const node of tree) {
    acc.push(node);
    if (node.children?.length) flattenPathNodes(node.children, acc);
  }
  return acc;
}

export default STATIC_PATH_TREE;
