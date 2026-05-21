/**
 * TagEditPopover - 卡片上的快速打 tag 弹层
 *
 * 使用场景：
 *   - 在 <CardTagBar> 中，用户点 "+ 添加" 按钮 / "+N more" → 弹出本组件
 *   - 显示全局 tag 库候选 + 内联创建 + 多选 toggle
 *
 * 关键设计：
 *   - 候选数据来自 useGlobalTags（任务 1 侦察确认已存在，5 分钟缓存）
 *   - 输入框 debounce 200ms 触发模糊筛选，回车直接创建未列出的新词
 *   - toggle 语义：候选已选中 → removeTag；未选中 → addTag
 *   - 所有交互 stopPropagation 避免冒泡到卡片本体
 *   - 校验：长度 0/>50、非法字符 / \ 换行符
 *   - 视觉走 popoverContentSx 标准（半透明 + backdrop-blur）
 *
 * 新文件按 NVIDIA 合入安全规则不需要 LM CUSTOMIZATION 标记。
 *
 * @param {object} props
 * @param {React.ReactNode} props.trigger - 触发器元素（按钮/IconButton）
 * @param {string[]} props.selectedTags - 当前已打的 tag 列表
 * @param {Function} props.onAddTag - (tagName) => void
 * @param {Function} props.onRemoveTag - (tagName) => void
 * @param {string} props.serverUrl - Nucleus host
 * @param {Function} props.getHeaders - 鉴权头工厂
 * @param {boolean} [props.disabled=false] - 禁用（如未登录时）
 */

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  PopoverArrow,
  Box,
  Input,
  InputGroup,
  InputLeftElement,
  VStack,
  HStack,
  Text,
  Wrap,
  WrapItem,
  Spinner,
  useDisclosure,
  Portal,
} from '@chakra-ui/react';
import { SearchIcon } from '@chakra-ui/icons';
import { brandColors, fabColors, fabRadius, fabSpacing } from '../theme/fabTokens';
import useGlobalTags from '../hooks/useGlobalTags';
import TagPill from './TagPill';
import { useTranslation } from '../i18n/LanguageContext';

const MAX_TAG_LENGTH = 50;
const TAG_NAME_INVALID = /[\\/\n\r\t]/;
const DEBOUNCE_MS = 200;

/** 校验 tag 名（成功返回 null，失败返回错误文案 key） */
function validateTagName(name) {
  if (!name || !name.trim()) return 'tagBar.errorEmpty';
  const trimmed = name.trim();
  if (trimmed.length > MAX_TAG_LENGTH) return 'tagBar.errorTooLong';
  if (TAG_NAME_INVALID.test(trimmed)) return 'tagBar.errorInvalidChars';
  return null;
}

const TagEditPopover = function TagEditPopover({
  trigger,
  selectedTags = [],
  onAddTag,
  onRemoveTag,
  serverUrl,
  getHeaders,
  disabled = false,
}) {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [errorKey, setErrorKey] = useState(null);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const inputRef = useRef(null);

  // 懒加载候选库：仅 isOpen=true 时才传 serverUrl，避免无意义网络
  const { globalTags, isLoading } = useGlobalTags(
    isOpen ? { serverUrl, getHeaders } : { serverUrl: '', getHeaders },
  );

  // ─── 输入 debounce ──────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(inputValue.trim().toLowerCase()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [inputValue]);

  // ─── 候选过滤 ───────────────────────────────────────────────
  const candidates = useMemo(() => {
    if (!Array.isArray(globalTags)) return [];
    if (!debouncedQuery) return globalTags;
    return globalTags.filter(t => t.toLowerCase().includes(debouncedQuery));
  }, [globalTags, debouncedQuery]);

  // 当前输入是否能"创建为新 tag"（不在候选里）
  const canCreateNew = useMemo(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();
    return !candidates.some(t => t.toLowerCase() === lower);
  }, [inputValue, candidates]);

  // ─── 关闭时清空状态 ─────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      setInputValue('');
      setDebouncedQuery('');
      setErrorKey(null);
      setHighlightIdx(-1);
    } else {
      // 打开后聚焦输入框（延迟避免 Popover 初始化干扰）
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // ─── 提交逻辑（toggle / 创建新 tag）───────────────────────
  const submitTag = useCallback((tagName) => {
    const err = validateTagName(tagName);
    if (err) {
      setErrorKey(err);
      return;
    }
    setErrorKey(null);
    const trimmed = tagName.trim();
    if (selectedTags.includes(trimmed)) {
      // toggle 取消
      onRemoveTag?.(trimmed);
    } else {
      onAddTag?.(trimmed);
    }
  }, [selectedTags, onAddTag, onRemoveTag]);

  const handleEnter = useCallback(() => {
    if (highlightIdx >= 0 && candidates[highlightIdx]) {
      submitTag(candidates[highlightIdx]);
      setInputValue('');
      return;
    }
    if (inputValue.trim()) {
      submitTag(inputValue);
      setInputValue('');
    }
  }, [highlightIdx, candidates, inputValue, submitTag]);

  const handleKeyDown = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      handleEnter();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(idx => Math.min(candidates.length - 1, idx + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(idx => Math.max(-1, idx - 1));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  // 阻止冒泡：全部点击都要 stop（避免 Popover 内点击触发卡片单击）
  const stopAll = (e) => e.stopPropagation();

  // 候选 chip 点击
  const handleCandidateClick = useCallback((tagName, e) => {
    e.stopPropagation();
    submitTag(tagName);
  }, [submitTag]);

  return (
    <Popover
      isOpen={isOpen}
      onOpen={onOpen}
      onClose={onClose}
      placement="top"
      closeOnBlur
      isLazy
      lazyBehavior="unmount"
    >
      <PopoverTrigger>
        {/* 触发器由调用方提供；要求是一个能接受 ref+onClick 的合法 child */}
        {React.cloneElement(trigger, {
          onClick: (e) => {
            e.stopPropagation();
            if (disabled) return;
            // 触发器原 onClick 仍然执行（保持图标按钮的 hover/aria 行为）
            trigger.props.onClick?.(e);
            isOpen ? onClose() : onOpen();
          },
          onMouseDown: (e) => {
            // 阻止拖拽框选启动
            e.stopPropagation();
            trigger.props.onMouseDown?.(e);
          },
          'aria-label': trigger.props['aria-label'] || t('tagBar.openEditor'),
          'aria-expanded': isOpen,
          'aria-haspopup': 'dialog',
        })}
      </PopoverTrigger>
      <Portal>
        <PopoverContent
          onClick={stopAll}
          onMouseDown={stopAll}
          onDoubleClick={stopAll}
          bg={fabColors.bgMenuTranslucent}
          backdropFilter="blur(50px)"
          borderColor={fabColors.borderSubdued}
          borderRadius={fabRadius['3']}
          boxShadow="0 12px 32px rgba(0,0,0,0.45)"
          w="280px"
          maxW="90vw"
          _focus={{ outline: 'none', boxShadow: '0 12px 32px rgba(0,0,0,0.45)' }}
        >
          <PopoverArrow bg={fabColors.bgMenuTranslucent} />
          <PopoverBody p={fabSpacing['3']}>
            <VStack spacing={fabSpacing['2']} align="stretch">
              {/* 输入框 */}
              <InputGroup size="sm">
                <InputLeftElement pointerEvents="none" h="32px" w="32px">
                  <SearchIcon color={fabColors.textSecondary} boxSize="14px" />
                </InputLeftElement>
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('tagBar.searchOrCreate')}
                  aria-label={t('tagBar.inputAriaLabel')}
                  bg={fabColors.bgInput}
                  borderColor={errorKey ? fabColors.critical : fabColors.borderSubdued}
                  borderRadius={fabRadius['1.5']}
                  color={fabColors.textPrimary}
                  _placeholder={{ color: fabColors.textSecondary }}
                  _focus={{
                    borderColor: brandColors.primary,
                    boxShadow: `0 0 0 1px ${brandColors.primary}`,
                  }}
                  h="32px"
                  pl="32px"
                />
              </InputGroup>

              {/* 错误提示（行内红字，不弹 toast） */}
              {errorKey && (
                <Text fontSize="xs" color={fabColors.critical} px={1}>
                  {t(errorKey)}
                </Text>
              )}

              {/* "创建新 tag" 提示行 */}
              {canCreateNew && !errorKey && (
                <HStack
                  px={2}
                  py={1.5}
                  borderRadius={fabRadius['1.5']}
                  bg={fabColors.fillSecondaryDefault}
                  cursor="pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEnter();
                  }}
                  role="option"
                  aria-selected="false"
                  _hover={{ bg: fabColors.fillSecondaryHover }}
                >
                  <Text fontSize="xs" color={fabColors.textSecondary}>
                    {t('tagBar.createNew')}:
                  </Text>
                  <Text fontSize="xs" color={brandColors.primary} fontWeight="600" noOfLines={1}>
                    {inputValue.trim()}
                  </Text>
                  <Text fontSize="2xs" color={fabColors.textSecondary} ml="auto">
                    Enter
                  </Text>
                </HStack>
              )}

              {/* 候选列表 */}
              <Box maxH="240px" overflowY="auto" role="listbox" aria-label={t('tagBar.candidatesAriaLabel')}>
                {isLoading && candidates.length === 0 ? (
                  <HStack justify="center" py={3}>
                    <Spinner size="xs" color={brandColors.primary} />
                    <Text fontSize="xs" color={fabColors.textSecondary}>
                      {t('tagBar.loading')}
                    </Text>
                  </HStack>
                ) : candidates.length === 0 ? (
                  <Text fontSize="xs" color={fabColors.textSecondary} textAlign="center" py={3}>
                    {debouncedQuery ? t('tagBar.noMatch') : t('tagBar.empty')}
                  </Text>
                ) : (
                  <Wrap spacing={fabSpacing['1']} px={1} py={1}>
                    {candidates.slice(0, 50).map((tagName, idx) => {
                      const isSelected = selectedTags.includes(tagName);
                      const isHighlighted = idx === highlightIdx;
                      return (
                        <WrapItem key={tagName}>
                          <Box
                            outline={isHighlighted ? `2px solid ${brandColors.primary}` : 'none'}
                            outlineOffset="1px"
                            borderRadius={fabRadius.round}
                          >
                            <TagPill
                              label={tagName}
                              active={isSelected}
                              size="sm"
                              onClick={(e) => handleCandidateClick(tagName, e)}
                              ariaLabel={isSelected
                                ? t('tagBar.removeAriaLabel', { tag: tagName })
                                : t('tagBar.addAriaLabel', { tag: tagName })}
                            />
                          </Box>
                        </WrapItem>
                      );
                    })}
                    {candidates.length > 50 && (
                      <WrapItem>
                        <Text fontSize="2xs" color={fabColors.textSecondary} alignSelf="center">
                          +{candidates.length - 50} {t('tagBar.moreHidden')}
                        </Text>
                      </WrapItem>
                    )}
                  </Wrap>
                )}
              </Box>

              {/* 底部提示行 */}
              <Text fontSize="2xs" color={fabColors.textSecondary} textAlign="center" pt={1}>
                {t('tagBar.hint')}
              </Text>
            </VStack>
          </PopoverBody>
        </PopoverContent>
      </Portal>
    </Popover>
  );
};

export default TagEditPopover;
