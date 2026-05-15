/**
 * useKeyboardShortcuts - 全局键盘快捷键（V2 E5 + U4 + U7）
 *
 * - Ctrl+A / Cmd+A：
 *     第一次调用 → selectVisible()（仅视口内）
 *     连续再按 → selectAll()
 * - Esc：clearSelection()
 * - T：若 isMultiSelectMode() 且无输入框 focus → openBatchModal()
 *
 * 设计：
 *   - 挂 document.addEventListener('keydown')，unmount 清理
 *   - 所有 state 通过 ref 读取，避免 stale closure
 *   - 每次 keydown 先做 activeElement 守卫（U7）
 */

import { useEffect, useRef } from 'react';

function isEditableTarget() {
  const el = document.activeElement;
  if (!el || el === document.body) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

/**
 * @param {Object} params
 * @param {() => boolean} [params.isMultiSelectMode]
 * @param {() => boolean} [params.isBatchModalOpen] - 打开时 T 不再触发、Esc 交给 Modal 自己处理
 * @param {() => void}    [params.selectVisible]    - Ctrl+A 第一次
 * @param {() => void}    [params.selectAll]        - Ctrl+A 第二次
 * @param {() => void}    [params.clearSelection]   - Esc
 * @param {() => void}    [params.openBatchModal]   - T
 * @param {() => boolean} [params.enabled]          - 整体开关，默认 true
 */
export default function useKeyboardShortcuts(params = {}) {
  const refs = useRef(params);
  useEffect(() => { refs.current = params; });

  // Ctrl+A 状态机：上次按 Ctrl+A 时间戳，用于判断"连续再按"
  const lastCtrlARef = useRef(0);

  useEffect(() => {
    const handler = (e) => {
      const {
        isMultiSelectMode,
        isBatchModalOpen,
        selectVisible,
        selectAll,
        clearSelection,
        openBatchModal,
        enabled,
      } = refs.current || {};

      if (enabled && typeof enabled === 'function' && !enabled()) return;

      // U7：输入框 focus 时跳过所有字母快捷键（Esc/Ctrl+A 也跳过，原生行为优先）
      if (isEditableTarget()) return;

      const key = e.key;
      const isCtrlA = (e.ctrlKey || e.metaKey) && (key === 'a' || key === 'A');
      const isEsc = key === 'Escape';
      const isT = !e.ctrlKey && !e.metaKey && !e.altKey && (key === 't' || key === 'T');

      if (isBatchModalOpen?.()) {
        // 弹框打开时：T 不触发；Esc 让 Chakra Modal 自己处理
        return;
      }

      // === LM CUSTOMIZATION: SelectionDrawer START ===
      // 原因：方案 B（Windows 复选框模式）下 ESC 应优先关闭任何打开的 dialog
      //       （包括 AssetDetailsDrawer / BatchTagModal / 各类 Modal），
      //       第二次按 ESC 才清选中。这避免"按一次 ESC 同时关抽屉+清选中"。
      // 合入英伟达新版时：保留本守卫，原版 V2 hook 没有此逻辑
      if (isEsc) {
        const anyDialog = typeof document !== 'undefined'
          ? document.querySelector('[role="dialog"][aria-modal="true"]')
          : null;
        if (anyDialog) return;
      }
      // === LM CUSTOMIZATION: SelectionDrawer END ===

      if (isCtrlA && typeof selectVisible === 'function') {
        const now = Date.now();
        const isConsecutive = now - lastCtrlARef.current < 700;
        lastCtrlARef.current = now;
        e.preventDefault();
        if (isConsecutive && typeof selectAll === 'function') {
          selectAll();
        } else {
          selectVisible();
        }
        return;
      }

      if (isEsc && isMultiSelectMode?.() && typeof clearSelection === 'function') {
        clearSelection();
        return;
      }

      if (isT && isMultiSelectMode?.() && typeof openBatchModal === 'function') {
        e.preventDefault();
        openBatchModal();
        return;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
}
