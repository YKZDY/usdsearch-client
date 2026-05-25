/**
 * SPDX-FileCopyrightText: Copyright (c) 2024-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
 * SPDX-License-Identifier: MIT
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

import React, { memo, useMemo, useRef, useCallback } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Card,
  CardBody,
  Divider,
  Tooltip,
  IconButton,
  Button,
  Collapse,
  Grid,
  GridItem,
  useDisclosure,
  CircularProgress,
} from "@chakra-ui/react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  ExternalLinkIcon,
  SearchIcon,
} from "@chakra-ui/icons";
import SearchExplanations from "./SearchExplanations";
import NavigableAssetImage from "./components/NavigableAssetImage";
import { useSmartImageLoader } from "./hooks/useSmartImageLoader";
import { formatFileSize } from "./utils/formatUtils";
// === LM CUSTOMIZATION: i18n START ===
import { useTranslation } from "./i18n/LanguageContext";
// === LM CUSTOMIZATION: i18n END ===
import { SEARCH_DEFAULTS, FEATURE_FLAGS } from "./config";
import CardSelectCheckbox from "./components/shared/CardSelectCheckbox";
import EmptySearchHint from "./components/EmptySearchHint";
import { useDragSelect } from "./hooks/useDragSelect";
// === LM CUSTOMIZATION: ClickHandlerUnify START ===
// 卡片点击事件统一入口：SINGLE_CLICK_DRAWER 模式下走轻量直通路径，避免与
// useDragSelect 双重消费 mousemove。详见 hooks/useDrawerCardHandlers.js 头部注释。
// 合入英伟达新版时：保留 import；本 hook 由 LM 自有维护，无 NVIDIA 上游版本。
import { useDrawerCardHandlers } from "./hooks/useDrawerCardHandlers";
// === LM CUSTOMIZATION: ClickHandlerUnify END ===
import TaggedBadge from "./components/TaggedBadge";
import FailedBadge from "./components/FailedBadge";
// === LM CUSTOMIZATION: CardTagBar START ===
// 原因：Group B 需求 1+2 兑底接入。HybridSearchResults 是非虚拟化 fallback（结果数 ≤ 50 时使用），
// 与 VirtualizedHybridSearchResults 保持一致体验。
// 合入英伟达新版时：保留本 import。
import CardTagBar from "./components/CardTagBar";
// === LM CUSTOMIZATION: CardTagBar END ===

const HighlightedText = ({ text, matchedTerms = [], isValue = false, noOfLines, isTruncated = false }) => {
  const truncateProps = {};
  if (noOfLines) {
    truncateProps.noOfLines = noOfLines;
  }
  if (isTruncated) {
    truncateProps.isTruncated = true;
  }

  if (!matchedTerms || matchedTerms.length === 0 || !text) {
    return (
      <Text fontSize="xs" wordBreak="break-word" color={isValue ? "gray.200" : "inherit"} {...truncateProps} title={text}>
        {text}
      </Text>
    );
  }

  // Create a regex pattern from matched terms
  const pattern = new RegExp(`(${matchedTerms.map(term => 
    term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  ).join('|')})`, 'gi');

  const parts = text.split(pattern);
  
  return (
    <Text fontSize="xs" wordBreak="break-word" {...truncateProps} title={text}>
      {parts.map((part, index) => {
        const isMatch = matchedTerms.some(term => 
          part.toLowerCase() === term.toLowerCase()
        );
        return isMatch ? (
          <Text as="mark" key={index} bg="yellow.300" color="gray.800" px={1} borderRadius="sm" fontWeight="bold">
            {part}
          </Text>
        ) : (
          <Text as="span" key={index} color={isValue ? "gray.200" : "inherit"}>
            {part}
          </Text>
        );
      })}
    </Text>
  );
};

const QueryMatchBadges = memo(({ explanations = [], showScores = SEARCH_DEFAULTS.showScores }) => {
  const { t } = useTranslation();
  if (!explanations || explanations.length === 0) {
    return null;
  }

  // Helper function to truncate text
  const truncateText = (text, maxLength = 25) => {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <VStack spacing={2} align="stretch">
      {explanations.map((explanation, index) => {
        const { search_type, matched_terms = [] } = explanation;
        
        if (search_type === 'text_to_vector' || search_type === 'image_to_vector' || search_type === 'vector') {
          // For vector searches, show simple badge
          return (
            <HStack key={index} spacing={2}>
              <Badge colorScheme="purple" size="sm">
                {t('vectorMatch')}
              </Badge>
              {showScores && (
                <Text fontSize="xs" color="gray.300">
                  {search_type} (score: {explanation.score?.toFixed(3)})
                </Text>
              )}
            </HStack>
          );
        }
        
        if (matched_terms && matched_terms.length > 0) {
          // For text searches, show individual term badges
          return (
            <HStack key={index} spacing={1} wrap="wrap">
              <Badge colorScheme="blue" size="sm">
                {truncateText(search_type, 15)}:
              </Badge>
              {matched_terms.slice(0, 5).map((term, termIndex) => (
                <Tooltip key={termIndex} label={term} placement="top">
                  <Badge colorScheme="yellow" size="sm" variant="outline" maxW="150px">
                    <Text fontSize="xs" noOfLines={1}>
                      {truncateText(term, 20)}
                    </Text>
                  </Badge>
                </Tooltip>
              ))}
              {matched_terms.length > 5 && (
                <Badge colorScheme="gray" size="sm" variant="outline">
                  +{matched_terms.length - 5} {t('more')}
                </Badge>
              )}
            </HStack>
          );
        }
        
        return null;
      })}
    </VStack>
  );
});

const SmartHighlightedContent = memo(({ result, searchQuery = "" }) => {
  const { t } = useTranslation();
  
  if (!result.source) {
    return null;
  }

  const explanations = result.metadata?.explanations || [];
  const matchedFields = new Set();
  const textTermsToHighlight = [];

  // Extract text terms and identify which fields were matched
  explanations.forEach(explanation => {
    if (explanation.matched_terms) {
      explanation.matched_terms.forEach(term => {
        // Map term to source field
        if (term.includes('usd_properties.value_field') || term.includes('property_')) {
          matchedFields.add('usd_properties');
        }
        if (term.includes('path.tree_field') || term.includes('path_field')) {
          matchedFields.add('path');
        }
        if (term.includes('name_field')) {
          matchedFields.add('name');
        }
        
        // Extract actual search terms (not field references)
        if (!term.includes('.') && !term.includes('_field')) {
          textTermsToHighlight.push(term);
        }
      });
    }
  });

  // Add search query terms for highlighting
  if (searchQuery) {
    const queryTerms = searchQuery.toLowerCase().split(/\s+/).filter(term => term.length > 2);
    textTermsToHighlight.push(...queryTerms);
  }

  const highlightableContent = [];

  // Add path if matched
  if (matchedFields.has('path') && result.source.path) {
    highlightableContent.push({
      label: t('pathLabel'),
      content: result.source.path,
      color: "cyan"
    });
  }

  // Add name if matched
  if (matchedFields.has('name') && result.source.name) {
    highlightableContent.push({
      label: t('nameLabel'), 
      content: result.source.name,
      color: "orange"
    });
  }

  // Add USD properties if matched
  if (matchedFields.has('usd_properties') && result.source.usd_properties) {
    result.source.usd_properties.slice(0, 3).forEach(prop => {
      if (prop.value && textTermsToHighlight.some(term => 
        prop.value.toLowerCase().includes(term.toLowerCase())
      )) {
        highlightableContent.push({
          label: t('propertyLabel'),
          content: `${prop.name}: ${prop.value}`,
          color: "teal"
        });
      }
    });
  }

  // Add AI-generated metadata if matched
  if (result.source.vision_generated_metadata) {
    Object.entries(result.source.vision_generated_metadata).forEach(([key, value]) => {
      if (value && textTermsToHighlight.some(term => 
        value.toLowerCase().includes(term.toLowerCase())
      )) {
        highlightableContent.push({
          label: t('aiTagLabel'),
          content: `${key.replace('vision_generated_', '').replace('_', ' ')}: ${value}`,
          color: "purple"
        });
      }
    });
  }

  // Add VLM metadata if matched
  if (result.source) {
    Object.entries(result.source)
      .filter(([key]) => key.endsWith('_vlm_generated'))
      .forEach(([fieldKey, fieldValue]) => {
        if (Array.isArray(fieldValue)) {
          fieldValue.slice(0, 2).forEach(item => {
            const itemValue = Array.isArray(item.value_text) ? item.value_text.join(', ') : 
                            typeof item.value_bool !== 'undefined' ? item.value_bool.toString() : 
                            item.value_text || '';
            if (itemValue && textTermsToHighlight.some(term => 
              itemValue.toLowerCase().includes(term.toLowerCase())
            )) {
              highlightableContent.push({
                label: t('vlmLabel'),
                content: `${item.name}: ${itemValue}`,
                color: "pink"
              });
            }
          });
        }
      });
  }

  if (highlightableContent.length === 0) {
    return null;
  }

  return (
    <HStack spacing={2} wrap="wrap" align="start">
      {highlightableContent.map((item, index) => (
        <Badge 
          key={index}
          colorScheme={item.color} 
          size="sm" 
          variant="outline"
          px={3}
          py={2}
          borderRadius="md"
          display="flex"
          alignItems="center"
          gap={2}
          flexShrink={0}
        >
          <Text fontSize="xs" fontWeight="bold" color={`${item.color}.400`} whiteSpace="nowrap">
            {item.label}:
          </Text>
          <HighlightedText 
            text={item.content}
            matchedTerms={textTermsToHighlight}
            isValue={true}
          />
        </Badge>
      ))}
    </HStack>
  );
});

const HybridSearchResultGridItem = memo(({
  result,
  index,
  onSelectionChange,
  onItemClick,
  copyToClipboard,
  onFindSimilar,
  showScores = SEARCH_DEFAULTS.showScores,
  gridSize = SEARCH_DEFAULTS.gridSize,
  searchQuery = "",
  getLoadingState,
  registerImageElement,
  getHeaders,
  apiUrl,
  isSelected = false,
  isMultiSelectMode = false,
  failedReason = null,
  onRetryFailed,
  // === LM CUSTOMIZATION: CardTagBar START ===
  serverUrl,
  // === LM CUSTOMIZATION: CardTagBar END ===
}) => {
  const { t } = useTranslation();
  
  // Get the filename from base_key or URL
  const baseKey = result.source?.base_key || result.source?.url || result.id;
  const filename = baseKey?.split('/').pop() || 'Unknown';

  // Tooltip text based on mode
  // === LM CUSTOMIZATION: SelectionInteraction START ===
  // v3 TC-A9 修复：原 v2 改 List 视图（下方）时漏改 Grid 视图的 cardTooltip。
  // 方案 B 单击本体 = 打开 Drawer，原"单击选中·双击查看详情"提示已不准确，
  // SINGLE_CLICK_DRAWER=true 时一律不显示 tooltip（避免 hover 干扰）。
  // 合入英伟达新版时：保留本块；旗标关闭时退回原 NEW_CARD_INTERACTION 提示。
  const cardTooltip = FEATURE_FLAGS.NEW_CARD_INTERACTION && !FEATURE_FLAGS.SINGLE_CLICK_DRAWER
    ? (isMultiSelectMode ? t('clickOrDoubleClickHint') : t('clickOrDoubleClickHint'))
    : '';
  // === LM CUSTOMIZATION: SelectionInteraction END ===

  const defaultBorderColor = isMultiSelectMode && !isSelected
    ? "rgba(255, 210, 48, 0.15)"
    : "rgba(255, 255, 255, 0.05)";

  // === LM CUSTOMIZATION: ClickHandlerUnify START ===
  // 卡片点击事件统一入口（替换原 useClickOrDoubleClick 直接挂载）。
  // SINGLE_CLICK_DRAWER=true：走轻量直通，不监听 mousemove，让 useDragSelect 独占，避免 click 误吞。
  // SINGLE_CLICK_DRAWER=false：内部 fallback 到 useClickOrDoubleClick 原行为。
  // 合入英伟达新版时：保留本块。
  const clickHandlers = useDrawerCardHandlers({
    result,
    index,
    onSelectionChange,
    onItemClick,
    enabled: FEATURE_FLAGS.NEW_CARD_INTERACTION,
    drawerEnabled: FEATURE_FLAGS.SINGLE_CLICK_DRAWER,
  });
  // === LM CUSTOMIZATION: ClickHandlerUnify END ===

  // [TagSearchFix P3] 识别"是否因 tag 命中而被搜出"，并提取命中的 tag 文本，
  // 用于在 category badge 上优先展示并加主题色描边——让用户秒懂"打过这个 tag 才搜到"。
  const tagHitInfo = useMemo(() => {
    const explanations = result.metadata?.explanations || [];
    const tagFieldHit = explanations.some(exp =>
      Array.isArray(exp?.matched_terms) &&
      exp.matched_terms.some(term => typeof term === 'string' && term.includes('tags.tag'))
    );
    if (!tagFieldHit) return { isTagHit: false, matchedTag: null };
    // 从 source.tags 中找出与当前查询词相关的 tag（优先 includes 匹配，否则取首个）
    const tags = result.source?.tags || [];
    const tagNames = tags.map(t => typeof t === 'string' ? t : (t?.tag || t?.name || ''));
    const q = (searchQuery || '').trim().toLowerCase();
    let matched = null;
    if (q) {
      matched = tagNames.find(n => n.toLowerCase().includes(q)) || null;
    }
    if (!matched) matched = tagNames[0] || null;
    return { isTagHit: true, matchedTag: matched };
  }, [result.metadata?.explanations, result.source?.tags, searchQuery]);

  return (
    <Tooltip label={cardTooltip} openDelay={600} placement="top" isDisabled={!cardTooltip} hasArrow>
    <Card 
      /* Fab 实测：bg rgba(255,255,255,0.05), border rgba(255,255,255,0.05) */
      bg={isSelected ? "#2a2b1e" : "rgba(255, 255, 255, 0.05)"} 
      borderColor={isSelected ? "#FFD230" : defaultBorderColor} 
      borderWidth="1px"
      /* V2 U6: 命中态外发光仅在非选中时渲染（避免三层金色视觉过载） */
      boxShadow={tagHitInfo.isTagHit && !isSelected ? "0 0 16px rgba(255, 210, 48, 0.25)" : undefined}
      /* 光子品牌色：hover 金色边框 + 微光；命中态 hover 加强（已去掉 translateY 上浮，避免出界遮挡） */
      _hover={{
        borderColor: "#FFD230",
        shadow: tagHitInfo.isTagHit && !isSelected
          ? "0 6px 24px rgba(255,210,48,0.4)"
          : "0 6px 20px rgba(255,210,48,0.12)",
      }}
      transition="border-color 0.1s linear, box-shadow 0.1s linear, background 0.1s linear"
      cursor="pointer"
      {...clickHandlers}
      h="100%"
      borderRadius="12px"
      overflow="hidden"
      position="relative"
    >
      {/* V2 Q1-A: 命中角标（已去除：与 checkbox 打勾视觉冲突）。保留外发光作为命中提示 */}
      {/* {tagHitInfo.isTagHit && (
        <TaggedBadge size={gridSize === 'S' ? 'sm' : 'md'} />
      )} */}
      {/* V2 U1: 批量失败角标（右上角，优先级最高） */}
      {failedReason && (
        <FailedBadge
          reason={failedReason}
          onRetry={() => onRetryFailed?.(result)}
        />
      )}
      {/* NEW CARD INTERACTION: Checkbox */}
      {FEATURE_FLAGS.NEW_CARD_INTERACTION ? (
        <CardSelectCheckbox
          isSelected={isSelected}
          isMultiSelectMode={isMultiSelectMode}
          onToggle={() => onSelectionChange?.(result)}
        />
      ) : (
        isSelected && (
          <Box
            position="absolute"
            top={2}
            left={2}
            zIndex={10}
            bg="#FFD230"
            color="black"
            borderRadius="full"
            boxSize="20px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            fontSize="xs"
            fontWeight="bold"
          >
            &#10003;
          </Box>
        )
      )}
      {/* Fab 实测：信息区 padding 8px 12px */}
      <CardBody px="12px" py="8px">
        <VStack spacing={gridSize === "S" ? 2 : 2} align="stretch" h="100%">
          {/* === LM CUSTOMIZATION: Fab-style image with hover overlay START === */}
          {/* Fab 实测：缩略图 16:9 比例, bg rgb(40,40,44) */}
          <Box position="relative" overflow="hidden" borderRadius="md">
            <NavigableAssetImage
              result={result}
              index={index}
              getHeaders={getHeaders}
              apiUrl={apiUrl}
              width="100%"
              height="auto"
              borderRadius="md"
              style={{ aspectRatio: "16/9", objectFit: "cover", backgroundColor: "rgb(40, 40, 44)" }}
            />
            {/* Hover overlay — Fab: white bg, opacity 0→0.1 */}
            <Box
              className="fab-hover-overlay"
              position="absolute"
              inset={0}
              bg="white"
              opacity={0}
              transition="opacity 0.15s ease"
              pointerEvents="none"
              borderRadius="md"
              sx={{ ".chakra-card:hover &": { opacity: 0.1 } }}
            />
            {/* Bottom-left badges — Fab: category + engine icons on hover */}
            {gridSize !== "S" && (
              <HStack
                className="fab-hover-badges"
                position="absolute"
                bottom={2}
                left={2}
                right={2}
                spacing={2}
                opacity={0}
                visibility="hidden"
                transition="opacity 0.2s ease, visibility 0.2s ease"
                pointerEvents="none"
                sx={{ ".chakra-card:hover &": { opacity: 1, visibility: "visible" } }}
              >
                {/* Category badge — 优先展示命中的 tag，命中时主题色描边（P3） */}
                {(tagHitInfo.matchedTag || result.source?.tags?.[0]) && (
                  <Badge
                    bg={tagHitInfo.isTagHit ? 'rgba(255, 210, 48, 0.18)' : 'rgba(48, 48, 52, 0.7)'}
                    backdropFilter="blur(50px)"
                    color={tagHitInfo.isTagHit ? '#FFD230' : 'white'}
                    border={tagHitInfo.isTagHit ? '1px solid #FFD230' : '1px solid transparent'}
                    borderRadius="9999px"
                    px={3}
                    py="2px"
                    fontSize="12px"
                    fontWeight={tagHitInfo.isTagHit ? '500' : '400'}
                    h="24px"
                    display="flex"
                    alignItems="center"
                    title={tagHitInfo.isTagHit ? (t('matchedByTag') || '匹配标签') : undefined}
                  >
                    {tagHitInfo.matchedTag
                      || (typeof result.source.tags[0] === 'string'
                          ? result.source.tags[0]
                          : (result.source.tags[0].tag || result.source.tags[0].value || ''))}
                  </Badge>
                )}
                {/* TODO: Engine compatibility icons — backend has no engine field yet */}
                {/* Placeholder: will render engine badges here when data is available */}
              </HStack>
            )}
          </Box>
          {/* === LM CUSTOMIZATION: Fab-style image with hover overlay END === */}

          {/* Content */}
          <VStack spacing={gridSize === "S" ? 1 : 2} align="stretch" flex={1}>
            {/* Title + Rating row — Fab layout: title left, rating right, gap 20px */}
            <HStack justify="space-between" align="center" gap="20px">
              <Tooltip label={baseKey} placement="top">
                <Text 
                  fontSize="12px"
                  fontWeight="700" 
                  noOfLines={1}
                  lineHeight="15.6px"
                  letterSpacing="0.36px"
                  color="white"
                  fontFamily="'Inter', sans-serif"
                  title={filename}
                  flex={1}
                  minW={0}
                >
                  {filename}
                </Text>
              </Tooltip>
              {/* === LM CUSTOMIZATION: Fab-style rating 已隐藏（MT 反馈目前不需要）=== */}
              {/* TODO: 后续接入评分数据后取消注释恢复
              {gridSize !== "S" && (
                <HStack spacing={1} flexShrink={0} className="fab-rating-placeholder" title={t('fabCardRatingDisabled')}>
                  <Box as="span" color="#ffc229" fontSize="16px" lineHeight="1" w="16px" h="16px" display="flex" alignItems="center" justifyContent="center">★</Box>
                  <Text fontSize="12px" fontWeight="400" color="white">—</Text>
                  <Text fontSize="12px" fontWeight="400" color="rgba(255,255,255,0.65)">(—)</Text>
                </HStack>
              )}
              */}
            </HStack>

            {/* === LM CUSTOMIZATION: Fab-style author row START === */}
            {gridSize !== "S" && (
              <Text
                fontSize="12px"
                fontWeight="400"
                color="rgba(255,255,255,0.65)"
                noOfLines={1}
                lineHeight="15.6px"
              >
                {result.source?.created_by || result.source?.modified_by || '—'}
              </Text>
            )}
            {/* === LM CUSTOMIZATION: Fab-style author row END === */}

            {/* === LM CUSTOMIZATION: Fab-style price 已隐藏（MT 反馈目前不需要）=== */}
            {/* TODO: 后续接入价格数据后取消注释恢复
            {gridSize !== "S" && (
              <HStack spacing={1} className="fab-price-placeholder" title={t('fabCardPriceDisabled')}>
                <Text fontSize="12px" fontWeight="400" color="rgba(255,255,255,0.65)">
                  {t('fabCardStartingPrice')}
                </Text>
                <Text fontSize="12px" fontWeight="400" color="white">—</Text>
              </HStack>
            )}
            */}

            {/* Score Badges */}
            {showScores && (
              <HStack spacing={1} wrap="wrap">
                <Badge colorScheme="yellow" size="xs">
                  {result.score.toFixed(2)}
                </Badge>
                <Badge colorScheme="blue" size="xs">
                  RRF: {result.rrf_score.toFixed(2)}
                </Badge>
                {result.metadata?.rrf_rank && (
                  <Badge colorScheme="yellow" size="xs">
                    #{result.metadata.rrf_rank}
                  </Badge>
                )}
              </HStack>
            )}

            {/* === LM CUSTOMIZATION: CardTagBar START === */}
            {/* 原 QueryMatchBadges 被业务 tag 区取代；保留原代码以便将来开关。 */}
            {/*
            {gridSize !== "S" && (
              <QueryMatchBadges explanations={result.metadata?.explanations} showScores={showScores} />
            )}
            */}
            {gridSize !== "S" ? (
              <CardTagBar
                asset={result}
                serverUrl={serverUrl}
                getHeaders={getHeaders}
                apiUrl={apiUrl}
                maxVisible={3}
              />
            ) : (
              <CardTagBar
                asset={result}
                serverUrl={serverUrl}
                getHeaders={getHeaders}
                apiUrl={apiUrl}
                compact
              />
            )}
            {/* === LM CUSTOMIZATION: CardTagBar END === */}

            {/* Metadata */}
            <VStack spacing={1} align={gridSize === "S" ? "end" : "stretch"} fontSize="2xs" color="gray.300" flex={1}>
              {result.source?.size && (
                <Text textAlign={gridSize === "S" ? "right" : "left"}>{t('size')} {formatFileSize(result.source.size)}</Text>
              )}
              {gridSize !== "S" && result.source?.modified_timestamp && (
                <Text>{t('modified')} {new Date(result.source.modified_timestamp).toLocaleDateString()}</Text>
              )}
            </VStack>

            {/* Actions */}
            <HStack justify={gridSize === "S" ? "center" : "space-between"} pt={gridSize === "S" ? 1 : 2}>
              {gridSize === "S" ? (
                // Compact view - copy + find similar (+ view details in legacy mode)
                <HStack spacing={1}>
                  {copyToClipboard && (
                    <Tooltip label={t('copyUrl')}>
                      <IconButton
                        size="xs"
                        variant="ghost"
                        icon={<CopyIcon />}
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard?.(baseKey);
                        }}
                        aria-label={t('copyUrl')}
                      />
                    </Tooltip>
                  )}
                  <Tooltip label={t('findSimilarAssets')}>
                    <IconButton
                      size="xs"
                      variant="ghost"
                      icon={<SearchIcon />}
                      onClick={(e) => {
                        e.stopPropagation();
                        onFindSimilar?.(baseKey);
                      }}
                      aria-label={t('findSimilarAssets')}
                      colorScheme="purple"
                    />
                  </Tooltip>
                  {!FEATURE_FLAGS.NEW_CARD_INTERACTION && (
                    <Tooltip label={t('viewDetails')}>
                      <IconButton
                        size="xs"
                        variant="ghost"
                        icon={<ExternalLinkIcon />}
                        onClick={(e) => {
                          e.stopPropagation();
                          onItemClick?.(result);
                        }}
                        aria-label={t('viewDetails')}
                      />
                    </Tooltip>
                  )}
                </HStack>
              ) : (
                // Full view - all actions
                <>
                  <HStack spacing={1}>
                    {copyToClipboard && (
                      <Tooltip label={t('copyUrl')}>
                        <IconButton
                          size="xs"
                          variant="ghost"
                          icon={<CopyIcon />}
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard?.(baseKey);
                          }}
                          aria-label={t('copyUrl')}
                        />
                      </Tooltip>
                    )}
                    <Tooltip label={t('findSimilarAssets')}>
                      <IconButton
                        size="xs"
                        variant="ghost"
                        icon={<SearchIcon />}
                        onClick={(e) => {
                          e.stopPropagation();
                          onFindSimilar?.(baseKey);
                        }}
                        aria-label={t('findSimilarAssets')}
                        colorScheme="purple"
                      />
                    </Tooltip>
                  </HStack>
                  {!FEATURE_FLAGS.NEW_CARD_INTERACTION && (
                    <Tooltip label={t('viewDetails')}>
                      <IconButton
                        size="xs"
                        variant="ghost"
                        icon={<ExternalLinkIcon />}
                        onClick={(e) => {
                          e.stopPropagation();
                          onItemClick?.(result);
                        }}
                        aria-label={t('viewDetails')}
                      />
                    </Tooltip>
                  )}
                </>
              )}
            </HStack>
          </VStack>
        </VStack>
      </CardBody>
    </Card>
    </Tooltip>
  );
});

const HybridSearchResultItem = memo(({
  result,
  index,
  onSelectionChange,
  onItemClick,
  copyToClipboard,
  onFindSimilar,
  showScores = SEARCH_DEFAULTS.showScores,
  maxScore = 1,
  minScore = 0,
  searchQuery = "",
  getLoadingState,
  registerImageElement,
  getHeaders,
  apiUrl,
  isSelected = false,
  isMultiSelectMode = false,
  failedReason = null,
  onRetryFailed,
  // === LM CUSTOMIZATION: CardTagBar START ===
  serverUrl,
  // === LM CUSTOMIZATION: CardTagBar END ===
}) => {
  const { t } = useTranslation();
  const { isOpen, onToggle } = useDisclosure();
  
  // Extract all matched terms from explanations
  const allMatchedTerms = result.metadata?.explanations?.flatMap(exp => 
    exp.matched_terms || []
  ) || [];
  
  // Get the filename from base_key or URL
  const baseKey = result.source?.base_key || result.source?.url || result.id;
  const filename = baseKey?.split('/').pop() || 'Unknown';

  // Tooltip text based on mode
  // Tooltip text based on mode
  // === LM CUSTOMIZATION: SelectionInteraction START ===
  // 原因：方案 B 单击本体 = 打开 Drawer，原提示已不准确
  // 合入英伟达新版时：保留
  const cardTooltip = FEATURE_FLAGS.NEW_CARD_INTERACTION && !FEATURE_FLAGS.SINGLE_CLICK_DRAWER
    ? t('clickOrDoubleClickHint')
    : '';
  // === LM CUSTOMIZATION: SelectionInteraction END ===

  const defaultBorderColor = isMultiSelectMode && !isSelected
    ? "rgba(255, 210, 48, 0.15)"
    : "#383838";

  // V2 Q1-A: 同 Grid 版本的命中识别
  const listTagHit = useMemo(() => {
    const explanations = result.metadata?.explanations || [];
    return explanations.some(exp =>
      Array.isArray(exp?.matched_terms) &&
      exp.matched_terms.some(term => typeof term === 'string' && term.includes('tags.tag'))
    );
  }, [result.metadata?.explanations]);

  // === LM CUSTOMIZATION: ClickHandlerUnify START ===
  // 卡片点击事件统一入口（List 视图，与 Grid 一致）。
  // 合入英伟达新版时：保留本块。
  const clickHandlers = useDrawerCardHandlers({
    result,
    index,
    onSelectionChange,
    onItemClick,
    enabled: FEATURE_FLAGS.NEW_CARD_INTERACTION,
    drawerEnabled: FEATURE_FLAGS.SINGLE_CLICK_DRAWER,
  });
  // === LM CUSTOMIZATION: ClickHandlerUnify END ===

  return (
    <Tooltip label={cardTooltip} openDelay={600} placement="top" isDisabled={!cardTooltip} hasArrow>
    <Card 
      bg={isSelected ? "#2a2b1e" : "#1C1D20"} 
      borderColor={isSelected ? "#FFD230" : defaultBorderColor} 
      boxShadow={listTagHit && !isSelected ? "0 0 16px rgba(255, 210, 48, 0.25)" : undefined}
      _hover={{
        borderColor: "#FFD230",
        shadow: listTagHit && !isSelected
          ? "0 0 24px rgba(255,210,48,0.4)"
          : "0 0 20px rgba(255,210,48,0.08)",
      }}
      transition="all 0.25s"
      cursor="pointer"
      {...clickHandlers}
      borderRadius="12px"
      position="relative"
    >
      {/* V2 Q1-A: 命中角标（List 视图同样，已去除） */}
      {/* {listTagHit && <TaggedBadge size="sm" />} */}
      {/* V2 U1: 失败角标 */}
      {failedReason && (
        <FailedBadge reason={failedReason} onRetry={() => onRetryFailed?.(result)} />
      )}
      {/* NEW CARD INTERACTION: Checkbox */}
      {FEATURE_FLAGS.NEW_CARD_INTERACTION ? (
        <CardSelectCheckbox
          isSelected={isSelected}
          isMultiSelectMode={isMultiSelectMode}
          onToggle={() => onSelectionChange?.(result)}
        />
      ) : (
        isSelected && (
          <Box
            position="absolute"
            top={2}
            left={2}
            zIndex={10}
            bg="#FFD230"
            color="black"
            borderRadius="full"
            boxSize="20px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            fontSize="xs"
            fontWeight="bold"
          >
            &#10003;
          </Box>
        )
      )}
      <CardBody p={4}>
        <Grid templateColumns="200px 1fr auto" gap={4} alignItems="start">
          {/* Image Thumbnail */}
          <GridItem>
            <NavigableAssetImage
              result={result}
              index={index}
              getHeaders={getHeaders}
              apiUrl={apiUrl}
              width="200px"
              height="150px"
              borderRadius="md"
            />
          </GridItem>

          {/* Main Content */}
          <GridItem>
            <VStack spacing={3} align="stretch">
              {/* Title and Actions */}
              <HStack justify="space-between">
                <VStack align="start" spacing={1} flex={1}>
                  <Tooltip label={baseKey} placement="top">
                    <HighlightedText 
                      text={filename}
                      matchedTerms={allMatchedTerms}
                      noOfLines={1}
                    />
                  </Tooltip>
                  {showScores && (
                    <HStack>
                      <Badge colorScheme="yellow" size="sm">
                        {t('scoreLabel')} {result.score.toFixed(3)}
                      </Badge>
                      <Badge colorScheme="blue" size="sm">
                        RRF: {result.rrf_score.toFixed(3)}
                      </Badge>
                      {result.metadata?.rrf_rank && (
                        <Badge colorScheme="yellow" size="sm">
                          #{t('rank')} {result.metadata.rrf_rank}
                        </Badge>
                      )}
                    </HStack>
                  )}
                </VStack>
                
                <HStack>
                  {copyToClipboard && (
                    <Tooltip label={t('copyUrl')}>
                      <IconButton
                        size="sm"
                        variant="ghost"
                        icon={<CopyIcon />}
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard?.(baseKey);
                        }}
                        aria-label={t('copyUrl')}
                      />
                    </Tooltip>
                  )}
                  <Tooltip label={t('findSimilarAssets')}>
                    <IconButton
                      size="sm"
                      variant="ghost"
                      icon={<SearchIcon />}
                      onClick={(e) => {
                        e.stopPropagation();
                        onFindSimilar?.(baseKey);
                      }}
                      aria-label={t('findSimilarAssets')}
                      colorScheme="purple"
                    />
                  </Tooltip>
                  {!FEATURE_FLAGS.NEW_CARD_INTERACTION && (
                    <Tooltip label={t('viewDetails')}>
                      <IconButton
                        size="sm"
                        variant="ghost"
                        icon={<ExternalLinkIcon />}
                        onClick={(e) => {
                          e.stopPropagation();
                          onItemClick?.(result);
                        }}
                        aria-label={t('viewDetails')}
                      />
                    </Tooltip>
                  )}
                </HStack>
              </HStack>

              {/* === LM CUSTOMIZATION: CardTagBar START === */}
              {/* 原 QueryMatchBadges + SmartHighlightedContent 被业务 tag 区取代。 */}
              {/*
              <QueryMatchBadges explanations={result.metadata?.explanations} showScores={showScores} />
              <SmartHighlightedContent 
                result={result} 
                searchQuery={searchQuery}
              />
              */}
              <CardTagBar
                asset={result}
                serverUrl={serverUrl}
                getHeaders={getHeaders}
                apiUrl={apiUrl}
                maxVisible={5}
              />
              {/* === LM CUSTOMIZATION: CardTagBar END === */}

              {/* Metadata */}
              {result.source && (
                <VStack spacing={1} align="stretch" fontSize="sm" color="gray.300">
                  {result.source.size && (
                    <Text>{t('size')} {formatFileSize(result.source.size)}</Text>
                  )}
                  {result.source.modified_timestamp && (
                    <Text>{t('modified')} {new Date(result.source.modified_timestamp).toLocaleDateString()}</Text>
                  )}
                </VStack>
              )}

            </VStack>
          </GridItem>

          {/* Explanations Toggle */}
          <GridItem>
            <VStack>
              <IconButton
                size="sm"
                variant="ghost"
                icon={isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle();
                }}
                aria-label="Toggle explanations"
              />
              <Text fontSize="xs" color="gray.300" textAlign="center">
                {t('whyThisMatched')}
              </Text>
            </VStack>
          </GridItem>
        </Grid>

        {/* Expandable Search Explanations */}
        <Collapse in={isOpen} animateOpacity>
          <Divider my={4} />
          <SearchExplanations
            explanations={result.metadata?.explanations || []}
            totalScore={result.score}
            rrfRank={result.metadata?.rrf_rank}
            originalRanks={result.metadata?.original_ranks || {}}
            showSummary={false}
            maxItems={3}
          />
        </Collapse>
      </CardBody>
    </Card>
    </Tooltip>
  );
});

const HybridSearchResults = ({ 
  results = [], 
  onItemClick, 
  copyToClipboard, 
  onFindSimilar,
  showScores = SEARCH_DEFAULTS.showScores,
  viewMode = SEARCH_DEFAULTS.viewMode,
  gridSize = SEARCH_DEFAULTS.gridSize,
  isLoading = false,
  isEmpty = false,
  searchQuery = "",
  getHeaders,
  apiUrl,
  selectedItems,
  onSelectionChange,
  onBatchSelection,
  onCopySelectedUrls,
  isMultiSelectMode = false,
  // V2 U1: 批量失败持久化到卡片
  failedBatchItems = null, // Map<assetUrl, { reason, timestamp }>
  onRetryFailed,
  // === LM CUSTOMIZATION: CardTagBar START ===
  serverUrl = "",
  // === LM CUSTOMIZATION: CardTagBar END ===
}) => {
  const { t } = useTranslation();

  // === Drag select (must be before any early return) ===
  const scrollContainerRef = useRef(null);
  const getItemId = useCallback((item) => {
    return item?.id || item?.source?.base_key || item?.source?.url;
  }, []);
  const handleDragSelectionChange = useCallback((newSet) => {
    onBatchSelection?.(newSet);
  }, [onBatchSelection]);

  const { isDragging, selectionRect } = useDragSelect({
    containerRef: scrollContainerRef,
    items: results,
    getItemId,
    onSelectionChange: handleDragSelectionChange,
    baseSelection: selectedItems,
    enabled: FEATURE_FLAGS.NEW_CARD_INTERACTION,
  });

  // Smart image loading for visible + buffer items
  const { getLoadingState, registerImageElement } = useSmartImageLoader(
    results,
    getHeaders,
    apiUrl,
    {
      bufferSize: viewMode === "grid" ? 12 : 8, // Load more for grid view
      rootMargin: "300px", // Start loading earlier
      enabled: !isLoading && !isEmpty
    }
  );

  // Calculate score range for normalization (memoized)
  // Must be before early returns to satisfy React Hooks rules
  const { maxScore, minScore } = useMemo(() => {
    if (!results || results.length === 0) return { maxScore: 0, minScore: 0 };
    const scores = results.map(r => r.score);
    return {
      maxScore: Math.max(...scores),
      minScore: Math.min(...scores)
    };
  }, [results]);

  if (isLoading) {
    return (
      <Box textAlign="center" py={8}>
        <CircularProgress isIndeterminate color="#FFD230" />
        <Text mt={4} color="gray.300">Searching...</Text>
      </Box>
    );
  }

  if (isEmpty || results.length === 0) {
    return <EmptySearchHint searchQuery={searchQuery} />;
  }

  return (
    <VStack spacing={2} align="stretch" flex={1} minH={0} overflow="hidden">
      {/* === v5: TitleBar + 结果计数已移入 FabToolbar 合并行，此处不再独立渲染 === */}

      {/* Results Display - scrollable content area */}
      {/* === LM CUSTOMIZATION: ScrollContainerOverflow START === */}
      {/* 原因（2026-05-25 用户反馈"右侧出现两条滚动条 + 上下滑动时界面往左抖一下"）：
          只写 overflowY="auto" 时，CSS 规范规定另一个轴的 visible 计算值会被强制为 auto
          （overflow-x/overflow-y 的 visible/clip 会成对自动转 auto）。
          一旦内部元素瞬时溢出 1px（图片解码完撑大、卡片标签栏 hover 阴影、
          react-window inner 容器与卡片绝对定位的细微 round-off），横向滚动条短暂出现，
          占用 ~6px 高度 → 内容可视高度变化 → 触发 ResizeObserver 重排 → 视觉抖动 + 残影双滚动条。
          解决：显式 overflowX="hidden" 锁死横向，仅保留垂直滚动。

          [补丁 2026-05-25] 用户实测仍偶发抖动。Playwright 复现确认根因之二：
          垂直滚动条本身的占位会因内容高度变化而出现/消失（默认 scrollbar-gutter=auto），
          内容从溢出变为不溢出时 clientWidth 从 294 跳到 300，再溢出又变回 294 —
          抖动 6px。修复：scrollbarGutter="stable" 强制为滚动条保留固定占位，
          无论内容是否溢出，宽度始终一致。
          合入英伟达新版时：保留本块；如上游改造此 Box，将本块两个属性合并进去。 */}
      <Box
        flex={1}
        minH={0}
        overflowX="hidden"
        overflowY="auto"
        sx={{ scrollbarGutter: 'stable' }}
        position="relative"
        ref={scrollContainerRef}
        style={{ userSelect: isDragging ? 'none' : 'auto' }}
      >
      {/* === LM CUSTOMIZATION: ScrollContainerOverflow END === */}
        {viewMode === "grid" ? (
          <Grid 
            templateColumns={`repeat(auto-fill, minmax(${gridSize === "S" ? "140px" : "280px"}, 1fr))`}
            gap={gridSize === "S" ? 2 : 4}
            w="100%"
          >
            {results.map((result, index) => {
              const assetUrl = result.source?.url || result.source?.base_key || result.id;
              const failedEntry = failedBatchItems?.get?.(assetUrl);
              return (
              <GridItem key={result.id || index} data-card-index={index}>
                <HybridSearchResultGridItem
                  result={result}
                  index={index}
                  onSelectionChange={onSelectionChange}
                  onItemClick={onItemClick}
                  copyToClipboard={copyToClipboard}
                  onFindSimilar={onFindSimilar}
                  showScores={showScores}
                  gridSize={gridSize}
                  searchQuery={searchQuery}
                  getLoadingState={getLoadingState}
                  registerImageElement={registerImageElement}
                  getHeaders={getHeaders}
                  apiUrl={apiUrl}
                  isSelected={selectedItems ? selectedItems.has(result.id || result.source?.base_key || result.source?.url) : false}
                  isMultiSelectMode={isMultiSelectMode}
                  failedReason={failedEntry?.reason || null}
                  onRetryFailed={onRetryFailed}
                  /* === LM CUSTOMIZATION: CardTagBar START === */
                  serverUrl={serverUrl}
                  /* === LM CUSTOMIZATION: CardTagBar END === */
                />
              </GridItem>
              );
            })}
          </Grid>
        ) : (
          <VStack spacing={4} align="stretch">
            {results.map((result, index) => {
              const assetUrl = result.source?.url || result.source?.base_key || result.id;
              const failedEntry = failedBatchItems?.get?.(assetUrl);
              return (
              <Box key={result.id || index} data-card-index={index}>
                <HybridSearchResultItem
                  result={result}
                  index={index}
                  onSelectionChange={onSelectionChange}
                  onItemClick={onItemClick}
                  copyToClipboard={copyToClipboard}
                  onFindSimilar={onFindSimilar}
                  showScores={showScores}
                  maxScore={maxScore}
                  minScore={minScore}
                  searchQuery={searchQuery}
                  getLoadingState={getLoadingState}
                  registerImageElement={registerImageElement}
                  getHeaders={getHeaders}
                  apiUrl={apiUrl}
                  isSelected={selectedItems ? selectedItems.has(result.id || result.source?.base_key || result.source?.url) : false}
                  isMultiSelectMode={isMultiSelectMode}
                  failedReason={failedEntry?.reason || null}
                  onRetryFailed={onRetryFailed}
                  /* === LM CUSTOMIZATION: CardTagBar START === */
                  serverUrl={serverUrl}
                  /* === LM CUSTOMIZATION: CardTagBar END === */
                />
              </Box>
              );
            })}
          </VStack>
        )}
      </Box>
      {/* === LM CUSTOMIZATION: DragSelectMarquee START === */}
      {/* Drag selection rectangle overlay
          v3 修复"拖拽时仍卡顿"：left/top 改用 transform GPU 合成 + contain:strict 隔离 layout，
          与 VirtualizedHybridSearchResults 同步。 */}
      <Box
        position="fixed"
        left="0"
        top="0"
        width={`${selectionRect?.width ?? 0}px`}
        height={`${selectionRect?.height ?? 0}px`}
        bg="rgba(255, 210, 48, 0.10)"
        border="1.5px solid rgba(255, 210, 48, 0.6)"
        borderRadius="4px"
        boxShadow={
          isDragging
            ? "0 0 0 1px rgba(0,0,0,0.2), 0 4px 16px rgba(255, 210, 48, 0.06)"
            : "0 0 0 1px rgba(0,0,0,0.2)"
        }
        opacity={isDragging && selectionRect ? 1 : 0}
        transform={
          isDragging && selectionRect
            ? `translate3d(${selectionRect.x}px, ${selectionRect.y}px, 0) scale(1)`
            : `translate3d(${selectionRect?.x ?? 0}px, ${selectionRect?.y ?? 0}px, 0) scale(0.98)`
        }
        transformOrigin="top left"
        transition={
          isDragging && selectionRect
            ? "opacity 0.08s cubic-bezier(0.0, 0, 0.2, 1)"
            : "opacity 0.12s cubic-bezier(0.4, 0, 1, 1), transform 0.12s cubic-bezier(0.4, 0, 1, 1)"
        }
        willChange="opacity, transform, width, height"
        sx={{ contain: 'strict' }}
        pointerEvents="none"
        zIndex={9999}
        aria-hidden="true"
      />
      {/* === LM CUSTOMIZATION: DragSelectMarquee END === */}
    </VStack>
  );
};

export default memo(HybridSearchResults);