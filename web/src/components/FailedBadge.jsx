/**
 * FailedBadge - 批量打标签失败的卡片右上角角标（V2 U1）
 *
 * 失败项持久化到卡片右上角，即使退出多选模式也能看到。
 * 点击触发单项重试。
 */

import React from 'react';
import { Box, Text, Tooltip } from '@chakra-ui/react';

const REASON_LABEL = {
  timeout: '超时',
  permission: '权限不足',
  network: '网络错误',
  conflict: '并发冲突',
  invalid: '参数错误',
  unknown: '未知错误',
};

export default function FailedBadge({ reason, onRetry, tooltipLabel }) {
  const reasonText = REASON_LABEL[reason] || reason || '未知错误';
  const tip = tooltipLabel || `失败：${reasonText}，点击重试`;

  return (
    <Tooltip label={tip} placement="top" hasArrow openDelay={200}>
      <Box
        as="button"
        type="button"
        position="absolute"
        top="6px"
        right="6px"
        zIndex={4}
        w="18px"
        h="18px"
        borderRadius="full"
        bg="#E53E3E"
        color="white"
        display="flex"
        alignItems="center"
        justifyContent="center"
        cursor="pointer"
        border="1px solid rgba(255,255,255,0.3)"
        boxShadow="0 2px 8px rgba(229, 62, 62, 0.5)"
        transition="transform 0.15s ease"
        _hover={{ transform: 'scale(1.1)', bg: '#F56565' }}
        _active={{ transform: 'scale(0.95)' }}
        onClick={(e) => {
          e.stopPropagation();
          onRetry?.();
        }}
        aria-label="Retry failed batch tag"
      >
        <Text fontSize="11px" fontWeight={700} lineHeight={1}>!</Text>
      </Box>
    </Tooltip>
  );
}
