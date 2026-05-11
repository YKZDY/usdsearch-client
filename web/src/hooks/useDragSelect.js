/**
 * useDragSelect - 通用拖拽框选 hook（基于 DOM 查询）
 *
 * 在容器内空白处拖拽以批量选中卡片；在卡片内部拖拽不触发框选（保留文本选择）。
 *
 * 设计要点：
 * - 通过 data-card-index="<index>" 属性查询所有卡片 DOM
 * - 每帧用 getBoundingClientRect 做矩形相交检测（精确，且支持任意布局）
 * - mousedown 在容器上判断 target 是否在 .chakra-card 内部
 * - mousemove/mouseup 绑定到 document，避免拖出容器后失效
 * - 自动滚动：拖拽到容器边缘时滚动
 * - rAF 节流，性能可控
 */
import { useState, useRef, useCallback, useEffect } from 'react';

const CARD_INDEX_ATTR = 'data-card-index';
const CARD_SELECTOR = `[${CARD_INDEX_ATTR}]`;
const CARD_CLASS = 'chakra-card';
const DRAG_THRESHOLD = 5; // px

export function useDragSelect({
  containerRef,
  items = [],
  getItemId,
  onSelectionChange,
  baseSelection,            // 拖拽开始时已有的选中集（在拖拽期间叠加）
  enabled = true,
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectionRect, setSelectionRect] = useState(null);

  const stateRef = useRef({
    startX: 0,
    startY: 0,
    isActive: false,
    baseSet: new Set(),
  });
  const autoScrollRef = useRef(null);
  const frameRef = useRef(null);
  const itemsRef = useRef(items);
  const getItemIdRef = useRef(getItemId);
  const onChangeRef = useRef(onSelectionChange);

  // 同步最新 props 到 ref，避免 listener 闭包过期
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { getItemIdRef.current = getItemId; }, [getItemId]);
  useEffect(() => { onChangeRef.current = onSelectionChange; }, [onSelectionChange]);

  // 判断 target 是否落在卡片内部
  const isInsideCard = useCallback((target) => {
    if (!target || !containerRef.current) return false;
    let el = target;
    while (el && el !== containerRef.current) {
      if (el.nodeType === 1) {
        // 卡片标记：data-card-index、chakra-card class、或显式忽略标记
        if (
          el.hasAttribute?.(CARD_INDEX_ATTR) ||
          el.classList?.contains(CARD_CLASS) ||
          el.getAttribute?.('data-drag-select-ignore') === 'true'
        ) {
          return true;
        }
      }
      el = el.parentElement;
    }
    return false;
  }, [containerRef]);

  // 自动滚动
  const tickAutoScroll = useCallback((clientY) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const edge = 60;
    const maxSpeed = 14;
    let speed = 0;
    if (clientY < rect.top + edge) {
      speed = -maxSpeed * Math.min(1, (rect.top + edge - clientY) / edge);
    } else if (clientY > rect.bottom - edge) {
      speed = maxSpeed * Math.min(1, (clientY - (rect.bottom - edge)) / edge);
    }
    if (speed !== 0 && !autoScrollRef.current) {
      const loop = () => {
        if (!stateRef.current.isActive || !containerRef.current) {
          autoScrollRef.current = null;
          return;
        }
        containerRef.current.scrollTop += speed;
        autoScrollRef.current = requestAnimationFrame(loop);
      };
      autoScrollRef.current = requestAnimationFrame(loop);
    } else if (speed === 0 && autoScrollRef.current) {
      cancelAnimationFrame(autoScrollRef.current);
      autoScrollRef.current = null;
    }
  }, [containerRef]);

  // 计算选中：遍历容器内所有 [data-card-index] 元素，做矩形相交
  const computeSelected = useCallback((selRectViewport) => {
    const container = containerRef.current;
    if (!container) return new Set(stateRef.current.baseSet);

    const result = new Set(stateRef.current.baseSet);
    const cards = container.querySelectorAll(CARD_SELECTOR);

    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      const intersect =
        selRectViewport.left < rect.right &&
        selRectViewport.right > rect.left &&
        selRectViewport.top < rect.bottom &&
        selRectViewport.bottom > rect.top;
      if (intersect) {
        const idx = parseInt(card.getAttribute(CARD_INDEX_ATTR), 10);
        const item = itemsRef.current[idx];
        if (item) {
          const id = getItemIdRef.current?.(item);
          if (id != null) result.add(id);
        }
      }
    }
    return result;
  }, [containerRef]);

  const handleMouseDown = useCallback((e) => {
    if (!enabled || e.button !== 0) return;
    if (isInsideCard(e.target)) return;
    if (!containerRef.current) return;

    // 仅在事件源于容器内才启动
    if (!containerRef.current.contains(e.target)) return;

    e.preventDefault();
    stateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      isActive: true,
      baseSet: new Set(baseSelection || []),
    };
  }, [enabled, isInsideCard, containerRef, baseSelection]);

  const handleMouseMove = useCallback((e) => {
    const st = stateRef.current;
    if (!st.isActive) return;

    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    if (!isDragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

    if (!isDragging) setIsDragging(true);

    const x = Math.min(st.startX, e.clientX);
    const y = Math.min(st.startY, e.clientY);
    const w = Math.abs(dx);
    const h = Math.abs(dy);
    const rectVp = { left: x, top: y, right: x + w, bottom: y + h };

    setSelectionRect({ x, y, width: w, height: h });
    tickAutoScroll(e.clientY);

    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const next = computeSelected(rectVp);
      onChangeRef.current?.(next);
    });
  }, [isDragging, tickAutoScroll, computeSelected]);

  const handleMouseUp = useCallback(() => {
    if (!stateRef.current.isActive) return;
    stateRef.current.isActive = false;
    setIsDragging(false);
    setSelectionRect(null);
    if (autoScrollRef.current) {
      cancelAnimationFrame(autoScrollRef.current);
      autoScrollRef.current = null;
    }
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  // 全局监听 mousemove/mouseup
  useEffect(() => {
    if (!enabled) return;
    const onMove = (e) => handleMouseMove(e);
    const onUp = () => handleMouseUp();
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (autoScrollRef.current) cancelAnimationFrame(autoScrollRef.current);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [enabled, handleMouseMove, handleMouseUp]);

  return {
    isDragging,
    selectionRect,
    handleMouseDown,
  };
}
