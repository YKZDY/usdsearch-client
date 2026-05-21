/**
 * useDrawerCloseGuard
 *
 * Group A v3.1 — 抽屉关闭守卫 hook（反转白/黑名单语义后的修复版）
 *
 * 设计目标：
 *   解决 v2/v3 实测回归：Chakra `<Drawer>` 默认 `closeOnOverlayClick=true`，
 *   导致用户点任何卡片/复选框/工具栏（事件穿透到 DrawerOverlay）都会自动关闭抽屉。
 *
 *   v3.1 关闭语义（用户拍板：方案 ② 增强版）：
 *     - 关：×按钮 / Esc / 切换服务器(server-changed) / **任何不在 KEEP_OPEN 名单内的页面区域**
 *     - 不关：抽屉自身 / 卡片本体 / 复选框 / 工具栏按钮 / 输入框 / Modal/Popover/Tooltip
 *
 *   关键反转：v3 旧版用"白名单"（只点 data-true-empty-area 才关），但用户期望
 *   "点页面随便哪都能关"。v3.1 改为"黑名单"语义：除 KEEP_OPEN 列出的交互元素外都关。
 *
 * 使用：
 *   ```jsx
 *   useDrawerCloseGuard({
 *     enabled: isDrawerOpen,
 *     onClose: handleDrawerClose,
 *   });
 *   ```
 *
 *   并配合 <Drawer closeOnOverlayClick={false} closeOnEsc={true}>
 *
 * 性能：
 *   仅在 enabled=true 时挂监听，关闭时立即解绑。
 */
import { useEffect, useRef } from 'react';

/**
 * 命中即"短路、不关"的 KEEP_OPEN 名单（v3.1 黑名单的"反面"）
 * - 抽屉自身
 * - 卡片本体（点别的卡片应切换内容，不关抽屉）
 * - 复选框（多选操作不关抽屉）
 * - 输入/按钮/链接（工具栏/搜索框/分类树等交互元素）
 * - Modal/Popover/Tooltip 容器
 */
const KEEP_OPEN_SELECTOR = [
  '[data-multiselect-keep="true"]',
  '[data-card-index]',
  '[data-role="card-checkbox"]',
  'button',
  'input',
  'textarea',
  'select',
  'a',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="option"]',
  '[role="link"]',
  '[role="switch"]',
  '[role="slider"]',
  '[role="treeitem"]',
  '[role="dialog"]',
  '[role="menu"]',
  '.chakra-popover__content',
  '.chakra-modal__content',
  '.chakra-drawer__content',
  '.chakra-drawer__close-btn',
  '.chakra-tooltip',
].join(',');

/** 命中 KEEP_OPEN 即视作"不应关闭" */
function shouldKeepOpen(el) {
  if (!el || el.nodeType !== 1) return true; // 非元素节点保险起见 keep
  try {
    return !!el.closest?.(KEEP_OPEN_SELECTOR);
  } catch {
    return true;
  }
}

export function useDrawerCloseGuard({
  enabled,
  onClose,
  dragThreshold = 8,
  timeThreshold = 500,
  /**
   * 冷启动期（ms）：抽屉刚打开后这段时间内不响应"点空白关"。
   * 用于规避 双击打开抽屉 时第二次 mouseup 落在新出现的 DrawerOverlay 上而被误判为"想关"。
   *
   * v3.6 调优：500 → 250ms。
   *   实测 500ms 让用户感觉"抽屉完全展开后还要再等一下才能点外面关"，体感不丝滑。
   *   浏览器 dblclick 派发窗口实际约 200-300ms，250ms 已能覆盖双击保护，
   *   同时让"动画一结束就能点外面关"的体验回归丝滑。
   */
  warmupMs = 250,
}) {
  // onClose 用 ref 持有，避免 effect 因引用变化反复挂载/卸载
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!enabled) return undefined;
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;

    let downInfo = null; // { x, y, ts }
    // === LM CUSTOMIZATION: SelectionInteraction START ===
    // v3.3 修复"双击秒关"：抽屉刚打开时记录开启时间戳，warmup 内 mousedown/mouseup 一律忽略。
    // 根因：双击事件序列里第二次 mousedown 落在 React 刚 commit 的 DrawerOverlay 上，
    //   DrawerOverlay 不在 KEEP_OPEN 名单 → 守卫判定为"想关" → 抽屉秒收。
    //   此前修复加 data-card-index 无效，因为第二次 mousedown 的 target 已经不是 Card。
    // 合入英伟达新版时：保留本块；该 hook 是 LM 自有逻辑，不影响 NVIDIA 原版。
    const openedAt = Date.now();
    // === LM CUSTOMIZATION: SelectionInteraction END ===

    const handleMouseDown = (e) => {
      if (e.button !== 0) return; // 仅左键
      // === LM CUSTOMIZATION: SelectionInteraction START ===
      // 冷启动期内忽略：双击的第二次 mousedown 不应被记录起点
      if (Date.now() - openedAt < warmupMs) {
        downInfo = null;
        return;
      }
      // === LM CUSTOMIZATION: SelectionInteraction END ===
      // 起点命中 KEEP_OPEN → 不记录，让目标元素自己处理
      if (shouldKeepOpen(e.target)) {
        downInfo = null;
        return;
      }
      downInfo = { x: e.clientX, y: e.clientY, ts: Date.now() };
    };

    const handleMouseUp = (e) => {
      if (e.button !== 0) return;
      const start = downInfo;
      downInfo = null;
      if (!start) return;
      // === LM CUSTOMIZATION: SelectionInteraction START ===
      // 冷启动期内的 mouseup 不触发关闭（即便 down 漏过守卫）
      if (Date.now() - openedAt < warmupMs) return;
      // === LM CUSTOMIZATION: SelectionInteraction END ===
      // 时长校验（避免长按选词误关）
      if (Date.now() - start.ts > timeThreshold) return;
      // 位移校验（避免拖拽误关）
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) > dragThreshold) return;
      // 终点不再要求落在"真空白" — 只要起点不是 KEEP_OPEN 就视为"想关 Drawer"
      // （但终点若已落在 KEEP_OPEN，说明用户中途滑入了交互元素，仍不关）
      if (shouldKeepOpen(e.target)) return;
      try {
        onCloseRef.current?.();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[useDrawerCloseGuard] onClose threw:', err);
      }
    };

    // === LM CUSTOMIZATION: SelectionInteraction START ===
    // v3.6：Chakra 自带的 closeOnEsc 依赖 Drawer 内部焦点；用户用鼠标双击打开抽屉时
    // 焦点不会进入 DrawerContent，导致 Esc 事件落到 body 被吞掉。这里加一道全局兜底，
    // 直接监听 document keydown(Escape) 主动调 onClose，确保 Esc 永远能关。
    // 合入英伟达新版时：本兜底独立于 Chakra Drawer，无冲突。
    const handleKeyDown = (e) => {
      if (e.key !== 'Escape' && e.key !== 'Esc') return;
      // 让输入框/富文本里的 Esc 仍走原生行为（如清空输入），不抢占
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        return;
      }
      try {
        onCloseRef.current?.();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[useDrawerCloseGuard] onClose threw on Esc:', err);
      }
    };
    // === LM CUSTOMIZATION: SelectionInteraction END ===

    document.addEventListener('mousedown', handleMouseDown, false);
    document.addEventListener('mouseup', handleMouseUp, false);
    document.addEventListener('keydown', handleKeyDown, false);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown, false);
      document.removeEventListener('mouseup', handleMouseUp, false);
      document.removeEventListener('keydown', handleKeyDown, false);
      downInfo = null;
    };
  }, [enabled, dragThreshold, timeThreshold, warmupMs]);
}

export default useDrawerCloseGuard;
