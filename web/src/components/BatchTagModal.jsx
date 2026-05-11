/**
 * BatchTagModal - 批量打/取 tag 弹框（V2）
 *
 * 双栏：左侧缩略图网格 / 右侧 tag 输入 + 候选 chips + 冲突摘要
 * 特性：
 *   - 默认预填当前 searchQuery（Q3-C）
 *   - 候选 chips：聚合被选资产已有 tags，按频次降序（U3 懒计算+骨架）
 *   - 『仅选未打此标签的』开关（Q4-A）
 *   - 冲突摘要（E4）可点击展开高亮对应缩略图（E4+）
 *   - 被选 > 50 显示『大批量操作』提示（U4）
 *   - 被选 > 100 确认按钮禁用
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton,
  HStack, VStack, Box, Text, Input, Switch, Button, Wrap, WrapItem, Tag, TagLabel,
  Grid, GridItem, Spinner, Tooltip, Badge, IconButton,
} from '@chakra-ui/react';
import { CloseIcon, CheckIcon } from '@chakra-ui/icons';
import NavigableAssetImage from './NavigableAssetImage';
import {
  getTags as apiGetTags,
  getTaggingToken,
  extractHost,
  extractTokenFromHeaders,
  normalizeAssetPath,
} from '../services/taggingService';

const MAX_VISIBLE_THUMBS = 12;
const LARGE_BATCH_THRESHOLD = 50;
const HARD_LIMIT = 100;
const AGGREGATE_SAMPLE_LIMIT = 50;

function getAssetKey(r) {
  return r?.id || r?.source?.base_key || r?.source?.url || '';
}
function getAssetDisplayName(r) {
  const k = r?.source?.base_key || r?.source?.url || r?.id || '';
  return k.split('/').pop() || k;
}
function getAssetUrl(r) {
  return r?.source?.url || r?.source?.base_key || r?.id || '';
}
function getServerUrl(r) {
  // 从 assetUrl 提取 host
  const u = getAssetUrl(r);
  if (!u) return '';
  if (u.startsWith('omniverse://')) {
    const rest = u.slice('omniverse://'.length);
    return rest.split('/')[0] || '';
  }
  return '';
}
function getAssetPath(r) {
  const u = getAssetUrl(r);
  return normalizeAssetPath(u);
}
function getResultTags(r) {
  // 优先从 result.source.tags 读已缓存的 tag（避免网络请求 U3）
  const raw = r?.source?.tags;
  if (!Array.isArray(raw)) return null;
  return raw
    .map(t => (typeof t === 'string' ? t : (t?.name || t?.tag || '')))
    .filter(Boolean);
}

export default function BatchTagModal({
  isOpen,
  onClose,
  selectedAssets = [],    // array of search result objects
  defaultTag = '',
  onConfirm,              // ({ tagName, items }) => void  （items 是最终会写入的 item 数组）
  onDeselect,             // (assetKey) => void
  getHeaders,
  t,
}) {
  const [tagName, setTagName] = useState(defaultTag || '');
  const [onlyUntagged, setOnlyUntagged] = useState(true);
  const [conflictExpanded, setConflictExpanded] = useState(false);
  const [thumbsExpanded, setThumbsExpanded] = useState(false);

  // resolvedTagsMap: assetKey -> tags array（用于候选聚合和冲突判定）
  const [resolvedTagsMap, setResolvedTagsMap] = useState(() => new Map());
  const [isAggregating, setIsAggregating] = useState(false);

  // 打开时重置
  useEffect(() => {
    if (isOpen) {
      setTagName(defaultTag || '');
      setOnlyUntagged(true);
      setConflictExpanded(false);
      setThumbsExpanded(false);
    }
  }, [isOpen, defaultTag]);

  // U3: 打开时异步补齐缺失的 tags（最多 AGGREGATE_SAMPLE_LIMIT 个）
  const aggregationGuardRef = useRef(0);
  useEffect(() => {
    if (!isOpen) return;
    aggregationGuardRef.current += 1;
    const runId = aggregationGuardRef.current;

    // 先把缓存里已有 tags 的资产加入 map
    const initialMap = new Map();
    selectedAssets.forEach(r => {
      const k = getAssetKey(r);
      const cached = getResultTags(r);
      if (cached) initialMap.set(k, cached);
    });
    setResolvedTagsMap(initialMap);

    // 需要补的
    const toFetch = selectedAssets
      .filter(r => !initialMap.has(getAssetKey(r)))
      .slice(0, AGGREGATE_SAMPLE_LIMIT);
    if (toFetch.length === 0) {
      setIsAggregating(false);
      return;
    }
    setIsAggregating(true);

    // 并发 5 拉取
    let idx = 0;
    let inflight = 0;
    const CONCURRENCY = 5;
    const next = new Map(initialMap);
    const tick = async () => {
      while (inflight < CONCURRENCY && idx < toFetch.length) {
        const r = toFetch[idx++];
        inflight += 1;
        (async () => {
          try {
            const host = extractHost(getServerUrl(r) || getAssetUrl(r));
            const path = getAssetPath(r);
            if (!host || !path) return;
            let token = await getTaggingToken(host, getHeaders).catch(() => null);
            if (!token) token = extractTokenFromHeaders(getHeaders);
            if (!token) return;
            const resp = await apiGetTags(host, token, path);
            const names = (resp.tags || []).map(t => t.name).filter(Boolean);
            if (runId !== aggregationGuardRef.current) return; // stale
            next.set(getAssetKey(r), names);
            setResolvedTagsMap(new Map(next));
          } catch (_) {
            if (runId !== aggregationGuardRef.current) return;
            next.set(getAssetKey(r), []); // 失败也标记避免重拉
            setResolvedTagsMap(new Map(next));
          } finally {
            inflight -= 1;
            if (idx < toFetch.length) tick();
            else if (inflight === 0 && runId === aggregationGuardRef.current) setIsAggregating(false);
          }
        })();
      }
    };
    tick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedAssets.length]);

  // 候选 chips：按频次降序
  const candidateChips = useMemo(() => {
    const freq = new Map();
    resolvedTagsMap.forEach(list => {
      list.forEach(name => {
        freq.set(name, (freq.get(name) || 0) + 1);
      });
    });
    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
  }, [resolvedTagsMap]);

  // 冲突集合：已有该 tag 的资产（显示 ✓ + 跳过计数）
  const trimmedTag = (tagName || '').trim();
  const conflictKeys = useMemo(() => {
    if (!trimmedTag) return new Set();
    const s = new Set();
    resolvedTagsMap.forEach((list, key) => {
      if (list.includes(trimmedTag)) s.add(key);
    });
    return s;
  }, [resolvedTagsMap, trimmedTag]);

  // 『仅选未打』开关：决定最终会写入的 items
  const effectiveItems = useMemo(() => {
    if (!onlyUntagged) return selectedAssets;
    return selectedAssets.filter(r => !conflictKeys.has(getAssetKey(r)));
  }, [selectedAssets, onlyUntagged, conflictKeys]);

  const totalCount = selectedAssets.length;
  const effectiveCount = effectiveItems.length;
  const conflictCount = totalCount - effectiveCount > 0
    ? totalCount - effectiveCount
    : (onlyUntagged ? 0 : conflictKeys.size);
  // 当 switch 打开时，effectiveCount 已排除冲突；关闭时，conflictCount 显示多少会被跳过
  const willSkipCount = onlyUntagged ? 0 : conflictKeys.size;

  const isLargeBatch = totalCount > LARGE_BATCH_THRESHOLD;
  const isOverLimit = effectiveCount > HARD_LIMIT;

  const visibleThumbs = thumbsExpanded
    ? selectedAssets
    : selectedAssets.slice(0, MAX_VISIBLE_THUMBS);
  const moreCount = Math.max(0, selectedAssets.length - MAX_VISIBLE_THUMBS);

  const handleConfirm = () => {
    if (!trimmedTag || isOverLimit || effectiveCount === 0) return;
    onConfirm?.({ tagName: trimmedTag, items: effectiveItems });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl" isCentered scrollBehavior="inside">
      <ModalOverlay bg="blackAlpha.700" backdropFilter="blur(2px)" />
      <ModalContent bg="#1C1D20" border="1px solid rgba(255,255,255,0.08)" color="whiteAlpha.900">
        <ModalHeader fontSize="md" borderBottom="1px solid rgba(255,255,255,0.06)">
          {(t?.('batchTagDialogTitle', { count: totalCount })) || `给 ${totalCount} 个资产添加标签`}
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody py={4}>
          {/* 大批量提示（U4） */}
          {isLargeBatch && (
            <Box
              mb={3}
              px={3}
              py={2}
              bg="rgba(255, 210, 48, 0.08)"
              border="1px solid rgba(255, 210, 48, 0.25)"
              borderRadius="md"
            >
              <Text fontSize="xs" color="#FFD230">
                {(t?.('batchTagBigOpWarning', { count: totalCount, seconds: Math.ceil(totalCount / 5) }))
                  || `大批量操作：${totalCount} 个资产，预计 ${Math.ceil(totalCount / 5)}s`}
              </Text>
            </Box>
          )}

          <Grid templateColumns={{ base: '1fr', md: '1.4fr 1fr' }} gap={5}>
            {/* 左侧：缩略图网格 */}
            <GridItem>
              <Text fontSize="xs" color="gray.400" mb={2}>
                {(t?.('batchTagAssetsPreview')) || '被选资产'}
                {selectedAssets.length > AGGREGATE_SAMPLE_LIMIT && (
                  <Text as="span" ml={1} color="yellow.400">
                    ({(t?.('batchTagAggregateTruncated', { count: AGGREGATE_SAMPLE_LIMIT })) || `标签聚合仅采样前 ${AGGREGATE_SAMPLE_LIMIT} 个`})
                  </Text>
                )}
              </Text>
              <Grid templateColumns="repeat(4, 1fr)" gap={2}>
                {visibleThumbs.map((r, i) => {
                  const key = getAssetKey(r);
                  const isConflict = conflictKeys.has(key);
                  const highlightOnExpand = conflictExpanded && isConflict;
                  return (
                    <GridItem
                      key={key || i}
                      position="relative"
                      borderRadius="md"
                      overflow="hidden"
                      border={highlightOnExpand ? '2px solid #FFD230' : '1px solid rgba(255,255,255,0.06)'}
                      transition="all 0.2s"
                    >
                      <Box h="80px" w="100%" position="relative">
                        <NavigableAssetImage
                          result={r}
                          index={i}
                          getHeaders={getHeaders}
                          apiUrl={undefined /* 继承默认 */}
                          width="100%"
                          height="80px"
                        />
                        {/* 已有该 tag → ✓ 浮标 */}
                        {isConflict && (
                          <Box
                            position="absolute"
                            right="4px"
                            bottom="4px"
                            w="18px"
                            h="18px"
                            borderRadius="full"
                            bg="#FFD230"
                            color="black"
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                            boxShadow="0 0 6px rgba(255, 210, 48, 0.6)"
                          >
                            <CheckIcon boxSize="10px" />
                          </Box>
                        )}
                        {/* 移除按钮 */}
                        {onDeselect && (
                          <IconButton
                            aria-label="Deselect"
                            icon={<CloseIcon boxSize="8px" />}
                            size="xs"
                            position="absolute"
                            top="2px"
                            right="2px"
                            minW="16px"
                            h="16px"
                            bg="blackAlpha.700"
                            color="white"
                            _hover={{ bg: 'red.500' }}
                            onClick={() => onDeselect(key)}
                          />
                        )}
                      </Box>
                      <Text
                        fontSize="10px"
                        color="gray.400"
                        px={1}
                        py={0.5}
                        isTruncated
                      >
                        {getAssetDisplayName(r)}
                      </Text>
                    </GridItem>
                  );
                })}
              </Grid>
              {moreCount > 0 && !thumbsExpanded && (
                <Button
                  mt={2}
                  size="xs"
                  variant="ghost"
                  colorScheme="yellow"
                  onClick={() => setThumbsExpanded(true)}
                >
                  {(t?.('batchTagShowMore', { count: moreCount })) || `+${moreCount} 更多`}
                </Button>
              )}
            </GridItem>

            {/* 右侧：表单 */}
            <GridItem>
              <VStack align="stretch" spacing={4}>
                {/* 『仅选未打此标签的』Switch（Q4-A） */}
                <HStack justify="space-between">
                  <Text fontSize="sm" color="gray.300">
                    {(t?.('onlyUntaggedSwitch')) || '仅选未打此标签的'}
                  </Text>
                  <Switch
                    colorScheme="yellow"
                    isChecked={onlyUntagged}
                    onChange={(e) => setOnlyUntagged(e.target.checked)}
                  />
                </HStack>

                {/* tag 输入 */}
                <Box>
                  <Text fontSize="xs" color="gray.400" mb={1}>
                    {(t?.('batchTagInputLabel')) || '标签名'}
                  </Text>
                  <Input
                    value={tagName}
                    onChange={(e) => setTagName(e.target.value)}
                    placeholder={(t?.('batchTagInputPlaceholder')) || '输入标签名，例如 grass'}
                    bg="rgba(255,255,255,0.04)"
                    borderColor="rgba(255,255,255,0.12)"
                    _focus={{ borderColor: '#FFD230', boxShadow: '0 0 0 1px #FFD230' }}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleConfirm();
                      }
                    }}
                  />
                </Box>

                {/* 候选 chips */}
                <Box>
                  <HStack mb={1.5} justify="space-between">
                    <Text fontSize="xs" color="gray.400">
                      {(t?.('batchTagCandidates')) || '候选标签'}
                    </Text>
                    {isAggregating && (
                      <HStack spacing={1}>
                        <Spinner size="xs" color="#FFD230" />
                        <Text fontSize="10px" color="gray.500">
                          {(t?.('batchTagCandidatesLoading')) || '聚合中…'}
                        </Text>
                      </HStack>
                    )}
                  </HStack>
                  {candidateChips.length > 0 ? (
                    <Wrap spacing={1.5}>
                      {candidateChips.map(([name, count]) => (
                        <WrapItem key={name}>
                          <Tag
                            size="sm"
                            cursor="pointer"
                            bg="rgba(255, 210, 48, 0.1)"
                            color="#FFD230"
                            border="1px solid rgba(255, 210, 48, 0.25)"
                            _hover={{ bg: 'rgba(255, 210, 48, 0.2)' }}
                            onClick={() => setTagName(name)}
                          >
                            <TagLabel>{name}</TagLabel>
                            <Badge ml={1.5} fontSize="9px" bg="transparent" color="gray.500">
                              {count}
                            </Badge>
                          </Tag>
                        </WrapItem>
                      ))}
                    </Wrap>
                  ) : (
                    !isAggregating && (
                      <Text fontSize="xs" color="gray.600">
                        {(t?.('batchTagNoCandidates')) || '(无现有候选)'}
                      </Text>
                    )
                  )}
                </Box>
              </VStack>
            </GridItem>
          </Grid>
        </ModalBody>

        <ModalFooter
          borderTop="1px solid rgba(255,255,255,0.06)"
          justifyContent="space-between"
        >
          {/* 摘要（E4 + E4+ 可展开） */}
          <Box flex={1} pr={4}>
            <Text fontSize="xs" color="gray.400" display="inline">
              {(t?.('batchTagSummary', { count: effectiveCount, tag: trimmedTag || '—' }))
                || `将为 ${effectiveCount} 个资产添加 "${trimmedTag || '—'}" 标签`}
            </Text>
            {willSkipCount > 0 && (
              <Text
                as="span"
                fontSize="xs"
                color="yellow.400"
                ml={1}
                cursor="pointer"
                textDecoration="underline dotted"
                onClick={() => setConflictExpanded(v => !v)}
              >
                {(t?.('batchTagConflictSuffix', { count: willSkipCount })) || `（${willSkipCount} 个已有，跳过）`}
              </Text>
            )}
            {isOverLimit && (
              <Text fontSize="xs" color="red.300" mt={1}>
                {(t?.('batchTagLimitTip')) || `请先缩小范围至 ${HARD_LIMIT} 个以内`}
              </Text>
            )}
          </Box>
          <HStack>
            <Button variant="ghost" onClick={onClose} color="gray.400">
              {(t?.('cancel')) || '取消'}
            </Button>
            <Tooltip
              label={isOverLimit
                ? ((t?.('batchTagLimitTip')) || '请先缩小范围')
                : (!trimmedTag ? ((t?.('batchTagNeedName')) || '请输入标签名') : '')}
              isDisabled={!!trimmedTag && !isOverLimit && effectiveCount > 0}
              hasArrow
            >
              <Box>
                <Button
                  colorScheme="yellow"
                  bg="#FFD230"
                  color="black"
                  _hover={{ bg: '#FFE680' }}
                  isDisabled={!trimmedTag || isOverLimit || effectiveCount === 0}
                  onClick={handleConfirm}
                >
                  {(t?.('batchTagConfirm')) || '确认打标签'}
                </Button>
              </Box>
            </Tooltip>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
