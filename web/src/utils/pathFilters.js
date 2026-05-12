/**
 * pathFilters.js
 *
 * 路径噪声过滤的「单一真相源」。
 *
 * 背景（calvingu 2026-05 反馈）：
 *   Nucleus / 文件系统会出现一批"非用户内容"目录，例如：
 *     .system / .thumbs / .preview / .cache  —— 缩略图与索引缓存
 *     __BJsonServer / __pycache__            —— 内部服务/Python 缓存
 *     ._xxx  / .DS_Store                     —— macOS 隐藏元数据
 *   这些路径不应出现在路径树筛选面板里，对应的 hit 也不应进入"可见资产"统计，
 *   否则会出现"路径树显示 X 但卡片列表显示 Y"的不一致。
 *
 * 本模块导出两个谓词，前端三个数据入口（listing 反推、hits 聚合到树、可见结果列表）
 * **必须**复用同一份规则，确保：
 *   visibleResults.length === Σ pathTree[*].deepCount   （根级求和）
 *
 * 规则（"宽松版"，与 scripts/build-static-path-tree.mjs 的 isNoise 保持一致）：
 *   - 任意路径段以 "." 开头  → 噪声（覆盖 .system / .thumbs / .preview / .cache / .DS_Store）
 *   - 任意路径段以 "__" 开头 → 噪声（覆盖 __BJsonServer / __pycache__）
 *
 * 路径段：以 "/" 切分后非空的部分。
 *
 * 示例：
 *   isNoiseSegment('.thumbs')              === true
 *   isNoiseSegment('__pycache__')          === true
 *   isNoiseSegment('Library')              === false
 *   isNoisePath('/Library/.thumbs/256x')   === true
 *   isNoisePath('/Library/Test/foo.usd')   === false
 *   isNoisePath('/__BJsonServer/log')      === true
 */

/**
 * 单段名称是否为噪声段（".xxx" 或 "__xxx"）。
 * @param {string} seg 单段路径名（不含 "/"）
 * @returns {boolean}
 */
export function isNoiseSegment(seg) {
  if (typeof seg !== 'string' || seg.length === 0) return false;
  if (seg[0] === '.') return true;
  if (seg.length >= 2 && seg[0] === '_' && seg[1] === '_') return true;
  return false;
}

/**
 * 完整路径中是否包含任何噪声段。
 *
 * 接受形式：
 *   - 绝对路径："/Library/.thumbs/foo"
 *   - 相对路径："Library/.thumbs/foo"
 *   - 带协议头："omniverse:///Library/.thumbs/foo"  → 自动剥离
 *
 * 仅基于路径段判断，不区分文件名/目录名（"foo/.bar.txt" 视为噪声，因为段 ".bar.txt" 以 . 开头）。
 *
 * @param {string} path 完整路径
 * @returns {boolean}
 */
export function isNoisePath(path) {
  if (typeof path !== 'string' || path.length === 0) return false;
  // 剥协议头：omniverse:///x → /x；file:///x → /x
  let cleaned = path.replace(/^[a-z]+:\/+/i, '/');
  // 折叠 //
  cleaned = cleaned.replace(/\/+/g, '/');
  const segs = cleaned.split('/');
  for (const s of segs) {
    if (isNoiseSegment(s)) return true;
  }
  return false;
}

export default { isNoiseSegment, isNoisePath };
