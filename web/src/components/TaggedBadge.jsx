/**
 * TaggedBadge - 命中卡片左上角角标（V2 Q1-A）
 *
 * 在搜索命中是由 tags.tag_field 触发时显示，提示用户这个资产已被打过该 tag。
 * 金色胶囊风格，融入 Fab 视觉体系。
 */

import React from 'react';
import { Box, Text } from '@chakra-ui/react';

const SIZE_PRESETS = {
  sm: { h: '18px', px: 1.5, fontSize: '10px' },
  md: { h: '22px', px: 2,   fontSize: '11px' },
};

export default function TaggedBadge({ size = 'md', label = '🏷 Tagged', style }) {
  const preset = SIZE_PRESETS[size] || SIZE_PRESETS.md;
  return (
    <Box
      position="absolute"
      top="6px"
      left="6px"
      zIndex={3}
      pointerEvents="none"
      h={preset.h}
      px={preset.px}
      display="flex"
      alignItems="center"
      gap={1}
      borderRadius="10px"
      bg="rgba(255, 210, 48, 0.18)"
      border="1px solid #FFD230"
      boxShadow="0 2px 6px rgba(0, 0, 0, 0.35)"
      backdropFilter="blur(6px)"
      style={style}
      aria-label="Tagged"
    >
      <Text
        fontSize={preset.fontSize}
        fontWeight={600}
        color="#FFD230"
        lineHeight={1}
        letterSpacing="0.3px"
      >
        {label}
      </Text>
    </Box>
  );
}
