/**
 * TagPill - Group B 共享 tag 视觉基础组件
 *
 * 使用场景：
 *   - <CardTagBar>（卡片底部 tag 条）
 *   - <AssetTagEditor>（详情抽屉完整 tag 编辑器）
 *   - <TagEditPopover>（卡片快速打 tag 弹层中的候选 chip）
 *
 * 视觉规则：
 *   - active=true：品牌金色 #FFD230 实心填充 + 黑色文字（已打 tag 高亮态）
 *   - active=false：浅灰描边 + 灰色文字（未打 / 候选未选中态）
 *   - status='failed'：红色描边 + 红色文字（同步失败态）
 *   - status='pending'：金色 50% 透明 + 黑色文字（同步中）
 *
 * 视觉令牌严格走 theme/fabTokens.js，零硬编码颜色。
 *
 * 新文件按 NVIDIA 合入安全规则不需要 LM CUSTOMIZATION 标记。
 */

import React, { memo } from 'react';
import { Tag, TagLabel, TagCloseButton, Tooltip, Box } from '@chakra-ui/react';
import { brandColors, fabColors, fabRadius, fabSpacing } from '../theme/fabTokens';

const SIZE_PRESETS = {
  sm: {
    height: '22px',
    px: fabSpacing['2'],   // 8px
    fontSize: '11px',
    closeBtnSize: '14px',
  },
  md: {
    height: '26px',
    px: fabSpacing['2.5'], // 10px
    fontSize: '12px',
    closeBtnSize: '16px',
  },
};

/**
 * @param {object} props
 * @param {string} props.label - 显示文本
 * @param {boolean} [props.active=true] - 是否高亮态（已打 tag）
 * @param {boolean} [props.removable=false] - 是否显示 × 按钮（hover 才显示）
 * @param {Function} [props.onRemove] - 点击 × 时触发
 * @param {Function} [props.onClick] - 点击 chip 本体时触发（用于 toggle）
 * @param {'sm'|'md'} [props.size='sm']
 * @param {'normal'|'pending'|'failed'} [props.status='normal']
 * @param {string} [props.maxW='160px'] - 最大宽度（超长截断）
 * @param {string} [props.ariaLabel] - 可选 aria-label 覆盖
 */
const TagPill = memo(function TagPill({
  label,
  active = true,
  removable = false,
  onRemove,
  onClick,
  size = 'sm',
  status = 'normal',
  maxW = '160px',
  ariaLabel,
}) {
  const preset = SIZE_PRESETS[size] || SIZE_PRESETS.sm;

  // ─── 颜色策略 ─────────────────────────────────────────────
  let bg, color, borderColor, borderWidth, opacity = 1;
  if (status === 'failed') {
    bg = 'transparent';
    color = fabColors.critical;
    borderColor = fabColors.critical;
    borderWidth = '1px';
  } else if (status === 'pending') {
    bg = brandColors.primary;
    color = brandColors.onPrimary;
    borderColor = 'transparent';
    borderWidth = '1px';
    opacity = 0.5;
  } else if (active) {
    // 已打 tag 高亮态
    bg = brandColors.primary;
    color = brandColors.onPrimary;
    borderColor = 'transparent';
    borderWidth = '1px';
  } else {
    // 候选未选中态
    bg = 'transparent';
    color = fabColors.textSecondary;
    borderColor = fabColors.borderSubtle;
    borderWidth = '1px';
  }

  // 阻止冒泡，避免触发卡片本体单击/双击
  const handleClick = (e) => {
    e.stopPropagation();
    onClick?.(e);
  };
  const handleRemove = (e) => {
    e.stopPropagation();
    onRemove?.(e);
  };
  const handleMouseDown = (e) => {
    // 关键：拖拽框选会从 mousedown 开始记录，必须阻断（否则点 tag 也会启动框选）
    e.stopPropagation();
  };

  const isClickable = typeof onClick === 'function';

  const tagBody = (
    <Tag
      as={isClickable ? 'button' : 'span'}
      type={isClickable ? 'button' : undefined}
      role={isClickable ? 'button' : undefined}
      aria-label={ariaLabel || label}
      aria-pressed={isClickable ? active : undefined}
      onClick={isClickable ? handleClick : undefined}
      onMouseDown={handleMouseDown}
      bg={bg}
      color={color}
      borderColor={borderColor}
      borderWidth={borderWidth}
      borderStyle="solid"
      borderRadius={fabRadius.round}     // 胶囊
      h={preset.height}
      minH={preset.height}
      px={preset.px}
      fontSize={preset.fontSize}
      fontWeight="600"
      lineHeight="1"
      opacity={opacity}
      cursor={isClickable ? 'pointer' : 'default'}
      transition="background 0.12s ease, opacity 0.12s ease, border-color 0.12s ease"
      _hover={isClickable ? {
        bg: active ? brandColors.primary : fabColors.fillTertiaryHover,
        opacity: active ? 0.85 : 1,
      } : undefined}
      _focusVisible={{
        outline: 'none',
        boxShadow: `0 0 0 2px ${brandColors.primary}66`,
      }}
      _active={isClickable ? { transform: 'translateY(0)' } : undefined}
      maxW={maxW}
      display="inline-flex"
      alignItems="center"
      gap={fabSpacing['1']}
    >
      <TagLabel
        noOfLines={1}
        overflow="hidden"
        textOverflow="ellipsis"
        whiteSpace="nowrap"
        title={label}
      >
        {label}
      </TagLabel>
      {removable && (
        <TagCloseButton
          aria-label={`Remove ${label}`}
          onClick={handleRemove}
          onMouseDown={handleMouseDown}
          color={color}
          opacity={0.7}
          _hover={{ opacity: 1, bg: 'transparent' }}
          fontSize={preset.closeBtnSize}
          ml={1}
        />
      )}
    </Tag>
  );

  // 文本超长时套 Tooltip 显示完整 label
  if (typeof label === 'string' && label.length > 18) {
    return (
      <Tooltip label={label} placement="top" hasArrow openDelay={300}>
        <Box display="inline-flex">{tagBody}</Box>
      </Tooltip>
    );
  }

  return tagBody;
});

export default TagPill;
