/**
 * EmptySearchHint - 搜索 0 结果时的友好空状态（P10）
 *
 * 当用户搜索某关键词无结果时，提示"如果你最近刚打了这个 tag，
 * 可能仍在索引中（约 5-30 秒）"，并提供"立即重试"链接：
 *   1. flush 所有挂起的 reindex debounce 队列（让最近写入的 tag 立即触发 reindex）
 *   2. 然后 dispatch trigger-search 重新跑一次当前查询
 *
 * 仅当查询词长度 ≤ 10 字符时显示提示——避免误导长查询场景（这种通常是真没结果）。
 */

import React from 'react';
import { Box, Text } from '@chakra-ui/react';
import { useTranslation } from '../i18n/LanguageContext';
import { flushPending as flushPendingReindex } from '../services/reindexService';

const EmptySearchHint = ({ searchQuery = '' }) => {
  const { t } = useTranslation();

  const trimmed = (searchQuery || '').trim();
  const showTagHint = trimmed.length > 0 && trimmed.length <= 10;

  const handleRetry = () => {
    try { flushPendingReindex(); } catch (_) { /* noop */ }
    // 给 flush 一点点时间发出 reindex 请求，再重新搜索
    setTimeout(() => {
      window.dispatchEvent(new Event('trigger-search'));
    }, 100);
  };

  return (
    <Box textAlign="center" py={8}>
      <Text fontSize="md" color="gray.300">
        {t('noResultsMessage')}
      </Text>
      {showTagHint && (
        <Box mt={3} display="inline-flex" alignItems="center" gap={2}>
          <Text fontSize="12px" color="gray.500">
            {(() => {
              const v = t('noResultsRecentTagHint');
              return (v && v !== 'noResultsRecentTagHint') ? v : '如果你最近刚打了这个 tag，可能仍在索引中（约 5-30 秒）';
            })()}
          </Text>
          <Text
            as="span"
            fontSize="12px"
            color="yellow.300"
            cursor="pointer"
            textDecoration="underline"
            _hover={{ color: 'yellow.200' }}
            onClick={handleRetry}
          >
            {(() => {
              const v = t('retryNow');
              return (v && v !== 'retryNow') ? v : '立即重试';
            })()}
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default EmptySearchHint;
