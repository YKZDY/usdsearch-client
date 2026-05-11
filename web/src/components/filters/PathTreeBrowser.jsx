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
} from '@chakra-ui/react';
import { ChevronRightIcon, ChevronDownIcon, AddIcon, MinusIcon, SearchIcon } from '@chakra-ui/icons';

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
  const prevTreeRef = useRef(tree);

  // 自动展开 live 节点祖先链（搜索结果回流后自动展开有数据的路径）
  useEffect(() => {
    if (tree === prevTreeRef.current) return;
    prevTreeRef.current = tree;
    const liveAncestors = new Set();
    const collectLiveAncestors = (nodes, ancestors = []) => {
      for (const node of nodes) {
        if (node.live) {
          ancestors.forEach(a => liveAncestors.add(a));
          liveAncestors.add(node.path); // 也展开 live 节点自身（如果有子节点）
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

      return (
        <Box key={node.path}>
          <HStack
            spacing={1}
            py={1}
            px={2}
            pl={`${8 + depth * 18}px`}
            borderRadius="6px"
            cursor={hasChildren ? 'pointer' : 'default'}
            _hover={{ bg: 'whiteAlpha.50' }}
            role="group"
            onClick={() => hasChildren && toggleExpand(node.path)}
            bg={isInc ? 'rgba(123,200,255,0.08)' : isExc ? 'rgba(255,139,139,0.08)' : 'transparent'}
          >
            <Box w="14px" display="flex" alignItems="center" justifyContent="center">
              {hasChildren ? (
                isOpen ? (
                  <ChevronDownIcon boxSize={3} color="whiteAlpha.600" />
                ) : (
                  <ChevronRightIcon boxSize={3} color="whiteAlpha.600" />
                )
              ) : (
                <Box w="3px" h="3px" borderRadius="full" bg="whiteAlpha.300" />
              )}
            </Box>

            <Text
              fontSize="12px"
              color={isInc ? '#7BC8FF' : isExc ? '#FF8B8B' : 'whiteAlpha.900'}
              fontWeight={node.live ? 600 : 400}
              flex={1}
              isTruncated
              title={node.path}
            >
              {node.name}
              {node.live && (
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
              <Text fontSize="10px" color="whiteAlpha.500" fontFamily="mono" mr={1}>
                {node.count >= 1000 ? `${(node.count / 1000).toFixed(1)}k` : node.count}
              </Text>
            )}

            <HStack spacing={0} opacity={isInc || isExc ? 1 : 0} _groupHover={{ opacity: 1 }} transition="opacity 0.15s">
              <Tooltip label={isInc ? t?.('pathRemoveInclude') || '取消包含' : t?.('pathAddInclude') || '加入搜索路径'} hasArrow>
                <IconButton
                  aria-label="include"
                  size="xs"
                  variant="ghost"
                  minW="20px"
                  h="20px"
                  icon={<AddIcon boxSize={2.5} />}
                  color={isInc ? '#7BC8FF' : 'whiteAlpha.500'}
                  bg={isInc ? 'rgba(123,200,255,0.2)' : 'transparent'}
                  _hover={{ bg: 'rgba(123,200,255,0.3)', color: '#7BC8FF' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleInclude(node.path);
                  }}
                />
              </Tooltip>
              <Tooltip label={isExc ? t?.('pathRemoveExclude') || '取消排除' : t?.('pathAddExclude') || '排除该路径'} hasArrow>
                <IconButton
                  aria-label="exclude"
                  size="xs"
                  variant="ghost"
                  minW="20px"
                  h="20px"
                  icon={<MinusIcon boxSize={2.5} />}
                  color={isExc ? '#FF8B8B' : 'whiteAlpha.500'}
                  bg={isExc ? 'rgba(255,139,139,0.2)' : 'transparent'}
                  _hover={{ bg: 'rgba(255,139,139,0.3)', color: '#FF8B8B' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleExclude(node.path);
                  }}
                />
              </Tooltip>
            </HStack>
          </HStack>

          {hasChildren && (
            <Collapse in={isOpen} animateOpacity unmountOnExit>
              <Box>{renderNodes(node.children, depth + 1)}</Box>
            </Collapse>
          )}
        </Box>
      );
    });

  return (
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
  );
});

export default PathTreeBrowser;
