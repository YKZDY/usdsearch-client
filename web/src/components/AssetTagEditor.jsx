/**
 * AssetTagEditor - 详情抽屉内的完整 tag 编辑器
 *
 * 注入位置：<AssetDetailsDrawer tagsAreaContent={<AssetTagEditor asset={...} />} />
 *
 * 与 <CardTagBar> 的关系：
 *   - 共享底层 useAssetTags hook（基于 useTagManager）
 *   - useTagManager mount 时会通过 wss apiGetTags 主动拉取服务端最新 tags，
 *     所以"用户在卡片改了 tag → 重开抽屉看同一资产"会自动看到最新（服务端是 source of truth）
 *   - "用户在抽屉改 tag → 卡片同步显示" 通过 useAssetTags 内部 tagBus 事件做提示性广播
 *     （差量同步在受限的 useTagManager API 下做不到 100% 实时，但 addTag 是真正幂等的）
 *
 * 比 CardTagBar 多的能力：
 *   - 不限 maxVisible，全量渲染
 *   - 内联输入框（不再 Popover），按 Enter 添加
 *   - 支持批量粘贴 `tag1, tag2, tag3` 一次添加多个
 *   - 显示 status='failed' 的红色 chip，点击重试
 *   - 每个 tag 的 source icon（用户/系统/AI），数据缺失时统一按"用户"显示
 *
 * 新文件按 NVIDIA 合入安全规则不需要 LM CUSTOMIZATION 标记。
 */

import React, { memo, useState, useCallback, useRef } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Wrap,
  WrapItem,
  Input,
  IconButton,
  Spinner,
  Tooltip,
  useToast,
} from '@chakra-ui/react';
import { AddIcon, RepeatIcon, CheckIcon } from '@chakra-ui/icons';
import { brandColors, fabColors, fabRadius, fabSpacing } from '../theme/fabTokens';
import useAssetTags from '../hooks/useAssetTags';
import { useTranslation } from '../i18n/LanguageContext';
import TagPill from './TagPill';

const MAX_TAG_LENGTH = 50;
const TAG_NAME_INVALID = /[\\/\n\r\t]/;
// 批量粘贴分隔符：英文逗号、中文逗号、英文分号、换行
const BATCH_SPLIT = /[,，;；\n\r\t]+/;

/**
 * 校验单个 tag 名字
 * @returns {string|null} 错误 i18n key（成功为 null）
 */
function validateTagName(name) {
  if (!name || !name.trim()) return 'tagBar.errorEmpty';
  const trimmed = name.trim();
  if (trimmed.length > MAX_TAG_LENGTH) return 'tagBar.errorTooLong';
  if (TAG_NAME_INVALID.test(trimmed)) return 'tagBar.errorInvalidChars';
  return null;
}

/**
 * 解析 tag 来源 icon（数据缺失时返回 'user'）
 */
function inferTagSource(tagWithStatus) {
  if (!tagWithStatus || typeof tagWithStatus !== 'object') return 'user';
  const ns = tagWithStatus.tag_namespace || tagWithStatus.namespace || '';
  // appearance / user 默认为用户标
  if (ns === 'system' || ns === 'auto') return 'system';
  if (ns === 'ai' || ns === 'ai_generated') return 'ai';
  return 'user';
}

const SourceBadge = memo(function SourceBadge({ source, t }) {
  const labels = {
    user: t('tagEditor.sourceUser'),
    system: t('tagEditor.sourceSystem'),
    ai: t('tagEditor.sourceAi'),
  };
  const colors = {
    user: fabColors.textSecondary,
    system: '#26bbff',
    ai: '#be3dff',
  };
  return (
    <Box
      fontSize="2xs"
      color={colors[source]}
      px={1}
      borderRadius={fabRadius['0.5']}
      borderWidth="1px"
      borderColor={colors[source]}
      lineHeight="14px"
      h="14px"
    >
      {labels[source]}
    </Box>
  );
});

const AssetTagEditor = memo(function AssetTagEditor({ asset, serverUrl, getHeaders, apiUrl }) {
  const { t } = useTranslation();
  const toast = useToast();
  const {
    tags,
    tagsWithStatus,
    addTag,
    addMultipleTags,
    removeTag,
    isLoading,
    hasWritePermission,
    lastError,
    retryFailedTag,
  } = useAssetTags({ asset, serverUrl, getHeaders, apiUrl });

  const [input, setInput] = useState('');
  const [errorKey, setErrorKey] = useState(null);
  const inputRef = useRef(null);

  // ─── 提交单个 tag ─────────────────────────────────────────
  const submitOne = useCallback((name) => {
    const err = validateTagName(name);
    if (err) {
      setErrorKey(err);
      return false;
    }
    setErrorKey(null);
    const trimmed = name.trim();
    if (tags.includes(trimmed)) {
      // 已存在：行内提示，不重复添加
      setErrorKey(null);
      toast({
        title: t('tagBar.errorEmpty') === '' ? '' : `"${trimmed}" already exists`,
        status: 'info',
        duration: 1500,
        position: 'bottom-right',
        isClosable: true,
      });
      return false;
    }
    addTag(trimmed);
    return true;
  }, [tags, addTag, toast, t]);

  // ─── 批量提交 ──────────────────────────────────────────────
  const submitBatch = useCallback((raw) => {
    const parts = String(raw || '').split(BATCH_SPLIT).map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return false;
    const validNames = [];
    let firstErr = null;
    for (const name of parts) {
      const err = validateTagName(name);
      if (err) {
        if (!firstErr) firstErr = err;
        continue;
      }
      if (!tags.includes(name) && !validNames.includes(name)) {
        validNames.push(name);
      }
    }
    if (firstErr && validNames.length === 0) {
      setErrorKey(firstErr);
      return false;
    }
    setErrorKey(firstErr); // 部分有效部分无效时，仍展示第一个错误
    if (validNames.length > 0) {
      addMultipleTags(validNames);
      toast({
        title: t('tagEditor.batchAddedToast', { n: validNames.length }),
        status: 'success',
        duration: 1500,
        position: 'bottom-right',
        isClosable: true,
      });
    }
    return validNames.length > 0;
  }, [tags, addMultipleTags, t, toast]);

  // ─── 输入处理 ──────────────────────────────────────────────
  const handleKeyDown = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      // 如果 input 包含分隔符 → 走批量；否则走单个
      const raw = input;
      let success;
      if (BATCH_SPLIT.test(raw)) {
        success = submitBatch(raw);
      } else {
        success = submitOne(raw);
      }
      if (success) setInput('');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setInput('');
      setErrorKey(null);
    }
  };

  const handlePaste = (e) => {
    const text = e.clipboardData?.getData?.('text') || '';
    if (BATCH_SPLIT.test(text)) {
      e.preventDefault();
      const merged = (input + text).trim();
      if (submitBatch(merged)) setInput('');
    }
    // 否则交给浏览器原生粘贴行为
  };

  const handleAddClick = (e) => {
    e.stopPropagation();
    if (!input.trim()) return;
    let success;
    if (BATCH_SPLIT.test(input)) {
      success = submitBatch(input);
    } else {
      success = submitOne(input);
    }
    if (success) setInput('');
  };

  const canEdit = hasWritePermission !== false;

  // 渲染时把 tagsWithStatus（含 status / 来源）映射为视图项
  const viewItems = (tagsWithStatus || [])
    .filter(t2 => t2 && t2.status !== 'removing')
    .map(t2 => ({
      name: typeof t2 === 'string' ? t2 : t2.name,
      status: typeof t2 === 'string' ? 'normal' : (t2.status || 'normal'),
      source: inferTagSource(t2),
    }));

  return (
    <VStack
      align="stretch"
      spacing={fabSpacing['2']}
      data-section="tags"
      onClick={(e) => e.stopPropagation()}
    >
      <HStack justify="space-between" align="center">
        <Text
          fontSize="xs"
          color={fabColors.textSecondary}
          textTransform="uppercase"
          letterSpacing="0.6px"
          fontWeight="700"
        >
          {t('tagEditor.title')}
        </Text>
        {isLoading && <Spinner size="xs" color={brandColors.primary} />}
      </HStack>

      {/* ── tag 列表 ──────────────────────────────────────────── */}
      {viewItems.length === 0 ? (
        <Text fontSize="xs" color={fabColors.textSecondary} py={fabSpacing['1']}>
          {t('tagEditor.empty')}
        </Text>
      ) : (
        <Wrap spacing={fabSpacing['1']}>
          {viewItems.map((item) => (
            <WrapItem key={item.name}>
              <HStack spacing={1}>
                <TagPill
                  label={item.name}
                  active={item.status !== 'failed'}
                  status={item.status === 'pending' ? 'pending' : item.status === 'failed' ? 'failed' : 'normal'}
                  removable={canEdit}
                  size="sm"
                  onRemove={canEdit ? () => removeTag(item.name) : undefined}
                  onClick={item.status === 'failed' && canEdit ? () => retryFailedTag(item.name) : undefined}
                  ariaLabel={
                    item.status === 'failed'
                      ? t('tagEditor.failedRetry')
                      : t('tagEditor.removeAriaLabel', { tag: item.name })
                  }
                />
                <SourceBadge source={item.source} t={t} />
              </HStack>
            </WrapItem>
          ))}
        </Wrap>
      )}

      {/* ── 输入框 ────────────────────────────────────────────── */}
      {canEdit && (
        <HStack spacing={fabSpacing['1']}>
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); setErrorKey(null); }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onClick={(e) => e.stopPropagation()}
            placeholder={t('tagEditor.placeholder')}
            aria-label={t('tagBar.inputAriaLabel')}
            size="sm"
            bg={fabColors.bgInput}
            borderColor={errorKey ? fabColors.critical : fabColors.borderSubdued}
            borderRadius={fabRadius['1.5']}
            color={fabColors.textPrimary}
            _placeholder={{ color: fabColors.textSecondary }}
            _focus={{
              borderColor: brandColors.primary,
              boxShadow: `0 0 0 1px ${brandColors.primary}`,
            }}
          />
          <Tooltip label={t('tagBar.addButtonAriaLabel')} placement="top" hasArrow openDelay={400}>
            <IconButton
              aria-label={t('tagBar.addButtonAriaLabel')}
              icon={input ? <CheckIcon /> : <AddIcon />}
              size="sm"
              onClick={handleAddClick}
              isDisabled={!input.trim()}
              bg={input.trim() ? brandColors.primary : 'transparent'}
              color={input.trim() ? brandColors.onPrimary : fabColors.textSecondary}
              borderWidth="1px"
              borderColor={input.trim() ? brandColors.primary : fabColors.borderSubdued}
              borderRadius={fabRadius['1.5']}
              _hover={{
                bg: input.trim() ? brandColors.primary : fabColors.fillTertiaryHover,
                opacity: input.trim() ? 0.85 : 1,
              }}
              _focusVisible={{
                outline: 'none',
                boxShadow: `0 0 0 2px ${brandColors.primary}66`,
              }}
            />
          </Tooltip>
        </HStack>
      )}

      {/* ── 错误提示行 ────────────────────────────────────────── */}
      {errorKey && (
        <Text fontSize="2xs" color={fabColors.critical}>
          {t(errorKey)}
        </Text>
      )}

      {/* ── 网络错误提示（来自 useTagManager.lastError）──────── */}
      {lastError && lastError.kind && (
        <HStack spacing={1} fontSize="2xs" color={fabColors.critical}>
          <RepeatIcon />
          <Text>{lastError.message || lastError.kind}</Text>
        </HStack>
      )}

      {/* ── 无写权限提示 ──────────────────────────────────────── */}
      {!canEdit && (
        <Text fontSize="2xs" color={fabColors.textSecondary}>
          {t('tagBar.noWritePermission')}
        </Text>
      )}
    </VStack>
  );
});

export default AssetTagEditor;
