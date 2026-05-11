import React, { memo, useCallback, useMemo, useState } from 'react';
import { VStack, HStack, Text, Input, Divider, Wrap, WrapItem, Tag, TagLabel, TagCloseButton, Button, Box } from '@chakra-ui/react';
import { ChevronDownIcon, ChevronUpIcon } from '@chakra-ui/icons';
import FilterPopoverButton from './FilterPopoverButton';
import QuickTags from '../shared/QuickTags';
import { useLocalFilterState } from '../shared/useLocalFilterState';
import { useFilterMemory } from '../../hooks/useFilterMemory';

const DATE_KEYS = ['created_after', 'created_before', 'modified_after', 'modified_before'];

/**
 * 计算快捷日期标签的值（从当前时间往回推）
 */
function getDateOffset(hours) {
  if (!hours) return '';
  const d = new Date();
  d.setHours(d.getHours() - hours);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

// 快捷 tag（点击即时生效）
const DATE_QUICK_TAGS = [
  { label: '过去24小时', value: { hours: 24 } },
  { label: '过去7天', value: { hours: 7 * 24 } },
  { label: '过去30天', value: { hours: 30 * 24 } },
  { label: '过去3个月', value: { hours: 90 * 24 } },
  { label: '过去1年', value: { hours: 365 * 24 } },
  { label: '全部', value: { hours: 0 } },
];

const inputSx = {
  bg: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '8px',
  _hover: { borderColor: 'whiteAlpha.400' },
  _focus: { borderColor: 'white', bg: 'rgba(255,255,255,0.08)' },
  color: 'white',
  fontSize: '12px',
};

/**
 * DateFilter - 日期筛选面板
 * 
 * 功能：
 * - 顶部快捷 tag：过去24小时/7天/30天/3个月/1年/全部
 * - 创建于：默认显示，末尾框 placeholder="留空=至今"
 * - 修改于：折叠到「高级筛选」抽屉，默认隐藏
 */
const DateFilter = memo(function DateFilter({
  searchParams,
  handleChange,
  onTriggerSearch,
  t,
}) {
  // 记忆功能
  const { memories: dateMemories, addMemory: addDateMemory, removeMemory: removeDateMemory } = useFilterMemory('date');

  // 「修改于」高级面板：默认折叠，若已有 modified_* 值则自动展开
  const [showAdvanced, setShowAdvanced] = useState(() => {
    return !!(searchParams.modified_after || searchParams.modified_before);
  });

  const onCommit = useCallback((changed) => {
    Object.entries(changed).forEach(([key, val]) => {
      handleChange(key, val);
    });
    // 存入记忆：自定义日期范围（非预设快捷 tag）
    const after = changed.created_after ?? searchParams.created_after ?? '';
    const before = changed.created_before ?? searchParams.created_before ?? '';
    if (after || before) {
      const isPreset = DATE_QUICK_TAGS.some(tag => tag.value.hours && getDateOffset(tag.value.hours) === after && !before);
      if (!isPreset && (after !== '' || before !== '')) {
        const label = `${after || '...'} ~ ${before || '至今'}`;
        addDateMemory(label, { after, before });
      }
    }
    onTriggerSearch?.();
  }, [handleChange, onTriggerSearch, searchParams, addDateMemory]);

  const { localValues, setLocalValue, commit, commitIfDirty, reset } = useLocalFilterState(
    searchParams,
    DATE_KEYS,
    onCommit
  );

  // 快捷 tag 即时生效（支持取消 + 重复点击守卫）
  const handleQuickTag = useCallback((tagValue) => {
    const dateStr = getDateOffset(tagValue.hours);
    const currentAfter = searchParams.created_after || '';

    // 守卫1：点「全部」(hours=0) 但当前 created_* / modified_* 已全空 → 不触发搜索
    if (!tagValue.hours) {
      const allEmpty = DATE_KEYS.every(k => !searchParams[k]);
      if (allEmpty) return; // 已经是「全部」，无需重复触发
      DATE_KEYS.forEach(key => handleChange(key, ''));
      onTriggerSearch?.();
      return;
    }

    // 守卫2：点同一个非空 tag → 取消（清空所有 date keys）
    if (getDateOffset(tagValue.hours) === currentAfter) {
      DATE_KEYS.forEach(key => handleChange(key, ''));
      onTriggerSearch?.();
      return;
    }

    // 正常切换 tag
    handleChange('created_after', dateStr);
    handleChange('created_before', '');
    handleChange('modified_after', dateStr);
    handleChange('modified_before', '');
    onTriggerSearch?.();
  }, [handleChange, onTriggerSearch, searchParams]);

  // 点击记忆 tag
  const handleMemoryTag = useCallback((memValue) => {
    handleChange('created_after', memValue.after || '');
    handleChange('created_before', memValue.before || '');
    handleChange('modified_after', memValue.after || '');
    handleChange('modified_before', memValue.before || '');
    onTriggerSearch?.();
  }, [handleChange, onTriggerSearch]);

  const handleReset = useCallback(() => {
    DATE_KEYS.forEach(key => handleChange(key, ''));
    reset();
    onTriggerSearch?.();
  }, [handleChange, reset, onTriggerSearch]);

  // 用 commitIfDirty 替代 commit：onClose 仅在真有改动时触发，避免连点筛选 button 莫名搜索
  const handleClose = useCallback(() => {
    commitIfDirty();
  }, [commitIfDirty]);

  // 判断当前选中的快捷 tag
  const selectedTag = useMemo(() => {
    const after = searchParams.created_after;
    if (!after) return DATE_QUICK_TAGS[5].value; // "全部"
    for (const tag of DATE_QUICK_TAGS) {
      if (tag.value.hours && getDateOffset(tag.value.hours) === after) {
        return tag.value;
      }
    }
    return null;
  }, [searchParams]);

  const isActive = DATE_KEYS.some(key => !!searchParams[key]);
  const badgeCount = DATE_KEYS.filter(key => !!searchParams[key]).length;

  return (
    <FilterPopoverButton
      label={t?.('fabFilterDate') || '日期'}
      isActive={isActive}
      badgeCount={badgeCount > 0 ? 1 : 0}
      onClose={handleClose}
      onReset={handleReset}
      minW="420px"
      maxW="480px"
    >
      <VStack spacing={3} align="stretch">
        {/* 快捷选择 */}
        <Text fontSize="xs" color="whiteAlpha.600" fontWeight="500">
          {t?.('dateQuickSelect') || '快捷选择'}
        </Text>
        <QuickTags
          tags={DATE_QUICK_TAGS.map(tag => ({ label: tag.label, value: tag.value }))}
          selectedValue={selectedTag}
          onSelect={handleQuickTag}
        />

        {/* 记忆的自定义日期 */}
        {dateMemories.length > 0 && (
          <>
            <Text fontSize="xs" color="whiteAlpha.500" fontWeight="400">
              {t?.('recentCustom') || '最近自定义'}
            </Text>
            <Wrap spacing={2}>
              {dateMemories.map((mem, idx) => (
                <WrapItem key={idx}>
                  <Tag
                    size="sm"
                    variant="subtle"
                    bg="rgba(255,255,255,0.05)"
                    color="whiteAlpha.700"
                    border="1px dashed rgba(255,255,255,0.2)"
                    borderRadius="6px"
                    cursor="pointer"
                    px={2.5}
                    py={1}
                    minH="26px"
                    _hover={{ bg: 'whiteAlpha.100' }}
                    transition="all 0.15s ease"
                    onClick={() => handleMemoryTag(mem.value)}
                    userSelect="none"
                  >
                    <TagLabel fontSize="11px">{mem.label}</TagLabel>
                    <TagCloseButton onClick={(e) => { e.stopPropagation(); removeDateMemory(mem.value); }} />
                  </Tag>
                </WrapItem>
              ))}
            </Wrap>
          </>
        )}

        <Divider borderColor="whiteAlpha.200" my={1} />

        {/* 自定义日期 */}
        <Text fontSize="xs" color="whiteAlpha.600" fontWeight="500">
          {t?.('dateCustomRange') || '自定义范围'}
        </Text>

        {/* 创建于（默认显示） */}
        <HStack spacing={2} align="center">
          <Text fontSize="xs" color="whiteAlpha.700" minW="50px">
            {t?.('dateCreatedAt') || '创建于'}
          </Text>
          <Input
            type="date"
            size="sm"
            value={localValues.created_after || ''}
            onChange={(e) => setLocalValue('created_after', e.target.value)}
            onBlur={commit}
            sx={inputSx}
          />
          <Text fontSize="xs" color="whiteAlpha.500">~</Text>
          <Input
            type="date"
            size="sm"
            value={localValues.created_before || ''}
            onChange={(e) => setLocalValue('created_before', e.target.value)}
            onBlur={commit}
            placeholder={t?.('dateLeaveBlankToNow') || '留空=至今'}
            sx={inputSx}
          />
        </HStack>
        {/* 末尾留空提示 */}
        <Text fontSize="12px" color="whiteAlpha.500" letterSpacing="0.02em" mt={-1} ml="58px">
          {t?.('dateLeaveBlankHint') || '* 末尾留空 = 至今'}
        </Text>

        {/* 高级筛选切换按钮 */}
        <Box>
          <Button
            size="xs"
            variant="ghost"
            color="whiteAlpha.600"
            _hover={{ color: 'whiteAlpha.900', bg: 'whiteAlpha.100' }}
            rightIcon={showAdvanced ? <ChevronUpIcon /> : <ChevronDownIcon />}
            onClick={() => setShowAdvanced(v => !v)}
            fontSize="12px"
            fontWeight="400"
            letterSpacing="0.02em"
            px={2}
            h="24px"
          >
            {t?.('dateModifiedAdvanced') || '高级筛选（按修改时间）'}
          </Button>
        </Box>

        {/* 修改于（折叠到高级，默认隐藏） */}
        {showAdvanced && (
          <HStack spacing={2} align="center">
            <Text fontSize="xs" color="whiteAlpha.700" minW="50px">
              {t?.('dateModifiedAt') || '修改于'}
            </Text>
            <Input
              type="date"
              size="sm"
              value={localValues.modified_after || ''}
              onChange={(e) => setLocalValue('modified_after', e.target.value)}
              onBlur={commit}
              sx={inputSx}
            />
            <Text fontSize="xs" color="whiteAlpha.500">~</Text>
            <Input
              type="date"
              size="sm"
              value={localValues.modified_before || ''}
              onChange={(e) => setLocalValue('modified_before', e.target.value)}
              onBlur={commit}
              placeholder={t?.('dateLeaveBlankToNow') || '留空=至今'}
              sx={inputSx}
            />
          </HStack>
        )}

        <Text fontSize="12px" color="whiteAlpha.500" letterSpacing="0.02em" mt={1}>
          {t?.('dateOrNote') || '* 创建于/修改于为 OR 关系，满足其一即显示'}
        </Text>
      </VStack>
    </FilterPopoverButton>
  );
});

export default DateFilter;
