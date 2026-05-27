import React, { memo, useCallback, useMemo, useState } from 'react';
import { VStack, HStack, Text, Input, Divider, Wrap, WrapItem, Box, Button, Tooltip, Collapse } from '@chakra-ui/react';
import { CloseIcon, ChevronDownIcon, ChevronUpIcon, WarningTwoIcon } from '@chakra-ui/icons';
import FilterPopoverButton from './FilterPopoverButton';
import QuickTags from '../shared/QuickTags';
import MemoryChip from './MemoryChip';
import { useLocalFilterState } from '../shared/useLocalFilterState';
import { useFilterMemory } from '../../hooks/useFilterMemory';
import { DEFAULT_SEARCH_PARAMS } from '../../config';
import { parseExtListForUI as parseExtList } from '../../utils/extNormalize';

const FORMAT_KEYS = ['file_extension_include', 'file_extension_exclude', 'exclude_file_name'];
const DEFAULT_EXCLUDE = DEFAULT_SEARCH_PARAMS.file_extension_exclude || '';

/** 格式分组图标 — 线性 SVG，继承 currentColor，统一风格 */
const FormatIcon = ({ d, size = 14 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width={size} height={size}
    style={{ flexShrink: 0 }} aria-hidden="true">
    <path d={d} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

/** 各组图标 path — 线性风格 */
const FORMAT_ICON_PATHS = {
  // USD 资产 — 3D 立方体（代表 USD 场景）
  usd: 'M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z M8 1V8 M8 8L14 4.5 M8 8L2 4.5',
  // 交换格式 — 双向箭头（代表格式转换/交换）
  exchange: 'M2 5.5H12M12 5.5L9 3M12 5.5L9 8 M14 10.5H4M4 10.5L7 8M4 10.5L7 13',
  // 图片纹理 — 图片/相框
  image: 'M2 3H14V13H2V3Z M2 10L5.5 7L8 9.5L10.5 7.5L14 11 M10 5.5A1 1 0 1 1 10 5.49',
  // 源文件 — 齿轮+文件（代表 DCC 源）
  source: 'M3 2H10L13 5V14H3V2Z M10 2V5H13 M6 9L8 11L10.5 8',
};

/** 包含扩展名 - 按用途分组（C1）
 *  每组：icon + 组名 + chips 同一行（inline 布局节省纵向空间）
 */
const FORMAT_GROUPS = [
  {
    id: 'usd', labelKey: 'formatGroupUSD', fallbackLabel: 'USD 资产',
    icon: FORMAT_ICON_PATHS.usd,
    items: [
      { label: '.uasset', value: '.uasset' },
      { label: '.usd', value: '.usd' },
      { label: '.usda', value: '.usda' },
      { label: '.usdc', value: '.usdc' },
      { label: '.usdz', value: '.usdz' },
    ],
  },
  {
    id: 'exchange', labelKey: 'formatGroupExchange', fallbackLabel: '交换格式',
    icon: FORMAT_ICON_PATHS.exchange,
    items: [
      { label: '.fbx', value: '.fbx' },
      { label: '.obj', value: '.obj' },
      { label: '.gltf', value: '.gltf' },
      { label: '.glb', value: '.glb' },
      { label: '.abc', value: '.abc' },
    ],
  },
  {
    id: 'image', labelKey: 'formatGroupImage', fallbackLabel: '图片纹理',
    icon: FORMAT_ICON_PATHS.image,
    items: [
      { label: '.png', value: '.png' },
      { label: '.jpg', value: '.jpg' },
    ],
  },
  {
    id: 'source', labelKey: 'formatGroupSource', fallbackLabel: '源文件',
    icon: FORMAT_ICON_PATHS.source,
    items: [
      { label: '.blend', value: '.blend' },
      { label: '.ma', value: '.ma' },
    ],
  },
];

const ALL_QUICK_VALUES = FORMAT_GROUPS.flatMap(g => g.items.map(i => i.value));

const inputSx = {
  bg: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '8px',
  _hover: { borderColor: 'whiteAlpha.400' },
  _focus: { borderColor: 'white', bg: 'rgba(255,255,255,0.08)' },
  color: 'white',
  fontSize: '12px',
};

const FileIcon = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
    <path d="M3 2.5A1.5 1.5 0 014.5 1h5.379a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0114.5 5.62V13.5A1.5 1.5 0 0113 15H4.5A1.5 1.5 0 013 13.5v-11z" />
  </svg>
);

const BanIcon = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="8" cy="8" r="6" />
    <line x1="3.8" y1="3.8" x2="12.2" y2="12.2" />
  </svg>
);

/**
 * FormatFilter - v4 极致紧凑版
 * 
 * 视觉布局（目标：初始弹窗 ~400px）：
 * ┌─────────────────────────────────────┐
 * │ 已选包含 2 · 已排除 6 (默认)         │ ← 顶部摘要条（永远可见）
 * │ ⚠ .usd 冲突...（如有）               │ ← 冲突 warning（外置）
 * │                                     │
 * │ 包含扩展名                           │
 * │ 📦 USD 资产   [chip][chip][chip]...  │ ← inline 布局
 * │ 🔄 交换格式   [chip][chip][chip]...  │
 * │ 🖼️ 图片纹理   [chip][chip]           │
 * │ 🎨 源文件     [chip][chip]           │
 * │                                     │
 * │ 最近格式组合                         │
 * │ [记忆 chip] [记忆 chip]              │
 * ├─────────────────────────────────────┤
 * │ ⊘ 排除扩展名 6 (默认)           ▾  │ ← 默认折叠
 * │ ⚡ 高级筛选（按文件名）          ▾  │ ← 默认折叠
 * │ ↺ 重置                              │
 * └─────────────────────────────────────┘
 */
const FormatFilter = memo(function FormatFilter({
  searchParams,
  handleChange,
  onTriggerSearch,
  t,
}) {
  const { memories: fmtMemories, addMemory: addFmtMemory, removeMemory: removeFmtMemory } = useFilterMemory('format');

  /**
   * 归一化记忆 value，统一取出 formats 数组（兼容老数据：value 为 string[]）
   */
  const extractFormats = useCallback((memValue) => {
    if (Array.isArray(memValue)) return memValue;
    if (memValue && Array.isArray(memValue.formats)) return memValue.formats;
    if (typeof memValue === 'string') return parseExtList(memValue);
    return [];
  }, []);

  /**
   * 保存一组 formats 到记忆；fromPreset 标记是否来自快捷按钮。
   * 采用"先按 core 去重再新增"：保证同一组合（不论来自预设还是自定义）只占一个槽位。
   */
  const saveFmtMemory = useCallback((formats, fromPreset) => {
    if (!formats || formats.length === 0) return;
    // 去重（忽略 fromPreset 差异）
    removeFmtMemory({ formats, fromPreset: true });
    removeFmtMemory({ formats, fromPreset: false });
    removeFmtMemory(formats); // 兼容老数据
    const label = formats.join(', ');
    addFmtMemory(label, { formats, fromPreset: !!fromPreset });
  }, [addFmtMemory, removeFmtMemory]);

  // 两个折叠区：默认都闭合（除非已有非默认值）
  const [showExcludeSection, setShowExcludeSection] = useState(false);
  const [showExcludeFileName, setShowExcludeFileName] = useState(() => !!searchParams.exclude_file_name);
  const [newExcludeInput, setNewExcludeInput] = useState('');

  const onCommit = useCallback((changed) => {
    Object.entries(changed).forEach(([key, val]) => handleChange(key, val));
    onTriggerSearch?.();
  }, [handleChange, onTriggerSearch]);

  const { localValues, setLocalValue, commit, commitIfDirty, reset } = useLocalFilterState(
    searchParams, FORMAT_KEYS, onCommit
  );

  const selectedFormats = useMemo(() => parseExtList(searchParams.file_extension_include), [searchParams.file_extension_include]);
  const excludedFormats = useMemo(() => parseExtList(searchParams.file_extension_exclude), [searchParams.file_extension_exclude]);

  const conflictExts = useMemo(() => {
    const excSet = new Set(excludedFormats);
    return selectedFormats.filter(ext => excSet.has(ext));
  }, [selectedFormats, excludedFormats]);

  const defaultExcludeSet = useMemo(() => new Set(parseExtList(DEFAULT_EXCLUDE)), []);
  const isExcludeAtDefault = useMemo(() => {
    if (excludedFormats.length !== defaultExcludeSet.size) return false;
    return excludedFormats.every(e => defaultExcludeSet.has(e));
  }, [excludedFormats, defaultExcludeSet]);
  const isExcludeEmpty = excludedFormats.length === 0;

  const handleFormatTag = useCallback((ext) => {
    const current = parseExtList(searchParams.file_extension_include);
    const next = current.includes(ext) ? current.filter(e => e !== ext) : [...current, ext];
    handleChange('file_extension_include', next.join(', '));
    // 即时存记忆：点击快捷扩展名时，把"点击后的完整组合"作为一条预设记忆
    // - 点击使该项从无到有（加入）→ 存新组合
    // - 点击使该项从有到无（取消）→ 若还有剩余项，存剩余组合；否则不存
    if (next.length > 0) {
      saveFmtMemory(next, true);
    }
    onTriggerSearch?.();
  }, [searchParams, handleChange, onTriggerSearch, saveFmtMemory]);

  const handleRemoveExclude = useCallback((ext) => {
    const next = excludedFormats.filter(e => e !== ext);
    handleChange('file_extension_exclude', next.join(','));
    onTriggerSearch?.();
  }, [excludedFormats, handleChange, onTriggerSearch]);

  const handleAddExclude = useCallback(() => {
    const trimmed = newExcludeInput.trim();
    if (!trimmed) return;
    const newExts = parseExtList(trimmed);
    if (newExts.length === 0) { setNewExcludeInput(''); return; }
    const merged = Array.from(new Set([...excludedFormats, ...newExts]));
    handleChange('file_extension_exclude', merged.join(','));
    setNewExcludeInput('');
    onTriggerSearch?.();
  }, [newExcludeInput, excludedFormats, handleChange, onTriggerSearch]);

  const handleClearAllExcludes = useCallback(() => {
    handleChange('file_extension_exclude', '');
    setLocalValue('file_extension_exclude', '');
    onTriggerSearch?.();
  }, [handleChange, setLocalValue, onTriggerSearch]);

  const handleRestoreDefault = useCallback(() => {
    handleChange('file_extension_exclude', DEFAULT_EXCLUDE);
    setLocalValue('file_extension_exclude', DEFAULT_EXCLUDE);
    onTriggerSearch?.();
  }, [handleChange, setLocalValue, onTriggerSearch]);

  const handleClose = useCallback(() => {
    commitIfDirty();
    // 兜底：如果当前 include 有值，判断是否全部命中快捷预设——
    //   全部命中预设 → 可能已在 handleFormatTag 中存过（幂等，无副作用）
    //   存在非预设项 → 作为"自定义组合"存入记忆
    if (selectedFormats.length > 0) {
      const allPreset = selectedFormats.every(ext => ALL_QUICK_VALUES.includes(ext));
      saveFmtMemory(selectedFormats, allPreset);
    }
  }, [commitIfDirty, selectedFormats, saveFmtMemory]);

  const handleMemoryTag = useCallback((memValue) => {
    const formats = extractFormats(memValue);
    if (formats.length === 0) return;
    handleChange('file_extension_include', formats.join(', '));
    onTriggerSearch?.();
  }, [handleChange, onTriggerSearch, extractFormats]);

  const handleReset = useCallback(() => {
    FORMAT_KEYS.forEach(key => handleChange(key, ''));
    reset();
    setNewExcludeInput('');
    onTriggerSearch?.();
  }, [handleChange, reset, onTriggerSearch]);

  const isActive = !!searchParams.file_extension_include
    || (excludedFormats.length > 0 && !isExcludeAtDefault)
    || !!searchParams.exclude_file_name;

  // ===== 顶部摘要条（增强 #2） =====
  const summaryIncludeText = selectedFormats.length === 0
    ? null
    : (selectedFormats.length <= 2
        ? selectedFormats.join(', ')
        : `${selectedFormats.slice(0, 2).join(', ')} ${t?.('memoryMoreSuffix') ? `+${selectedFormats.length - 2} ${t('memoryMoreSuffix')}` : `+${selectedFormats.length - 2}`}`
      );
  const summaryExcludeSuffix = isExcludeAtDefault
    ? ` (${t?.('formatSummaryDefault') || '默认'})`
    : '';

  return (
    <FilterPopoverButton
      label={t?.('fabFilterFormat') || '格式'}
      isActive={isActive}
      badgeCount={selectedFormats.length}
      onClose={handleClose}
      onReset={handleReset}
      minW="380px"
      maxW="440px"
    >
      <VStack spacing={2.5} align="stretch">
        {/* ===== 顶部摘要条（永远可见，增强 #2） ===== */}
        <HStack
          spacing={3}
          px={2.5}
          py={1.5}
          bg="rgba(255,255,255,0.025)"
          borderRadius="6px"
          fontSize="11px"
          color="whiteAlpha.600"
          letterSpacing="0.02em"
          justify="space-between"
          wrap="wrap"
        >
          <HStack spacing={1.5}>
            <Text color={selectedFormats.length > 0 ? 'rgba(180,215,255,0.95)' : 'whiteAlpha.500'}>
              {t?.('formatSummaryInclude') || '包含'}:
            </Text>
            <Text color={selectedFormats.length > 0 ? 'rgba(180,215,255,0.98)' : 'whiteAlpha.400'} fontWeight={selectedFormats.length > 0 ? '600' : '400'}>
              {summaryIncludeText || (t?.('formatSummaryNone') || '未设置')}
            </Text>
          </HStack>
          <HStack spacing={1.5}>
            <Text color={excludedFormats.length > 0 ? 'rgba(255,175,175,0.95)' : 'whiteAlpha.500'}>
              {t?.('formatSummaryExclude') || '排除'}:
            </Text>
            <Text color={excludedFormats.length > 0 ? 'rgba(255,175,175,0.98)' : 'whiteAlpha.400'} fontWeight={excludedFormats.length > 0 ? '600' : '400'}>
              {excludedFormats.length === 0
                ? (t?.('formatSummaryNone') || '未设置')
                : `${excludedFormats.length} ${t?.('memoryMoreSuffix') || '项'}${summaryExcludeSuffix}`}
            </Text>
          </HStack>
        </HStack>

        {/* ===== 冲突 warning（外置，不论折叠状态都可见，增强 #3） ===== */}
        {conflictExts.length > 0 && (
          <HStack
            spacing={2}
            px={2.5}
            py={1.5}
            bg="rgba(255, 180, 60, 0.08)"
            border="1px solid rgba(255, 180, 60, 0.35)"
            borderRadius="8px"
            align="flex-start"
          >
            <WarningTwoIcon color="rgba(255, 200, 90, 0.95)" boxSize="13px" mt="2px" flexShrink={0} />
            <Text fontSize="11px" color="rgba(255, 215, 120, 0.95)" letterSpacing="0.02em" lineHeight="1.5">
              {(t?.('formatConflictWarning', { exts: conflictExts.join(', ') })
                || `${conflictExts.join(', ')} 同时出现在包含与排除中，实际不会出现在结果里。建议从排除中移除，或取消包含。`)}
            </Text>
          </HStack>
        )}

        {/* ===== 包含扩展名（inline 分组，增强 B2） ===== */}
        <Box>
          <Text fontSize="12px" color="whiteAlpha.700" fontWeight="500" letterSpacing="0.02em" mb={2}>
            {t?.('formatInclude') || '包含格式（多选）'}
          </Text>
          <VStack spacing={1.5} align="stretch">
            {FORMAT_GROUPS.map(group => (
              <HStack key={group.id} spacing={2} align="center">
                <HStack spacing={1.5} minW="82px" flexShrink={0}>
                  <Box color="whiteAlpha.500"><FormatIcon d={group.icon} /></Box>
                  <Text
                    fontSize="10px"
                    color="whiteAlpha.450"
                    fontWeight="500"
                    letterSpacing="0.05em"
                    textTransform="uppercase"
                    whiteSpace="nowrap"
                  >
                    {t?.(group.labelKey) || group.fallbackLabel}
                  </Text>
                </HStack>
                <Box flex={1} minW={0}>
                  <QuickTags
                    tags={group.items}
                    selectedValues={selectedFormats}
                    excludedValues={excludedFormats}
                    onSelect={handleFormatTag}
                    onRemoveExclude={handleRemoveExclude}
                    multiSelect
                  />
                </Box>
              </HStack>
            ))}
          </VStack>
        </Box>

        {/* ===== 最近格式组合 ===== */}
        {fmtMemories.length > 0 && (
          <Box>
            <Text fontSize="11px" color="whiteAlpha.500" fontWeight="500" letterSpacing="0.02em" mb={1.5}>
              {t?.('formatRecentMemory') || t?.('recentCustom') || '最近格式组合'}
            </Text>
            <Wrap spacing={1.5}>
              {fmtMemories.map((mem, idx) => {
                const formats = extractFormats(mem.value);
                if (formats.length === 0) return null;
                const moreSuffix = t?.('memoryMoreSuffix') || '项';
                const visibleCount = 3;
                const labelText = formats.slice(0, visibleCount).join(' · ');
                const badge = formats.length > visibleCount ? `+${formats.length - visibleCount} ${moreSuffix}` : undefined;
                const isPreset = !!(mem.value && typeof mem.value === 'object' && !Array.isArray(mem.value) && mem.value.fromPreset);
                return (
                  <WrapItem key={idx}>
                    <MemoryChip
                      segments={[{ icon: <FileIcon />, label: labelText, tone: 'positive', badge, isPreset }]}
                      tooltip={formats.join(' · ')}
                      presetTooltip={t?.('memoryFromPreset') || '来自快捷预设'}
                      onClick={() => handleMemoryTag(mem.value)}
                      onRemove={() => removeFmtMemory(mem.value)}
                    />
                  </WrapItem>
                );
              })}
            </Wrap>
          </Box>
        )}

        <Divider borderColor="whiteAlpha.150" my={0} />

        {/* ===== 排除扩展名 折叠区（增强 C） ===== */}
        <Box>
          <Button
            size="xs"
            variant="ghost"
            w="100%"
            justifyContent="space-between"
            color={(!isExcludeEmpty && !isExcludeAtDefault) ? 'rgba(255, 175, 175, 0.95)' : 'whiteAlpha.600'}
            fontWeight={(!isExcludeEmpty && !isExcludeAtDefault) ? '500' : '400'}
            fontSize="12px"
            letterSpacing="0.02em"
            h="28px"
            px={2}
            _hover={{
              bg: 'whiteAlpha.50',
              color: (!isExcludeEmpty && !isExcludeAtDefault) ? '#FF8A8A' : 'whiteAlpha.900',
            }}
            onClick={() => setShowExcludeSection(v => !v)}
            rightIcon={showExcludeSection ? <ChevronUpIcon /> : <ChevronDownIcon />}
          >
            <HStack spacing={2}>
              <Box color="rgba(255, 175, 175, 0.85)" display="flex" alignItems="center">
                <BanIcon />
              </Box>
              <Text>{t?.('formatExclude') || '排除扩展名'}</Text>
              {excludedFormats.length > 0 && (
                <Box
                  bg={isExcludeAtDefault ? 'rgba(255,255,255,0.10)' : 'rgba(255, 130, 130, 0.20)'}
                  color={isExcludeAtDefault ? 'whiteAlpha.700' : 'rgba(255, 175, 175, 0.98)'}
                  fontSize="10px"
                  fontWeight="600"
                  px={1.5}
                  h="16px"
                  lineHeight="16px"
                  borderRadius="full"
                  letterSpacing="0.02em"
                >
                  {excludedFormats.length}{isExcludeAtDefault ? '' : ''}
                </Box>
              )}
              {isExcludeAtDefault && (
                <Text fontSize="10px" color="whiteAlpha.400" letterSpacing="0.03em">
                  ({t?.('formatSummaryDefault') || '默认'})
                </Text>
              )}
            </HStack>
          </Button>
        </Box>

        <Collapse in={showExcludeSection} animateOpacity>
          <VStack spacing={2} align="stretch" pl={1} pt={1}>
            {/* 智能按钮行 */}
            <HStack justify="flex-end">
              {!isExcludeEmpty && (
                <Tooltip
                  label={isExcludeAtDefault
                    ? (t?.('formatExcludeClearAllTip') || '清空所有排除（允许所有扩展名）')
                    : (t?.('formatExcludeRestoreTip') || '恢复默认（排除 USD 文本/图片）')}
                  fontSize="11px" placement="top" hasArrow
                >
                  <Button
                    size="xs" variant="ghost"
                    color={isExcludeAtDefault ? 'whiteAlpha.500' : 'rgba(255, 210, 48, 0.85)'}
                    fontSize="11px" fontWeight="500" h="22px" px={2}
                    _hover={{ bg: 'whiteAlpha.100' }}
                    onClick={isExcludeAtDefault ? handleClearAllExcludes : handleRestoreDefault}
                  >
                    {isExcludeAtDefault
                      ? (t?.('formatExcludeClearAll') || '✕ 清空')
                      : (t?.('formatExcludeRestoreDefault') || '↺ 恢复默认')}
                  </Button>
                </Tooltip>
              )}
              {isExcludeEmpty && DEFAULT_EXCLUDE && (
                <Button
                  size="xs" variant="ghost"
                  color="rgba(255, 210, 48, 0.85)"
                  fontSize="11px" fontWeight="500" h="22px" px={2}
                  _hover={{ bg: 'whiteAlpha.100', color: '#FFD230' }}
                  onClick={handleRestoreDefault}
                >
                  {t?.('formatExcludeRestoreDefault') || '↺ 恢复默认'}
                </Button>
              )}
            </HStack>

            {/* 默认排除提示（温和版） */}
            {isExcludeAtDefault && (
              <Text fontSize="11px" color="whiteAlpha.500" letterSpacing="0.02em" lineHeight="1.5">
                {t?.('formatDefaultExcludeBannerShort') || 'ℹ 系统默认已排除 USD 文本与图片格式'}
              </Text>
            )}

            {/* 排除 chip 列表 */}
            {excludedFormats.length > 0 && (
              <Wrap spacing={1.5}>
                {excludedFormats.map((ext) => {
                  const isConflict = conflictExts.includes(ext);
                  return (
                    <WrapItem key={ext}>
                      <HStack
                        spacing={1}
                        h="24px"
                        px={2}
                        bg={isConflict ? 'rgba(255, 180, 60, 0.15)' : 'rgba(255, 130, 130, 0.10)'}
                        border={isConflict ? '1px solid rgba(255, 180, 60, 0.55)' : '1px solid rgba(255, 130, 130, 0.25)'}
                        borderRadius="6px"
                        transition="all 0.15s ease"
                        _hover={{
                          bg: isConflict ? 'rgba(255, 180, 60, 0.22)' : 'rgba(255, 130, 130, 0.16)',
                          borderColor: isConflict ? 'rgba(255, 180, 60, 0.7)' : 'rgba(255, 130, 130, 0.4)',
                        }}
                      >
                        {isConflict && (
                          <WarningTwoIcon color="rgba(255, 200, 90, 0.95)" boxSize="10px" flexShrink={0} />
                        )}
                        <Text
                          fontSize="12px"
                          color={isConflict ? 'rgba(255, 215, 120, 0.98)' : 'rgba(255, 175, 175, 0.95)'}
                          fontWeight="500"
                          letterSpacing="0.01em"
                        >
                          {ext}
                        </Text>
                        <Box
                          as="button"
                          color={isConflict ? 'rgba(255, 200, 90, 0.6)' : 'rgba(255, 175, 175, 0.6)'}
                          _hover={{ color: isConflict ? '#FFC850' : '#FF8A8A' }}
                          onClick={() => handleRemoveExclude(ext)}
                          aria-label={`remove ${ext}`}
                          display="flex" alignItems="center"
                        >
                          <CloseIcon w="7px" h="7px" />
                        </Box>
                      </HStack>
                    </WrapItem>
                  );
                })}
              </Wrap>
            )}

            {/* 新增扩展名输入框 */}
            <Input
              size="sm"
              placeholder={t?.('formatExcludeAddPlaceholder') || '+ 添加扩展名（回车确认，如 .tmp）'}
              value={newExcludeInput}
              onChange={(e) => setNewExcludeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleAddExclude(); }
              }}
              onBlur={() => {
                if (newExcludeInput.trim()) handleAddExclude();
                else setNewExcludeInput('');
              }}
              sx={inputSx}
            />
          </VStack>
        </Collapse>

        {/* ===== 高级筛选（按文件名）折叠区 ===== */}
        <Box>
          <Button
            size="xs"
            variant="ghost"
            w="100%"
            justifyContent="space-between"
            color={searchParams.exclude_file_name ? 'rgba(255, 210, 48, 0.95)' : 'whiteAlpha.600'}
            fontWeight={searchParams.exclude_file_name ? '500' : '400'}
            fontSize="12px"
            letterSpacing="0.02em"
            h="28px"
            px={2}
            _hover={{ bg: 'whiteAlpha.50', color: searchParams.exclude_file_name ? '#FFD230' : 'whiteAlpha.900' }}
            onClick={() => setShowExcludeFileName(v => !v)}
            rightIcon={showExcludeFileName ? <ChevronUpIcon /> : <ChevronDownIcon />}
          >
            <HStack spacing={2}>
              <Box color="rgba(255, 210, 48, 0.75)" display="flex" alignItems="center">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 1.5L3 9H8L7 14.5L13 7H8L9 1.5Z" />
                </svg>
              </Box>
              <Text>{t?.('formatExcludeFileNameAdvanced') || '高级筛选（按文件名模式）'}</Text>
              {searchParams.exclude_file_name && (
                <Box
                  bg="rgba(255, 210, 48, 0.18)"
                  color="#FFD230"
                  fontSize="10px" fontWeight="600"
                  px={1.5} h="16px" lineHeight="16px"
                  borderRadius="full" letterSpacing="0.02em"
                >
                  {t?.('formatExcludeFileNameActive') || '已设'}
                </Box>
              )}
            </HStack>
          </Button>
        </Box>

        <Collapse in={showExcludeFileName} animateOpacity>
          <VStack spacing={2} align="stretch" pl={1} pt={1}>
            <Text fontSize="11px" color="whiteAlpha.500" letterSpacing="0.02em" lineHeight="1.5">
              {t?.('formatExcludeFileNameHint') || '通过文件名关键词或模式过滤（如 backup、test_*、_tmp 等）'}
            </Text>
            <Input
              size="sm"
              placeholder={t?.('formatExcludeFileNamePlaceholder') || '如 backup, test_*'}
              value={localValues.exclude_file_name || ''}
              onChange={(e) => setLocalValue('exclude_file_name', e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => e.key === 'Enter' && commit()}
              sx={inputSx}
            />
          </VStack>
        </Collapse>
      </VStack>
    </FilterPopoverButton>
  );
});

export default FormatFilter;
