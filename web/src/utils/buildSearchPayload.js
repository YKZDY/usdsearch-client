/**
 * buildSearchPayload — 搜索请求反腐层 (Anti-Corruption Layer)
 *
 * 背景：
 *   - 前端 UI 把"搜索词"与"标签"与"分类"做成三条独立的用户输入：
 *       • searchQuery     — 顶部搜索框里当前尚未提交的实时文本
 *       • committedQuery  — 用户按回车/点搜索后固化的搜索词（大标题展示）
 *       • categoryTag     — 左侧产品类型树选中的分类对应的 tag（单选）
 *       • selectedTags[]  — 用户在标签面板手动添加/勾选的标签数组（多选）
 *     它们在 UI 上视觉互不联动，在数据层各管各、互不干扰。
 *   - 当前后端搜索接口只认一个 `hybrid_text_query` / `q` 字符串，尚未提供
 *     `filter_by_tags` 等结构化过滤能力，需要前端临时把多条条件合并发送。
 *   - 本函数负责把"前端语义"翻译为"当前后端能消费的形式"。
 *
 * 未来（后端支持 filter_by_tags 后）：
 *   q 只保留 committedQuery + searchQuery；categoryTag 与 selectedTags 单独作为
 *   filter_by_tags 传递。届时只改本函数，UI 层零改动。
 *
 * @param {object} input
 * @param {string}   [input.committedQuery=''] 已固化的搜索词（来自回车/点搜索）
 * @param {string}   [input.searchQuery='']    输入框当前未提交的实时文本
 * @param {string}   [input.categoryTag='']    来自左侧分类树的 tag（单选）
 * @param {string[]} [input.selectedTags=[]]   来自标签面板的用户手动标签（多选）
 * @returns {{ q: string, filter_by_tags: string[] }}
 *          q             — 合并后的关键词字符串（兼容当前只认 q 的后端）
 *          filter_by_tags — 结构化标签数组（未来后端就绪后直接可用）
 */
export default function buildSearchPayload({
  committedQuery = '',
  searchQuery = '',
  categoryTag = '',
  selectedTags = [],
} = {}) {
  const tags = Array.isArray(selectedTags) ? selectedTags : [];
  const cat = typeof categoryTag === 'string' ? categoryTag : '';

  // 过滤空值后拼接：顺序 = 已固化搜索词 + 当前实时文本 + 分类 tag + 手动标签。
  // 含空格的 tag/分类（如 "general building"）作为单个元素被原样保留，
  // join(' ') 后与用户手动在搜索框打 "general building" 行为等价。
  const parts = [committedQuery, searchQuery, cat, ...tags]
    .map(s => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean);

  // filter_by_tags：分类 tag 置顶（若非空），其后是用户手动标签（保留原数组顺序与空值）
  const filter_by_tags = cat ? [cat, ...tags] : [...tags];

  return {
    q: parts.join(' '),
    filter_by_tags,
  };
}

