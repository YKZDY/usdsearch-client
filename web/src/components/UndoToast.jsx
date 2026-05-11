/**
 * UndoToast - 通用撤销 Toast 组件（V2 抽出）
 *
 * 特性：
 *   - Portal 固定顶部（避开底部 SelectionModeBar）
 *   - 底部进度条（scaleX 动画 + animation-play-state 控制）
 *   - E2+ hover 暂停倒计时（CSS 动画和 JS timer 同步暂停）
 *   - 可复用：支持自定义 message、actionLabel、durationMs
 *
 * Props:
 *   - isOpen: boolean
 *   - message: ReactNode | string
 *   - actionLabel: string                   - 默认"撤销"
 *   - onAction: () => void                  - 点击 action 按钮
 *   - onExpire: () => void                  - 倒计时结束时回调
 *   - durationMs: number                    - 默认 10000
 *   - variant: 'default' | 'neutral'        - 主题色
 *   - placement: 'top' | 'bottom'           - 默认 'top'
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Box, Text, Portal } from '@chakra-ui/react';
import { keyframes } from '@emotion/react';

const toastSlideInTop = keyframes`
  0% { opacity: 0; transform: translate(-50%, -20px) scale(0.92); }
  60% { opacity: 1; transform: translate(-50%, 4px) scale(1.01); }
  100% { opacity: 1; transform: translate(-50%, 0) scale(1); }
`;

const toastSlideInBottom = keyframes`
  0% { opacity: 0; transform: translate(-50%, 20px) scale(0.92); }
  60% { opacity: 1; transform: translate(-50%, -4px) scale(1.01); }
  100% { opacity: 1; transform: translate(-50%, 0) scale(1); }
`;

const progressShrink = keyframes`
  0% { transform: scaleX(1); }
  100% { transform: scaleX(0); }
`;

export default function UndoToast({
  isOpen,
  message,
  actionLabel = '撤销',
  onAction,
  onExpire,
  durationMs = 10000,
  variant = 'default', // 'default' gold | 'neutral' gray
  placement = 'top',
}) {
  const [paused, setPaused] = useState(false);
  const timerRef = useRef(null);
  const pausedAtRef = useRef(null);  // 暂停那一刻已经消耗的 ms
  const startedAtRef = useRef(null);
  const remainingRef = useRef(durationMs);

  const onExpireRef = useRef(onExpire);
  useEffect(() => { onExpireRef.current = onExpire; });

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 启动/重启/清理 timer：随 isOpen 变化
  useEffect(() => {
    if (!isOpen) {
      clearTimer();
      pausedAtRef.current = null;
      startedAtRef.current = null;
      remainingRef.current = durationMs;
      setPaused(false);
      return;
    }
    remainingRef.current = durationMs;
    startedAtRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onExpireRef.current?.();
    }, durationMs);
    return () => clearTimer();
  }, [isOpen, durationMs, clearTimer]);

  const handleMouseEnter = useCallback(() => {
    if (!isOpen || paused) return;
    // 计算剩余
    const elapsed = Date.now() - (startedAtRef.current || Date.now());
    remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    clearTimer();
    setPaused(true);
  }, [isOpen, paused, clearTimer]);

  const handleMouseLeave = useCallback(() => {
    if (!isOpen || !paused) return;
    startedAtRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onExpireRef.current?.();
    }, remainingRef.current);
    setPaused(false);
  }, [isOpen, paused]);

  if (!isOpen) return null;

  const isTop = placement === 'top';
  const slideIn = isTop ? toastSlideInTop : toastSlideInBottom;
  const accentColor = variant === 'neutral' ? '#A0AEC0' : '#FFD230';
  const accentGlow = variant === 'neutral' ? 'rgba(160,174,192,0.4)' : 'rgba(255,210,48,0.4)';
  const accentBorder = variant === 'neutral' ? 'rgba(160,174,192,0.15)' : 'rgba(255,210,48,0.15)';
  const accentShadow = variant === 'neutral' ? 'rgba(160,174,192,0.12)' : 'rgba(255,210,48,0.12)';

  return (
    <Portal>
      <Box
        position="fixed"
        left="50%"
        top={isTop ? '88px' : undefined}
        bottom={!isTop ? '72px' : undefined}
        transform="translateX(-50%)"
        zIndex={2600}
        animation={`${slideIn} 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <Box
          bg="rgba(20, 24, 29, 0.85)"
          backdropFilter="blur(24px) saturate(1.5)"
          color="whiteAlpha.900"
          pl={4}
          pr={2}
          py={2}
          borderRadius="full"
          border="1px solid"
          borderColor={accentBorder}
          boxShadow={`0 16px 40px -10px rgba(0, 0, 0, 0.8), 0 0 20px -5px ${accentShadow}`}
          display="flex"
          alignItems="center"
          gap={3}
          minW="max-content"
          maxW="520px"
          overflow="hidden"
          position="relative"
        >
          {/* 左侧发光圆点 */}
          <Box
            w="6px"
            h="6px"
            borderRadius="full"
            bg={accentColor}
            boxShadow={`0 0 10px ${accentColor}`}
            flexShrink={0}
          />

          {/* 文案区 */}
          <Box flex="1" minW={0} pr={2} display="flex" alignItems="center">
            {typeof message === 'string' ? (
              <Text fontSize="13px" fontWeight={400} color="whiteAlpha.800" letterSpacing="0.2px" noOfLines={1}>
                {message}
              </Text>
            ) : (
              message
            )}
          </Box>

          {/* 分隔线 + 操作按钮 */}
          {actionLabel && onAction && (
            <>
              <Box w="1px" h="14px" bg="whiteAlpha.200" flexShrink={0} />
              <Text
                as="button"
                fontSize="13px"
                fontWeight={600}
                color={accentColor}
                bg="transparent"
                borderRadius="full"
                px={4}
                py={1.5}
                flexShrink={0}
                cursor="pointer"
                transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                _hover={{ color: '#FFE680', bg: `${accentGlow}20`, transform: 'scale(1.02)' }}
                _active={{ transform: 'scale(0.98)' }}
                onClick={() => {
                  clearTimer();
                  onAction?.();
                }}
              >
                {actionLabel}
              </Text>
            </>
          )}

          {/* 底部进度条（E2+ hover 时 animation-play-state: paused） */}
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
              bg={`linear-gradient(90deg, ${accentGlow}33, ${accentColor})`}
              transformOrigin="left"
              style={{
                animation: `${progressShrink.name || 'progress-shrink'} ${durationMs}ms linear forwards`,
                animationPlayState: paused ? 'paused' : 'running',
              }}
              sx={{
                animation: `${progressShrink} ${durationMs}ms linear forwards`,
                animationPlayState: paused ? 'paused' : 'running',
              }}
            />
          </Box>
        </Box>
      </Box>
    </Portal>
  );
}
