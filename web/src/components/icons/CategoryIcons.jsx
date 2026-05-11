// === LM CUSTOMIZATION: Category SVG Icons ===
// 替换 emoji 为精细 SVG 图标，对齐 Fab 暗色主题的线性图标风格。
// 纯 SVG 组件，零外部依赖，合并英伟达新版本无冲突风险。
//
// 使用方式：
//   import { CategoryIcon } from './icons/CategoryIcons';
//   <CategoryIcon name="building" size={16} />

import React from 'react';

const icons = {
  // 所有产品 — 3D 立方体
  all: (
    <path
      d="M8 1L14.5 4.5V11.5L8 15L1.5 11.5V4.5L8 1Z M8 1V8 M8 8L14.5 4.5 M8 8L1.5 4.5"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ),
  // 建筑 — 简化建筑轮廓
  building: (
    <path
      d="M2 14V5L8 2L14 5V14 M2 14H14 M5 14V10H8V14 M11 14V10 M5 7H5.01 M8 7H8.01 M11 7H11.01"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ),
  // 物件 — 立方体/箱子
  object: (
    <path
      d="M2.5 5L8 2L13.5 5L8 8L2.5 5Z M2.5 5V11L8 14 M13.5 5V11L8 14"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ),
  // 植被 — 树叶/植物
  vegetation: (
    <path
      d="M8 14V8 M5 14C5 14 2 11 2 8C2 5 5 3 8 3C11 3 14 5 14 8C14 11 11 14 11 14 M4 9.5C5.5 8 6.5 8 8 8 M12 9.5C10.5 8 9.5 8 8 8"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ),
  // 自然 — 山脉
  nature: (
    <path
      d="M1 13L5.5 4L8.5 9L10 7L15 13H1Z"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ),
  // 道路 — 道路透视
  road: (
    <path
      d="M1 14L6.5 2H9.5L15 14 M8 4V6 M8 8V10 M8 12V14"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ),
  // 假地形/远景 — 地平线+太阳
  vision: (
    <>
      <circle
        cx="11"
        cy="5"
        r="2.5"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
      <path
        d="M1 10L4 7L7 9L10 6L15 10 M1 13H15"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </>
  ),
};

/**
 * 分类图标组件 — 纯 SVG，线性风格，继承父级 color
 *
 * @param {string} name - 图标名称（与 categories.js 中的 id 对应）
 * @param {number} size - 图标尺寸（默认 16）
 * @param {object} style - 额外样式
 */
export function CategoryIcon({ name, size = 16, className, style, ...rest }) {
  const iconContent = icons[name];
  if (!iconContent) return null;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className={className}
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
      {...rest}
    >
      {iconContent}
    </svg>
  );
}

/** 可用图标名称列表 */
export const ICON_NAMES = Object.keys(icons);

export default CategoryIcon;
