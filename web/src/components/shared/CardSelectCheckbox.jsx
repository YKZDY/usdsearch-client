import React, { useEffect, useRef, useState } from 'react';
import { Box } from '@chakra-ui/react';
import './CardSelectCheckbox.css';
// === LM CUSTOMIZATION: SelectionInteraction START ===
// Group A 任务 5：方案 B 新交互需要识别"复选框命中"，
// 通过 data-role 属性 + FEATURE_FLAGS.SINGLE_CLICK_DRAWER 控制事件冒泡策略。
import { FEATURE_FLAGS } from '../../config';
// === LM CUSTOMIZATION: SelectionInteraction END ===

const FIRST_REVEAL_KEY = 'usdsearch.multiSelect.firstShown';

/**
 * 卡片左上角的多选 Checkbox（极致体验版）
 *
 * 行为：
 * - 静默态（非多选 + 非选中 + 非 hover）：完全隐藏
 * - hover 卡片（pointer: fine）：120ms 延迟淡入显示空圆圈
 * - 触屏设备（hover: none）：常显低透明（55%），保留可发现性
 * - 多选模式：始终显示
 * - 选中态：金色背景 + ✓ + 外发光，强反馈
 * - 全局首次进多选时：一次性弹性呼吸光晕，吸引视觉
 */
const CardSelectCheckbox = React.memo(({ isSelected, isMultiSelectMode, onToggle }) => {
  const [showFirstReveal, setShowFirstReveal] = useState(false);
  const playedRef = useRef(false);

  // 全局首次进多选 → 触发一次性呼吸动画（跨刷新持久化）
  useEffect(() => {
    if (!isMultiSelectMode || !isSelected || playedRef.current) return;
    try {
      if (localStorage.getItem(FIRST_REVEAL_KEY) === '1') return;
      localStorage.setItem(FIRST_REVEAL_KEY, '1');
    } catch (_) { /* localStorage 不可用时忽略 */ }
    playedRef.current = true;
    setShowFirstReveal(true);
    const t = setTimeout(() => setShowFirstReveal(false), 750);
    return () => clearTimeout(t);
  }, [isMultiSelectMode, isSelected]);

  const handleClick = (e) => {
    // === LM CUSTOMIZATION: SelectionInteraction START ===
    // 方案 B 双轨：
    //   - SINGLE_CLICK_DRAWER=true（新交互）：不阻止冒泡，让事件冒泡到 Card，
    //     由 useDrawerOrSelect 通过 [data-role="card-checkbox"] 识别为复选框命中
    //     后统一处理（行 1/3/5 = toggle/区间追加/Ctrl-toggle）。本地不再调 onToggle，
    //     避免双重触发。
    //   - SINGLE_CLICK_DRAWER=false（旧交互回退）：保留原行为，
    //     stopPropagation + onToggle，避免双 toggle 抵消。
    if (FEATURE_FLAGS && FEATURE_FLAGS.SINGLE_CLICK_DRAWER) {
      // 不 stopPropagation，不调 onToggle —— 交给上层 hook
      return;
    }
    e.stopPropagation();
    onToggle?.();
    // === LM CUSTOMIZATION: SelectionInteraction END ===
  };

  const cls = [
    'card-select-checkbox',
    isMultiSelectMode ? 'always-visible' : '',
    isSelected ? 'checked' : '',
    showFirstReveal ? 'first-reveal' : '',
  ].filter(Boolean).join(' ');

  return (
    <Box
      className={cls}
      // === LM CUSTOMIZATION: SelectionInteraction START ===
      // data-role 用于 useDrawerOrSelect hook 识别"复选框命中区"（方案 B 行 1/3/5）。
      // 命中时事件冒泡到 Card.onClick，由 hook 通过 e.target.closest('[data-role="card-checkbox"]') 判定。
      data-role="card-checkbox"
      // === LM CUSTOMIZATION: SelectionInteraction END ===
      position="absolute"
      top={2}
      left={2}
      zIndex={10}
      // R-1.1: 命中区统一 24×24px（原未选中 22px → 24px，对齐可达性最小触摸目标，
      // 视觉差异 2px 几乎不可见，命中容差提升 ~20%。Group A 任务 2）
      boxSize="24px"
      borderRadius="full"
      display="flex"
      alignItems="center"
      justifyContent="center"
      fontSize={isSelected ? "13px" : "xs"}
      fontWeight="bold"
      cursor="pointer"
      onClick={handleClick}
      role="checkbox"
      aria-checked={isSelected}
      aria-label={isSelected ? '取消选中此卡片' : '选中此卡片'}
      bg={isSelected ? "#FFD230" : "rgba(28, 29, 32, 0.85)"}
      color={isSelected ? "black" : "rgba(255, 255, 255, 0.75)"}
      border={isSelected ? "none" : "1.5px solid rgba(255, 255, 255, 0.5)"}
      backdropFilter="blur(6px)"
      _hover={{
        bg: isSelected ? "#FFE066" : "rgba(255, 210, 48, 0.18)",
        borderColor: isSelected ? "none" : "rgba(255, 210, 48, 0.9)",
        transform: "scale(1.12)",
      }}
    >
      {isSelected ? '✓' : ''}
    </Box>
  );
});

CardSelectCheckbox.displayName = 'CardSelectCheckbox';

export default CardSelectCheckbox;
