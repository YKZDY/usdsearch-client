/**
 * useDrawerCardHandlers — 资产卡片点击事件统一入口
 *
 * === LM CUSTOMIZATION: ClickHandlerUnify ===
 *
 * 目标：消除"两条点击 hook 同时挂在同一张卡片"的双消费链路。
 *
 * 历史问题：
 *   原实现把 useClickOrDoubleClick 直接挂在卡片上，由它的 onMouseDown/onMouseMove/onClick/onDoubleClick
 *   分别调度。但在 SINGLE_CLICK_DRAWER 新交互下：
 *     - 单击本体打开 Drawer，不再 toggle 选中
 *     - 双击本体也是打开 Drawer（与单击一致）
 *   useClickOrDoubleClick 内的"双击补偿回滚"和"movedRef 早退"机制完全是冗余层，
 *   与 useDragSelect 的 innerPending/movedRef 形成双重 mousemove 消费，导致：
 *     - 手指轻微抖动 5-9px → click 被误吞
 *     - Shift/Ctrl+click 偶发无反应
 *     - Drawer 已开时点其他卡无切换
 *
 * 新方案（SINGLE_CLICK_DRAWER=true）：
 *   - 仅记录 mousedown 起点，不挂 onMouseMove
 *   - click/dblclick 直接转发到 onSelectionChange / onItemClick
 *   - 是否拦截 click 由 useDragSelect 通过 isActive 自主判断（拖拽真激活时它会接管）
 *   - useDrawerOrSelect 真值表负责语义判定（修饰键 / 复选框 / Drawer 切换）
 *
 * 旧方案（SINGLE_CLICK_DRAWER=false）：
 *   - 完整退回 useClickOrDoubleClick 行为，向后兼容 NVIDIA 原版双击 Modal
 *
 * 合入英伟达新版时：保留本 hook；NVIDIA 上游不存在此 hook，无冲突风险。
 */
import { useCallback, useRef } from 'react';
import { useClickOrDoubleClick } from './useClickOrDoubleClick';

/**
 * @param {object} params
 * @param {object} params.result          当前卡片对应的搜索结果对象
 * @param {number} params.index           卡片索引
 * @param {Function} params.onSelectionChange  (result, event, index) => void
 * @param {Function} params.onItemClick   (result) => void  打开 Drawer / Modal
 * @param {boolean} params.enabled        FEATURE_FLAGS.NEW_CARD_INTERACTION
 * @param {boolean} params.drawerEnabled  FEATURE_FLAGS.SINGLE_CLICK_DRAWER
 * @returns {{ onClick, onDoubleClick, onMouseDown, onMouseMove }}
 */
export function useDrawerCardHandlers({
  result,
  index,
  onSelectionChange,
  onItemClick,
  enabled = true,
  drawerEnabled = true,
}) {
  // 旧路径（兼容 NVIDIA 原版）：fallback 到 useClickOrDoubleClick
  // 必须在顶层无条件调用 hook，但内部回调按 drawerEnabled 切换
  const legacyHandlers = useClickOrDoubleClick({
    onClick: useCallback(
      (e) => onSelectionChange?.(result, e, index),
      [onSelectionChange, result, index]
    ),
    onDoubleClick: useCallback(() => onItemClick?.(result), [onItemClick, result]),
    enabled: enabled && !drawerEnabled,
  });

  // 新路径：轻量直通
  // 仅记录起点用于"位移过大就丢弃无修饰键 click"，修饰键 click 始终穿透
  const downPosRef = useRef(null);
  // === LM CUSTOMIZATION: ModifierClickEmulation START ===
  // 修复 R-B：浏览器对原生 click 派发有 ~5px 位移阈值（Chromium 默认行为）。
  //   用户 Ctrl+click 时手指自然抖动 6-12px → 浏览器认定为"拖拽"而非"点击"，
  //   完全不派发 click 事件，hook 收不到 → 多选失败。
  //   useClickOrDoubleClick 之前的 5px MOVE_THRESHOLD 也是因此而来——
  //   这是个治标不治本的方案。
  // 真正的修复：在 onMouseUp 里自己识别"修饰键 + 较大位移"的"轻拖式点击"，
  //   绕过浏览器 click，主动调用 onSelectionChange。
  // 阈值 MODIFIER_CLICK_TOLERANCE=18px：足够覆盖正常手指抖动，又不与
  //   useDragSelect 的 INNER_DRAG_THRESHOLD=8 完全冲突——8-18px 区间被
  //   useDragSelect 视为 paint 起步，但 useDragSelect.paint 模式如果只 painted
  //   一张起点卡，本地 mouseup 后会被 baseSet/paintedIds 同步为已选状态，
  //   与本路径的 onSelectionChange(toggle) 形成"叠加"——但因为 toggle 是幂等的，
  //   两次 toggle 抵消并不破坏最终态（最终态由 useDragSelect emit 决定）。
  //   更清晰：本 hook 只在 mouseup 同帧"赶在浏览器 click 时间窗口外"主动 dispatch。
  //   实测见 playwright-verify Ctrl+click 抖动用例。
  // 合入英伟达新版时：保留本块。
  const MOVE_TOLERANCE = 10; // 与 useClickOrDoubleClick 对齐
  const MODIFIER_CLICK_TOLERANCE = 18; // 修饰键 click 容差更大

  const handleMouseUp = useCallback(
    (e) => {
      const start = downPosRef.current;
      if (!start) return;
      // 仅修饰键路径走自定义 click 模拟
      const hasModifier = !!(e?.shiftKey || e?.metaKey || e?.ctrlKey);
      if (!hasModifier) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const dist2 = dx * dx + dy * dy;
      // 浏览器 click 5px 阈值之内 → 浏览器自己会派发 click，不重复
      if (dist2 <= 25) return; // 5px^2
      // 5-18px：浏览器不派发 click，但用户意图是"修饰键 click"
      // 主动 dispatch 给 onSelectionChange，并清掉 downPosRef 避免之后 click 重复触发
      if (dist2 <= MODIFIER_CLICK_TOLERANCE * MODIFIER_CLICK_TOLERANCE) {
        downPosRef.current = null;
        onSelectionChange?.(result, e, index);
      }
      // >18px：视为真拖拽（useDragSelect 接管），不模拟
    },
    [onSelectionChange, result, index]
  );
  // === LM CUSTOMIZATION: ModifierClickEmulation END ===

  const handleMouseDown = useCallback((e) => {
    downPosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleClick = useCallback(
    (e) => {
      // 修饰键 click 永远穿透（与 useClickOrDoubleClick 行为一致）
      const hasModifier = !!(e?.shiftKey || e?.metaKey || e?.ctrlKey);
      if (hasModifier) {
        downPosRef.current = null;
        onSelectionChange?.(result, e, index);
        return;
      }
      // 无修饰键 + 位移过大 → 视为拖拽路径，丢弃 click
      const start = downPosRef.current;
      downPosRef.current = null;
      if (start) {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (dx * dx + dy * dy > MOVE_TOLERANCE * MOVE_TOLERANCE) {
          return;
        }
      }
      onSelectionChange?.(result, e, index);
    },
    [onSelectionChange, result, index]
  );

  const handleDoubleClick = useCallback(
    (e) => {
      e?.stopPropagation?.();
      // SINGLE_CLICK_DRAWER 下双击本体 = 打开 Drawer
      onItemClick?.(result);
    },
    [onItemClick, result]
  );

  if (!drawerEnabled) {
    return legacyHandlers;
  }

  return {
    onClick: handleClick,
    onDoubleClick: handleDoubleClick,
    onMouseDown: handleMouseDown,
    // === LM CUSTOMIZATION: ModifierClickEmulation START ===
    onMouseUp: handleMouseUp, // 修饰键 click 模拟（绕开浏览器 5px 阈值）
    // === LM CUSTOMIZATION: ModifierClickEmulation END ===
    onMouseMove: undefined, // 新路径不需要监听 mousemove，让 useDragSelect 独占
  };
}

export default useDrawerCardHandlers;
