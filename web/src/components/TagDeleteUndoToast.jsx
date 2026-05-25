/**
 * TagDeleteUndoToast - Tag 删除撤销 toast 自定义渲染组件（Group B / LA Customization）
 *
 * 视觉规则（fab.com 风格）：
 *   ┌────────────────────────────────────────────────┐
 *   │ 🏷️ 已删除标签 [ test ]      [ 撤销 ]    [ ✕ ]  │
 *   │ ⌘Z 撤销                                         │
 *   ├████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░───┤  ← 5s 倒计时进度条
 *   └────────────────────────────────────────────────┘
 *
 * 关键体验：
 *   - 删除的 tag 名用品牌金色 chip 视觉，让用户一眼看到删的是哪个
 *   - 撤销按钮用品牌金色，是 toast 主 CTA
 *   - 底部 5s 倒计时进度条直观显示剩余时间
 *   - hover toast → 暂停倒计时 + 进度条停在当前位置（防误关）
 *   - mouseleave → 恢复倒计时
 *   - 关闭按钮放右上角（次级操作，不抢撤销按钮的主 CTA）
 *   - ⌘Z / Ctrl+Z 提示语放在二行（次要信息，不打扰）
 *   - 所有视觉走 fabTokens 设计令牌，禁止硬编码颜色
 *
 * 依赖：仅 chakra + framer-motion（项目已有）+ fabTokens
 *
 * 新文件按 NVIDIA 合入安全规则不需要 LM CUSTOMIZATION 标记。
 */

import React, { memo, useEffect, useRef, useState } from 'react';
import { Box, Button, IconButton, HStack, VStack, Text } from '@chakra-ui/react';
import { CloseIcon } from '@chakra-ui/icons';
import { brandColors, fabColors, fabRadius, fabSpacing, fabShadow } from '../theme/fabTokens';

/**
 * 删除的 tag 名小 chip（品牌金色，与 TagPill active 视觉对齐）
 */
const InlineTagChip = memo(function InlineTagChip({ name }) {
  return (
    <Box
      as="span"
      display="inline-flex"
      alignItems="center"
      h="22px"
      px={fabSpacing['2']}
      bg={`${brandColors.primary}26`}  // 15% 金
      color={brandColors.primary}
      borderRadius={fabRadius.round}
      borderWidth="1px"
      borderStyle="solid"
      borderColor={`${brandColors.primary}66`}
      fontSize="12px"
      fontWeight="600"
      lineHeight="20px"
      maxW="160px"
      overflow="hidden"
      whiteSpace="nowrap"
      textOverflow="ellipsis"
      title={name}
    >
      {name}
    </Box>
  );
});

/**
 * 倒计时进度条（rAF 驱动，从 100% → 0%）
 *
 * @param {number} durationMs - 总时长
 * @param {boolean} paused - 是否暂停
 */
const CountdownBar = memo(function CountdownBar({ durationMs, paused }) {
  const [progress, setProgress] = useState(100);
  const startedAtRef = useRef(0);
  const pausedAtRef = useRef(0);
  const accPausedRef = useRef(0);
  const rafIdRef = useRef(0);

  useEffect(() => {
    startedAtRef.current = Date.now();
    accPausedRef.current = 0;
    setProgress(100);

    const tick = () => {
      const elapsed = Date.now() - startedAtRef.current - accPausedRef.current;
      const remaining = Math.max(0, durationMs - elapsed);
      const pct = (remaining / durationMs) * 100;
      setProgress(pct);
      if (remaining > 0) {
        rafIdRef.current = requestAnimationFrame(tick);
      }
    };
    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
    // 仅在挂载时启动，paused 状态变化由下面的 effect 单独处理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs]);

  // 处理 pause/resume：暂停时停 rAF，恢复时把暂停期累计到 accPausedRef
  useEffect(() => {
    if (paused) {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }
      pausedAtRef.current = Date.now();
    } else if (pausedAtRef.current > 0) {
      accPausedRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = 0;
      const tick = () => {
        const elapsed = Date.now() - startedAtRef.current - accPausedRef.current;
        const remaining = Math.max(0, durationMs - elapsed);
        const pct = (remaining / durationMs) * 100;
        setProgress(pct);
        if (remaining > 0 && !pausedAtRef.current) {
          rafIdRef.current = requestAnimationFrame(tick);
        }
      };
      rafIdRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }
    };
  }, [paused, durationMs]);

  return (
    <Box
      h="3px"
      w="100%"
      bg={fabColors.fillTertiary || 'rgba(255,255,255,0.08)'}
      borderRadius="0 0 12px 12px"
      overflow="hidden"
      mt={fabSpacing['2']}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress)}
    >
      <Box
        h="100%"
        w={`${progress}%`}
        bg={brandColors.primary}
        transition="none"  // rAF 自己平滑更新，不要 css transition 否则双重动画
        willChange="width"
      />
    </Box>
  );
});

/**
 * Tag 删除撤销 toast 主组件
 *
 * @param {object} props
 * @param {string} props.tagName - 被删除的 tag 名
 * @param {string} props.title - i18n: "已删除标签"
 * @param {string} props.undoLabel - i18n: "撤销"
 * @param {string} props.undoHint - i18n: "Ctrl+Z 撤销" / "⌘Z 撤销"
 * @param {string} props.closeAriaLabel - i18n: "关闭提示"
 * @param {number} props.durationMs - 总时长（与倒计时条对齐）
 * @param {() => void} props.onUndo - 点撤销
 * @param {() => void} props.onClose - 点 ✕ / 时间到
 * @param {() => void} props.onPause - hover 进入暂停倒计时
 * @param {() => void} props.onResume - hover 离开恢复倒计时
 */
const TagDeleteUndoToast = memo(function TagDeleteUndoToast({
  tagName,
  title,
  undoLabel,
  undoHint,
  closeAriaLabel,
  durationMs,
  onUndo,
  onClose,
  onPause,
  onResume,
}) {
  const [paused, setPaused] = useState(false);

  const handleMouseEnter = () => {
    setPaused(true);
    onPause?.();
  };
  const handleMouseLeave = () => {
    setPaused(false);
    onResume?.();
  };

  return (
    <Box
      role="status"
      aria-live="polite"
      aria-atomic="true"
      minW="320px"
      maxW="420px"
      bg={fabColors.surfaceElevated || 'rgba(28, 28, 32, 0.92)'}
      color={fabColors.textPrimary}
      borderRadius={fabRadius.lg || '12px'}
      borderWidth="1px"
      borderStyle="solid"
      borderColor={fabColors.borderSubtle || 'rgba(255,255,255,0.12)'}
      boxShadow={fabShadow.lg || '0 12px 40px rgba(0,0,0,0.45)'}
      backdropFilter="blur(20px)"
      sx={{
        WebkitBackdropFilter: 'blur(20px)',
      }}
      px={fabSpacing['4']}
      pt={fabSpacing['3']}
      pb="0"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <HStack spacing={fabSpacing['3']} align="center" w="100%">
        {/* 主信息：标题 + tag chip */}
        <VStack spacing={fabSpacing['1']} align="flex-start" flex={1} minW={0}>
          <HStack spacing={fabSpacing['2']} align="center" flexWrap="wrap">
            <Text fontSize="13px" fontWeight="500" color={fabColors.textPrimary}>
              {title}
            </Text>
            <InlineTagChip name={tagName} />
          </HStack>
          <Text
            fontSize="11px"
            color={fabColors.textSecondary || 'rgba(255,255,255,0.6)'}
            lineHeight="1.4"
          >
            {undoHint}
          </Text>
        </VStack>

        {/* CTA：撤销按钮（金色） */}
        <Button
          size="sm"
          h="32px"
          px={fabSpacing['3']}
          bg={brandColors.primary}
          color="#000"
          fontWeight="700"
          fontSize="13px"
          borderRadius={fabRadius.md || '6px'}
          _hover={{ bg: brandColors.primaryHover || brandColors.primary, opacity: 0.9 }}
          _active={{ bg: brandColors.primary, opacity: 0.8 }}
          _focusVisible={{ outline: 'none', boxShadow: `0 0 0 2px ${brandColors.primary}66` }}
          onClick={(e) => {
            e.stopPropagation();
            onUndo?.();
          }}
        >
          {undoLabel}
        </Button>

        {/* 关闭按钮（次级，灰色） */}
        <IconButton
          aria-label={closeAriaLabel}
          icon={<CloseIcon boxSize="9px" />}
          size="sm"
          variant="ghost"
          minW="28px"
          h="28px"
          color={fabColors.textSecondary || 'rgba(255,255,255,0.6)'}
          _hover={{ bg: fabColors.fillTertiaryHover || 'rgba(255,255,255,0.08)', color: fabColors.textPrimary }}
          _focusVisible={{ outline: 'none', boxShadow: `0 0 0 2px ${brandColors.primary}66` }}
          onClick={(e) => {
            e.stopPropagation();
            onClose?.();
          }}
        />
      </HStack>

      {/* 底部倒计时条 */}
      <CountdownBar durationMs={durationMs} paused={paused} />
    </Box>
  );
});

export default TagDeleteUndoToast;
