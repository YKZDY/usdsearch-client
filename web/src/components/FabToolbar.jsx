// === LM CUSTOMIZATION: Fab-style Toolbar (v2 — full filter integration) ===
// 对齐 Fab 实测规格（docs/Fab改造/扒取产出/）：
//   - 10 个筛选按钮 + 排序下拉 + 设置图标
//   - Popover 风格：rgba(48,48,52,0.7) + backdrop-filter blur(50px) + radius 12px
//   - v2: 所有 SearchFilters 面板功能融入 Popover 按钮，取消左侧面板
//   - 设置图标：显示控件(去重/预览/分数/视图) + 搜索设置 + 混合搜索入口

// === LM CUSTOMIZATION: ViewSettingsRefactor START ===
// 原因：把原"显示设置" Popover 改名为"视图设置"，并拆走搜索类项到独立的 SearchSettingsPopover
//        （顶栏齿轮触发，组件位于 components/SearchSettingsPopover.jsx）。
//        因需要互斥（开视图设置时关闭搜索设置；反之亦然），把原本 uncontrolled 的 Popover
//        改造成受控（useDisclosure + 监听 close-view-settings CustomEvent）。
//        因此 import 列表新增 useEffect（react）+ useDisclosure（chakra）+ 删掉 RadioGroup/Radio
//        （随"搜索方法"一并被 LM 注释化保留，下方仍能 git 追溯）。
// 合入英伟达新版时：保留新增 import；如英伟达将来想恢复"搜索方法"等项，可以从下方 LM 注释
//        块里恢复对应 RadioGroup/Radio JSX 与 import。
import React, { useCallback, useEffect } from 'react';
import ResultsTitleBar from './ResultsTitleBar';
import {
  Box,
  HStack,
  VStack,
  Button,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  Portal,
  FormControl,
  FormLabel,
  Text,
  IconButton,
  Switch,
  // Divider,  // 4.6b 清理后不再使用；NVIDIA 合入时以此注释作为对照点
  // RadioGroup,  // 随"搜索方法"被搬到 SearchSettingsPopover；保留位置便于 NVIDIA 合入对照
  // Radio,
  useDisclosure,
} from '@chakra-ui/react';
// === LM CUSTOMIZATION: ViewSettingsRefactor END ===
import {
  SettingsIcon,
  ChevronDownIcon,
  ViewIcon,
  // HamburgerIcon,  // List 视图按钮被 HideListView 注释后未使用；恢复 List 视图时重新启用
  AddIcon,
  MinusIcon,
} from '@chakra-ui/icons';
import { useTranslation } from '../i18n/LanguageContext';
import './FabToolbar.css';

// === LM CUSTOMIZATION: v3 modular filter components ===
import PrecisionFilter from './filters/PrecisionFilter';
import SizeFilter from './filters/SizeFilter';
import DateFilter from './filters/DateFilter';
import DimensionFilter from './filters/DimensionFilter';
import FormatFilter from './filters/FormatFilter';
import TagsFilter from './filters/TagsFilter';
import UserFilter from './filters/UserFilter';
import PathFilter from './filters/PathFilter';
import { FilterGroupProvider } from './filters/FilterGroupContext';
// 复用 FilterPopoverButton 导出的 Popover 面板样式（实色 + isolation + contain，
// 已修 framer-motion 合成层导致的 children 穿透/图层裸露 bug）。
// 之前本地重复声明了一份半透明 + backdrop-filter 的旧版，shadow 了这个 import，
// 导致排序/设置两个 Popover 和下方卡片互相穿透，本次删除旧声明统一视觉。
import { popoverContentSx } from './filters/FilterPopoverButton';
// === END LM CUSTOMIZATION ===

const filterButtonSx = {
  h: '32px',
  minH: '32px',
  px: 3,
  fontSize: '12px',
  fontWeight: 500,
  color: 'rgba(255,255,255,0.85)',
  bg: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '6px',
  _hover: { bg: 'rgba(255,255,255,0.1)', color: '#ffffff' },
  _active: { bg: 'rgba(255,255,255,0.15)' },
};


/** 通用 Popover 筛选按钮（MT 反馈暂不需要，注释保留）*/
// function ComingSoonButton({ label, comingSoonText }) {
//   return (
//     <Button
//       size="sm"
//       rightIcon={<ChevronDownIcon boxSize={3} />}
//       sx={filterButtonSx}
//       opacity={0.45}
//       cursor="not-allowed"
//       _hover={{}}
//       title={comingSoonText}
//     >
//       {label}
//     </Button>
//   );
// }


const DEFAULT_SORT_OPTIONS = [
  { value: 'relevance', labelKey: 'sortRelevance', fallback: { en: 'Relevance', zh: '相关度' } },
  // 用户要求隐藏「标签命中优先」选项（排序逻辑本身在 HybridDeepSearchUI 保留，若外部以 sortBy='tagHitFirst'
  // 传入仍会生效，只是 UI 下拉里不再暴露）。如需恢复，取消下一行注释即可。
  // { value: 'tagHitFirst', labelKey: 'sortModeTagHitFirst', fallback: { en: 'Tag-hit first', zh: '标签命中优先' } },
  { value: 'newest',    labelKey: 'sortNewest',    fallback: { en: 'Newest',    zh: '最新' } },
  { value: 'oldest',    labelKey: 'sortOldest',    fallback: { en: 'Oldest',    zh: '最旧' } },
  { value: 'name-asc',  labelKey: 'sortNameAsc',   fallback: { en: 'Name A-Z',  zh: '名称 A-Z' } },
  { value: 'name-desc', labelKey: 'sortNameDesc',  fallback: { en: 'Name Z-A',  zh: '名称 Z-A' } },
];

/**
 * FabToolbar 主组件 (v2)
 */
function FabToolbar({
  searchParams,
  handleChange,
  setSearchParams,
  onTriggerSearch,
  sortBy = 'relevance',
  onSortChange,
  // v2 新增 props：显示控件
  showScores,
  onShowScoresChange,
  showOnlyWithPreviews,
  // v3 路径筛选：混合目录树（由 usePathSuggestions 产出）
  pathTree = [],
  treeStatus,
  treeError,
  onRefreshTree,
  onShowOnlyWithPreviewsChange,
  viewMode,
  onSetViewModeList,
  onSetViewModeGrid,
  gridSize,
  onToggleGridSize,
  deduplicateByHash,
  onRemoveDuplicatesChange,
  // v2 新增：混合搜索配置入口
  onOpenHybridConfig,
  // v3 新增：搜索词联动标签（保留仅用于向后兼容）
  searchQuery = '',
  onSearchQueryChange,
  // === LM CUSTOMIZATION: Search/Tag decoupling — v4 受控标签数组 & 已固化搜索词 & 分类 tag ===
  selectedTags = [],
  onSelectedTagsChange,
  globalTags = [],
  committedQuery = '',
  onCommittedQueryChange,
  categoryTag = '',
  onCategoryTagChange,
  // === END v4 ===
  // v3 新增：搜索结果（供 TagsFilter/UserFilter 提取已有值）
  results = [],
  // === v5 合并行：TitleBar + 结果计数内嵌到 toolbar ===
  titleBarProps = null,
  resultCount = 0,
}) {
  const { t, language } = useTranslation();

  const tr = useCallback((key, fallback) => {
    const v = t?.(key);
    if (v && v !== key) return v;
    return fallback?.[language] || fallback?.en || key;
  }, [t, language]);

  // 适配器：子组件使用 handleChange(key, val) 形式，直接更新 searchParams
  const filterHandleChange = useCallback((key, val) => {
    setSearchParams(prev => ({ ...prev, [key]: val }));
  }, [setSearchParams]);

  // === LM CUSTOMIZATION: ViewSettingsRefactor START ===
  // 视图设置 Popover 受控状态：与 SearchSettingsPopover 互斥
  //   - 打开本 Popover 时派发 close-search-settings 关闭对方
  //   - 监听 close-view-settings 由对方派发，关闭本 Popover
  // 合入英伟达新版时：本块保留即可；如英伟达原版未来增加多 Popover 互斥，
  //   也是同样的事件总线模式，不会冲突。
  const viewSettings = useDisclosure();
  useEffect(() => {
    const handleClose = () => viewSettings.onClose();
    window.addEventListener('close-view-settings', handleClose);
    return () => window.removeEventListener('close-view-settings', handleClose);
  }, [viewSettings]);
  // 4.8 UX 修复：与 SearchSettingsPopover 一致改为 toggle 语义。
  //   原写法只调 onOpen()，导致"打开后再点齿轮无反应"（已开 → onOpen 是 noop，
  //   且本身 onClick 覆盖了 PopoverTrigger 的默认 toggle 行为）。
  //   现在：未开则开 + 派发互斥事件；已开则关（不派事件，避免误关搜索设置）。
  const handleOpenViewSettings = useCallback(() => {
    if (viewSettings.isOpen) {
      viewSettings.onClose();
      return;
    }
    // 互斥：通知搜索设置 Popover 关闭（仅在 "即将打开" 时）
    window.dispatchEvent(new CustomEvent('close-search-settings'));
    viewSettings.onOpen();
  }, [viewSettings]);
  // === LM CUSTOMIZATION: ViewSettingsRefactor END ===

  // const comingSoon = tr('fabToolbarComingSoon', { en: 'Coming soon', zh: '即将上线' });


  // ── 清空工具 ──
  const clearFormat = useCallback(() => {
    setSearchParams(prev => ({
      ...prev,
      file_name: '',
      exclude_file_name: '',
      file_extension_include: '',
      file_extension_exclude: 'usd,usda,usdc,usdz,jpg,png',
    }));
  }, [setSearchParams]);

  const clearPrecision = useCallback(() => {
    setSearchParams(prev => ({ ...prev, similarity_threshold: '', cutoff_threshold: '' }));
  }, [setSearchParams]);

  const clearPath = useCallback(() => {
    setSearchParams(prev => ({
      ...prev,
      search_path: '', exclude_search_path: '', search_in_scene: '', filter_url_regexp: '',
    }));
  }, [setSearchParams]);

  const clearSize = useCallback(() => {
    setSearchParams(prev => ({
      ...prev,
      file_size_greater_than: '', file_size_less_than: '',
    }));
  }, [setSearchParams]);

  const clearDate = useCallback(() => {
    setSearchParams(prev => ({
      ...prev,
      created_after: '', created_before: '', modified_after: '', modified_before: '',
    }));
  }, [setSearchParams]);

  const clearUser = useCallback(() => {
    setSearchParams(prev => ({
      ...prev,
      created_by: '', exclude_created_by: '', modified_by: '', exclude_modified_by: '',
    }));
  }, [setSearchParams]);

  const clearDimension = useCallback(() => {
    setSearchParams(prev => ({
      ...prev,
      min_bbox_x: '', max_bbox_x: '', min_bbox_y: '', max_bbox_y: '', min_bbox_z: '', max_bbox_z: '',
      bbox_use_scaled_dimensions: true,
    }));
  }, [setSearchParams]);

  return (
    <Box className="fab-toolbar">
      {/* === v6 Header 行：结果状态（query + categoryTag + 计数 + 分数区间），一行贯通 ===
          [图片搜索 banner 空白修复] imageSearchActive=true 时整体跳过该容器：
          - 子组件 ResultsTitleBar 内部本就 return null，但外层 Box 仍占 min-height:32px
            + 父级 flex gap:10px ≈ 42px 纯空白条带（与"查找相似"激活态视觉割裂）。
          - 图片搜索 banner 已自带"找到 N 个相似资产"文案（HybridDeepSearchUI.jsx 第 2785 行附近），
            此 Header 行在该态下本就冗余，整体不渲染信息无丢失。 */}
      {!titleBarProps?.imageSearchActive && (
        <Box className="fab-toolbar-header-row">
          <ResultsTitleBar
            t={t}
            committedQuery={titleBarProps?.committedQuery || ''}
            categoryTag={titleBarProps?.categoryTag || ''}
            categoryLabel={titleBarProps?.categoryLabel || ''}
            onRemoveQuery={titleBarProps?.onRemoveQuery}
            onRemoveCategory={titleBarProps?.onRemoveCategory}
            imageSearchActive={titleBarProps?.imageSearchActive || false}
            resultCount={resultCount}
            isResultShortage={titleBarProps?.isResultShortage || false}
            userLimit={titleBarProps?.userLimit || 0}
            scoreRange={(() => {
              if (!showScores || !Array.isArray(results) || results.length === 0) return null;
              const scores = results.map(r => r?.score ?? 0).filter(s => s > 0);
              if (scores.length === 0) return null;
              return { min: Math.min(...scores), max: Math.max(...scores) };
            })()}
          />
        </Box>
      )}

      <HStack spacing={2} flexWrap="wrap" align="center">
        {/* FilterGroupProvider：让 8 个 FilterPopoverButton 互斥打开（同一时刻只开一个）；
            右侧排序 / 设置是独立 Popover（不消费此 context），所以放在 Provider 内也不会受影响 */}
        <FilterGroupProvider>

        {/* ── 1. 格式 ── */}
        <FormatFilter
          searchParams={searchParams}
          handleChange={filterHandleChange}
          onTriggerSearch={onTriggerSearch}
          t={t}
        />

        {/* ── 2. 标签 ── */}
        <TagsFilter
          selectedTags={selectedTags}
          onSelectedTagsChange={onSelectedTagsChange}
          onTriggerSearch={onTriggerSearch}
          results={results}
          globalTags={globalTags}
          t={t}
        />

        {/* ── 3. 精度 ── */}
        <PrecisionFilter
          searchParams={searchParams}
          handleChange={filterHandleChange}
          onTriggerSearch={onTriggerSearch}
          t={t}
        />

        {/* ── 4. 路径 ── */}
        <PathFilter
          searchParams={searchParams}
          handleChange={filterHandleChange}
          onTriggerSearch={onTriggerSearch}
          t={t}
          pathTree={pathTree}
          treeStatus={treeStatus}
          treeError={treeError}
          onRefreshTree={onRefreshTree}
        />

        {/* ── 5. 大小 ── */}
        <SizeFilter
          searchParams={searchParams}
          handleChange={filterHandleChange}
          onTriggerSearch={onTriggerSearch}
          t={t}
        />

        {/* ── 6. 尺寸 ── */}
        <DimensionFilter
          searchParams={searchParams}
          handleChange={filterHandleChange}
          onTriggerSearch={onTriggerSearch}
          t={t}
        />

        {/* ── 7. 日期 ── */}
        <DateFilter
          searchParams={searchParams}
          handleChange={filterHandleChange}
          onTriggerSearch={onTriggerSearch}
          t={t}
        />

        {/* ── 8. 用户 ── */}
        <UserFilter
          searchParams={searchParams}
          handleChange={filterHandleChange}
          onTriggerSearch={onTriggerSearch}
          results={results}
          t={t}
        />

        {/* ── 右侧：排序 + 设置 ── */}
        <Box flex="1" />

        <HStack spacing={2}>
          {/* 排序 Popover（替换原生 Select，风格统一） */}
          <Popover placement="bottom-end" isLazy closeOnBlur>
            <PopoverTrigger>
              <Button
                size="sm"
                rightIcon={<ChevronDownIcon boxSize={3} />}
                sx={{ ...filterButtonSx, minW: '160px' }}
              >
                {tr('fabSortBy', { en: 'Sort: ', zh: '排序：' })}
                {tr(DEFAULT_SORT_OPTIONS.find(o => o.value === sortBy)?.labelKey || 'sortRelevance',
                    DEFAULT_SORT_OPTIONS.find(o => o.value === sortBy)?.fallback || { en: 'Relevance', zh: '相关度' })}
              </Button>
            </PopoverTrigger>
            {/* ⚠️ Portal 必不可少：.fab-toolbar 有 position:sticky + z-index:10，会创建独立 stacking context，
                PopoverContent 的 z-index:1350 只在 toolbar 内有效，对外部卡片列表失效。
                用 Portal 把面板挂到 document.body，才能真正盖在卡片之上。 */}
            <Portal>
              <PopoverContent sx={popoverContentSx} minW="180px" maxW="220px">
                <PopoverBody p={2}>
                  <VStack spacing={0} align="stretch">
                    {DEFAULT_SORT_OPTIONS.map(opt => (
                      <Box
                        key={opt.value}
                        px={3} py={2}
                        fontSize="12px"
                        color={sortBy === opt.value ? '#FFD230' : 'rgba(255,255,255,0.85)'}
                        bg={sortBy === opt.value ? 'rgba(255, 210, 48, 0.1)' : 'transparent'}
                        borderRadius="6px"
                        cursor="pointer"
                        _hover={{ bg: 'rgba(255,255,255,0.08)' }}
                        onClick={() => onSortChange?.(opt.value)}
                        fontWeight={sortBy === opt.value ? 600 : 400}
                      >
                        {tr('fabSortBy', { en: 'Sort: ', zh: '排序：' })}
                        {tr(opt.labelKey, opt.fallback)}
                      </Box>
                    ))}
                  </VStack>
                </PopoverBody>
              </PopoverContent>
            </Portal>
          </Popover>



          {/* ── 视图设置 Popover（原"显示设置"，搜索类项已搬到 SearchSettingsPopover） ── */}
          {/* === LM CUSTOMIZATION: ViewSettingsRefactor START ===
               把原本 uncontrolled 的 Popover 改造为 useDisclosure 受控；
               aria-label / Tooltip / 标题 i18n 全部改为 viewSettings；
               搜索类项（去重/每页结果数/搜索方法/高级混合搜索配置入口）整体注释化保留，
               已迁移到 SearchSettingsPopover.jsx。 */}
          <Popover
            placement="bottom-end"
            isLazy
            closeOnBlur
            isOpen={viewSettings.isOpen}
            onClose={viewSettings.onClose}
          >
            <PopoverTrigger>
              <IconButton
                size="sm"
                aria-label={tr('viewSettings', { en: 'View settings', zh: '视图设置' })}
                icon={<SettingsIcon boxSize={3} />}
                sx={filterButtonSx}
                onClick={handleOpenViewSettings}
              />
            </PopoverTrigger>
            {/* Portal：同排序 Popover 的原因 —— 逃离 .fab-toolbar 的 sticky+z-index stacking context */}
            <Portal>
            <PopoverContent sx={popoverContentSx} minW="260px" maxW="320px">
              <PopoverBody p={4}>
                <VStack spacing={3} align="stretch">
                  <Text fontSize="xs" fontWeight="600" color="rgba(255,255,255,0.6)" textTransform="uppercase" letterSpacing="0.5px">
                    {tr('viewSettings', { en: 'View Settings', zh: '视图设置' })}
                  </Text>

                  {/* 仅预览 */}
                  <FormControl display="flex" alignItems="center" justifyContent="space-between">
                    <FormLabel fontSize="xs" color="rgba(255,255,255,0.85)" mb="0">
                      {tr('withPreviews', { en: 'With previews only', zh: '仅含预览' })}
                    </FormLabel>
                    <Switch size="sm" colorScheme="yellow"
                      isChecked={showOnlyWithPreviews || false}
                      onChange={onShowOnlyWithPreviewsChange} />
                  </FormControl>

                  {/* 显示分数 */}
                  <FormControl display="flex" alignItems="center" justifyContent="space-between">
                    <FormLabel fontSize="xs" color="rgba(255,255,255,0.85)" mb="0">
                      {tr('showScores', { en: 'Show scores', zh: '显示分数' })}
                    </FormLabel>
                    <Switch size="sm" colorScheme="yellow"
                      isChecked={showScores || false}
                      onChange={onShowScoresChange} />
                  </FormControl>

                  {/* 视图模式 */}
                  <FormControl display="flex" alignItems="center" justifyContent="space-between">
                    <FormLabel fontSize="xs" color="rgba(255,255,255,0.85)" mb="0">
                      {tr('view', { en: 'View', zh: '视图' })}
                    </FormLabel>
                    <HStack spacing={1} bg="rgba(255,255,255,0.05)" borderRadius="md" p={1}>
                      {/* === LM CUSTOMIZATION: HideListView START ===
                           原因：用户决定隐藏 List 视图选项（当前 Grid 已能覆盖所有展示需求；List 增加认知复杂度）。
                           保留代码不删，避免破坏 onSetViewModeList 接口、URL ?view=list 兼容、未来恢复路径。
                           合入英伟达新版时：保留 List 按钮被注释这一改动；如英伟达更新了 List 按钮，
                           可以用更新后的 List 按钮 JSX 替换下面注释中的内容，再保持注释包裹。 */}
                      {/*
                      <IconButton size="xs"
                        variant={viewMode === 'list' ? 'solid' : 'ghost'}
                        colorScheme={viewMode === 'list' ? 'yellow' : 'gray'}
                        icon={<HamburgerIcon />}
                        onClick={onSetViewModeList}
                        aria-label="List view" />
                      */}
                      {/* === LM CUSTOMIZATION: HideListView END === */}
                      <IconButton size="xs"
                        variant={viewMode === 'grid' ? 'solid' : 'ghost'}
                        colorScheme={viewMode === 'grid' ? 'yellow' : 'gray'}
                        icon={<ViewIcon />}
                        onClick={onSetViewModeGrid}
                        aria-label="Grid view" />
                      {viewMode === 'grid' && (
                        <IconButton size="xs" variant="ghost" colorScheme="gray"
                          icon={gridSize === 'L' ? <MinusIcon /> : <AddIcon />}
                          onClick={onToggleGridSize}
                          aria-label="Toggle grid size" />
                      )}
                    </HStack>
                  </FormControl>
                </VStack>
              </PopoverBody>
            </PopoverContent>
            </Portal>
          </Popover>
          {/* === LM CUSTOMIZATION: ViewSettingsRefactor END === */}
        </HStack>
        </FilterGroupProvider>
      </HStack>

      {/* ── 已选条件 Chips 条（结构化筛选 + 用户手动标签；搜索词与分类已下放到 ResultsTitleBar 展示） ── */}
      {(() => {
        const chips = [];
        // v4 解耦：搜索词 chip 与分类 chip 不再在此渲染——它们由结果区上方的 ResultsTitleBar 统一承担。
        // 这里只保留"结构化筛选维度（格式/用户/日期/路径/大小/尺寸/精度）"与"用户手动添加的标签"chip。
        // 格式 chips (蓝色)
        const formats = (searchParams?.file_extension_include || '').split(',').map(s => s.trim()).filter(Boolean);
        formats.forEach(fmt => {
          chips.push({ key: `fmt-${fmt}`, label: fmt, color: '#7BC8FF', bg: 'rgba(123,200,255,0.12)', borderColor: 'rgba(123,200,255,0.3)', onRemove: () => {
            const next = formats.filter(f => f !== fmt).join(', ');
            setSearchParams(prev => ({ ...prev, file_extension_include: next }));
            onTriggerSearch?.();
          }});
        });
        // === LM CUSTOMIZATION: Search/Tag decoupling — 标签 chip (金色, # 前缀, 直接来自 selectedTags 数组) ===
        const tags = Array.isArray(selectedTags) ? selectedTags : [];
        tags.forEach(tag => {
          chips.push({
            key: `tag-${tag}`,
            label: tag,
            prefix: '#',
            className: 'filter-chip filter-chip--tag',
            color: '#FFD230',
            bg: 'rgba(255,210,48,0.12)',
            borderColor: 'rgba(255,210,48,0.3)',
            tooltip: tr('chipTag', { en: 'Tag: {value}', zh: '标签: {value}' }).replace('{value}', tag),
            onRemove: () => {
              const next = tags.filter(t2 => t2 !== tag);
              onSelectedTagsChange?.(next);
              setTimeout(() => onTriggerSearch?.(), 50);
            },
          });
        });
        // 用户 chips (绿色)
        const createdBy = (searchParams?.created_by || '').trim();
        const modifiedBy = (searchParams?.modified_by || '').trim();
        if (createdBy) {
          chips.push({ key: `user-c-${createdBy}`, label: `${tr('userCreatedBy', { en: 'Creator', zh: '创建者' })}: ${createdBy}`, color: '#76E650', bg: 'rgba(118,230,80,0.12)', borderColor: 'rgba(118,230,80,0.3)', onRemove: () => {
            setSearchParams(prev => ({ ...prev, created_by: '' }));
            onTriggerSearch?.();
          }});
        }
        if (modifiedBy) {
          chips.push({ key: `user-m-${modifiedBy}`, label: `${tr('userModifiedBy', { en: 'Modifier', zh: '修改者' })}: ${modifiedBy}`, color: '#76E650', bg: 'rgba(118,230,80,0.12)', borderColor: 'rgba(118,230,80,0.3)', onRemove: () => {
            setSearchParams(prev => ({ ...prev, modified_by: '' }));
            onTriggerSearch?.();
          }});
        }
        // 日期 chips (橙色)
        const dateFields = [
          { param: 'created_after', labelKey: 'chipCreatedAfter', fallback: { en: 'Created after {value}', zh: '创建于 {value} 后' } },
          { param: 'created_before', labelKey: 'chipCreatedBefore', fallback: { en: 'Created before {value}', zh: '创建于 {value} 前' } },
          { param: 'modified_after', labelKey: 'chipModifiedAfter', fallback: { en: 'Modified after {value}', zh: '修改于 {value} 后' } },
          { param: 'modified_before', labelKey: 'chipModifiedBefore', fallback: { en: 'Modified before {value}', zh: '修改于 {value} 前' } },
        ];
        dateFields.forEach(({ param, labelKey, fallback }) => {
          const val = (searchParams?.[param] || '').trim();
          if (val) {
            const displayVal = val.length > 10 ? val.slice(0, 10) : val;
            const label = tr(labelKey, fallback).replace('{value}', displayVal);
            chips.push({ key: `date-${param}`, label, color: '#FF9F43', bg: 'rgba(255,159,67,0.12)', borderColor: 'rgba(255,159,67,0.3)', onRemove: () => {
              setSearchParams(prev => ({ ...prev, [param]: '' }));
              onTriggerSearch?.();
            }});
          }
        });
        // 路径 chips (紫色)
        const pathFields = [
          { param: 'search_path', labelKey: 'chipPath', fallback: { en: 'Path: {value}', zh: '路径: {value}' } },
          { param: 'exclude_search_path', labelKey: 'chipExcludePath', fallback: { en: 'Exclude: {value}', zh: '排除: {value}' } },
          { param: 'search_in_scene', labelKey: 'chipScene', fallback: { en: 'Scene: {value}', zh: '场景: {value}' } },
          { param: 'filter_url_regexp', labelKey: 'chipUrlRegex', fallback: { en: 'URL: {value}', zh: 'URL: {value}' } },
        ];
        pathFields.forEach(({ param, labelKey, fallback }) => {
          const val = (searchParams?.[param] || '').trim();
          if (val) {
            const displayVal = val.length > 25 ? val.slice(0, 22) + '...' : val;
            const label = tr(labelKey, fallback).replace('{value}', displayVal);
            chips.push({ key: `path-${param}`, label, color: '#B794F4', bg: 'rgba(183,148,244,0.12)', borderColor: 'rgba(183,148,244,0.3)', onRemove: () => {
              setSearchParams(prev => ({ ...prev, [param]: '' }));
              onTriggerSearch?.();
            }});
          }
        });
        // 大小 chips (青色)
        const sizeFields = [
          { param: 'file_size_greater_than', labelKey: 'chipSizeMin', fallback: { en: '≥ {value}', zh: '≥ {value}' } },
          { param: 'file_size_less_than', labelKey: 'chipSizeMax', fallback: { en: '≤ {value}', zh: '≤ {value}' } },
        ];
        sizeFields.forEach(({ param, labelKey, fallback }) => {
          const val = String(searchParams?.[param] ?? '').trim();
          if (val) {
            const label = tr(labelKey, fallback).replace('{value}', val + ' KB');
            chips.push({ key: `size-${param}`, label, color: '#4FD1C5', bg: 'rgba(79,209,197,0.12)', borderColor: 'rgba(79,209,197,0.3)', onRemove: () => {
              setSearchParams(prev => ({ ...prev, [param]: '' }));
              onTriggerSearch?.();
            }});
          }
        });
        // 尺寸 chips (粉色)
        const dimFields = [
          { params: ['min_bbox_x', 'max_bbox_x'], axis: 'X' },
          { params: ['min_bbox_y', 'max_bbox_y'], axis: 'Y' },
          { params: ['min_bbox_z', 'max_bbox_z'], axis: 'Z' },
        ];
        dimFields.forEach(({ params, axis }) => {
          const minVal = String(searchParams?.[params[0]] ?? '').trim();
          const maxVal = String(searchParams?.[params[1]] ?? '').trim();
          if (minVal || maxVal) {
            // 单位：米（m），与后端 USD 场景 metersPerUnit 一致
            const fmt = (v) => {
              const n = Number(v);
              if (Number.isNaN(n)) return v;
              // 整数显示整数；小数固定 1 位
              return Number.isInteger(n) ? `${n}m` : `${n.toFixed(1)}m`;
            };
            const parts = [];
            if (minVal) parts.push(`≥${fmt(minVal)}`);
            if (maxVal) parts.push(`≤${fmt(maxVal)}`);
            const label = `${axis}: ${parts.join(' ')}`;
            chips.push({ key: `dim-${axis}`, label, color: '#F687B3', bg: 'rgba(246,135,179,0.12)', borderColor: 'rgba(246,135,179,0.3)', onRemove: () => {
              setSearchParams(prev => ({ ...prev, [params[0]]: '', [params[1]]: '' }));
              onTriggerSearch?.();
            }});
          }
        });
        // 精度 chips (灰白)
        const precFields = [
          { param: 'similarity_threshold', labelKey: 'chipSimilarity', fallback: { en: 'Similarity ≥ {value}', zh: '相似度 ≥ {value}' } },
          { param: 'cutoff_threshold', labelKey: 'chipCutoff', fallback: { en: 'Cutoff ≥ {value}', zh: '截断 ≥ {value}' } },
        ];
        precFields.forEach(({ param, labelKey, fallback }) => {
          const val = String(searchParams?.[param] ?? '').trim();
          if (val) {
            const label = tr(labelKey, fallback).replace('{value}', val);
            chips.push({ key: `prec-${param}`, label, color: '#CBD5E0', bg: 'rgba(203,213,224,0.10)', borderColor: 'rgba(203,213,224,0.25)', onRemove: () => {
              setSearchParams(prev => ({ ...prev, [param]: '' }));
              onTriggerSearch?.();
            }});
          }
        });

        const hasChips = chips.length > 0;

        return (
          <Box className={`chips-bar ${hasChips ? 'chips-bar--visible' : 'chips-bar--hidden'}`}>
            {hasChips && (
              <HStack spacing="10px" flexWrap="wrap" pl={1} align="center">
                {chips.map(chip => (
                  <Box
                    key={chip.key}
                    className={chip.className || 'filter-chip'}
                    display="inline-flex"
                    alignItems="center"
                    gap="7px"
                    bg={chip.bg}
                    color={chip.color}
                    border="1px solid"
                    borderColor={chip.borderColor}
                    borderRadius="full"
                    px="12px"
                    h="28px"
                    fontSize="13px"
                    fontWeight="500"
                    transition="all 0.15s"
                    title={chip.tooltip || undefined}
                    _hover={{ opacity: 0.9 }}
                  >
                    {chip.prefix && (
                      <Text as="span" fontSize="12px" lineHeight="1" opacity={0.85} mr="1px">{chip.prefix}</Text>
                    )}
                    <Text as="span" fontSize="13px" lineHeight="1" maxW="200px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">{chip.label}</Text>
                    <Box
                      as="button"
                      ml="2px"
                      fontSize="13px"
                      opacity={0.7}
                      _hover={{ opacity: 1, transform: 'scale(1.2)' }}
                      onClick={chip.onRemove}
                      cursor="pointer"
                      bg="none"
                      border="none"
                      color="inherit"
                      p={0}
                      lineHeight="1"
                      transition="all 0.12s"
                    >
                      ✕
                    </Box>
                  </Box>
                ))}
                {/* 清除全部 — 胶囊按钮，chips 条同行右侧 */}
                <Button
                  className="clear-all-btn"
                  size="xs"
                  borderRadius="full"
                  bg="rgba(255, 210, 48, 0.12)"
                  color="#FFD230"
                  border="1px solid rgba(255, 210, 48, 0.3)"
                  fontSize="12px"
                  fontWeight="500"
                  px="12px"
                  h="28px"
                  _hover={{ bg: 'rgba(255, 210, 48, 0.2)', color: '#FFD230' }}
                  onClick={() => {
                    clearFormat();
                    clearPrecision();
                    clearPath();
                    clearSize();
                    clearDate();
                    clearUser();
                    clearDimension();
                    // === LM CUSTOMIZATION: Search/Tag decoupling v4 — 清除五类条件 ===
                    onCommittedQueryChange?.('');
                    onSelectedTagsChange?.([]);
                    onCategoryTagChange?.('');
                    onSearchQueryChange?.('');
                    onTriggerSearch?.();
                  }}
                >
                  {tr('chipClearAll', { en: 'Clear all', zh: '清除全部' })} ({chips.length})
                </Button>
              </HStack>
            )}
          </Box>
        );
      })()}

      {/* v6: 原底部 merged-row 已上移到 toolbar 顶部（fab-toolbar-header-row），此处不再渲染 */}
    </Box>
  );
}

export default React.memo(FabToolbar);
