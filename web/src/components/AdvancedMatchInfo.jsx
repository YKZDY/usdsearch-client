/**
 * AdvancedMatchInfo - 详情抽屉"高级面板"内容
 *
 * 注入位置：<AssetDetailsDrawer advancedPanelContent={<AdvancedMatchInfo asset={...} />} />
 *
 * 展示内容：
 *   1. 匹配字段标签列表（HYBRID / TEXT / VECTOR 等 search_type + field + score + matched_terms）
 *   2. 总体分数（score / RRF score / RRF rank）
 *   3. embedding 模型信息（如可读）
 *   4. raw metadata 折叠区（JSON）
 *   5. 数据缺失时显示空状态
 *
 * 设计原则：纯展示组件，不发任何请求；用可选链消费 asset 字段，绝不假设字段存在。
 *
 * 新文件按 NVIDIA 合入安全规则不需要 LM CUSTOMIZATION 标记。
 */

import React, { memo, useMemo, useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Tag,
  TagLabel,
  Wrap,
  WrapItem,
  Divider,
  Button,
  Code,
  Collapse,
} from '@chakra-ui/react';
import { ChevronDownIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { brandColors, fabColors, fabRadius, fabSpacing } from '../theme/fabTokens';
import { useTranslation } from '../i18n/LanguageContext';

/** 把 search_type 映射到一个颜色 token（视觉区分不同检索路径） */
function searchTypeToToneToken(searchType) {
  // 不用 Chakra colorScheme（依赖主题色板），直接用 fabPalette 的语义令牌
  switch (searchType) {
    case 'hybrid':         return brandColors.primary;          // 金色
    case 'vector':
    case 'text_to_vector':
    case 'image_to_vector': return '#be3dff';                   // purple.200
    case 'text':            return '#26bbff';                   // blue.200
    case 'image_similarity': return '#fd6535';                  // orange.200
    case 'filter_only':     return fabColors.textSecondary;
    default:                return fabColors.textSecondary;
  }
}

const AdvancedMatchInfo = memo(function AdvancedMatchInfo({ asset }) {
  const { t } = useTranslation();
  const [rawOpen, setRawOpen] = useState(false);

  // ─── 整理 explanations ────────────────────────────────────
  const explanations = useMemo(() => {
    const exps = asset?.metadata?.explanations;
    if (!Array.isArray(exps)) return [];
    return [...exps].sort((a, b) => (b?.score ?? 0) - (a?.score ?? 0));
  }, [asset]);

  // 总分 / RRF 分数
  const score = asset?.score;
  const rrfScore = asset?.rrf_score;
  const rrfRank = asset?.metadata?.rrf_rank;

  // embedding 模型（兼容多种字段命名）
  const embeddingModel =
    asset?.metadata?.embedding_model ||
    asset?.source?.embedding_model ||
    asset?.embedding_model ||
    null;

  // raw metadata 字符串
  const rawJson = useMemo(() => {
    try {
      return JSON.stringify(asset, null, 2);
    } catch (_) {
      return '/* unable to stringify asset */';
    }
  }, [asset]);

  const isEmpty = explanations.length === 0
    && score == null
    && rrfScore == null
    && !embeddingModel;

  if (isEmpty) {
    return (
      <Box py={fabSpacing['3']}>
        <Text fontSize="xs" color={fabColors.textSecondary} textAlign="center">
          {t('advanced.empty')}
        </Text>
      </Box>
    );
  }

  return (
    <VStack spacing={fabSpacing['3']} align="stretch" py={fabSpacing['2']}>
      {/* ── 顶部得分摘要 ────────────────────────────────────── */}
      {(score != null || rrfScore != null || rrfRank != null) && (
        <HStack spacing={fabSpacing['3']} flexWrap="wrap">
          {score != null && (
            <HStack spacing={1}>
              <Text fontSize="2xs" color={fabColors.textSecondary} textTransform="uppercase" letterSpacing="0.6px">
                {t('advanced.score')}
              </Text>
              <Text fontSize="sm" color={brandColors.primary} fontWeight="700">
                {Number(score).toFixed(3)}
              </Text>
            </HStack>
          )}
          {rrfScore != null && (
            <HStack spacing={1}>
              <Text fontSize="2xs" color={fabColors.textSecondary} textTransform="uppercase" letterSpacing="0.6px">
                {t('advanced.rrfScore')}
              </Text>
              <Text fontSize="sm" color={fabColors.textPrimary} fontWeight="600">
                {Number(rrfScore).toFixed(3)}
              </Text>
            </HStack>
          )}
          {rrfRank != null && (
            <HStack spacing={1}>
              <Text fontSize="2xs" color={fabColors.textSecondary} textTransform="uppercase" letterSpacing="0.6px">
                RRF #
              </Text>
              <Text fontSize="sm" color={fabColors.textPrimary} fontWeight="600">
                {rrfRank}
              </Text>
            </HStack>
          )}
        </HStack>
      )}

      {/* ── 匹配字段列表 ────────────────────────────────────── */}
      {explanations.length > 0 && (
        <Box>
          <Text
            fontSize="2xs"
            color={fabColors.textSecondary}
            textTransform="uppercase"
            letterSpacing="0.6px"
            mb={fabSpacing['1.5']}
          >
            {t('advanced.matchedFields')}
          </Text>
          <VStack spacing={fabSpacing['1.5']} align="stretch">
            {explanations.map((exp, idx) => {
              const tone = searchTypeToToneToken(exp?.search_type);
              const matchedTerms = Array.isArray(exp?.matched_terms) ? exp.matched_terms : [];
              return (
                <Box
                  key={`${exp?.field || 'field'}-${exp?.search_type || 'type'}-${idx}`}
                  bg={fabColors.bgElevatedHigh}
                  borderRadius={fabRadius['1.5']}
                  borderWidth="1px"
                  borderColor={fabColors.borderSubdued}
                  p={fabSpacing['2']}
                >
                  <HStack justify="space-between" align="start" spacing={fabSpacing['2']} mb={1}>
                    <HStack spacing={fabSpacing['1.5']} flexWrap="wrap">
                      <Tag
                        size="sm"
                        bg={tone}
                        color={tone === brandColors.primary ? brandColors.onPrimary : '#fff'}
                        borderRadius={fabRadius.round}
                        fontWeight="700"
                        fontSize="10px"
                        textTransform="uppercase"
                        letterSpacing="0.6px"
                      >
                        <TagLabel>{(exp?.search_type || 'unknown').replace(/_/g, ' ')}</TagLabel>
                      </Tag>
                      {exp?.field && (
                        <Text fontSize="xs" color={fabColors.textSecondary} fontFamily="mono">
                          {exp.field}
                        </Text>
                      )}
                    </HStack>
                    {exp?.score != null && (
                      <Text fontSize="xs" color={tone} fontWeight="700">
                        {Number(exp.score).toFixed(3)}
                      </Text>
                    )}
                  </HStack>
                  {matchedTerms.length > 0 && (
                    <Box mt={1}>
                      <Text fontSize="2xs" color={fabColors.textSecondary} mb={0.5}>
                        {t('advanced.matchedTerms')}
                      </Text>
                      <Wrap spacing={fabSpacing['1']}>
                        {matchedTerms.slice(0, 12).map((term, i) => (
                          <WrapItem key={`${term}-${i}`}>
                            <Tag
                              size="sm"
                              bg="transparent"
                              color={fabColors.textPrimary}
                              borderColor={fabColors.borderSubtle}
                              borderWidth="1px"
                              borderRadius={fabRadius['1']}
                              fontSize="10px"
                              fontFamily="mono"
                            >
                              <TagLabel>{term}</TagLabel>
                            </Tag>
                          </WrapItem>
                        ))}
                        {matchedTerms.length > 12 && (
                          <WrapItem>
                            <Text fontSize="2xs" color={fabColors.textSecondary} alignSelf="center">
                              +{matchedTerms.length - 12}
                            </Text>
                          </WrapItem>
                        )}
                      </Wrap>
                    </Box>
                  )}
                  {exp?.vector_similarity != null && (
                    <HStack mt={1} justify="space-between">
                      <Text fontSize="2xs" color={fabColors.textSecondary}>
                        {t('advanced.vectorSimilarity')}
                      </Text>
                      <Text fontSize="2xs" color="#be3dff" fontWeight="600">
                        {(exp.vector_similarity * 100).toFixed(1)}%
                      </Text>
                    </HStack>
                  )}
                </Box>
              );
            })}
          </VStack>
        </Box>
      )}

      {/* ── embedding 模型 ─────────────────────────────────── */}
      {embeddingModel && (
        <HStack spacing={fabSpacing['2']}>
          <Text fontSize="2xs" color={fabColors.textSecondary} textTransform="uppercase" letterSpacing="0.6px">
            {t('advanced.embeddingModel')}
          </Text>
          <Text fontSize="xs" color={fabColors.textPrimary} fontFamily="mono" noOfLines={1}>
            {embeddingModel}
          </Text>
        </HStack>
      )}

      <Divider borderColor={fabColors.borderSubdued} />

      {/* ── raw metadata 折叠区 ────────────────────────────── */}
      <Box>
        <Button
          size="xs"
          variant="ghost"
          leftIcon={rawOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
          onClick={() => setRawOpen(v => !v)}
          aria-label={t('advanced.toggleRaw')}
          aria-expanded={rawOpen}
          color={fabColors.textSecondary}
          _hover={{ color: fabColors.textPrimary, bg: fabColors.fillTertiaryHover }}
          fontSize="xs"
          fontWeight="600"
          px={2}
        >
          {t('advanced.rawMetadata')}
        </Button>
        <Collapse in={rawOpen} animateOpacity>
          <Box
            mt={fabSpacing['1']}
            bg={fabColors.bgDefault}
            borderRadius={fabRadius['1.5']}
            borderWidth="1px"
            borderColor={fabColors.borderSubdued}
            p={fabSpacing['2']}
            maxH="280px"
            overflow="auto"
          >
            <Code
              as="pre"
              bg="transparent"
              color={fabColors.textPrimary}
              fontSize="2xs"
              fontFamily="mono"
              whiteSpace="pre"
              display="block"
            >
              {rawJson}
            </Code>
          </Box>
        </Collapse>
      </Box>
    </VStack>
  );
});

export default AdvancedMatchInfo;
