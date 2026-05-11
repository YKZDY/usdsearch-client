import React, { memo, useCallback, useMemo, useState } from 'react';
import { VStack, HStack, Text, Input, Divider, Wrap, WrapItem, Tag, TagLabel, TagCloseButton, Box, Button } from '@chakra-ui/react';
import { ChevronDownIcon, ChevronUpIcon } from '@chakra-ui/icons';
import FilterPopoverButton from './FilterPopoverButton';
import { useLocalFilterState } from '../shared/useLocalFilterState';
import { useFilterMemory } from '../../hooks/useFilterMemory';

const USER_KEYS = ['created_by', 'exclude_created_by', 'modified_by', 'exclude_modified_by'];
const MODIFIER_KEYS = ['modified_by', 'exclude_modified_by'];

const inputSx = {
  bg: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '8px',
  _hover: { borderColor: 'whiteAlpha.400' },
  _focus: { borderColor: 'white', bg: 'rgba(255,255,255,0.08)' },
  color: 'white',
  fontSize: '12px',
};

/**
 * UserFilter - 用户筛选面板（升级版）
 *
 * 重要变化：
 * - 「修改者」整块折叠到「+ 高级筛选（按修改者）」抽屉
 * - 抽屉默认折叠；若 modified_by/exclude_modified_by 已有值则自动展开
 * - 折叠按钮显示已设值数量徽章（金色字 +chip 数）
 */
const UserFilter = memo(function UserFilter({
  searchParams,
  handleChange,
  onTriggerSearch,
  results = [],
  t,
}) {
  const { memories: userMemories, addMemory: addUserMemory, removeMemory: removeUserMemory } = useFilterMemory('user');

  // 修改者高级抽屉：有值时初始展开
  const [showModifier, setShowModifier] = useState(() =>
    !!(searchParams.modified_by || searchParams.exclude_modified_by)
  );

  // 修改者已设值数量
  const modifierCount = MODIFIER_KEYS.filter(k => !!searchParams[k]).length;

  const onCommit = useCallback((changed) => {
    Object.entries(changed).forEach(([key, val]) => {
      handleChange(key, val);
    });
    const creator = changed.created_by ?? searchParams.created_by ?? '';
    const modifier = changed.modified_by ?? searchParams.modified_by ?? '';
    if (creator && creator.trim()) addUserMemory(creator.trim(), creator.trim());
    if (modifier && modifier.trim()) addUserMemory(modifier.trim(), modifier.trim());
    onTriggerSearch?.();
  }, [handleChange, onTriggerSearch, searchParams, addUserMemory]);

  const { localValues, setLocalValue, commit, reset } = useLocalFilterState(
    searchParams,
    USER_KEYS,
    onCommit
  );

  const availableCreators = useMemo(() => {
    const userMap = new Map();
    results.forEach(item => {
      const creator = item.source?.created_by;
      if (creator && typeof creator === 'string') {
        userMap.set(creator, (userMap.get(creator) || 0) + 1);
      }
    });
    return Array.from(userMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([user, count]) => ({ label: user, value: user, count }));
  }, [results]);

  const availableModifiers = useMemo(() => {
    const userMap = new Map();
    results.forEach(item => {
      const modifier = item.source?.modified_by;
      if (modifier && typeof modifier === 'string') {
        userMap.set(modifier, (userMap.get(modifier) || 0) + 1);
      }
    });
    return Array.from(userMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([user, count]) => ({ label: user, value: user, count }));
  }, [results]);

  const handleSelectCreator = useCallback((user) => {
    if (searchParams.created_by === user) {
      handleChange('created_by', '');
    } else {
      handleChange('created_by', user);
      addUserMemory(user, user);
    }
    onTriggerSearch?.();
  }, [handleChange, onTriggerSearch, searchParams, addUserMemory]);

  const handleSelectModifier = useCallback((user) => {
    if (searchParams.modified_by === user) {
      handleChange('modified_by', '');
    } else {
      handleChange('modified_by', user);
      addUserMemory(user, user);
    }
    onTriggerSearch?.();
  }, [handleChange, onTriggerSearch, searchParams, addUserMemory]);

  const handleMemoryTag = useCallback((user) => {
    if (searchParams.created_by === user) {
      handleChange('created_by', '');
    } else {
      handleChange('created_by', user);
    }
    onTriggerSearch?.();
  }, [handleChange, onTriggerSearch, searchParams]);

  const handleReset = useCallback(() => {
    USER_KEYS.forEach(key => handleChange(key, ''));
    reset();
    onTriggerSearch?.();
  }, [handleChange, reset, onTriggerSearch]);

  const isActive = USER_KEYS.some(key => !!searchParams[key]);
  const badgeCount = USER_KEYS.filter(key => !!searchParams[key]).length;

  return (
    <FilterPopoverButton
      label={t?.('fabFilterUser') || '用户'}
      isActive={isActive}
      badgeCount={badgeCount}
      onClose={commit}
      onReset={handleReset}
      minW="320px"
      maxW="400px"
    >
      <VStack spacing={3} align="stretch">
        {/* 记忆的用户名 */}
        {userMemories.length > 0 && availableCreators.length === 0 && (
          <>
            <Text fontSize="12px" color="whiteAlpha.600" fontWeight="500" letterSpacing="0.02em">
              {t?.('recentUsers') || '最近使用'}
            </Text>
            <Wrap spacing={2}>
              {userMemories.map((mem, idx) => {
                const isSelected = searchParams.created_by === mem.value || searchParams.modified_by === mem.value;
                return (
                  <WrapItem key={idx}>
                    <Tag
                      size="md"
                      variant={isSelected ? 'solid' : 'subtle'}
                      bg={isSelected ? 'rgba(255, 210, 48, 0.2)' : 'rgba(255,255,255,0.05)'}
                      color={isSelected ? '#FFD230' : 'whiteAlpha.700'}
                      border="1px solid"
                      borderColor={isSelected ? 'rgba(255, 210, 48, 0.5)' : 'rgba(255,255,255,0.15)'}
                      borderRadius="full"
                      cursor="pointer"
                      px={3}
                      py={1}
                      minH="28px"
                      _hover={{ bg: isSelected ? 'rgba(255, 210, 48, 0.3)' : 'whiteAlpha.100' }}
                      transition="all 0.15s ease"
                      onClick={() => handleMemoryTag(mem.value)}
                      userSelect="none"
                    >
                      <TagLabel fontSize="13px">{mem.label}</TagLabel>
                      <TagCloseButton onClick={(e) => { e.stopPropagation(); removeUserMemory(mem.value); }} />
                    </Tag>
                  </WrapItem>
                );
              })}
            </Wrap>
            <Divider borderColor="whiteAlpha.200" />
          </>
        )}

        {/* 创建者快捷选择 */}
        {availableCreators.length > 0 && (
          <>
            <Text fontSize="12px" color="whiteAlpha.700" fontWeight="500" letterSpacing="0.02em">
              {t?.('userQuickCreators') || '快捷选择创建者'}
            </Text>
            <Wrap spacing={2}>
              {availableCreators.map((user, idx) => (
                <WrapItem key={idx}>
                  <Tag
                    size="md"
                    variant={searchParams.created_by === user.value ? 'solid' : 'subtle'}
                    bg={searchParams.created_by === user.value ? 'rgba(255, 210, 48, 0.2)' : 'whiteAlpha.100'}
                    color={searchParams.created_by === user.value ? '#FFD230' : 'whiteAlpha.800'}
                    border="1px solid"
                    borderColor={searchParams.created_by === user.value ? 'rgba(255, 210, 48, 0.5)' : 'transparent'}
                    borderRadius="full"
                    cursor="pointer"
                    px={3}
                    py={1}
                    minH="28px"
                    _hover={{ bg: 'whiteAlpha.200', borderColor: 'whiteAlpha.300' }}
                    transition="all 0.15s ease"
                    onClick={() => handleSelectCreator(user.value)}
                    userSelect="none"
                  >
                    <TagLabel fontSize="13px">
                      {user.label} ({user.count})
                    </TagLabel>
                  </Tag>
                </WrapItem>
              ))}
            </Wrap>
          </>
        )}

        {/* 创建者输入 */}
        <Text fontSize="12px" color="whiteAlpha.700" fontWeight="500" letterSpacing="0.02em">
          {t?.('userCreatedBy') || '创建者'}
        </Text>
        <Input
          size="sm"
          placeholder={t?.('userCreatedByPlaceholder') || '用户名'}
          value={localValues.created_by || ''}
          onChange={(e) => setLocalValue('created_by', e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          sx={inputSx}
        />

        <Text fontSize="12px" color="whiteAlpha.700" fontWeight="500" letterSpacing="0.02em">
          {t?.('userExcludeCreatedBy') || '排除创建者'}
        </Text>
        <Input
          size="sm"
          placeholder={t?.('userExcludePlaceholder') || '排除的用户名'}
          value={localValues.exclude_created_by || ''}
          onChange={(e) => setLocalValue('exclude_created_by', e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          sx={inputSx}
        />

        {/* === 修改者高级抽屉 === */}
        <Box>
          <Button
            size="xs"
            variant="ghost"
            w="100%"
            justifyContent="space-between"
            color={modifierCount > 0 ? 'rgba(255, 210, 48, 0.95)' : 'whiteAlpha.600'}
            fontWeight={modifierCount > 0 ? '500' : '400'}
            fontSize="12px"
            letterSpacing="0.02em"
            h="26px"
            px={2}
            _hover={{ bg: 'whiteAlpha.50', color: modifierCount > 0 ? '#FFD230' : 'whiteAlpha.900' }}
            onClick={() => setShowModifier(v => !v)}
            rightIcon={showModifier ? <ChevronUpIcon /> : <ChevronDownIcon />}
          >
            <HStack spacing={2}>
              <Text>{t?.('userModifierAdvanced') || '高级筛选（按修改者）'}</Text>
              {modifierCount > 0 && (
                <Box
                  bg="rgba(255, 210, 48, 0.18)"
                  color="#FFD230"
                  fontSize="10px"
                  fontWeight="600"
                  px={1.5}
                  h="16px"
                  lineHeight="16px"
                  borderRadius="full"
                  letterSpacing="0.02em"
                >
                  {t?.('userModifierActiveCount', { count: modifierCount }) || `已设 ${modifierCount} 项`}
                </Box>
              )}
            </HStack>
          </Button>
        </Box>

        {showModifier && (
          <VStack spacing={3} align="stretch" pl={1}>
            {availableModifiers.length > 0 && (
              <>
                <Text fontSize="12px" color="whiteAlpha.700" fontWeight="500" letterSpacing="0.02em">
                  {t?.('userQuickModifiers') || '快捷选择修改者'}
                </Text>
                <Wrap spacing={2}>
                  {availableModifiers.map((user, idx) => (
                    <WrapItem key={idx}>
                      <Tag
                        size="md"
                        variant={searchParams.modified_by === user.value ? 'solid' : 'subtle'}
                        bg={searchParams.modified_by === user.value ? 'rgba(255, 210, 48, 0.2)' : 'whiteAlpha.100'}
                        color={searchParams.modified_by === user.value ? '#FFD230' : 'whiteAlpha.800'}
                        border="1px solid"
                        borderColor={searchParams.modified_by === user.value ? 'rgba(255, 210, 48, 0.5)' : 'transparent'}
                        borderRadius="full"
                        cursor="pointer"
                        px={3}
                        py={1}
                        minH="28px"
                        _hover={{ bg: 'whiteAlpha.200', borderColor: 'whiteAlpha.300' }}
                        transition="all 0.15s ease"
                        onClick={() => handleSelectModifier(user.value)}
                        userSelect="none"
                      >
                        <TagLabel fontSize="13px">
                          {user.label} ({user.count})
                        </TagLabel>
                      </Tag>
                    </WrapItem>
                  ))}
                </Wrap>
              </>
            )}

            <Text fontSize="12px" color="whiteAlpha.700" fontWeight="500" letterSpacing="0.02em">
              {t?.('userModifiedBy') || '修改者'}
            </Text>
            <Input
              size="sm"
              placeholder={t?.('userModifiedByPlaceholder') || '用户名'}
              value={localValues.modified_by || ''}
              onChange={(e) => setLocalValue('modified_by', e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => e.key === 'Enter' && commit()}
              sx={inputSx}
            />

            <Text fontSize="12px" color="whiteAlpha.700" fontWeight="500" letterSpacing="0.02em">
              {t?.('userExcludeModifiedBy') || '排除修改者'}
            </Text>
            <Input
              size="sm"
              placeholder={t?.('userExcludePlaceholder') || '排除的用户名'}
              value={localValues.exclude_modified_by || ''}
              onChange={(e) => setLocalValue('exclude_modified_by', e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => e.key === 'Enter' && commit()}
              sx={inputSx}
            />
          </VStack>
        )}

        {availableCreators.length === 0 && availableModifiers.length === 0 && (
          <Text fontSize="12px" color="whiteAlpha.500" letterSpacing="0.02em">
            {t?.('userNoResults') || '搜索结果中暂无用户数据，请先执行搜索'}
          </Text>
        )}
      </VStack>
    </FilterPopoverButton>
  );
});

export default UserFilter;
