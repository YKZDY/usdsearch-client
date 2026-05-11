import { memo, useCallback, useState, useMemo } from 'react';
import {
  VStack,
  Box,
  Text,
  Input,
  Button,
  Collapse,
  Divider,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { ChevronRightIcon, ChevronDownIcon } from '@chakra-ui/icons';
import FilterPopoverButton from './FilterPopoverButton';
import PathTreeBrowser from './PathTreeBrowser';
import MemoryChip from './MemoryChip';
import { useFilterMemory } from '../../hooks/useFilterMemory';

/** 文件夹图标（含路径） */
const FolderIcon = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
    <path d="M1.5 3.5A1.5 1.5 0 013 2h3.382a1 1 0 01.894.553l.448.894A1 1 0 008.618 4H13a1.5 1.5 0 011.5 1.5v6A1.5 1.5 0 0113 13H3a1.5 1.5 0 01-1.5-1.5v-8z" />
  </svg>
);

/** 排除/禁止图标 */
const BanIcon = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="8" cy="8" r="6" />
    <line x1="3.8" y1="3.8" x2="12.2" y2="12.2" />
  </svg>
);

/**
 * PathFilter - 路径筛选面板 v2
 *
 * 设计：
 * - 主面板：树形浏览器（PathTreeBrowser）+ 已选 chips
 * - 数据源：pathTree prop（从上层注入，混合静态树 + 搜索结果聚合）
 * - 高级抽屉（默认折叠）：URL 正则过滤（少数高级用户使用）
 * - 已移除：search_in_scene（前端无场景上下文，不生效）
 * - 第5阶段新增：记忆 4 条最近自定义路径组合（含 includes + excludes）
 *
 * Props:
 * - searchParams: 父级筛选参数对象（含 search_path, exclude_search_path, filter_url_regexp）
 * - handleChange: (key, value) => void
 * - onTriggerSearch: () => void
 * - t: i18n 函数
 * - pathTree: 混合后的目录树（由 usePathSuggestions 产出）
 */

const inputSx = {
  bg: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '8px',
  _hover: { borderColor: 'whiteAlpha.400' },
  _focus: { borderColor: 'white', bg: 'rgba(255,255,255,0.08)' },
  color: 'white',
  fontSize: '12px',
};

/** 字符串 <-> 数组：逗号分隔 */
function splitPaths(str) {
  return String(str || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function joinPaths(arr) {
  return (arr || []).join(', ');
}

/** 把 includes/excludes 渲染成 MemoryChip 的 segments：
 *  - 前 2 项 join ", "，超过 2 项时 badge 显示 "+N {moreSuffix}"（如「+1 项」/ "+1 more"）
 *  - 单项时不显示 badge
 */
function buildMemorySegments(includes, excludes, moreSuffix = '项') {
  const inc = (includes || []).filter(Boolean);
  const exc = (excludes || []).filter(Boolean);
  const tail = (p) => {
    const parts = String(p).split('/').filter(Boolean);
    return parts[parts.length - 1] || p;
  };
  const segs = [];
  const buildLabelAndBadge = (arr) => {
    const tails = arr.map(tail);
    if (tails.length <= 2) {
      return { label: tails.join(', '), badge: undefined };
    }
    return {
      label: tails.slice(0, 2).join(', '),
      badge: `+${tails.length - 2} ${moreSuffix}`,
    };
  };
  if (inc.length > 0) {
    const { label, badge } = buildLabelAndBadge(inc);
    segs.push({ icon: <FolderIcon />, label, badge, tone: 'positive' });
  }
  if (exc.length > 0) {
    const { label, badge } = buildLabelAndBadge(exc);
    segs.push({ icon: <BanIcon />, label, badge, tone: 'negative' });
  }
  return segs;
}

/** Tooltip 完整路径（多行） */
function buildMemoryTooltip(includes, excludes) {
  const lines = [];
  if (includes && includes.length) lines.push('包含:\n  ' + includes.join('\n  '));
  if (excludes && excludes.length) lines.push('排除:\n  ' + excludes.join('\n  '));
  return lines.join('\n\n');
}

const PathFilter = memo(function PathFilter({
  searchParams,
  handleChange,
  onTriggerSearch,
  t,
  pathTree = [],
}) {
  // 记忆功能（4 条）
  const {
    memories: pathMemories,
    addMemory: addPathMemory,
    removeMemory: removePathMemory,
  } = useFilterMemory('path');

  // 树形 includes / excludes（派生自 searchParams）
  const includes = useMemo(() => splitPaths(searchParams.search_path), [searchParams.search_path]);
  const excludes = useMemo(() => splitPaths(searchParams.exclude_search_path), [searchParams.exclude_search_path]);

  // 本地状态：URL 正则（仅高级抽屉使用）
  const [localRegex, setLocalRegex] = useState(searchParams.filter_url_regexp || '');
  const [showAdvanced, setShowAdvanced] = useState(!!searchParams.filter_url_regexp);

  // 已选路径更新 → 立即写回父级 + 触发搜索（树形是显式点选动作，无需等 blur）
  const handleTreeChange = useCallback(
    ({ includes: newInc, excludes: newExc }) => {
      handleChange('search_path', joinPaths(newInc));
      handleChange('exclude_search_path', joinPaths(newExc));
      onTriggerSearch?.();
    },
    [handleChange, onTriggerSearch]
  );

  // 正则 blur 提交
  const commitRegex = useCallback(() => {
    if ((searchParams.filter_url_regexp || '') !== localRegex) {
      handleChange('filter_url_regexp', localRegex);
      onTriggerSearch?.();
    }
  }, [localRegex, searchParams.filter_url_regexp, handleChange, onTriggerSearch]);

  // 应用记忆：写入 includes/excludes + 触发搜索
  const handleApplyMemory = useCallback((memValue) => {
    handleChange('search_path', joinPaths(memValue.includes || []));
    handleChange('exclude_search_path', joinPaths(memValue.excludes || []));
    onTriggerSearch?.();
  }, [handleChange, onTriggerSearch]);

  // onClose：提交正则 + 若有非空路径组合则存记忆
  const handleClose = useCallback(() => {
    commitRegex();
    if (includes.length > 0 || excludes.length > 0) {
      // label 仅做向后兼容（旧缓存可能还在用），实际渲染走 segments
      const segs = buildMemorySegments(includes, excludes);
      if (segs.length > 0) {
        const fallbackLabel = segs.map(s => s.label + (s.badge ? ` ${s.badge}` : '')).join(' · ');
        addPathMemory(fallbackLabel, { includes, excludes });
      }
    }
  }, [commitRegex, includes, excludes, addPathMemory]);

  // 重置
  const handleReset = useCallback(() => {
    handleChange('search_path', '');
    handleChange('exclude_search_path', '');
    handleChange('filter_url_regexp', '');
    // 清理遗留字段（防止老数据残留）
    if (searchParams.search_in_scene) handleChange('search_in_scene', false);
    setLocalRegex('');
    setShowAdvanced(false);
    onTriggerSearch?.();
  }, [handleChange, onTriggerSearch, searchParams.search_in_scene]);

  const isActive =
    includes.length > 0 || excludes.length > 0 || !!searchParams.filter_url_regexp;

  return (
    <FilterPopoverButton
      label={t?.('fabFilterPath') || '路径'}
      isActive={isActive}
      badgeCount={includes.length + excludes.length}
      onClose={handleClose}
      onReset={handleReset}
      minW="440px"
      maxW="520px"
    >
      <VStack spacing={3} align="stretch">
        {/* === 最近自定义（记忆） === */}
        {pathMemories.length > 0 && (
          <Box>
            <Text
              fontSize="12px"
              color="whiteAlpha.600"
              fontWeight="500"
              letterSpacing="0.02em"
              mb={2.5}
            >
              {t?.('pathRecentMemory') || t?.('recentCustom') || '最近路径组合'}
            </Text>
            <Wrap spacing={2}>
              {pathMemories.map((mem, idx) => {
                const segs = buildMemorySegments(
                  mem.value.includes,
                  mem.value.excludes,
                  t?.('memoryMoreSuffix') || '项'
                );
                if (segs.length === 0) return null;
                return (
                  <WrapItem key={idx}>
                    <MemoryChip
                      segments={segs}
                      tooltip={buildMemoryTooltip(mem.value.includes, mem.value.excludes)}
                      onClick={() => handleApplyMemory(mem.value)}
                      onRemove={() => removePathMemory(mem.value)}
                    />
                  </WrapItem>
                );
              })}
            </Wrap>
            <Divider borderColor="whiteAlpha.100" mt={3} />
          </Box>
        )}

        {/* === 主体：树形浏览器 === */}
        <PathTreeBrowser
          tree={pathTree}
          includes={includes}
          excludes={excludes}
          onChange={handleTreeChange}
          t={t}
        />

        {/* === 高级抽屉：手动输入 + URL 正则 === */}
        <Box>
          <Button
            size="xs"
            variant="ghost"
            w="100%"
            justifyContent="flex-start"
            leftIcon={showAdvanced ? <ChevronDownIcon /> : <ChevronRightIcon />}
            color="whiteAlpha.600"
            fontWeight="400"
            fontSize="12px"
            letterSpacing="0.02em"
            _hover={{ bg: 'whiteAlpha.50', color: 'whiteAlpha.900' }}
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {t?.('pathAdvanced') || '高级（手动输入 / URL 正则）'}
          </Button>
          <Collapse in={showAdvanced} animateOpacity>
            <VStack spacing={3} pt={2} align="stretch">
              {/* 手动输入 */}
              <Box>
                <Text fontSize="10px" color="whiteAlpha.500" mb={1.5}>
                  {t?.('pathManualHint') || '手动输入路径（逗号分隔多个）'}
                </Text>
                <VStack spacing={2} align="stretch">
                  <Input
                    size="sm"
                    placeholder={t?.('pathIncludeManual') || '包含: /Library/Test/Assets'}
                    value={joinPaths(includes)}
                    onChange={(e) => handleChange('search_path', e.target.value)}
                    onBlur={onTriggerSearch}
                    onKeyDown={(e) => e.key === 'Enter' && onTriggerSearch?.()}
                    sx={inputSx}
                  />
                  <Input
                    size="sm"
                    placeholder={t?.('pathExcludeManual') || '排除: /tmp, /archive'}
                    value={joinPaths(excludes)}
                    onChange={(e) => handleChange('exclude_search_path', e.target.value)}
                    onBlur={onTriggerSearch}
                    onKeyDown={(e) => e.key === 'Enter' && onTriggerSearch?.()}
                    sx={inputSx}
                  />
                </VStack>
              </Box>

              {/* URL 正则 */}
              <Divider borderColor="whiteAlpha.100" />
              <Box>
                <Text fontSize="10px" color="whiteAlpha.500" mb={1.5}>
                  {t?.('pathUrlRegexpHint') || '匹配完整 URL 的正则表达式'}
                </Text>
                <Input
                  size="sm"
                  placeholder={t?.('pathUrlRegexpPlaceholder') || '.*city.*'}
                  value={localRegex}
                  onChange={(e) => setLocalRegex(e.target.value)}
                  onBlur={commitRegex}
                  onKeyDown={(e) => e.key === 'Enter' && commitRegex()}
                  sx={{ ...inputSx, fontFamily: 'mono' }}
                />
              </Box>
            </VStack>
          </Collapse>
        </Box>
      </VStack>
    </FilterPopoverButton>
  );
});

export default PathFilter;
