import React from 'react';
import {
  HStack, Button, Text, Badge, IconButton, Tooltip, Box, VStack,
  Popover, PopoverTrigger, PopoverContent, PopoverBody, PopoverArrow, PopoverHeader,
} from '@chakra-ui/react';
import { CloseIcon, CopyIcon, CheckIcon } from '@chakra-ui/icons';

/**
 * 多选模式状态栏
 *
 * V2 扩展：
 * - 新增『批量打标签』按钮（canBatch=false 时 disabled + Tooltip 提示 U4）
 * - 执行中：底部 2px 金色进度条 + 文字 `current/total` + 当前 item Tooltip（E1+）
 * - 失败数：Popover 展开列失败清单 + 重试按钮
 * - 文案统一为『已选中 N 个资产』
 */
const SelectionModeBar = React.memo(({
  selectedCount,
  onCopySelectedUrls,
  onSelectAll,
  onClearSelection,
  t,
  // V2 新增
  onBatchTag,
  canBatch = true,                // false 时 disabled
  batchLimitTip,                  // canBatch=false 时 Tooltip 文案
  batchProgress = null,           // { current, total, failedCount, currentItemName } 或 null
  batchFailedItems = [],          // [{ assetUrl, displayName, reason }]
  onBatchRetry,                   // (item|null) => void；null=全部重试
}) => {
  const inProgress = !!batchProgress && batchProgress.total > 0;
  const current = batchProgress?.current ?? 0;
  const total = batchProgress?.total ?? 0;
  const failedCount = batchProgress?.failedCount ?? 0;
  const progressPct = total > 0 ? Math.min(100, (current / total) * 100) : 0;

  return (
    <Box position="relative" w="100%">
      <HStack
        w="100%"
        bg="rgba(255, 210, 48, 0.06)"
        border="1px solid rgba(255, 210, 48, 0.25)"
        borderRadius="lg"
        px={5}
        py="12px"
        minH="56px"
        justify="space-between"
        align="center"
      >
        <HStack spacing={4}>
          <Badge
            bg="#FFD230"
            color="black"
            fontSize="sm"
            fontWeight="bold"
            px={2.5}
            py={0.5}
            borderRadius="md"
            minW="24px"
            textAlign="center"
          >
            {selectedCount}
          </Badge>
          <Text fontSize="sm" color="gray.200" fontWeight="medium">
            {(t?.('itemsSelected', { count: selectedCount })) || `已选中 ${selectedCount} 个资产`}
          </Text>

          {/* 执行中：进度文字 + 当前 item Tooltip（E1+） */}
          {inProgress && (
            <Tooltip
              label={batchProgress.currentItemName
                ? ((t?.('batchTagCurrentItem', { name: batchProgress.currentItemName })) || `正在处理 ${batchProgress.currentItemName}`)
                : ((t?.('batchTagInProgress')) || '打标签进行中')}
              placement="top"
              hasArrow
            >
              <Text fontSize="sm" color="#FFD230" fontWeight={600}>
                {current}/{total}
              </Text>
            </Tooltip>
          )}

          {/* 失败数 Popover */}
          {inProgress && failedCount > 0 && (
            <Popover placement="bottom-start">
              <PopoverTrigger>
                <Button
                  size="xs"
                  variant="ghost"
                  colorScheme="red"
                  _hover={{ bg: 'rgba(229, 62, 62, 0.15)' }}
                >
                  {(t?.('batchTagFailedCount', { count: failedCount })) || `${failedCount} 个失败`}
                </Button>
              </PopoverTrigger>
              <PopoverContent bg="#1C1D20" borderColor="rgba(255,210,48,0.2)" maxW="360px">
                <PopoverArrow bg="#1C1D20" />
                <PopoverHeader borderColor="rgba(255,255,255,0.08)" fontSize="sm">
                  {(t?.('batchTagFailedDetails')) || '失败详情'}
                </PopoverHeader>
                <PopoverBody maxH="280px" overflowY="auto">
                  <VStack align="stretch" spacing={1}>
                    {batchFailedItems.map((item, idx) => (
                      <HStack
                        key={item.assetUrl || idx}
                        justify="space-between"
                        p={2}
                        borderRadius="md"
                        _hover={{ bg: 'rgba(255,255,255,0.04)' }}
                      >
                        <VStack align="start" spacing={0} minW={0} flex={1}>
                          <Text fontSize="xs" color="whiteAlpha.900" isTruncated maxW="220px">
                            {item.displayName || item.assetUrl || '(unknown)'}
                          </Text>
                          <Text fontSize="10px" color="red.300">
                            {(t?.(`failReason${capitalize(item.reason)}`)) || item.reason}
                          </Text>
                        </VStack>
                        {onBatchRetry && (
                          <Button
                            size="xs"
                            variant="link"
                            colorScheme="yellow"
                            onClick={() => onBatchRetry(item)}
                          >
                            {(t?.('batchTagRetry')) || '重试'}
                          </Button>
                        )}
                      </HStack>
                    ))}
                  </VStack>
                  {onBatchRetry && batchFailedItems.length > 1 && (
                    <Button
                      size="xs"
                      mt={2}
                      w="100%"
                      variant="outline"
                      colorScheme="yellow"
                      onClick={() => onBatchRetry(null)}
                    >
                      {(t?.('batchTagRetryAll')) || '重试全部'}
                    </Button>
                  )}
                </PopoverBody>
              </PopoverContent>
            </Popover>
          )}
        </HStack>

        <HStack spacing={3}>
          {onSelectAll && !inProgress && (
            <Tooltip label={t?.('selectAll') || '全选'}>
              <IconButton
                size="sm"
                variant="ghost"
                icon={<CheckIcon />}
                onClick={onSelectAll}
                aria-label={t?.('selectAll') || '全选'}
                colorScheme="yellow"
              />
            </Tooltip>
          )}
          {onCopySelectedUrls && !inProgress && (
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<CopyIcon />}
              onClick={onCopySelectedUrls}
              colorScheme="yellow"
            >
              {t?.('copySelectedUrls') || '复制选中的 URL'}
            </Button>
          )}
          {/* V2 批量打标签按钮 */}
          {onBatchTag && !inProgress && (
            <Tooltip
              label={!canBatch ? (batchLimitTip || (t?.('batchTagLimitTip') || '请先缩小范围至 100 个以内')) : ''}
              isDisabled={canBatch}
              placement="top"
              hasArrow
            >
              <Box>
                <Button
                  size="sm"
                  variant="outline"
                  colorScheme="yellow"
                  borderColor="#FFD230"
                  color="#FFD230"
                  _hover={{ bg: 'rgba(255, 210, 48, 0.12)' }}
                  onClick={onBatchTag}
                  isDisabled={!canBatch}
                >
                  {t?.('batchTag') || '批量打标签'}
                </Button>
              </Box>
            </Tooltip>
          )}
          {onClearSelection && !inProgress && (
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<CloseIcon boxSize={3} />}
              onClick={onClearSelection}
              color="gray.400"
              _hover={{ color: "white", bg: "rgba(255, 255, 255, 0.1)" }}
            >
              {t?.('exitMultiSelect') || '退出多选'}
            </Button>
          )}
        </HStack>
      </HStack>

      {/* 进度条：执行中时底部 2px 金色 */}
      {inProgress && (
        <Box
          position="absolute"
          bottom="0"
          left="0"
          right="0"
          h="2px"
          bg="rgba(255, 210, 48, 0.12)"
          overflow="hidden"
          borderBottomLeftRadius="lg"
          borderBottomRightRadius="lg"
        >
          <Box
            h="100%"
            w={`${progressPct}%`}
            bg="linear-gradient(90deg, rgba(255, 210, 48, 0.4), #FFD230)"
            transition="width 0.2s ease"
          />
        </Box>
      )}
    </Box>
  );
});

function capitalize(s) {
  if (typeof s !== 'string' || s.length === 0) return '';
  return s[0].toUpperCase() + s.slice(1);
}

SelectionModeBar.displayName = 'SelectionModeBar';

export default SelectionModeBar;
