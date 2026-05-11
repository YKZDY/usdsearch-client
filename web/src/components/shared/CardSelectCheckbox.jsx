import React from 'react';
import { Box } from '@chakra-ui/react';
import './CardSelectCheckbox.css';

/**
 * 卡片左上角的多选 Checkbox
 * - 默认模式（非多选）：仅 hover 卡片左上角区域时淡入显示
 * - 多选模式：始终显示
 * - 选中状态：金色背景 + ✓
 * - 未选中状态：半透明边框圆圈
 */
const CardSelectCheckbox = React.memo(({ isSelected, isMultiSelectMode, onToggle }) => {
  const handleClick = (e) => {
    e.stopPropagation();
    onToggle?.();
  };

  return (
    <Box
      className={`card-select-checkbox ${isMultiSelectMode ? 'always-visible' : ''} ${isSelected ? 'checked' : ''}`}
      position="absolute"
      top={2}
      left={2}
      zIndex={10}
      boxSize="22px"
      borderRadius="full"
      display="flex"
      alignItems="center"
      justifyContent="center"
      fontSize="xs"
      fontWeight="bold"
      cursor="pointer"
      onClick={handleClick}
      bg={isSelected ? "#FFD230" : "rgba(40, 40, 44, 0.8)"}
      color={isSelected ? "black" : "rgba(255, 255, 255, 0.6)"}
      border={isSelected ? "none" : "1.5px solid rgba(255, 255, 255, 0.4)"}
      _hover={{
        bg: isSelected ? "#FFD230" : "rgba(60, 60, 64, 0.9)",
        borderColor: isSelected ? "none" : "rgba(255, 210, 48, 0.8)",
        transform: "scale(1.1)",
      }}
      transition="all 0.15s ease"
    >
      {isSelected ? '✓' : ''}
    </Box>
  );
});

CardSelectCheckbox.displayName = 'CardSelectCheckbox';

export default CardSelectCheckbox;
