import { memo, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Box,
  HStack,
  VStack,
  Text,
  Input,
  IconButton,
  Tag,
  TagLabel,
  TagCloseButton,
  Wrap,
  WrapItem,
  Tooltip,
  Collapse,
  Portal,
  useToast,
} from '@chakra-ui/react';
import {
  ChevronRightIcon,
  ChevronDownIcon,
  AddIcon,
  MinusIcon,
  SearchIcon,
  CheckIcon,
  CopyIcon,
} from '@chakra-ui/icons';

/**
 * PathTreeBrowser - 路径树形浏览器（路径筛选主体）
 *
 * Props:
 * - tree: 嵌套目录树数据，节点格式 { name, path, count, children?, live? }
 * - includes: string[] 已选「包含」路径
 * - excludes: string[] 已选「排除」路径
 * - onChange: ({ includes, excludes }) => void
 * - t: i18n 函数
 *
 * 设计要点：
 * - 默认仅展开第一层；点击 ▸/▾ 折叠展开
 * - 顶部搜索：输入即过滤，命中节点自动展开父链
 * - 节点行：[展开图标] 名称 (count)  [+] [−]
 * - 已选：上方 Wrap 区，蓝色 = 包含，红色 = 排除，× 移除
 * - 一个路径在 includes 与 excludes 中互斥（再次点击切换）
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

/** 计算「过滤后的节点路径集合 + 需要展开的祖先集合」 */
function computeFilterMatches(tree, query) {
  if (!query || !query.trim()) return null;
  const q = query.trim().toLowerCase();
  const matched = new Set();
  const expand = new Set();

  const walk = (nodes, ancestors) => {
    for (const node of nodes) {
      const hit = node.path.toLowerCase().includes(q) || node.name.toLowerCase().includes(q);
      if (hit) {
        matched.add(node.path);
        ancestors.forEach(a => expand.add(a));
      }
      if (node.children?.length) {
        walk(node.children, [...ancestors, node.path]);
      }
    }
  };
  walk(tree, []);
  return { matched, expand };
}

/** 主组件 */
const PathTreeBrowser = memo(function PathTreeBrowser({
  tree = [],
  includes = [],
  excludes = [],
  onChange,
  t,
}) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(() => new Set(['/Library', '/Library/Test', '/Users'])); // 默认展开真实环境主目录
  const [contextMenu, setContextMenu] = useState(null); // { x, y, node } | null
  const toast = useToast();
  const prevTreeRef = useRef(tree);

  // 自动展开 hasMatch 节点祖先链（搜索结果回流后自动展开有数据的路径）
  // ⚠️ 必须用 hasMatch（搜索命中），不能用 node.live（后者由 useNucleusTree
  // 表示「该节点来自真实 listing」，与搜索无关）
  useEffect(() => {
    if (tree === prevTreeRef.current) return;
    prevTreeRef.current = tree;
    const liveAncestors = new Set();
    const collectLiveAncestors = (nodes, ancestors = []) => {
      for (const node of nodes) {
        if (node.hasMatch) {
          ancestors.forEach(a => liveAncestors.add(a));
          liveAncestors.add(node.path); // 也展开 hasMatch 节点自身（如果有子节点）
        }
        if (node.children?.length) {
          collectLiveAncestors(node.children, [...ancestors, node.path]);
        }
      }
    };
    collectLiveAncestors(tree);
    if (liveAncestors.size > 0) {
      setExpanded(prev => {
        const next = new Set(prev);
        liveAncestors.forEach(p => next.add(p));
        return next;
      });
    }
  }, [tree]);

  const filterResult = useMemo(() => computeFilterMatches(tree, query), [tree, query]);
  const forceExpanded = !!query.trim(); // 搜索时强制展开命中分支

  // 右键菜单：全局点击/Escape/右键空白处 关闭
  useEffect(() => {
    if (!contextMenu) return undefined;
    const close = () => setContextMenu(null);
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  const toggleExpand = useCallback((path) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const includeSet = useMemo(() => new Set(includes), [includes]);
  const excludeSet = useMemo(() => new Set(excludes), [excludes]);

  const handleInclude = useCallback(
    (path) => {
      const inc = new Set(includeSet);
      const exc = new Set(excludeSet);
      if (inc.has(path)) {
        inc.delete(path);
      } else {
        inc.add(path);
        exc.delete(path); // 互斥
      }
      onChange?.({ includes: [...inc], excludes: [...exc] });
    },
    [includeSet, excludeSet, onChange]
  );

  const handleExclude = useCallback(
    (path) => {
      const inc = new Set(includeSet);
      const exc = new Set(excludeSet);
      if (exc.has(path)) {
        exc.delete(path);
      } else {
        exc.add(path);
        inc.delete(path); // 互斥
      }
      onChange?.({ includes: [...inc], excludes: [...exc] });
    },
    [includeSet, excludeSet, onChange]
  );

  const removeChip = useCallback(
    (path, kind) => {
      const inc = new Set(includeSet);
      const exc = new Set(excludeSet);
      if (kind === 'include') inc.delete(path);
      else exc.delete(path);
      onChange?.({ includes: [...inc], excludes: [...exc] });
    },
    [includeSet, excludeSet, onChange]
  );

  const totalChips = includes.length + excludes.length;

  // 递归渲染（手动注入 isIncluded / isExcluded，因为 TreeNodeRow 自身判断会丢失子节点状态）
  const renderNodes = (nodes, depth = 0) =>
    nodes.map((node) => {
      const filteredOut = filterResult && !filterResult.matched.has(node.path) && !filterResult.expand.has(node.path);
      if (filteredOut) return null;

      const hasChildren = !!node.children?.length;
      const isOpen = forceExpanded || expanded.has(node.path);
      const isInc = includeSet.has(node.path);
      const isExc = excludeSet.has(node.path);

      // 三色：包含=蓝、排除=红、默认=透明
      const stateColor = isInc ? '#7BC8FF' : isExc ? '#FF8B8B' : null;
      const stateBg = isInc
        ? 'rgba(123,200,255,0.10)'
        : isExc
        ? 'rgba(255,139,139,0.10)'
        : 'transparent';

      return (
        <Box key={node.path}>
          <HStack
            spacing={0}
            h="30px"
            borderRadius="6px"
            role="group"
            position="relative"
            cursor="default"
            bg="transparent"
            sx={{
              // 底色用伪元素叠加，opacity 渐变避免 bg 跳变重绘
              '&::before': {
                content: '""',
                position: 'absolute',
                inset: 0,
                borderRadius: '6px',
                background: stateBg,
                opacity: stateColor ? 1 : 0,
                pointerEvents: 'none',
                transition: 'opacity 0.1s linear',
              },
              // hover 在未选中态才显示一层弱化底
              '&:hover::after': {
                content: '""',
                position: 'absolute',
                inset: 0,
                borderRadius: '6px',
                background: stateColor ? 'transparent' : 'rgba(255,255,255,0.04)',
                pointerEvents: 'none',
              },
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, node });
            }}
          >
            {/* 左侧高亮条 — 始终占 3px 宽位，通过 opacity 显隐避免重排 */}
            <Box
              w="3px"
              h="60%"
              flexShrink={0}
              borderRadius="0 2px 2px 0"
              bg={stateColor || 'transparent'}
              opacity={stateColor ? 1 : 0}
              transition="opacity 0.1s linear"
              pointerEvents="none"
            />

            {/* Zone 1：chevron 区（约 21px + 缩进） — 仅展开/收起 */}
            <Box
              w={`${21 + depth * 16}px`}
              h="full"
              display="flex"
              alignItems="center"
              justifyContent="flex-end"
              pr="4px"
              cursor={hasChildren ? 'pointer' : 'default'}
              onClick={(e) => {
                e.stopPropagation();
                if (hasChildren) toggleExpand(node.path);
              }}
              _hover={hasChildren ? { '& .pt-chev': { color: 'whiteAlpha.900' } } : undefined}
            >
              {hasChildren ? (
                isOpen ? (
                  <ChevronDownIcon className="pt-chev" boxSize={3.5} color="whiteAlpha.600" />
                ) : (
                  <ChevronRightIcon className="pt-chev" boxSize={3.5} color="whiteAlpha.600" />
                )
              ) : (
                <Box w="3px" h="3px" borderRadius="full" bg="whiteAlpha.300" />
              )}
            </Box>

            {/* Zone 2：标签区（flex=1） — 单击 = 加入/取消包含 */}
            <HStack
              spacing={1.5}
              flex={1}
              minW={0}
              h="full"
              px={2}
              cursor="pointer"
              onClick={(e) => {
                e.stopPropagation();
                handleInclude(node.path);
              }}
            >
              <Text
                fontSize="12px"
                color={isInc ? '#7BC8FF' : isExc ? '#FF8B8B' : 'whiteAlpha.900'}
                fontWeight={node.hasMatch || isInc || isExc ? 600 : 400}
                flex={1}
                isTruncated
              >
                {node.name}
                {node.hasMatch && (
                  <Box
                    as="span"
                    ml={1.5}
                    w="4px"
                    h="4px"
                    display="inline-block"
                    borderRadius="full"
                    bg="#FFD230"
                    verticalAlign="middle"
                  />
                )}
              </Text>

              {node.count > 0 && (
                <Text fontSize="10px" color="whiteAlpha.500" fontFamily="mono">
                  {node.count >= 1000 ? `${(node.count / 1000).toFixed(1)}k` : node.count}
                </Text>
              )}
            </HStack>

            {/* Zone 3：操作区（+/− 24×24 极简）—— 无边框，仅靠 opacity + 浅底色，避免抖动 */}
            <HStack spacing={0.5} pr={2} pl={1} flexShrink={0}>
              <IconButton
                aria-label={isInc ? (t?.('pathContextRemoveInclude') || '取消包含') : (t?.('pathContextInclude') || '加入搜索路径')}
                title={isInc ? (t?.('pathContextRemoveInclude') || '取消包含') : (t?.('pathContextInclude') || '加入搜索路径')}
                size="sm"
                variant="ghost"
                minW="24px"
                w="24px"
                h="24px"
                borderRadius="5px"
                icon={isInc ? <CheckIcon boxSize={2.5} /> : <AddIcon boxSize={2} />}
                color={isInc ? '#7BC8FF' : 'whiteAlpha.500'}
                bg={isInc ? 'rgba(123,200,255,0.18)' : 'transparent'}
                opacity={isInc ? 1 : 0.65}
                _hover={{
                  bg: isInc ? 'rgba(123,200,255,0.28)' : 'rgba(123,200,255,0.16)',
                  color: '#7BC8FF',
                  opacity: 1,
                }}
                _active={{ transform: 'none' }}
                transition="opacity 0.1s linear, color 0.1s linear, background-color 0.1s linear"
                onClick={(e) => {
                  e.stopPropagation();
                  handleInclude(node.path);
                }}
              />
              <IconButton
                aria-label={isExc ? (t?.('pathContextRemoveExclude') || '取消排除') : (t?.('pathContextExclude') || '排除该路径')}
                title={isExc ? (t?.('pathContextRemoveExclude') || '取消排除') : (t?.('pathContextExclude') || '排除该路径')}
                size="sm"
                variant="ghost"
                minW="24px"
                w="24px"
                h="24px"
                borderRadius="5px"
                icon={<MinusIcon boxSize={2} />}
                color={isExc ? '#FF8B8B' : 'whiteAlpha.500'}
                bg={isExc ? 'rgba(255,139,139,0.18)' : 'transparent'}
                opacity={isExc ? 1 : 0.65}
                _hover={{
                  bg: isExc ? 'rgba(255,139,139,0.28)' : 'rgba(255,139,139,0.16)',
                  color: '#FF8B8B',
                  opacity: 1,
                }}
                _active={{ transform: 'none' }}
                transition="opacity 0.1s linear, color 0.1s linear, background-color 0.1s linear"
                onClick={(e) => {
                  e.stopPropagation();
                  handleExclude(node.path);
                }}
              />
            </HStack>
          </HStack>

          {hasChildren && (
            <Collapse in={isOpen} animateOpacity={false} unmountOnExit>
              <Box>{renderNodes(node.children, depth + 1)}</Box>
            </Collapse>
          )}
        </Box>
      );
    });

  // 右键菜单点击处理
  const handleMenuAction = useCallback((action, node) => {
    if (!node) return;
    setContextMenu(null);
    if (action === 'include') return handleInclude(node.path);
    if (action === 'exclude') return handleExclude(node.path);
    if (action === 'toggleExpand') return toggleExpand(node.path);
    if (action === 'copy') {
      const text = node.path;
      const showOk = () => toast({
        title: t?.('pathContextCopied') || '已复制',
        status: 'success',
        duration: 1200,
        position: 'bottom',
        variant: 'subtle',
      });
      try {
        navigator.clipboard?.writeText(text).then(showOk).catch(() => {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          showOk();
        });
      } catch (err) {
        console.error('[PathTreeBrowser] copy failed', err);
      }
    }
  }, [handleInclude, handleExclude, toggleExpand, toast, t]);

  return (
    <>
    <VStack spacing={2} align="stretch">
      {/* 顶部搜索 */}
      <HStack spacing={2}>
        <Box flex={1} position="relative">
          <SearchIcon
            position="absolute"
            left="10px"
            top="50%"
            transform="translateY(-50%)"
            boxSize={3}
            color="whiteAlpha.500"
            zIndex={1}
          />
          <Input
            size="sm"
            pl="30px"
            placeholder={t?.('pathSearchTreePlaceholder') || '搜索目录…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            sx={inputSx}
          />
        </Box>
      </HStack>

      {/* 已选 chips */}
      {totalChips > 0 && (
        <Wrap spacing={1.5}>
          {includes.map((p) => (
            <WrapItem key={`inc-${p}`}>
              <Tooltip label={p} hasArrow placement="top" openDelay={300}>
                <Tag
                  size="sm"
                  variant="subtle"
                  bg="rgba(123,200,255,0.15)"
                  color="#7BC8FF"
                  border="1px solid rgba(123,200,255,0.3)"
                  borderRadius="6px"
                >
                  <TagLabel fontSize="11px">{p.split('/').filter(Boolean).pop() || p}</TagLabel>
                  <TagCloseButton onClick={() => removeChip(p, 'include')} />
                </Tag>
              </Tooltip>
            </WrapItem>
          ))}
          {excludes.map((p) => (
            <WrapItem key={`exc-${p}`}>
              <Tooltip label={p} hasArrow placement="top" openDelay={300}>
                <Tag
                  size="sm"
                  variant="subtle"
                  bg="rgba(255,139,139,0.15)"
                  color="#FF8B8B"
                  border="1px solid rgba(255,139,139,0.3)"
                  borderRadius="6px"
                >
                  <TagLabel fontSize="11px">✕ {p.split('/').filter(Boolean).pop() || p}</TagLabel>
                  <TagCloseButton onClick={() => removeChip(p, 'exclude')} />
                </Tag>
              </Tooltip>
            </WrapItem>
          ))}
        </Wrap>
      )}

      {/* 树形列表 */}
      <Box
        maxH="280px"
        overflowY="auto"
        bg="rgba(0,0,0,0.2)"
        border="1px solid rgba(255,255,255,0.08)"
        borderRadius="8px"
        py={1}
        sx={{
          '&::-webkit-scrollbar': { width: '6px' },
          '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.15)', borderRadius: '3px' },
        }}
      >
        {tree.length === 0 ? (
          <Text fontSize="11px" color="whiteAlpha.500" textAlign="center" py={4}>
            {t?.('pathNoData') || '暂无目录数据'}
          </Text>
        ) : (
          renderNodes(tree)
        )}
        {filterResult && filterResult.matched.size === 0 && (
          <Text fontSize="11px" color="whiteAlpha.500" textAlign="center" py={3}>
            {t?.('pathNoMatch') || '没有匹配的目录'}
          </Text>
        )}
      </Box>

      {/* 提示 */}
      <HStack spacing={2} fontSize="12px" color="whiteAlpha.600" letterSpacing="0.02em">
        <HStack spacing={1.5}>
          <Box w="7px" h="7px" borderRadius="full" bg="#FFD230" boxShadow="0 0 6px rgba(255, 210, 48, 0.5)" />
          <Text>{t?.('pathLiveDataHint') || '当前搜索结果含有数据'}</Text>
        </HStack>
      </HStack>
    </VStack>

    {/* 右键浮动菜单 */}
    {contextMenu && (
      <Portal>
        <Box
          position="fixed"
          left={`${contextMenu.x}px`}
          top={`${contextMenu.y}px`}
          zIndex={2000}
          minW="180px"
          py={1}
          borderRadius="8px"
          bg="rgba(36,36,40,0.96)"
          border="1px solid rgba(255,255,255,0.12)"
          boxShadow="0 10px 30px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.3)"
          sx={{ backdropFilter: 'blur(8px)' }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {(() => {
            const node = contextMenu.node;
            const isInc = includeSet.has(node.path);
            const isExc = excludeSet.has(node.path);
            const hasChildren = !!node.children?.length;
            const items = [
              {
                key: 'include',
                icon: <AddIcon boxSize={2.5} />,
                color: '#7BC8FF',
                label: isInc ? (t?.('pathContextRemoveInclude') || '取消包含') : (t?.('pathContextInclude') || '加入搜索路径'),
              },
              {
                key: 'exclude',
                icon: <MinusIcon boxSize={2.5} />,
                color: '#FF8B8B',
                label: isExc ? (t?.('pathContextRemoveExclude') || '取消排除') : (t?.('pathContextExclude') || '排除该路径'),
              },
              ...(hasChildren ? [{
                key: 'toggleExpand',
                icon: expanded.has(node.path) ? <ChevronDownIcon boxSize={3} /> : <ChevronRightIcon boxSize={3} />,
                color: 'whiteAlpha.800',
                label: expanded.has(node.path) ? (t?.('pathContextCollapse') || '收起') : (t?.('pathContextExpand') || '展开'),
              }] : []),
              {
                key: 'copy',
                icon: <CopyIcon boxSize={2.5} />,
                color: 'whiteAlpha.800',
                label: t?.('pathContextCopy') || '复制路径',
              },
            ];
            return items.map((it) => (
              <HStack
                key={it.key}
                as="button"
                type="button"
                w="full"
                h="30px"
                px={3}
                spacing={2}
                cursor="pointer"
                color="whiteAlpha.900"
                _hover={{ bg: 'whiteAlpha.100' }}
                transition="background 0.1s ease"
                onClick={() => handleMenuAction(it.key, node)}
              >
                <Box w="14px" display="flex" alignItems="center" justifyContent="center" color={it.color}>
                  {it.icon}
                </Box>
                <Text fontSize="12px" flex={1} textAlign="left">{it.label}</Text>
              </HStack>
            ));
          })()}
          <Box h="1px" bg="whiteAlpha.100" my={1} mx={2} />
          <Text px={3} py={1} fontSize="10px" color="whiteAlpha.500" isTruncated>
            {contextMenu.node.path}
          </Text>
        </Box>
      </Portal>
    )}
    </>
  );
});

export default PathTreeBrowser;
