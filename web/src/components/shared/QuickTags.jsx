import React, { memo, useCallback } from 'react';
import { Wrap, WrapItem, Tag, TagLabel, Tooltip } from '@chakra-ui/react';

/**
 * QuickTags - 快捷标签组件
 * 
 * tag 列表 + 选中高亮 + 点击即时生效
 * 
 * Props:
 * - tags: Array<{ label: string, value: any }> - 标签列表
 * - selectedValue: any - 当前选中值（单选模式）
 * - selectedValues: any[] - 当前选中值列表（多选模式）
 * - excludedValues: any[] - 已在排除列表中的值（展示为「已排除」状态）
 * - onSelect: (value: any) => void - 点击回调（即时生效）
 * - onRemoveExclude: (value: any) => void - 点击已排除项时的额外回调（将其从排除列表移除）
 * - multiSelect: boolean - 是否多选
 * - size: 'sm' | 'md'
 */
const QuickTags = memo(function QuickTags({
  tags = [],
  selectedValue,
  selectedValues = [],
  excludedValues = [],
  onSelect,
  onRemoveExclude,
  multiSelect = false,
  size = 'sm',
}) {
  const handleClick = useCallback((tagValue) => {
    // 如果该值在排除列表中，先从排除移除
    if (excludedValues.includes(tagValue) && onRemoveExclude) {
      onRemoveExclude(tagValue);
    }
    onSelect?.(tagValue);
  }, [onSelect, excludedValues, onRemoveExclude]);

  const isSelected = useCallback((tagValue) => {
    if (multiSelect) {
      return selectedValues.includes(tagValue);
    }
    if (typeof selectedValue === 'object' && selectedValue !== null) {
      return JSON.stringify(selectedValue) === JSON.stringify(tagValue);
    }
    return selectedValue === tagValue;
  }, [multiSelect, selectedValue, selectedValues]);

  return (
    <Wrap spacing={2}>
      {tags.map((tag, idx) => {
        const selected = isSelected(tag.value);
        const excluded = excludedValues.includes(tag.value);

        const tagEl = (
          <Tag
            size="md"
            variant={selected ? 'solid' : 'subtle'}
            bg={
              selected ? 'rgba(255, 210, 48, 0.2)'
              : excluded ? 'rgba(255, 255, 255, 0.03)'
              : 'whiteAlpha.100'
            }
            color={
              selected ? '#FFD230'
              : excluded ? 'whiteAlpha.350'
              : 'whiteAlpha.800'
            }
            border="1px solid"
            borderColor={
              selected ? 'rgba(255, 210, 48, 0.5)'
              : excluded ? 'rgba(255, 255, 255, 0.06)'
              : 'transparent'
            }
            cursor="pointer"
            px={3}
            py={1.5}
            minH="28px"
            borderRadius="6px"
            opacity={excluded ? 0.55 : 1}
            textDecoration={excluded ? 'line-through' : 'none'}
            _hover={{
              bg: selected ? 'rgba(255, 210, 48, 0.3)'
                : excluded ? 'rgba(255, 175, 175, 0.12)'
                : 'whiteAlpha.200',
              borderColor: selected ? 'rgba(255, 210, 48, 0.7)'
                : excluded ? 'rgba(255, 175, 175, 0.3)'
                : 'whiteAlpha.300',
              opacity: 1,
            }}
            transition="all 0.15s ease"
            onClick={() => handleClick(tag.value)}
            userSelect="none"
          >
            <TagLabel fontSize="13px" fontWeight={selected ? '600' : '400'}>
              {tag.label}
            </TagLabel>
          </Tag>
        );

        return (
          <WrapItem key={idx}>
            {excluded ? (
              <Tooltip
                label="已排除，点击可移除排除并选中"
                fontSize="11px"
                placement="top"
                hasArrow
                bg="gray.800"
                color="whiteAlpha.900"
                openDelay={400}
              >
                {tagEl}
              </Tooltip>
            ) : tagEl}
          </WrapItem>
        );
      })}
    </Wrap>
  );
});

export default QuickTags;
