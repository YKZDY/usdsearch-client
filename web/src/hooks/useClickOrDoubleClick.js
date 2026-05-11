/**
 * useClickOrDoubleClick — 区分单击/双击的统一交互 hook（乐观更新版）
 *
 * 设计目标（v2 优化）：
 *  - 单击：**立即**触发 onClick（0ms 延迟，乐观更新选中态），带来最直观的点击反馈
 *  - 双击：dblclick 触发时先**再次调用 onClick 回滚**第一次单击造成的 toggle，然后触发 onDoubleClick
 *  - 因为 toggleSelection 是幂等 toggle 操作（点两次 = 回到原状态），所以"回滚 = 再点一次"天然成立
 *  - 防误触：mousedown→mouseup 移动距离 > moveThreshold(5px) 视为拖拽，不触发任何回调
 *  - 修饰键穿透：Shift / Cmd / Ctrl + Click 始终立即触发 onClick（不算双击窗口内）
 *
 * 与 v1 差异：
 *  - v1：单击后 setTimeout 等 220ms 再触发 onClick → 感知延迟大
 *  - v2：单击立即触发 + 双击时补偿回滚 → 感知延迟 ≈ 0ms
 *
 * 闪烁时间估算：
 *  - click → toggle（卡片 100ms linear 过渡）→ 用户感知 ~50ms 的选中态
 *  - 第二次 mouseup 后浏览器派发 dblclick → 回滚 + 打开详情弹窗
 *  - 详情弹窗首帧覆盖卡片，闪烁几乎不可见
 *
 * 用法（不变）：
 *   const handlers = useClickOrDoubleClick({
 *     onClick:       (e) => toggleSelection(),
 *     onDoubleClick: (e) => openDetails(),
 *     enabled:       FEATURE_FLAGS.NEW_CARD_INTERACTION,
 *   });
 *   <Box {...handlers} />
 */
import { useCallback, useRef } from 'react';

// dblclick 补偿窗口：浏览器 dblclick 通常在 300-500ms 内派发
// 若 dblclick 相对最近一次 click 在此窗口内，认为是同一次双击，需要回滚
const DOUBLE_CLICK_WINDOW = 500;
const MOVE_THRESHOLD = 5; // px

export function useClickOrDoubleClick({ onClick, onDoubleClick, enabled = true }) {
  const downPosRef = useRef(null);
  const movedRef = useRef(false);
  // 最近一次 onClick 触发时间戳（ms）；-1 表示无最近 click（已被双击消费）
  const lastClickTimeRef = useRef(-1);

  const handleMouseDown = useCallback((e) => {
    downPosRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!downPosRef.current || movedRef.current) return;
    const dx = e.clientX - downPosRef.current.x;
    const dy = e.clientY - downPosRef.current.y;
    if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) {
      movedRef.current = true;
    }
  }, []);

  const handleClick = useCallback((e) => {
    // 拖拽（含框选）路径：不触发 click
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }
    // enabled=false：退化为普通 click，不启用双击回滚机制
    if (!enabled) {
      onClick?.(e);
      return;
    }
    // 修饰键（Shift/Cmd/Ctrl+Click）：立即触发，且不计入双击窗口
    // 避免"Shift+区间选" + 500ms 内双击同一目标被误判为需要回滚
    if (e?.shiftKey || e?.metaKey || e?.ctrlKey) {
      lastClickTimeRef.current = -1;
      onClick?.(e);
      return;
    }
    // 乐观更新：立即触发 onClick，不等待双击判定
    // 若随后在 DOUBLE_CLICK_WINDOW 内收到 dblclick，会通过再次 onClick 回滚
    lastClickTimeRef.current = Date.now();
    onClick?.(e);
  }, [enabled, onClick]);

  const handleDoubleClick = useCallback((e) => {
    if (!enabled) return;
    e?.stopPropagation?.();

    // 若最近一次 click 在双击窗口内，说明是同一次双击的首次 click，
    // 需要再 toggle 一次把状态回滚（toggleSelection 的幂等性保证）
    const now = Date.now();
    const sinceLastClick = lastClickTimeRef.current > 0
      ? now - lastClickTimeRef.current
      : Infinity;
    if (sinceLastClick <= DOUBLE_CLICK_WINDOW) {
      // 回滚首次单击的副作用（例如 toggleSelection 再按一次 = 恢复原态）
      onClick?.(e);
    }
    // 消费掉 click 时间戳，避免后续误判
    lastClickTimeRef.current = -1;

    onDoubleClick?.(e);
  }, [enabled, onClick, onDoubleClick]);

  return {
    onMouseDown: handleMouseDown,
    onMouseMove: handleMouseMove,
    onClick: handleClick,
    onDoubleClick: handleDoubleClick,
  };
}

export default useClickOrDoubleClick;
