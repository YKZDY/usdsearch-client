/**
 * EditableTagsPanel - 可编辑 Tags 面板
 * 
 * chip 流布局 + 末尾 "+" 按钮 + 内联 input + 自动补全 Popover + 微动画
 * 替换 AssetDetailsModal 中原有的只读 Tags Table
 */

import React, { useState, useCallback, useRef, useEffect, memo } from 'react';
import {
  Box, Wrap, WrapItem, Tag, TagLabel, TagCloseButton,
  Input, IconButton, Tooltip, Text, useToast,
  List, ListItem, Spinner,
  Popover, PopoverTrigger, PopoverContent, PopoverBody, Portal,
} from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import { keyframes } from '@emotion/react';
import { useTranslation } from '../i18n/LanguageContext';
import useTagManager from '../hooks/useTagManager';
import { triggerReindexNow as triggerReindexNowApi } from '../services/reindexService';

// ─── 动画 keyframes ─────────────────────────────────────────────
const highlightFade = keyframes`
  0% { background-color: rgba(66, 153, 225, 0.3); }
  100% { background-color: transparent; }
`;

const toastSlideIn = keyframes`
  0% { opacity: 0; transform: translate(-50%, 20px) scale(0.92); }
  60% { opacity: 1; transform: translate(-50%, -4px) scale(1.01); }
  100% { opacity: 1; transform: translate(-50%, 0) scale(1); }
`;



const progressShrink = keyframes`
  0% { transform: scaleX(1); }
  100% { transform: scaleX(0); }
`;

const EditableTagsPanel = memo(function EditableTagsPanel({
  serverUrl,
  assetPath,
  initialTags = [],
  getHeaders,
  apiUrl,
  assetUrl,
}) {
  const { t } = useTranslation();
  const toast = useToast();

  // ─── Hook ─────────────────────────────────────────────────────
  const {
    tags, allTags, isLoading, isFreshLoaded, hasWritePermission,
    addTag, addMultipleTags, removeTag, undoRemove,
    loadSuggestions, filterSuggestions,
    reindexState, reindexUrl,
  } = useTagManager({ serverUrl, assetPath, initialTags, getHeaders, apiUrl, assetUrl });

  // ─── [TagSearchFix] reindex 超时时手动重试 ─────────────────────
  const handleManualReindexRetry = useCallback(() => {
    if (!apiUrl || !reindexUrl) return;
    triggerReindexNowApi(apiUrl, reindexUrl, getHeaders, { silent: false, poll: true })
      .then((res) => {
        if (res.success) {
          toast({
            title: t('reindexComplete') || '索引已更新',
            status: 'success',
            duration: 2000,
            isClosable: true,
          });
          // 完成后触发一次搜索刷新
          window.dispatchEvent(new Event('trigger-search'));
        } else if (res.timedOut) {
          toast({
            title: t('reindexTimeoutShort') || '索引仍在进行中，请稍后再试',
            status: 'warning',
            duration: 3000,
            isClosable: true,
          });
        }
      })
      .catch(() => {});
  }, [apiUrl, reindexUrl, getHeaders, toast, t]);

  // ─── Local state ──────────────────────────────────────────────
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);
  const [selectedSuggIdx, setSelectedSuggIdx] = useState(-1);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [undoToast, setUndoToast] = useState(null);
  const inputRef = useRef(null);
  const undoTimerRef = useRef(null);

  const clearUndoTimer = useCallback(() => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  }, []);

  const startUndoTimer = useCallback(() => {
    clearUndoTimer();
    undoTimerRef.current = setTimeout(() => {
      setUndoToast(null);
      undoTimerRef.current = null;
    }, 5000);
  }, [clearUndoTimer]);

  useEffect(() => () => clearUndoTimer(), [clearUndoTimer]);

  // ─── 打开输入框 ──────────────────────────────────────────────
  const openInput = useCallback(() => {
    setIsInputOpen(true);
    loadSuggestions();
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [loadSuggestions]);

  // ─── 关闭输入框 ──────────────────────────────────────────────
  const closeInput = useCallback(() => {
    setIsInputOpen(false);
    setInputValue('');
    setIsPopoverOpen(false);
    setSelectedSuggIdx(-1);
  }, []);

  // ─── 输入变化 → 过滤补全 ──────────────────────────────────────
  const handleInputChange = useCallback((e) => {
    const val = e.target.value;
    setInputValue(val);
    const filtered = filterSuggestions(val);
    setFilteredSuggestions(filtered);
    setIsPopoverOpen(val.trim().length > 0 && filtered.length > 0);
    setSelectedSuggIdx(-1);
  }, [filterSuggestions]);

  // ─── 聚焦时显示补全 ──────────────────────────────────────────
  const handleFocus = useCallback(() => {
    const filtered = filterSuggestions(inputValue);
    setFilteredSuggestions(filtered);
    setIsPopoverOpen(inputValue.trim().length > 0 && filtered.length > 0);
  }, [filterSuggestions, inputValue]);

  // ─── 提交 tag ────────────────────────────────────────────────
  const handleSubmit = useCallback((name) => {
    if (!name?.trim()) return;
    addTag(name.trim());
    setInputValue('');
    setIsPopoverOpen(false);
    setSelectedSuggIdx(-1);
    // 不关闭输入框，方便连续添加；空输入时不主动展开建议层，避免视觉噪音
  }, [addTag]);

  // ─── 粘贴处理 ────────────────────────────────────────────────
  const handlePaste = useCallback((e) => {
    const text = e.clipboardData?.getData('text') || '';
    // 检测是否包含分隔符
    if (/[,，\n\r]/.test(text)) {
      e.preventDefault();
      const names = text.split(/[,，\n\r]+/).map(s => s.trim()).filter(Boolean);
      if (names.length > 1) {
        addMultipleTags(names);
        toast({
          title: t('tagsPasteSplit', { count: names.length }) || `已拆分为 ${names.length} 个标签`,
          status: 'info',
          duration: 1500,
          isClosable: true,
        });
        setInputValue('');
      }
    }
  }, [addMultipleTags, toast, t]);

  // ─── 键盘事件 ────────────────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedSuggIdx >= 0 && filteredSuggestions[selectedSuggIdx]) {
        handleSubmit(filteredSuggestions[selectedSuggIdx].name);
      } else {
        handleSubmit(inputValue);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggIdx(prev => Math.min(prev + 1, filteredSuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggIdx(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Escape') {
      if (isPopoverOpen) {
        setIsPopoverOpen(false);
        setSelectedSuggIdx(-1);
      } else {
        closeInput();
      }
    }
  }, [selectedSuggIdx, filteredSuggestions, inputValue, isPopoverOpen, handleSubmit, closeInput]);

  // ─── 删除 tag + 撤销浮层 ───────────────────────────────────
  const handleRemove = useCallback((tagName) => {
    removeTag(tagName);
    setUndoToast({ tagName });
    startUndoTimer();
  }, [removeTag, startUndoTimer]);

  // ─── 渲染 ────────────────────────────────────────────────────
  if (isLoading && tags.length === 0) {
    return (
      <Box display="flex" justifyContent="center" py={4}>
        <Spinner size="sm" color="gray.400" />
      </Box>
    );
  }

  return (
    <Box
      opacity={isFreshLoaded ? 0.7 : 1}
      transition="opacity 0.15s ease"
      overflow="visible"
    >
      <Wrap spacing={2} align="center">
        {/* Tag Chips */}
        {allTags.map((tag) => (
          <WrapItem key={tag.name}>
            <TagChip
              tag={tag}
              hasWritePermission={hasWritePermission}
              onRemove={handleRemove}
            />
          </WrapItem>
        ))}

        {/* 输入框 or + 按钮 */}
        {hasWritePermission && (
          <WrapItem>
            {isInputOpen ? (
              <Popover
                isOpen={isPopoverOpen && filteredSuggestions.length > 0}
                placement="bottom-start"
                closeOnBlur={false}
                autoFocus={false}
                isLazy
              >
                <PopoverTrigger>
                  <Input
                    ref={inputRef}
                    value={inputValue}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onFocus={handleFocus}
                    onBlur={() => setTimeout(() => setIsPopoverOpen(false), 150)}
                    onPaste={handlePaste}
                    placeholder={inputValue ? '' : (t('tagInputPlaceholder') || '添加标签…')}
                    size="xs"
                    height="28px"
                    minW="100px"
                    maxW="160px"
                    bg="transparent"
                    border="1px solid"
                    borderColor="whiteAlpha.200"
                    borderRadius="6px"
                    color="white"
                    fontSize="13px"
                    px={2}
                    _focus={{ borderColor: 'rgba(66, 153, 225, 0.5)', boxShadow: 'none' }}
                    _placeholder={{ color: 'whiteAlpha.400', fontSize: '12px' }}
                  />
                </PopoverTrigger>
                <Portal>
                  <PopoverContent
                    bg="gray.800"
                    border="1px solid"
                    borderColor="whiteAlpha.200"
                    borderRadius="md"
                    boxShadow="0 12px 30px rgba(0, 0, 0, 0.35)"
                    zIndex={2000}
                    minW="160px"
                    maxW="260px"
                    w="max-content"
                    p={0}
                    _focus={{ boxShadow: '0 12px 30px rgba(0, 0, 0, 0.35)' }}
                  >
                    <PopoverBody p={0} maxH="200px" overflowY="auto">
                      <List spacing={0}>
                        {filteredSuggestions.map((s, idx) => (
                          <ListItem
                            key={s.name}
                            px={3} py={1.5}
                            fontSize="13px"
                            cursor="pointer"
                            bg={idx === selectedSuggIdx ? 'whiteAlpha.150' : 'transparent'}
                            color="whiteAlpha.900"
                            _hover={{ bg: 'whiteAlpha.100' }}
                            onMouseDown={(e) => { e.preventDefault(); handleSubmit(s.name); }}
                          >
                            {s.name}
                            {s.isRecent && (
                              <Text as="span" ml={2} fontSize="11px" color="whiteAlpha.400">
                                {t('recentlyUsed') || '最近'}
                              </Text>
                            )}
                          </ListItem>
                        ))}
                      </List>
                    </PopoverBody>
                  </PopoverContent>
                </Portal>
              </Popover>
            ) : (
              tags.length === 0 ? (
                <Text
                  fontSize="13px" color="whiteAlpha.400" cursor="pointer"
                  _hover={{ color: 'whiteAlpha.700' }}
                  onClick={openInput}
                  userSelect="none"
                >
                  {t('noTagsClickToAdd') || '暂无标签 · 点击添加'}
                </Text>
              ) : (
                <IconButton
                  icon={<AddIcon />}
                  size="xs"
                  variant="ghost"
                  color="whiteAlpha.500"
                  _hover={{ color: 'whiteAlpha.900', bg: 'whiteAlpha.100' }}
                  onClick={openInput}
                  aria-label={t('addTag') || '添加标签'}
                  borderRadius="full"
                />
              )
            )}
          </WrapItem>
        )}

        {/* 无权限 + 无 tag 时 */}
        {!hasWritePermission && tags.length === 0 && (
          <WrapItem>
            <Text fontSize="13px" color="whiteAlpha.300">
              {t('noTagsFound') || '暂无标签'}
            </Text>
          </WrapItem>
        )}
      </Wrap>

      {undoToast && (
        <Portal>
          <Box
            position="fixed"
            left="50%"
            bottom="72px"
            zIndex={2600}
            animation={`${toastSlideIn} 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards`}
            onMouseEnter={clearUndoTimer}
            onMouseLeave={startUndoTimer}
          >
            {/* 主体卡片 - 黑金优雅主题 */}
            <Box
              bg="rgba(20, 24, 29, 0.85)"
              backdropFilter="blur(24px) saturate(1.5)"
              color="whiteAlpha.900"
              pl={4}
              pr={2}
              py={2}
              borderRadius="full"
              border="1px solid"
              borderColor="rgba(255, 210, 48, 0.15)"
              boxShadow="0 16px 40px -10px rgba(0, 0, 0, 0.8), 0 0 20px -5px rgba(255, 210, 48, 0.12)"
              display="flex"
              alignItems="center"
              gap={3}
              minW="max-content"
              maxW="400px"
              overflow="hidden"
              position="relative"
            >
              {/* 左侧发光圆点 */}
              <Box
                w="6px"
                h="6px"
                borderRadius="full"
                bg="#FFD230"
                boxShadow="0 0 10px #FFD230"
                flexShrink={0}
              />

              {/* 文案区 */}
              <Box flex="1" minW={0} pr={2} display="flex" alignItems="center">
                <Text fontSize="13px" fontWeight="400" noOfLines={1} color="whiteAlpha.800" letterSpacing="0.2px" display="flex" alignItems="center">
                  {(t('tagRemoved', { name: undoToast.tagName }) || `已删除标签 "${undoToast.tagName}"`).split(undoToast.tagName).map((part, i, arr) => {
                    let cleanPart = part;
                    // 去除可能紧挨着标签名的双引号或单引号
                    if (i < arr.length - 1 && (cleanPart.endsWith('"') || cleanPart.endsWith("'"))) {
                      cleanPart = cleanPart.slice(0, -1);
                    }
                    if (i > 0 && (cleanPart.startsWith('"') || cleanPart.startsWith("'"))) {
                      cleanPart = cleanPart.slice(1);
                    }
                    return (
                      <React.Fragment key={i}>
                        {cleanPart}
                        {i < arr.length - 1 && (
                          <Text
                            as="span"
                            color="white"
                            fontWeight="600"
                            mx={1}
                            px={1.5}
                            py={0.5}
                            bg="rgba(255, 255, 255, 0.08)"
                            borderRadius="4px"
                            border="1px solid"
                            borderColor="rgba(255, 255, 255, 0.16)"
                            boxShadow="inset 0 1px 0 rgba(255,255,255,0.05)"
                            display="inline-block"
                            lineHeight="1.2"
                            maxW="140px"
                            isTruncated
                          >
                            {undoToast.tagName}
                          </Text>
                        )}
                      </React.Fragment>
                    );
                  })}
                </Text>
              </Box>

              {/* 分隔线 */}
              <Box w="1px" h="14px" bg="whiteAlpha.200" flexShrink={0} />

              {/* 撤销按钮 */}
              <Text
                as="button"
                fontSize="13px"
                fontWeight="600"
                color="#FFD230"
                bg="transparent"
                borderRadius="full"
                px={4}
                py={1.5}
                flexShrink={0}
                cursor="pointer"
                transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                _hover={{ color: '#FFE680', bg: 'rgba(255, 210, 48, 0.1)', transform: 'scale(1.02)' }}
                _active={{ transform: 'scale(0.98)' }}
                onClick={() => {
                  undoRemove(undoToast.tagName);
                  clearUndoTimer();
                  setUndoToast(null);
                }}
              >
                {t('undo') || '撤销'}
              </Text>

              {/* 底部进度条 */}
              <Box
                position="absolute"
                bottom="0"
                left="0"
                right="0"
                h="1.5px"
                bg="transparent"
                overflow="hidden"
              >
                <Box
                  h="100%"
                  bg="linear-gradient(90deg, rgba(255, 210, 48, 0.2), #FFD230)"
                  transformOrigin="left"
                  animation={`${progressShrink} 5s linear forwards`}
                />
              </Box>
            </Box>
          </Box>
        </Portal>
      )}
      {/* [TagSearchFix] reindex 超时提示：12px 灰字 + 立即重试 */}
      {reindexState === 'timeout' && (
        <Box mt={2} display="flex" alignItems="center" gap={2}>
          <Text fontSize="12px" color="gray.400">
            {(() => { const v = t('reindexDelayedHint'); return (v && v !== 'reindexDelayedHint') ? v : '索引更新可能延迟'; })()}
          </Text>
          <Text
            as="span"
            fontSize="12px"
            color="yellow.300"
            cursor="pointer"
            textDecoration="underline"
            _hover={{ color: 'yellow.200' }}
            onClick={handleManualReindexRetry}
          >
            {(() => { const v = t('retryNow'); return (v && v !== 'retryNow') ? v : '立即重试'; })()}
          </Text>
        </Box>
      )}
    </Box>
  );
});

// ─── TagChip 子组件 ──────────────────────────────────────────────
const TagChip = memo(function TagChip({ tag, hasWritePermission, onRemove }) {
  const isPending = tag.status === 'pending';
  const isRemoving = tag.status === 'removing';
  const displayName = tag.name.length > 16 ? `${tag.name.slice(0, 16)}…` : tag.name;

  return (
    <Tooltip
      label={tag.name.length > 16 ? tag.name : undefined}
      fontSize="12px" placement="top" hasArrow openDelay={300}
      isDisabled={tag.name.length <= 16}
    >
      <Tag
        size="md"
        variant="subtle"
        bg={isPending ? 'rgba(66, 153, 225, 0.12)' : 'whiteAlpha.100'}
        color={isPending ? 'blue.200' : 'whiteAlpha.800'}
        border="1px solid"
        borderColor={isPending ? 'rgba(66, 153, 225, 0.3)' : 'transparent'}
        borderRadius="6px"
        px={3} py={1.5} minH="28px"
        opacity={isRemoving ? 0 : 1}
        transform={isRemoving ? 'scale(0.8)' : 'scale(1)'}
        transition="all 0.15s ease"
        animation={isPending ? undefined : (tag._justAdded ? `${highlightFade} 0.3s ease` : undefined)}
        _hover={{ borderColor: 'whiteAlpha.300' }}
      >
        <TagLabel fontSize="13px">{displayName}</TagLabel>
        {hasWritePermission && !isPending && (
          <TagCloseButton
            opacity={0.3}
            _hover={{ opacity: 1 }}
            transition="opacity 0.15s"
            onClick={(e) => { e.stopPropagation(); onRemove(tag.name); }}
          />
        )}
      </Tag>
    </Tooltip>
  );
});

export default EditableTagsPanel;
