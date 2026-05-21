/**
 * CardTagBar - 卡片底部业务 tag 区
 *
 * 替代位置：
 *   原 <QueryMatchBadges> / <SmartHighlightedContent>（HYBRID/字段匹配标签）
 *
 * 视觉规则：
 *   - 0 tag：单个灰色 "+ 添加" 圆形小按钮，hover 变金色（保留高度避免抖动）
 *   - >0 tag：前 maxVisible 个 <TagPill active removable> + "+" 图标（开 Popover）
 *   - 溢出：用 "+N" 灰色 chip 表示，点击同样开 Popover
 *
 * 交互：
 *   - 任何按钮 / chip 点击都 stopPropagation，不触发卡片本体单击/双击/拖拽框选
 *   - 点 "+ 添加" / "+N" → 打开 <TagEditPopover>
 *   - 已打 tag 上的 × → 直接 removeTag（不进 popover）
 *
 * 性能：
 *   - React.memo 包裹（依赖 asset.id / source.url 引用）
 *   - 实际 tag 数据走 useAssetTags（内部 useTagManager），多卡片共享 useGlobalTags 模块级 cache
 *
 * 新文件按 NVIDIA 合入安全规则不需要 LM CUSTOMIZATION 标记。
 */

import React, { memo, useMemo } from 'react';
import { HStack, IconButton, Tooltip, Box } from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import { brandColors, fabColors, fabRadius, fabSpacing } from '../theme/fabTokens';
import useAssetTags from '../hooks/useAssetTags';
import { useTranslation } from '../i18n/LanguageContext';
import TagPill from './TagPill';
import TagEditPopover from './TagEditPopover';

/**
 * 一个不会触发卡片冒泡的小加号按钮
 */
const AddTagButton = memo(function AddTagButton({ ariaLabel, hasTags }) {
  return (
    <Tooltip label={ariaLabel} placement="top" openDelay={400} hasArrow>
      <IconButton
        aria-label={ariaLabel}
        icon={<AddIcon boxSize="9px" />}
        size="xs"
        variant="ghost"
        minW="22px"
        h="22px"
        borderRadius={fabRadius.round}
        borderWidth="1px"
        borderStyle="dashed"
        borderColor={hasTags ? fabColors.borderSubtle : fabColors.borderSubdued}
        color={fabColors.textSecondary}
        bg="transparent"
        _hover={{
          bg: fabColors.fillTertiaryHover,
          color: brandColors.primary,
          borderColor: brandColors.primary,
          borderStyle: 'solid',
        }}
        _focusVisible={{
          outline: 'none',
          boxShadow: `0 0 0 2px ${brandColors.primary}66`,
        }}
        // 阻断冒泡：卡片本体的 click / mousedown(拖拽框选) / dblclick 都不能触发
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      />
    </Tooltip>
  );
});

/**
 * +N 折叠 chip（点击打开 Popover 看完整列表）
 */
const MoreChip = memo(function MoreChip({ count, ariaLabel }) {
  return (
    <Box
      as="button"
      type="button"
      aria-label={ariaLabel}
      role="button"
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      h="22px"
      px={fabSpacing['2']}
      borderRadius={fabRadius.round}
      borderWidth="1px"
      borderStyle="solid"
      borderColor={fabColors.borderSubtle}
      bg="transparent"
      color={fabColors.textSecondary}
      fontSize="11px"
      fontWeight="600"
      lineHeight="20px"
      cursor="pointer"
      _hover={{
        color: brandColors.primary,
        borderColor: brandColors.primary,
      }}
      _focusVisible={{
        outline: 'none',
        boxShadow: `0 0 0 2px ${brandColors.primary}66`,
      }}
    >
      +{count}
    </Box>
  );
});

/**
 * @param {object} props
 * @param {object} props.asset - 资产对象（含 source.url / source.base_key / id / tags 等）
 * @param {string} props.serverUrl - Nucleus host
 * @param {Function} props.getHeaders - 鉴权头工厂
 * @param {string} props.apiUrl - API base URL
 * @param {number} [props.maxVisible=3] - 最多显示几个 tag，溢出折叠
 * @param {boolean} [props.compact=false] - 紧凑模式（用于 grid size=S）
 */
const CardTagBar = memo(function CardTagBar({
  asset,
  serverUrl,
  getHeaders,
  apiUrl,
  maxVisible = 3,
  compact = false,
}) {
  const { t } = useTranslation();
  const { tags, addTag, removeTag, hasWritePermission } = useAssetTags({
    asset,
    serverUrl,
    getHeaders,
    apiUrl,
  });

  const visible = useMemo(() => tags.slice(0, maxVisible), [tags, maxVisible]);
  const overflowCount = Math.max(0, tags.length - maxVisible);
  const isEmpty = tags.length === 0;
  const canEdit = hasWritePermission !== false;

  // 阻断卡片本体冒泡（关键：让点击/双击/mousedown 都被吃掉）
  const containerHandlers = {
    onClick: (e) => e.stopPropagation(),
    onMouseDown: (e) => e.stopPropagation(),
    onDoubleClick: (e) => e.stopPropagation(),
  };

  // ─── 共用：触发器（"+" 加号按钮，弹出 Popover）──────────────────
  const addTrigger = (
    <AddTagButton
      ariaLabel={t('tagBar.addButtonAriaLabel')}
      hasTags={!isEmpty}
    />
  );

  // ─── 共用：触发器（"+N" 折叠 chip，弹出 Popover）─────────────────
  const moreTrigger = (
    <MoreChip
      count={overflowCount}
      ariaLabel={t('tagBar.moreCount', { n: overflowCount })}
    />
  );

  if (compact) {
    // size=S 模式：只显示一个加号按钮 + tag 计数 chip（不展开）
    return (
      <HStack
        spacing={fabSpacing['1']}
        wrap="nowrap"
        h="22px"
        {...containerHandlers}
      >
        {!isEmpty && (
          <Box
            fontSize="10px"
            color={brandColors.primary}
            fontWeight="600"
            px={fabSpacing['1']}
          >
            {tags.length}
          </Box>
        )}
        {canEdit ? (
          <TagEditPopover
            trigger={addTrigger}
            selectedTags={tags}
            onAddTag={addTag}
            onRemoveTag={removeTag}
            serverUrl={serverUrl}
            getHeaders={getHeaders}
            disabled={!canEdit}
          />
        ) : null}
      </HStack>
    );
  }

  return (
    <HStack
      spacing={fabSpacing['1']}
      wrap="wrap"
      minH="24px"
      align="center"
      {...containerHandlers}
    >
      {visible.map((tagName) => (
        <TagPill
          key={tagName}
          label={tagName}
          active
          removable={canEdit}
          size="sm"
          onRemove={canEdit ? () => removeTag(tagName) : undefined}
          ariaLabel={t('tagBar.removeAriaLabel', { tag: tagName })}
        />
      ))}
      {overflowCount > 0 && canEdit && (
        <TagEditPopover
          trigger={moreTrigger}
          selectedTags={tags}
          onAddTag={addTag}
          onRemoveTag={removeTag}
          serverUrl={serverUrl}
          getHeaders={getHeaders}
          disabled={!canEdit}
        />
      )}
      {overflowCount > 0 && !canEdit && (
        <Box fontSize="10px" color={fabColors.textSecondary}>+{overflowCount}</Box>
      )}
      {canEdit && (
        <TagEditPopover
          trigger={addTrigger}
          selectedTags={tags}
          onAddTag={addTag}
          onRemoveTag={removeTag}
          serverUrl={serverUrl}
          getHeaders={getHeaders}
          disabled={!canEdit}
        />
      )}
    </HStack>
  );
});

export default CardTagBar;
