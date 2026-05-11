import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  VStack,
  Text,
  Input,
  Tag,
  TagLabel,
  TagCloseButton,
  Wrap,
  WrapItem,
  Divider,
  Box,
} from '@chakra-ui/react';
import FilterPopoverButton from './FilterPopoverButton';
import MemoryChip from './MemoryChip';
import { useFilterMemory } from '../../hooks/useFilterMemory';

/** Hash icon — 标签图标 */
const HashIcon = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <line x1="3" y1="6" x2="13" y2="6" />
    <line x1="3" y1="10.5" x2="13" y2="10.5" />
    <line x1="6" y1="2.5" x2="5" y2="14" />
    <line x1="11" y1="2.5" x2="10" y2="14" />
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

/**
 * TagsFilter - 标签筛选面板（搜索/标签解耦版 v3）
 *
 * 核心变化：
 *   - 不再从 searchQuery 字符串 split 出 tag（根除"通用建筑 → general building → 2 个 chip"副作用）
 *   - 改为受控数组形态：selectedTags: string[] + onSelectedTagsChange: (tags) => void
 *   - 与顶部搜索框 searchQuery 视觉零联动、数据独立
 *
 * 功能：
 *   - 从搜索结果中提取所有已有的 tags，展示为可点击的快捷标签
 *   - 展示当前已选标签（chips 形式 + × 删除），支持含空格的完整标签（如 "general building"）
 *   - 输入框添加新标签（Enter 确认）
 *   - 记忆 5 条最近自定义标签组合
 */
const TagsFilter = memo(function TagsFilter({
  selectedTags = [],
  onSelectedTagsChange,
  onTriggerSearch,
  results = [],
  t,
}) {
  const [inputValue, setInputValue] = useState('');

  // 记忆功能（5 条）
  const {
    memories: tagMemories,
    addMemory: addTagMemory,
    removeMemory: removeTagMemory,
  } = useFilterMemory('tags');

  // 标记「下一次 activeTags 变化是面板内交互」—— 仅在面板内交互后才存记忆，避免与 search 记忆冲突
  const interactedRef = useRef(false);

  // 直接使用受控数组 props，彻底移除 split(/\s+/) 的字符串副作用
  const activeTags = useMemo(() => {
    return Array.isArray(selectedTags) ? selectedTags : [];
  }, [selectedTags]);

  // [TagSearchFix V3] 候选标签只从真 source.tags 聚合，不再从文件名拆词凑假 tag。
  // 背景：历史上后端没 tag 功能时，为让 "标签筛选" UI 有候选，前端把文件名拆成伪 tag，
  // 但这会让用户误以为 "选中 Set 就是按 tag=Set 过滤"，实际是文本搜索命中文件名。
  // 现在 tagging 服务可用后，候选只展示真实打过的 tag，空时给明确提示引导去打标签。
  const availableTags = useMemo(() => {
    const tagMap = new Map();
    results.forEach(item => {
      const tags = item.source?.tags;
      if (!Array.isArray(tags)) return;
      tags.forEach(tagItem => {
        const tagStr = typeof tagItem === 'string'
          ? tagItem
          : (tagItem?.name || tagItem?.tag || tagItem?.value || '');
        if (tagStr) {
          tagMap.set(tagStr, (tagMap.get(tagStr) || 0) + 1);
        }
      });
    });
    return Array.from(tagMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([tag, count]) => ({ label: tag, value: tag, count }));
  }, [results]);

  // 过滤可用标签（排除已激活 + 模糊搜索）
  const filteredAvailableTags = useMemo(() => {
    let filtered = availableTags.filter(tag => !activeTags.includes(tag.value));
    if (inputValue.trim()) {
      const query = inputValue.trim().toLowerCase();
      filtered = filtered.filter(tag => tag.label.toLowerCase().includes(query));
    }
    return filtered;
  }, [availableTags, activeTags, inputValue]);

  // 删除一个 tag
  const handleRemoveTag = useCallback((tagToRemove) => {
    interactedRef.current = true;
    const newTags = activeTags.filter(tag => tag !== tagToRemove);
    onSelectedTagsChange?.(newTags);
    setTimeout(() => onTriggerSearch?.(), 50);
  }, [activeTags, onSelectedTagsChange, onTriggerSearch]);

  // 添加新 tag（从输入框）
  const handleAddTag = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    if (activeTags.includes(trimmed)) {
      setInputValue('');
      return;
    }
    interactedRef.current = true;
    const newTags = [...activeTags, trimmed];
    onSelectedTagsChange?.(newTags);
    setInputValue('');
    setTimeout(() => onTriggerSearch?.(), 50);
  }, [inputValue, activeTags, onSelectedTagsChange, onTriggerSearch]);

  // 点击可用 tag 快捷添加
  const handleSelectTag = useCallback((tagValue) => {
    if (activeTags.includes(tagValue)) return;
    interactedRef.current = true;
    const newTags = [...activeTags, tagValue];
    onSelectedTagsChange?.(newTags);
    setTimeout(() => onTriggerSearch?.(), 50);
  }, [activeTags, onSelectedTagsChange, onTriggerSearch]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    } else if (e.key === 'Backspace' && !inputValue && activeTags.length > 0) {
      handleRemoveTag(activeTags[activeTags.length - 1]);
    }
  }, [handleAddTag, inputValue, activeTags, handleRemoveTag]);

  // 清除所有 tag
  const handleClearAll = useCallback(() => {
    interactedRef.current = true;
    onSelectedTagsChange?.([]);
    setTimeout(() => onTriggerSearch?.(), 50);
  }, [onSelectedTagsChange, onTriggerSearch]);

  // 应用记忆：覆盖 selectedTags 为该记忆的 tags 数组
  const handleApplyMemory = useCallback((memTags) => {
    if (!Array.isArray(memTags) || memTags.length === 0) return;
    onSelectedTagsChange?.(memTags);
    setTimeout(() => onTriggerSearch?.(), 50);
  }, [onSelectedTagsChange, onTriggerSearch]);

  // onClose：仅在面板内交互过 + activeTags 非空时存记忆
  const handleClose = useCallback(() => {
    if (interactedRef.current && activeTags.length > 0) {
      const tagsArray = [...activeTags];
      const label = tagsArray.map(tag => `#${tag}`).join(' ');
      addTagMemory(label, tagsArray);
    }
    interactedRef.current = false; // 关闭后重置
  }, [activeTags, addTagMemory]);

  const isActive = activeTags.length > 0;

  return (
    <FilterPopoverButton
      label={t?.('fabFilterTags') || '标签'}
      isActive={isActive}
      badgeCount={activeTags.length}
      onClose={handleClose}
      onReset={isActive ? handleClearAll : undefined}
      resetLabel={t?.('tagsClearAll') || '↺ 重置'}
      minW="320px"
      maxW="420px"
    >
      <VStack spacing={3} align="stretch">
        {/* 当前激活的标签 chips */}
        {activeTags.length > 0 && (
          <>
            <Text fontSize="xs" color="whiteAlpha.600" fontWeight="500">
              {t?.('tagsActive') || '已选标签'}
            </Text>
            <Wrap spacing={2}>
              {activeTags.map((tag, idx) => (
                <WrapItem key={idx}>
                  <Tag
                    size="md"
                    variant="solid"
                    bg="rgba(255, 210, 48, 0.2)"
                    color="#FFD230"
                    border="1px solid rgba(255, 210, 48, 0.5)"
                    borderRadius="full"
                    px={3}
                    py={1}
                    minH="28px"
                  >
                    <TagLabel fontSize="13px">{tag}</TagLabel>
                    <TagCloseButton onClick={() => handleRemoveTag(tag)} />
                  </Tag>
                </WrapItem>
              ))}
            </Wrap>
            <Divider borderColor="whiteAlpha.200" />
          </>
        )}

        {/* 最近自定义（记忆） */}
        {tagMemories.length > 0 && (
          <Box>
            <Text
              fontSize="12px"
              color="whiteAlpha.600"
              fontWeight="500"
              letterSpacing="0.02em"
              mb={2.5}
            >
              {t?.('tagsRecentMemory') || t?.('recentCustom') || '最近标签组合'}
            </Text>
            <Wrap spacing={2}>
              {tagMemories.map((mem, idx) => {
                const tags = Array.isArray(mem.value) ? mem.value : [];
                if (tags.length === 0) return null;
                // 前 3 项 join " · "，超出再 "+N 项"
                const moreSuffix = t?.('memoryMoreSuffix') || '项';
                const visibleCount = 3;
                const labelText = tags.slice(0, visibleCount).join(' · ');
                const badge = tags.length > visibleCount ? `+${tags.length - visibleCount} ${moreSuffix}` : undefined;
                const segs = [{
                  icon: <HashIcon />,
                  label: labelText,
                  tone: 'gold',
                  badge,
                }];
                return (
                  <WrapItem key={idx}>
                    <MemoryChip
                      segments={segs}
                      tooltip={tags.map(tg => `#${tg}`).join('  ·  ')}
                      onClick={() => handleApplyMemory(tags)}
                      onRemove={() => removeTagMemory(mem.value)}
                    />
                  </WrapItem>
                );
              })}
            </Wrap>
          </Box>
        )}

        {/* 输入框 */}
        <Input
          size="sm"
          placeholder={t?.('tagsPlaceholder') || '标签'}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          sx={inputSx}
        />

        {/* 从结果中提取的可用标签 */}
        {filteredAvailableTags.length > 0 && (
          <>
            <Text fontSize="xs" color="whiteAlpha.600" fontWeight="500">
              {t?.('tagsFromResults') || '点击标签可快速添加'}
            </Text>
            <Wrap spacing={2}>
              {filteredAvailableTags.map((tag, idx) => (
                <WrapItem key={idx}>
                  <Tag
                    size="md"
                    variant="subtle"
                    bg="whiteAlpha.100"
                    color="whiteAlpha.800"
                    border="1px solid transparent"
                    borderRadius="full"
                    cursor="pointer"
                    px={3}
                    py={1}
                    minH="28px"
                    _hover={{ bg: 'whiteAlpha.200', borderColor: 'whiteAlpha.300' }}
                    transition="all 0.15s ease"
                    onClick={() => handleSelectTag(tag.value)}
                    userSelect="none"
                  >
                    <TagLabel fontSize="13px">
                      {tag.label} {tag.count > 1 && `(${tag.count})`}
                    </TagLabel>
                  </Tag>
                </WrapItem>
              ))}
            </Wrap>
          </>
        )}

        {availableTags.length === 0 && results.length === 0 && (
          <Text fontSize="12px" color="whiteAlpha.500" letterSpacing="0.02em">
            {t?.('tagsNoResults') || '搜索结果中暂无标签数据，请先执行搜索'}
          </Text>
        )}

        {/* [TagSearchFix V3] 有结果但没真 tag：提示去卡片详情手动打标签 */}
        {availableTags.length === 0 && results.length > 0 && (
          <Text fontSize="12px" color="whiteAlpha.500" letterSpacing="0.02em" lineHeight="1.6">
            {t?.('tagsNoRealTagsHint') || '当前结果中暂无已打标签的资产。打开任意资产详情可手动添加标签。'}
          </Text>
        )}

        {/* [UX Polish] 底部通用兜底文案已删除——"添加/移除"措辞会让用户误以为"给所有卡片加标签"。
            每个区块（已选标签 chip 自带 ×；推荐区有 tagsFromResults 提示）自我解释即可。 */}
      </VStack>
    </FilterPopoverButton>
  );
});

export default TagsFilter;
