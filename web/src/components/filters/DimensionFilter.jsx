import React, { memo, useCallback, useMemo } from 'react';
import { VStack, HStack, Text, Input, Switch, FormControl, FormLabel, Box, Wrap, WrapItem, Tag, TagLabel } from '@chakra-ui/react';
import FilterPopoverButton from './FilterPopoverButton';
import MemoryChip from './MemoryChip';
import { useFilterMemory } from '../../hooks/useFilterMemory';

/** 立方体（尺寸）图标 */
const CubeIcon = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
    <path d="M8 1.5L14 4.5v7L8 14.5L2 11.5v-7z" />
    <path d="M2 4.5L8 7.5L14 4.5" />
    <path d="M8 7.5V14.5" />
  </svg>
);

const inputSx = {
  bg: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '8px',
  _hover: { borderColor: 'whiteAlpha.400' },
  _focus: { borderColor: 'white', bg: 'rgba(255,255,255,0.08)' },
  color: 'white',
  fontSize: '12px',
};

const ALL_KEYS = ['min_bbox_x', 'max_bbox_x', 'min_bbox_y', 'max_bbox_y', 'min_bbox_z', 'max_bbox_z'];

// 快捷预设档位（单位：米 m，与后端 USD 场景 metersPerUnit 一致）
// 数值参考：真实 OpenSearch 索引中 bbox_dimension_x/y/z 的实际分布
//   小物件（饰品/小道具）  : 0 ~ 0.5 m
//   道具（椅、灯、雕塑）   : 0.5 ~ 2 m
//   家具（沙发、桌、柜）   : 1 ~ 3 m
//   车辆/大型设备         : 3 ~ 8 m
//   建筑/场景级            : > 8 m
const DIMENSION_PRESETS = [
  { label: '小物件 <0.5m', min: '', max: '0.5' },
  { label: '道具 0.5-2m', min: '0.5', max: '2' },
  { label: '家具 1-3m', min: '1', max: '3' },
  { label: '车辆 3-8m', min: '3', max: '8' },
  { label: '建筑 >8m', min: '8', max: '' },
  { label: '全部', min: '', max: '' },
];

/**
 * DimensionFilter - 对象尺寸筛选面板（仿 Fab 原版 + 快捷预设）
 * 
 * 参数：
 * - bbox_use_scaled_dimensions: 使用缩放尺寸（包括缩放、旋转）
 * - min_bbox_x / max_bbox_x: X 尺寸范围
 * - min_bbox_y / max_bbox_y: Y 尺寸范围
 * - min_bbox_z / max_bbox_z: Z 尺寸范围
 * 
 * 快捷预设同时设置三轴的 min/max
 * 单位：米（m）—— 与后端 USD 场景 metersPerUnit 一致
 * 支持键盘 ↑↓ ±0.1m 步进，←→ ±1m 步进（输入框 focus 时）
 */
const DimensionFilter = memo(function DimensionFilter({
  searchParams,
  handleChange,
  onTriggerSearch,
  t,
}) {
  // 记忆功能
  const { memories: dimMemories, addMemory: addDimMemory, removeMemory: removeDimMemory } = useFilterMemory('dimension');

  const isActive = useMemo(() => {
    return ALL_KEYS.some(k => String(searchParams?.[k] ?? '').trim() !== '');
  }, [searchParams]);

  const badgeCount = useMemo(() => {
    return isActive ? 1 : 0;
  }, [isActive]);

  const handleReset = useCallback(() => {
    ALL_KEYS.forEach(key => handleChange(key, ''));
    handleChange('bbox_use_scaled_dimensions', true);
    onTriggerSearch?.();
  }, [handleChange, onTriggerSearch]);

  const handleScaledToggle = useCallback((e) => {
    handleChange('bbox_use_scaled_dimensions', e.target.checked);
  }, [handleChange]);

  // 快捷预设：同时设置三轴（支持取消）
  const handlePreset = useCallback((preset) => {
    // 如果已选中同一个预设，再点取消
    const minX = String(searchParams?.min_bbox_x ?? '').trim();
    const maxX = String(searchParams?.max_bbox_x ?? '').trim();
    if (preset.min === minX && preset.max === maxX) {
      ALL_KEYS.forEach(key => handleChange(key, ''));
    } else {
      ['x', 'y', 'z'].forEach(axis => {
        handleChange(`min_bbox_${axis}`, preset.min);
        handleChange(`max_bbox_${axis}`, preset.max);
      });
    }
    onTriggerSearch?.();
  }, [handleChange, onTriggerSearch, searchParams]);

  // 点击记忆 tag
  const handleMemoryTag = useCallback((memValue) => {
    ['x', 'y', 'z'].forEach(axis => {
      handleChange(`min_bbox_${axis}`, memValue.min);
      handleChange(`max_bbox_${axis}`, memValue.max);
    });
    onTriggerSearch?.();
  }, [handleChange, onTriggerSearch]);

  // onClose 时存记忆（如果是自定义值且非预设）—— 不再触发搜索（搜索已在 handlePreset/handleMemoryTag/handleReset 等具体操作中触发过）
  // 这是修复「连点筛选 button 莫名搜索」bug 的关键：handleClose 不应无条件调 onTriggerSearch
  const handleClose = useCallback(() => {
    const minX = String(searchParams?.min_bbox_x ?? '').trim();
    const maxX = String(searchParams?.max_bbox_x ?? '').trim();
    if (minX || maxX) {
      const isPreset = DIMENSION_PRESETS.some(p => p.min === minX && p.max === maxX);
      if (!isPreset) {
        const label = `${minX || '0'}-${maxX || '∞'}m`;
        addDimMemory(label, { min: minX, max: maxX });
      }
    }
  }, [searchParams, addDimMemory]);

  // Input onChange 适配器（事件对象 → key, val）
  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    handleChange(name, value);
  }, [handleChange]);

  // 判断当前匹配哪个预设
  const activePreset = useMemo(() => {
    const minX = String(searchParams?.min_bbox_x ?? '').trim();
    const maxX = String(searchParams?.max_bbox_x ?? '').trim();
    return DIMENSION_PRESETS.find(p => p.min === minX && p.max === maxX) || null;
  }, [searchParams]);

  // 键盘步进 handler（数值输入框，单位 m）
  const handleKeyDown = useCallback((e) => {
    const input = e.target;
    const name = input.name;
    const currentVal = Number(input.value) || 0;

    let step = 0;
    if (e.key === 'ArrowUp') { step = 0.1; e.preventDefault(); }
    else if (e.key === 'ArrowDown') { step = -0.1; e.preventDefault(); }
    else if (e.key === 'ArrowRight' && input.selectionStart === String(input.value).length) { step = 1; e.preventDefault(); }
    else if (e.key === 'ArrowLeft' && input.selectionStart === 0) { step = -1; e.preventDefault(); }

    if (step !== 0) {
      const newVal = Math.max(0, Math.round((currentVal + step) * 100) / 100);
      handleChange(name, String(newVal));
    }
  }, [handleChange]);

  return (
    <FilterPopoverButton
      label={t?.('fabFilterDimensions') || '尺寸'}
      isActive={isActive}
      badgeCount={badgeCount}
      onClose={handleClose}
      onReset={handleReset}
      minW="340px"
      maxW="440px"
    >
      <VStack spacing={4} align="stretch">
        {/* 使用缩放尺寸开关 */}
        <FormControl>
          <HStack justify="space-between" align="center">
            <FormLabel fontSize="xs" color="whiteAlpha.800" fontWeight="600" mb={0}>
              {t?.('useScaledDimensions') || '使用缩放尺寸'}
            </FormLabel>
            <Switch
              size="sm"
              colorScheme="yellow"
              isChecked={searchParams.bbox_use_scaled_dimensions !== false}
              onChange={handleScaledToggle}
            />
          </HStack>
          <Text fontSize="12px" color="whiteAlpha.500" letterSpacing="0.02em" mt={1.5} lineHeight="1.5">
            {t?.('useScaledDimensionsHint') || '使用变换后的对象尺寸搜索（包括缩放、旋转）· 单位：米（m）'}
          </Text>
        </FormControl>

        {/* 快捷预设档位 */}
        <Box>
          <Text fontSize="xs" color="whiteAlpha.600" fontWeight="500" mb={2}>
            快捷预设
          </Text>
          <Wrap spacing={2}>
            {DIMENSION_PRESETS.map((preset) => {
              const isSelected = activePreset === preset;
              return (
                <WrapItem key={preset.label}>
                  <Tag
                    size="md"
                    variant={isSelected ? 'solid' : 'subtle'}
                    bg={isSelected ? 'rgba(255, 210, 48, 0.2)' : 'whiteAlpha.100'}
                    color={isSelected ? '#FFD230' : 'whiteAlpha.800'}
                    border={isSelected ? '1px solid rgba(255, 210, 48, 0.5)' : '1px solid transparent'}
                    borderRadius="full"
                    cursor="pointer"
                    px={3}
                    py={1}
                    _hover={{ bg: isSelected ? 'rgba(255, 210, 48, 0.3)' : 'whiteAlpha.200' }}
                    transition="all 0.15s ease"
                    onClick={() => handlePreset(preset)}
                    userSelect="none"
                  >
                    <TagLabel fontSize="12px">{preset.label}</TagLabel>
                  </Tag>
                </WrapItem>
              );
            })}
          </Wrap>
        </Box>

        {/* 记忆的自定义尺寸 */}
        {dimMemories.length > 0 && (
          <Box>
            <Text fontSize="12px" color="whiteAlpha.600" fontWeight="500" letterSpacing="0.02em" mb={2.5}>
              {t?.('dimensionRecentMemory') || t?.('recentCustom') || '最近尺寸组合'}
            </Text>
            <Wrap spacing={2}>
              {dimMemories.map((mem, idx) => (
                <WrapItem key={idx}>
                  <MemoryChip
                    segments={[{
                      icon: <CubeIcon />,
                      label: mem.label,
                      tone: 'gold',
                    }]}
                    onClick={() => handleMemoryTag(mem.value)}
                    onRemove={() => removeDimMemory(mem.value)}
                  />
                </WrapItem>
              ))}
            </Wrap>
          </Box>
        )}

        {/* X 尺寸范围 */}
        <Box>
          <Text fontSize="xs" color="whiteAlpha.600" fontWeight="500" mb={2}>
            X 尺寸范围 (m)
          </Text>
          <HStack spacing={2} align="center">
            <Input
              size="sm"
              type="number"
              step="0.1"
              min="0"
              name="min_bbox_x"
              value={searchParams.min_bbox_x || ''}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="最小 X (m)"
              sx={inputSx}
            />
            <Text fontSize="xs" color="whiteAlpha.500" flexShrink={0}>到</Text>
            <Input
              size="sm"
              type="number"
              step="0.1"
              min="0"
              name="max_bbox_x"
              value={searchParams.max_bbox_x || ''}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="最大 X (m)"
              sx={inputSx}
            />
          </HStack>
        </Box>

        {/* Y 尺寸范围 */}
        <Box>
          <Text fontSize="xs" color="whiteAlpha.600" fontWeight="500" mb={2}>
            Y 尺寸范围 (m)
          </Text>
          <HStack spacing={2} align="center">
            <Input
              size="sm"
              type="number"
              step="0.1"
              min="0"
              name="min_bbox_y"
              value={searchParams.min_bbox_y || ''}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="最小 Y (m)"
              sx={inputSx}
            />
            <Text fontSize="xs" color="whiteAlpha.500" flexShrink={0}>到</Text>
            <Input
              size="sm"
              type="number"
              step="0.1"
              min="0"
              name="max_bbox_y"
              value={searchParams.max_bbox_y || ''}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="最大 Y (m)"
              sx={inputSx}
            />
          </HStack>
        </Box>

        {/* Z 尺寸范围 */}
        <Box>
          <Text fontSize="xs" color="whiteAlpha.600" fontWeight="500" mb={2}>
            Z 尺寸范围 (m)
          </Text>
          <HStack spacing={2} align="center">
            <Input
              size="sm"
              type="number"
              step="0.1"
              min="0"
              name="min_bbox_z"
              value={searchParams.min_bbox_z || ''}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="最小 Z (m)"
              sx={inputSx}
            />
            <Text fontSize="xs" color="whiteAlpha.500" flexShrink={0}>到</Text>
            <Input
              size="sm"
              type="number"
              step="0.1"
              min="0"
              name="max_bbox_z"
              value={searchParams.max_bbox_z || ''}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="最大 Z (m)"
              sx={inputSx}
            />
          </HStack>
        </Box>

        <Text fontSize="12px" color="whiteAlpha.500" letterSpacing="0.02em" mt={1} lineHeight="1.5">
          {t?.('dimensionStepHint') || '* 单位：米（m）· ↑↓ 步进 ±0.1m，光标到边界时 ←→ 步进 ±1m'}
        </Text>
      </VStack>
    </FilterPopoverButton>
  );
});

export default DimensionFilter;
