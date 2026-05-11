/**
 * 分类数据 — 来自 TestTag.xlsx
 *
 * 结构说明：
 *   - id: 用于 URL 参数 ?category=xxx
 *   - name: { en, zh } 双语
 *   - icon: SVG 图标名称（对应 components/icons/CategoryIcons.jsx 中的 key）
 *   - searchTag: 用于 filter_by_tags 后端过滤（选中分类后不填搜索框）
 *   - children: 二级分类数组
 *
 * 交互规则：
 *   点击分类 → URL 参数变化（?category=xxx）→ 后端 tag 过滤
 *   搜索框保持空白，不会出现分类文字（对齐 Fab 行为）
 *
 * @see docs/TestTag.xlsx
 * @date 2026-04-29
 */

export const CATEGORIES = [
  {
    id: 'all',
    name: { en: 'All Assets', zh: '所有产品' },
    icon: 'all',
    searchTag: '',
    children: [],
  },
  {
    id: 'building',
    name: { en: 'Building', zh: '建筑' },
    icon: 'building',
    searchTag: 'building',
    children: [
      {
        id: 'general-building',
        name: { en: 'General Building', zh: '通用建筑' },
        searchTag: 'general building',
        description: '民居，村落',
      },
      {
        id: 'landmark',
        name: { en: 'Landmark', zh: '地标' },
        searchTag: 'landmark',
        description: '喷泉，摩天轮，电线塔',
      },
    ],
  },
  {
    id: 'object',
    name: { en: 'Object', zh: '物件' },
    icon: 'object',
    searchTag: 'object',
    children: [
      {
        id: 'outdoor-object',
        name: { en: 'Outdoor Object', zh: '户外道具' },
        searchTag: 'outdoor object',
        description: '铁栅栏，木栅栏，电线杆，路牌',
      },
      {
        id: 'ornaments',
        name: { en: 'Ornaments', zh: '摆件' },
        searchTag: 'ornaments',
        description: '挂画，台灯，地毯',
      },
      {
        id: 'vehicles',
        name: { en: 'Vehicles', zh: '载具' },
        searchTag: 'vehicles',
      },
      {
        id: 'container',
        name: { en: 'Container', zh: '集装箱' },
        searchTag: 'container',
      },
      {
        id: 'box',
        name: { en: 'Box', zh: '箱子' },
        searchTag: 'box',
      },
      {
        id: 'furniture',
        name: { en: 'Furniture', zh: '家具' },
        searchTag: 'furniture',
      },
      {
        id: 'pipeline',
        name: { en: 'Pipeline', zh: '管道' },
        searchTag: 'pipeline',
      },
      {
        id: 'debris',
        name: { en: 'Debris', zh: '废弃物' },
        searchTag: 'debris',
      },
      {
        id: 'cloth',
        name: { en: 'Cloth', zh: '布料类' },
        searchTag: 'cloth',
        description: '窗帘、衣物、旗帜',
      },
      {
        id: 'cable',
        name: { en: 'Cable', zh: '电缆电线' },
        searchTag: 'cable',
      },
      {
        id: 'industrial-equipment',
        name: { en: 'Industrial Equipment', zh: '工业设备' },
        searchTag: 'industrial equipment',
        description: '机器、工具',
      },
      {
        id: 'branding',
        name: { en: 'Branding', zh: '海报/标识' },
        searchTag: 'branding',
      },
    ],
  },
  {
    id: 'vegetation',
    name: { en: 'Vegetation', zh: '植被' },
    icon: 'vegetation',
    searchTag: 'vegetation',
    children: [
      {
        id: 'grass',
        name: { en: 'Grass', zh: '草' },
        searchTag: 'grass',
      },
      {
        id: 'shrub',
        name: { en: 'Shrub', zh: '灌木' },
        searchTag: 'shrub',
      },
      {
        id: 'tree',
        name: { en: 'Tree', zh: '树' },
        searchTag: 'tree',
      },
      {
        id: 'vine',
        name: { en: 'Vine', zh: '藤蔓' },
        searchTag: 'vine',
      },
    ],
  },
  {
    id: 'nature',
    name: { en: 'Nature', zh: '自然' },
    icon: 'nature',
    searchTag: 'nature',
    children: [
      {
        id: 'gravel',
        name: { en: 'Gravel', zh: '小石子' },
        searchTag: 'gravel',
      },
      {
        id: 'rock',
        name: { en: 'Rock', zh: '石头' },
        searchTag: 'rock',
      },
      {
        id: 'cliff',
        name: { en: 'Cliff', zh: '崖壁' },
        searchTag: 'cliff',
      },
      {
        id: 'mountain',
        name: { en: 'Mountain', zh: '山' },
        searchTag: 'mountain',
      },
    ],
  },
  {
    id: 'road',
    name: { en: 'Road', zh: '道路' },
    icon: 'road',
    searchTag: 'road',
    children: [
      {
        id: 'motorway',
        name: { en: 'Motorway', zh: '公路' },
        searchTag: 'motorway',
      },
      {
        id: 'dirt-road',
        name: { en: 'Dirt Road', zh: '泥巴路' },
        searchTag: 'dirt road',
      },
      {
        id: 'roadbed',
        name: { en: 'Roadbed', zh: '路基' },
        searchTag: 'roadbed',
      },
    ],
  },
  {
    id: 'vision',
    name: { en: 'Vision', zh: '假地形/远景' },
    icon: 'vision',
    searchTag: 'vision',
    children: [
      {
        id: 'landscape',
        name: { en: 'Landscape', zh: '地形' },
        searchTag: 'landscape',
      },
      {
        id: 'advertising',
        name: { en: 'Advertising', zh: '广告牌' },
        searchTag: 'advertising',
      },
    ],
  },
];

/**
 * 扁平化工具 — 把树形结构展开为带 depth 的平铺数组
 * 用于 TreeView 渲染（对齐 Fab 的扁平化 DOM 结构）
 *
 * @param {Array} categories - CATEGORIES 数组
 * @param {Set} expandedIds - 当前展开的一级分类 ID 集合
 * @returns {Array<{ ...item, depth: number, hasChildren: boolean, parentId: string|null }>}
 */
export function flattenCategories(categories, expandedIds = new Set()) {
  const result = [];

  for (const cat of categories) {
    const hasChildren = cat.children && cat.children.length > 0;

    result.push({
      id: cat.id,
      name: cat.name,
      icon: cat.icon,
      searchTag: cat.searchTag,
      depth: 0,
      hasChildren,
      parentId: null,
    });

    if (hasChildren && expandedIds.has(cat.id)) {
      for (const child of cat.children) {
        const childHasChildren = child.children && child.children.length > 0;

        result.push({
          id: child.id,
          name: child.name,
          searchTag: child.searchTag,
          description: child.description,
          depth: 1,
          hasChildren: childHasChildren,
          parentId: cat.id,
        });

        // 支持三级（如果未来需要）
        if (childHasChildren && expandedIds.has(child.id)) {
          for (const grandchild of child.children) {
            result.push({
              id: grandchild.id,
              name: grandchild.name,
              searchTag: grandchild.searchTag,
              depth: 2,
              hasChildren: false,
              parentId: child.id,
            });
          }
        }
      }
    }
  }

  return result;
}

/**
 * 统计信息
 *
 * 一级分类：7 个（含"所有产品"）
 * 二级分类：29 个
 * 总计：36 个分类项
 */
