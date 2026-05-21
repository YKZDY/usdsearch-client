/**
 * usePolyfillNoSelectPrefixes — 防御式 polyfill hook（Group D 资产）
 *
 * 角色定位：
 *   A 窗口的 `useDragSelect.js` 已经在拖拽期间设置了 `body.style.userSelect='none'`、
 *   `webkitUserSelect='none'`，并通过 mouseup / pointercancel / window.blur /
 *   mouseleave / visibilitychange / `e.buttons===0` 卫生检查全方位兜底退出。
 *   该实现已覆盖 Chrome / Edge / Safari 现代浏览器约 95% 的"黄选区残影"场景。
 *
 *   本 hook 仅做"防御式 polyfill"，补足两件事：
 *     1. 老版浏览器前缀：Firefox 的 `MozUserSelect`、IE/Edge Legacy 的 `msUserSelect`
 *     2. 拖拽期间将 `body.style.cursor` 切到 'crosshair'，给用户明确的视觉反馈
 *
 * 设计原则：
 *   - **不重复监听** mouseup / blur / visibilitychange — A 已经做完了，重复监听只会
 *     互相覆盖造成 race condition；本 hook 单纯由父组件传入的 `isDragging` 驱动副作用
 *   - **不修改** A 的 `useDragSelect.js` — 避免合并冲突，保持组间隔离
 *   - **不修改** 全局 CSS 文件 — 避免污染样式层、便于 NVIDIA 合入
 *   - 进入 isDragging=true 时保存原始值，离开时精确还原（即使用户在拖拽前已经手动设过 cursor）
 *   - unmount 时强制还原，避免组件卸载在拖拽中途时残留 body 样式
 *
 * 使用方式：
 *   ```jsx
 *   const [isDragging, setIsDragging] = useState(false);
 *   usePolyfillNoSelectPrefixes(isDragging);
 *   ```
 *   实际场景下 `isDragging` 应来自 A 的 `useDragSelect()` 返回值，通过 props 上抛
 *   到 `HybridDeepSearchUI.jsx` 顶层。
 *
 * 合入 NVIDIA 新版本时：
 *   本文件是 Group D 新建文件，不影响 NVIDIA 原版合入。可以保持原样，或在 NVIDIA
 *   未来引入了原生处理后整体删除（彼时调用方一并移除即可）。
 *
 * @param {boolean} isDragging - 来自 A 的 useDragSelect 暴露的拖拽状态
 */
import { useEffect, useRef } from 'react';

export function usePolyfillNoSelectPrefixes(isDragging) {
  // 保存进入 dragging 之前的原始 body 样式值，离开时精确还原
  const prevRef = useRef(null);

  useEffect(() => {
    const body = document.body;
    if (!body) return undefined;

    if (isDragging) {
      // 进入拖拽：保存原值，写入新值
      // 仅在第一次进入时保存，避免快速 toggle 导致原值被自身覆盖
      if (!prevRef.current) {
        prevRef.current = {
          MozUserSelect: body.style.MozUserSelect,
          msUserSelect: body.style.msUserSelect,
          cursor: body.style.cursor,
        };
      }
      body.style.MozUserSelect = 'none';
      body.style.msUserSelect = 'none';
      body.style.cursor = 'crosshair';
    } else if (prevRef.current) {
      // 离开拖拽：还原（仅在曾经进入过的情况下还原，避免空写入）
      body.style.MozUserSelect = prevRef.current.MozUserSelect || '';
      body.style.msUserSelect = prevRef.current.msUserSelect || '';
      body.style.cursor = prevRef.current.cursor || '';
      prevRef.current = null;
    }

    // 不返回 cleanup —— effect 本身就是基于 isDragging 切换的「toggle 模式」，
    // 下次 isDragging=false 时会进入 else 分支自动还原，无需在 effect cleanup 里再清。
    // 但 unmount 时需要兜底（见下方 unmount-only effect）。
    return undefined;
  }, [isDragging]);

  // unmount 兜底：组件卸载时如果仍处于拖拽中（理论上极少发生，但为防御保留），
  // 强制清理 body 样式，避免下个挂载的页面继承这些样式
  useEffect(() => {
    return () => {
      const body = document.body;
      if (!body) return;
      if (prevRef.current) {
        body.style.MozUserSelect = prevRef.current.MozUserSelect || '';
        body.style.msUserSelect = prevRef.current.msUserSelect || '';
        body.style.cursor = prevRef.current.cursor || '';
        prevRef.current = null;
      }
    };
  }, []);
}

export default usePolyfillNoSelectPrefixes;
