import React, { memo, useCallback, useState } from 'react';
import {
  Box,
  Button,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  useDisclosure,
} from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';

/** Fab 实测的 Popover 面板样式 */
export const popoverContentSx = {
  bg: 'rgba(48, 48, 52, 0.7)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: '12px',
  backdropFilter: 'blur(50px)',
  WebkitBackdropFilter: 'blur(50px)',
  zIndex: 1350,
  boxShadow: [
    '0px 2px 1px rgba(0,0,0,0.1)',
    '0px 4px 2px rgba(0,0,0,0.1)',
    '0px 8px 4px rgba(0,0,0,0.1)',
    '0px 16px 8px rgba(0,0,0,0.1)',
    '0px 32px 16px rgba(0,0,0,0.1)',
  ].join(', '),
  _focus: { boxShadow: 'none' },
};

export const filterButtonSx = {
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

const activeFilterSx = {
  bg: 'rgba(255, 210, 48, 0.12)',
  borderColor: 'rgba(255, 210, 48, 0.45)',
  color: '#FFD230',
};

/**
 * FilterPopoverButton - 通用筛选 Popover 壳组件
 * 
 * 增强功能：
 * - onClose 自动 commit（延迟触发搜索）
 * - 激活态蓝色小圆点 badge
 * - 右上角重置按钮
 * - lazyBehavior="keepMounted" 保持面板状态
 * 
 * Props:
 * - label: 按钮文字
 * - isActive: 是否有激活的筛选条件（显示蓝色圆点）
 * - badge: 旧版 badge 文字（兼容）
 * - onClose: Popover 关闭时回调（触发 commit）
 * - onReset: 重置按钮回调
 * - resetLabel: 重置按钮文字
 * - children: 面板内容
 * - minW/maxW: 面板宽度
 */
const FilterPopoverButton = memo(function FilterPopoverButton({
  label,
  isActive = false,
  badge,
  badgeCount = 0,
  onClose,
  onReset,
  resetLabel = '↺ 重置',
  children,
  minW = '280px',
  maxW = '400px',
}) {
  const { isOpen, onOpen, onClose: onPopoverClose } = useDisclosure();
  const [resetAnimating, setResetAnimating] = useState(false);

  const handleClose = useCallback(() => {
    onPopoverClose();
    onClose?.();
  }, [onClose, onPopoverClose]);

  const handleReset = useCallback(() => {
    setResetAnimating(true);
    onReset?.();
    setTimeout(() => setResetAnimating(false), 400);
  }, [onReset]);

  const showDot = isActive || !!badge;

  return (
    <Popover
      placement="bottom-start"
      isLazy
      lazyBehavior="keepMounted"
      closeOnBlur
      isOpen={isOpen}
      onOpen={onOpen}
      onClose={handleClose}
      modifiers={[
        { name: 'preventOverflow', options: { padding: 16, boundary: 'viewport' } },
        { name: 'flip', options: { fallbackPlacements: ['top-start', 'top-end'] } },
      ]}
    >
      <PopoverTrigger>
        <Button
          size="sm"
          rightIcon={
            <ChevronDownIcon
              boxSize={3}
              transition="transform 0.2s ease"
              transform={isOpen ? 'rotate(180deg)' : 'rotate(0deg)'}
            />
          }
          sx={{ ...filterButtonSx, ...(showDot ? activeFilterSx : {}) }}
          position="relative"
        >
          {label}
          <Box
            as="span"
            display="inline-flex"
            alignItems="center"
            justifyContent="center"
            ml={1.5}
            w="18px"
            h="18px"
            borderRadius="50%"
            bg="#FFD230"
            color="#1A1A1A"
            fontSize="11px"
            fontWeight="700"
            lineHeight="1"
            visibility={badgeCount > 0 ? 'visible' : 'hidden'}
            className={badgeCount > 0 ? 'badge-pulse' : ''}
          >
            {badgeCount || 0}
          </Box>
          {/* 金色激活小圆点 */}
          {showDot && (
            <Box
              position="absolute"
              top="-2px"
              right="-2px"
              w="7px"
              h="7px"
              borderRadius="full"
              bg="#FFD230"
              border="1.5px solid rgba(16, 16, 20, 0.9)"
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        sx={{
          ...popoverContentSx,
          maxH: 'min(580px, calc(100vh - 200px))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        minW={minW}
        maxW={maxW}
      >
        <PopoverBody
          p={4}
          flex="1"
          overflowY="auto"
          overflowX="hidden"
          sx={{
            '&::-webkit-scrollbar': { width: '5px' },
            '&::-webkit-scrollbar-track': { bg: 'transparent' },
            '&::-webkit-scrollbar-thumb': {
              bg: 'whiteAlpha.300',
              borderRadius: 'full',
            },
            '&::-webkit-scrollbar-thumb:hover': {
              bg: 'whiteAlpha.500',
            },
          }}
        >
          {children}
        </PopoverBody>
        {/* 底部全宽重置按钮 — 固定在弹窗底部，不随内容滚动 */}
        {onReset && (
          <Box px={4} pb={3} pt={2} borderTop="1px solid" borderColor="whiteAlpha.100" flexShrink={0}>
            <Button
              variant="ghost"
              size="sm"
              w="100%"
              h="32px"
              fontSize="12px"
              fontWeight="500"
              color="whiteAlpha.600"
              bg="whiteAlpha.50"
              borderRadius="6px"
              border="1px solid rgba(255,255,255,0.08)"
              _hover={{ bg: 'whiteAlpha.100', color: 'white' }}
              onClick={handleReset}
              transition="all 0.2s ease"
              transform={resetAnimating ? 'scale(0.95)' : 'scale(1)'}
              opacity={resetAnimating ? 0.6 : 1}
            >
              {resetLabel}
            </Button>
          </Box>
        )}
      </PopoverContent>
    </Popover>
  );
});

export default FilterPopoverButton;
