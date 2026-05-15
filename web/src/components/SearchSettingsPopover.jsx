/**
 * SearchSettingsPopover — 搜索设置面板（C 组任务 3 / 6 / 7 共用）
 *
 * 设计目标
 *  - 紧邻搜索框右侧的"搜索设置"齿轮 Popover；与 FabToolbar 的"视图设置"互斥
 *  - 内容分组（自上而下）：搜索方法 → 每页结果数 → 去重 → Tag 权重滑块 → 高级混合搜索配置（折叠）
 *  - 触发方式：监听 CustomEvent('open-search-settings')；并提供 onClose 通知关闭
 *
 * 当前阶段（4.2 骨架版）
 *  - 仅渲染框架与占位区；任务 5/6 会填充 TagWeightSlider + 搜索类项 + Accordion(HybridSearchConfig)
 *  - state 由父组件（HybridDeepSearchUI）通过 props 传入；Popover 自身只负责呈现
 *
 * 视觉令牌
 *  - 复用 popoverContentSx（暗灰玻璃感 + 12px 圆角，与 FilterPopoverButton/FabToolbar 一致）
 *  - 品牌金色 #FFD230 作为 hover/激活点缀
 *  - 间距遵循 4/8/12/16 网格（fabSpacing 风格）
 *
 * 合入安全
 *  - 全新文件（components/SearchSettingsPopover.jsx），无需 LM CUSTOMIZATION 标记
 *  - 不修改 HybridSearchConfig.jsx / TopSearchBar.jsx
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Popover,
  PopoverContent,
  PopoverBody,
  PopoverArrow,
  PopoverCloseButton,
  Portal,
  Text,
  VStack,
  HStack,
  Button,
  useDisclosure,
  useBreakpointValue,
} from '@chakra-ui/react';
import { useTranslation } from '../i18n/LanguageContext';
import { popoverContentSx } from './filters/FilterPopoverButton';

// ---------------------------------------------------------------------------
// 事件常量（顶栏触发器 / 视图设置互斥关闭都用同一组事件名）
// ---------------------------------------------------------------------------
export const SEARCH_SETTINGS_OPEN_EVENT = 'open-search-settings';
export const SEARCH_SETTINGS_CLOSE_EVENT = 'close-search-settings';

/**
 * 用一个隐藏锚点（左上角 0×0 box，pointer-events:none）作为 Popover 的虚拟触发位置，
 * 避免触发器（在 index.js 顶栏）与本组件（在 HybridDeepSearchUI 子树）跨组件树通信时
 * 还要为 Popover 的 anchor 走 portal/ref 传递。
 *
 * 由于 placement 设为 'bottom-end' 配合视图根的 anchor 位置不直观，这里改用 isOpen 受控
 * + 自定义 anchorRef 锁定到屏幕右上区域（顶栏齿轮按钮的视觉位置）。
 *
 * v2 简化：直接渲染居中悬浮卡片（fixed 定位）而非用 Chakra Popover 的相对锚点；
 * 但保留 useDisclosure 的可用性以便未来切换到 anchor 模式。
 */
function SearchSettingsPopover({
  // 透传给 TagWeightSlider / 搜索类项的 state（任务 5/6 才用到，骨架阶段先收下不报错）
  hybridConfig,
  onHybridConfigChange,
  searchParams,
  setSearchParams,
  onTriggerSearch,
  // 默认值引用（任务 7 重置按钮用）
  defaultHybridConfig,
  defaultSearchParams,
  // 锚点（来自顶栏触发器的 ref，可选；若不给则用屏幕右上 fixed 定位）
  anchorRef,
}) {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const firstFocusRef = useRef(null);

  // 响应式宽度：宽屏 420px，窄屏 90vw（不超出视口）
  const popoverW = useBreakpointValue({ base: '90vw', md: '420px' });

  // -------------------------------------------------------------------------
  // 监听全局 open / close 事件（顶栏触发器 + 视图设置互斥）
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handleOpen = () => {
      // 互斥：通知视图设置 Popover 关闭（FabToolbar 内的 Popover 监听该事件）
      window.dispatchEvent(new CustomEvent('close-view-settings'));
      onOpen();
    };
    const handleClose = () => onClose();

    window.addEventListener(SEARCH_SETTINGS_OPEN_EVENT, handleOpen);
    window.addEventListener(SEARCH_SETTINGS_CLOSE_EVENT, handleClose);
    return () => {
      window.removeEventListener(SEARCH_SETTINGS_OPEN_EVENT, handleOpen);
      window.removeEventListener(SEARCH_SETTINGS_CLOSE_EVENT, handleClose);
    };
  }, [onOpen, onClose]);

  // -------------------------------------------------------------------------
  // 焦点管理：打开后聚焦到第一个可交互项（任务 9.5）
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (isOpen) {
      // 等 Popover 渲染完
      const timer = setTimeout(() => firstFocusRef.current?.focus?.(), 80);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // -------------------------------------------------------------------------
  // 重置：任务 7 完整实装；骨架阶段提供基础逻辑
  // -------------------------------------------------------------------------
  const handleReset = () => {
    if (onHybridConfigChange && defaultHybridConfig) {
      onHybridConfigChange(defaultHybridConfig);
    }
    if (setSearchParams && defaultSearchParams) {
      setSearchParams({ ...defaultSearchParams });
    }
    // 任务 7 会接 useToast 提示"已重置"
    setTimeout(() => onTriggerSearch?.(), 50);
  };

  if (!isOpen) return null;

  return (
    <Portal>
      <Popover
        isOpen={isOpen}
        onClose={onClose}
        placement="bottom-end"
        closeOnBlur
        closeOnEsc
        returnFocusOnClose
      >
        {/* anchor 由外部触发器提供；这里渲染一个不可见占位 anchor 处理 Chakra 校验 */}
        <Box position="fixed" top="60px" right="180px" w="1px" h="1px" pointerEvents="none" aria-hidden />
        <PopoverContent
          sx={popoverContentSx}
          w={popoverW}
          maxW="90vw"
          position="fixed"
          top="68px"
          right="20px"
          // 顶栏触发器右下方落点；与 HeaderIcons 保持一致的视觉对齐
        >
          <PopoverArrow bg="#232428" />
          <PopoverCloseButton
            color="rgba(255,255,255,0.7)"
            _hover={{ color: '#FFD230', bg: 'rgba(255,210,48,0.08)' }}
            _focusVisible={{ boxShadow: '0 0 0 2px #FFD230' }}
          />
          <PopoverBody p={4}>
            <VStack spacing={4} align="stretch">
              {/* 标题 */}
              <HStack justify="space-between" align="center">
                <Text
                  fontSize="14px"
                  fontWeight="600"
                  color="#ffffff"
                  letterSpacing="0.2px"
                >
                  {t('searchSettings') || 'Search Settings'}
                </Text>
              </HStack>

              {/* 占位区（任务 5/6 填充：搜索方法 / 每页结果数 / 去重 / TagWeightSlider / Accordion HybridSearchConfig） */}
              <Box
                ref={firstFocusRef}
                tabIndex={-1}
                p={4}
                borderRadius="8px"
                bg="rgba(255,255,255,0.03)"
                border="1px dashed rgba(255,255,255,0.1)"
                _focus={{ outline: 'none', borderColor: 'rgba(255,210,48,0.4)' }}
              >
                <Text fontSize="12px" color="rgba(255,255,255,0.5)" lineHeight="1.6">
                  {t('searchSettingsPlaceholder')
                    || 'Tag weight slider, search method, results per page, advanced hybrid config — coming soon.'}
                </Text>
              </Box>

              {/* 底部：重置按钮（骨架占位；任务 7 完善） */}
              <HStack justify="flex-end" pt={2} borderTop="1px solid rgba(255,255,255,0.06)">
                <Button
                  size="xs"
                  variant="ghost"
                  color="rgba(255,255,255,0.7)"
                  fontSize="11px"
                  onClick={handleReset}
                  _hover={{ color: '#FFD230', bg: 'rgba(255,210,48,0.08)' }}
                  _focusVisible={{ boxShadow: '0 0 0 2px #FFD230' }}
                >
                  {t('resetToDefault') || 'Reset to default'}
                </Button>
              </HStack>
            </VStack>
          </PopoverBody>
        </PopoverContent>
      </Popover>
    </Portal>
  );
}

export default React.memo(SearchSettingsPopover);
