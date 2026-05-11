import React, { memo, useCallback, useMemo } from 'react';
import { HStack, Box, Tag, TagLabel, TagCloseButton, Tooltip } from '@chakra-ui/react';
import { CalendarIcon } from '@chakra-ui/icons';
import { formatRangeShort, calcDays } from '../../utils/dateFormat';

/**
 * MemoryDateChip - 美化的日期记忆 chip
 *
 * 视觉：
 * - 胶囊：bg=whiteAlpha.100, borderLeft=2px solid #7BC8FF
 * - 前缀：日历小图标
 * - 文本：紧凑（formatRangeShort，同年省略年份）
 * - hover：左侧边条变深 + 微微提亮 + 显示天数 Tooltip
 * - 激活态：金色实底（与 QuickTags 选中态一致）
 *
 * Props:
 * - memory: { label, value: { after, before } }
 * - isActive: boolean
 * - onClick: () => void
 * - onRemove: () => void
 * - t?: i18n
 */
const MemoryDateChip = memo(function MemoryDateChip({
  memory,
  isActive,
  onClick,
  onRemove,
  t,
}) {
  const after = memory?.value?.after || '';
  const before = memory?.value?.before || '';

  const toNowLabel = t?.('dateToNow') || '至今';
  const days = useMemo(() => calcDays(after, before), [after, before]);
  const compact = useMemo(
    () => formatRangeShort(after, before, toNowLabel) || memory?.label || '',
    [after, before, toNowLabel, memory?.label]
  );
  const tooltipLabel = useMemo(() => {
    const tpl = t?.('dateDays') || '共 {n} 天';
    return tpl.replace('{n}', String(days));
  }, [t, days]);

  const handleClick = useCallback(() => onClick?.(), [onClick]);
  const handleRemove = useCallback((e) => {
    e.stopPropagation();
    onRemove?.();
  }, [onRemove]);

  return (
    <Tooltip
      label={tooltipLabel}
      placement="top"
      hasArrow
      openDelay={350}
      fontSize="11px"
      bg="gray.800"
      color="whiteAlpha.900"
    >
      <Tag
        size="md"
        cursor="pointer"
        onClick={handleClick}
        userSelect="none"
        bg={isActive ? 'rgba(255, 210, 48, 0.2)' : 'whiteAlpha.100'}
        color={isActive ? '#FFD230' : 'whiteAlpha.800'}
        border="1px solid"
        borderColor={isActive ? 'rgba(255, 210, 48, 0.5)' : 'transparent'}
        borderLeftWidth="2px"
        borderLeftColor={isActive ? '#FFD230' : '#7BC8FF'}
        borderRadius="6px"
        px={2.5}
        py={1.5}
        minH="28px"
        transition="all 0.15s ease"
        _hover={{
          bg: isActive ? 'rgba(255, 210, 48, 0.3)' : 'whiteAlpha.200',
          borderColor: isActive ? 'rgba(255, 210, 48, 0.7)' : 'whiteAlpha.300',
          borderLeftColor: isActive ? '#FFD230' : '#7BC8FF',
          boxShadow: isActive
            ? 'inset 0 0 0 1px rgba(255,210,48,0.4)'
            : 'inset 0 0 0 1px rgba(123,200,255,0.25)',
        }}
      >
        <HStack spacing={1.5} pr={1}>
          <Box display="flex" alignItems="center" justifyContent="center" w="14px">
            <CalendarIcon boxSize={2.5} color={isActive ? '#FFD230' : '#7BC8FF'} />
          </Box>
          <TagLabel fontSize="12px" fontWeight={isActive ? 600 : 500} letterSpacing="0.01em">
            {compact}
          </TagLabel>
        </HStack>
        <TagCloseButton
          aria-label="remove memory"
          onClick={handleRemove}
          opacity={0.7}
          _hover={{ opacity: 1, color: isActive ? '#FFD230' : '#FF8B8B' }}
        />
      </Tag>
    </Tooltip>
  );
});

export default MemoryDateChip;
