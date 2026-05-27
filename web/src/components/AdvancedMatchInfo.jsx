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
import { fabColors, fabPalette, fabRadius, fabSpacing, fabTypo } from '../theme/fabTokens';
import { useTranslation } from '../i18n/LanguageContext';

/**
 * 把 search_type 映射到一个调色饱和的语义色（v1.1）。
 *
 * 设计考量：
 *   - hybrid 不再用 brandColors.primary（避免与“已打 tag 的金色”撞色），
 *     改用 fabColors.warningAlt（柔黄）作边框色。
 *   - vector 系从 purple[200]（饱和）改为 purple[300]（类似中柔紫）。
 *   - 其余保持较柔的语义色，最终在 chip 上只作为边框色出现，不再实心填充。
 */
function searchTypeToToneToken(searchType) {
  switch (searchType) {
    case 'hybrid':           return fabColors.warningAlt;        // 柔黄
    case 'vector':
    case 'text_to_vector':
    case 'image_to_vector':  return fabPalette.purple[300];      // 中柔紫
    case 'text':             return fabPalette.blue[200];
    case 'image_similarity': return fabPalette.orange[200];
    case 'filter_only':      return fabColors.textSecondary;
    default:                 return fabColors.textSecondary;
  }
}

/**
 * 小型 eyebrow 标题（10px / 700 / uppercase / 字距 1px）公用小组件
 */
const SectionLabel = memo(function SectionLabel({ children, mb = 0 }) {
  return (
    <Text
      fontSize={fabTypo.eyebrow.sm.size}
      lineHeight={fabTypo.eyebrow.sm.lineHeight}
      letterSpacing={fabTypo.eyebrow.sm.letterSpacing}
      fontWeight={fabTypo.eyebrow.sm.weight}
      color={fabColors.textSecondary}
      textTransform="uppercase"
      mb={mb}
    >
      {children}
    </Text>
  );
});
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
      {/* ── 顶部得分摘要 ───────────────────────── */}
      {/* v1.1.1：数值抬高到 sm(14px) 使“得分”作为主要信息可扫读 */}
      {(score != null || rrfScore != null || rrfRank != null) && (
        <HStack
          spacing={fabSpacing['2']}
          flexWrap="wrap"
          divider={<Divider orientation="vertical" h="16px" borderColor={fabColors.borderSubdued} />}
        >
          {score != null && (
            <HStack spacing={fabSpacing['1.5']}>
              <SectionLabel>{t('advanced.score')}</SectionLabel>
              <Text fontSize="sm" color={fabColors.textPrimary} fontWeight="600">
                {Number(score).toFixed(3)}
              </Text>
            </HStack>
          )}
          {rrfScore != null && (
            <HStack spacing={fabSpacing['1.5']}>
              <SectionLabel>{t('advanced.rrfScore')}</SectionLabel>
              <Text fontSize="sm" color={fabColors.textPrimary} fontWeight="600">
                {Number(rrfScore).toFixed(3)}
              </Text>
            </HStack>
          )}
          {rrfRank != null && (
            <HStack spacing={fabSpacing['1.5']}>
              <SectionLabel>RRF #</SectionLabel>
              <Text fontSize="sm" color={fabColors.textPrimary} fontWeight="600">
                {rrfRank}
              </Text>
            </HStack>
          )}
        </HStack>
      )}
      {/* ── 匹配字段列表 ───────────────────────── */}
      {explanations.length > 0 && (
        <Box>
          <SectionLabel mb={fabSpacing['1.5']}>
            {t('advanced.matchedFields')}
          </SectionLabel>
          {/* v1.1：字段卡片之间仅靠间距分隔，不再用边框 */}
          <VStack spacing={fabSpacing['1.5']} align="stretch">
            {explanations.map((exp, idx) => {
              const tone = searchTypeToToneToken(exp?.search_type);
              const matchedTerms = Array.isArray(exp?.matched_terms) ? exp.matched_terms : [];
              return (
                <Box
                  key={`${exp?.field || 'field'}-${exp?.search_type || 'type'}-${idx}`}
                  bg={fabColors.bgElevatedHigh}
                  borderRadius={fabRadius['1.5']}
                  // v1.1：取消 1px borderSubdued 外框，只靠背景色和间距分层
                  p={fabSpacing['2']}
                >
                  <HStack justify="space-between" align="start" spacing={fabSpacing['2']} mb={1}>
                    <HStack spacing={fabSpacing['1.5']} flexWrap="wrap">
                      {/* v1.1.1：search_type chip 字号抬到 eyebrow.md(12px)，高度足够避免 descender 裁切 */}
                      <Tag
                        size="sm"
                        bg="transparent"
                        color={tone}
                        borderColor={tone}
                        borderWidth="1px"
                        borderStyle="solid"
                        borderRadius={fabRadius.round}
                        fontWeight="700"
                        fontSize={fabTypo.eyebrow.md.size}
                        lineHeight="18px"
                        h="22px"
                        textTransform="uppercase"
                        letterSpacing={fabTypo.eyebrow.md.letterSpacing}
                      >
                        <TagLabel>{(exp?.search_type || 'unknown').replace(/_/g, ' ')}</TagLabel>
                      </Tag>
                      {exp?.field && (
                        // v1.1.1：字段名 2xs → xs，让用户能看清 hybrid / vector_0
                        <Text fontSize="xs" color={fabColors.textSecondary} fontFamily="mono">
                          {exp.field}
                        </Text>
                      )}
                    </HStack>
                    {exp?.score != null && (
                      // v1.1.1：右侧得分 xs → sm，与顶部摘要数值一致
                      <Text fontSize="sm" color={fabColors.textSecondary} fontWeight="600" fontFamily="mono">
                        {Number(exp.score).toFixed(3)}
                      </Text>
                    )}
                  </HStack>
                  {matchedTerms.length > 0 && (
                    <Box mt={fabSpacing['1.5']}>
                      {/* v1.1.1：“匹配词”标题 2xs → xs，与下方 chip 同字号 */}
                      <Text fontSize="xs" color={fabColors.textSecondary} mb={fabSpacing['1']}>
                        {t('advanced.matchedTerms')}
                      </Text>
                      <Wrap spacing={fabSpacing['1']}>
                        {matchedTerms.slice(0, 12).map((term, i) => (
                          <WrapItem key={`${term}-${i}`}>
                            {/* v1.1.1：匹配词 chip 字号 2xs → xs，高度也抬高避免 descender 裁切 */}
                            <Tag
                              size="sm"
                              bg="transparent"
                              color={fabColors.textSecondary}
                              borderColor={fabColors.borderSubtle}
                              borderWidth="1px"
                              borderRadius={fabRadius['1']}
                              fontSize="xs"
                              fontFamily="mono"
                              lineHeight="18px"
                              h="22px"
                              px={fabSpacing['1.5']}
                            >
                              <TagLabel>{term}</TagLabel>
                            </Tag>
                          </WrapItem>
                        ))}
                        {matchedTerms.length > 12 && (
                          <WrapItem>
                            <Text fontSize="xs" color={fabColors.textSecondary} alignSelf="center">
                              +{matchedTerms.length - 12}
                            </Text>
                          </WrapItem>
                        )}
                      </Wrap>
                    </Box>
                  )}
                  {exp?.vector_similarity != null && (
                    <HStack mt={fabSpacing['1.5']} justify="space-between">
                      {/* v1.1.1：“向量相似度”文案 2xs → xs，% 数字同步抬到 sm */}
                      <Text fontSize="xs" color={fabColors.textSecondary}>
                        {t('advanced.vectorSimilarity')}
                      </Text>
                      <Text fontSize="sm" color={fabColors.textPrimary} fontWeight="600" fontFamily="mono">
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
      {/* ── embedding 模型 ─────────────────────── */}
      {embeddingModel && (
        <HStack spacing={fabSpacing['2']}>
          <SectionLabel>{t('advanced.embeddingModel')}</SectionLabel>
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
