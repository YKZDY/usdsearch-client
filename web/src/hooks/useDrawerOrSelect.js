/**
 * useDrawerOrSelect — Group A 选择交互核心 hook（方案 B：完整对齐 Windows 复选框模式）
 *
 * 严格按 .codebuddy/plan/group-a-selection-and-detail/SELECTION-SPEC.md 真值表实现：
 *
 *   |  # | 修饰键     | 点击位置 | 选中变化                              | anchor      | 抽屉 |
 *   |----|------------|---------|---------------------------------------|-------------|------|
 *   |  1 | 无         | 复选框  | toggle 该项                           | ← 设为该项  | ❌   |
 *   |  2 | 无         | 本体    | 不变                                  | 不变        | ✅   |
 *   |  3 | Shift      | 复选框  | 追加 anchor→target 区间（保留已选）   | 不变        | ❌   |
 *   |  4 | Shift      | 本体    | 覆盖 — 仅保留 anchor→target 区间      | 不变        | ❌   |
 *   |  5 | Ctrl/Cmd   | 复选框  | toggle 该项                           | ← 设为该项  | ❌   |
 *   |  6 | Ctrl/Cmd   | 本体    | toggle 该项                           | ← 设为该项  | ❌   |
 *   |  7 | Shift+Ctrl | 任意    | 同 #3 / #4（按位置；Shift 优先）      | 不变        | ❌   |
 *
 *   边界：
 *   - anchor=null + Shift 点击 → 退化为无修饰键单击（行 1 / 2）
 *   - anchor 已被搜索结果刷掉（不在当前 results 数组）→ 视作 anchor=null
 *
 * 用法：
 *   const { handleClick, handleDoubleClick, anchorId } = useDrawerOrSelect({
 *     results,                  // 当前可见结果数组（顺序敏感）
 *     getId,                    // (asset) => string，从 asset 提取唯一 id
 *     selectedIds,              // Set<string>，当前已选 id 集合
 *     setSelectedIds,           // (Set<string>) => void
 *     onOpenDrawer,             // (asset) => void，打开右侧详情 Drawer
 *     onOpenLegacyModal,        // (asset) => void，旗标关闭时双击打开旧 Modal
 *     enabled,                  // FEATURE_FLAGS.NEW_CARD_INTERACTION
 *     drawerEnabled,            // FEATURE_FLAGS.SINGLE_CLICK_DRAWER
 *   });
 *
 *   <Box
 *     onClick={(e) => handleClick(e, asset)}
 *     onDoubleClick={(e) => handleDoubleClick(e, asset)}
 *   >
 *     <Box data-role="card-checkbox" onClick={(e) => handleClick(e, asset)} />
 *   </Box>
 *
 * 复选框命中区识别约定：
 *   元素或其祖先带 [data-role="card-checkbox"] 属性 → 视为复选框点击。
 *
 * 与 useClickOrDoubleClick 的关系：
 *   本 hook 替代 useClickOrDoubleClick 中"toggle vs 打开详情"的语义判断；
 *   不再依赖 dblclick 回滚机制（方案 B 下单击本体不再 toggle，无需回滚）。
 */
import { useCallback, useMemo, useRef } from 'react';

const CHECKBOX_SELECTOR = '[data-role="card-checkbox"]';

/** 判断 click 事件是否落在复选框命中区 */
function isCheckboxClick(event) {
  if (!event || !event.target) return false;
  // closest 自身也算命中
  return typeof event.target.closest === 'function'
    ? event.target.closest(CHECKBOX_SELECTOR) != null
    : false;
}

/** 取 anchor 在 results 数组中的下标；不存在返回 -1 */
function indexOfId(results, getId, id) {
  if (id == null) return -1;
  for (let i = 0; i < results.length; i += 1) {
    if (getId(results[i]) === id) return i;
  }
  return -1;
}

/** 计算 anchor→target 闭区间内所有 id（顺序无关） */
function computeRangeIds(results, getId, anchorIdx, targetIdx) {
  const lo = Math.min(anchorIdx, targetIdx);
  const hi = Math.max(anchorIdx, targetIdx);
  const ids = [];
  for (let i = lo; i <= hi; i += 1) {
    ids.push(getId(results[i]));
  }
  return ids;
}

export function useDrawerOrSelect({
  results,
  getId,
  selectedIds,
  setSelectedIds,
  onOpenDrawer,
  onOpenLegacyModal,
  enabled = true,
  drawerEnabled = true,
}) {
  // anchor = 上一次"无修饰键 / Ctrl"点击产生的锚点 id
  const anchorIdRef = useRef(null);

  /** 行 1 / 5 / 6：toggle 单项 + 设 anchor */
  const toggleOneAndAnchor = useCallback((asset) => {
    const id = getId(asset);
    const next = new Set(selectedIds || []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
    anchorIdRef.current = id;
  }, [getId, selectedIds, setSelectedIds]);

  /** 行 3：追加区间到选中（不清空原有） */
  const addRangeToSelection = useCallback((rangeIds) => {
    const next = new Set(selectedIds || []);
    for (const id of rangeIds) next.add(id);
    setSelectedIds(next);
  }, [selectedIds, setSelectedIds]);

  /** 行 4：仅保留区间（覆盖式） */
  const replaceSelectionWithRange = useCallback((rangeIds) => {
    setSelectedIds(new Set(rangeIds));
  }, [setSelectedIds]);

  /** 行 2：打开 Drawer，不动选中、不动 anchor */
  const openDrawer = useCallback((asset) => {
    onOpenDrawer?.(asset);
  }, [onOpenDrawer]);

  /** 无修饰键路径分流（行 1 vs 行 2） */
  const handleNoModifier = useCallback((checkbox, asset) => {
    if (checkbox) {
      toggleOneAndAnchor(asset);
    } else {
      openDrawer(asset);
    }
  }, [toggleOneAndAnchor, openDrawer]);

  const handleClick = useCallback((event, asset) => {
    if (!enabled || !asset) return;

    // 旗标关闭：完整退回 NVIDIA 原版语义
    // — 由调用方传入的旧 onClick 处理，本 hook 在外层判断 drawerEnabled
    // 此处仅在 drawerEnabled=true 时进入
    if (!drawerEnabled) return;

    // [P2 扩展点 — 任务 9 子项 6] 触屏长按 = Ctrl+click（本期不实现，仅留接入点）
    //   未来实现思路：在卡片层用 useLongPress({ duration: 500 }) 包装 onPointerDown，
    //   触发后将 event.ctrlKey 模拟为 true 后再 dispatch 给本 handleClick；
    //   或新增 longPress 入参直接走 toggleOneAndAnchor。
    //   不在此 hook 内监听 pointerdown / setTimeout，保持本 hook 纯逻辑无副作用。

    const checkbox = isCheckboxClick(event);
    const shift = !!event.shiftKey;
    const ctrl = !!(event.ctrlKey || event.metaKey);

    // —— 修饰键优先级：Shift > Ctrl > 无（同时按 Shift+Ctrl 时按 Shift 处理）
    if (shift) {
      const anchorId = anchorIdRef.current;
      const anchorIdx = indexOfId(results, getId, anchorId);
      // === LM CUSTOMIZATION: ShiftClickRobustness START ===
      // 修复 R-A：anchor 缺失（首次 Shift+click / 搜索结果刷新后）
      //   原行为：退化为无修饰键单击 → 打开 Drawer。
      //   用户报告体感是 bug：「Shift+单击居然打开 Drawer 而不是进多选」。
      //   预期：Shift+click 永远应进入多选模式，即使 anchor=null。
      //   新行为：anchor 缺失时等价于 Ctrl+click → toggle 该项 + 设为新 anchor，
      //   后续 Shift+click 立即可正常做区间选。
      // 合入英伟达新版时：保留本块。
      if (anchorIdx < 0) {
        toggleOneAndAnchor(asset);
        return;
      }
      // === LM CUSTOMIZATION: ShiftClickRobustness END ===
      const targetIdx = indexOfId(results, getId, getId(asset));
      if (targetIdx < 0) {
        // target 不在 results（理论不会发生，保险）— 同样退化为 toggle
        toggleOneAndAnchor(asset);
        return;
      }
      const rangeIds = computeRangeIds(results, getId, anchorIdx, targetIdx);
      if (checkbox) {
        addRangeToSelection(rangeIds); // 行 3
      } else {
        replaceSelectionWithRange(rangeIds); // 行 4
      }
      // anchor 不变；抽屉不打开
      return;
    }

    if (ctrl) {
      // 行 5 / 6：复选框 / 本体均 toggle + 设 anchor，不打开抽屉
      toggleOneAndAnchor(asset);
      return;
    }

    // 无修饰键：行 1 / 行 2
    handleNoModifier(checkbox, asset);
  }, [
    enabled,
    drawerEnabled,
    results,
    getId,
    handleNoModifier,
    addRangeToSelection,
    replaceSelectionWithRange,
    toggleOneAndAnchor,
  ]);

  /**
   * 双击：
   *  - drawerEnabled=true：双击本体 = 等同单击本体 = 打开 Drawer
   *    （用户实测反馈：双击不应无反应；同时双击复选框=维持 toggle 行为，由 onClick 已处理）
   *  - drawerEnabled=false：旗标关闭时由外层 useClickOrDoubleClick 接管，
   *    本 hook 此分支不会被调用（外层 if 跳过）。
   */
  const handleDoubleClick = useCallback((event, asset) => {
    if (!enabled || !asset) return;
    if (!drawerEnabled) {
      // 兼容旧版：双击打开 Modal（仅在外层未接管时作为兜底）
      onOpenLegacyModal?.(asset);
      return;
    }
    // drawerEnabled=true：双击本体 → 打开 Drawer；双击复选框 → 不触发（onClick 的 toggle 已处理两次）
    if (!isCheckboxClick(event)) {
      onOpenDrawer?.(asset);
    }
  }, [enabled, drawerEnabled, onOpenLegacyModal, onOpenDrawer]);

  /** 暴露 anchor 给外部用于调试 / 测试（不参与渲染） */
  const getAnchorId = useCallback(() => anchorIdRef.current, []);

  /** 外部清空选中时同步清掉 anchor（避免 anchor 指向不存在项） */
  const resetAnchor = useCallback(() => {
    anchorIdRef.current = null;
  }, []);

  // 任务 8 性能调优：return 对象用 useMemo 稳定，避免传给子组件破坏 memo 链
  return useMemo(() => ({
    handleClick,
    handleDoubleClick,
    getAnchorId,
    resetAnchor,
  }), [handleClick, handleDoubleClick, getAnchorId, resetAnchor]);
}

export default useDrawerOrSelect;
