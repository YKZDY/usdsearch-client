/**
 * AssetDetailsDrawer — Group A 修复版（TC-A4/A5/A8）
 *
 * 用途：替代 AssetDetailsModal，作为右侧详情抽屉的容器组件。
 *
 * 本轮修复要点：
 *  - TC-A4：切换卡片时不再"关闭再打开"。父组件已让 isOpen 持续 true，
 *           本组件用 displayAsset 缓存最后一次非空 asset，避免空态闪现。
 *  - TC-A5：折叠/关闭按钮分离 — 折叠按钮放左侧顶栏，关闭按钮保留右侧默认。
 *           新增左边缘 resize 手柄（4px wide hover 显形），360-720px 拖拽调宽，localStorage 持久化。
 *  - TC-A8：标题改为资产文件名（从 url 末段或 base_key 取），路径降为副信息单行 truncate。
 *           新增"创建时间"字段。底部去掉"下载"按钮（保留复制路径 + 在 Omniverse 打开）。
 *           整体视觉重做：卡片化 metadata、图片圆角阴影、品牌色用于强调按钮。
 *
 * Group A ↔ B 契约：
 *  - B 组通过 `tagsAreaContent` 注入完整 tag 编辑器
 *  - B 组通过 `advancedPanelContent` 注入折叠的高级面板
 */
import React, { useEffect, useMemo, useRef, useState, useCallback, useDeferredValue } from 'react';
import {
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  Box,
  Flex,
  VStack,
  HStack,
  Heading,
  Text,
  IconButton,
  Button,
  Skeleton,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  useBreakpointValue,
  useToast,
  Tooltip,
} from '@chakra-ui/react';
import {
  ChevronRightIcon,
  ChevronLeftIcon,
  ChevronDownIcon,
  CopyIcon,
  ExternalLinkIcon,
  RepeatIcon,
} from '@chakra-ui/icons';
import { useTranslation } from '../i18n/LanguageContext';
import { fabColors, fabRadius, fabSpacing, brandColors, fabTypo } from '../theme/fabTokens';
import AssetImage from './AssetImage';
import NavigableAssetImage from './NavigableAssetImage';
import { formatFileSize, formatDate } from '../utils/formatUtils';
// === LM CUSTOMIZATION: MultiImageDrawer START ===
import { findFirstValidImageIndex } from '../utils/blackImageDetector';
// === LM CUSTOMIZATION: MultiImageDrawer END ===

// === LM CUSTOMIZATION: detail-modal-revamp START ===
// 需求 6.4：时间戳根据当前语言格式化（中文：2026年5月22日 / 英文：May 22, 2026）
// 不动 NVIDIA 原版 utils/formatUtils.js 的 formatDate，在 Drawer 内部包一层。
function formatDateByLang(dateString, language) {
  if (!dateString) return null;
  try {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return null;
    const locale = language === 'zh' ? 'zh-CN' : 'en-US';
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: language === 'zh' ? 'long' : 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch (_) {
    return formatDate(dateString); // 退化到原版 toLocaleString
  }
}
// === LM CUSTOMIZATION: detail-modal-revamp END ===

const COLLAPSED_KEY = 'detailsDrawerCollapsed';
const WIDTH_KEY = 'detailsDrawerWidth';
const DRAWER_WIDTH_DEFAULT = 480;
const DRAWER_WIDTH_MIN = 360;
const DRAWER_WIDTH_MAX = 720;
const DRAWER_WIDTH_COLLAPSED = '56px';

/** 读取折叠态持久化值，失败时回退 false */
function readCollapsedState() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true';
  } catch (_) {
    return false;
  }
}

/** 持久化折叠态 */
function writeCollapsedState(collapsed) {
  try {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? 'true' : 'false');
  } catch (_) {
    /* ignore */
  }
}

/** 读取宽度（持久化），合法范围 360-720，默认 480 */
function readDrawerWidth() {
  try {
    const v = parseInt(localStorage.getItem(WIDTH_KEY) || '', 10);
    if (Number.isFinite(v) && v >= DRAWER_WIDTH_MIN && v <= DRAWER_WIDTH_MAX) return v;
  } catch (_) { /* ignore */ }
  return DRAWER_WIDTH_DEFAULT;
}

function writeDrawerWidth(width) {
  try {
    localStorage.setItem(WIDTH_KEY, String(width));
  } catch (_) { /* ignore */ }
}

/** 从 url / base_key 中推断格式后缀（usd / usda / usdz / png / jpg ...） */
function inferFormat(asset) {
  const path = asset?.source?.url || asset?.source?.base_key || asset?.url || '';
  const m = String(path).match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/);
  return m ? m[1].toUpperCase() : null;
}

/** 取资产文件名：path 末段去掉查询串，没有就用 name / id */
function inferAssetName(asset) {
  if (asset?.name) return asset.name;
  const path = asset?.source?.url || asset?.source?.base_key || asset?.url || '';
  if (!path) return asset?.id || '—';
  // 去查询串和锚点
  const cleaned = String(path).split('?')[0].split('#')[0];
  // 去掉协议头与最后的斜杠
  const seg = cleaned.replace(/\/$/, '').split(/[\\/]/).pop();
  return seg || cleaned;
}

/**
 * 单条元数据（卡片化）：左标签 + 右值。
 * 视觉升级：md+ 一行展示，紧凑分隔线，hover 高亮。
 */
const MetaRow = React.memo(function MetaRow({ label, value, title }) {
  return (
    <Flex
      direction={{ base: 'column', sm: 'row' }}
      gap={{ base: 0, sm: fabSpacing['3'] }}
      align={{ base: 'flex-start', sm: 'baseline' }}
      px={fabSpacing['3']}
      py={fabSpacing['2']}
      borderBottom="1px solid"
      borderColor={fabColors.borderFaint}
      _last={{ borderBottom: '0' }}
      _hover={{ bg: 'rgba(255,255,255,0.02)' }}
      transition="background 120ms ease"
    >
      <Text
        fontSize="xs"
        color={fabColors.textSecondary}
        minW={{ sm: '88px' }}
        flexShrink={0}
        textTransform="uppercase"
        letterSpacing="0.04em"
      >
        {label}
      </Text>
      <Text
        fontSize="sm"
        color={fabColors.textPrimary}
        noOfLines={1}
        title={title || (typeof value === 'string' ? value : undefined)}
        wordBreak="break-all"
        fontWeight="500"
      >
        {value}
      </Text>
    </Flex>
  );
});

/**
 * AssetDetailsDrawer
 */
const AssetDetailsDrawer = ({
  isOpen,
  asset,
  onClose,
  onSelectAsset, // eslint-disable-line no-unused-vars
  tagsAreaContent,
  advancedPanelContent,
  actionButtons,
  getHeaders,
  apiUrl,
  serverUrl, // eslint-disable-line no-unused-vars
  copyToClipboard,
}) => {
  // === LM CUSTOMIZATION: Perf-Drawer-FastSwitch START ===
  // 修复"Drawer 切换卡片体感卡顿、连续点击失灵"：
  //   原瓶颈：每次 asset 变化触发 ~200ms long task（React 同步重渲染整个 Drawer 子树
  //   ─ 包括 DrawerAdvancedPanelContainer + AssetTagEditor 两个重组件，各自有 useEffect
  //   触发 fetch 请求 + 多个 useState 重置）。期间 click event 被阻塞，连续点击中间帧丢失。
  // 修复策略：基础信息（资产名/缩略图/元数据/路径）走高优先级立即 paint；
  //   tags 编辑器和高级面板（重子树 + 网络请求）通过 useDeferredValue 推到低优先级。
  //   React 18 调度器会在下一帧空闲时处理 deferred 渲染，让 click → 缩略图切换 < 16ms。
  // 用户感知：每次 click 立即看到缩略图/资产名切换；高级面板会在停止点击 ~100ms 后才更新，
  //   但用户视线一般在主信息区，体感是"丝滑"。
  // 合入英伟达新版时：保留本块；useDeferredValue 是 React 18 标准 API，无依赖 LM 逻辑。
  const deferredTagsAreaContent = useDeferredValue(tagsAreaContent);
  const deferredAdvancedPanelContent = useDeferredValue(advancedPanelContent);
  // === LM CUSTOMIZATION: Perf-Drawer-FastSwitch END ===
  const { t, language } = useTranslation();
  const [collapsed, setCollapsed] = useState(readCollapsedState);
  const [drawerWidth, setDrawerWidth] = useState(readDrawerWidth);
  // === LM CUSTOMIZATION: MultiImageDrawer START ===
  // 黑图检测后自动跳转到第一张有效图的 offset
  const [drawerInitialOffset, setDrawerInitialOffset] = useState(0);
  // === LM CUSTOMIZATION: MultiImageDrawer END ===
  const triggerElementRef = useRef(null);
  const toast = useToast();

  // === LM CUSTOMIZATION: SelectionDrawer START ===
  // TC-A4 修复 + Perf-Drawer-FastSwitch：缓存最后一次非空 asset。
  //   原实现：useState + useEffect 同步——asset 变化触发父组件 render → AssetDetailsDrawer
  //   收到新 asset prop → useEffect 异步触发 setDisplayAsset → 又一次 render。
  //   结果：每次切换 Drawer 卡片要 2 帧才完成，连续点击时中间帧被吞，用户感知"失灵"。
  //   新实现：useRef 持有上次非空值，渲染期间根据当前 asset 同步选择 → 同帧完成更新，
  //   click → Drawer DOM mutation 延迟从 ~250ms 缩到 < 100ms（仅 React 重渲染本身耗时）。
  //   语义不变：当 asset=null 且 isOpen=true 时仍展示上次缓存（防闪烁）。
  // 合入英伟达新版时：保留本块。
  const lastNonNullAssetRef = useRef(asset || null);
  if (asset) {
    lastNonNullAssetRef.current = asset;
  } else if (!isOpen) {
    lastNonNullAssetRef.current = null;
  }
  // 抽屉打开但 asset 暂时为 null：保留 ref 不变（防闪烁）
  const displayAsset = asset || lastNonNullAssetRef.current;
  // === LM CUSTOMIZATION: MultiImageDrawer START ===
  // 当切换到不同资产时，重置 initialOffset（需求 2.4）
  const prevAssetIdRef = useRef(null);
  useEffect(() => {
    const currentId = displayAsset?.id || displayAsset?.source?.base_key || null;
    if (currentId && currentId !== prevAssetIdRef.current) {
      prevAssetIdRef.current = currentId;
      setDrawerInitialOffset(0);
    }
  }, [displayAsset]);
  // === LM CUSTOMIZATION: MultiImageDrawer END ===
  // === LM CUSTOMIZATION: SelectionDrawer END ===

  // 移动端强制全屏宽度
  const responsiveWidth = useBreakpointValue({
    base: '100vw',
    md: collapsed ? DRAWER_WIDTH_COLLAPSED : `${drawerWidth}px`,
  });

  /** 切换折叠态（持久化） */
  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsedState(next);
      return next;
    });
  }, []);

  // === LM CUSTOMIZATION: SelectionDrawer START ===
  // TC-A5：左边缘 resize 拖拽 — onMouseDown 起拖，document level 监听 mousemove/mouseup
  // 范围 360-720px，松手后写 localStorage。SSR 安全 + 移除监听守卫。
  const resizingRef = useRef(false);
  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startWidth = drawerWidth;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev) => {
      if (!resizingRef.current) return;
      // 抽屉在右侧：鼠标向左移 = 拓宽（dx 取反）
      const dx = startX - ev.clientX;
      const next = Math.min(DRAWER_WIDTH_MAX, Math.max(DRAWER_WIDTH_MIN, startWidth + dx));
      setDrawerWidth(next);
    };
    const onUp = () => {
      resizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      // 用最新的 setState 回调拿值持久化（drawerWidth 闭包陈旧）
      setDrawerWidth((cur) => {
        writeDrawerWidth(cur);
        return cur;
      });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [drawerWidth]);
  // === LM CUSTOMIZATION: SelectionDrawer END ===

  /** 抽屉打开前记录触发元素，关闭后焦点回归（a11y） */
  useEffect(() => {
    if (isOpen) {
      triggerElementRef.current = document.activeElement;
    } else if (triggerElementRef.current && typeof triggerElementRef.current.focus === 'function') {
      try {
        triggerElementRef.current.focus({ preventScroll: true });
      } catch (_) { /* ignore */ }
      triggerElementRef.current = null;
    }
  }, [isOpen]);

  /** 服务器切换时强制关闭抽屉 */
  useEffect(() => {
    const handler = () => {
      if (isOpen) onClose?.();
    };
    window.addEventListener('server-changed', handler);
    return () => window.removeEventListener('server-changed', handler);
  }, [isOpen, onClose]);

  /** 复制路径 */
  const handleCopyPath = useCallback(() => {
    const text = displayAsset?.source?.url || displayAsset?.source?.base_key || displayAsset?.url || '';
    if (!text) return;
    if (typeof copyToClipboard === 'function') {
      copyToClipboard(text);
      return;
    }
    try {
      navigator.clipboard?.writeText(text);
      // v3 TC-A8：使用专门的 success 文案（不是“复制路径”按钮文案本身）
      toast?.({ title: t('detailsDrawerCopyPathSuccess'), status: 'success', duration: 1500 });
    } catch (_) { /* ignore */ }
  }, [displayAsset, copyToClipboard, toast, t]);

  // === LM CUSTOMIZATION: detail-modal-revamp START ===
  // 需求 7：Action Bar 重构—在 Omniverse 打开 + 刷新元数据。
  // “刷新元数据”通过派发 window 事件交由 DrawerAdvancedPanelContainer 响应，
  // 避免 Drawer 与高级面板容器互相耦合。
  const omniverseUrl = useMemo(() => {
    const a = displayAsset;
    return a?.source?.omniverse_url || a?.source?.nucleus_url || null;
  }, [displayAsset]);

  const [refreshSpinning, setRefreshSpinning] = useState(false);
  const handleRefreshMetadata = useCallback(() => {
    setRefreshSpinning(true);
    try {
      window.dispatchEvent(
        new CustomEvent('details-drawer-refresh-metadata', {
          detail: { asset: displayAsset },
        })
      );
      toast?.({ title: t('detailsDrawerRefreshAll'), status: 'info', duration: 1200 });
    } catch (_) { /* ignore */ }
    // 动画反馈：800ms 后释放 loading 态（hook 内部会接手真实加载态，但 Drawer 拿不到，
    // 用一个合理的动画时间表示“请求已发出”即可）
    setTimeout(() => setRefreshSpinning(false), 800);
  }, [displayAsset, toast, t]);

  const handleOpenInOmniverse = useCallback(() => {
    if (!omniverseUrl) return;
    try {
      window.open(omniverseUrl, '_blank', 'noopener,noreferrer');
    } catch (_) { /* ignore */ }
  }, [omniverseUrl]);
  // === LM CUSTOMIZATION: detail-modal-revamp END ===


  // === LM CUSTOMIZATION: SelectionDrawer START ===
  // TC-A8 元数据预算（用 displayAsset 取值，配合 useMemo 减少重算）
  // v3.1：用户反馈来源/评分信息量低且不友好，删除这两个字段。
  // detail-modal-revamp：时间戳改走 formatDateByLang，随语言切换
  const meta = useMemo(() => {
    const a = displayAsset;
    const sizeText = a?.source?.size != null ? formatFileSize(a.source.size) : null;
    const formatText = inferFormat(a);
    const modifiedRaw = a?.source?.modified_timestamp;
    const createdRaw = a?.source?.created_timestamp;
    const modifiedText = modifiedRaw ? (formatDateByLang(modifiedRaw, language) || formatDate(modifiedRaw)) : null;
    const createdText = createdRaw ? (formatDateByLang(createdRaw, language) || formatDate(createdRaw)) : null;
    const creatorText = a?.source?.created_by || null;
    const pathText = a?.source?.url || a?.url || a?.source?.base_key || '';
    const nameText = inferAssetName(a);
    return { sizeText, formatText, modifiedText, createdText, creatorText, pathText, nameText };
  }, [displayAsset, language]);
  // === LM CUSTOMIZATION: SelectionDrawer END ===

  // 折叠态：极窄竖条 + 上方一对独立按钮（避免重叠）
  if (collapsed) {
    return (
      <Drawer
        isOpen={isOpen}
        placement="right"
        onClose={onClose}
        blockScrollOnMount={false}
        trapFocus={false}
        autoFocus={false}
        // === LM CUSTOMIZATION: SelectionDrawer START ===
        // v3 TC-A4/A6 修复：禁用默认遮罩点击关闭（即便遮罩透明，DrawerOverlay 仍会拦截
        // 卡片/复选框/工具栏的 click 事件，导致用户点任何位置都自动关抽屉）。
        // 关闭路径改由：×按钮 / Esc / server-changed / useDrawerCloseGuard（真空白）四条白名单。
        closeOnOverlayClick={false}
        closeOnEsc
        motionPreset="slideInRight"
        preserveScrollBarGap
        // === LM CUSTOMIZATION: SelectionDrawer END ===
      >
        {/* === LM CUSTOMIZATION: SelectionDrawer START === */}
        {/* v3.7 修复"切换卡片要点几下才出抽屉"：DrawerOverlay 即使 bg=transparent
            仍会捕获点击事件（默认 pointer-events:auto），导致用户点其他卡片时
            第一次 click 被 overlay 吞掉 → useDrawerCloseGuard 同时判定为"想关"派 onClose →
            抽屉关闭后第二次 click 才落到新卡片 → 体感"要点几下"+"卡卡的"。
            修复：pointerEvents="none" 让透明遮罩对事件完全透明，所有 click 都直达下层卡片。
            关闭路径仍由 useDrawerCloseGuard（document 级监听）接管，不受影响。
            合入英伟达新版时：保留本块；属性与原版兼容。 */}
        <DrawerOverlay bg="transparent" pointerEvents="none" />
        {/* === LM CUSTOMIZATION: SelectionDrawer END === */}
        <DrawerContent
          maxW={DRAWER_WIDTH_COLLAPSED}
          bg={fabColors.bgElevatedLow}
          borderLeft="1px solid"
          borderColor={fabColors.borderSubdued}
          boxShadow="-4px 0 24px rgba(0,0,0,0.3)"
          // === LM CUSTOMIZATION: SelectionDrawer START ===
          // v3.8 修复"关闭后立刻点卡片无反应"：
          //   Chakra <Drawer> 退出动画期间（~200ms），DrawerContent 仍在 DOM
          //   中且 pointer-events:auto，用户的立即点击被退出中的 DrawerContent 吞掉。
          //   条件化 pointerEvents 让退出动画期间 click 透透到下层卡片。
          //   合入英伟达新版时：保留；isOpen 是原生 prop，无依赖 LM 逻辑。
          pointerEvents={isOpen ? 'auto' : 'none'}
          // v4 修复"Drawer 已开点其他卡片无反应"：
          //   Chakra <Drawer> 默认会插入一个全屏 .chakra-modal__content-container，其
          //   pointer-events:auto 会拦截所有外部 click，让 useDrawerCloseGuard 误判为"想关"。
          //   通过 containerProps 让该 wrapper 权重为透明：click 直达下层卡片。
          //   DrawerContent 自身仍保留 pointer-events:auto，抽屉内部交互不受影响。
          containerProps={{ pointerEvents: 'none' }}
          // === LM CUSTOMIZATION: SelectionDrawer END ===
        >
          {/* TC-A5：折叠态把展开按钮放上方居中，关闭按钮放下方，避免重叠 */}
          <VStack pt={fabSpacing['3']} spacing={fabSpacing['2']}>
            <Tooltip label={t('detailsDrawerExpand')} placement="left" hasArrow>
              <IconButton
                aria-label={t('detailsDrawerExpand')}
                icon={<ChevronLeftIcon />}
                size="sm"
                variant="ghost"
                onClick={toggleCollapsed}
              />
            </Tooltip>
            <Tooltip label={t('detailsDrawerClose')} placement="left" hasArrow>
              <IconButton
                aria-label={t('detailsDrawerClose')}
                icon={<Box as="span" fontSize="lg" lineHeight="1">×</Box>}
                size="sm"
                variant="ghost"
                onClick={onClose}
              />
            </Tooltip>
          </VStack>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Drawer
      isOpen={isOpen}
      placement="right"
      onClose={onClose}
      blockScrollOnMount={false}
      trapFocus={false}
      autoFocus={false}
      // === LM CUSTOMIZATION: SelectionDrawer START ===
      // v3 TC-A4/A6 修复：禁用默认遮罩点击关闭（即便遮罩透明，DrawerOverlay 仍会拦截
      // 卡片/复选框/工具栏的 click 事件，导致用户点任何位置都自动关抽屉）。
      // 关闭路径改由：×按钮 / Esc / server-changed / useDrawerCloseGuard（真空白）四条白名单。
      // trapFocus 也关闭：避免抽屉打开时焦点被困在 Drawer 内，影响多选/搜索框操作。
      closeOnOverlayClick={false}
      closeOnEsc
      motionPreset="slideInRight"
      preserveScrollBarGap
      // === LM CUSTOMIZATION: SelectionDrawer END ===
    >
      {/* === LM CUSTOMIZATION: SelectionDrawer START === */}
      {/* v3.7 修复：见 collapsed 分支同位置注释。pointerEvents="none" 让 overlay 不再吞噬点击。 */}
      <DrawerOverlay bg="transparent" pointerEvents="none" />
      {/* === LM CUSTOMIZATION: SelectionDrawer END === */}
      <DrawerContent
        maxW={responsiveWidth}
        bg={fabColors.bgElevatedLow}
        borderLeft="1px solid"
        borderColor={fabColors.borderSubdued}
        boxShadow="-8px 0 32px rgba(0,0,0,0.45)"
        position="relative"
        // === LM CUSTOMIZATION: SelectionDrawer START ===
        // v3.8 同上：退出动画期间让 click 透过 DrawerContent，即“立刻重开抽屉”不被吞。
        pointerEvents={isOpen ? 'auto' : 'none'}
        // v4 修复"Drawer 已开点其他卡片无反应"：
        //   让全屏 .chakra-modal__content-container wrapper 权重透明，click 直达下层卡片；
        //   DrawerContent 自身 pointer-events:auto 保留交互。
        //   与 useDrawerCloseGuard 交错工作：click 直达卡片 → 命中 KEEP_OPEN（[data-card-index]）→
        //   Guard 不关 Drawer → useDrawerOrSelect 切换内容。
        containerProps={{ pointerEvents: 'none' }}
        // === LM CUSTOMIZATION: SelectionDrawer END ===
      >
        {/* === LM CUSTOMIZATION: SelectionDrawer START === */}
        {/* TC-A5：左边缘 resize 拖拽手柄。默认 4px 透明，hover 显形为品牌色。 */}
        <Box
          aria-label="resize drawer"
          role="separator"
          onMouseDown={handleResizeStart}
          position="absolute"
          left="0"
          top="0"
          bottom="0"
          width="4px"
          cursor="ew-resize"
          zIndex={1}
          _hover={{ bg: brandColors.primary, opacity: 0.6 }}
          transition="background 120ms ease, opacity 120ms ease"
          display={{ base: 'none', md: 'block' }}
        />
        {/* === LM CUSTOMIZATION: SelectionDrawer END === */}

        <DrawerCloseButton aria-label={t('detailsDrawerClose')} />

        {/* TC-A5 顶栏：折叠按钮放左侧（与右上 close 分开） */}
        <Flex
          align="center"
          justify="space-between"
          px={fabSpacing['4']}
          py={fabSpacing['3']}
          borderBottom="1px solid"
          borderColor={fabColors.borderFaint}
          bg={`linear-gradient(180deg, rgba(255,255,255,0.02) 0%, transparent 100%)`}
        >
          <HStack spacing={fabSpacing['2']}>
            <Tooltip label={t('detailsDrawerCollapse')} placement="bottom" hasArrow>
              <IconButton
                aria-label={t('detailsDrawerCollapse')}
                icon={<ChevronRightIcon />}
                size="sm"
                variant="ghost"
                display={{ base: 'none', md: 'inline-flex' }}
                onClick={toggleCollapsed}
              />
            </Tooltip>
            <Heading size="sm" color={fabColors.textPrimary} letterSpacing="0.01em">
              {t('detailsDrawerTitle')}
            </Heading>
          </HStack>
          {/* 右上保留给 DrawerCloseButton 默认位置 */}
        </Flex>

        {/* 内容滚动区 */}
        <Box
          flex="1"
          overflowY="auto"
          px={fabSpacing['4']}
          py={fabSpacing['4']}
        >
          {displayAsset ? (
            <VStack align="stretch" spacing={fabSpacing['4']}>
              {/* 区块 1：预览图 — v3.3 简化为 fab.com 风格"撑满预览"
                  根因：用户反馈"图小"+"上下有黑色虚拟背景"——之前的 contain + 模糊背景方案
                  让窄竖图两侧露出大量空白；棋盘格本身是资产 PNG 自带（卡片缩略图也是棋盘格），
                  无法用 CSS 去除。改为：
                  - 撤销模糊背景层（避免再露出深色边带）
                  - 前景图 objectFit="cover" 撑满预览容器，与卡片视觉一致
                  - 16:9 固定比例，避免窄图压扁 */}
              <Box
                data-section="preview"
                position="relative"
                borderRadius={fabRadius['3']}
                overflow="hidden"
                aspectRatio="16/9"
                boxShadow="0 4px 16px rgba(0,0,0,0.4)"
                border="1px solid"
                borderColor={fabColors.borderFaint}
                bg="rgb(40, 40, 44)"
              >
              {/* === LM CUSTOMIZATION: MultiImageDrawer START === */}
                {/* 多图预览：使用 NavigableAssetImage 替代 AssetImage，支持 hover 分区切换 + 圆点指示器。
                    合入英伟达新版时：保留本块（NVIDIA 原版无多图预览功能）。 */}
                <NavigableAssetImage
                  result={displayAsset}
                  getHeaders={getHeaders}
                  apiUrl={apiUrl}
                  width="100%"
                  height="100%"
                  borderRadius="0"
                  objectFit="cover"
                  onProgressiveLoadComplete={(images, maxOff) => {
                    // 自动跳转到第一张有效（非黑）图
                    if (images && images.size > 1) {
                      const urls = [];
                      for (let i = 0; i <= maxOff; i++) {
                        urls.push(images.get(i) || null);
                      }
                      findFirstValidImageIndex(urls).then(validIdx => {
                        // 通过 ref 或 state 设置 initialOffset 不太方便，
                        // 这里通过 onOffsetChange 的反向通知来实现
                        // 实际上 NavigableAssetImage 内部会在 progressive load 完成后
                        // 自动使用 offset 0，如果 0 是黑图则需要外部干预
                        // 但由于组件已挂载，我们通过 key 强制重新渲染来设置 initialOffset
                        if (validIdx > 0) {
                          setDrawerInitialOffset(validIdx);
                        }
                      });
                    }
                  }}
                  initialOffset={drawerInitialOffset}
                  key={`${displayAsset?.id || displayAsset?.source?.base_key}-${drawerInitialOffset}`}
                />
                {/* === LM CUSTOMIZATION: MultiImageDrawer END === */}
              </Box>
              {/* 区块 2：标题 = 资产文件名（不再显示完整 url 占两行）+ 路径副信息。
                  v3 TC-A8：路径行右侧紧贴一个复制路径 IconButton（hover 金色）。 */}
              <Box data-section="title">
                <Heading
                  size="md"
                  color={fabColors.textPrimary}
                  noOfLines={2}
                  wordBreak="break-all"
                  letterSpacing="-0.01em"
                  title={meta.nameText}
                >
                  {meta.nameText}
                </Heading>
                {meta.pathText && (
                  // === LM CUSTOMIZATION: detail-modal-revamp START ===
                  <HStack mt={1} spacing={1} align="center">
                    <Text
                      fontSize="xs"
                      color={fabColors.textSecondary}
                      noOfLines={1}
                      title={meta.pathText}
                      fontFamily="mono"
                      flex="1"
                      minW={0}
                    >
                      {meta.pathText}
                    </Text>
                    <Tooltip
                      label={t('detailsDrawerCopyPathTooltip')}
                      placement="top"
                      hasArrow
                      openDelay={400}
                    >
                      <IconButton
                        aria-label={t('detailsDrawerCopyPath')}
                        icon={<CopyIcon />}
                        size="xs"
                        variant="ghost"
                        color={fabColors.textSecondary}
                        _hover={{ color: brandColors.primary, bg: 'rgba(255,210,48,0.08)' }}
                        _active={{ transform: 'scale(0.95)' }}
                        onClick={handleCopyPath}
                        flexShrink={0}
                      />
                    </Tooltip>
                  </HStack>
                  // === LM CUSTOMIZATION: detail-modal-revamp END ===
                )}
              </Box>

              {/* 区块 3：核心元数据（卡片化容器）— v3 TC-A8 字段顺序对齐原 Modal：
                  Source / Path 走上面标题区 / Score / Size / Format / Modified / Created / Tags / Advanced
                  缺失字段不渲染，避免响亮占空间的“—”占位。 */}
              <Box
                data-section="metadata"
                bg={fabColors.bgElevatedHigh}
                borderRadius={fabRadius['2']}
                border="1px solid"
                borderColor={fabColors.borderFaint}
                overflow="hidden"
              >
                <VStack align="stretch" spacing={0}>
                  {/* === LM CUSTOMIZATION: detail-modal-revamp START === */}
                  {/* v3.1：删除 Source/Score 两个字段（用户反馈信息量低），保留 Size/Format/Modified/Created/Creator */}
                  {meta.sizeText ? (
                    <MetaRow label={t('detailsDrawerMetaSize')} value={meta.sizeText} />
                  ) : null}
                  {meta.formatText ? (
                    <MetaRow label={t('detailsDrawerMetaFormat')} value={meta.formatText} />
                  ) : null}
                  {meta.modifiedText ? (
                    <MetaRow label={t('detailsDrawerMetaModified')} value={meta.modifiedText} />
                  ) : null}
                  {meta.createdText ? (
                    <MetaRow label={t('detailsDrawerMetaCreated')} value={meta.createdText} />
                  ) : null}
                  {meta.creatorText ? (
                    <MetaRow label={t('detailsDrawerMetaCreator')} value={meta.creatorText} />
                  ) : null}
                  {/* 全部字段都为空时 fallback：仅显示一行 "Unknown" 提示 */}
                  {!meta.sizeText && !meta.formatText && !meta.modifiedText &&
                   !meta.createdText && !meta.creatorText && (
                    <MetaRow
                      label={t('detailsDrawerMetaSize')}
                      value={t('detailsDrawerMetaUnknown')}
                    />
                  )}
                  {/* === LM CUSTOMIZATION: detail-modal-revamp END === */}
                </VStack>
              </Box>

              {/* 区块 4：tags 区域插槽（B 组填充） */}
              <Box data-section="tags">
                          {/* === LM CUSTOMIZATION: Perf-Drawer-FastSwitch === 用 deferred 版让重组件低优先级渲染 */}
                          {deferredTagsAreaContent ?? (
                  <Text fontSize="xs" color={fabColors.textSecondary} fontStyle="italic">
                    {t('detailsDrawerTagsSlot')}
                  </Text>
                )}
              </Box>

              {/* 区块 5：高级折叠面板—v1.1 去掉金色左边框 + 标题改用 eyebrow.sm */}
              <Box data-section="advanced">
                <Accordion allowToggle defaultIndex={[]}>
                  <AccordionItem border="0">
                    {({ isExpanded }) => (
                      <>
                        <AccordionButton
                          px={fabSpacing['1']}
                          py={fabSpacing['1.5']}
                          _hover={{ bg: fabColors.bgElevatedHigh }}
                          borderRadius={fabRadius['1']}
                          // === LM CUSTOMIZATION: detail-modal-revamp START ===
                          // v1.1：移除 4px 金色左边框（原设计在展开时出现，被用户反馈为“太显眼会抢夺品牌色”）
                          // === LM CUSTOMIZATION: detail-modal-revamp END ===
                        >
                          <HStack flex="1" spacing={fabSpacing['1.5']}>
                            {/* v1.1：折叠箭头放到标题左侧，体积缩小为 14px */}
                            {isExpanded
                              ? <ChevronDownIcon boxSize="14px" color={fabColors.textSecondary} />
                              : <ChevronRightIcon boxSize="14px" color={fabColors.textSecondary} />}
                            <Text
                              fontSize={fabTypo.eyebrow.sm.size}
                              lineHeight={fabTypo.eyebrow.sm.lineHeight}
                              letterSpacing={fabTypo.eyebrow.sm.letterSpacing}
                              fontWeight={fabTypo.eyebrow.sm.weight}
                              color={fabColors.textSecondary}
                              textTransform="uppercase"
                            >
                              {t('detailsDrawerAdvancedTitle')}
                            </Text>
                          </HStack>
                        </AccordionButton>
                        <AccordionPanel
                          px={0}
                          pt={fabSpacing['2']}
                          // === LM CUSTOMIZATION: detail-modal-revamp START ===
                          // v1.1：同上，面板内部也去掉金色左边框
                          // === LM CUSTOMIZATION: detail-modal-revamp END ===
                        >
                          {/* === LM CUSTOMIZATION: Perf-Drawer-FastSwitch === 用 deferred 版让高级面板低优先级渲染 */}
                          {deferredAdvancedPanelContent ?? (
                            <Text fontSize="xs" color={fabColors.textSecondary} fontStyle="italic" px={fabSpacing['3']}>
                              {t('detailsDrawerAdvancedSlot')}
                            </Text>
                          )}
                        </AccordionPanel>
                      </>
                    )}
                  </AccordionItem>
                </Accordion>
              </Box>
            </VStack>
          ) : (
            // 空态
            // === LM CUSTOMIZATION: SelectionDrawer START ===
            <VStack
              align="stretch"
              spacing={fabSpacing['3']}
              role="status"
              aria-busy="true"
              aria-live="polite"
              aria-label={t('detailsDrawerEmptyHint')}
            >
            {/* === LM CUSTOMIZATION: SelectionDrawer END === */}
              <Skeleton
                height="220px"
                borderRadius={fabRadius['3']}
                startColor={fabColors.bgElevatedHigh}
                endColor={fabColors.bgElevatedLow}
                speed={1.0}
              />
              <Skeleton
                height="24px"
                startColor={fabColors.bgElevatedHigh}
                endColor={fabColors.bgElevatedLow}
                speed={1.0}
              />
              <Skeleton
                height="16px"
                width="60%"
                startColor={fabColors.bgElevatedHigh}
                endColor={fabColors.bgElevatedLow}
                speed={1.0}
              />
              <Skeleton
                height="80px"
                startColor={fabColors.bgElevatedHigh}
                endColor={fabColors.bgElevatedLow}
                speed={1.0}
              />
              <Text fontSize="xs" color={fabColors.textSecondary} textAlign="center" mt={2}>
                {t('detailsDrawerEmptyHint')}
              </Text>
            </VStack>
          )}
        </Box>

        {/* 底部操作按钮区：TC-A8 去掉"下载"，仅留 复制路径 + 在 Omniverse 打开 */}
        {displayAsset && (
          <HStack
            px={fabSpacing['4']}
            py={fabSpacing['3']}
            borderTop="1px solid"
            borderColor={fabColors.borderFaint}
            spacing={fabSpacing['2']}
            justify="flex-end"
            flexWrap="wrap"
            bg={`linear-gradient(0deg, rgba(0,0,0,0.2) 0%, transparent 100%)`}
          >
            {actionButtons ?? (
              <>
                {/* v3.5：底部仅保留"复制路径"按钮（删除"在 Omniverse 打开"），升级为黄色主按钮高亮 */}
                <Button
                  size="sm"
                  bg={brandColors.primary}
                  color="black"
                  _hover={{ bg: brandColors.primary, opacity: 0.85, transform: 'translateY(-1px)' }}
                  _active={{ transform: 'translateY(0)' }}
                  transition="all 120ms ease"
                  leftIcon={<CopyIcon />}
                  onClick={handleCopyPath}
                  aria-label={t('detailsDrawerCopyPath')}
                  fontWeight="600"
                >
                  {t('detailsDrawerCopyPath')}
                </Button>
                {/* === LM CUSTOMIZATION: detail-modal-revamp START === */}
                {/* 次按钮：仅当资产含 omniverse_url / nucleus_url 时显示 */}
                {omniverseUrl && (
                  <Tooltip label={omniverseUrl} placement="top" hasArrow openDelay={500}>
                    <Button
                      size="sm"
                      variant="outline"
                      borderColor={brandColors.primary}
                      color={brandColors.primary}
                      _hover={{ bg: 'rgba(255,210,48,0.08)' }}
                      leftIcon={<ExternalLinkIcon />}
                      onClick={handleOpenInOmniverse}
                      aria-label={t('detailsDrawerOpenInOmniverse')}
                    >
                      {t('detailsDrawerOpenInOmniverse')}
                    </Button>
                  </Tooltip>
                )}
                {/* 图标按钮：刷新高级面板数据（依赖/反向依赖/USD 属性） */}
                <Tooltip label={t('detailsDrawerRefreshAll')} placement="top" hasArrow openDelay={400}>
                  <IconButton
                    aria-label={t('detailsDrawerRefreshAll')}
                    icon={<RepeatIcon />}
                    size="sm"
                    variant="ghost"
                    color={fabColors.iconPrimary}
                    isLoading={refreshSpinning}
                    onClick={handleRefreshMetadata}
                  />
                </Tooltip>
                {/* === LM CUSTOMIZATION: detail-modal-revamp END === */}
              </>
            )}
          </HStack>
        )}
      </DrawerContent>
    </Drawer>
  );
};

export default React.memo(AssetDetailsDrawer);
