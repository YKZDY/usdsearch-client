import React, { memo, useCallback, useId, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  Portal,
  useDisclosure,
} from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';
import { useReducedMotion } from 'framer-motion';
import { useFilterGroup } from './FilterGroupContext';

/** Popover 面板样式（实色暗灰玻璃感，与 theme 默认一致） */
export const popoverContentSx = {
  bg: '#232428',
  border: '1px solid #383838',
  borderRadius: '12px',
  zIndex: 1350,
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  _focus: { boxShadow: 'none' },
  // ⚠️ 关键修复：framer-motion 在 PopoverContent 上加 transform 创建了独立 GPU 合成层，
  // children 内部如果有自己的合成层（Button/transform/will-change），父级 opacity:0 不能级联到 child 合成层，
  // 导致 visibility:hidden 期间 children 仍可见，叠在卡片上方"裸露"。
  // 解法：
  //   1. isolation: isolate —— 强制 PopoverContent 自身成为 stacking context root，子合成层不再"穿透"
  //   2. contain: layout paint —— 把 children 的绘制限制在 PopoverContent 边界内
  //   3. 关闭时（visibility:hidden）visibility 通过 inline style 加给 PopoverContent，整个子树静默
  isolation: 'isolate',
  contain: 'layout paint',
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
 * - 金色激活小圆点 badge
 * - 底部全宽重置按钮
 * - 自定义 enter/exit 动画（120/100ms，支持 prefers-reduced-motion）
 * - 打开后自动把焦点送进面板（配合 Esc 关闭）
 * 
 * Props:
 * - label: 按钮文字
 * - isActive: 是否有激活的筛选条件（显示金色圆点）
 * - badge: 旧版 badge 文字（兼容）
 * - badgeCount: 激活筛选项数量（>0 显示金色圆形数字）
 * - onClose: Popover 关闭时回调（触发 commit）
 * - onReset: 重置按钮回调
 * - resetLabel: 重置按钮文字
 * - closeOnReset: 重置后是否自动关闭面板（默认 true）
 * - initialFocusRef: 面板打开时第一个聚焦的元素 ref（可选，不传则默认 PopoverBody）
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
  closeOnReset = true,
  initialFocusRef,
  groupId,
  children,
  minW = '280px',
  maxW = '400px',
}) {
  // ===== 互斥组支持 =====
  // 有 Provider 时：所有成员共享 activeId，同一时刻只开一个
  // 无 Provider 时：退化为本地 useDisclosure（独立开关）
  const group = useFilterGroup();
  const autoGroupId = useId();
  const myId = groupId || autoGroupId;

  const { isOpen: localIsOpen, onOpen: localOnOpen, onClose: localOnClose } = useDisclosure();

  const isOpen = group ? group.activeId === myId : localIsOpen;
  const onOpen = useCallback(() => {
    if (group) {
      group.openPopover(myId);
    } else {
      localOnOpen();
    }
  }, [group, myId, localOnOpen]);
  const onPopoverClose = useCallback(() => {
    if (group) {
      group.closePopover(myId);
    } else {
      localOnClose();
    }
  }, [group, myId, localOnClose]);

  const [resetAnimating, setResetAnimating] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  // ⚠️ 关键：标记"刚刚通过重置按钮触发关闭"，让 handleClose 跳过 commit。
  // 否则 Popover onClose 会调子 Filter 的 commitIfDirty，
  // 由于 React setState 异步、reset 还没同步到 localValues，
  // commitIfDirty 拿到 stale localValues 把用户旧值再写回 searchParams，
  // 表现为"点击重置弹窗关了但条件没真清空"。
  const skipNextCloseCommitRef = useRef(false);
  // 兜底焦点目标：PopoverBody。当调用方没传 initialFocusRef 时用它，
  // 让 Chakra 在打开时把焦点送到面板内（否则焦点停在 trigger 上，Esc 无法关闭）。
  const fallbackFocusRef = useRef(null);
  const effectiveFocusRef = initialFocusRef || fallbackFocusRef;

  const handleClose = useCallback(() => {
    onPopoverClose();
    if (skipNextCloseCommitRef.current) {
      // 重置触发的关闭：吃掉这一次 commit，并清旗
      skipNextCloseCommitRef.current = false;
      return;
    }
    onClose?.();
  }, [onClose, onPopoverClose]);

  const handleReset = useCallback(() => {
    setResetAnimating(true);
    onReset?.();
    setTimeout(() => setResetAnimating(false), 400);
    if (closeOnReset) {
      // 给重置缩放动画留 1 帧时间再关，避免按钮"瞬间消失"无反馈
      setTimeout(() => {
        // 标记本次关闭由"重置"触发，handleClose 不要再调 commitIfDirty
        skipNextCloseCommitRef.current = true;
        onPopoverClose();
      }, 80);
    }
  }, [onReset, closeOnReset, onPopoverClose]);

  const showDot = isActive || !!badge;

  // === 动画 variants（受 prefers-reduced-motion 偏好降级） ===
  // 默认：opacity + scale(0.96→1) + translateY(-4→0)，120ms 进 / 100ms 出
  // reduced-motion：仅 opacity 切换 + duration 0，零动画
  const motionProps = useMemo(() => {
    if (prefersReducedMotion) {
      return {
        variants: {
          enter: { opacity: 1, scale: 1, y: 0, transition: { duration: 0 } },
          exit:  { opacity: 0, scale: 1, y: 0, transition: { duration: 0 } },
        },
      };
    }
    return {
      variants: {
        enter: {
          opacity: 1,
          scale: 1,
          y: 0,
          transition: { duration: 0.12, ease: [0.16, 1, 0.3, 1] /* easeOutQuint-ish */ },
        },
        exit: {
          opacity: 0,
          scale: 0.96,
          y: -4,
          transition: { duration: 0.1, ease: [0.4, 0, 1, 1] /* easeInQuad */ },
        },
      },
    };
  }, [prefersReducedMotion]);

  return (
    <Popover
      placement="bottom-start"
      closeOnBlur
      isOpen={isOpen}
      onOpen={onOpen}
      onClose={handleClose}
      initialFocusRef={effectiveFocusRef}
      // 互斥切换时抑制 returnFocus，否则旧 popover 会把焦点抢回它自己的 trigger，新 popover"看起来没打开"
      returnFocusOnClose={!group || !group.getIsSwitching()}
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
              aria-hidden="true"
            />
          }
          aria-label={
            badgeCount > 0
              ? `${label}（已启用 ${badgeCount} 项）`
              : isActive
                ? `${label}（已启用）`
                : label
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
            // badge 的数字由 aria-label 已表达，避免 SR 把数字再读一遍
            aria-hidden="true"
          >
            {badgeCount || 0}
          </Box>
          {/* 金色激活小圆点 — 纯装饰，屏幕阅读器忽略 */}
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
              aria-hidden="true"
            />
          )}
        </Button>
      </PopoverTrigger>
      <Portal>
        {/*
         * 关键决策（架构评审 v2 后）：不再用 {isOpen && ...} 条件渲染，改用 Chakra 内置 motionProps。
         * - 条件渲染会"砍掉"Chakra 的 framer-motion 退出帧 → 关闭硬切，质感差。
         * - 外层包 AnimatePresence 会和 Chakra PopoverContent 内置的 motion 双层嵌套，导致 Popper.js
         *   placement/flip modifier 在 exit 帧期间错位。
         * - motionProps 是 Chakra 官方提供给 PopoverContent 的 framer-motion variants 透传通道，
         *   既保留 Popper 定位计算，又能自定义入/出场。
         */}
        <PopoverContent
          motionProps={motionProps}
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
            ref={fallbackFocusRef}
            tabIndex={-1}
            p={4}
            flex="1"
            overflowY="auto"
            overflowX="hidden"
            sx={{
              // 去掉 tabIndex=-1 带来的 :focus 虚线
              outline: 'none',
              '&:focus': { outline: 'none', boxShadow: 'none' },
              // 底部 12px 渐隐，提示"下方还有内容可滚"；
              // 当内容未超出（无滚动条）时浏览器会自动无效化，不影响短内容面板
              maskImage: 'linear-gradient(to bottom, black calc(100% - 14px), transparent)',
              WebkitMaskImage: 'linear-gradient(to bottom, black calc(100% - 14px), transparent)',
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
      </Portal>
    </Popover>
  );
});

export default FilterPopoverButton;
