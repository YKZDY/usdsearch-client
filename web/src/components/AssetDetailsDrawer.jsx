/**
 * AssetDetailsDrawer — Group A 任务 4 骨架版 + 任务 5 内部布局
 *
 * 用途：替代 AssetDetailsModal，作为右侧详情抽屉的容器组件。
 * 任务 4：骨架 + 插槽 + 折叠态 + 关闭逻辑 ✅
 * 任务 5：5 个区块的具体内容（预览 / 标题 / 元数据 / tags 插槽 / 高级 Accordion）+ 底部操作按钮
 *
 * 设计契约（详见 DRAWER-API.md）：
 *  - placement="right"
 *  - 不阻挡背后列表点击：blockScrollOnMount=false + 透明遮罩
 *  - 折叠态切换：480px ↔ 56px，localStorage 持久化
 *  - 关闭：Esc / 关闭按钮 / 点遮罩
 *  - props.advancedPanelContent / tagsAreaContent 为 B 组提供的插槽
 *
 * Group A ↔ B 契约：
 *  - B 组通过 `tagsAreaContent` 注入完整 tag 编辑器
 *  - B 组通过 `advancedPanelContent` 注入折叠的高级面板（依赖/USD属性/索引管理等）
 *  - 抽屉本身不持有这些状态，纯作为容器透传
 */
import React, { useEffect, useRef, useCallback } from 'react';
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
} from '@chakra-ui/react';
import {
  ChevronRightIcon,
  ChevronLeftIcon,
  CopyIcon,
  ExternalLinkIcon,
  DownloadIcon,
} from '@chakra-ui/icons';
import { useTranslation } from '../i18n/LanguageContext';
import { fabColors, fabRadius, fabSpacing, brandColors } from '../theme/fabTokens';
import AssetImage from './AssetImage';
import { formatFileSize, formatDate } from '../utils/formatUtils';

const COLLAPSED_KEY = 'detailsDrawerCollapsed';
const DRAWER_WIDTH_EXPANDED = '480px';
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

/** 从 url / base_key 中推断格式后缀（usd / usda / usdz / png / jpg ...） */
function inferFormat(asset) {
  const path = asset?.source?.url || asset?.source?.base_key || asset?.url || '';
  const m = String(path).match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/);
  return m ? m[1].toUpperCase() : null;
}

/**
 * 单条元数据：左标签 + 右值。窄宽时也保持单行 truncate。
 */
const MetaRow = React.memo(function MetaRow({ label, value, title }) {
  return (
    <Flex
      direction={{ base: 'column', sm: 'row' }}
      gap={{ base: 0, sm: fabSpacing['3'] }}
      align={{ base: 'flex-start', sm: 'baseline' }}
      py={1}
      borderBottom="1px solid"
      borderColor={fabColors.borderFaint}
    >
      <Text
        fontSize="xs"
        color={fabColors.textSecondary}
        minW={{ sm: '88px' }}
        flexShrink={0}
      >
        {label}
      </Text>
      <Text
        fontSize="sm"
        color={fabColors.textPrimary}
        noOfLines={1}
        title={title || (typeof value === 'string' ? value : undefined)}
        wordBreak="break-all"
      >
        {value}
      </Text>
    </Flex>
  );
});

/**
 * AssetDetailsDrawer
 *
 * @param {object}        props
 * @param {boolean}       props.isOpen           是否打开
 * @param {object|null}   props.asset            当前展示的资产对象（null 时显示空态骨架）
 * @param {() => void}    props.onClose          关闭回调（Esc / 关闭按钮 / 遮罩）
 * @param {(asset)=>void} [props.onSelectAsset]  抽屉内切换资产（如下一个 / 上一个），任务 8 用
 * @param {ReactNode}     [props.tagsAreaContent]      tags 区域插槽（B 组填充）
 * @param {ReactNode}     [props.advancedPanelContent] 高级折叠面板插槽（B 组填充）
 * @param {ReactNode}     [props.actionButtons]        底部操作按钮区插槽（覆盖默认按钮，可选）
 * @param {() => object}  [props.getHeaders]     用于 AssetImage 拉真实图（鉴权头）
 * @param {string}        [props.apiUrl]         用于 AssetImage 的 API base
 * @param {string}        [props.serverUrl]      Omniverse 跳转用的 server URL（任务 5 操作按钮）
 * @param {(text)=>void}  [props.copyToClipboard] 复制到剪贴板回调（来自父组件）
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
  const [collapsed, setCollapsed] = React.useState(readCollapsedState);
  const triggerElementRef = useRef(null);
  const toast = useToast();

  // 移动端强制全屏宽度（不受 collapsed 控制）
  const responsiveWidth = useBreakpointValue({
    base: '100vw',
    md: collapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH_EXPANDED,
  });

  /** 切换折叠态（持久化） */
  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsedState(next);
      return next;
    });
  }, []);

  /** 抽屉打开前记录触发元素，关闭后焦点回归（a11y） */
  useEffect(() => {
    if (isOpen) {
      triggerElementRef.current = document.activeElement;
    } else if (triggerElementRef.current && typeof triggerElementRef.current.focus === 'function') {
      // 关闭后让焦点回到触发卡片（避免焦点丢到 body）
      try {
        triggerElementRef.current.focus({ preventScroll: true });
      } catch (_) {
        /* ignore */
      }
      triggerElementRef.current = null;
    }
  }, [isOpen]);

  /** 服务器切换时强制关闭抽屉（避免展示无效数据） */
  useEffect(() => {
    const handler = () => {
      if (isOpen) onClose?.();
    };
    window.addEventListener('server-changed', handler);
    return () => window.removeEventListener('server-changed', handler);
  }, [isOpen, onClose]);

  /** 复制路径：优先用父组件传的 copyToClipboard，否则走 navigator.clipboard */
  const handleCopyPath = useCallback(() => {
    const text = asset?.source?.url || asset?.source?.base_key || asset?.url || '';
    if (!text) return;
    if (typeof copyToClipboard === 'function') {
      copyToClipboard(text);
      return;
    }
    try {
      navigator.clipboard?.writeText(text);
      toast?.({ title: t('detailsDrawerCopyPath'), status: 'success', duration: 1500 });
    } catch (_) {
      /* ignore */
    }
  }, [asset, copyToClipboard, toast, t]);

  /** 在 Omniverse 打开（暂用 omniverse:// 协议；占位实现） */
  const handleOpenInOmniverse = useCallback(() => {
    const url = asset?.source?.url || asset?.source?.base_key || '';
    if (!url) return;
    const omniUrl = url.startsWith('omniverse://') ? url : `omniverse://${url.replace(/^https?:\/\//, '')}`;
    try {
      window.open(omniUrl, '_self');
    } catch (_) {
      /* ignore */
    }
  }, [asset]);

  /** 下载（占位：直接打开原 URL） */
  const handleDownload = useCallback(() => {
    const url = asset?.source?.url || asset?.source?.base_key || '';
    if (!url) return;
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = '';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
    } catch (_) {
      /* ignore */
    }
  }, [asset]);

  // 折叠时只显示一条窄竖条 + 展开按钮
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
        // 原因：折叠态保持与展开态一致的 220ms slide-in 动画契约
        // 合入英伟达新版时：原版无 Drawer，可保留
        motionPreset="slideInRight"
        preserveScrollBarGap
        // === LM CUSTOMIZATION: SelectionDrawer END ===
      >
        {/* 透明遮罩：不挡背后点击，但点击仍触发关闭 */}
        <DrawerOverlay bg="transparent" />
        <DrawerContent
          maxW={DRAWER_WIDTH_COLLAPSED}
          bg={fabColors.bgElevatedLow}
          borderLeft="1px solid"
          borderColor={fabColors.borderSubdued}
          boxShadow="-4px 0 24px rgba(0,0,0,0.3)"
        >
          <Flex direction="column" align="center" pt={fabSpacing['3']} gap={fabSpacing['2']}>
            <IconButton
              aria-label={t('detailsDrawerExpand')}
              icon={<ChevronLeftIcon />}
              size="sm"
              variant="ghost"
              onClick={toggleCollapsed}
            />
            <DrawerCloseButton position="static" />
          </Flex>
        </DrawerContent>
      </Drawer>
    );
  }

  // 提取出元数据（提前算，asset 可能为 null）
  const sizeText = asset?.source?.size != null ? formatFileSize(asset.source.size) : null;
  const formatText = inferFormat(asset);
  const modifiedText = asset?.source?.modified_timestamp || asset?.source?.created_timestamp
    ? formatDate(asset?.source?.modified_timestamp || asset?.source?.created_timestamp)
    : null;
  const creatorText = asset?.source?.created_by || null;
  const pathText = asset?.source?.url || asset?.url || asset?.source?.base_key || '';
  const titleText = asset?.name || asset?.source?.base_key || asset?.id || '—';

  return (
    <Drawer
      isOpen={isOpen}
      placement="right"
      onClose={onClose}
      blockScrollOnMount={false}
      trapFocus
      autoFocus={false}
      // === LM CUSTOMIZATION: SelectionDrawer START ===
      // 原因：方案 B 需要稳定的 220ms slide-in 动画契约（任务 8 a11y/性能调优）
      // 合入英伟达新版时：原版无 Drawer，可保留这两条 prop
      motionPreset="slideInRight"
      preserveScrollBarGap
      // === LM CUSTOMIZATION: SelectionDrawer END ===
      // 关闭快捷键由 Chakra 默认处理 Esc
    >
      <DrawerOverlay bg="transparent" />
      <DrawerContent
        maxW={responsiveWidth}
        bg={fabColors.bgElevatedLow}
        borderLeft="1px solid"
        borderColor={fabColors.borderSubdued}
        boxShadow="-4px 0 24px rgba(0,0,0,0.3)"
      >
        <DrawerCloseButton aria-label={t('detailsDrawerClose')} />

        {/* 顶栏：折叠按钮（桌面端） */}
        <Flex
          align="center"
          justify="space-between"
          px={fabSpacing['4']}
          py={fabSpacing['2']}
          borderBottom="1px solid"
          borderColor={fabColors.borderFaint}
        >
          <Heading size="sm" color={fabColors.textPrimary}>
            {t('detailsDrawerTitle')}
          </Heading>
          <IconButton
            aria-label={t('detailsDrawerCollapse')}
            icon={<ChevronRightIcon />}
            size="sm"
            variant="ghost"
            display={{ base: 'none', md: 'inline-flex' }}
            onClick={toggleCollapsed}
          />
        </Flex>

        {/* 内容滚动区 */}
        <Box
          flex="1"
          overflowY="auto"
          px={fabSpacing['4']}
          py={fabSpacing['3']}
        >
          {asset ? (
            <VStack align="stretch" spacing={fabSpacing['4']}>
              {/* 区块 1：顶部预览（真实 AssetImage） */}
              <Box
                data-section="preview"
                bg="blackAlpha.300"
                borderRadius={fabRadius['2']}
                overflow="hidden"
                display="flex"
                alignItems="center"
                justifyContent="center"
                minH="220px"
                maxH="280px"
              >
                <AssetImage
                  result={asset}
                  getHeaders={getHeaders}
                  apiUrl={apiUrl}
                  width="100%"
                  height="280px"
                  borderRadius="0"
                />
              </Box>

              {/* 区块 2：标题 / 路径 */}
              <Box data-section="title">
                <Heading size="md" noOfLines={2} color={fabColors.textPrimary}>
                  {titleText}
                </Heading>
                <Text
                  fontSize="xs"
                  color={fabColors.textSecondary}
                  noOfLines={1}
                  title={pathText}
                  mt={1}
                >
                  {pathText}
                </Text>
              </Box>

              {/* 区块 3：核心元数据（DefinitionList 风格，窄宽自动单列） */}
              <Box data-section="metadata">
                <VStack align="stretch" spacing={0}>
                  <MetaRow
                    label={t('detailsDrawerMetaSize')}
                    value={sizeText || t('detailsDrawerMetaUnknown')}
                  />
                  <MetaRow
                    label={t('detailsDrawerMetaFormat')}
                    value={formatText || t('detailsDrawerMetaUnknown')}
                  />
                  <MetaRow
                    label={t('detailsDrawerMetaModified')}
                    value={modifiedText || t('detailsDrawerMetaUnknown')}
                  />
                  <MetaRow
                    label={t('detailsDrawerMetaCreator')}
                    value={creatorText || t('detailsDrawerMetaUnknown')}
                  />
                </VStack>
              </Box>

              {/* 区块 4：tags 区域插槽（B 组填充） */}
              <Box data-section="tags">
                {tagsAreaContent ?? (
                  <Text fontSize="xs" color={fabColors.textSecondary}>
                    {t('detailsDrawerTagsSlot')}
                  </Text>
                )}
              </Box>

              {/* 区块 5：高级折叠面板（默认折叠，B 组填 advancedPanelContent） */}
              <Box data-section="advanced">
                <Accordion allowToggle defaultIndex={[]}>
                  <AccordionItem border="0">
                    <AccordionButton
                      px={2}
                      py={2}
                      _hover={{ bg: fabColors.bgElevatedHigh }}
                      borderRadius={fabRadius['1']}
                    >
                      <Box flex="1" textAlign="left" fontSize="sm" color={fabColors.textSecondary}>
                        {t('detailsDrawerAdvancedTitle')}
                      </Box>
                      <AccordionIcon />
                    </AccordionButton>
                    <AccordionPanel px={0} pt={2}>
                      {advancedPanelContent ?? (
                        <Text fontSize="xs" color={fabColors.textSecondary}>
                          {t('detailsDrawerAdvancedSlot')}
                        </Text>
                      )}
                    </AccordionPanel>
                  </AccordionItem>
                </Accordion>
              </Box>
            </VStack>
          ) : (
            // 空态：asset 为 null 时显示骨架 + 引导文案
            // === LM CUSTOMIZATION: SelectionDrawer START ===
            // 原因：任务 8 a11y — 给 Skeleton 加载态加 role/aria，屏幕阅读器可识别"加载中"
            // 合入英伟达新版时：原版无 Drawer，可保留
            <VStack
              align="stretch"
              spacing={fabSpacing['3']}
              role="status"
              aria-busy="true"
              aria-live="polite"
              aria-label={t('detailsDrawerEmptyHint')}
            >
            {/* === LM CUSTOMIZATION: SelectionDrawer END === */}
              <Skeleton height="220px" borderRadius={fabRadius['2']} />
              <Skeleton height="24px" />
              <Skeleton height="16px" width="60%" />
              <Skeleton height="80px" />
              <Text fontSize="xs" color={fabColors.textSecondary} textAlign="center" mt={2}>
                {t('detailsDrawerEmptyHint')}
              </Text>
            </VStack>
          )}
        </Box>

        {/* 底部操作按钮区：actionButtons 优先；否则渲染默认 3 按钮 */}
        {asset && (
          <HStack
            px={fabSpacing['4']}
            py={fabSpacing['3']}
            borderTop="1px solid"
            borderColor={fabColors.borderFaint}
            spacing={fabSpacing['2']}
            justify="flex-end"
            flexWrap="wrap"
          >
            {actionButtons ?? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<CopyIcon />}
                  onClick={handleCopyPath}
                  aria-label={t('detailsDrawerCopyPath')}
                >
                  {t('detailsDrawerCopyPath')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<DownloadIcon />}
                  onClick={handleDownload}
                  aria-label={t('detailsDrawerDownload')}
                >
                  {t('detailsDrawerDownload')}
                </Button>
                <Button
                  size="sm"
                  bg={brandColors.primary}
                  color="black"
                  _hover={{ bg: brandColors.primary, opacity: 0.85 }}
                  leftIcon={<ExternalLinkIcon />}
                  onClick={handleOpenInOmniverse}
                  aria-label={t('detailsDrawerOpenInOmniverse')}
                >
                  {t('detailsDrawerOpenInOmniverse')}
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
