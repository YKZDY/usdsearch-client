// === LM CUSTOMIZATION: Category Sidebar (Flat TreeView) ===
// 扁平化 TreeView 实现 — 对齐 Fab 实测规格（2026-04-29 第三阶段：Playwright 数据驱动像素级对齐）
//
// 设计要点：
//   1. DOM 不嵌套，所有层级 item 平铺在同一容器内（对齐 Fab fabkit-TreeView 结构）
//   2. 缩进由 --depth CSS 变量驱动，公式：8 + depth*24 + (叶子额外 +24)
//   3. 支持 3 级（depth 0/1/2），可无痛扩展
//   4. URL 参数驱动（?category=xxx），popstate 天然同步浏览器前进后退
//   5. [v3 解耦版] 分类选中仅作为"标签"追加到 selectedTags，不再触碰搜索框 q 参数（零联动）
//   6. 展开箭头 12x12 SVG + transform rotate(90deg) 过渡动画
//   7. 优惠/通道分组：可折叠（h2 > button[aria-expanded]），默认折叠，功能 Coming Soon
//   8. 产品类型始终显示（不依赖通道选择）

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from '../i18n/LanguageContext';
import { CATEGORIES, flattenCategories } from '../data/categories';
import { CategoryIcon } from './icons/CategoryIcons';
import './CategorySidebar.css';

/** Chevron-down 图标 — 对齐 Fab edsicon-chevron-down (16x16) */
function ChevronDown({ className }) {
  return (
    <svg className={className} viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 通道数据（对齐 Fab 2026-04-29 实测，功能 Coming Soon） */
const CHANNELS = [
  { id: 'unity', name: 'Unity' },
  { id: 'unreal-engine', name: 'Unreal Engine' },
  { id: 'uefn', name: 'UEFN' },
  { id: 'metahuman', name: 'MetaHuman' },
];

/** 优惠项图标 — 限时免费（时钟+免费标签） */
function IconFree({ className }) {
  return (
    <svg className={className} viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M10 6v4.5l3 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 优惠项图标 — 特价（百分号/折扣标签） */
function IconSale({ className }) {
  return (
    <svg className={className} viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
      <path d="M14.5 5.5l-9 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="7" cy="7" r="1.8" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="13" cy="13" r="1.8" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** 通道图标 — Unity */
function IconUnity({ className }) {
  return (
    <svg className={className} viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
      <path d="M10 2l7 4v8l-7 4-7-4V6l7-4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M10 10V2M10 10l7-4M10 10l-7-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** 通道图标 — Unreal Engine */
function IconUnreal({ className }) {
  return (
    <svg className={className} viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7 13V7l6 3-6 3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

/** 通道图标 — UEFN */
function IconUEFN({ className }) {
  return (
    <svg className={className} viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
      <rect x="3.5" y="3.5" width="13" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7 7h2.5v2.5H7zM10.5 7H13v2.5h-2.5zM7 10.5h2.5V13H7z" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

/** 通道图标 — MetaHuman */
function IconMetaHuman({ className }) {
  return (
    <svg className={className} viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
      <circle cx="10" cy="7.5" r="3" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 16.5c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** 通道 id → 图标映射 */
const CHANNEL_ICON_MAP = {
  'unity': IconUnity,
  'unreal-engine': IconUnreal,
  'uefn': IconUEFN,
  'metahuman': IconMetaHuman,
};

/** 从 CATEGORIES 树中根据 id 找出分类项，并返回它的祖先路径（用于展开恢复） */
function findCategoryPath(categories, targetId) {
  for (const g of categories) {
    if (g.id === targetId) return { item: g, ancestors: [] };
    for (const c of g.children || []) {
      if (c.id === targetId) return { item: c, ancestors: [g.id] };
      for (const gc of c.children || []) {
        if (gc.id === targetId) return { item: gc, ancestors: [g.id, c.id] };
      }
    }
  }
  return null;
}

function CategorySidebar({ collapsed, onToggle }) {
  const { language, t } = useTranslation();
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [selectedId, setSelectedId] = useState(null);

  // 优惠/通道分组的折叠状态（默认折叠，功能 Coming Soon）
  const [offersExpanded, setOffersExpanded] = useState(false);
  const [channelsExpanded, setChannelsExpanded] = useState(false);

  // 从 URL 恢复选中状态 + 展开祖先路径 + 推送 category-selected 给顶层（v4：让刷新后大标题/state 也能还原）
  const syncFromURL = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const categoryId = params.get('category');
    if (!categoryId) {
      setSelectedId(null);
      return;
    }
    const hit = findCategoryPath(CATEGORIES, categoryId);
    if (hit) {
      setSelectedId(categoryId);
      if (hit.ancestors.length > 0) {
        setExpandedIds(prev => {
          const next = new Set(prev);
          hit.ancestors.forEach(id => next.add(id));
          return next;
        });
      }
      // v4：派发 category-selected，让顶层 categoryTag/categoryLabel 同步；注意这里可能在 language 未就绪时触发，
      // nameOf 依赖 language；此处直接用 findCategoryPath 返回的 item + 当前 language 查名，保持一致。
      const label = hit.item?.name?.[language] || hit.item?.name?.en || categoryId;
      window.dispatchEvent(new CustomEvent('category-selected', {
        detail: {
          categoryId,
          searchTag: hit.item.searchTag || '',
          categoryLabel: label,
        }
      }));
    }
  }, [language]);

  // 首屏 + 浏览器前进/后退
  useEffect(() => {
    syncFromURL();
    window.addEventListener('popstate', syncFromURL);
    // === LM CUSTOMIZATION: v4 — 监听外部（如大标题 ✕ / 清除全部按钮）派发的 category-cleared，
    //     同步清除侧边栏高亮。注意 pushState 不会触发 popstate，所以必须显式监听事件。===
    const handleExternalClear = () => setSelectedId(null);
    window.addEventListener('category-cleared', handleExternalClear);
    return () => {
      window.removeEventListener('popstate', syncFromURL);
      window.removeEventListener('category-cleared', handleExternalClear);
    };
  }, [syncFromURL]);

  // 展平列表（对齐 Fab 的扁平化 DOM）
  const flatItems = useMemo(
    () => flattenCategories(CATEGORIES, expandedIds),
    [expandedIds]
  );

  // 切换展开
  const toggleExpand = useCallback((id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // 点击可展开的分类节点 → 先展开/折叠，不触发搜索（Fab 行为：父节点仅作为分组容器）
  const handleBranchClick = useCallback((id) => {
    toggleExpand(id);
  }, [toggleExpand]);

  // 本地化文案
  const nameOf = useCallback((item) => {
    return item.name?.[language] || item.name?.en || item.id;
  }, [language]);

  // 点击叶子节点或可 select 的节点 → 作为分类 tag 写入顶层 categoryTag（不动搜索框、不进标签 chip 栏）
  const handleLeafClick = useCallback((item) => {
    if (!item.searchTag) return; // 无 tag 的项（如 "所有产品"）走清除
    setSelectedId(item.id);
    const url = new URL(window.location);
    url.searchParams.set('category', item.id);
    // v3 解耦版：不再主动 delete('q')，q 由顶层 serializeToURL 统一管理（搜索词/标签互不干扰）
    window.history.pushState({}, '', url);
    // v4：event detail 额外携带本地化 categoryLabel，顶层无需再查表
    window.dispatchEvent(new CustomEvent('category-selected', {
      detail: {
        categoryId: item.id,
        searchTag: item.searchTag,
        categoryLabel: nameOf(item),
      }
    }));
  }, [nameOf]);

  // 清除选中 → 对应 "所有产品"
  const handleClearSelection = useCallback(() => {
    // 取出当前被选项的 tag，用于从 selectedTags 中精准移除
    let currentTag = '';
    if (selectedId) {
      const hit = findCategoryPath(CATEGORIES, selectedId);
      if (hit) currentTag = hit.item.searchTag || '';
    }
    setSelectedId(null);
    const url = new URL(window.location);
    url.searchParams.delete('category');
    // v3 解耦版：不再动 ?q=，由顶层 serializeToURL 统一管理
    window.history.pushState({}, '', url);
    window.dispatchEvent(new CustomEvent('category-cleared', {
      detail: { searchTag: currentTag }
    }));
  }, [selectedId]);

  if (collapsed) {
    return (
      <button
        className="sidebar-expand-btn"
        onClick={onToggle}
        title={t('categorySidebarExpand') || (language === 'zh' ? '展开分类' : 'Expand categories')}
        aria-label={t('categorySidebarExpand') || 'Expand categories'}
      >
        ▶
      </button>
    );
  }

  return (
    <aside className="category-sidebar" aria-label="Category Navigation">
      {/* 头部：收起按钮（v6 换 « 双箭头图标，与 Header 行 ✕ 严格区分语义） */}
      <div className="sidebar-header">
        <button
          className="collapse-btn"
          onClick={onToggle}
          title={t('categorySidebarCollapse') || (language === 'zh' ? '收起侧边栏' : 'Collapse sidebar')}
          aria-label="Collapse sidebar"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
            <path
              d="M10 3L5 8l5 5M14 3L9 8l5 5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>


      {/* === 优惠/通道分组已隐藏（MT 反馈目前不需要）=== */}
      {/* TODO: 后续需要时取消注释恢复 */}

      {/* 分组标题：产品类型 */}
      <div className="sidebar-group-heading">
        {t('categoryGroupProductType') || (language === 'zh' ? '产品类型' : 'Product Type')}
      </div>

      <nav className="tree-view" role="tree">
        {/* "所有产品" 项 — 固定置顶、永远可见、不属于 flatItems */}
        <div
          role="treeitem"
          aria-selected={!selectedId}
          className={`tree-item tree-item--leaf${!selectedId ? ' tree-item--current' : ''}`}
          style={{ '--depth': 0 }}
          onClick={handleClearSelection}
        >
          <CategoryIcon name="all" size={16} className="tree-item-icon" />
          <span className="tree-item-label">
            {t('categoryAllProducts') || (language === 'zh' ? '所有产品' : 'All Products')}
          </span>
        </div>

        {/* 扁平化 TreeView：跳过 id === 'all'（已在顶部渲染） */}
        {flatItems.filter(it => it.id !== 'all').map(item => {
          const isCurrent = item.id === selectedId;
          const isExpanded = expandedIds.has(item.id);
          const isLeaf = !item.hasChildren;
          const classes = [
            'tree-item',
            isLeaf ? 'tree-item--leaf' : 'tree-item--branch',
            isCurrent ? 'tree-item--current' : '',
          ].filter(Boolean).join(' ');

          return (
            <div
              key={item.id}
              role="treeitem"
              aria-selected={isCurrent}
              aria-expanded={item.hasChildren ? isExpanded : undefined}
              className={classes}
              style={{ '--depth': item.depth }}
              onClick={() => (item.hasChildren ? handleBranchClick(item.id) : handleLeafClick(item))}
              title={nameOf(item)}
            >
              {/* 展开箭头（仅可展开项显示，叶子留空位对齐） */}
              {item.hasChildren ? (
                <svg
                  className={`tree-arrow${isExpanded ? ' tree-arrow--expanded' : ''}`}
                  viewBox="0 0 12 12"
                  width="12"
                  height="12"
                  aria-hidden="true"
                >
                  <path d="M4 2 L8 6 L4 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}

              {item.depth === 0 && item.icon ? (
                <CategoryIcon name={item.icon} size={16} className="tree-item-icon" />
              ) : null}

              <span className="tree-item-label">{nameOf(item)}</span>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

export default CategorySidebar;
