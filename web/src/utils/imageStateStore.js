/**
 * 全局图片状态存储
 *
 * 用于在 NavigableAssetImage 和 handleFindSimilar 之间可靠地传递当前展示的预览图状态。
 * 完全绕过 React 组件树（ref/callback/useEffect）的状态传递问题，
 * 不受 React.memo、虚拟列表卸载/重挂载、闭包捕获等影响。
 *
 * 写入方：NavigableAssetImage（每次 offset/imageData 变化时同步写入）
 * 读取方：handleFindSimilar（点击时同步读取最新状态）
 */

// === LM CUSTOMIZATION: ImageStateStore START ===
// 原因：React ref/callback 在虚拟列表 + React.memo 环境下不可靠，
//       经过 6+ 次尝试均失败，改用模块级全局 Map 作为终极方案。
// 合入英伟达新版时：保留本文件（NVIDIA 原版无此功能，零冲突风险）

/**
 * 模块级 Map 存储
 * key: assetUrl (string)
 * value: { currentOffset: number, imageData: string|null, lastUpdated: number }
 */
const imageStateMap = new Map();

/**
 * 写入/更新某个资产的当前预览图状态
 *
 * @param {string} assetUrl - 资产 URL（唯一标识）
 * @param {number} offset - 当前展示的 img_offset
 * @param {string|null} imageData - 当前展示的图片 data URL（base64）
 */
export function setImageState(assetUrl, offset, imageData) {
  if (!assetUrl) return;
  imageStateMap.set(assetUrl, {
    currentOffset: offset,
    imageData,
    lastUpdated: Date.now(),
  });
}

/**
 * 读取某个资产的当前预览图状态
 *
 * @param {string} assetUrl - 资产 URL（唯一标识）
 * @returns {{ currentOffset: number, imageData: string|null, lastUpdated: number } | null}
 */
export function getImageState(assetUrl) {
  if (!assetUrl) return null;
  return imageStateMap.get(assetUrl) || null;
}

/**
 * 清除某个资产的状态（可选，用于组件卸载时防止内存泄漏）
 *
 * @param {string} assetUrl - 资产 URL
 */
export function clearImageState(assetUrl) {
  if (!assetUrl) return;
  imageStateMap.delete(assetUrl);
}

// === LM CUSTOMIZATION: ImageStateStore END ===
