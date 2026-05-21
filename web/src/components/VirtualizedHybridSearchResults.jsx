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

import React, { useMemo, useCallback, useEffect, memo, useRef } from "react";
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
  Spinner,
} from "@chakra-ui/react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  ExternalLinkIcon,
  SearchIcon,
} from "@chakra-ui/icons";
import VirtualizedResults from "./VirtualizedResults";
import SearchExplanations from "../SearchExplanations";
import NavigableAssetImage from "./NavigableAssetImage";
import { useSmartImageLoader } from "../hooks/useSmartImageLoader";
import { formatFileSize } from "../utils/formatUtils";
import { SEARCH_DEFAULTS, FEATURE_FLAGS } from "../config";
import { useTranslation } from "../i18n/LanguageContext";
import CardSelectCheckbox from "./shared/CardSelectCheckbox";
import EmptySearchHint from "./EmptySearchHint";
import { useDragSelect } from "../hooks/useDragSelect";
import { useClickOrDoubleClick } from "../hooks/useClickOrDoubleClick";
import TaggedBadge from "./TaggedBadge";
import FailedBadge from "./FailedBadge";

// Memoized components for better performance
const HighlightedText = memo(({ text, matchedTerms = [], isValue = false, noOfLines, isTruncated = false }) => {
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
});

const QueryMatchBadges = memo(({ explanations = [], showScores = SEARCH_DEFAULTS.showScores }) => {
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
        const { search_type, matched_terms = [], matched_vectors = [] } = explanation;
        
        if (search_type === 'text_to_vector' || search_type === 'image_to_vector' || search_type === 'vector') {
          return (
            <HStack key={index} spacing={2}>
              <Badge colorScheme="purple" size="sm">
                Vector Match
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
                  +{matched_terms.length - 5} more
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
  const highlightableContent = useMemo(() => {
    if (!result.source) {
      return [];
    }

    const explanations = result.metadata?.explanations || [];
    const matchedFields = new Set();
    const textTermsToHighlight = [];

    explanations.forEach(explanation => {
      if (explanation.matched_terms) {
        explanation.matched_terms.forEach(term => {
          if (term.includes('usd_properties.value_field') || term.includes('property_')) {
            matchedFields.add('usd_properties');
          }
          if (term.includes('path.tree_field') || term.includes('path_field')) {
            matchedFields.add('path');
          }
          if (term.includes('name_field')) {
            matchedFields.add('name');
          }
          
          if (!term.includes('.') && !term.includes('_field')) {
            textTermsToHighlight.push(term);
          }
        });
      }
    });

    if (searchQuery) {
      const queryTerms = searchQuery.toLowerCase().split(/\s+/).filter(term => term.length > 2);
      textTermsToHighlight.push(...queryTerms);
    }

    const content = [];

    if (matchedFields.has('path') && result.source.path) {
      content.push({
        label: "Path",
        content: result.source.path,
        color: "cyan"
      });
    }

    if (matchedFields.has('name') && result.source.name) {
      content.push({
        label: "Name", 
        content: result.source.name,
        color: "orange"
      });
    }

    if (matchedFields.has('usd_properties') && result.source.usd_properties) {
      result.source.usd_properties.slice(0, 3).forEach(prop => {
        if (prop.value && textTermsToHighlight.some(term => 
          prop.value.toLowerCase().includes(term.toLowerCase())
        )) {
          content.push({
            label: "Property",
            content: `${prop.name}: ${prop.value}`,
            color: "teal"
          });
        }
      });
    }

    return { content, textTermsToHighlight };
  }, [result, searchQuery]);

  if (highlightableContent.content.length === 0) {
    return null;
  }

  return (
    <HStack spacing={2} wrap="wrap" align="start">
      {highlightableContent.content.slice(0, 3).map((item, index) => (
        <Tooltip key={index} label={`${item.label}: ${item.content}`} placement="top">
          <Badge 
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
            maxW="250px"
          >
            <Text fontSize="xs" fontWeight="bold" color={`${item.color}.400`} whiteSpace="nowrap">
              {item.label}:
            </Text>
            <Box maxW="150px" overflow="hidden">
              <HighlightedText 
                text={item.content.length > 30 ? item.content.substring(0, 30) + '...' : item.content}
                matchedTerms={highlightableContent.textTermsToHighlight}
                isValue={true}
              />
            </Box>
          </Badge>
        </Tooltip>
      ))}
      {highlightableContent.content.length > 3 && (
        <Badge colorScheme="gray" size="sm" variant="outline">
          +{highlightableContent.content.length - 3} more
        </Badge>
      )}
    </HStack>
  );
});

const VirtualizedResultGridItem = memo(({ 
  result, 
  index,
  onSelectionChange, 
  onItemClick,
  copyToClipboard, 
  onFindSimilar,
  showScores = SEARCH_DEFAULTS.showScores,
  gridSize = SEARCH_DEFAULTS.gridSize,
  searchQuery = "",
  getHeaders,
  apiUrl,
  isSelected = false,
  isMultiSelectMode = false,
  failedReason = null,
  onRetryFailed,
}) => {
  const { t } = useTranslation();
  const baseKey = result.source?.base_key || result.source?.url || result.id;
  const filename = baseKey?.split('/').pop() || 'Unknown';

  // V2 Q1-A: 识别 tag 命中
  const isTagHit = useMemo(() => {
    const explanations = result.metadata?.explanations || [];
    return explanations.some(exp =>
      Array.isArray(exp?.matched_terms) &&
      exp.matched_terms.some(term => typeof term === 'string' && term.includes('tags.tag'))
    );
  }, [result.metadata?.explanations]);

  const handleToggleSelect = useCallback((e) => {
    onSelectionChange?.(result, e, index);
  }, [onSelectionChange, result, index]);

  const handleViewDetails = useCallback(() => {
    onItemClick?.(result);
  }, [onItemClick, result]);

  const handleCopy = useCallback((e) => {
    e.stopPropagation();
    copyToClipboard?.(baseKey);
  }, [copyToClipboard, baseKey]);

  const handleFindSimilar = useCallback((e) => {
    e.stopPropagation();
    onFindSimilar?.(baseKey);
  }, [onFindSimilar, baseKey]);

  // NEW CARD INTERACTION: 单击=选中 / 双击=详情（B 方案 + 220ms 双击窗口）
  const clickHandlers = useClickOrDoubleClick({
    onClick: (e) => onSelectionChange?.(result, e, index),
    onDoubleClick: () => onItemClick?.(result),
    enabled: FEATURE_FLAGS.NEW_CARD_INTERACTION,
  });
  // 兼容旧逻辑：非新交互时仍走原 onClick 路径
  const handleCardClick = useCallback((e) => {
    if (!FEATURE_FLAGS.NEW_CARD_INTERACTION) {
      onSelectionChange?.(result, e, index);
    }
  }, [onSelectionChange, result, index]);

  // Tooltip text based on mode
  const cardTooltip = FEATURE_FLAGS.NEW_CARD_INTERACTION
    ? t('clickOrDoubleClickHint')
    : '';

  // Border color: subtle hint in multi-select mode for unselected cards
  const defaultBorderColor = isMultiSelectMode && !isSelected
    ? "rgba(255, 210, 48, 0.15)"
    : "rgba(255, 255, 255, 0.05)";

  return (
    <Tooltip label={cardTooltip} openDelay={600} placement="top" isDisabled={!cardTooltip} hasArrow>
    <Card 
      bg={isSelected ? "#2a2b1e" : "rgba(255, 255, 255, 0.05)"} 
      borderColor={isSelected ? "#FFD230" : defaultBorderColor} 
      borderWidth="1px"
      boxShadow={isTagHit && !isSelected ? "0 0 16px rgba(255, 210, 48, 0.25)" : undefined}
      _hover={{
        borderColor: "#FFD230",
        shadow: isTagHit && !isSelected
          ? "0 6px 24px rgba(255,210,48,0.4)"
          : "0 6px 20px rgba(255,210,48,0.12)",
      }}
      transition="border-color 0.1s linear, box-shadow 0.1s linear, background 0.1s linear"
      cursor="pointer"
      onClick={FEATURE_FLAGS.NEW_CARD_INTERACTION ? clickHandlers.onClick : handleCardClick}
      onDoubleClick={FEATURE_FLAGS.NEW_CARD_INTERACTION ? clickHandlers.onDoubleClick : undefined}
      onMouseDown={FEATURE_FLAGS.NEW_CARD_INTERACTION ? clickHandlers.onMouseDown : undefined}
      onMouseMove={FEATURE_FLAGS.NEW_CARD_INTERACTION ? clickHandlers.onMouseMove : undefined}
      h="100%"
      borderRadius="12px"
      overflow="hidden"
      position="relative"
    >
      {/* V2 Q1-A: 命中角标（已去除：与 checkbox 打勾视觉冲突） */}
      {/* {isTagHit && <TaggedBadge size={gridSize === 'S' ? 'sm' : 'md'} />} */}
      {/* V2 U1: 失败角标 */}
      {failedReason && (
        <FailedBadge reason={failedReason} onRetry={() => onRetryFailed?.(result)} />
      )}
      {/* NEW CARD INTERACTION: Checkbox (hover to show / always show in multi-select) */}
      {FEATURE_FLAGS.NEW_CARD_INTERACTION ? (
        <CardSelectCheckbox
          isSelected={isSelected}
          isMultiSelectMode={isMultiSelectMode}
          onToggle={handleToggleSelect}
        />
      ) : (
        /* Legacy: Selection indicator */
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
      <CardBody px="12px" py="8px">
        <VStack spacing={gridSize === "S" ? 2 : 2} align="stretch" h="100%">
          {/* === Fab-style image with hover overlay === */}
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
            {/* Bottom-left badges on hover */}
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
                {result.source?.tags?.[0] && (
                  <Badge
                    bg="rgba(48, 48, 52, 0.7)"
                    backdropFilter="blur(50px)"
                    color="white"
                    borderRadius="9999px"
                    px={3}
                    py="2px"
                    fontSize="12px"
                    fontWeight="400"
                    h="24px"
                    display="flex"
                    alignItems="center"
                  >
                    {typeof result.source.tags[0] === 'string' ? result.source.tags[0] : (result.source.tags[0].tag || result.source.tags[0].value || '')}
                  </Badge>
                )}
              </HStack>
            )}
          </Box>

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
            </HStack>

            {/* Author row — aligned with HybridSearchResults */}
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

            {gridSize !== "S" && (
              <QueryMatchBadges explanations={result.metadata?.explanations} showScores={showScores} />
            )}

            <VStack spacing={1} align={gridSize === "S" ? "end" : "stretch"} fontSize="2xs" color="gray.300" flex={1}>
              {result.source?.size && (
                <Text textAlign={gridSize === "S" ? "right" : "left"}>{t('size')} {formatFileSize(result.source.size)}</Text>
              )}
              {gridSize !== "S" && result.source?.modified_timestamp && (
                <Text>{t('modified')} {new Date(result.source.modified_timestamp).toLocaleDateString()}</Text>
              )}
            </VStack>

            <HStack justify={gridSize === "S" ? "center" : "space-between"} pt={gridSize === "S" ? 1 : 2}>
              {gridSize === "S" ? (
                FEATURE_FLAGS.NEW_CARD_INTERACTION ? (
                  /* NEW: S size - only copy + find similar */
                  <HStack spacing={1}>
                    {copyToClipboard && (
                      <Tooltip label={t('copyUrl')}>
                        <IconButton
                          size="xs"
                          variant="ghost"
                          icon={<CopyIcon />}
                          onClick={handleCopy}
                          aria-label={t('copyUrl')}
                        />
                      </Tooltip>
                    )}
                    <Tooltip label={t('findSimilarAssets')}>
                      <IconButton
                        size="xs"
                        variant="ghost"
                        icon={<SearchIcon />}
                        onClick={handleFindSimilar}
                        aria-label={t('findSimilarAssets')}
                        colorScheme="purple"
                      />
                    </Tooltip>
                  </HStack>
                ) : (
                  /* Legacy: S size - view details button */
                  <Tooltip label={t('viewDetails')}>
                    <IconButton
                      size="xs"
                      variant="ghost"
                      icon={<ExternalLinkIcon />}
                      onClick={handleViewDetails}
                      aria-label={t('viewDetails')}
                    />
                  </Tooltip>
                )
              ) : (
                <>
                  <HStack spacing={1}>
                    {copyToClipboard && (
                      <Tooltip label={t('copyUrl')}>
                        <IconButton
                          size="xs"
                          variant="ghost"
                          icon={<CopyIcon />}
                          onClick={handleCopy}
                          aria-label={t('copyUrl')}
                        />
                      </Tooltip>
                    )}
                    <Tooltip label={t('findSimilarAssets')}>
                      <IconButton
                        size="xs"
                        variant="ghost"
                        icon={<SearchIcon />}
                        onClick={handleFindSimilar}
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
                        onClick={handleViewDetails}
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

const VirtualizedResultListItem = memo(({ 
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
  getHeaders,
  apiUrl,
  isSelected = false,
  isMultiSelectMode = false,
  failedReason = null,
  onRetryFailed,
}) => {
  const { t } = useTranslation();
  const { isOpen, onToggle } = useDisclosure();
  
  const allMatchedTerms = useMemo(() => {
    return result.metadata?.explanations?.flatMap(exp => exp.matched_terms || []) || [];
  }, [result.metadata?.explanations]);

  // V2 Q1-A: tag 命中识别
  const isTagHit = useMemo(() => {
    const explanations = result.metadata?.explanations || [];
    return explanations.some(exp =>
      Array.isArray(exp?.matched_terms) &&
      exp.matched_terms.some(term => typeof term === 'string' && term.includes('tags.tag'))
    );
  }, [result.metadata?.explanations]);
  
  const baseKey = result.source?.base_key || result.source?.url || result.id;
  const filename = baseKey?.split('/').pop() || 'Unknown';

  const handleToggleSelect = useCallback((e) => {
    onSelectionChange?.(result, e, index);
  }, [onSelectionChange, result, index]);

  const handleViewDetails = useCallback(() => {
    onItemClick?.(result);
  }, [onItemClick, result]);

  const handleCopy = useCallback((e) => {
    e.stopPropagation();
    copyToClipboard?.(baseKey);
  }, [copyToClipboard, baseKey]);

  const handleFindSimilar = useCallback((e) => {
    e.stopPropagation();
    onFindSimilar?.(baseKey);
  }, [onFindSimilar, baseKey]);

  const handleToggle = useCallback((e) => {
    e.stopPropagation();
    onToggle();
  }, [onToggle]);

  // NEW CARD INTERACTION: 单击=选中 / 双击=详情（B 方案 + 220ms 双击窗口）
  const clickHandlers = useClickOrDoubleClick({
    onClick: (e) => onSelectionChange?.(result, e, index),
    onDoubleClick: () => onItemClick?.(result),
    enabled: FEATURE_FLAGS.NEW_CARD_INTERACTION,
  });
  const handleCardClick = useCallback((e) => {
    if (!FEATURE_FLAGS.NEW_CARD_INTERACTION) {
      onSelectionChange?.(result, e, index);
    }
  }, [onSelectionChange, result, index]);

  // Tooltip text based on mode
  const cardTooltip = FEATURE_FLAGS.NEW_CARD_INTERACTION
    ? t('clickOrDoubleClickHint')
    : '';

  const defaultBorderColor = isMultiSelectMode && !isSelected
    ? "rgba(255, 210, 48, 0.15)"
    : "rgba(255, 255, 255, 0.05)";

  return (
    <Tooltip label={cardTooltip} openDelay={600} placement="top" isDisabled={!cardTooltip} hasArrow>
    <Card 
      bg={isSelected ? "#2a2b1e" : "rgba(255, 255, 255, 0.05)"} 
      borderColor={isSelected ? "#FFD230" : defaultBorderColor} 
      borderWidth="1px"
      boxShadow={isTagHit && !isSelected ? "0 0 16px rgba(255, 210, 48, 0.25)" : undefined}
      _hover={{
        borderColor: "#FFD230",
        shadow: isTagHit && !isSelected
          ? "0 0 24px rgba(255,210,48,0.4)"
          : "0 0 20px rgba(255,210,48,0.08)",
      }}
      transition="all 0.25s"
      cursor="pointer"
      onClick={FEATURE_FLAGS.NEW_CARD_INTERACTION ? clickHandlers.onClick : handleCardClick}
      onDoubleClick={FEATURE_FLAGS.NEW_CARD_INTERACTION ? clickHandlers.onDoubleClick : undefined}
      onMouseDown={FEATURE_FLAGS.NEW_CARD_INTERACTION ? clickHandlers.onMouseDown : undefined}
      onMouseMove={FEATURE_FLAGS.NEW_CARD_INTERACTION ? clickHandlers.onMouseMove : undefined}
      borderRadius="12px"
      position="relative"
    >
      {/* V2 Q1-A: 命中角标（已去除） */}
      {/* {isTagHit && <TaggedBadge size="sm" />} */}
      {/* V2 U1: 失败角标 */}
      {failedReason && (
        <FailedBadge reason={failedReason} onRetry={() => onRetryFailed?.(result)} />
      )}
      {/* NEW CARD INTERACTION: Checkbox */}
      {FEATURE_FLAGS.NEW_CARD_INTERACTION ? (
        <CardSelectCheckbox
          isSelected={isSelected}
          isMultiSelectMode={isMultiSelectMode}
          onToggle={handleToggleSelect}
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

          <GridItem>
            <VStack spacing={3} align="stretch">
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
                        Score: {result.score.toFixed(3)}
                      </Badge>
                      <Badge colorScheme="blue" size="sm">
                        RRF: {result.rrf_score.toFixed(3)}
                      </Badge>
                      {result.metadata?.rrf_rank && (
                        <Badge colorScheme="yellow" size="sm">
                          Rank #{result.metadata.rrf_rank}
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
                        onClick={handleCopy}
                        aria-label={t('copyUrl')}
                      />
                    </Tooltip>
                  )}
                  <Tooltip label={t('findSimilarAssets')}>
                    <IconButton
                      size="sm"
                      variant="ghost"
                      icon={<SearchIcon />}
                      onClick={handleFindSimilar}
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
                        onClick={handleViewDetails}
                        aria-label={t('viewDetails')}
                      />
                    </Tooltip>
                  )}
                </HStack>
              </HStack>

              <QueryMatchBadges explanations={result.metadata?.explanations} showScores={showScores} />
              <SmartHighlightedContent result={result} searchQuery={searchQuery} />

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

          <GridItem>
            <VStack>
              <IconButton
                size="sm"
                variant="ghost"
                icon={isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
                onClick={handleToggle}
                aria-label="Toggle explanations"
              />
              <Text fontSize="xs" color="gray.300" textAlign="center">
                {t('whyThisMatched')}
              </Text>
            </VStack>
          </GridItem>
        </Grid>

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

const VirtualizedHybridSearchResults = ({ 
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
  onCopySelectedUrls,
  onBatchSelection,
  isMultiSelectMode = false,
  // V2 U1: 批量失败持久化
  failedBatchItems = null,
  onRetryFailed,
  // 空白处单击（无拖拽）触发：通常用于退出多选；由父级传入 clearSelection
  onEmptyAreaClick,
  // === LM CUSTOMIZATION: InfiniteScroll START ===
  // 原因：实现需求 D-1 双层无限滚动 — IntersectionObserver 滚到底自动调
  // onAutoLoadMore （增 userLimit 客户端切片、无网络请求）；当客户端耗尽
  // 且 isResultShortage 为真时，显示 ghost 小按钮供用户点击触发后端二次搜索。
  // 合入上游新版时：本块仅是 props 追加与参数透传，与 NVIDIA 原代码路径不交叉，
  // 合并冲突概率低。若冲突保留本块、手工补入 NVIDIA 新增的其它 props 即可。
  hasMore = false,                  // 是否还有更多可加载（客户端 OR 后端任一付答）
  isLoadingMore = false,            // 后端二次搜索进行中
  loadMoreError = null,             // 加载错误（字符串或 Error）
  isResultShortage = false,         // 客户端 filtered 不够 userLimit（起后端二次搜索按钮）
  onAutoLoadMore,                   // 第 1 层：增 userLimit、客户端切片，无网络请求
  onTriggerBackendLoadMore,         // 第 2 层：触发更大 limit 的后端二次搜索
  onRetryLoadMore,                  // 加载出错后的重试回调
  // 向父级上抛内部 useDragSelect 的 isDragging，供父级 polyfill hook 使用
  onDragStateChange,
  // === LM CUSTOMIZATION: InfiniteScroll END ===
}) => {
  const { t } = useTranslation();

  // === Drag select refs & hooks (must be before any early return) ===
  const scrollContainerRef = useRef(null);
  const getItemId = useCallback((item) => {
    return item?.id || item?.source?.base_key || item?.source?.url;
  }, []);

  const handleDragSelectionChange = useCallback((newSelectedIds) => {
    if (onBatchSelection) {
      onBatchSelection(newSelectedIds);
    }
  }, [onBatchSelection]);

  // 仅在多选模式下响应空白点击退出，避免无意义触发
  const handleEmptyClick = useCallback(() => {
    if (isMultiSelectMode && onEmptyAreaClick) {
      onEmptyAreaClick();
    }
  }, [isMultiSelectMode, onEmptyAreaClick]);

  const { isDragging, selectionRect } = useDragSelect({
    containerRef: scrollContainerRef,
    items: results,
    getItemId,
    onSelectionChange: handleDragSelectionChange,
    baseSelection: selectedItems,
    enabled: FEATURE_FLAGS.NEW_CARD_INTERACTION,
    onEmptyClick: handleEmptyClick,
  });

  // === LM CUSTOMIZATION: InfiniteScroll START ===
  // 原因：上抛 isDragging 到父级供 polyfill hook 消费（需求 D-2－补充浏览器前缀 + cursor）。
  // 不重复计算 isDragging、不修改 A 的 useDragSelect，仅做单向出口。
  // 合入上游时：本 useEffect 独立与 NVIDIA 原代码不交叉。
  useEffect(() => {
    if (typeof onDragStateChange === 'function') {
      onDragStateChange(isDragging);
    }
  }, [isDragging, onDragStateChange]);

  // 原因：sentinel + IntersectionObserver 实现滚到底自动加载下一页（需求 D-1.1/1.4）。
  // root 选 scrollContainerRef.current（VirtualizedResults 暴露的滚动容器），rootMargin
  // 600px 提前预加载；isLoadingMore guard 防重复触发；hasMore=false 后 disconnect。
  const sentinelRef = useRef(null);
  // 用 ref 持有最新 callback 与状态，避免 effect 重装导致 observer 重复创建
  const onAutoLoadMoreRef = useRef(onAutoLoadMore);
  const isLoadingMoreRef = useRef(isLoadingMore);
  const hasMoreRef = useRef(hasMore);
  useEffect(() => { onAutoLoadMoreRef.current = onAutoLoadMore; }, [onAutoLoadMore]);
  useEffect(() => { isLoadingMoreRef.current = isLoadingMore; }, [isLoadingMore]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollContainerRef.current;
    if (!sentinel) return undefined;
    // 注：root=null 时 IntersectionObserver 退化为 viewport，仍可用；不阻断创建。
    if (!hasMore) return undefined; // 到底了就不起 observer
    if (typeof onAutoLoadMoreRef.current !== 'function') return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry || !entry.isIntersecting) return;
        if (isLoadingMoreRef.current) return;     // 加载中，忽略
        if (!hasMoreRef.current) return;          // 到底，忽略
        try {
          onAutoLoadMoreRef.current();
        } catch (e) {
          // 静默：制资人上报错误交由父级 loadMoreError 处理
          // eslint-disable-next-line no-console
          console.warn('[InfiniteScroll] auto load more failed:', e);
        }
      },
      {
        root: root || null,
        // 提前 600px 预加载，避免用户看到 spinner 的空白帧
        rootMargin: '0px 0px 600px 0px',
        threshold: 0,
      }
    );
    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [hasMore]); // hasMore 改变时重装跟随状态变化
  // === LM CUSTOMIZATION: InfiniteScroll END ===

  // Calculate score range for normalization
  const { maxScore, minScore } = useMemo(() => {
    if (results.length === 0) return { maxScore: 1, minScore: 0 };
    const scores = results.map(r => r.score);
    return {
      maxScore: Math.max(...scores),
      minScore: Math.min(...scores)
    };
  }, [results]);

  // Grid item renderer
  const renderGridItem = useCallback((result, index) => {
    const assetUrl = result.source?.url || result.source?.base_key || result.id;
    const failedEntry = failedBatchItems?.get?.(assetUrl);
    return (
    <VirtualizedResultGridItem
      result={result}
      index={index}
      onSelectionChange={onSelectionChange}
      onItemClick={onItemClick}
      copyToClipboard={copyToClipboard}
      onFindSimilar={onFindSimilar}
      showScores={showScores}
      gridSize={gridSize}
      searchQuery={searchQuery}
      getHeaders={getHeaders}
      apiUrl={apiUrl}
      isSelected={selectedItems ? selectedItems.has(result.id || result.source?.base_key || result.source?.url) : false}
      isMultiSelectMode={isMultiSelectMode}
      failedReason={failedEntry?.reason || null}
      onRetryFailed={onRetryFailed}
    />
    );
  }, [onSelectionChange, onItemClick, copyToClipboard, onFindSimilar, showScores, gridSize, searchQuery, getHeaders, apiUrl, selectedItems, isMultiSelectMode, failedBatchItems, onRetryFailed]);

  // List item renderer
  const renderListItem = useCallback((result, index) => {
    const assetUrl = result.source?.url || result.source?.base_key || result.id;
    const failedEntry = failedBatchItems?.get?.(assetUrl);
    return (
    <VirtualizedResultListItem
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
      getHeaders={getHeaders}
      apiUrl={apiUrl}
      isSelected={selectedItems ? selectedItems.has(result.id || result.source?.base_key || result.source?.url) : false}
      isMultiSelectMode={isMultiSelectMode}
      failedReason={failedEntry?.reason || null}
      onRetryFailed={onRetryFailed}
    />
    );
  }, [onSelectionChange, onItemClick, copyToClipboard, onFindSimilar, showScores, maxScore, minScore, searchQuery, getHeaders, apiUrl, selectedItems, isMultiSelectMode, failedBatchItems, onRetryFailed]);

  const handleCopyAllUrls = useCallback(() => {
    const allUrls = results.map((result) => 
      result.source?.base_key || result.source?.url || result.id
    ).filter(Boolean).join("\n");
    copyToClipboard?.(allUrls);
  }, [results, copyToClipboard]);

  if (isLoading) {
    return (
      <Box textAlign="center" py={8}>
        <CircularProgress isIndeterminate color="#FFD230" />
        <Text mt={4} color="gray.300">{t('searching')}</Text>
      </Box>
    );
  }

  if (isEmpty || results.length === 0) {
    return <EmptySearchHint searchQuery={searchQuery} />;
  }

  return (
    <VStack
      spacing={2}
      align="stretch"
      flex={1}
      minH={0}
      overflow="hidden"
      // === LM CUSTOMIZATION: NoTextSelection START ===
      // 原因（2026-05-15 用户反馈）：A 的 useDragSelect 仅在 mousedown→drag 路径上设 userSelect:none，
      // 但浏览器原生 Range Selection（Shift+click 跨范围选中）不经过此路径——
      // 用户先点一张卡片，再 Shift+click 另一张时，浏览器会把两点之间的所有可选文本刷成黄色选区。
      // 解决方案：在结果区根容器永久禁用文本选区。
      //   - 卡片标题 / 文件名 / 路径 / 大小 等"可读但不可框选"
      //   - 用户复制需求由 [📋复制] 按钮承担（已存在 CopyIcon 按钮）
      //   - Modal 内文本独立于本容器，不受影响
      //   - 兼容 Firefox MozUserSelect / IE Legacy msUserSelect 前缀
      // [Round 8 增强 — 2026-05-21] 跨卡片 Shift+click 残余金色防御
      //   data-results-root 让 index.css 的 [data-results-root] ::selection { transparent }
      //   覆盖整个结果区（含卡片之间的 VStack/Grid 间隙节点），消除"间隙金色"的视觉残留。
      //   主修复在 useDragSelect.js 的 mousedown 阶段拦 Shift+click 清 Range（治本），
      //   本属性是视觉兜底（防御纵深）。
      // 合入上游新版时：保留本块；如上游 VStack 引入新 props，与本块 sx 合并即可。
      data-results-root="true"
      userSelect="none"
      sx={{
        WebkitUserSelect: 'none',
        MozUserSelect: 'none',
        msUserSelect: 'none',
      }}
      // === LM CUSTOMIZATION: NoTextSelection END ===
    >
      {/* === v5: TitleBar + 结果计数已移入 FabToolbar 合并行，此处不再独立渲染 === */}

      {/* Virtualized Results with drag select */}
      <Box position="relative" flex={1} minH={0}>
        <VirtualizedResults
          items={results}
          renderItem={viewMode === "grid" ? renderGridItem : renderListItem}
          // List 视图卡片实际高度 ≈ 150（缩略图）+ 32（CardBody p=4 上下各 16）+ 2（border）≈ 184。
          // 原值 250 留了 ~66px 空白 slot，每条都多出一大块空档，资产越多越夸张。
          // 与 gap=16 组合后单 slot=200，刚好贴合卡片且行间留出微呼吸。
          itemHeight={viewMode === "grid" ? (gridSize === "S" ? 200 : 320) : 184}
          containerHeight="100%"
          overscan={5}
          gridMode={viewMode === "grid"}
          itemWidth={gridSize === "S" ? 140 : 280}
          gap={viewMode === "grid" ? (gridSize === "S" ? 8 : 16) : 16}
          scrollContainerRef={scrollContainerRef}
          style={{ userSelect: isDragging ? 'none' : 'auto' }}
        />
        {/* Drag selection rectangle overlay */}
        {isDragging && selectionRect && (
          <Box
            position="fixed"
            left={`${selectionRect.x}px`}
            top={`${selectionRect.y}px`}
            width={`${selectionRect.width}px`}
            height={`${selectionRect.height}px`}
            bg="rgba(255, 210, 48, 0.08)"
            border="1px solid rgba(255, 210, 48, 0.4)"
            borderRadius="4px"
            pointerEvents="none"
            zIndex={9999}
          />
        )}
      </Box>
      {/* === LM CUSTOMIZATION: InfiniteScroll START === */}
      {/* sentinel + 状态条件 UI（需求 D-1）：
          — 加载中 → Spinner + "加载中..."
          — isResultShortage 且 hasMore → ghost 小按钮"加载更多"触发后端二次搜索
          — 错误 → 红色提示 + 重试按钮
          — !hasMore → "已经到底了"终态文案
          sentinel 始终渲染在最外层 VStack 末尾（不受 isLoading / isEmpty 控制），
          函数顶部的“isLoading return null / isEmpty return EmptySearchHint”已经在上游 early return。 */}
      <Box ref={sentinelRef} h="1px" data-infinite-sentinel aria-hidden="true" />
      <Box minH="32px" pt={2} pb={4} display="flex" alignItems="center" justifyContent="center">
        {isLoadingMore && (
          <HStack spacing={2} fontSize="xs" color="whiteAlpha.700">
            <Spinner size="xs" color="#FFD230" thickness="2px" speed="0.6s" />
            <Text>{t('infiniteLoading') || t('loading') || '加载中...'}</Text>
          </HStack>
        )}
        {!isLoadingMore && loadMoreError && (
          <HStack spacing={2} fontSize="xs">
            <Text color="red.300">
              {t('infiniteError') || '加载失败'}
            </Text>
            {typeof onRetryLoadMore === 'function' && (
              <Button
                size="xs"
                variant="ghost"
                color="#FFD230"
                _hover={{ bg: 'whiteAlpha.100' }}
                onClick={onRetryLoadMore}
                aria-label={t('infiniteRetry') || '重试'}
              >
                {t('infiniteRetry') || '重试'}
              </Button>
            )}
          </HStack>
        )}
        {!isLoadingMore && !loadMoreError && hasMore && isResultShortage
          && typeof onTriggerBackendLoadMore === 'function' && (
          <Button
            size="xs"
            variant="ghost"
            color="whiteAlpha.700"
            _hover={{ bg: 'whiteAlpha.100', color: '#FFD230' }}
            onClick={onTriggerBackendLoadMore}
            aria-label={t('infiniteLoadMore') || '加载更多'}
          >
            {t('infiniteLoadMore') || '加载更多'}
          </Button>
        )}
        {!isLoadingMore && !loadMoreError && !hasMore && results.length > 0 && (
          <Text fontSize="xs" color="whiteAlpha.500" letterSpacing="0.02em">
            {t('infiniteNoMore') || '已经到底了'}
          </Text>
        )}
      </Box>
      {/* === LM CUSTOMIZATION: InfiniteScroll END === */}
    </VStack>
  );
};

export default VirtualizedHybridSearchResults;
