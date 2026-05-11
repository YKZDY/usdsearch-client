/**
 * ResultsTitleBar — 结果区顶部状态行（Toolbar Header 行）
 *
 * v6（2026-05-09）：升级为 toolbar 顶部 Header 行，一行内紧凑显示：
 *   - 搜索词 chip：『{committedQuery}』的结果 [✕]
 *   - 分类 chip：{categoryLabel} [✕]
 *   - 结果计数：有搜索时「找到 N 个结果」/ 无搜索时「共 N 个资产」
 *   - 可选分数区间：(min – max)（受 showScores 控制，由父组件计算后传 scoreRange）
 *
 * 渲染规则：
 *   - imageSearchActive → return null（图片搜索专用流程，不展示此行）
 *   - 其他情况永远渲染，至少显示计数，保证 Header 行高稳定不抖
 *
 * 对齐：align-items: baseline，让不同字号的文字以底线对齐（Apple/Stripe 做法）
 * 溢出：整行 nowrap；query 文本段 max-width: 300px + ellipsis；计数 flex-shrink: 0 永远可见
 *
 * 纯受控组件，零本地 state；memo 包裹以避免父组件级联重渲染。
 */
import React, { memo, useCallback } from 'react';
import AnimatedCount from './AnimatedCount';
import './ResultsTitleBar.css';

function RemoveButton({ ariaLabel, title, onClick }) {
  const handleClick = useCallback((e) => {
    e.stopPropagation();
    onClick?.();
  }, [onClick]);
  return (
    <button
      type="button"
      className="results-title-remove"
      aria-label={ariaLabel}
      title={title}
      onClick={handleClick}
    >
      <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
        <path
          d="M3 3 L9 9 M9 3 L3 9"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

function ResultsTitleBar({
  committedQuery = '',
  categoryTag = '',
  categoryLabel = '',
  onRemoveCategory,
  onRemoveQuery,
  imageSearchActive = false,
  t,
  // === v6 新增：计数与分数区间内嵌到 Header 行 ===
  resultCount = 0,
  scoreRange = null, // { min: number, max: number } | null
}) {
  const hasQuery = !!(committedQuery && committedQuery.trim());
  const hasCategory = !!(categoryTag && categoryTag.trim());
  const hasAnyTitle = hasQuery || hasCategory;

  // 图片搜索态：由 ImageSearchBar 自管 UI，不渲染此 Header 行
  if (imageSearchActive) {
    return null;
  }

  // i18n 模板
  const queryTemplate = t?.('resultsTitleFor') || '『{value}』的结果';
  const divider = t?.('resultsTitleCategoryDivider') || ' · ';
  const removeCategoryLabel = t?.('removeCategory') || 'Remove category';
  const removeSearchLabel = t?.('removeSearchQuery') || 'Remove search';

  // 把模板按 {value} 切开，给 query 单独套高亮 class
  const queryParts = hasQuery && typeof queryTemplate === 'string'
    ? queryTemplate.split('{value}')
    : null;

  // 计数文案：有搜索时用 resultsFound，空搜索时用 resultsTotalCount
  const countKey = hasAnyTitle ? 'resultsFound' : 'resultsTotalCount';
  const countFallback = hasAnyTitle ? '找到 {count} 个结果' : '共 {count} 个资产';
  const countRaw = t?.(countKey) || countFallback;
  const countParts = typeof countRaw === 'string' ? countRaw.split('{count}') : ['', ''];

  // 空态补偿：整行只剩计数时，计数字号稍放大
  const isCountOnly = !hasAnyTitle;

  return (
    <div
      className={`results-title-bar${isCountOnly ? ' results-title-bar--count-only' : ''}`}
      role="heading"
      aria-level="2"
    >
      {hasQuery && queryParts && (
        <span className="results-title-segment results-title-segment--query">
          <span className="results-title-quote">{queryParts[0]}</span>
          <span className="results-title-query">{committedQuery.trim()}</span>
          <span className="results-title-quote">{queryParts[1] ?? ''}</span>
          {onRemoveQuery && (
            <RemoveButton
              ariaLabel={removeSearchLabel}
              title={removeSearchLabel}
              onClick={onRemoveQuery}
            />
          )}
        </span>
      )}

      {hasQuery && hasCategory && (
        <span className="results-title-divider" aria-hidden="true">{divider}</span>
      )}

      {hasCategory && (
        <span className="results-title-segment results-title-segment--category">
          <span className="results-title-category">{categoryLabel || categoryTag}</span>
          {onRemoveCategory && (
            <RemoveButton
              ariaLabel={removeCategoryLabel}
              title={removeCategoryLabel}
              onClick={onRemoveCategory}
            />
          )}
        </span>
      )}

      {/* 有搜索条件时，计数前加分隔符 */}
      {hasAnyTitle && (
        <span className="results-title-divider" aria-hidden="true">{divider}</span>
      )}

      {/* 计数（永远显示，数字变化走 AnimatedCount 做 300ms 过渡） */}
      <span className="results-title-count">
        {countParts[0]}
        <span className="results-title-count-number">
          <AnimatedCount value={resultCount} />
        </span>
        {countParts[1] || ''}
      </span>

      {/* 可选分数区间 */}
      {scoreRange && typeof scoreRange.min === 'number' && typeof scoreRange.max === 'number' && (
        <span className="results-title-score-range">
          ({scoreRange.min.toFixed(3)} – {scoreRange.max.toFixed(3)})
        </span>
      )}
    </div>
  );
}

export default memo(ResultsTitleBar);
