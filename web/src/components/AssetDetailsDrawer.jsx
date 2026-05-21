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
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
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
  CopyIcon,
} from '@chakra-ui/icons';
import { useTranslation } from '../i18n/LanguageContext';
import { fabColors, fabRadius, fabSpacing, brandColors } from '../theme/fabTokens';
import AssetImage from './AssetImage';
import { formatFileSize, formatDate } from '../utils/formatUtils';

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
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(readCollapsedState);
  const [drawerWidth, setDrawerWidth] = useState(readDrawerWidth);
  const triggerElementRef = useRef(null);
  const toast = useToast();

  // === LM CUSTOMIZATION: SelectionDrawer START ===
  // TC-A4 修复：缓存最后一次非空 asset。当父组件短暂传入 null（切换中间态）时，
  // displayAsset 仍展示旧内容，避免空态/Skeleton 闪现导致的"关闭再打开"视觉错觉。
  // 仅当 isOpen=false 时才清空 displayAsset。
  const [displayAsset, setDisplayAsset] = useState(asset || null);
  useEffect(() => {
    if (asset) {
      setDisplayAsset(asset);
    } else if (!isOpen) {
      setDisplayAsset(null);
    }
    // 抽屉打开但 asset 暂时为 null：保留 displayAsset 不变（防闪烁）
  }, [asset, isOpen]);
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


  // === LM CUSTOMIZATION: SelectionDrawer START ===
  // TC-A8 元数据预算（用 displayAsset 取值，配合 useMemo 减少重算）
  // v3.1：用户反馈来源/评分信息量低且不友好，删除这两个字段。
  const meta = useMemo(() => {
    const a = displayAsset;
    const sizeText = a?.source?.size != null ? formatFileSize(a.source.size) : null;
    const formatText = inferFormat(a);
    const modifiedRaw = a?.source?.modified_timestamp;
    const createdRaw = a?.source?.created_timestamp;
    const modifiedText = modifiedRaw ? formatDate(modifiedRaw) : null;
    const createdText = createdRaw ? formatDate(createdRaw) : null;
    const creatorText = a?.source?.created_by || null;
    const pathText = a?.source?.url || a?.url || a?.source?.base_key || '';
    const nameText = inferAssetName(a);
    return { sizeText, formatText, modifiedText, createdText, creatorText, pathText, nameText };
  }, [displayAsset]);
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
        {/* v3.5 决策：放弃"抽屉打开期间外部可交互"目标（A 方案）。
            历经多轮调试无法稳定实现：DrawerOverlay 的事件透传与 Chakra 内部焦点/动画管理
            存在难以根除的副作用。回归保守策略 — overlay 透明但保留事件接收，
            配合 closeOnOverlayClick={false} 使外部点击"无副作用"（不假死、也不误关）。
            真正的"点空白关抽屉"由 useDrawerCloseGuard 接管。
            合入英伟达新版时：保留本块；属性与原版兼容。 */}
        <DrawerOverlay bg="transparent" />
        {/* === LM CUSTOMIZATION: SelectionDrawer END === */}
        <DrawerContent
          maxW={DRAWER_WIDTH_COLLAPSED}
          bg={fabColors.bgElevatedLow}
          borderLeft="1px solid"
          borderColor={fabColors.borderSubdued}
          boxShadow="-4px 0 24px rgba(0,0,0,0.3)"
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
      {/* v3.5 决策：放弃 A 方案，详见 collapsed 分支同位置注释。 */}
      <DrawerOverlay bg="transparent" />
      {/* === LM CUSTOMIZATION: SelectionDrawer END === */}
      <DrawerContent
        maxW={responsiveWidth}
        bg={fabColors.bgElevatedLow}
        borderLeft="1px solid"
        borderColor={fabColors.borderSubdued}
        boxShadow="-8px 0 32px rgba(0,0,0,0.45)"
        position="relative"
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
                {/* === LM CUSTOMIZATION: detail-modal-revamp START === */}
                {/* v3.3：直接用 cover 撑满预览容器，与 VirtualizedHybridSearchResults 行 429 一致。
                    资产 PNG 自带的棋盘格作为质感纹理保留（与卡片视觉统一）。 */}
                <AssetImage
                  result={displayAsset}
                  getHeaders={getHeaders}
                  apiUrl={apiUrl}
                  width="100%"
                  height="100%"
                  borderRadius="0"
                  objectFit="cover"
                />
                {/* === LM CUSTOMIZATION: detail-modal-revamp END === */}
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
                {tagsAreaContent ?? (
                  <Text fontSize="xs" color={fabColors.textSecondary} fontStyle="italic">
                    {t('detailsDrawerTagsSlot')}
                  </Text>
                )}
              </Box>

              {/* 区块 5：高级折叠面板—v3 TC-A8：展开时左侧出现金色 4px 竖线强调 */}
              <Box data-section="advanced">
                <Accordion allowToggle defaultIndex={[]}>
                  <AccordionItem border="0">
                    {({ isExpanded }) => (
                      <>
                        <AccordionButton
                          px={fabSpacing['3']}
                          py={fabSpacing['2']}
                          _hover={{ bg: fabColors.bgElevatedHigh }}
                          borderRadius={fabRadius['1']}
                          // === LM CUSTOMIZATION: detail-modal-revamp START ===
                          borderLeft="4px solid"
                          borderLeftColor={isExpanded ? brandColors.primary : 'transparent'}
                          transition="border-left-color 180ms ease, background 120ms ease"
                          // === LM CUSTOMIZATION: detail-modal-revamp END ===
                        >
                          <Box flex="1" textAlign="left" fontSize="sm" color={fabColors.textSecondary}>
                            {t('detailsDrawerAdvancedTitle')}
                          </Box>
                          <AccordionIcon />
                        </AccordionButton>
                        <AccordionPanel
                          px={0}
                          pt={fabSpacing['2']}
                          // === LM CUSTOMIZATION: detail-modal-revamp START ===
                          borderLeft="4px solid"
                          borderLeftColor={isExpanded ? brandColors.primary : 'transparent'}
                          transition="border-left-color 180ms ease"
                          // === LM CUSTOMIZATION: detail-modal-revamp END ===
                        >
                          {advancedPanelContent ?? (
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
              </>
            )}
          </HStack>
        )}
      </DrawerContent>
    </Drawer>
  );
};

export default React.memo(AssetDetailsDrawer);
