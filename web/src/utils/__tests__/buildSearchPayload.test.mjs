/**
 * buildSearchPayload 关键场景断言（可独立运行，不依赖测试框架）
 *
 * 运行：  node src/utils/__tests__/buildSearchPayload.test.mjs
 * 或在浏览器控制台粘贴本文件内容（去掉 import）后执行 runAll()。
 *
 * 覆盖验收标准：
 *   1. 空输入返回空 q / 空 tags
 *   2. 单标签（含空格，如 "general building"）**不被切分**——核心回归保护
 *   3. 多标签按顺序 join
 *   4. committedQuery + searchQuery + selectedTags 叠加拼装顺序正确
 *   5. 非字符串 / undefined / null 安全处理
 */
import buildSearchPayload from '../buildSearchPayload.js';

const cases = [
  {
    name: '[空] 全空输入返回空 q + 空 tags',
    input: {},
    expect: { q: '', filter_by_tags: [] },
  },
  {
    name: '[关键回归] 含空格标签 "general building" 不被切分',
    input: { selectedTags: ['general building'] },
    expect: { q: 'general building', filter_by_tags: ['general building'] },
  },
  {
    name: '[关键回归] 多个含空格标签 + 普通标签混合',
    input: { selectedTags: ['general building', 'industrial equipment', 'SM_Table'] },
    expect: {
      q: 'general building industrial equipment SM_Table',
      filter_by_tags: ['general building', 'industrial equipment', 'SM_Table'],
    },
  },
  {
    name: '[叠加] committedQuery + 标签拼装顺序',
    input: { committedQuery: 'chair', selectedTags: ['wooden', 'general building'] },
    expect: {
      q: 'chair wooden general building',
      filter_by_tags: ['wooden', 'general building'],
    },
  },
  {
    name: '[叠加] committedQuery + searchQuery(还没提交) + 标签',
    input: {
      committedQuery: 'chair',
      searchQuery: 'warehouse',
      selectedTags: ['wooden'],
    },
    expect: {
      q: 'chair warehouse wooden',
      filter_by_tags: ['wooden'],
    },
  },
  {
    name: '[健壮性] 非数组 selectedTags 视为空数组',
    input: { committedQuery: 'foo', selectedTags: 'not-array' },
    expect: { q: 'foo', filter_by_tags: [] },
  },
  {
    name: '[健壮性] 含空白元素被 trim + 过滤',
    input: {
      committedQuery: '  ',
      searchQuery: 'bar',
      selectedTags: ['', '  ', 'metal'],
    },
    // 注：空字符串和纯空白标签被 filter 掉，但保留在 filter_by_tags 原数组（反腐层不改原输入）——
    // 此时 filter_by_tags 由调用方决定是否 sanitize，本函数只保证 q 干净。
    expect: {
      q: 'bar metal',
      filter_by_tags: ['', '  ', 'metal'],
    },
  },
  // === v2: categoryTag 独立来源（来自左侧分类树，单选） ===
  {
    name: '[分类] 仅 categoryTag 被合并进 q 与 filter_by_tags',
    input: { categoryTag: 'general building' },
    expect: {
      q: 'general building',
      filter_by_tags: ['general building'],
    },
  },
  {
    name: '[分类] categoryTag + committedQuery + selectedTags 顺序：committed → query → category → tags',
    input: {
      committedQuery: 'SM_Table',
      categoryTag: 'general building',
      selectedTags: ['wooden'],
    },
    expect: {
      q: 'SM_Table general building wooden',
      filter_by_tags: ['general building', 'wooden'],
    },
  },
  {
    name: '[分类-回归] 含空格分类（"general building"）不被切分，且与含空格 tag 共存',
    input: {
      categoryTag: 'general building',
      selectedTags: ['industrial equipment', 'metal'],
    },
    expect: {
      q: 'general building industrial equipment metal',
      filter_by_tags: ['general building', 'industrial equipment', 'metal'],
    },
  },
];

function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object' && a && b) {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    return ak.every(k => deepEqual(a[k], b[k]));
  }
  return false;
}

export function runAll() {
  const results = [];
  for (const c of cases) {
    const actual = buildSearchPayload(c.input);
    const ok = deepEqual(actual, c.expect);
    results.push({ name: c.name, ok, actual, expect: c.expect });
    const tag = ok ? 'PASS' : 'FAIL';
    // eslint-disable-next-line no-console
    console.log(`[${tag}] ${c.name}`);
    if (!ok) {
      // eslint-disable-next-line no-console
      console.log('  expected:', c.expect);
      // eslint-disable-next-line no-console
      console.log('  actual:  ', actual);
    }
  }
  const failed = results.filter(r => !r.ok).length;
  // eslint-disable-next-line no-console
  console.log(`\n${results.length - failed}/${results.length} passed`);
  return failed === 0;
}

// ESM 主模块直接运行（node）
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('buildSearchPayload.test.mjs')) {
  const ok = runAll();
  process.exit(ok ? 0 : 1);
}
