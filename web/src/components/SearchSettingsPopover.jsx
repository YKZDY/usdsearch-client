/**
 * SearchSettingsPopover — 搜索设置面板（C 组任务 3 / 6 / 7 共用）
 *
 * 设计目标
 *  - 紧邻搜索框右侧的"搜索设置"齿轮 Popover；与 FabToolbar 的"视图设置"互斥
 *  - 内容分组（自上而下）：搜索方法 → 每页结果数 → 去重 → Tag 权重滑块 → 高级混合搜索配置（折叠）
 *  - 触发方式：监听 CustomEvent('open-search-settings')；并提供 onClose 通知关闭
 *
 * 实装状态（v1 完整版，4.5c 完成）
 *  - ✅ 5 块功能全接入：搜索方法 / 每页结果数 / 去重 / TagWeightSlider / HybridSearchConfig Accordion
 *  - ✅ 重置按钮使用 useToast 反馈
 *  - ✅ i18n 动态 fallback（tt() 包装）
 *  - ⏳ 4.5d：HybridDeepSearchUI 挂载本组件 + 透传 props
 *  - ⏳ 4.7：en.js / zh.js 补全 i18n key
 *
 * 状态责任
 *  - state 由父组件（HybridDeepSearchUI）通过 props 传入；Popover 自身只负责呈现 + 调用 callbacks
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

import React, { useEffect, useRef } from 'react';
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
  Divider,
  FormControl,
  FormLabel,
  Switch,
  RadioGroup,
  Radio,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  useDisclosure,
  useBreakpointValue,
  useToast,
} from '@chakra-ui/react';
import { useTranslation } from '../i18n/LanguageContext';
import { popoverContentSx } from './filters/FilterPopoverButton';
import TagWeightSlider from './TagWeightSlider';
import HybridSearchConfig from '../HybridSearchConfig';
import { mapSliderToHybridConfig } from '../utils/searchWeightMap';

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
  // 透传给 TagWeightSlider / 搜索类项的 state
  hybridConfig,
  onHybridConfigChange,
  searchParams,
  setSearchParams,
  onTriggerSearch,
  // 默认值引用（重置按钮用）
  defaultHybridConfig,
  defaultSearchParams,
  // 锚点（来自顶栏触发器的 ref，可选；若不给则用屏幕右上 fixed 定位）
  anchorRef,
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const firstFocusRef = useRef(null);

  // i18n fallback：t() 内部已 `|| key` 兜底，外层 `t(k) || fallback` 永远不生效
  const tt = React.useCallback(
    (key, fallback) => {
      const v = t(key);
      return v === key ? fallback : v;
    },
    [t],
  );

  // 响应式宽度：宽屏 440px，窄屏 90vw（不超出视口）
  const popoverW = useBreakpointValue({ base: '90vw', md: '440px' });

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
  // 重置：拉回完整默认（hybridConfig + searchParams）+ toast 提示
  // -------------------------------------------------------------------------
  const handleReset = () => {
    if (onHybridConfigChange && defaultHybridConfig) {
      onHybridConfigChange(defaultHybridConfig);
    }
    if (setSearchParams && defaultSearchParams) {
      setSearchParams({ ...defaultSearchParams });
    }
    toast({
      title: tt('settingsResetTitle', 'Settings reset'),
      description: tt('settingsResetDesc', 'All search settings restored to default'),
      status: 'info',
      duration: 2000,
      isClosable: true,
      position: 'top',
    });
    setTimeout(() => onTriggerSearch?.(), 50);
  };

  // -------------------------------------------------------------------------
  // TagWeightSlider commit 处理：把 0..100 映射成完整 hybridConfig 后写回
  // -------------------------------------------------------------------------
  const handleTagSliderCommit = React.useCallback(
    (sliderValue) => {
      if (!hybridConfig || !onHybridConfigChange) return;
      const nextConfig = mapSliderToHybridConfig(sliderValue, hybridConfig);
      onHybridConfigChange(nextConfig);
      // 拖完立即触发搜索（用户期望：调 tag 权重 → 立刻看到结果变化）
      setTimeout(() => onTriggerSearch?.(), 30);
    },
    [hybridConfig, onHybridConfigChange, onTriggerSearch],
  );

  // -------------------------------------------------------------------------
  // 每页结果数 / 搜索方法 / 去重 — 改动后即刻触发搜索（与 FabToolbar 原行为一致）
  // -------------------------------------------------------------------------
  const handleLimitChange = React.useCallback(
    (n) => {
      setSearchParams?.((prev) => ({ ...(prev || {}), limit: n }));
      setTimeout(() => onTriggerSearch?.(), 30);
    },
    [setSearchParams, onTriggerSearch],
  );

  const handleSearchMethodChange = React.useCallback(
    (value) => {
      setSearchParams?.((prev) => ({
        ...(prev || {}),
        embedding_knn_search_method: value,
      }));
      setTimeout(() => onTriggerSearch?.(), 30);
    },
    [setSearchParams, onTriggerSearch],
  );

  const handleDeduplicateChange = React.useCallback(
    (e) => {
      const checked = e.target.checked;
      setSearchParams?.((prev) => ({
        ...(prev || {}),
        deduplicate_by_hash: checked,
      }));
      setTimeout(() => onTriggerSearch?.(), 30);
    },
    [setSearchParams, onTriggerSearch],
  );

  // 控件取值（带兜底）
  const currentLimit = String(searchParams?.limit ?? '');
  const currentMethod = searchParams?.embedding_knn_search_method || 'approximate';
  const currentDedup = !!searchParams?.deduplicate_by_hash;

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
                  {tt('searchSettings', 'Search Settings')}
                </Text>
              </HStack>

              {/* ① 搜索方法（exact / approximate） */}
              <FormControl>
                <FormLabel fontSize="xs" color="rgba(255,255,255,0.85)" mb={2}>
                  {tt('searchMethod', 'Search method')}
                </FormLabel>
                <RadioGroup
                  size="sm"
                  value={currentMethod}
                  onChange={handleSearchMethodChange}
                >
                  <HStack spacing={4}>
                    <Radio ref={firstFocusRef} value="exact" size="sm" colorScheme="yellow">
                      <Text fontSize="xs" color="rgba(255,255,255,0.85)">
                        {tt('exact', 'Exact')}
                      </Text>
                    </Radio>
                    <Radio value="approximate" size="sm" colorScheme="yellow">
                      <Text fontSize="xs" color="rgba(255,255,255,0.85)">
                        {tt('approximate', 'Approx')}
                      </Text>
                    </Radio>
                  </HStack>
                </RadioGroup>
              </FormControl>

              {/* ② 每页结果数（25/50/100/250/500/1000 快捷按钮组） */}
              <FormControl>
                <FormLabel fontSize="xs" color="rgba(255,255,255,0.85)" mb={2}>
                  {tt('resultsPerPage', 'Results per page')}
                </FormLabel>
                <HStack spacing={1} flexWrap="wrap">
                  {[25, 50, 100, 250, 500, 1000].map((n) => {
                    const active = currentLimit === String(n);
                    return (
                      <Button
                        key={n}
                        size="xs"
                        variant={active ? 'solid' : 'ghost'}
                        colorScheme={active ? 'yellow' : 'gray'}
                        fontSize="11px"
                        minW="40px"
                        h="26px"
                        onClick={() => handleLimitChange(n)}
                        _focusVisible={{ boxShadow: '0 0 0 2px #FFD230' }}
                      >
                        {n}
                      </Button>
                    );
                  })}
                </HStack>
              </FormControl>

              {/* ③ 去重开关 */}
              <FormControl display="flex" alignItems="center" justifyContent="space-between">
                <FormLabel fontSize="xs" color="rgba(255,255,255,0.85)" mb={0}>
                  {tt('removeDuplicates', 'Remove duplicates')}
                </FormLabel>
                <Switch
                  size="sm"
                  colorScheme="yellow"
                  isChecked={currentDedup}
                  onChange={handleDeduplicateChange}
                />
              </FormControl>

              <Divider borderColor="rgba(255,255,255,0.1)" />

              {/* ④ Tag 匹配权重滑动条（C 组核心） */}
              <TagWeightSlider
                hybridConfig={hybridConfig}
                onCommit={handleTagSliderCommit}
              />

              <Divider borderColor="rgba(255,255,255,0.1)" />

              {/* ⑤ 高级混合搜索配置（Accordion 折叠，避免新手被复杂度淹没） */}
              <Accordion allowToggle reduceMotion>
                <AccordionItem border="none">
                  <AccordionButton
                    px={2}
                    py={2}
                    borderRadius="6px"
                    _hover={{ bg: 'rgba(255,255,255,0.05)' }}
                    _focusVisible={{ boxShadow: '0 0 0 2px #FFD230' }}
                  >
                    <Box flex={1} textAlign="left">
                      <Text fontSize="xs" fontWeight="600" color="rgba(255,255,255,0.7)">
                        {tt('advancedHybridConfig', 'Advanced hybrid config')}
                      </Text>
                    </Box>
                    <AccordionIcon color="rgba(255,255,255,0.6)" />
                  </AccordionButton>
                  <AccordionPanel px={0} pt={3} pb={1}>
                    {/* 复用既有 HybridSearchConfig；它内部已对 hybrid_text/image/tags/values 都有完整字段编辑 UI */}
                    <HybridSearchConfig
                      value={hybridConfig}
                      onChange={onHybridConfigChange}
                      isCollapsed={false}
                    />
                  </AccordionPanel>
                </AccordionItem>
              </Accordion>

              {/* 底部：重置按钮（全面重置 hybridConfig + searchParams + toast 提示） */}
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
                  {tt('resetToDefault', 'Reset to default')}
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
