/**
 * searchWeightMap — Tag 匹配权重 Slider ↔ hybridConfig 双向映射
 *
 * 背景：
 *   - 默认 hybridConfig 中 tags.tag.weight=30 / tags.value.weight=18 / fuzzy_max_expansions=1
 *     这是 P5 修复的合理基线（tags 字段已 enabled=true，无需"恢复隐藏代码"）
 *   - C 组任务 3 要在 SearchSettingsPopover 提供一个 0..100 的 Slider，
 *     左端= "完全关闭 tag 匹配"，右端= "严格 tag 匹配"
 *   - 用户原话提到"可能涉及多个权重参数"——经实测确认涉及：
 *       • hybrid_text.fields[i='tags.tag'].enabled / weight / fuzzy_max_expansions
 *       • hybrid_text.fields[i='tags.value'].enabled / weight / fuzzy_max_expansions
 *
 * 实测验证（2026-05-14, query=`roof`，详见 .codebuddy/plan/group-c-.../CODE-RECON.md §四）：
 *   档位       tags.tag.enabled  tag.weight  value.weight  fuzzy_exp  Top1
 *   ─────────  ───────────────  ──────────  ────────────  ─────────  ────────────────────────
 *   0  关闭    false             (不传)      (不传)         1          Roof_Gap_4m (name 命中)
 *   50 默认    true              30          18             1          SM_WarehouseSet02Roof ⭐
 *   100 严格   true              100         60             50         SM_WarehouseSet02Roof ⭐
 *   ❌ 120     true              120         72             50         (后端 422: weight ≤ 100)
 *
 * 关键约束（来自实测）：
 *   - 后端硬约束：tags.tag.weight ≤ 100（POST /search_hybrid 422 拒收）
 *   - 不改 match_type：保持 fuzzy（改 exact 会让模糊命中如 SM_*Roof 落选）
 *   - tags.value.weight = tags.tag.weight × 0.6（保持默认配置等比 18/30 = 0.6）
 *   - Slider 0~50 段不改 weight，仅切 enabled——避免"低于默认"造成结果倒退
 *
 * 设计：本模块为纯函数，不持有状态，便于单元测试与 React 渲染期调用。
 */

/** 默认 tag 字段权重（与 HybridSearchConfig.jsx DEFAULT_HYBRID_CONFIG 对齐） */
export const DEFAULT_TAG_WEIGHT = 30;
export const DEFAULT_TAG_VALUE_WEIGHT = 18;

/** 后端硬约束 */
export const TAG_WEIGHT_BACKEND_MAX = 100;

/** tags.value 与 tags.tag 的权重比（保持默认配置 18/30 = 0.6） */
const TAG_VALUE_RATIO = 0.6;

/** 5 个锚点（Slider 值 → 后端字段配置）；其余 Slider 值通过 50→100 段线性插值得到。
 *  顺序按 Slider 值升序，便于 isTagConfigCustom 锚点匹配。 */
export const TAG_SLIDER_ANCHORS = [
  { slider: 0,   label: 'tagWeightOff',     enabled: false, tagWeight: DEFAULT_TAG_WEIGHT,        valueWeight: DEFAULT_TAG_VALUE_WEIGHT, fuzzy: 1 },
  { slider: 25,  label: 'tagWeightLoose',   enabled: true,  tagWeight: DEFAULT_TAG_WEIGHT,        valueWeight: DEFAULT_TAG_VALUE_WEIGHT, fuzzy: 1 },
  { slider: 50,  label: 'tagWeightDefault', enabled: true,  tagWeight: DEFAULT_TAG_WEIGHT,        valueWeight: DEFAULT_TAG_VALUE_WEIGHT, fuzzy: 1 },
  { slider: 75,  label: 'tagWeightTagFav',  enabled: true,  tagWeight: 65,                        valueWeight: 39,                       fuzzy: 10 },
  { slider: 100, label: 'tagWeightStrict',  enabled: true,  tagWeight: TAG_WEIGHT_BACKEND_MAX,    valueWeight: 60,                       fuzzy: 50 },
];

/**
 * 把 Slider 值（0..100）映射成 hybridConfig 的 tag 字段补丁，返回新的 hybridConfig。
 *
 * 分段语义：
 *   - slider === 0  → tags.tag/value.enabled = false（关闭整条 tag 通道）
 *   - 0 < slider ≤ 50 → 保持默认 weight=30/18，fuzzy_exp=1（仅 enable 切回 true）
 *   - 50 < slider ≤ 100 → weight 30→100, valueWeight 18→60, fuzzy 1→50 三者**线性插值**
 *
 * 不变量：返回的 hybridConfig 是新对象（浅拷贝至 hybrid_text.fields），原对象不被修改。
 *
 * @param {number} slider 0..100，越界自动夹紧
 * @param {object} baseConfig 原 hybridConfig（通常来自 HybridDeepSearchUI 的 hybridConfig state）
 * @returns {object} 新的 hybridConfig（不可变更新）；若 baseConfig 缺 hybrid_text.fields 则原样返回
 */
export function mapSliderToHybridConfig(slider, baseConfig) {
  const s = Math.max(0, Math.min(100, Number(slider) || 0));

  if (!baseConfig?.hybrid_text?.fields) return baseConfig;

  // slider === 0 → 关闭 tag
  if (s === 0) {
    return updateFields(baseConfig, [
      { field: 'tags.tag',   patch: { enabled: false } },
      { field: 'tags.value', patch: { enabled: false } },
    ]);
  }

  // 0 < slider ≤ 50 → 保持默认锚点
  if (s <= 50) {
    return updateFields(baseConfig, [
      { field: 'tags.tag',   patch: { enabled: true, weight: DEFAULT_TAG_WEIGHT,       fuzzy_max_expansions: 1 } },
      { field: 'tags.value', patch: { enabled: true, weight: DEFAULT_TAG_VALUE_WEIGHT, fuzzy_max_expansions: 1 } },
    ]);
  }

  // 50 < slider ≤ 100 → 线性插值
  const t = (s - 50) / 50; // 0..1
  const tagWeight = Math.min(TAG_WEIGHT_BACKEND_MAX, Math.round(DEFAULT_TAG_WEIGHT + t * 70));
  const valueWeight = Math.round(tagWeight * TAG_VALUE_RATIO);
  const fuzzyExp = Math.round(1 + t * 49); // 1..50

  return updateFields(baseConfig, [
    { field: 'tags.tag',   patch: { enabled: true, weight: tagWeight,   fuzzy_max_expansions: fuzzyExp } },
    { field: 'tags.value', patch: { enabled: true, weight: valueWeight, fuzzy_max_expansions: fuzzyExp } },
  ]);
}

/**
 * 反推：根据当前 hybridConfig 推断 Slider 应处的位置（用于反向同步：用户在
 * 高级混合搜索配置直接改了字段后，TagWeightSlider 也要跟着移动）。
 *
 * 反推规则（与 mapSliderToHybridConfig 对称）：
 *   - tags.tag 不存在            → 50（默认中位）
 *   - tags.tag.enabled === false → 0
 *   - weight=30, fuzzy=1         → 50（默认锚点）
 *   - weight=100, fuzzy=50       → 100
 *   - 其他值                     → 在 50..100 段按 weight 线性反推 / 在 0..50
 *                                  段返回 50（保守落点，是否标记 Custom 由调用方
 *                                  通过 isTagConfigCustom 判定）
 *
 * @param {object} config hybridConfig
 * @returns {number} Slider 0..100
 */
export function inferSliderFromConfig(config) {
  const f = config?.hybrid_text?.fields?.find((x) => x.field === 'tags.tag');
  if (!f) return 50;
  if (!f.enabled) return 0;

  const w = Math.max(DEFAULT_TAG_WEIGHT, Math.min(TAG_WEIGHT_BACKEND_MAX, f.weight ?? DEFAULT_TAG_WEIGHT));
  if (w === DEFAULT_TAG_WEIGHT) return 50;
  // 线性反推：weight 30→100 ↔ slider 50→100
  return 50 + Math.round(((w - DEFAULT_TAG_WEIGHT) / (TAG_WEIGHT_BACKEND_MAX - DEFAULT_TAG_WEIGHT)) * 50);
}

/**
 * 判断当前 hybridConfig 的 tag 字段配置是否处于"非锚点（Custom）"状态。
 *
 * 用于：
 *   - SearchSettingsPopover badge 提示"已自定义"
 *   - TagWeightSlider 旁边显示 Custom 副标题
 *
 * 判定标准：
 *   - tags.tag 字段不存在 → 非 Custom（视为默认）
 *   - enabled=false 且其他字段任意 → 非 Custom（锚点 0）
 *   - enabled=true 且 (weight, fuzzy) 命中锚点 25/50/75/100 之一 → 非 Custom
 *   - 其他情况 → Custom
 *
 * @param {object} config hybridConfig
 * @returns {boolean}
 */
export function isTagConfigCustom(config) {
  const f = config?.hybrid_text?.fields?.find((x) => x.field === 'tags.tag');
  if (!f) return false;
  if (!f.enabled) return false; // 锚点 0

  const fuzzy = f.fuzzy_max_expansions ?? 1;
  // 检查是否命中 enabled=true 的某个锚点
  return !TAG_SLIDER_ANCHORS.some(
    (a) => a.enabled && a.tagWeight === f.weight && a.fuzzy === fuzzy,
  );
}

// ---------------------------------------------------------------------------
// internal helper：不可变更新指定 field 的 patch
// ---------------------------------------------------------------------------
function updateFields(config, patches) {
  return {
    ...config,
    hybrid_text: {
      ...config.hybrid_text,
      fields: config.hybrid_text.fields.map((f) => {
        const p = patches.find((x) => x.field === f.field);
        return p ? { ...f, ...p.patch } : f;
      }),
    },
  };
}
