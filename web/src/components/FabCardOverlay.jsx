// === LM CUSTOMIZATION: Fab card hover overlay (category Badge + engine icons) ===
// 对齐 Fab 实测规格（docs/Fab改造/扒取产出/fab-card-structure.json）
// - 缩略图区 hover 时左下角显示：分类 Badge（毛玻璃胶囊）+ 引擎兼容性图标
// - 整图 10% 白色 overlay
// - 不改动 HybridSearchResults.jsx

import React, { memo } from 'react';
import { useTranslation } from '../i18n/LanguageContext';
import './FabCardOverlay.css';

// --- SVG 引擎图标 ---
const IconUnrealEngine = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18.5c-4.69 0-8.5-3.81-8.5-8.5S7.31 3.5 12 3.5s8.5 3.81 8.5 8.5-3.81 8.5-8.5 8.5zm-1.5-4.5l2-2.5V8.5l-3 3v4l1 .5zm4-1l-2 2.5 1 .5 3-3v-4l-1-.5-1 1v3.5z" />
  </svg>
);

const IconUnity = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
    <path d="M10.4 12l4.6-8h-4L7.8 10H3.2l2-4H2L0 12l2 6h3.2l-2-4h4.6l3.2 6h4l-4.6-8z" transform="translate(3 0)" />
  </svg>
);

// TODO: 后续添加更多引擎图标（3ds Max 等）
const ENGINE_ICON_MAP = {
  'unreal-engine': IconUnrealEngine,
  'unity': IconUnity,
};

/**
 * FabCardOverlay — 叠加在卡片缩略图区域上方的 hover 浮层
 *
 * Props:
 *   categoryTag {string|null} - 分类标签文本（如"3D"/"游戏系统"）
 *   engineIcons {string[]}    - 引擎兼容性列表，如 ['unreal-engine','unity']
 *   title      {string}       - 资产标题（用于 aria-label）
 *
 * Fab 实测行为：hover 时左下角出现毛玻璃 Badge，整图白色 overlay opacity 0→0.1
 */
const FabCardOverlay = memo(({ categoryTag, engineIcons = [], title = '' }) => {
  const { t } = useTranslation();

  // TODO: engineIcons 后端暂无对应字段，当前始终为空数组，保留占位
  const hasEngines = engineIcons.length > 0;
  // TODO: categoryTag 可从 result.source.tags?.[0] 或文件扩展名推断
  const hasCategory = !!categoryTag;

  return (
    <div className="fab-card-overlay-root" aria-hidden="true">
      {/* 白色半透明 overlay */}
      <div className="fab-card-overlay-bg" />

      {/* 左下角 Badge 区 */}
      <div className="fab-card-overlay-badges">
        {/* 分类 Badge */}
        {hasCategory ? (
          <span className="fab-card-badge fab-card-badge--category">
            {categoryTag}
          </span>
        ) : (
          /* TODO: 无分类数据时隐藏，后端接入后移除此分支 */
          null
        )}

        {/* 引擎兼容性图标 */}
        {hasEngines ? (
          <>
            <span className="fab-card-badge-spacer" aria-hidden="true" />
            <span className="fab-card-badge-engines">
              {engineIcons.map((engine) => {
                const Icon = ENGINE_ICON_MAP[engine];
                return (
                  <span
                    key={engine}
                    className="fab-card-badge fab-card-badge--engine"
                    aria-label={t('fabCardEngineFormat', { title, engine })}
                  >
                    {Icon ? <Icon /> : <span className="fab-card-badge-engine-text">{engine}</span>}
                  </span>
                );
              })}
            </span>
          </>
        ) : (
          /* TODO: 引擎兼容性后端暂无字段，占位不渲染，后续接入后启用 */
          null
        )}
      </div>
    </div>
  );
});

FabCardOverlay.displayName = 'FabCardOverlay';
export default FabCardOverlay;
