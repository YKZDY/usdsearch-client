/**
 * 过采样系数计算 — 确保客户端过滤后仍有足够结果
 *
 * 损耗来源：
 *   1. 后端召回不足：实测后端在浏览模式下平均只返回请求 limit 的 50% 左右
 *      （可能是 OpenSearch 内部 dedup / collapse / 评分截断；前端无法干预，只能补偿）
 *   2. 客户端 thumbnail 过滤：当 showOnlyWithPreviews=true 时约 20-35% 损耗
 *   3. 客户端扩展名过滤：file_extension_exclude 每项约 5% 损耗
 *
 * 因此 factor = BACKEND_RECALL_COMPENSATION × CLIENT_FILTER_LOSS
 *   - BACKEND_RECALL_COMPENSATION：保底 2.0，补偿后端只给一半
 *   - CLIENT_FILTER_LOSS：1.0 ~ 1.5（thumbnail 1.5×；exclude 每项 1.05×，上限 1.4×）
 *
 * 即使没有任何客户端过滤，factor 也至少是 2.0，确保 userLimit=50 时
 * apiLimit≈102，后端给 ~51 条 → 客户端截断到 50 → 不再"少 1"。
 *
 * ─── [calvingu 2026-05-14 Round4] 浏览模式专用大 limit ────────────────────
 *
 * Playwright MCP 实测后端 `/search_hybrid` 在浏览模式（空 query）行为如下：
 *
 *   | limit | total | hits | 命中率 |
 *   |-------|-------|------|--------|
 *   |  50   | 300   |  47  | 0.94   |
 *   | 100   | 600   |  47  | 0.47   |
 *   | 150   | 900   |  48  | 0.32   |
 *   | 152   | 912   |  48  | 0.32   | <- 旧默认（factor=3 + userLimit=50）
 *   | 200   | 1200  | 161  | 0.81   | <- 后端阈值跳变
 *   | 500   | 3000  | 265  | 0.53   |
 *   | 1000  | 5442  | 533  | 0.53   |
 *   | 2000  | 5442  | 879  | 0.44   | <- 真实库匹配总数 879，封顶
 *   | 5000  | 5442  | 879  | 0.18   |
 *
 * 结论：
 *   1. 后端在 limit ≤ 152 时只返回 47-48 条（命中率 31%），所以 userLimit=50
 *      时即使过采样 factor=3.0 也凑不齐 50 条 → 用户看到 47-48 条波动。
 *   2. limit ≥ 2000 时后端稳定返回 879 条（真实总匹配数），再大无收益。
 *   3. 「加 tag 后资产消失」是上述召回率不稳定的统计假象（每次刷新 47/48/49
 *      之间小波动），不是客户端 bug。
 *
 * 因此浏览模式直接用大 limit 单次拉取（不走 factor 计算）：
 *   apiLimit = clamp(userLimit × 12, 800, 2000)
 *   - 12× 系数让 userLimit=50/100/200 都覆盖到 ≥ 600
 *   - 下限 800 兜底（避免 userLimit 太小时也拉太少）
 *   - 上限 2000（实测 2000 起就拿到全集，再大无收益还增加响应体积）
 *
 * 搜索模式（有 query 或 image）召回率高（70-90%），保持原 factor 逻辑不变。
 */

// 后端召回补偿：实测纯浏览模式 hits/limit ≈ 0.5（49/100, 533/940, 457/902）
// → 把请求量翻倍才能拿到 userLimit 想要的数量
const BACKEND_RECALL_COMPENSATION = 2.0;

// 总上限：避免请求过大（后端 limit 字段无文档化上限，但保守在 10000）
const FACTOR_CAP = 3.0;

// [Round4] 浏览模式专用常量：单次大 limit 一次拉够，避免「打 tag 后假性消失」
const BROWSE_MODE_FACTOR = 12;   // userLimit 的倍率
const BROWSE_MODE_MIN = 800;     // 下限：兜底，避免 userLimit 极小时也拉太少
const BROWSE_MODE_CAP = 2000;    // 上限：实测 limit≥2000 后端就给到全集 879，再大无收益

/**
 * @param {Object} options
 * @param {boolean} options.showOnlyWithPreviews - 是否开启"仅含预览"过滤（thumbnail）
 * @param {string} options.fileExtensionExclude - 逗号分隔的客户端排除扩展名
 * @returns {number} 过采样系数 (BACKEND_RECALL_COMPENSATION ~ FACTOR_CAP)
 */
export function getOversampleFactor({ showOnlyWithPreviews = false, fileExtensionExclude = '' } = {}) {
  // 客户端过滤损耗倍数（独立计算，不掺杂后端补偿）
  let clientLoss = 1.0;

  // 缩略图过滤：观测约 20-35% 结果无缩略图
  if (showOnlyWithPreviews) {
    clientLoss *= 1.5;
  }

  // 扩展名排除：每种格式约增加 5% 损耗，上限 40%
  if (fileExtensionExclude && fileExtensionExclude.trim()) {
    const extCount = fileExtensionExclude.split(',').map(s => s.trim()).filter(Boolean).length;
    clientLoss *= 1 + Math.min(extCount * 0.05, 0.4);
  }

  // 最终系数 = 后端召回补偿 × 客户端过滤损耗
  // 即使 clientLoss === 1.0（无任何客户端过滤），factor 也至少是 BACKEND_RECALL_COMPENSATION (2.0)
  const factor = BACKEND_RECALL_COMPENSATION * clientLoss;

  return Math.min(factor, FACTOR_CAP);
}

/**
 * 计算实际发送给 API 的 limit 值
 *
 * @param {number} userLimit - 用户设定的每页结果数
 * @param {Object} filterOptions - 当前过滤设置（传给 getOversampleFactor）
 * @param {Object} [opts] - 可选参数
 * @param {boolean} [opts.isBrowseMode=false] - 是否浏览模式（空 query + 空 image）。
 *   浏览模式直接用大 limit 单次拉取（实测后端在该模式下命中率仅 31%，必须大 limit 才能凑满）。
 * @returns {number} 实际 API limit（上限 10000）
 *
 * 自适应降级：当 userLimit 较大（≥500）时，前端列表渲染压力变大，
 * 适度降低 factor 上限，平衡"凑齐用户期望"与"渲染压力"。
 * 即使降级后仍至少 2.0×（保证后端 50% 召回率下勉强凑齐 userLimit）。
 */
export function getApiLimit(userLimit, filterOptions, opts = {}) {
  // [Round4] 浏览模式 short-circuit：直接返回 clamp(userLimit*12, 800, 2000)
  // 不走 factor 计算，因为后端在浏览模式下命中率不稳定（31% ~ 81%），
  // factor 算出来的小 limit（如 152）会让用户看到 47-50 条波动 + 「加 tag 后假性消失」。
  if (opts && opts.isBrowseMode) {
    return Math.min(
      Math.max(Math.ceil(userLimit) * BROWSE_MODE_FACTOR, BROWSE_MODE_MIN),
      BROWSE_MODE_CAP
    );
  }

  // 搜索模式：保持原过采样逻辑
  let factor = getOversampleFactor(filterOptions);
  // 自适应降级：大 limit 时降低过采样上限。
  //   userLimit ≥ 1000 时上限 2.2（apiLimit ≤ 2202，可控）
  //   userLimit ≥ 500  时上限 2.5（apiLimit ≤ 1252）
  // 仍保持 ≥ 2.0 的"后端召回补偿"保底，避免凑不齐。
  if (userLimit >= 1000) {
    factor = Math.min(factor, 2.2);
  } else if (userLimit >= 500) {
    factor = Math.min(factor, 2.5);
  }
  // +2 安全边际：后端偶尔返回比期望少 1-2 条，
  // 额外多请求 2 条确保客户端截断后能满足用户期望
  return Math.min(Math.ceil(userLimit * factor) + 2, 10000);
}
