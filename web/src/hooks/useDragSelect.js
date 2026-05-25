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
// === LM CUSTOMIZATION: InnerDragThreshold START ===
// 根因 R2：容器内 mousedown 当帧立即 isActive=true，与 useClickOrDoubleClick 的 movedRef
//   形成"双重消费 mousemove"。虽然 mousemove 里 mode===null && dist<DRAG_THRESHOLD 已早退
//   保护 click 不受副作用影响，但 isActive=true 会让 mouseup 走入"已激活"分支处理逻辑，
//   增加边界出错概率（如 onEmptyClick 误触发等）。
// 解决：引入 innerPending 缓冲态，与 outerPending 形成对称——容器内 mousedown 仅记录起点，
//   等 mousemove 真正越过 INNER_DRAG_THRESHOLD 才正式 isActive=true，进入框选/刷选模式。
//   位移不足时 mouseup 直接干净退出，让原生 click 正常派发到卡片。
// 与 OUTER_DRAG_THRESHOLD=20 形成"内紧外松"梯度：内部已确定意图（用户在结果区），8px 即激活。
// 合入英伟达新版时：保留本块；本 hook 由 LM 自有维护，无 NVIDIA 上游版本。
const INNER_DRAG_THRESHOLD = 8; // px：容器内起点的拖拽激活阈值（与 DRAG_THRESHOLD 等值，仅语义解耦）
// === LM CUSTOMIZATION: InnerDragThreshold END ===
const OUTER_DRAG_THRESHOLD = 20; // px：容器外起点需要更大位移才启动框选，避免与"单击退出多选"冲突

/**
 * 硬交互元素：单击会触发 form submit / focus / 跳转 / 编辑等关键行为
 * → 任何起点（容器内外）都必须 return，不能干预
 *
 * 与"软交互"区分：treeitem、role=tab/option 等只是装饰性 ARIA，被点中也不会
 * 影响真实行为；data-drag-select-skip 是纯视觉隔离区（顶部 bar），里面的实际
 * 控件已通过 button/a/input 明确，整块 skip 反而会让顶部空白进不去 outerPending。
 */
function isHardInteractive(el) {
  if (!el || el === document || el === document.body || el.nodeType !== 1) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return true;
  // 仅有 href 的 <a> 才是硬交互；纯装饰 <a> （如 brand 容器）应允许框选起手
  if (tag === 'A' && el.hasAttribute?.('href')) return true;
  if (el.isContentEditable) return true;
  const role = el.getAttribute?.('role');
  if (role === 'button' || role === 'switch' || role === 'slider' ||
      role === 'menuitem' || role === 'option' || role === 'tab' ||
      role === 'checkbox' || role === 'radio') return true;
  if (el.closest?.('label')) return true;
  // 祖先链上是否有真硬交互（处理 button 内部 span/svg 的情况）
  return el.closest?.(
    'button, input, textarea, select, a[href], [contenteditable="true"], ' +
    '[role="button"], [role="switch"], [role="slider"], [role="menuitem"], ' +
    '[role="option"], [role="tab"], [role="checkbox"], [role="radio"], label'
  ) != null;
}

/**
 * 容器内起点的"软屏蔽"：希望保护的容器内交互元素（结果区里的下拉、按钮、链接等）
 * 容器外起点不参考此函数，让 sidebar/topbar 的空白区域能进入 outerPending。
 */
function isContainerInnerSkip(el) {
  if (!el || el.nodeType !== 1) return false;
  return el.closest?.('[data-drag-select-skip="true"]') != null;
}

/**
 * 浏览器原生 drag 源：mousedown 时会触发原生 dragstart，必须 preventDefault
 * 否则 sidebar 里的 logo/tree 图标、顶部 bar 的 logo 会被浏览器叼走拖拽
 */
function isNativeDragSource(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.tagName === 'IMG' || el.tagName === 'A') return true;
  if (el.getAttribute?.('draggable') === 'true') return true;
  // 祖先有 draggable=true 也算
  return el.closest?.('img, a, [draggable="true"]') != null;
}

/**
 * 判断当前是否有 Modal/Popover 打开
 */
function isModalOpen() {
  return !!(
    document.querySelector('.chakra-modal__overlay') ||
    document.querySelector('[data-chakra-modal]') ||
    document.querySelector('[role="dialog"][aria-modal="true"]')
  );
}

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
    // [LM ClickRobustness] innerPending：容器内 mousedown 后达到 INNER_DRAG_THRESHOLD 前的缓冲态
    innerPending: false,
    mode: null,           // 'rect' | 'paint' | null
    startedInsideCard: false,
    baseSet: new Set(),
    paintedIds: new Set(),
    // [PERF v4] rect 模式最近一次选区矩形（视口坐标），供 autoScroll loop 每帧重算选中集
    lastRectVp: null,
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
  // [PERF v4] tickAutoScroll 在 computeSelectedByRect/emitIfChanged 声明之前使用，
  // 通过 ref 间接访问避免 TDZ（const useCallback 联合严格检查会报 “使用前未初始化”）。
  const computeSelectedByRectRef = useRef(null);
  const emitIfChangedRef = useRef(null);
  // [PERF v4 — 2026-05-22 trace 驱动] 镜像 baseSelection 到 ref
  // 背景：Playwright + cancelAnimationFrame stack trace 证实，拖拽期间 useEffect 被销毁重建 5+ 次，
  //   导致 cleanup 中 cancelAnimationFrame(autoScrollRef.current) 反复中断 autoScroll loop。
  //   原因：handleMouseDown deps 含 baseSelection，拖拽 emit 新选中集 → 父级 setSelectedItems →
  //   baseSelection 引用变 → handleMouseDown 重建 → 主 useEffect deps 变 → effect 销毁重建。
  //   结果 autoScroll loop 仅跑三四帧就被 cancel，拖到边缘区【有效但极慢】。
  // 修复：镜像 baseSelection 到 ref，handleMouseDown 仅读 ref 不依赖 deps，使主 useEffect 稳定。
  const baseSelectionRef = useRef(baseSelection);

  // 同步最新 props 到 ref，避免 listener 闭包过期
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { getItemIdRef.current = getItemId; }, [getItemId]);
  useEffect(() => { onChangeRef.current = onSelectionChange; }, [onSelectionChange]);
  useEffect(() => { onEmptyClickRef.current = onEmptyClick; }, [onEmptyClick]);
  useEffect(() => { baseSelectionRef.current = baseSelection; }, [baseSelection]);

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
        // [PERF v4 — 2026-05-22] autoScroll 期间同步扩展选区
        // 场景：鼠标静止在 edge 区不动，容器下滚后新滚出的卡片会进入选区矩形。
        // 之前 loop 只改 scrollTop、不重算选中集，造成"滚是滚了 但卡没被选"的倒退体验。
        // 在 stateRef.lastRectVp 里存上一次 mousemove 计算的选区矩形（视口坐标，不变），
        // 每帧调 computeSelectedByRect 重算后 emit。不会重复触发（emitIfChanged 有 Set 等值短路）。
        // 通过 ref 间接调用避免 const TDZ。
        const lastRect = stateRef.current.lastRectVp;
        if (lastRect && computeSelectedByRectRef.current && emitIfChangedRef.current) {
          const next = computeSelectedByRectRef.current(lastRect);
          emitIfChangedRef.current(next);
        }
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

  // [PERF v2] Set 等值比较：避免向上层抛出"内容相同"的新 Set 引用
  //   性能根因：mousemove 期间每帧都会重新计算 next Set 并 onChangeRef.current?.(next)；
  //   父级 setSelectedItems(next) 即便内容未变也会触发整棵搜索结果重渲染（renderItem
  //   依赖 selectedItems 引用→重建→VirtualizedResults 内每张可视卡 reconciliation）。
  //   通过 lastEmittedRef 做 size+ID 等值比较，命中卡片未变化时直接 return，60Hz 下从
  //   "每帧都重渲"降到"仅在选区跨边界时重渲"，是拖拽丝滑度的关键。
  const lastEmittedRef = useRef(null);
  const setEquals = (a, b) => {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  };
  const emitIfChanged = useCallback((next) => {
    if (setEquals(lastEmittedRef.current, next)) return;
    lastEmittedRef.current = next;
    onChangeRef.current?.(next);
  }, []);

  // [PERF v4] \u540c\u6b65 computeSelectedByRect / emitIfChanged \u5230 ref\uff0c\u4f9b autoScroll loop \u8c03\u7528\n  // \u539f\u56e0\uff1atickAutoScroll \u5728\u8fd9\u4e24\u8005\u4e4b\u524d\u58f0\u660e\uff0c\u76f4\u63a5\u5728 useCallback deps \u4e2d\u5f15\u7528\u4f1a\u89e6\u53d1 TDZ\u3002\n  const computeSelectedByRectRefSync = computeSelectedByRect;\n  const emitIfChangedRefSync = emitIfChanged;\n  computeSelectedByRectRef.current = computeSelectedByRectRefSync;\n  emitIfChangedRef.current = emitIfChangedRefSync;

  // [PERF v2] 拖拽起点重置 lastEmitted，使下一次 mousedown 不被旧值短路
  // 必须在 handleMouseDown 之前声明（const TDZ：handleMouseDown 的 useCallback
  // 在 capture 函数体里引用 resetEmitted，模块求值阶段 TDZ 检查不会真正访问，
  // 但热更新 / 严格模式下 React 的 deps 数组校验会触发 ReferenceError）。
  const resetEmitted = useCallback(() => {
    lastEmittedRef.current = null;
  }, []);

  // === LM CUSTOMIZATION: DragSelectBodyStyles START ===
  // [PERF v3 — 2026-05-22 trace 驱动] 合并拖拽期间的 body 样式写入
  // 背景：Chrome DevTools trace 表明，"首次激活 rect mode" 会产生 ≈196ms 的巨任务。
  //   调用链：setIsDragging(true) → useEffect onDragStateChange(true) → 父级 setIsDraggingForPolyfill
  //   → HybridDeepSearchUI (3812 行) 整棵重渲 → usePolyfillNoSelectPrefixes 写 body.style。
  // 优化思路：polyfill 只是写 body.style.MozUserSelect / msUserSelect / cursor（纯 DOM），
  //   完全不需要 React state。我们在进入 / 退出拖拽时一同写入，释放 onDragStateChange 上抛，
  //   避免父级巨树重渲。
  // 退出拖拽时需以原值还原，使用 prevBodyStylesRef 保存进入前的 body.style 原值。
  const prevBodyStylesRef = useRef(null);
  const applyDragBodyStyles = useCallback((entering) => {
    const body = document.body;
    if (!body) return;
    if (entering) {
      if (!prevBodyStylesRef.current) {
        prevBodyStylesRef.current = {
          userSelect: body.style.userSelect,
          webkitUserSelect: body.style.webkitUserSelect,
          MozUserSelect: body.style.MozUserSelect,
          msUserSelect: body.style.msUserSelect,
          cursor: body.style.cursor,
        };
      }
      body.style.userSelect = 'none';
      body.style.webkitUserSelect = 'none';
      body.style.MozUserSelect = 'none';
      body.style.msUserSelect = 'none';
      body.style.cursor = 'crosshair';
    } else {
      const prev = prevBodyStylesRef.current;
      if (prev) {
        body.style.userSelect = prev.userSelect || '';
        body.style.webkitUserSelect = prev.webkitUserSelect || '';
        body.style.MozUserSelect = prev.MozUserSelect || '';
        body.style.msUserSelect = prev.msUserSelect || '';
        body.style.cursor = prev.cursor || '';
        prevBodyStylesRef.current = null;
      } else {
        // 底底则未进入拖拽但被调退出（例如项顶初始化）：直接清空。
        body.style.userSelect = '';
        body.style.webkitUserSelect = '';
        body.style.MozUserSelect = '';
        body.style.msUserSelect = '';
        body.style.cursor = '';
      }
    }
  }, []);
  // unmount 兼底：组件卸载时如果还在拖拽，强制还原 body 样式
  useEffect(() => {
    return () => {
      if (prevBodyStylesRef.current) {
        applyDragBodyStyles(false);
      }
    };
  }, [applyDragBodyStyles]);
  // === LM CUSTOMIZATION: DragSelectBodyStyles END ===

  // 把 paintedIds 应用到 baseSet：根据 paintMode 决定是 ∪ 还是 \
  const applyPaint = useCallback(() => {
    const st = stateRef.current;
    const next = new Set(st.baseSet);
    if (st.paintMode === 'remove') {
      st.paintedIds.forEach((id) => next.delete(id));
    } else {
      st.paintedIds.forEach((id) => next.add(id));
    }
    emitIfChanged(next);
  }, [emitIfChanged]);

  const handleMouseDown = useCallback((e) => {
    if (!enabled || e.button !== 0) return;
    if (!containerRef.current) return;

    // Modal 打开时完全不启动框选
    if (isModalOpen()) return;

    // 硬交互控件（input/button/a[href]/contenteditable/...）任何起点都不拦截
    if (isHardInteractive(e.target)) return;

    // 排除"点在滚动条上"的情况
    const container = containerRef.current;
    if (e.target === container) {
      const rect = container.getBoundingClientRect();
      if (e.clientX > rect.left + container.clientWidth) return;
      if (e.clientY > rect.top + container.clientHeight) return;
    }

    // 判断起点是否在结果容器内（用于区分 paint vs rect）
    const isInContainer = container.contains(e.target);

    if (!isInContainer) {
      // 容器外起点（顶部 bar / 左侧 sidebar / 其它空白）：仅记录坐标，不激活 stateRef
      // 等 mousemove 超过 OUTER_DRAG_THRESHOLD 后才正式启动 rect 模式。
      // 不参考 data-drag-select-skip：那只针对容器内的小范围保护。
      stateRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        isActive: false,
        outerPending: true,
        mode: null,
        startedInsideCard: false,
        baseSet: new Set(),
        paintedIds: new Set(),
        paintMode: 'add',
      };

      // 关键：起点是 IMG / A / [draggable=true] 时，浏览器会立刻触发原生 dragstart
      // 必须 preventDefault 否则用户拖动 logo/icon 时被浏览器原生拖拽叼走，
      // 从而看不到我们的选择矩形。preventDefault 不会影响后续 click。
      if (isNativeDragSource(e.target)) {
        e.preventDefault();
      }
      return; // 不干预其他事件处理
    }

    // 容器内起点：保留原有 data-drag-select-skip 视觉隔离区行为
    if (isContainerInnerSkip(e.target)) return;

    const insideCard = isInsideCard(e.target);
    const baseSet = new Set(baseSelectionRef.current || []);
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
      // === LM CUSTOMIZATION: InnerDragThreshold START ===
      // 根因 R2：不再当帧 isActive=true，改为 innerPending，等 mousemove 越过 INNER_DRAG_THRESHOLD 才激活。
      // 位移不足时 mouseup 干净退出，让原生 click 正常派发到卡片 onClick → useDrawerOrSelect 真值表。
      isActive: false,
      innerPending: true,
      // === LM CUSTOMIZATION: InnerDragThreshold END ===
      outerPending: false,
      mode: null,
      startedInsideCard: insideCard,
      baseSet,
      paintedIds: new Set(),
      paintMode,
    };
    resetEmitted(); // [PERF v2] 新一轮拖拽重置等值比较记忆

    // 容器内非卡片区域 preventDefault 阻止文本选区
    if (!insideCard) {
      e.preventDefault();
    }
  }, [enabled, isInsideCard, containerRef, findCardFromEl, resetEmitted]);

  const handleMouseMove = useCallback((e) => {
    const st = stateRef.current;

    // [Round 4 修复 A] mousemove 入口 e.buttons === 0 卫生检查
    // 真因：日志确认 mouseup 偶尔会丢失（React listener 重装空窗期吞了事件 / 或浏览器异常）
    //   导致 outerPending=true 残留 → 下次纯移动鼠标累积位移误激活 rect。
    // 防御：只要鼠标无任何按键按下，强制清理状态并退出。
    // 仅在我们处于"有状态"时干预，避免误伤完全空闲的 mousemove。
    if (e.buttons === 0 && (st.outerPending || st.innerPending || st.isActive)) {
      st.outerPending = false;
      st.innerPending = false;
      st.isActive = false;
      st.mode = null;
      st.paintedIds = new Set();
      setIsDragging(false);
      setSelectionRect(null);
      applyDragBodyStyles(false);
      if (autoScrollRef.current) {
        cancelAnimationFrame(autoScrollRef.current);
        autoScrollRef.current = null;
      }
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      return;
    }

    // 容器外待激活状态：检查是否超过外部阈值
    if (st.outerPending && !st.isActive) {
      const dx = e.clientX - st.startX;
      const dy = e.clientY - st.startY;
      const dist = Math.hypot(dx, dy);
      if (dist >= OUTER_DRAG_THRESHOLD) {
        // 正式激活为 rect 模式，全新选择
        st.isActive = true;
        st.outerPending = false;
        st.mode = 'rect';
        st.baseSet = new Set(); // 从容器外发起 = 全新选择
        setIsDragging(true);
        applyDragBodyStyles(true);
      }
      // 未超阈值则什么都不做（让其他 hook 正常工作）
      if (!st.isActive) return;
    }

    // === LM CUSTOMIZATION: InnerDragThreshold START ===
    // 容器内待激活：达到 INNER_DRAG_THRESHOLD 才正式 isActive，之前不动
    // 避免与 useClickOrDoubleClick.movedRef 双重消费 mousemove。
    if (st.innerPending && !st.isActive) {
      const dx = e.clientX - st.startX;
      const dy = e.clientY - st.startY;
      const dist = Math.hypot(dx, dy);
      if (dist >= INNER_DRAG_THRESHOLD) {
        st.isActive = true;
        st.innerPending = false;
        // mode 仍由下面原逻辑决定（insideCard → 'paint'，否则 'rect'）
      } else {
        return; // 未足阈值：保持静默，click 会正常派发
      }
    }
    // === LM CUSTOMIZATION: InnerDragThreshold END ===

    if (!st.isActive) return;

    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    const dist = Math.hypot(dx, dy);

    // 未达拖拽阈值：不做任何事，留给 click 处理
    if (st.mode === null && dist < DRAG_THRESHOLD) return;

    // 第一次越过阈值：决定模式（仅容器内起点走这里）
    if (st.mode === null) {
      st.mode = st.startedInsideCard ? 'paint' : 'rect';
      setIsDragging(true);
      applyDragBodyStyles(true);

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
      // [PERF v4] 存最后选区矩形，供 autoScroll loop 每帧重算选中集。
      st.lastRectVp = rectVp;

      setSelectionRect({ x, y, width: w, height: h });
      tickAutoScroll(e.clientY);

      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        const next = computeSelectedByRect(rectVp);
        emitIfChanged(next);
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
  }, [tickAutoScroll, computeSelectedByRect, findCardFromEl, applyPaint, applyDragBodyStyles]);

  const handleMouseUp = useCallback((e) => {
    const st = stateRef.current;

    // 容器外待激活状态（没超过阈值的单击）→ 静默清理
    if (st.outerPending) {
      st.outerPending = false;
      st.isActive = false;
      st.mode = null;
      return;
    }

    // === LM CUSTOMIZATION: InnerDragThreshold START ===
    // 容器内待激活状态（没超过阈值的单击）→ 静默清理，不调 onEmptyClick
    // 这里同时不阻止 click 派发，让卡片 onClick / 容器空白区 click 正常走原路径。
    if (st.innerPending) {
      st.innerPending = false;
      st.isActive = false;
      st.mode = null;
      return;
    }
    // === LM CUSTOMIZATION: InnerDragThreshold END ===

    if (!st.isActive) return;

    const wasDragging = st.mode !== null;
    const startedEmpty = !st.startedInsideCard;

    st.isActive = false;
    st.mode = null;
    setIsDragging(false);
    applyDragBodyStyles(false);
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
  }, [containerRef, isInsideCard, applyDragBodyStyles]);

  // 全局监听 mousedown/mousemove/mouseup/dragstart
  useEffect(() => {
    if (!enabled) return;
    // === LM CUSTOMIZATION: NoSelectInResults START ===
    // [Round 8 修复 — 2026-05-21] Shift+click 跨卡片产生大面积金色文本选区
    // 真因：浏览器对 Shift+click "扩展已有 Selection" 走 Selection.extend() 路径，
    //   该路径在 Chromium 实现里**不派发 selectstart 事件**（W3C 规范允许的实现差异），
    //   因此 Round 6 的 document selectstart preventDefault 拦不到这条路径。
    //   现象：用户先单击某张卡片文字（caret 落点），再 Shift+click 另一张卡片文字，
    //   会产生跨 3+ 卡片的 Range；卡片之间的容器节点不在 [data-card-index] 子树内，
    //   命中全局 ::selection { rgba(255,210,48,0.3) }，视觉上整片金色。
    // 策略：在 mousedown 阶段（capture 早期），如果检测到 e.shiftKey && 目标在卡片树内，
    //   主动 removeAllRanges()——浏览器没有起点可"扩展"，跨卡片 Range 创建不出来。
    //   不调用 preventDefault（保留 click 事件正常派发），只清理 Selection 状态。
    // 注：Ctrl/Meta+click 用户实测不出现该问题（可能因为 Chromium 对 Add to Selection
    //   路径行为与 extend 不同），故仅处理 shiftKey，避免过度工程。
    const onDown = (e) => {
      if (e.shiftKey && e.target instanceof Element && e.target.closest('[data-card-index]')) {
        try { window.getSelection()?.removeAllRanges(); } catch (_) { /* ignore */ }
      }
      handleMouseDown(e);
    };
    // === LM CUSTOMIZATION: NoSelectInResults END ===
    const onMove = (e) => handleMouseMove(e);
    const onUp = (e) => handleMouseUp(e);
    // 兜底阻断浏览器原生 dragstart：当我们处于 outerPending 或 isActive 时，
    // 任何浏览器自发的拖拽（IMG/A/draggable=true 等）都会先经过这里被压制。
    // 仅在 hook 状态为"待激活/已激活"时干预，避免误伤其它正常拖拽（如外部文件拖入）。
    const onDragStart = (e) => {
      const st = stateRef.current;
      if (st && (st.outerPending || st.innerPending || st.isActive)) {
        e.preventDefault();
      }
    };

    // [Round 5 修复 — 2026-05-15] Shift+click 跨范围选中 / 卡片文字单击导致黄色文本选区
    // 真因：浏览器原生 Range Selection 由 selectstart 事件触发，不经过 mousedown→drag 路径。
    //   即使在结果容器内永久 user-select:none，CSS 规范规定它"只阻止起点在该元素内的选择"——
    //   用户先点 toolbar（默认 user-select:text）、再 Shift+click 卡片，浏览器跨边界 Range
    //   会把 toolbar→结果卡片之间所有 DOM 都标黄。
    //   v1 仅在 containerRef 内拦截 selectstart：当 target 在 toolbar / sidebar / 卡片文字
    //   等容器外节点上时，Range 仍会被创建并跨入容器内。
    // [Round 6 修复 — 2026-05-15] 进一步扩大阻断范围
    //   产品形态：本应用是资源浏览器，UX 上用户不需要选中卡片文字（要复制 URL 有专门按钮）。
    //   策略改为：document 上无条件阻断 selectstart，仅放行输入控件白名单。
    //   等同 Fab.com / Pinterest / Google Photos 的通用做法。
    // 白名单：input / textarea / contenteditable / [data-allow-select] —— 保留输入选中能力。
    const onSelectStart = (e) => {
      const target = e.target;
      if (!target || !(target instanceof Element)) return;
      // 白名单：可编辑控件、显式标记可选区域不拦截
      if (
        target.closest(
          'input, textarea, [contenteditable="true"], [contenteditable=""], [data-allow-select="true"]'
        )
      ) {
        return;
      }
      e.preventDefault();
    };

    // [Round 4 修复 C] 异常路径兜底重置
    // 真因：mouseup 偶尔会丢失（React 重渲染中 listener 重装空窗 / 浏览器异常）。
    // 兜底：监听 pointercancel / window.blur / document.mouseleave / visibilitychange，
    //   只要 hook 处于"有状态"就强制重置。
    const safetyReset = () => {
      const st = stateRef.current;
      if (!st || (!st.outerPending && !st.innerPending && !st.isActive)) return;
      st.outerPending = false;
      st.innerPending = false;
      st.isActive = false;
      st.mode = null;
      st.paintedIds = new Set();
      setIsDragging(false);
      setSelectionRect(null);
      applyDragBodyStyles(false);
      if (autoScrollRef.current) {
        cancelAnimationFrame(autoScrollRef.current);
        autoScrollRef.current = null;
      }
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
    const onPointerCancel = () => safetyReset();
    const onWindowBlur = () => safetyReset();
    const onDocMouseLeave = (e) => {
      // 仅当鼠标真的离开 document（而非进入子元素）时才触发
      // mouseleave 事件没有冒泡，注册到 document 上时 e.relatedTarget==null 表示离开窗口
      if (!e.relatedTarget && !e.toElement) safetyReset();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') safetyReset();
    };

    document.addEventListener('mousedown', onDown, true); // capture phase to beat other handlers
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('dragstart', onDragStart, true);
    document.addEventListener('selectstart', onSelectStart, true); // Shift+click range select 阻断
    document.addEventListener('pointercancel', onPointerCancel, true);
    window.addEventListener('blur', onWindowBlur);
    document.addEventListener('mouseleave', onDocMouseLeave);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('dragstart', onDragStart, true);
      document.removeEventListener('selectstart', onSelectStart, true);
      document.removeEventListener('pointercancel', onPointerCancel, true);
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('mouseleave', onDocMouseLeave);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (autoScrollRef.current) cancelAnimationFrame(autoScrollRef.current);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [enabled, containerRef, handleMouseDown, handleMouseMove, handleMouseUp]);

  return {
    isDragging,
    selectionRect,
    // handleMouseDown no longer returned — registered via document listener
  };
}
