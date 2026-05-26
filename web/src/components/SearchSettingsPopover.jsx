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

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
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
// 4.8 UX：Popover 在 isOpen 变化时派发本事件，让顶栏齿轮按钮订阅以呈现"激活态"
// （金色背景 + aria-expanded），完成 UX Checklist #6"状态可见性"
export const SEARCH_SETTINGS_STATE_EVENT = 'search-settings-state-changed';

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
  const { isOpen, onOpen, onClose, onToggle } = useDisclosure();
  const firstFocusRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();
  // 4.7+ 根因修复：PopoverContent 的 ref，用于自实现 outside-click 判定。
  // 背景：齿轮按钮在 index.js 顶栏树，Popover 在 HybridDeepSearchUI 子树，
  // 没有 <PopoverTrigger> 包裹关系，导致 Chakra 默认 closeOnBlur
  // 会把"点齿轮"误判为"点到了 Popover 外面" → 先调 onClose 把 Popover 关了，
  // 接着齿轮的 onClick 又派事件 → onToggle 又把它打开。净效果："关不掉"。
  const popoverContentRef = useRef(null);

  // P2-C UX：Reset 防呆 —— 在 toast 上提供 5s 内的 Undo 入口。
  // resetSnapshotRef 保存重置前的 hybridConfig + searchParams 快照；
  // resetToastIdRef 保证同一时刻只存在一个 reset toast，避免连点 Reset 时多个 toast 堆叠。
  const resetSnapshotRef = useRef(null);
  const resetToastIdRef = useRef(null);

  // 4.7 UX 修复：记录触发按钮（顶栏齿轮）的 DOMRect，让 Popover 以它为锚点弹出
  // 之前的 v2 写死 right=20px，导致弹窗贴在屏幕最右与齿轮脱联。现在改为：
  //   - 打开事件携带 anchorRect (e.detail.rect)
  //   - top  = anchorRect.bottom + 8 (8px gap，与 Tooltip、其他 Popover 语言一致)
  //   - right = window.innerWidth - anchorRect.right (让右边与齿轮右边对齐)
  // 避免在初始渲染付不出位置时抽动：初值 null + 仅在有 rect 后计算 style。
  const [anchorRect, setAnchorRect] = useState(null);

  // 获取齿轮按钮的最新 rect（用于 resize 后重算 fixed 定位）。
  // 4.7+ 优化：使用 data-search-settings-trigger 显式标识代替 aria-label 模糊匹配，
  // 避免未来出现同名 aria-label 按钮时冲突。
  const refreshAnchorRect = useCallback(() => {
    const btn = document.querySelector('[data-search-settings-trigger="true"]');
    if (btn) {
      const r = btn.getBoundingClientRect();
      setAnchorRect({
        top: r.top,
        left: r.left,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      });
    }
  }, []);

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
  // 4.7+ Toggle 修复：之前 open-search-settings 事件只调 onOpen，导致齿轮按钮二次点击
  //   看似"无反应"（实际是 isOpen 已是 true，又发一次 open 并不关闭）。
  //   现在改为 toggle 语义：已开二次点则关；未开则开。
  //   互斥事件 close-search-settings 仍仅关闭（不变）。
  // 用 ref 存最新 isOpen，避免依赖 isOpen 触发频繁重订阅，且规避 stale closure。
  const isOpenRef = useRef(isOpen);
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  // 4.8 UX：把 isOpen 状态广播给顶栏齿轮按钮（让其呈现激活态 + aria-expanded）
  // 使用独立 useEffect 而非塞进上面 isOpenRef 同步里，保持职责单一便于排查。
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(SEARCH_SETTINGS_STATE_EVENT, { detail: { isOpen } }),
    );
  }, [isOpen]);

  useEffect(() => {
    const handleOpen = (e) => {
      // 4.7：取事件携带的 rect；后退方案主动查一下按钮 DOM。
      const rect = e?.detail?.rect;
      if (rect) {
        setAnchorRect(rect);
      } else {
        refreshAnchorRect();
      }
      // 互斥：仅在 "即将打开" 时才通知视图设置关闭（避免点关也误伤视图设置）。
      if (!isOpenRef.current) {
        window.dispatchEvent(new CustomEvent('close-view-settings'));
      }
      onToggle();
    };
    const handleClose = () => onClose();

    window.addEventListener(SEARCH_SETTINGS_OPEN_EVENT, handleOpen);
    window.addEventListener(SEARCH_SETTINGS_CLOSE_EVENT, handleClose);
    return () => {
      window.removeEventListener(SEARCH_SETTINGS_OPEN_EVENT, handleOpen);
      window.removeEventListener(SEARCH_SETTINGS_CLOSE_EVENT, handleClose);
    };
  }, [onToggle, onClose, refreshAnchorRect]);

  // 4.7：打开期间监听 window resize / scroll，重算 anchor 位置
  // （顶栏 sticky，resize 会改变右侧距离；scroll 一般不影响但保险起见）。
  useEffect(() => {
    if (!isOpen) return;
    const handler = () => refreshAnchorRect();
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, { passive: true });
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler);
    };
  }, [isOpen, refreshAnchorRect]);

  // 4.7+ 自实现 outside-click 关闭：取代 closeOnBlur。
  // 规则：点在 PopoverContent 内 → 不关；点在齿轮按钮内 → 不关（交由 onToggle 处理）；
  // 其它地方 → 关闭。用 mousedown capture，比 click 更早抓到事件，避开 Chakra 内部 click 顺序。
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e) => {
      const target = e.target;
      if (popoverContentRef.current && popoverContentRef.current.contains(target)) {
        return;
      }
      // closest 覆盖 "点到齿轮内的 SVG path" 场景（target 可能是 path/svg，不是按钮本身）
      if (target.closest && target.closest('[data-search-settings-trigger="true"]')) {
        return;
      }
      onClose();
    };
    document.addEventListener('mousedown', handleMouseDown, true);
    return () => document.removeEventListener('mousedown', handleMouseDown, true);
  }, [isOpen, onClose]);

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
  // 重置：拉回完整默认（hybridConfig + searchParams）+ 带 Undo 的 toast
  // -------------------------------------------------------------------------
  // P2-C：UX Checklist #10「危险操作必须二次确认或提供 Undo」——
  //   选用 Undo 路线（更轻量）：点 Reset 立即生效，但同时弹出带「撤销」按钮的 toast，
  //   5s 内点 Undo 可恢复重置前的所有 settings；超时则永久生效。
  //   实现细节：
  //     1) handleReset 先把当前 hybridConfig + searchParams 完整快照存到 ref（避免闭包陈旧）
  //     2) 用 toast 的 render 自定义渲染（Chakra 默认 toast 不支持行内按钮）
  //     3) Undo 按钮回调走 handleResetUndo —— 写回快照 + 关闭 toast + 触发新搜索 + 提示
  //     4) 同一时刻只保留一个 reset toast（resetToastIdRef）
  const handleResetUndo = useCallback(() => {
    const snap = resetSnapshotRef.current;
    if (!snap) return;
    if (onHybridConfigChange && snap.hybridConfig) {
      onHybridConfigChange(snap.hybridConfig);
    }
    if (setSearchParams && snap.searchParams) {
      setSearchParams({ ...snap.searchParams });
    }
    if (resetToastIdRef.current) {
      toast.close(resetToastIdRef.current);
      resetToastIdRef.current = null;
    }
    resetSnapshotRef.current = null;
    // 轻量提示「已撤销」（短时常驻 1.6s，避免和原 toast 闪烁打架）
    toast({
      title: tt('settingsResetUndoneTitle', 'Reset undone'),
      description: tt('settingsResetUndoneDesc', 'Previous search settings restored'),
      status: 'success',
      duration: 1600,
      isClosable: true,
      position: 'top',
    });
    setTimeout(() => onTriggerSearch?.(), 50);
  }, [onHybridConfigChange, setSearchParams, onTriggerSearch, toast, tt]);

  const handleReset = () => {
    // 1) 拍快照（深拷贝避免后续 setState 改到同一引用）
    resetSnapshotRef.current = {
      hybridConfig: hybridConfig ? JSON.parse(JSON.stringify(hybridConfig)) : null,
      searchParams: searchParams ? { ...searchParams } : null,
    };
    // 2) 立即应用默认值
    if (onHybridConfigChange && defaultHybridConfig) {
      onHybridConfigChange(defaultHybridConfig);
    }
    if (setSearchParams && defaultSearchParams) {
      setSearchParams({ ...defaultSearchParams });
    }
    // 3) 关掉旧的 reset toast（如果有）
    if (resetToastIdRef.current) {
      toast.close(resetToastIdRef.current);
      resetToastIdRef.current = null;
    }
    // 4) 弹出带 Undo 按钮的 toast（自定义 render）
    resetToastIdRef.current = toast({
      duration: 5000,
      position: 'top',
      isClosable: true,
      render: ({ onClose: closeToast }) => (
        <Box
          // 视觉：与 popoverContentSx 同语言（暗灰玻璃感 + 12px 圆角 + 金色边框点缀）
          bg="rgba(35,36,40,0.96)"
          color="#fff"
          px={4}
          py={3}
          borderRadius="12px"
          border="1px solid rgba(255,255,255,0.08)"
          boxShadow="0 8px 32px rgba(0,0,0,0.45)"
          sx={{ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
          minW="320px"
          maxW="420px"
        >
          <HStack spacing={3} align="flex-start">
            <Box flex="1" minW={0}>
              <Text fontSize="sm" fontWeight="600" color="#fff" mb="2px">
                {tt('settingsResetTitle', 'Settings reset')}
              </Text>
              <Text fontSize="xs" color="rgba(255,255,255,0.7)" lineHeight="1.4">
                {tt('settingsResetDesc', 'All search settings restored to default')}
              </Text>
              <Text fontSize="11px" color="rgba(255,255,255,0.5)" mt="4px">
                {tt('settingsResetUndoHint', 'Click Undo within 5s to revert')}
              </Text>
            </Box>
            <HStack spacing={1} flexShrink={0}>
              <Button
                size="xs"
                variant="ghost"
                color="#FFD230"
                fontWeight="600"
                fontSize="12px"
                _hover={{ bg: 'rgba(255,210,48,0.12)', color: '#FFD230' }}
                _focusVisible={{ boxShadow: '0 0 0 2px #FFD230' }}
                onClick={() => {
                  handleResetUndo();
                  closeToast();
                }}
              >
                {tt('undo', 'Undo')}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                color="rgba(255,255,255,0.6)"
                fontSize="14px"
                lineHeight="1"
                px={2}
                _hover={{ color: '#fff', bg: 'rgba(255,255,255,0.08)' }}
                _focusVisible={{ boxShadow: '0 0 0 2px #FFD230' }}
                aria-label="Close"
                onClick={closeToast}
              >
                ×
              </Button>
            </HStack>
          </HStack>
        </Box>
      ),
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

  // 4.7+ 动画：复用 FilterPopoverButton 黄金模板（120ms 进 / 100ms 出）
  //   - 受 prefers-reduced-motion 偏好降级为零动画
  //   - 避免 "if (!isOpen) return null" 条件渲染，否则会砍掉 framer-motion 退场帧
  //   - 进：opacity 0→1 + scale 0.96→1 + translateY -4→0
  //   - 出：opacity 1→0 + scale 1→0.96 + translateY 0→-4
  const motionProps = useMemo(() => {
    if (prefersReducedMotion) {
      return {
        variants: {
          enter: { opacity: 1, scale: 1, y: 0, transition: { duration: 0 } },
          exit: { opacity: 0, scale: 1, y: 0, transition: { duration: 0 } },
        },
      };
    }
    return {
      variants: {
        enter: {
          opacity: 1,
          scale: 1,
          y: 0,
          transition: { duration: 0.12, ease: [0.16, 1, 0.3, 1] },
        },
        exit: {
          opacity: 0,
          scale: 0.96,
          y: -4,
          transition: { duration: 0.1, ease: [0.4, 0, 1, 1] },
        },
      },
    };
  }, [prefersReducedMotion]);

  // 4.7+ 去掉 "if (!isOpen) return null" ，交由 Chakra Popover 的 isOpen 控制出/入场动画。
  // 计算定位仅在有 anchorRect 时生效：
  //  - top   = anchorRect.bottom + 8（齿轮按钮下方 8px）
  //  - right = innerWidth - anchorRect.right（右边与齿轮右边对齐）
  //  - rect 缺失时退回默认 top:68 / right:20，保证不崩
  const computedTop = anchorRect ? Math.max(8, Math.round(anchorRect.bottom + 8)) : 68;
  const computedRight = anchorRect
    ? Math.max(8, Math.round(window.innerWidth - anchorRect.right))
    : 20;

  return (
    <Portal>
      <Popover
        isOpen={isOpen}
        onClose={onClose}
        placement="bottom-end"
        // 4.7+ 根因修复：关掉 closeOnBlur，避免"点齿轮被误判为点外部" → onClose 与后续 onToggle 冲突导致"关不掉"。
        // 改为在外部 useEffect 里自实现 outside-click（显式排除齿轮按钮）。
        closeOnBlur={false}
        closeOnEsc
        returnFocusOnClose
      >
        {/* anchor 由外部触发器提供；这里渲染一个不可见占位 anchor 处理 Chakra 校验 */}
        <Box position="fixed" top="60px" right="180px" w="1px" h="1px" pointerEvents="none" aria-hidden />
        <PopoverContent
          ref={popoverContentRef}
          motionProps={motionProps}
          sx={popoverContentSx}
          w={popoverW}
          maxW="90vw"
          // 限高 + 内部滚动：避免高级混合搜索配置展开后撑爆视口
          // 顶栏 72px + 上下边距 24px = 预留 96px，剩下都给 Popover
          maxH="calc(100vh - 96px)"
          display="flex"
          flexDirection="column"
          position="fixed"
          // 4.7：按齿轮按钮的真实位置定位，实现与触发器的视觉联动
          top={`${computedTop}px`}
          right={`${computedRight}px`}
          // 顶栏触发器右下方落点；与 HeaderIcons 保持一致的视觉对齐
        >
          <PopoverArrow bg="#232428" />
          <PopoverCloseButton
            color="rgba(255,255,255,0.7)"
            _hover={{ color: '#FFD230', bg: 'rgba(255,210,48,0.08)' }}
            _focusVisible={{ boxShadow: '0 0 0 2px #FFD230' }}
            zIndex={2}
          />
          <PopoverBody
            p={4}
            // 关键：让 Body 自己滚，而不是让 Content 撑高
            overflowY="auto"
            overflowX="hidden"
            flex="1 1 auto"
            minH={0}
            // 自定义滚动条：与品牌金色调一致，hover 加深
            sx={{
              '&::-webkit-scrollbar': { width: '8px' },
              '&::-webkit-scrollbar-track': { background: 'transparent' },
              '&::-webkit-scrollbar-thumb': {
                background: 'rgba(255,255,255,0.15)',
                borderRadius: '4px',
              },
              '&::-webkit-scrollbar-thumb:hover': {
                background: 'rgba(255,210,48,0.45)',
              },
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(255,255,255,0.15) transparent',
            }}
          >
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
                  <AccordionPanel
                    px={0}
                    pt={3}
                    pb={1}
                    // 内部再限一层高度 + 滚动，避免单个区块撑爆 Popover 节奏；
                    // 同时给视觉上一个"独立配置区"边界感
                    maxH="420px"
                    overflowY="auto"
                    overflowX="hidden"
                    sx={{
                      '&::-webkit-scrollbar': { width: '6px' },
                      '&::-webkit-scrollbar-track': { background: 'transparent' },
                      '&::-webkit-scrollbar-thumb': {
                        background: 'rgba(255,255,255,0.12)',
                        borderRadius: '3px',
                      },
                      '&::-webkit-scrollbar-thumb:hover': {
                        background: 'rgba(255,210,48,0.4)',
                      },
                    }}
                  >
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
