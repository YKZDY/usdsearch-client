/**
 * useDragSelect - 通用拖拽框选 hook（基于 DOM 查询）
 *
 * 三种交互模式：
 * 1. **空白处拖动 → 矩形框选（rubber-band）**
 *    - 在卡片间隙按下并拖动，绘制选择矩形，矩形相交的卡片被选中
 * 2. **卡片内拖动 → 卡片连选刷选（toggle paint-select）**
 *    - 起点卡片**未选中** → 'add' 模式：拖过的卡片依次加入选中（类似画笔）
 *    - 起点卡片**已选中** → 'remove' 模式：拖过的卡片依次取消选中（类似橡皮擦）
 *    - 与 Finder/Windows 资源管理器一致，让批量加入和批量取消都能用拖拽完成
 *    - 未拖动（位移小于阈值）时不干预，让 click/double-click 正常触发
 * 3. **空白处点击（无拖动） → onEmptyClick 回调**
 *    - mousedown 落在空白且 mouseup 时未达拖拽阈值 → 视为"点击空白"，可用于退出多选
 *
 * 设计要点：
 * - 通过 data-card-index="<index>" 属性查询所有卡片 DOM
 * - rubber-band 用 getBoundingClientRect 做矩形相交检测
 * - paint-select 用 document.elementFromPoint 累积命中卡片到 paintedIds
 *   - paintMode='add'    → next = baseSet ∪ paintedIds
 *   - paintMode='remove' → next = baseSet \ paintedIds
 * - mousemove/mouseup 绑定到 document，避免拖出容器后失效
 * - 自动滚动：拖拽到容器边缘时滚动
 * - rAF 节流，性能可控
 */
import { useState, useRef, useCallback, useEffect } from 'react';

const CARD_INDEX_ATTR = 'data-card-index';
const CARD_SELECTOR = `[${CARD_INDEX_ATTR}]`;
const CARD_CLASS = 'chakra-card';
const DRAG_THRESHOLD = 8; // px：>5 给抖动/双击留缓冲，避免误判为拖拽分支

export function useDragSelect({
  containerRef,
  items = [],
  getItemId,
  onSelectionChange,
  baseSelection,            // 拖拽开始时已有的选中集（在拖拽期间叠加）
  enabled = true,
  onEmptyClick,             // 在容器空白处单击（无拖动）时触发；可用于退出多选
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectionRect, setSelectionRect] = useState(null);

  const stateRef = useRef({
    startX: 0,
    startY: 0,
    isActive: false,
    mode: null,           // 'rect' | 'paint' | null
    startedInsideCard: false,
    baseSet: new Set(),
    paintedIds: new Set(),
    // paint 模式的子模式：根据起点卡片是否已在 baseSet 中决定
    //   起点已选中 → 'remove'（拖过即取消，类似橡皮擦）
    //   起点未选中 → 'add'   （拖过即加入，类似画笔）
    // 这样用户既能用拖拽快速批量加入，也能用拖拽快速批量取消，与 Finder/资源管理器一致
    paintMode: 'add',     // 'add' | 'remove'
  });
  const autoScrollRef = useRef(null);
  const frameRef = useRef(null);
  const itemsRef = useRef(items);
  const getItemIdRef = useRef(getItemId);
  const onChangeRef = useRef(onSelectionChange);
  const onEmptyClickRef = useRef(onEmptyClick);

  // 同步最新 props 到 ref，避免 listener 闭包过期
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { getItemIdRef.current = getItemId; }, [getItemId]);
  useEffect(() => { onChangeRef.current = onSelectionChange; }, [onSelectionChange]);
  useEffect(() => { onEmptyClickRef.current = onEmptyClick; }, [onEmptyClick]);

  // 判断 target 是否落在卡片内部
  const isInsideCard = useCallback((target) => {
    if (!target || !containerRef.current) return false;
    let el = target;
    while (el && el !== containerRef.current) {
      if (el.nodeType === 1) {
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

  // 从任意 element 向上找最近的 [data-card-index]，返回 { index, id } 或 null
  const findCardFromEl = useCallback((el) => {
    if (!el) return null;
    let cur = el;
    while (cur && cur !== document.body) {
      if (cur.nodeType === 1 && cur.hasAttribute?.(CARD_INDEX_ATTR)) {
        const idx = parseInt(cur.getAttribute(CARD_INDEX_ATTR), 10);
        const item = itemsRef.current[idx];
        if (item) {
          const id = getItemIdRef.current?.(item);
          if (id != null) return { index: idx, id };
        }
        return null;
      }
      cur = cur.parentElement;
    }
    return null;
  }, []);

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

  // 矩形框选：遍历容器内所有 [data-card-index] 元素，做矩形相交
  const computeSelectedByRect = useCallback((selRectViewport) => {
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

  // 把 paintedIds 应用到 baseSet：根据 paintMode 决定是 ∪ 还是 \
  const applyPaint = useCallback(() => {
    const st = stateRef.current;
    const next = new Set(st.baseSet);
    if (st.paintMode === 'remove') {
      st.paintedIds.forEach((id) => next.delete(id));
    } else {
      st.paintedIds.forEach((id) => next.add(id));
    }
    onChangeRef.current?.(next);
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (!enabled || e.button !== 0) return;
    if (!containerRef.current) return;
    if (!containerRef.current.contains(e.target)) return;

    // 忽略 input / textarea / contenteditable / 按钮等交互控件
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
    if (e.target.closest?.('[data-drag-select-skip="true"]')) return;

    // 排除"点在滚动条上"的情况（容器是 overflow:auto 时，滚动条也是容器一部分，
    // mousedown 落在滚动条不应启动框选/视为空白点击）
    const container = containerRef.current;
    if (e.target === container) {
      const rect = container.getBoundingClientRect();
      // 鼠标 x 落在内容区右侧（垂直滚动条）或 y 落在底部（水平滚动条）→ 不处理
      if (e.clientX > rect.left + container.clientWidth) return;
      if (e.clientY > rect.top + container.clientHeight) return;
    }

    const insideCard = isInsideCard(e.target);
    const baseSet = new Set(baseSelection || []);

    // 决定 paint 子模式：起点卡片已选中 → 拖拽过程是"减选"；未选中 → "加选"
    // 在 mousedown 即可决定（避免到 mousemove 时 baseSelection 已被中间状态污染）
    let paintMode = 'add';
    if (insideCard) {
      const startCard = findCardFromEl(e.target);
      if (startCard && baseSet.has(startCard.id)) {
        paintMode = 'remove';
      }
    }

    stateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      isActive: true,
      mode: null, // 等到 move 超过阈值再决定 'rect' | 'paint'
      startedInsideCard: insideCard,
      baseSet,
      paintedIds: new Set(),
      paintMode,
    };

    // 仅在空白处主动 preventDefault，避免文本选区与原生选高亮干扰
    // 卡片内允许默认行为（让点击事件链工作）
    if (!insideCard) {
      e.preventDefault();
    }
  }, [enabled, isInsideCard, containerRef, baseSelection, findCardFromEl]);

  const handleMouseMove = useCallback((e) => {
    const st = stateRef.current;
    if (!st.isActive) return;

    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    const dist = Math.hypot(dx, dy);

    // 未达拖拽阈值：不做任何事，留给 click 处理
    if (st.mode === null && dist < DRAG_THRESHOLD) return;

    // 第一次越过阈值：决定模式
    if (st.mode === null) {
      st.mode = st.startedInsideCard ? 'paint' : 'rect';
      setIsDragging(true);

      // paint 模式：把"起始卡片"立刻应用（确保用户拖过即选/即取消）
      if (st.mode === 'paint') {
        const startCard = findCardFromEl(document.elementFromPoint(st.startX, st.startY));
        if (startCard) {
          st.paintedIds.add(startCard.id);
          applyPaint();
        }
      }
    }

    if (st.mode === 'rect') {
      const x = Math.min(st.startX, e.clientX);
      const y = Math.min(st.startY, e.clientY);
      const w = Math.abs(dx);
      const h = Math.abs(dy);
      const rectVp = { left: x, top: y, right: x + w, bottom: y + h };

      setSelectionRect({ x, y, width: w, height: h });
      tickAutoScroll(e.clientY);

      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        const next = computeSelectedByRect(rectVp);
        onChangeRef.current?.(next);
      });
    } else if (st.mode === 'paint') {
      // 卡片刷选：用 elementFromPoint 找当前指针下卡片，加入 paintedIds
      // 应用规则由 paintMode 决定：'add' → 加入选中；'remove' → 取消选中
      tickAutoScroll(e.clientY);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        const hover = findCardFromEl(document.elementFromPoint(e.clientX, e.clientY));
        if (hover && !st.paintedIds.has(hover.id)) {
          st.paintedIds.add(hover.id);
          applyPaint();
        }
      });
    }
  }, [tickAutoScroll, computeSelectedByRect, findCardFromEl, applyPaint]);

  const handleMouseUp = useCallback((e) => {
    const st = stateRef.current;
    if (!st.isActive) return;

    const wasDragging = st.mode !== null;
    const startedEmpty = !st.startedInsideCard;

    st.isActive = false;
    st.mode = null;
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

    // 空白处单击（无拖动）→ 视为"取消框选/退出多选"信号
    if (!wasDragging && startedEmpty) {
      // mouseup 时再次确认 target 仍在容器内空白处（避免拖出容器后误触）
      const target = e?.target;
      if (target && containerRef.current?.contains(target) && !isInsideCard(target)) {
        // 同样跳过交互控件
        const tag = target.tagName;
        const isControl =
          tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' ||
          target.closest?.('[data-drag-select-skip="true"]');
        if (!isControl) {
          onEmptyClickRef.current?.();
        }
      }
    }
  }, [containerRef, isInsideCard]);

  // 全局监听 mousemove/mouseup
  useEffect(() => {
    if (!enabled) return;
    const onMove = (e) => handleMouseMove(e);
    const onUp = (e) => handleMouseUp(e);
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
