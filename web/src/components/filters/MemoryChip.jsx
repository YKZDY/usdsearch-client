import React, { memo } from 'react';
import { Box, HStack, Text, Icon } from '@chakra-ui/react';
import { CloseIcon } from '@chakra-ui/icons';

/**
 * MemoryChip - 精致徽章式记忆 chip（路径/标签/精度共用）
 *
 * 设计语言：
 * - 暗背景 + 双层信息（icon segment + text）
 * - hover 时金色辉光（呼应站点 #FFD230 主题）
 * - 比传统 dashed 边框更精致，比纯实色更克制
 *
 * Props:
 * - segments: Array<{ icon?: ReactNode, label: string, tone?: 'neutral' | 'positive' | 'negative' | 'gold' }>
 *             多 segment 之间用细分隔线
 * - onClick: 点击应用记忆
 * - onRemove: 点击 × 移除（不会冒泡到 onClick）
 * - tooltip: 可选完整路径提示（title 属性）
 */

const TONE_MAP = {
  neutral: { bg: 'rgba(255,255,255,0.06)', color: 'whiteAlpha.800', iconColor: 'whiteAlpha.600' },
  positive: { bg: 'rgba(120, 180, 255, 0.10)', color: 'rgba(180, 215, 255, 0.95)', iconColor: 'rgba(160, 200, 255, 0.85)' },
  negative: { bg: 'rgba(255, 130, 130, 0.10)', color: 'rgba(255, 175, 175, 0.95)', iconColor: 'rgba(255, 150, 150, 0.85)' },
  gold:     { bg: 'rgba(255, 210, 48, 0.10)', color: 'rgba(255, 230, 130, 0.98)', iconColor: 'rgba(255, 210, 48, 0.85)' },
};

const MemoryChip = memo(function MemoryChip({ segments = [], onClick, onRemove, tooltip }) {
  if (!segments.length) return null;

  return (
    <HStack
      as="div"
      spacing={0}
      h="30px"
      bg="rgba(255,255,255,0.04)"
      border="1px solid rgba(255,255,255,0.10)"
      borderRadius="8px"
      cursor={onClick ? 'pointer' : 'default'}
      transition="all 0.18s cubic-bezier(0.4, 0, 0.2, 1)"
      title={tooltip}
      _hover={{
        bg: 'rgba(255, 210, 48, 0.06)',
        borderColor: 'rgba(255, 210, 48, 0.35)',
        boxShadow: '0 0 0 1px rgba(255, 210, 48, 0.15), 0 4px 12px -4px rgba(255, 210, 48, 0.25)',
        transform: 'translateY(-1px)',
      }}
      onClick={onClick}
      userSelect="none"
      role="button"
      overflow="hidden"
    >
      {segments.map((seg, idx) => {
        const tone = TONE_MAP[seg.tone || 'neutral'];
        return (
          <React.Fragment key={idx}>
            {idx > 0 && (
              <Box
                w="1px"
                h="14px"
                bg="rgba(255,255,255,0.10)"
                flexShrink={0}
              />
            )}
            <HStack
              spacing={1.5}
              px={2.5}
              h="100%"
              bg={tone.bg}
              flexShrink={0}
            >
              {seg.icon && (
                <Box color={tone.iconColor} display="flex" alignItems="center" fontSize="11px">
                  {seg.icon}
                </Box>
              )}
              <Text
                fontSize="12px"
                fontWeight="500"
                color={tone.color}
                letterSpacing="0.01em"
                whiteSpace="nowrap"
                maxW="200px"
                overflow="hidden"
                textOverflow="ellipsis"
              >
                {seg.label}
              </Text>
              {seg.badge && (
                <Box
                  bg="rgba(255,255,255,0.10)"
                  color={tone.color}
                  fontSize="11px"
                  fontWeight="500"
                  px={1.5}
                  py={0}
                  h="17px"
                  lineHeight="17px"
                  borderRadius="full"
                  letterSpacing="0.02em"
                  flexShrink={0}
                >
                  {seg.badge}
                </Box>
              )}
            </HStack>
          </React.Fragment>
        );
      })}

      {onRemove && (
        <Box
          as="button"
          h="100%"
          px={2}
          color="whiteAlpha.500"
          bg="transparent"
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
          borderLeft="1px solid rgba(255,255,255,0.08)"
          transition="all 0.15s ease"
          _hover={{ color: '#FF8A8A', bg: 'rgba(255, 130, 130, 0.10)' }}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(e);
          }}
          aria-label="remove"
        >
          <Icon as={CloseIcon} w="8px" h="8px" />
        </Box>
      )}
    </HStack>
  );
});

export default MemoryChip;
