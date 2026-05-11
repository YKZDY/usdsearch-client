/**
 * Fab Design Tokens — 从 fab.com 三轮 Playwright 扒取精确提取
 * 
 * 数据源：docs/Fab改造/扒取产出/fab-design-tokens-clean.json (670 个令牌)
 * 此文件只保留 usdsearch 复刻 Fab Explorer 页面需要的子集。
 * 
 * 使用方式：
 *   import { fabColors, fabRadius, fabSpacing, fabTypo, fabShadow } from '../theme/fabTokens';
 * 
 * 品牌适配层：
 *   Fab 品牌色是 #26bbff（蓝），我们用 LA 金色 #FFD230 替代。
 *   其余灰阶、透明度、圆角、间距完全照搬。
 * 
 * @see docs/Fab改造/扒取产出/README.md
 * @date 2026-04-29
 */

// ============================================================
// 一、色彩令牌
// ============================================================

/** 12 级灰阶（Fab 暗色主题基础） */
export const fabGrayscale = {
  1: '#101014',   // 页面背景 --colors-background-default
  2: '#18181c',   // elevated-low
  3: '#202024',   // elevated-high
  4: '#28282c',
  5: '#303034',   // 菜单背景 --colors-background-menu
  6: '#404044',
  7: '#505054',
  8: '#606064',
  9: '#707074',
  10: '#808084',
  11: '#aaaaae',
  12: '#e6e6ea',
};

/** 透明度系列（基于白色/黑色） */
export const fabTransparency = {
  light005: 'hsla(0, 0%, 100%, 0.05)',  // 卡片背景、输入框背景
  light010: 'hsla(0, 0%, 100%, 0.1)',   // 边框-subdued
  light015: 'hsla(0, 0%, 100%, 0.15)',  // 选中态填充、边框-subtle
  light035: 'hsla(0, 0%, 100%, 0.35)',  // 边框-default、hover 填充
  light065: 'hsla(0, 0%, 100%, 0.65)',  // 次要文字、次要图标
  light100: '#fff',                      // 主文字
  dark005: 'rgba(0, 0, 0, 0.05)',
  dark010: 'rgba(0, 0, 0, 0.1)',        // 阴影基础色
  dark035: 'rgba(0, 0, 0, 0.35)',       // 遮罩-regular
  dark065: 'rgba(0, 0, 0, 0.65)',       // 遮罩-strong
};

/** 语义化色彩 */
export const fabColors = {
  // 背景
  bgDefault: '#101014',
  bgElevatedLow: '#18181c',
  bgElevatedHigh: '#202024',
  bgMenu: '#303034',
  bgMenuTranslucent: 'rgba(48, 48, 52, 0.7)',  // Popover 毛玻璃背景
  bgCard: 'hsla(0, 0%, 100%, 0.05)',            // 卡片
  bgInput: 'hsla(0, 0%, 100%, 0.05)',           // 输入框

  // 文字
  textPrimary: '#fff',
  textSecondary: 'hsla(0, 0%, 100%, 0.65)',
  textDisabled: 'hsla(0, 0%, 100%, 0.65)',

  // 边框
  borderDefault: 'hsla(0, 0%, 100%, 0.35)',
  borderHover: 'hsla(0, 0%, 100%, 0.65)',
  borderSubdued: 'hsla(0, 0%, 100%, 0.1)',
  borderSubtle: 'hsla(0, 0%, 100%, 0.15)',
  borderFaint: 'hsla(0, 0%, 100%, 0.05)',   // 卡片边框
  borderFocus: '#fff',

  // 填充（交互态）
  fillSecondaryDefault: 'hsla(0, 0%, 100%, 0.15)',   // 选中态 / hover 态
  fillSecondaryHover: 'hsla(0, 0%, 100%, 0.35)',
  fillTertiaryHover: 'hsla(0, 0%, 100%, 0.15)',      // ghost 按钮 hover
  fillInputDefault: 'hsla(0, 0%, 100%, 0.05)',

  // Fab 品牌色（我们不用，但保留作参考）
  fabBrandPrimary: '#26bbff',
  fabBrandHover: '#72d3ff',

  // 状态色（通用，我们也用）
  success: '#45c761',
  successAlt: '#71d687',
  warning: '#ffc229',
  warningAlt: '#ffd15c',
  critical: '#ff3f56',
  criticalAlt: '#ff6173',
  informational: '#61cdff',

  // 图标
  iconPrimary: '#fff',
  iconSecondary: 'hsla(0, 0%, 100%, 0.65)',

  // 遮罩
  backdropStrong: 'rgba(0, 0, 0, 0.65)',
  backdropRegular: 'rgba(0, 0, 0, 0.35)',
};

/** 完整调色板（每色 200/300/400 三档） */
export const fabPalette = {
  red:    { 200: '#ff3f56', 300: '#ff6173', 400: '#ff8291' },
  pink:   { 200: '#fe54ba', 300: '#fe71c6' },
  purple: { 200: '#be3dff', 300: '#d480ff' },
  indigo: { 200: '#7371ff', 300: '#aaa8ff' },
  blue:   { 200: '#26bbff', 300: '#61cdff', 400: '#72d3ff' },
  cyan:   { 200: '#43dac2', 300: '#88e7d7' },
  green:  { 200: '#45c761', 300: '#71d687' },
  lime:   { 200: '#a9d34f', 300: '#bfde7c' },
  yellow: { 200: '#ffc229', 300: '#ffd15c' },
  amber:  { 200: '#ff8e1f', 300: '#ffb061' },
  orange: { 200: '#fd6535', 300: '#fd7b53' },
  brown:  { 200: '#b2715d', 300: '#c89889' },
};

// ============================================================
// 二、圆角令牌
// ============================================================

export const fabRadius = {
  '0.5': '2px',    // 极小
  '1': '4px',      // 基础
  '1.5': '6px',    // 按钮 sm / TreeView 项
  '2': '8px',      // List 项
  '2.5': '10px',   // —
  '3': '12px',     // 卡片 / Popover 面板
  '4': '16px',     // —
  '5': '20px',     // —
  'round': '999px', // 搜索框 / Counter 徽章 / 胶囊按钮
};

// ============================================================
// 三、间距令牌（4px 网格系统）
// ============================================================

export const fabSpacing = {
  '1': '4px',
  '1.5': '6px',
  '2': '8px',
  '2.5': '10px',
  '3': '12px',
  '4': '16px',     // 卡片 gap、Popover padding
  '5': '20px',     // 侧边栏 padding-top/bottom
  '6': '24px',
  '7': '28px',
  '8': '32px',     // TreeView 项高度
  '9': '36px',
  '10': '40px',    // List 项高度、搜索框高度
  '12': '48px',
  '14': '56px',
  '16': '64px',
  '20': '80px',    // 卡片信息区高度
  '24': '96px',
  '32': '128px',
  '40': '160px',
  '48': '192px',
  '56': '224px',
  '64': '256px',
};

// ============================================================
// 四、字体令牌（双字体系统）
// ============================================================

export const fabTypo = {
  fontFamily: {
    heading: '"Inter Tight", Inter, system-ui, sans-serif',
    body: 'Inter, system-ui, sans-serif',
    eyebrow: 'Inter, system-ui, sans-serif',
  },

  /** Heading: Inter Tight, 700-900, line-height 125% */
  heading: {
    '4xl': { size: '64px', weight: 900, lineHeight: '125%', letterSpacing: '0' },
    '3xl': { size: '52px', weight: 900, lineHeight: '125%', letterSpacing: '0' },
    '2xl': { size: '40px', weight: 900, lineHeight: '125%', letterSpacing: '0' },
    'xl':  { size: '32px', weight: 900, lineHeight: '125%', letterSpacing: '0.24px' },
    'lg':  { size: '24px', weight: 700, lineHeight: '125%', letterSpacing: '0.24px' },
    'md':  { size: '20px', weight: 700, lineHeight: '125%', letterSpacing: '0.4px' },
    'sm':  { size: '16px', weight: 700, lineHeight: '125%', letterSpacing: '0.48px' },
  },

  /** Paragraph: Inter, 400, line-height 165% */
  paragraph: {
    '2xl': { size: '24px', lineHeight: '165%', letterSpacing: '-0.48px' },
    'xl':  { size: '20px', lineHeight: '165%', letterSpacing: '-0.2px' },
    'lg':  { size: '18px', lineHeight: '165%', letterSpacing: '0' },
    'md':  { size: '16px', lineHeight: '165%', letterSpacing: '0.16px' },
    'sm':  { size: '14px', lineHeight: '165%', letterSpacing: '0.28px' },
    'xs':  { size: '12px', lineHeight: '165%', letterSpacing: '0.36px' },
  },

  /** Text (短文本): Inter, 400-700, line-height 130-150% */
  text: {
    'xl':  { size: '24px', lineHeight: '150%', letterSpacing: '0.24px' },
    'lg':  { size: '16px', lineHeight: '150%', letterSpacing: '0.16px' },
    'md':  { size: '14px', lineHeight: '140%', letterSpacing: '0.28px' },
    'sm':  { size: '12px', lineHeight: '130%', letterSpacing: '0.36px' },
    'xs':  { size: '10px', lineHeight: '130%', letterSpacing: '0.3px' },
    '2xs': { size: '8px',  lineHeight: '130%', letterSpacing: '0.24px' },
  },

  /** Eyebrow (标签): Inter 700, line-height 100% */
  eyebrow: {
    'lg': { size: '14px', weight: 700, lineHeight: '100%', letterSpacing: '1.4px' },
    'md': { size: '12px', weight: 700, lineHeight: '100%', letterSpacing: '1.2px' },
    'sm': { size: '10px', weight: 700, lineHeight: '100%', letterSpacing: '1px' },
  },
};

// ============================================================
// 五、阴影令牌（5 层叠加系统）
// ============================================================

export const fabShadow = {
  topSm: '0px -1px 1px rgba(0,0,0,.1), 0px -2px 2px rgba(0,0,0,.1), 0px -4px 4px rgba(0,0,0,.1), 0px -6px 8px rgba(0,0,0,.1), 0px -8px 16px rgba(0,0,0,.1)',
  topMd: '0px -2px 1px rgba(0,0,0,.1), 0px -4px 2px rgba(0,0,0,.1), 0px -8px 4px rgba(0,0,0,.1), 0px -16px 8px rgba(0,0,0,.1), 0px -32px 16px rgba(0,0,0,.1)',
  rightSm: '1px 0px 1px rgba(0,0,0,.1), 2px 0px 2px rgba(0,0,0,.1), 4px 0px 4px rgba(0,0,0,.1), 6px 0px 8px rgba(0,0,0,.1), 8px 0px 16px rgba(0,0,0,.1)',
  rightMd: '2px 0px 1px rgba(0,0,0,.1), 4px 0px 2px rgba(0,0,0,.1), 8px 0px 4px rgba(0,0,0,.1), 16px 0px 8px rgba(0,0,0,.1), 32px 0px 16px rgba(0,0,0,.1)',
  bottomSm: '0px 1px 1px rgba(0,0,0,.1), 0px 2px 2px rgba(0,0,0,.1), 0px 4px 4px rgba(0,0,0,.1), 0px 6px 8px rgba(0,0,0,.1), 0px 8px 16px rgba(0,0,0,.1)',
  bottomMd: '0px 2px 1px rgba(0,0,0,.1), 0px 4px 2px rgba(0,0,0,.1), 0px 8px 4px rgba(0,0,0,.1), 0px 16px 8px rgba(0,0,0,.1), 0px 32px 16px rgba(0,0,0,.1)',
  leftSm: '-1px 0px 1px rgba(0,0,0,.1), -2px 0px 2px rgba(0,0,0,.1), -4px 0px 4px rgba(0,0,0,.1), -6px 0px 8px rgba(0,0,0,.1), -8px 0px 16px rgba(0,0,0,.1)',
  leftMd: '-2px 0px 1px rgba(0,0,0,.1), -4px 0px 2px rgba(0,0,0,.1), -8px 0px 4px rgba(0,0,0,.1), -16px 0px 8px rgba(0,0,0,.1), -32px 0px 16px rgba(0,0,0,.1)',
};

// ============================================================
// 六、布局令牌（Fab 搜索页特有）
// ============================================================

export const fabLayout = {
  topBar: {
    height: '72px',
    position: 'sticky',
    zIndex: 1101,
    background: 'transparent',
  },
  sidebar: {
    width: '320px',
    padding: '20px 16px',
    position: 'sticky',
  },
  cardGrid: {
    gap: '16px',
    columns: 'repeat(auto-fill, minmax(240px, 1fr))',
  },
  card: {
    borderRadius: '12px',
    background: 'hsla(0, 0%, 100%, 0.05)',
    border: '1px solid hsla(0, 0%, 100%, 0.05)',
    thumbRatio: '16 / 9',
    infoHeight: '80px',
    infoPadding: '8px 12px',
  },
  searchInput: {
    height: '40px',
    borderRadius: '999px',
    background: 'hsla(0, 0%, 100%, 0.05)',
    border: '1px solid hsla(0, 0%, 100%, 0.1)',
    padding: '0 16px',
  },
  popover: {
    background: 'rgba(48, 48, 52, 0.7)',
    border: '1px solid hsla(0, 0%, 100%, 0.1)',
    borderRadius: '12px',
    backdropFilter: 'blur(50px)',
    boxShadow: '0px 2px 1px rgba(0,0,0,.1), 0px 4px 2px rgba(0,0,0,.1), 0px 8px 4px rgba(0,0,0,.1), 0px 16px 8px rgba(0,0,0,.1), 0px 32px 16px rgba(0,0,0,.1)',
    zIndex: 1350,
    padding: '16px',       // 表单类
    paddingList: '4px',    // 列表类
  },
  treeView: {
    itemHeight: '32px',
    itemBorderRadius: '6px',
    /** padding-left = 8 + depth × 24 + (hasChildren ? 0 : 24) */
    depthIndent: 24,
    baseIndent: 8,
    leafOffset: 24,
    arrowSize: '12px',
    arrowTransition: 'transform 0.2s ease',
  },
  listItem: {
    height: '40px',
    borderRadius: '8px',
    padding: '0 12px',
  },
};

// ============================================================
// 七、品牌适配层 — LA 金色替代 Fab 蓝色
// ============================================================

/**
 * 我们的品牌色系统 — 光子（LightSpeed / Light Art）品牌强调色。
 * 组件代码引用这些常量，如果后续要切回 Fab 蓝，只需修改此处。
 */
export const brandColors = {
  primary: '#FFD230',       // 光子品牌金色（替代 Fab 的 #26bbff）
  primaryHover: '#FFE066',  // hover 态（替代 Fab 的 #72d3ff）
  primaryPress: '#FFD230',  // press 态
  onPrimary: '#000',        // 品牌色上的文字（黑色，保证对比度）
};

// ============================================================
// 八、便捷导出
// ============================================================

const fabTokens = {
  colors: fabColors,
  palette: fabPalette,
  grayscale: fabGrayscale,
  transparency: fabTransparency,
  radius: fabRadius,
  spacing: fabSpacing,
  typo: fabTypo,
  shadow: fabShadow,
  layout: fabLayout,
  brand: brandColors,
};

export default fabTokens;
