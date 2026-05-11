/**
 * useClickOrDoubleClick — 区分单击/双击的统一交互 hook
 *
 * 设计目标：
 *  - 单击：延迟 220ms 等待是否双击；若无第二次点击则触发 onClick
 *  - 双击：立即 cancel 上一次单击 timer，触发 onDoubleClick
 *  - 防误触：mousedown→mouseup 移动距离 > moveThreshold(5px) 视为拖拽，不触发任何回调
 *  - 修饰键穿透：Shift / Cmd / Ctrl + Click 始终立即触发 onClick（不等待双击窗口）
 *
 * 为什么用 220ms：
 *  - macOS 默认双击间隔约 500ms，Windows 约 500ms，但实际感知阈值在 200~250ms
 *  - 取 220ms 在"响应快"和"误判少"之间最优
 *
 * 用法：
 *   const handlers = useClickOrDoubleClick({
 *     onClick:       (e) => toggleSelection(),
 *     onDoubleClick: (e) => openDetails(),
 *     enabled:       FEATURE_FLAGS.NEW_CARD_INTERACTION,
 *   });
 *   <Box {...handlers} />
 */
import { useCallback, useEffect, useRef } from 'react';

const DOUBLE_CLICK_DELAY = 220;
const MOVE_THRESHOLD = 5; // px

export function useClickOrDoubleClick({ onClick, onDoubleClick, enabled = true }) {
  const timerRef = useRef(null);
  const downPosRef = useRef(null);
  const movedRef = useRef(false);

  // 卸载时清理 timer
  useEffect(() => () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

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
    // 拖拽（含拖拽多选）路径：不触发 click
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }
    if (!enabled) {
      onClick?.(e);
      return;
    }
    // 修饰键：立即触发，不等双击
    if (e?.shiftKey || e?.metaKey || e?.ctrlKey) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      onClick?.(e);
      return;
    }
    // 已有 pending click → 视为双击的第二次 click，吞掉（dblclick 会处理）
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      return;
    }
    // 缓存事件信息（React SyntheticEvent 池化，必须 persist 或拷贝）
    const snapshot = {
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey,
      target: e.currentTarget,
    };
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onClick?.(snapshot);
    }, DOUBLE_CLICK_DELAY);
  }, [enabled, onClick]);

  const handleDoubleClick = useCallback((e) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!enabled) return;
    e?.stopPropagation?.();
    onDoubleClick?.(e);
  }, [enabled, onDoubleClick]);

  return {
    onMouseDown: handleMouseDown,
    onMouseMove: handleMouseMove,
    onClick: handleClick,
    onDoubleClick: handleDoubleClick,
  };
}

export default useClickOrDoubleClick;
