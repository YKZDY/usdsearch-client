import React, { memo, useCallback, useMemo, useRef, useEffect } from 'react';
import { VStack, Text, Divider, Wrap, WrapItem, Box } from '@chakra-ui/react';
import FilterPopoverButton from './FilterPopoverButton';
import StepperInput from '../shared/StepperInput';
import QuickTags from '../shared/QuickTags';
import MemoryChip from './MemoryChip';
import { useLocalFilterState } from '../shared/useLocalFilterState';
import { useFilterMemory } from '../../hooks/useFilterMemory';

/** 文件大小图标（数据/磁盘） */
const SizeIcon = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <ellipse cx="8" cy="4" rx="5.5" ry="2" />
    <path d="M2.5 4v8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V4" />
    <path d="M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2" />
  </svg>
);

const SIZE_KEYS = ['file_size_greater_than', 'file_size_less_than'];

// 预设默认值
const DEFAULTS = {
  file_size_greater_than: 100,
  file_size_less_than: 10000,
};

// 快捷区间 tags
const SIZE_QUICK_TAGS = [
  { label: '<100KB', value: { min: '', max: 100 } },
  { label: '100-500KB', value: { min: 100, max: 500 } },
  { label: '500KB-1MB', value: { min: 500, max: 1000 } },
  { label: '1-5MB', value: { min: 1000, max: 5000 } },
  { label: '>5MB', value: { min: 5000, max: '' } },
  { label: '全部', value: { min: '', max: '' } },
];

/**
 * SizeFilter - 大小筛选面板
 * 
 * 功能：
 * - 快捷区间 tag（即时生效）
 * - 预设基准（大于 100KB，小于 10000KB）
 * - ▲▼ 步进 ±50（精细），◀▶ 步进 ±500（快速）
 * - 纯文本输入（不锁死单位）
 * - blur 后触发搜索
 */
const SizeFilter = memo(function SizeFilter({
  searchParams,
  handleChange,
  onTriggerSearch,
  t,
}) {
  // 记忆功能
  const { memories: sizeMemories, addMemory: addSizeMemory, removeMemory: removeSizeMemory } = useFilterMemory('size');

  // 用 ref 保证 onCommit 闭包总是拿到最新 searchParams（避免 stale closure）
  const searchParamsRef = useRef(searchParams);
  useEffect(() => { searchParamsRef.current = searchParams; }, [searchParams]);

  /**
   * 保存大小记忆（core = {min, max}）
   * - 先按 core 去重（剥离 fromPreset 差异），再 addMemory(withFromPreset)
   * - 标签为"全部"或空值 → 不存
   */
  const saveSizeMemory = useCallback((min, max, fromPreset) => {
    const normMin = min === '' || min === null || min === undefined ? '' : Number(min);
    const normMax = max === '' || max === null || max === undefined ? '' : Number(max);
    if (normMin === '' && normMax === '') return;
    const core = { min: normMin, max: normMax };
    const label = formatSizeLabel(normMin, normMax);
    if (!label || label === '全部') return;
    // 去重（剥离 fromPreset 差异 + 兼容老数据）
    removeSizeMemory({ ...core, fromPreset: true });
    removeSizeMemory({ ...core, fromPreset: false });
    removeSizeMemory(core);
    addSizeMemory(label, { ...core, fromPreset: !!fromPreset });
  }, [addSizeMemory, removeSizeMemory]);

  const onCommit = useCallback((changed) => {
    Object.entries(changed).forEach(([key, val]) => {
      handleChange(key, val);
    });
    // 存入记忆：合并 changed 与最新 searchParams，得到本次提交后的 min/max
    const latestParams = searchParamsRef.current;
    const min = changed.file_size_greater_than ?? latestParams.file_size_greater_than ?? '';
    const max = changed.file_size_less_than ?? latestParams.file_size_less_than ?? '';
    // 非预设 → 自定义记忆（fromPreset=false）
    const normMin = min === '' || min === null || min === undefined ? '' : Number(min);
    const normMax = max === '' || max === null || max === undefined ? '' : Number(max);
    const isPreset = SIZE_QUICK_TAGS.some(tag =>
      String(tag.value.min) === String(normMin) && String(tag.value.max) === String(normMax)
    );
    if (!isPreset) {
      saveSizeMemory(normMin, normMax, false);
    }
    onTriggerSearch?.();
  }, [handleChange, onTriggerSearch, saveSizeMemory]);

  const { localValues, setLocalValue, commit, reset } = useLocalFilterState(
    searchParams,
    SIZE_KEYS,
    onCommit
  );

  // StepperInput 显示值：有值时显示实际值，空时显示默认占位
  const displayMin = localValues.file_size_greater_than !== '' ? localValues.file_size_greater_than : DEFAULTS.file_size_greater_than;
  const displayMax = localValues.file_size_less_than !== '' ? localValues.file_size_less_than : DEFAULTS.file_size_less_than;

  // 快捷 tag 即时生效（支持 toggle：再次点击恢复到"全部"）
  const handleQuickTag = useCallback((tagValue) => {
    const currentMin = String(searchParams.file_size_greater_than || '');
    const currentMax = String(searchParams.file_size_less_than || '');
    const isAlreadySelected = String(tagValue.min) === currentMin && String(tagValue.max) === currentMax;

    if (isAlreadySelected) {
      // 再次点击 = 恢复"全部"
      handleChange('file_size_greater_than', '');
      handleChange('file_size_less_than', '');
      setLocalValue('file_size_greater_than', '');
      setLocalValue('file_size_less_than', '');
    } else {
      handleChange('file_size_greater_than', tagValue.min);
      handleChange('file_size_less_than', tagValue.max);
      setLocalValue('file_size_greater_than', tagValue.min);
      setLocalValue('file_size_less_than', tagValue.max);
      // 即时存记忆（fromPreset=true）
      saveSizeMemory(tagValue.min, tagValue.max, true);
    }
    onTriggerSearch?.();
  }, [handleChange, onTriggerSearch, setLocalValue, searchParams, saveSizeMemory]);

  // 点击记忆 tag（支持取消：再点一次清空）；兼容新 value 结构（带 fromPreset）
  const handleMemoryTag = useCallback((tagValue) => {
    const min = tagValue?.min ?? '';
    const max = tagValue?.max ?? '';
    const currentMin = String(searchParams.file_size_greater_than || '');
    const currentMax = String(searchParams.file_size_less_than || '');
    if (String(min) === currentMin && String(max) === currentMax) {
      // 再次点击 = 取消
      handleChange('file_size_greater_than', '');
      handleChange('file_size_less_than', '');
    } else {
      handleChange('file_size_greater_than', min);
      handleChange('file_size_less_than', max);
    }
    onTriggerSearch?.();
  }, [handleChange, onTriggerSearch, searchParams]);

  const handleReset = useCallback(() => {
    handleChange('file_size_greater_than', '');
    handleChange('file_size_less_than', '');
    reset();
    onTriggerSearch?.();
  }, [handleChange, reset, onTriggerSearch]);

  // 判断当前选中的快捷 tag
  const selectedTag = useMemo(() => {
    const min = Number(searchParams.file_size_greater_than) || '';
    const max = Number(searchParams.file_size_less_than) || '';
    return SIZE_QUICK_TAGS.find(tag =>
      String(tag.value.min) === String(min) && String(tag.value.max) === String(max)
    )?.value;
  }, [searchParams]);

  // 判断是否激活
  const isActive = !!(searchParams.file_size_greater_than || searchParams.file_size_less_than);

  return (
    <FilterPopoverButton
      label={t?.('fabFilterSize') || '大小'}
      isActive={isActive}
      badgeCount={isActive ? 1 : 0}
      onClose={commit}
      onReset={handleReset}
      minW="280px"
      maxW="360px"
    >
      <VStack spacing={3} align="stretch">
        {/* 快捷区间 */}
        <Text fontSize="xs" color="whiteAlpha.600" fontWeight="500">
          {t?.('sizeQuickSelect') || '快捷选择'}
        </Text>
        <QuickTags
          tags={SIZE_QUICK_TAGS.map(tag => ({ label: tag.label, value: tag.value }))}
          selectedValue={selectedTag}
          onSelect={handleQuickTag}
        />

        {/* 记忆的自定义范围 */}
        {sizeMemories.length > 0 && (
          <Box>
            <Text fontSize="12px" color="whiteAlpha.600" fontWeight="500" letterSpacing="0.02em" mb={2.5}>
              {t?.('sizeRecentMemory') || t?.('recentCustom') || '最近大小区间'}
            </Text>
            <Wrap spacing={2}>
              {sizeMemories.map((mem, idx) => {
                const memMin = mem.value?.min;
                const memMax = mem.value?.max;
                const isMemSelected = String(memMin) === String(searchParams.file_size_greater_than || '') &&
                  String(memMax) === String(searchParams.file_size_less_than || '');
                const isPreset = !!(mem.value && typeof mem.value === 'object' && mem.value.fromPreset);
                return (
                  <WrapItem key={idx}>
                    <MemoryChip
                      segments={[{
                        icon: <SizeIcon />,
                        label: mem.label,
                        tone: isMemSelected ? 'gold' : 'neutral',
                        isPreset,
                      }]}
                      presetTooltip={t?.('memoryFromPreset') || '来自快捷预设'}
                      onClick={() => handleMemoryTag(mem.value)}
                      onRemove={() => removeSizeMemory(mem.value)}
                    />
                  </WrapItem>
                );
              })}
            </Wrap>
          </Box>
        )}

        <Divider borderColor="whiteAlpha.200" my={1} />

        {/* 自定义范围 */}
        <Text fontSize="xs" color="whiteAlpha.600" fontWeight="500">
          {t?.('sizeCustomRange') || '自定义范围'}
        </Text>

        {/* 大于 */}
        <StepperInput
          label={t?.('sizeGreaterThan') || '最小'}
          value={displayMin}
          onChange={(val) => setLocalValue('file_size_greater_than', val)}
          onCommit={commit}
          min={0}
          max={999999}
          fineStep={50}
          coarseStep={500}
          precision={0}
          unit="KB"
          tooltipFine={t?.('stepFine50') || '步进 ±50'}
          tooltipCoarse={t?.('stepCoarse500') || '步进 ±500'}
        />

        {/* 小于 */}
        <StepperInput
          label={t?.('sizeLessThan') || '最大'}
          value={displayMax}
          onChange={(val) => setLocalValue('file_size_less_than', val)}
          onCommit={commit}
          min={0}
          max={999999}
          fineStep={50}
          coarseStep={500}
          precision={0}
          unit="KB"
          tooltipFine={t?.('stepFine50') || '步进 ±50'}
          tooltipCoarse={t?.('stepCoarse500') || '步进 ±500'}
        />
      </VStack>
    </FilterPopoverButton>
  );
});

/** 格式化大小标签文本 */
function formatSizeLabel(min, max) {
  const fmtVal = (v) => {
    const n = Number(v);
    if (!n) return '';
    if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}MB`;
    return `${n}KB`;
  };
  const minStr = fmtVal(min);
  const maxStr = fmtVal(max);
  if (minStr && maxStr) return `${minStr}-${maxStr}`;
  if (minStr) return `>${minStr}`;
  if (maxStr) return `<${maxStr}`;
  return '全部';
}

export default SizeFilter;
