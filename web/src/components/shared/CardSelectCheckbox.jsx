import React, { useEffect, useRef, useState } from 'react';
import { Box } from '@chakra-ui/react';
import './CardSelectCheckbox.css';

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
    e.stopPropagation();
    onToggle?.();
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
      position="absolute"
      top={2}
      left={2}
      zIndex={10}
      boxSize={isSelected ? "24px" : "22px"}
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
