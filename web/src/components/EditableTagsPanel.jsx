/**
 * EditableTagsPanel - 可编辑 Tags 面板
 * 
 * chip 流布局 + 末尾 "+" 按钮 + 内联 input + 自动补全 Popover + 微动画
 * 替换 AssetDetailsModal 中原有的只读 Tags Table
 */

import React, { useState, useCallback, useRef, useEffect, useMemo, memo } from 'react';
import {
  Box, Wrap, WrapItem, Tag, TagLabel, TagCloseButton,
  Input, IconButton, Tooltip, Text, useToast,
  List, ListItem, Spinner,
  Popover, PopoverTrigger, PopoverContent, PopoverBody, PopoverHeader,
  PopoverArrow, PopoverCloseButton, Portal,
  Button, Divider, Code, HStack, VStack,
} from '@chakra-ui/react';
import { AddIcon, InfoOutlineIcon, WarningTwoIcon } from '@chakra-ui/icons';
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
    // [TagFailureSurface] 错误诊断 API
    lastError, clearLastError, retryFailedTag, diagnosticsContext,
  } = useTagManager({ serverUrl, assetPath, initialTags, getHeaders, apiUrl, assetUrl });

  // ─── [TagFailureSurface] lastError → 分类 toast ────────────────
  // 根据 err.kind 选择文案，每次 lastError 变化（at 戳变）触发一次。
  // useTagManager 内部已有 8s 同 kind 去抖，这里直接根据 at 触发。
  const lastErrorAtRef = useRef(0);
  useEffect(() => {
    if (!lastError) {
      lastErrorAtRef.current = 0;
      return;
    }
    if (lastError.at === lastErrorAtRef.current) return;
    lastErrorAtRef.current = lastError.at;

    // 文案映射（i18n 优先，本地兜底）
    const fallbackByKind = {
      auth: '需要重新登录 Nucleus（标签写入被拒绝）',
      network: '无法连接标签服务，请检查网络后重试',
      'server-rejected': '服务端拒绝了本次标签修改',
      'invalid-host': '后端地址配置异常，无法发起标签请求',
      timeout: '标签服务响应超时',
      unknown: '标签操作失败，请稍后重试',
    };
    const i18nKeyByKind = {
      auth: 'tagErrorAuth',
      network: 'tagErrorNetwork',
      'server-rejected': 'tagErrorServerRejected',
      'invalid-host': 'tagErrorInvalidHost',
      timeout: 'tagErrorTimeout',
      unknown: 'tagErrorUnknown',
    };
    const kind = lastError.kind || 'unknown';
    const i18nKey = i18nKeyByKind[kind] || 'tagErrorUnknown';
    const i18nText = t(i18nKey);
    const title = (i18nText && i18nText !== i18nKey) ? i18nText : (fallbackByKind[kind] || fallbackByKind.unknown);
    const description = lastError.method ? `${lastError.method} · ${kind}/${lastError.stage}` : `${kind}/${lastError.stage}`;

    toast({
      title,
      description,
      status: kind === 'auth' ? 'warning' : 'error',
      duration: 5000,
      isClosable: true,
      position: 'bottom',
    });
  }, [lastError, t, toast]);

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
              onRetry={retryFailedTag}
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

        {/* [TagFailureSurface] 诊断按钮：有失败 或 无写权限 时显示 */}
        {(lastError || !hasWritePermission) && (
          <WrapItem>
            <DiagnosticsButton
              lastError={lastError}
              hasWritePermission={hasWritePermission}
              diagnosticsContext={diagnosticsContext}
              onClear={clearLastError}
              t={t}
            />
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
const TagChip = memo(function TagChip({ tag, hasWritePermission, onRemove, onRetry }) {
  const isPending = tag.status === 'pending';
  const isRemoving = tag.status === 'removing';
  const isFailed = tag.status === 'failed';
  const displayName = tag.name.length > 16 ? `${tag.name.slice(0, 16)}…` : tag.name;

  // [TagFailureSurface] failed 状态：红色描边 + tooltip 显示重试提示 + 点击重试
  if (isFailed) {
    return (
      <Tooltip
        label="保存失败，点击重试"
        fontSize="12px" placement="top" hasArrow openDelay={150}
      >
        <Tag
          size="md"
          variant="subtle"
          bg="rgba(229, 62, 62, 0.12)"
          color="red.200"
          border="1px solid"
          borderColor="rgba(229, 62, 62, 0.5)"
          borderRadius="6px"
          px={3} py={1.5} minH="28px"
          cursor="pointer"
          transition="all 0.15s ease"
          _hover={{ bg: 'rgba(229, 62, 62, 0.2)', borderColor: 'rgba(229, 62, 62, 0.7)' }}
          onClick={(e) => { e.stopPropagation(); onRetry && onRetry(tag.name); }}
        >
          <WarningTwoIcon mr={1.5} fontSize="11px" color="red.300" />
          <TagLabel fontSize="13px">{displayName}</TagLabel>
        </Tag>
      </Tooltip>
    );
  }

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

// ─── DiagnosticsButton 子组件 ──────────────────────────────────
// [TagFailureSurface] tag 写入失败 / 无写权限时显示一个低调的 "ⓘ" 按钮，
// 点击展开 Popover，列出 hostUsed / tokenSource / closeCode / serverCode /
// jwtExp / clockSkewSuspected / userAgent / protocol / clientNow 等诊断字段，
// 并提供"复制诊断信息"按钮（剪贴板内容不含 token）。
//
// 设计意图：让 Calvin 这样的远程用户能直接截图/复制 → 操作者凭一行字符串即可定位根因，
// 不需要让对方跑脚本或开 DevTools Network 面板。
const DiagnosticsButton = memo(function DiagnosticsButton({ lastError, hasWritePermission, diagnosticsContext, onClear, t }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  // 把状态汇总成一个可读的诊断字符串（一行式，方便聊天工具粘贴）
  const diagnosticString = useMemo(() => {
    const ctx = diagnosticsContext || {};
    const err = lastError || {};
    const env = err.env || {};
    // [TagStorageKeyFix] storageKeys 同步快照（仅存在性，不含 token 值）
    let keysStr = '';
    try {
      if (typeof localStorage !== 'undefined') {
        const host = ctx.effectiveServerUrl || ctx.host || '';
        const aliases = Array.isArray(ctx.storageKeyAliases) ? ctx.storageKeyAliases : [];
        const parts = [];
        if (host) parts.push(`${host}=${localStorage.getItem(`${host}_nucleus_access_token`) ? 1 : 0}`);
        for (const a of aliases) {
          if (!a || a === host) continue;
          parts.push(`${a}=${localStorage.getItem(`${a}_nucleus_access_token`) ? 1 : 0}`);
        }
        parts.push(`bare=${localStorage.getItem('nucleus_access_token') ? 1 : 0}`);
        keysStr = parts.join(',');
      }
    } catch (_) { /* ignore */ }
    const fields = [
      `kind=${err.kind || (hasWritePermission ? 'none' : 'no-write-permission')}`,
      err.stage && `stage=${err.stage}`,
      err.method && `method=${err.method}`,
      `host=${err.hostUsed || ctx.host || ''}`,
      `tokenSource=${err.tokenSource || ctx.tokenSource || 'none'}`,
      err.sourceAliasMatched && `aliasHit=${err.sourceAliasMatched}`,
      keysStr && `keys={${keysStr}}`,
      typeof err.closeCode === 'number' && `closeCode=${err.closeCode}`,
      typeof err.serverCode === 'number' && `serverCode=${err.serverCode}`,
      typeof err.jwtExp === 'number' && `jwtExp=${err.jwtExp}`,
      err.clockSkewSuspected && 'clockSkewSuspected=true',
      env.protocol && `protocol=${env.protocol}`,
      env.clientNow && `clientNow=${env.clientNow}`,
      env.userAgent && `ua=${env.userAgent}`,
    ].filter(Boolean);
    return `[TagDiagnostics] ${fields.join(' | ')}`;
  }, [lastError, hasWritePermission, diagnosticsContext]);

  // 建议操作（根据 kind 给一句话提示）
  const suggestion = useMemo(() => {
    if (!lastError) {
      return hasWritePermission ? '当前无错误' : '当前 token 没有标签写入权限，请重新登录 Nucleus（DeviceFlow）';
    }
    switch (lastError.kind) {
      case 'auth': return '建议：重新登录 Nucleus（DeviceFlow），或检查本机时钟是否偏差过大';
      case 'network': return '建议：检查公司内网/VPN 连通性，确认浏览器允许 wss 到 Nucleus 域名';
      case 'server-rejected': return '建议：服务端拒绝了请求，请联系管理员查看 Nucleus 侧日志';
      case 'invalid-host': return '建议：检查 URL ?server= 参数或 SERVER_MAPPING 部署配置';
      case 'timeout': return '建议：Nucleus 服务可能繁忙，稍后重试；若持续请联系管理员';
      default: return '建议：刷新页面后重试；若仍失败请把下方诊断信息发给管理员';
    }
  }, [lastError, hasWritePermission]);

  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(diagnosticString);
      } else {
        // fallback：execCommand
        const ta = document.createElement('textarea');
        ta.value = diagnosticString;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast({
        title: t('diagnosticsCopied') === 'diagnosticsCopied' ? '诊断信息已复制' : t('diagnosticsCopied'),
        status: 'success',
        duration: 1500,
        isClosable: true,
        position: 'bottom',
      });
    } catch (_) {
      toast({
        title: t('copyFailed') === 'copyFailed' ? '复制失败' : t('copyFailed'),
        status: 'error',
        duration: 2000,
        isClosable: true,
      });
    }
  }, [diagnosticString, toast, t]);

  const ctx = diagnosticsContext || {};
  const err = lastError || {};
  const env = err.env || {};

  // [TagStorageKeyFix] storageKeys 状态：同步读 localStorage，仅展示存在性，不显示 token 值
  // 让排查时一眼看出"到底是哪个前缀的 key 命中"，不用翻 F12 Application 面板
  const storageKeysSnapshot = useMemo(() => {
    if (typeof localStorage === 'undefined') return null;
    try {
      const host = ctx.effectiveServerUrl || ctx.host || '';
      const aliases = Array.isArray(ctx.storageKeyAliases) ? ctx.storageKeyAliases : [];
      const items = [];
      if (host) {
        items.push({
          label: `${host}_*`,
          present: !!localStorage.getItem(`${host}_nucleus_access_token`),
          tag: 'host',
        });
      }
      for (const a of aliases) {
        if (!a || a === host) continue;
        items.push({
          label: `${a}_*`,
          present: !!localStorage.getItem(`${a}_nucleus_access_token`),
          tag: 'alias',
        });
      }
      items.push({
        label: 'bare',
        present: !!localStorage.getItem('nucleus_access_token'),
        tag: 'bare',
      });
      return items;
    } catch (_) {
      return null;
    }
    // 故意每次 render 重算（无副作用），保证打开 Popover 时是最新值
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.effectiveServerUrl, ctx.host, ctx.storageKeyAliases, lastError]);


  return (
    <Popover placement="bottom-start" isLazy>
      <PopoverTrigger>
        <IconButton
          icon={<InfoOutlineIcon />}
          size="xs"
          variant="ghost"
          aria-label="标签诊断信息"
          color={lastError ? 'red.300' : 'whiteAlpha.400'}
          _hover={{ color: lastError ? 'red.200' : 'whiteAlpha.700', bg: 'whiteAlpha.100' }}
          height="28px"
          width="28px"
        />
      </PopoverTrigger>
      <Portal>
        <PopoverContent bg="rgba(20, 24, 29, 0.96)" backdropFilter="blur(20px)" borderColor="whiteAlpha.200" maxW="420px">
          <PopoverArrow bg="rgba(20, 24, 29, 0.96)" />
          <PopoverCloseButton color="whiteAlpha.700" />
          <PopoverHeader borderColor="whiteAlpha.200" fontSize="13px" fontWeight="600" color="whiteAlpha.900">
            {lastError ? `标签操作失败 · ${lastError.kind}` : '标签写入权限不可用'}
          </PopoverHeader>
          <PopoverBody>
            <VStack align="stretch" spacing={2} fontSize="12px">
              <Text color="whiteAlpha.800">{suggestion}</Text>
              <Divider borderColor="whiteAlpha.200" />

              <DiagField label="Host" value={err.hostUsed || ctx.host || '-'} />
              <DiagField label="Token 来源" value={
                err.tokenSource || ctx.tokenSource
                  ? `${err.tokenSource || ctx.tokenSource}${err.sourceAliasMatched ? ` (alias=${err.sourceAliasMatched})` : ''}`
                  : 'none'
              } />
              {err.method && <DiagField label="Method" value={err.method} />}
              {err.stage && <DiagField label="Stage" value={err.stage} />}
              {typeof err.closeCode === 'number' && <DiagField label="WS Close Code" value={String(err.closeCode)} />}
              {typeof err.serverCode === 'number' && <DiagField label="Server Code" value={`0x${err.serverCode.toString(16)}`} />}
              {typeof err.jwtExp === 'number' && (
                <DiagField label="JWT exp" value={`${err.jwtExp} (${new Date(err.jwtExp * 1000).toISOString()})`} />
              )}
              {storageKeysSnapshot && storageKeysSnapshot.length > 0 && (
                <DiagField
                  label="Storage Keys"
                  value={storageKeysSnapshot.map(it => `${it.label}=${it.present ? '✓' : '✗'}`).join('  ')}
                  truncate
                />
              )}
              {err.clockSkewSuspected && (
                <Text color="orange.300" fontSize="11px">⚠ 检测到客户端时钟可能偏差，请校准系统时间</Text>
              )}

              {env.protocol === 'http:' && (
                <Text color="orange.300" fontSize="11px">⚠ 当前页面为 http://，浏览器混合内容策略可能拦截 wss 请求</Text>
              )}

              <Divider borderColor="whiteAlpha.200" />
              <Text color="whiteAlpha.500" fontSize="11px">环境</Text>
              {env.protocol && <DiagField label="Protocol" value={env.protocol} />}
              {env.clientNow && <DiagField label="客户端时间" value={env.clientNow} />}
              {env.userAgent && <DiagField label="UA" value={env.userAgent} truncate />}

              <Divider borderColor="whiteAlpha.200" />
              <HStack spacing={2} pt={1}>
                <Button size="xs" colorScheme="yellow" variant="solid" onClick={handleCopy} flex={1}>
                  {copied ? '已复制 ✓' : '复制诊断信息'}
                </Button>
                {lastError && (
                  <Button size="xs" variant="outline" color="whiteAlpha.700" borderColor="whiteAlpha.300" onClick={onClear}>
                    清除
                  </Button>
                )}
              </HStack>
              <Code
                fontSize="10px"
                p={1.5}
                bg="blackAlpha.500"
                color="whiteAlpha.600"
                borderRadius="3px"
                whiteSpace="pre-wrap"
                wordBreak="break-all"
              >
                {diagnosticString}
              </Code>
            </VStack>
          </PopoverBody>
        </PopoverContent>
      </Portal>
    </Popover>
  );
});

// 单行字段展示
const DiagField = memo(function DiagField({ label, value, truncate }) {
  return (
    <HStack spacing={2} align="start">
      <Text color="whiteAlpha.500" fontSize="11px" minW="80px" flexShrink={0}>{label}</Text>
      <Text
        color="whiteAlpha.900"
        fontSize="11px"
        fontFamily="mono"
        noOfLines={truncate ? 2 : undefined}
        wordBreak="break-all"
        flex={1}
      >
        {value}
      </Text>
    </HStack>
  );
});

export default EditableTagsPanel;
