import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

/**
 * FilterGroupContext — 让同一 toolbar 内的多个 FilterPopoverButton 互斥打开
 *
 * 设计要点：
 *  1. activeId 单一 state 指向当前打开的 FilterPopoverButton 的 groupId
 *  2. 无 Provider 时，FilterPopoverButton 退化为独立 useDisclosure（不互斥）
 *  3. onClose 幂等保护：prev === groupId 才清空（避免"切换到 B 时 A 的 onClose 把 B 覆盖成 null"）
 *  4. isSwitching flag：切换期间短暂置 true，让被动关闭的那一方抑制 returnFocusOnClose 抢焦点
 */

const FilterGroupContext = createContext(null);

export function FilterGroupProvider({ children }) {
  const [activeId, setActiveIdState] = useState(null);
  // 切换期标志：由"正在打开新 popover"这一方短暂置 true，持续约 1 帧。
  // 被动关闭的旧 popover 读到该标志 → 不做 returnFocus，避免抢 B 的 trigger 焦点。
  const isSwitchingRef = useRef(false);

  /**
   * 打开指定 popover：
   *  - 如果当前已经有别的 popover 打开（activeId !== null && !== id），标记 isSwitching=true
   *  - 置 activeId = id
   *  - 1 帧后清 isSwitching
   */
  const openPopover = useCallback((id) => {
    if (!id) return;
    setActiveIdState(prev => {
      if (prev && prev !== id) {
        isSwitchingRef.current = true;
        // 切换到下一帧再清，确保旧 popover 的 onClose / returnFocus 能读到
        queueMicrotask(() => {
          // 先延一帧再延一帧（framer-motion exit 动画最快 ~100ms，用 setTimeout 更稳）
          setTimeout(() => { isSwitchingRef.current = false; }, 16);
        });
      }
      return id;
    });
  }, []);

  /**
   * 关闭指定 popover — 幂等保护：只有当前 active 的才能清。
   * 防止"切换到 B 时 A 的 onClose 晚到，把 activeId 从 B 覆盖成 null"的竞态。
   */
  const closePopover = useCallback((id) => {
    if (!id) return;
    setActiveIdState(prev => (prev === id ? null : prev));
  }, []);

  const getIsSwitching = useCallback(() => isSwitchingRef.current, []);

  const value = useMemo(() => ({
    activeId,
    openPopover,
    closePopover,
    getIsSwitching,
  }), [activeId, openPopover, closePopover, getIsSwitching]);

  return (
    <FilterGroupContext.Provider value={value}>
      {children}
    </FilterGroupContext.Provider>
  );
}

/**
 * useFilterGroup — 可选 hook，返回 context value 或 null（无 Provider 时）
 * FilterPopoverButton 内部用它做"有 Provider 走互斥，无 Provider 退化"
 */
export function useFilterGroup() {
  return useContext(FilterGroupContext);
}
