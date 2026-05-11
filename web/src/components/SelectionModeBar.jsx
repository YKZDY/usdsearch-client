import React, { useSyncExternalStore, useCallback } from 'react';
import {
  HStack, Button, Text, Badge, IconButton, Tooltip, Box, VStack, Kbd,
  Popover, PopoverTrigger, PopoverContent, PopoverBody, PopoverArrow, PopoverHeader,
} from '@chakra-ui/react';
import { CloseIcon, CopyIcon, CheckIcon } from '@chakra-ui/icons';
import { FEATURE_FLAGS } from '../config.jsx';

/**
 * useMinWidth —— 同步求值的 matchMedia hook
 *
 * 替代 Chakra 的 useBreakpointValue：
 * - useBreakpointValue 首帧会返回 undefined/fallback，导致 showHints "慢半拍闪入"
 * - 本 hook 用 useSyncExternalStore + matchMedia，首次渲染就有正确值，无闪烁
 * - SSR 安全（typeof window 检查）
 *
 * @param {string} query - CSS 媒体查询串，例如 '(min-width: 62em)'
 * @returns {boolean} 当前是否匹配
 */
const useMediaQuery = (query) => {
  const subscribe = useCallback((onChange) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {};
    const mql = window.matchMedia(query);
    // Safari 旧版用 addListener / removeListener
    if (mql.addEventListener) {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [query]);
  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return true;
    return window.matchMedia(query).matches;
  }, [query]);
  // SSR fallback：默认 true（宽屏），避免首帧窄屏误判
  const getServerSnapshot = () => true;
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
};

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
  totalCount = 0,                  // 当前结果总数，用于判断是否已全选
  onCopySelectedUrls,
  onSelectAll,
  onDeselectAll,                   // 取消全选（仅清空，保持多选模式）；未传则回退到 onClearSelection
  onClearSelection,                // 退出多选（清空 + 退出）
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
  // 是否"已全选"：当前选中数量 >= 当前结果总数且非零，用于把"全选"按钮切成"取消全选"
  const isAllSelected = totalCount > 0 && selectedCount >= totalCount;
  // 交互提示：在窄屏（<lg ≈ 62em）或执行中隐藏，避免拥挤换行
  // 用 matchMedia 同步求值，首帧即正确，消除 hint 文案闪烁
  const isWide = useMediaQuery('(min-width: 62em)');
  const showHints = isWide && !inProgress;

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

          {/* 交互说明小字：告知用户单击/双击/Esc 三个快捷操作（宽屏+非执行中才显示） */}
          {showHints && (
            <HStack spacing={2} color="gray.400" fontSize="xs">
              <Text opacity={0.75}>·</Text>
              <Text>{t?.('hintClickToggle') || '单击切换选中'}</Text>
              <Text opacity={0.5}>·</Text>
              <Text>{t?.('hintDblClickDetails') || '双击查看详情'}</Text>
              <Text opacity={0.5}>·</Text>
              <HStack spacing={1}>
                <Kbd
                  fontSize="10px"
                  bg="rgba(255,255,255,0.08)"
                  color="gray.300"
                  borderColor="rgba(255,255,255,0.15)"
                  boxShadow="0 1px 0 rgba(255,255,255,0.08) inset, 0 1px 2px rgba(0,0,0,0.4)"
                  px={1.5}
                  py={0}
                  lineHeight="1.4"
                >
                  Esc
                </Kbd>
                <Text>{t?.('hintEscExit') || '退出'}</Text>
              </HStack>
            </HStack>
          )}


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
            <Tooltip label={isAllSelected
              ? (t?.('deselectAll') || '取消全选')
              : (t?.('selectAll') || '全选')}>
              <IconButton
                size="sm"
                variant="ghost"
                icon={isAllSelected ? <CloseIcon boxSize={2.5} /> : <CheckIcon />}
                onClick={isAllSelected ? (onDeselectAll || onClearSelection) : onSelectAll}
                aria-label={isAllSelected
                  ? (t?.('deselectAll') || '取消全选')
                  : (t?.('selectAll') || '全选')}
                aria-pressed={isAllSelected}
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
          {/* V2 批量打标签按钮（FEATURE_FLAGS.BATCH_TAGGING 控制显隐；演示就绪后再放开） */}
          {FEATURE_FLAGS.BATCH_TAGGING && onBatchTag && !inProgress && (
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
