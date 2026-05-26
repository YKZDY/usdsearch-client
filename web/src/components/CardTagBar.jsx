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
// === LM CUSTOMIZATION: CardTagBarBubble START ===
// 引入 FEATURE_FLAGS 用于控制容器层是否吞没冒泡（详见下方 containerHandlers）
import { FEATURE_FLAGS } from '../config';
// === LM CUSTOMIZATION: CardTagBarBubble END ===

/**
 * 一个不会触发卡片冒泡的小加号按钮
 *
 * 关键：必须用 forwardRef + 透传 ...rest，让 <TagEditPopover> 通过
 * React.cloneElement(trigger, { onClick, onMouseDown, 'aria-*' }) 注入的
 * props 真正落到内部 IconButton DOM 上，否则 Popover 永远打不开。
 */
const AddTagButton = memo(React.forwardRef(function AddTagButton(
  { ariaLabel, hasTags, onClick: extOnClick, onMouseDown: extOnMouseDown, onMouseUp: extOnMouseUp, onDoubleClick: extOnDoubleClick, ...rest },
  ref,
) {
  // 合并外部与内部的事件处理器：先跑外部（含 cloneElement 注入的逻辑，如 Popover toggle），
  // 再跑内部的 stopPropagation 以阻断卡片本体冒泡。
  const handleMouseDown = (e) => {
    extOnMouseDown?.(e);
    e.stopPropagation();
  };
  const handleDoubleClick = (e) => {
    extOnDoubleClick?.(e);
    e.stopPropagation();
  };
  // === LM CUSTOMIZATION: CardTagBarBubble START ===
  // 容器层放开后，加号按钮自身必须阻断 onClick / onMouseUp 冒泡：
  //   - onClick 不阻断 → 会同时触发 Popover 弹出 + Card 根 onClick → 误开 Drawer
  //   - onMouseUp 不阻断 → useDrawerCardHandlers.handleMouseUp 会模拟 click → 仍误开 Drawer
  const handleClick = (e) => {
    extOnClick?.(e);
    e.stopPropagation();
  };
  const handleMouseUp = (e) => {
    extOnMouseUp?.(e);
    e.stopPropagation();
  };
  // === LM CUSTOMIZATION: CardTagBarBubble END ===
  return (
    <Tooltip label={ariaLabel} placement="top" openDelay={400} hasArrow>
      <IconButton
        ref={ref}
        aria-label={ariaLabel}
        icon={<AddIcon boxSize="10px" />}
        size="xs"
        variant="ghost"
        minW="24px"
        h="24px"
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
      // 透传 cloneElement 注入的 aria-expanded / aria-haspopup 等
      {...rest}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
    />
    </Tooltip>
  );
}));

/**
 * +N 折叠 chip（点击打开 Popover 看完整列表）
 *
 * 同样用 forwardRef + 透传 ...rest，让 <TagEditPopover> 注入的 onClick 生效。
 */
const MoreChip = memo(React.forwardRef(function MoreChip(
  { count, ariaLabel, onClick: extOnClick, onMouseDown: extOnMouseDown, onMouseUp: extOnMouseUp, onDoubleClick: extOnDoubleClick, ...rest },
  ref,
) {
  const handleMouseDown = (e) => {
    extOnMouseDown?.(e);
    e.stopPropagation();
  };
  const handleDoubleClick = (e) => {
    extOnDoubleClick?.(e);
    e.stopPropagation();
  };
  // === LM CUSTOMIZATION: CardTagBarBubble START ===
  // 同 AddTagButton：容器层放开后，+N 折叠 chip 必须同时阻断 onClick 和 onMouseUp 冒泡。
  const handleClick = (e) => {
    extOnClick?.(e);
    e.stopPropagation();
  };
  const handleMouseUp = (e) => {
    extOnMouseUp?.(e);
    e.stopPropagation();
  };
  // === LM CUSTOMIZATION: CardTagBarBubble END ===
  return (
    <Box
      ref={ref}
      as="button"
      type="button"
      aria-label={ariaLabel}
      role="button"
      h="24px"
      px={fabSpacing['2']}
      borderRadius={fabRadius.round}
      borderWidth="1px"
      borderStyle="solid"
      borderColor={fabColors.borderSubtle}
      bg="transparent"
      color={fabColors.textSecondary}
      fontSize="12px"
      fontWeight="600"
      lineHeight="22px"
      cursor="pointer"
      _hover={{
        color: brandColors.primary,
        borderColor: brandColors.primary,
      }}
      _focusVisible={{
        outline: 'none',
        boxShadow: `0 0 0 2px ${brandColors.primary}66`,
      }}
      // 透传 cloneElement 注入的 aria-expanded / aria-haspopup 等
      {...rest}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
    >
      +{count}
    </Box>
  );
}));

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

  // === LM CUSTOMIZATION: CardTagBarBubble START ===
  // 容器层级事件策略：
  //   - CARD_TAGBAR_BUBBLE = true（默认）：容器层透传，让标签 chip 之间的间隙、
  //     加号按钮 padding、空标签占位区的点击都能冒泡到 <Card> 根，触发 Drawer/多选。
  //     真正的交互元素（chip / 加号按钮 / +N 折叠 chip）在元素自身已阻断冒泡，
  //     所以点 chip 本身仍只弹 Popover，不会误开 Drawer。
  //   - CARD_TAGBAR_BUBBLE = false：退回旧行为，容器层全阻断（用于线上紧急回滚）。
  // 历史问题：此前容器层无条件 stopPropagation 把 onClick / onMouseDown / onDoubleClick
  //           全部吞掉，导致用户在卡片下半部 1/3（标签栏覆盖区）单击"偶发失灵"。
  // 合入英伟达新版时：CardTagBar 是 LM 新增组件，整段保留。
  const containerHandlers = FEATURE_FLAGS.CARD_TAGBAR_BUBBLE
    ? {} // 透传：让事件冒泡到 Card 根，由 useDrawerCardHandlers / useDragSelect 接管
    : {
        onClick: (e) => e.stopPropagation(),
        onMouseDown: (e) => e.stopPropagation(),
        onDoubleClick: (e) => e.stopPropagation(),
      };
  // === LM CUSTOMIZATION: CardTagBarBubble END ===

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
        h="24px"
        {...containerHandlers}
      >
        {!isEmpty && (
          <Box
            fontSize="11px"
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
    /* 高度锁定（2026-05-25）：原 wrap="wrap" + minH="26px" 导致多 tag 时换行成两行（52px），
       让卡片自然高从 317 涨到 343，超出虚拟化分支 itemHeight=335 → 卡片底部按钮被挤出可视区。
       改为 nowrap + 固定 h=26px + overflow=hidden：
         - tag 在一行内显示，塞不下的部分由 +N chip 表示（CardTagBar 已支持 overflowCount）
         - 卡片高度永远恒定，与 react-window 固定 itemHeight 完美对齐
         - 信息没丢：用户点 +N 弹 Popover 看完整 tag 列表 */
    <HStack
      spacing={fabSpacing['1']}
      wrap="nowrap"
      h="26px"
      overflow="hidden"
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
        <Box fontSize="11px" color={fabColors.textSecondary}>+{overflowCount}</Box>
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
