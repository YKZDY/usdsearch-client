import { useEffect, useRef } from 'react';

/**
 * useExitMultiSelectOnEmptyClick
 *
 * 多选模式下的"全局空白点击退出"识别 hook。
 *
 * 设计目标：
 *   - 让用户在页面任意"非交互"空白处按下并松开（短按、无明显位移），即可退出多选模式
 *   - 覆盖范围：顶部搜索栏空白、左侧产品类型树空白、结果区 titleBar 空白、结果容器空白
 *   - 误触保护：长按选词、拖拽、点交互控件都不触发
 *
 * 实现策略：
 *   - 在 document 级监听 mousedown/mouseup（非 capture，让 React onClick/Chakra 控件优先处理）
 *   - mousedown 记录起点 + 时间戳；mouseup 校验 (短按 + 未拖动 + 起点和终点都在"空白")
 *   - "空白"判定：target 不命中以下任一选择器
 *       1. [data-multiselect-keep="true"]            —— 自定义白名单（树节点/搜索栏 wrapper 等）
 *       2. button, input, textarea, select,
 *          [contenteditable="true"], a,
 *          [role="button"|"checkbox"|"menuitem"|"tab"|"option"|"link"]
 *       3. [data-card-index]                         —— 结果卡片自身（由 useDragSelect 处理）
 *       4. [role="dialog"], [role="menu"],
 *          .chakra-popover__content,
 *          .chakra-modal__content                    —— 浮层内部
 *
 *   - 触发后调用 onExit()，无额外视觉反馈（依靠 SelectionModeBar 自身淡出动画）
 *
 * 性能：仅在 enabled=true 时挂监听，false 时彻底卸载，避免空跑。
 *
 * @param {Object} opts
 * @param {boolean}  opts.enabled         - 仅多选模式 ON 时挂监听
 * @param {Function} opts.onExit          - 退出回调（通常为 clearSelection）
 * @param {number}  [opts.dragThreshold=8]  - 位移超此 px 视为拖拽
 * @param {number}  [opts.timeThreshold=500] - 按下时长超此 ms 视为长按
 */
export function useExitMultiSelectOnEmptyClick({
  enabled,
  onExit,
  dragThreshold = 8,
  timeThreshold = 500,
}) {
  // 用 ref 保最新 onExit，避免 effect 因 onExit 引用变化反复挂载/卸载
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  useEffect(() => {
    if (!enabled) return undefined;
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;

    let downInfo = null; // { x, y, ts, target }

    const INTERACTIVE_SELECTOR = [
      '[data-multiselect-keep="true"]',
      'button',
      'input',
      'textarea',
      'select',
      '[contenteditable="true"]',
      'a',
      '[role="button"]',
      '[role="checkbox"]',
      '[role="menuitem"]',
      '[role="tab"]',
      '[role="option"]',
      '[role="link"]',
      '[role="switch"]',
      '[role="slider"]',
      '[role="treeitem"]',
      '[data-card-index]',
      '[role="dialog"]',
      '[role="menu"]',
      '.chakra-popover__content',
      '.chakra-modal__content',
      '.chakra-tooltip',
    ].join(',');

    const isInteractive = (el) => {
      if (!el || el.nodeType !== 1) return false;
      try {
        return !!el.closest?.(INTERACTIVE_SELECTOR);
      } catch {
        return false;
      }
    };

    const handleMouseDown = (e) => {
      if (e.button !== 0) return; // 只处理左键
      // 起点若已在交互元素 → 不记录（点 button 时不期望它松开后退出多选）
      if (isInteractive(e.target)) {
        downInfo = null;
        return;
      }
      downInfo = {
        x: e.clientX,
        y: e.clientY,
        ts: Date.now(),
        target: e.target,
      };
    };

    const handleMouseUp = (e) => {
      if (e.button !== 0) return;
      const start = downInfo;
      downInfo = null;
      if (!start) return;

      // 时长校验
      if (Date.now() - start.ts > timeThreshold) return;
      // 位移校验
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) > dragThreshold) return;
      // 终点也需是空白
      if (isInteractive(e.target)) return;

      // 触发退出（无视觉反馈，依靠 SelectionModeBar 自身的淡出动画即可）
      try {
        onExitRef.current?.();
      } catch (err) {
        // 防御：onExit 抛错不应影响监听器后续工作
        // eslint-disable-next-line no-console
        console.warn('[useExitMultiSelectOnEmptyClick] onExit threw:', err);
      }
    };

    document.addEventListener('mousedown', handleMouseDown, false);
    document.addEventListener('mouseup', handleMouseUp, false);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown, false);
      document.removeEventListener('mouseup', handleMouseUp, false);
      downInfo = null;
    };
  }, [enabled, dragThreshold, timeThreshold]);
}

export default useExitMultiSelectOnEmptyClick;
