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
 *     `filter_by_tags` 等结构化过滤能力。
 *
 * [UX Polish R2] selectedTags 改为【纯客户端二次过滤】，不再拼进 q：
 *   - 以前：选"最近标签组合 #grass" → q=grass → 后端全文搜出"文件名含 grass"的 17 条
 *   - 现在：选 #grass → q 不变（committedQuery/searchQuery/categoryTag）→ 后端正常返回候选池 →
 *           前端在渲染前按 source.tags 过滤，只保留真正打过 grass tag 的那几个
 *   - 用户心智一致：tag 筛选器 = 客户端过滤器（类似 format/size 过滤），而非搜索词拼接
 *   - categoryTag 保留进 q（这是分类树语义，用户有明确心智）
 *
 * 未来（后端支持 filter_by_tags 后）：
 *   filter_by_tags 字段会被后端真正消费，届时把 selectedTags 重新放回此函数输出的
 *   filter_by_tags（目前本字段已经返回但没人用），同时把客户端过滤逻辑关掉。
 *
 * @param {object} input
 * @param {string}   [input.committedQuery=''] 已固化的搜索词（来自回车/点搜索）
 * @param {string}   [input.searchQuery='']    输入框当前未提交的实时文本
 * @param {string}   [input.categoryTag='']    来自左侧分类树的 tag（单选）
 * @param {string[]} [input.selectedTags=[]]   来自标签面板的用户手动标签（多选，仅客户端过滤用，不进 q）
 * @returns {{ q: string, filter_by_tags: string[] }}
 *          q             — 合并后的关键词字符串（不包含 selectedTags）
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

  // [TagFilterSearch] selectedTags 重新拼入 q，让后端通过 tags.tag 全文索引命中含该 tag 的资产。
  // 前端仍保留 tagFilteredResults 做二次 AND 验证，排除文件名误命中的噪音。
  // [TagDedup] 去重：如果 tag 名已经出现在 committedQuery/searchQuery/categoryTag 中，不再重复拼入，
  // 避免 "def def" 这样的重复词影响后端 scoring 导致结果变少。
  const baseParts = [committedQuery, searchQuery, cat]
    .map(s => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean);
  const baseWordsLower = baseParts.join(' ').toLowerCase().split(/\s+/).filter(Boolean);
  const dedupedTags = tags
    .map(s => (typeof s === 'string' ? s.trim() : ''))
    .filter(t => t && !baseWordsLower.includes(t.toLowerCase()));
  const parts = [...baseParts, ...dedupedTags].filter(Boolean);

  // filter_by_tags：分类 tag 置顶（若非空），其后是用户手动标签（保留原数组顺序与空值）
  const filter_by_tags = cat ? [cat, ...tags] : [...tags];

  return {
    q: parts.join(' '),
    filter_by_tags,
  };
}


