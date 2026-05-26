/**
 * SPDX-FileCopyrightText: Copyright (c) 2024-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
 * SPDX-License-Identifier: MIT
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

import React, { useEffect, useState, useCallback, useMemo, useDeferredValue, useRef, startTransition } from "react";
import {
  Box,
  VStack,
  HStack,
  Input,
  InputGroup,
  InputRightElement,
  Button,
  Text,
  IconButton,
  useToast,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Switch,
  FormControl,
  FormLabel,
  Badge,
  Tooltip,
  Grid,
  GridItem,
  Textarea,
} from "@chakra-ui/react";
import {
  SearchIcon,
  CloseIcon,
  InfoIcon,
  ViewIcon,
  HamburgerIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  AddIcon,
  MinusIcon,
} from "@chakra-ui/icons";

import { apiUrl as defaultApiUrl, defaultEmbeddingConfig, AUTH_CONFIG, FEATURE_FLAGS, SERVER_MAPPING, SEARCH_DEFAULTS, DEFAULT_SEARCH_PARAMS, resolveNucleusHost, getDefaultServerKey } from "./config";
// === LM CUSTOMIZATION: i18n START ===
import { useTranslation } from "./i18n/LanguageContext";
// === LM CUSTOMIZATION: i18n END ===
import HybridSearchConfig, { DEFAULT_HYBRID_CONFIG, migrateLegacyWeights } from "./HybridSearchConfig";
import { triggerReindexNow as triggerReindexNowApi } from "./services/reindexService";
import SearchFilters from "./SearchFilters";
import HybridSearchResults from "./HybridSearchResults";
import VirtualizedHybridSearchResults from "./components/VirtualizedHybridSearchResults";
import AssetDetailsModal from "./AssetDetailsModal";
// === LM CUSTOMIZATION: SelectionInteraction START ===
// Group A 任务 5：右侧抽屉 + 方案 B 单击交互（FEATURE_FLAGS.SINGLE_CLICK_DRAWER 控制；
// 旗标关闭时回退 AssetDetailsModal 路径，原版 NVIDIA 行为完整保留）。
import AssetDetailsDrawer from "./components/AssetDetailsDrawer";
import { useDrawerOrSelect } from "./hooks/useDrawerOrSelect";
// === LM CUSTOMIZATION: SelectionInteraction END ===
// === LM CUSTOMIZATION: AdvancedPanel START ===
// 原因：Group B 需求 4 — 抽屉“高级面板”内容插槽填充。
// 合入英伟达新版时：保留本 import；AdvancedMatchInfo 是 LM 新建组件，与 NVIDIA 不交叉。
import AdvancedMatchInfo from "./components/AdvancedMatchInfo";
// === LM CUSTOMIZATION: AdvancedPanel END ===
// === LM CUSTOMIZATION: detail-modal-revamp START ===
// 原因：补齐 Drawer 高级面板（依赖图 / USD 属性 / 索引管理 / AI / VLM / 解释），
// 与 Modal 行为一致；DrawerAdvancedPanelContainer 是 LM 新建组件，与 NVIDIA 不交叉。
// 合入英伟达新版时：保留本 import。
import DrawerAdvancedPanelContainer from "./components/drawer-panels/DrawerAdvancedPanelContainer";
// === LM CUSTOMIZATION: detail-modal-revamp END ===
// === LM CUSTOMIZATION: AssetTagEditor START ===
// 原因：Group B 需求 5 — 抽屉内完整 tag 编辑器插槽填充。
// 合入英伟达新版时：保留本 import。
import AssetTagEditor from "./components/AssetTagEditor";
// === LM CUSTOMIZATION: AssetTagEditor END ===
import AssetImage from "./components/AssetImage";
// === LM CUSTOMIZATION: Fab Toolbar START ===
import FabToolbar from "./components/FabToolbar";
// === LM CUSTOMIZATION: Fab Toolbar END ===
// === LM CUSTOMIZATION: Search Settings Popover START ===
// 原因：C 组任务 3 — 顶栏齿轮按钮触发的搜索设置面板（搜索方法 / 每页结果数 / 去重 / Tag 权重 / 高级混合配置）
// 合入英伟达新版时：保留这一行 import 和下方对应 JSX 区块即可
import SearchSettingsPopover from "./components/SearchSettingsPopover";
// === LM CUSTOMIZATION: Search Settings Popover END ===
// === LM CUSTOMIZATION: Selection Mode Bar ===
import SelectionModeBar from "./components/SelectionModeBar";
// === LM CUSTOMIZATION: 全局空白点击退出多选（无涟漪反馈，依赖 Bar 自身淡出动画） ===
import useExitMultiSelectOnEmptyClick from "./hooks/useExitMultiSelectOnEmptyClick";
// === LM CUSTOMIZATION: SelectionDrawer === v3 抽屉关闭白名单守卫（修 TC-A4/A6）
import useDrawerCloseGuard from "./hooks/useDrawerCloseGuard";
// === V2: 批量打标签工作流 ===
import BatchTagModal from "./components/BatchTagModal";
import UndoToast from "./components/UndoToast";
import useBatchTagger from "./hooks/useBatchTagger";
import useKeyboardShortcuts from "./hooks/useKeyboardShortcuts";
// === LM CUSTOMIZATION: Auth Guard ===
import { useAuthGuard } from "./hooks/useAuthGuard";
// === LM CUSTOMIZATION: Path tree suggestions（混合静态目录 + 搜索结果聚合）===
import { usePathSuggestions } from "./hooks/usePathSuggestions";
// [TagFilterSearch] 全局可用标签（wss tagQuery）
import useGlobalTags from "./hooks/useGlobalTags";
// === LM CUSTOMIZATION: Nucleus 真实目录树（运行时 listing 反推 + 静态快照兜底）===
import { useNucleusTree } from "./hooks/useNucleusTree";
// === LM CUSTOMIZATION: Search/Tag decoupling — 搜索请求反腐层 ===
import buildSearchPayload from "./utils/buildSearchPayload";
import { isNoisePath } from "./utils/pathFilters";
import { getApiLimit } from "./utils/oversample";

// === LM CUSTOMIZATION: NoSelectPolyfill START ===
// [PERF v3 — 2026-05-22 trace 驱动] 原本调用 usePolyfillNoSelectPrefixes(isDraggingForPolyfill)。
// trace 表明该路径（VirtualizedHybridSearchResults isDragging 上抛 → setIsDraggingForPolyfill → HybridDeepSearchUI 重渲 → polyfill effect）
// 会造成首次进入拖拽时一个≈196ms 的巨帧。现在把 polyfill 所需的 cursor / Moz/ms 前缀写入合并进 useDragSelect
// 的 applyDragBodyStyles，该 hook 不再需要。保留文件以防需要回退；import 删除。
// 合入上游新版时：本区块独立与 NVIDIA 原代码不交叉。
// === LM CUSTOMIZATION: NoSelectPolyfill END ===


// === LM CUSTOMIZATION: Copy Deploy Fix START ===
// 复制 URL 全链路诊断开关。
// 默认关（生产 Console 干净）；远程排查时可在 DevTools 里：
//   sessionStorage.setItem('copyDebug', '1')   // 然后刷新页面即可开启
//   sessionStorage.removeItem('copyDebug')      // 关闭
// 仅当前标签页生效，关掉标签页自动失效，不会污染长期存储。
// 注意：失败/手动 Modal 兜底路径用 console.warn，无视开关，永远会打——
// 失败时永远有线索可看，成功时不刷屏。
const COPY_DEBUG = (() => {
  try {
    return typeof window !== 'undefined'
      && window.sessionStorage?.getItem('copyDebug') === '1';
  } catch (_) {
    return false; // 隐私模式 / 跨域 iframe 等访问 sessionStorage 抛错时静默关闭
  }
})();
const copyLog = (msg, data) => {
  if (!COPY_DEBUG) return;
  if (data !== undefined) console.log(`[CopyURL] ${msg}`, data);
  else console.log(`[CopyURL] ${msg}`);
};
// === LM CUSTOMIZATION: Copy Deploy Fix END ===

// Helper: shallow compare two Sets
const areSetsEqual = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return a === b;
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
};

// Memoized results component to prevent re-renders when modal opens/closes
const MemoizedResults = React.memo(({ 
  results, 
  showOnlyWithPreviews, 
  onItemClick, 
  copyToClipboard, 
  onFindSimilar,
  showScores, 
  viewMode, 
  gridSize, 
  isLoading, 
  lastSearchQuery, 
  getHeaders, 
  apiUrl,
  useVirtualization = true,
  selectedItems,
  onSelectionChange,
  onBatchSelection,
  onCopySelectedUrls,
  isMultiSelectMode,
  // V2 U1: 批量失败持久化（透传给结果区）
  failedBatchItems,
  onRetryFailed,
  // 空白处单击退出多选（由父级传入 clearSelection）
  onEmptyAreaClick,
  // === LM CUSTOMIZATION: Search/Tag decoupling v4 — 结果区大标题所需数据 ===
  titleBarProps,
  // === LM CUSTOMIZATION: InfinitePagination START ===
  // 原因：需求 D-1 双层无限滚动。本 props 透传给下游 VirtualizedHybridSearchResults。
  // 合入上游新版时：MemoizedResults 是本仓定制包装器，props 追加与 NVIDIA 不交叉。
  hasMore,
  isLoadingMore,
  loadMoreError,
  isResultShortage,
  onAutoLoadMore,
  onTriggerBackendLoadMore,
  onRetryLoadMore,
  onDragStateChange,
  // === LM CUSTOMIZATION: InfinitePagination END ===
  // === LM CUSTOMIZATION: CardTagBar START ===
  // 原因：Group B 需求 — CardTagBar 需要 nucleus host 调 wss tagging。
  // 透传 nucleusServerUrl（已经 resolveNucleusHost 解析过，是真实 host 如 'ov.qq.com'）到下游。
  // 合入英伟达新版时：本 prop 追加与 NVIDIA 原代码不交叉，保留。
  serverUrl,
  // === LM CUSTOMIZATION: CardTagBar END ===
}) => {
  const filteredResults = useMemo(() => 
    showOnlyWithPreviews 
      ? results.filter(item => item.thumbnail_exists === true) 
      : results,
    [results, showOnlyWithPreviews]
  );

  const ResultsComponent = useVirtualization && filteredResults.length > 50 
    ? VirtualizedHybridSearchResults 
    : HybridSearchResults;

  return (
    <ResultsComponent
      results={filteredResults}
      onItemClick={onItemClick}
      copyToClipboard={copyToClipboard}
      onFindSimilar={onFindSimilar}
      showScores={showScores}
      viewMode={viewMode}
      gridSize={gridSize}
      isLoading={isLoading}
      isEmpty={filteredResults.length === 0 && !isLoading}
      searchQuery={lastSearchQuery}
      getHeaders={getHeaders}
      apiUrl={apiUrl}
      selectedItems={selectedItems}
      onSelectionChange={onSelectionChange}
      onBatchSelection={onBatchSelection}
      onCopySelectedUrls={onCopySelectedUrls}
      isMultiSelectMode={isMultiSelectMode}
      failedBatchItems={failedBatchItems}
      onRetryFailed={onRetryFailed}
      onEmptyAreaClick={onEmptyAreaClick}
      titleBarProps={titleBarProps}
      hasMore={hasMore}
      isLoadingMore={isLoadingMore}
      loadMoreError={loadMoreError}
      isResultShortage={isResultShortage}
      onAutoLoadMore={onAutoLoadMore}
      onTriggerBackendLoadMore={onTriggerBackendLoadMore}
      onRetryLoadMore={onRetryLoadMore}
      onDragStateChange={onDragStateChange}
      /* === LM CUSTOMIZATION: CardTagBar START === */
      serverUrl={serverUrl}
      /* === LM CUSTOMIZATION: CardTagBar END === */
    />
  );
}, (prevProps, nextProps) => {
  // Custom comparison - handle Set properly
  if (!areSetsEqual(prevProps.selectedItems, nextProps.selectedItems)) return false;

  // titleBarProps 是对象，浅比它的字段（语义等价于"committedQuery/categoryTag/... 任一变就重渲染"）
  const ap = prevProps.titleBarProps || {};
  const bp = nextProps.titleBarProps || {};
  const tbKeys = ['committedQuery', 'categoryTag', 'categoryLabel', 'imageSearchActive', 'onRemoveCategory', 'onRemoveQuery'];
  for (const k of tbKeys) {
    if (ap[k] !== bp[k]) return false;
  }

  // Compare all other props shallowly
  const keys = Object.keys(nextProps).filter(k => k !== 'selectedItems' && k !== 'titleBarProps');
  for (const key of keys) {
    if (prevProps[key] !== nextProps[key]) return false;
  }
  return true;
});

const HybridDeepSearchUI = () => {
  const { t } = useTranslation();
  
  // State
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery); // Defer heavy re-renders while typing
  const [lastSearchQuery, setLastSearchQuery] = useState(""); // Store the query used for the current results
  // === LM CUSTOMIZATION: Search/Tag decoupling START ===
  // committedQuery: 用户按下搜索按钮/回车后"固化"的搜索词（用于大标题展示）。
  //                 v4 升级：不再清空 searchQuery，committedQuery 只是 searchQuery 的"已提交"快照。
  // selectedTags:  来自标签筛选面板的用户手动标签数组（纯手动来源，chip 栏展示）。
  // categoryTag:   来自左侧产品类型树的分类 tag（单选，string，大标题展示；不混入 selectedTags）。
  // categoryLabel: 分类的本地化显示名（如 "通用建筑" / "General Building"），由 CategorySidebar 通过 event 透传。
  // 这四者共同参与 buildSearchPayload 拼装成最终发给后端的 q。
  const [committedQuery, setCommittedQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [categoryTag, setCategoryTag] = useState("");
  const [categoryLabel, setCategoryLabel] = useState("");
  // === LM CUSTOMIZATION: Search/Tag decoupling END ===
  const apiUrl = defaultApiUrl;
  const [embeddingConfig, setEmbeddingConfig] = useState(() => {
    // Get initial embedding config from server mapping based on URL param or first server
    const urlParams = new URLSearchParams(window.location.search);
    const serverParam = urlParams.get('server');
    
    if (serverParam && SERVER_MAPPING[serverParam]?.embedding_config) {
      return SERVER_MAPPING[serverParam].embedding_config;
    }
    
    // Fall back to first server in mapping if available
    const servers = Object.keys(SERVER_MAPPING);
    if (servers.length > 0 && SERVER_MAPPING[servers[0]]?.embedding_config) {
      return SERVER_MAPPING[servers[0]].embedding_config;
    }
    
    return defaultEmbeddingConfig;
  });

  // State for selected storage backend
  const [selectedBackend, setSelectedBackend] = useState(() => {
    // Check URL for server parameter first
    const urlParams = new URLSearchParams(window.location.search);
    const serverParam = urlParams.get('server');
    
    // If server is in URL and exists in mapping, use it
    if (serverParam && Object.keys(SERVER_MAPPING).includes(serverParam)) {
      return serverParam;
    }
    
    // [v2 补强 3] 用 getDefaultServerKey() 替代 Object.keys()[0]，与 HeaderIcons / AuthForm 保持一致 (优先 nucleus → omniverse → keys[0])
    return getDefaultServerKey();
  });

  // [Tag Deploy Fix - 防线 1]
  // 派生「真实 Nucleus host」——把 ?server= 与 SERVER_MAPPING 解耦：
  // - selectedBackend 实质是 SERVER_MAPPING 的 key（譬如 "omniverse"），不能直接当 host
  // - 部署环境踩过坑：直接把它喂给 wss → wss://omniverse/... → 浏览器无法解析握手失败 → tag 增删全部静默失败
  // 优先级：URL ?server 原值（可能是 "omniverse://ov.qq.com"） > SERVER_MAPPING[selectedBackend] > selectedBackend 本身经 resolveNucleusHost 兜底
  const nucleusServerUrl = useMemo(() => {
    // 1) URL ?server= 原值最权威（用户主动声明）
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const serverParam = urlParams.get('server');
      if (serverParam) {
        const host = resolveNucleusHost(serverParam);
        if (host) return host;
      }
    } catch (_) { /* SSR/边缘环境忽略 */ }

    // 2) 用 selectedBackend 去 SERVER_MAPPING 查 URL（key → URL），再规范化
    if (selectedBackend && SERVER_MAPPING[selectedBackend]) {
      const host = resolveNucleusHost(SERVER_MAPPING[selectedBackend]);
      if (host) return host;
    }

    // 3) 兜底：直接对 selectedBackend 做 resolve（兜底 mapping 内 "omniverse" → 真实 host）
    return resolveNucleusHost(selectedBackend);
  }, [selectedBackend]);

  // Listen for server selection changes from the header
  // [v2 补强 5] server-changed 监听器优化：
  //   1) 用 prevServerRef 做防抖，server 没变就 return（避免 mount 阶段 / 重复派发触发冗余请求）
  //   2) fetchData 与 handleSearch 串成 IIFE 链：await fetch metadata → setPropertiesData → handleSearchRef.current?.()
  //      去掉玄学 setTimeout(100ms)，消除"用旧 propertiesData 跑搜索"的 race condition
  //   3) 切换 server 后**自动触发搜索**——以前只刷 propertiesData 不重搜，导致用户切完看到 0 资产必须手动 F5
  const prevServerRef = useRef(null);
  useEffect(() => {
    const handleServerChange = (event) => {
      const nextServer = event.detail?.server;
      if (!nextServer || nextServer === prevServerRef.current) return;  // 防抖
      prevServerRef.current = nextServer;

      // Set the selected backend
      setSelectedBackend(nextServer);
      setEmbeddingConfig(event.detail.embeddingConfig || defaultEmbeddingConfig);
      setResults([]);

      // Update auth state with server-specific credentials using shared helper
      if (isAuthCleared(nextServer)) {
        setAuth({ api_key: "", nucleus_api_token: "", username: "", password: "", isAuthenticated: false });
      } else {
        const creds = readAuthCredentials(nextServer);
        const username = creds.username !== null ? creds.username : AUTH_CONFIG.DEFAULT_USERNAME;
        const password = creds.password !== null ? creds.password : AUTH_CONFIG.DEFAULT_PASSWORD;
        setAuth({
          ...creds,
          username,
          password,
          isAuthenticated: !!(
            (AUTH_CONFIG.ENABLE_NUCLEUS_AUTH && creds.nucleus_api_token) ||
            (AUTH_CONFIG.ENABLE_API_KEY_AUTH && creds.api_key) ||
            (AUTH_CONFIG.ENABLE_BASIC_AUTH && (username !== "") && (password !== ""))
          ),
        });
      }

      // Reset and refetch properties data for the new server, then trigger search
      setPropertiesData(null);
      (async () => {
        try {
          const creds = readAuthCredentials(nextServer);
          const hasAuth = !!(creds.api_key || (creds.username && creds.password) || creds.nucleus_api_token);
          if (hasAuth) {
            const headers = getHeaders();
            const response = await fetch(`${apiUrl}/search/stats/usd_properties`, {
              method: 'GET',
              headers: headers
            });
            const data = await response.json();
            setPropertiesData(data);
          }
        } catch (error) {
          console.error("Error fetching property data after server change:", error);
        }
        // ✅ 等 metadata 落地后再触发搜索 —— 确定性强，无 race。
        // 用 setTimeout(0) 把搜索调度到下一 tick，绕开同一执行栈下 handleSearchRef 还未赋值的 TDZ 风险
        // （handleSearchRef const 在文件下方 ~L2289 才声明；但此 useEffect 注册在 mount 阶段，
        //   实际事件触发时 .current 一定已赋值，setTimeout 只是双保险）
        setTimeout(() => {
          if (typeof handleSearchRef !== 'undefined' && handleSearchRef?.current) {
            handleSearchRef.current();
          }
        }, 0);
      })();
    };
    window.addEventListener('server-changed', handleServerChange);
    return () => {
      window.removeEventListener('server-changed', handleServerChange);
    };
  }, []);
  const [imageBase64, setImageBase64] = useState("");
  const [imageName, setImageName] = useState(""); // 上传图片的文件名
  const [imageError, setImageError] = useState(""); // 图片校验错误信息
  const [similarSearchAsset, setSimilarSearchAsset] = useState(null);
  const [hybridConfig, setHybridConfig] = useState(DEFAULT_HYBRID_CONFIG);

  // Update hybridConfig when embeddingConfig changes
  useEffect(() => {
    if (embeddingConfig?.field_name) {
      setHybridConfig(prevConfig => {
        // Remove old vector fields and add the new one with the correct embedding config
        const newVectorFields = {
          [embeddingConfig.field_name]: {
            enabled: true,
            weight: 1.0,
            field_name: embeddingConfig.field_name,
            dimension: embeddingConfig.dimension || 1024,
          }
        };
        return {
          ...prevConfig,
          vector_fields: newVectorFields
        };
      });
    }
  }, [embeddingConfig]);
  const [configCollapsed, setConfigCollapsed] = useState(SEARCH_DEFAULTS.configCollapsed);
  const [results, setResults] = useState([]);
  // === LM CUSTOMIZATION: 路径目录树（真实 Nucleus 树 + 搜索结果聚合）===
  // 1) useNucleusTree 提供真实目录树骨架（来自 ov.qq.com 实拍快照 + 运行时 listing 刷新）
  // 2) usePathSuggestions 把搜索 hits 的命中数叠加到该树上，得到带 deepCount 的混合树
  //
  // ⚠️ 重要：这里使用的 hits 必须是「用户最终看到的卡片」对应的数组（visibleResults），
  // 而不是后端原始 results。否则路径树徽章数字会与顶部"共 N 个资产"对不上
  // （例如缩略图过滤 / tag AND 过滤砍掉一部分后端 hits 时）。
  // pathTree 的实际计算延后到 visibleResults 算出来之后（见下方 useMemo）。
  const { tree: liveTree, status: treeStatus, error: treeError, refresh: refreshTree } = useNucleusTree(selectedBackend);

  // [UX Polish R2] selectedTags 客户端二次过滤
  // 背景：后端不支持 filter_by_tags，若把 tag 拼进 q，"点最近标签 #grass"
  //   会变成文本搜 grass，命中一堆文件名含 grass 但未打过 tag 的资产。
  // 方案：搜索时不带 selectedTags（buildSearchPayload 已不再合并），
  //   拿回结果后按 source.tags 做 AND 过滤（每个选中的 tag 都必须真实存在）。
  // 注意：categoryTag 走 q（分类树语义），不在这里过滤。
  const tagFilteredResults = useMemo(() => {
    if (!Array.isArray(selectedTags) || selectedTags.length === 0) return results;
    const want = selectedTags
      .map(s => (typeof s === 'string' ? s.trim().toLowerCase() : ''))
      .filter(Boolean);
    if (want.length === 0) return results;
    return results.filter(item => {
      const tags = item?.source?.tags;
      if (!Array.isArray(tags) || tags.length === 0) return false;
      const names = tags
        .map(tg => {
          const s = typeof tg === 'string' ? tg : (tg?.name || tg?.tag || tg?.value || '');
          return typeof s === 'string' ? s.trim().toLowerCase() : '';
        })
        .filter(Boolean);
      return want.every(w => names.includes(w));
    });
  }, [results, selectedTags]);

  const [isLoading, setIsLoading] = useState(false);
  const [showScores, setShowScores] = useState(SEARCH_DEFAULTS.showScores);
  const [filtersCollapsed, setFiltersCollapsed] = useState(SEARCH_DEFAULTS.filtersCollapsed);
  const [configSidebarCollapsed, setConfigSidebarCollapsed] = useState(true);
  const [viewMode, setViewMode] = useState(SEARCH_DEFAULTS.viewMode);
  const [gridSize, setGridSize] = useState(SEARCH_DEFAULTS.gridSize);
  const [selectedItem, setSelectedItem] = useState(null);
  const [propertiesData, setPropertiesData] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [shouldAutoSearch, setShouldAutoSearch] = useState(false);
  const [showOnlyWithPreviews, setShowOnlyWithPreviews] = useState(SEARCH_DEFAULTS.showOnlyWithPreviews);
  // === LM CUSTOMIZATION: Sort state ===
  const [sortBy, setSortBy] = useState('relevance');

  // === LM CUSTOMIZATION: 统一可见结果数组 + 过采样截断 ===
  // visibleResults = 用户实际看到的卡片对应的 hits。所有计数 / 路径树徽章 / 卡片列表
  // 必须使用同一个 visibleResults，避免「共 0 个资产」但路径树徽章却显示 3 这种不一致。
  // 过滤链：results → tag AND 过滤 → showOnlyWithPreviews ? thumbnail 过滤 : 全收 → noise 过滤 → 过采样截断。
  //
  // [calvingu 2026-05] noise 过滤：剥掉 .thumbs / .system / __pycache__ 这类系统/缓存
  // 路径下的 hit。必须放在过滤链末尾，且与 usePathSuggestions / nucleusListingService
  // 共用同一份 isNoisePath 规则，保证：
  //   visibleResults.length === Σ pathTree[*].deepCount   （根级求和）
  //   visibleResults.length === 顶部 "X 个资产" 文案数字
  // userLimit: 使用 DEFAULT_SEARCH_PARAMS.limit 作为初始值，后续由 URL/用户切换更新
  const [userLimit, setUserLimit] = useState(DEFAULT_SEARCH_PARAMS.limit);

  const { visibleResults, isResultShortage } = useMemo(() => {
    const base = showOnlyWithPreviews
      ? tagFilteredResults.filter(item => item?.thumbnail_exists === true)
      : tagFilteredResults;
    const filtered = base.filter(item => {
      const raw = item?.source?.path || item?.source?.base_key || item?.source?.url || '';
      if (!raw) return true; // 没路径信息的不过滤（保守）
      return !isNoisePath(String(raw));
    });

    // 过采样截断：过滤后结果可能超过用户请求的 limit（因为过采样请求了更多）
    const truncated = filtered.length > userLimit ? filtered.slice(0, userLimit) : filtered;
    const shortage = truncated.length < userLimit && tagFilteredResults.length > 0;

    return {
      visibleResults: truncated,
      isResultShortage: shortage,
    };
  }, [tagFilteredResults, showOnlyWithPreviews, userLimit]);

  // === LM CUSTOMIZATION: InfinitePagination START ===
  // 原因：需求 D-1 双层无限滚动 + AbortController。
  // 架构说明见 .codebuddy/plan/group-d-quick-fixes/CODE-RECON.md §1.3：
  //   —— NVIDIA /search_hybrid 不支持 offset，本仓已有"过采样 + 客户端切片"机制（见上方 visibleResults）。
  //   —— 第 1 层：滚到底自动增 userLimit（客户端切片）→ 无网络请求
  //   —— 第 2 层：客户端切片不够（isResultShortage=true）时显示按钮设置更大 limit 重发
  // 合入上游新版时：本块独立在 visibleResults 后，不交叉 NVIDIA 原代码。
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(null);
  // [PERF v3] 移除 isDraggingForPolyfill state：所需副作用已合入 useDragSelect.applyDragBodyStyles
  // 原： const [isDraggingForPolyfill, setIsDraggingForPolyfill] = useState(false);
  // 主搜索 AbortController ref（覆盖验收 TC-D5：新搜索发起时旧请求 abort）
  const searchAbortRef = useRef(null);

  // 第 1 层：滚到底自动增 userLimit（客户端切片、无网络请求）
  const handleAutoLoadMore = useCallback(() => {
    setUserLimit(prev => prev + 50);
  }, []);

  // 第 2 层：点击"加载更多"按钮→ 调高 searchParams.limit 触发后端二次搜索
  // 后端返回后会走同步 setUserLimit 逻辑（在 line 831 付近），无需手动同步。
  // 这里在调 setSearchParams 后调一次 setUserLimit 预设，让 visibleResults 提前多展示。
  const handleTriggerBackendLoadMore = useCallback(() => {
    setIsLoadingMore(true);
    setLoadMoreError(null);
    setSearchParams(prev => {
      const cur = parseInt(prev.limit) || DEFAULT_SEARCH_PARAMS.limit;
      return { ...prev, limit: cur + 50 };
    });
    setUserLimit(prev => prev + 50);
    // 由于 setSearchParams 可能会触发上层 useEffect 重发搜索（如仓里现有逻辑），或需要手动调 handleSearch；
    // 仓里上游 setSearchParams 不带自动重搜，需手动触发。调用方为 handleSearchRef.current。
    // 使用 setTimeout 避免状态未同步到 ref 导致警告。
    setTimeout(() => {
      if (handleSearchRef.current) handleSearchRef.current();
    }, 0);
  }, []);

  // 重试失败的加载更多
  const handleRetryLoadMore = useCallback(() => {
    setLoadMoreError(null);
    handleTriggerBackendLoadMore();
  }, [handleTriggerBackendLoadMore]);

  // [PERF v3 — 2026-05-22 trace 驱动] 移除 isDragging 上抛链路
  // 原：VirtualizedHybridSearchResults 通过 onDragStateChange 上抛 isDragging
  //     → handleDragStateChange → setIsDraggingForPolyfill → HybridDeepSearchUI (3812行) 整棵重渲 → polyfill effect
  // trace 显示该链路首次进入拖拽时产生 ≈196ms 的巨帧。现以 useDragSelect.applyDragBodyStyles
  //     直接写入 body.style，零 React 调度开销。handleDragStateChange / usePolyfillNoSelectPrefixes 调用均删除。
  // 原代码：
  //   const handleDragStateChange = useCallback((dragging) => { setIsDraggingForPolyfill(dragging); }, []);
  //   usePolyfillNoSelectPrefixes(isDraggingForPolyfill);

  // hasMore 判定：只要 isResultShortage=false 或底层还有数据就认为还能加载
  // 简化处理：只要有当前结果且未达到软上限 (默认 1000、5 页”) 认为 hasMore。
  // 后端返回的总计数（data.total）未入库进状态不能精准判断，用软上限打底免得无限加载。
  const HARD_LIMIT_USER_LIMIT = 1000;
  const hasMore = userLimit < HARD_LIMIT_USER_LIMIT && (visibleResults.length > 0 || isResultShortage);
  // === LM CUSTOMIZATION: InfinitePagination END ===

  // pathTree 用 visibleResults 聚合，确保节点徽章数字 == 该路径下实际可见卡片数
  const { tree: pathTree } = usePathSuggestions(visibleResults, { liveTree });
  
  const [plugins, setPlugins] = useState({ active: [], inactive: [], isLoading: false });
  const [backend, setBackend] = useState(null);
  const [selectedItems, setSelectedItems] = useState(new Set());

  // === NEW CARD INTERACTION: Multi-select mode derived state ===
  // sticky 标志：用户"取消全选"后仍停留在多选模式，直到显式退出（Esc / "退出多选"按钮）
  const [stickyMultiSelect, setStickyMultiSelect] = useState(false);
  const isMultiSelectMode = FEATURE_FLAGS.NEW_CARD_INTERACTION && (selectedItems.size > 0 || stickyMultiSelect);

  // V2 批量打标签 state
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null); // { current, total, failedCount, currentItemName }
  const [batchFailedItems, setBatchFailedItems] = useState([]); // [{ assetUrl, displayName, reason }]
  const [failedBatchItems, setFailedBatchItems] = useState(() => new Map()); // U1 持久化到卡片
  const [lastBatchResult, setLastBatchResult] = useState(null); // { tagName, successItems, mode } 供撤销
  const [undoToastState, setUndoToastState] = useState(null); // { message, onAction, actionLabel, variant }
  const lastClickedIndexRef = useRef(null); // Shift+Click 区间

  // Clear all selections AND exit multi-select mode（Esc / "退出多选" 按钮走这里）
  const clearSelection = useCallback(() => {
    setSelectedItems(new Set());
    setStickyMultiSelect(false);
    lastClickedIndexRef.current = null;
  }, []);

  // 用 ref 持有最新 clearSelection，方便在 useEffect 注册的全局事件 listener 内调用
  // 而无需把 clearSelection 加进依赖（避免 listener 反复挂载/卸载）
  const clearSelectionRef = useRef(clearSelection);
  clearSelectionRef.current = clearSelection;

  // === 全局空白点击退出多选 ===
  // 在多选模式 ON 时，document 级监听 mousedown/mouseup，识别"短按 + 无位移 + 非交互元素"
  // 即可退出多选；覆盖顶部搜索栏空白、左侧产品类型树空白、结果区 titleBar 空白等所有结果容器外区域。
  // 反馈方式：依靠 SelectionModeBar 自身的淡出动画 + Badge 脉冲，无额外涟漪噪音。
  // === LM CUSTOMIZATION: SelectionInteraction START ===
  // [Group A 任务 6 修复] Drawer 打开时的空白点击应让 Drawer 自己处理（关 Drawer），
  // 不应顺带退出多选模式。通过 shouldSkip 把 isDetailsOpen 状态注入。
  useExitMultiSelectOnEmptyClick({
    enabled: isMultiSelectMode,
    onExit: clearSelection,
    shouldSkip: () => isDetailsOpen, // Drawer 打开时跳过退出多选
  });
  // === LM CUSTOMIZATION: SelectionInteraction END ===

  // === LM CUSTOMIZATION: SelectionDrawer === v3 useDrawerCloseGuard 接入移到 useDisclosure 之后（避免 TDZ）

  // Deselect all but KEEP multi-select mode（"取消全选"按钮走这里）
  // 用户清空选中后仍可继续单击/框选卡片，bar 不会消失
  const deselectAllKeepMode = useCallback(() => {
    setSelectedItems(new Set());
    setStickyMultiSelect(true);
    lastClickedIndexRef.current = null;
  }, []);

  // === LM CUSTOMIZATION: SelectionDrawer START ===
  // 原因：原 NEW CARD INTERACTION 的 ESC 监听器（多选退出）已统一迁移到
  //       useKeyboardShortcuts hook（带 isEditableTarget 守卫 + isAnyDialog 让位），
  //       此处保留空块，避免双重监听导致 Drawer 打开时按一次 ESC 既关抽屉又清选中。
  // 合入英伟达新版时：原版 V2 没有此监听，可直接删除整个标记块。
  // === LM CUSTOMIZATION: SelectionDrawer END ===

  // Toggle item selection（V2 支持 event + index：Shift+Click 区间选择）
  // === LM CUSTOMIZATION: Perf D-3 — startTransition 治"卡一下" START ===
  // 根因：isMultiSelectMode 从 false→true 翻转 → 50 张卡 + Toolbar 整棵子树同步 re-render，
  //   实测主线程长任务 161-280ms，用户感知为"冻屏"。
  // 修复：把 setSelectedItems 标记为 transition（低优先级），React 18 调度器自动让出主线程
  //   给用户输入响应 + Toolbar 显示，"卡一下"消失（卡片重渲后台进行，用户先看到 UI 反馈）。
  // 不包 lastClickedIndexRef（ref 赋值无需调度）。
  // === LM CUSTOMIZATION: Perf D-3 — startTransition 治"卡一下" END ===
  const resultsForSelectionRef = useRef([]);
  const handleToggleSelection = useCallback((item, event, index) => {
    const itemId = item?.id || item?.source?.base_key || item?.source?.url;
    if (!itemId) return;

    // Shift+Click 区间选择
    if (event?.shiftKey && typeof index === 'number' && lastClickedIndexRef.current !== null) {
      const start = Math.min(lastClickedIndexRef.current, index);
      const end = Math.max(lastClickedIndexRef.current, index);
      startTransition(() => {
        setSelectedItems(prev => {
          const next = new Set(prev);
          const currentResults = resultsForSelectionRef.current || [];
          for (let i = start; i <= end && i < currentResults.length; i++) {
            const r = currentResults[i];
            const id = r?.id || r?.source?.base_key || r?.source?.url;
            if (id) next.add(id);
          }
          return next;
        });
      });
      lastClickedIndexRef.current = index;
      return;
    }

    startTransition(() => {
      setSelectedItems(prev => {
        const next = new Set(prev);
        if (next.has(itemId)) next.delete(itemId);
        else next.add(itemId);
        return next;
      });
    });
    if (typeof index === 'number') lastClickedIndexRef.current = index;
  }, []);

  // Batch setter for drag-select (set entire selection at once)
  const setBatchSelection = useCallback((newSet) => {
    // === LM CUSTOMIZATION: Perf D-4 — 拖拽框选改回同步更新 START ===
    // 反转 D-3 的 startTransition：用户报告"框选过一会儿才选中"，根因是 startTransition
    //   把高频流式更新（mousemove 每帧都可能触发）降级为低优先级，React 调度器一直
    //   等主线程空闲才 commit。但 mousemove 期间主线程一直在忙（产生新事件），
    //   React 把所有更新攒到 mouseup 后才 flush → 用户感知"过一会儿才框中"。
    // 修复：拖拽场景下用户期望即时反馈（60fps 跟手），改为同步 setSelectedItems。
    //   配合 react-window 虚拟化，单次 commit 实际只更新屏幕内 ~20 张卡，能在一帧内完成。
    // 注意：onCardCheckboxClick / handleToggleSelection 仍保留 startTransition，
    //   因为它们是低频离散事件（点一下 checkbox），用 transition 能避开"进入多选"的 167ms 长任务。
    // === LM CUSTOMIZATION: Perf D-4 END ===
    setSelectedItems(newSet);
  }, []);

  // === LM CUSTOMIZATION: Copy Deploy Fix START ===
  // toast 提前定义（原本在第 ~648 行），避免下方 copyToClipboard 的 useCallback 依赖数组
  // 在 hook 创建时读取 toast 触发 TDZ（Cannot access 'toast' before initialization）。
  // useToast() 是无依赖的纯 hook，此处可以安全提前；原位置的 toast 声明已移除。
  const toast = useToast();

  // 双路都失败时承接最终用户兜底的手动复制 Modal 文本
  const [manualCopyText, setManualCopyText] = useState(null);

  // Helper: copy text to clipboard with toast feedback
  // 双路并发兜底策略：
  //   防线 1（同步 execCommand）：必须在 onClick 同步栈内执行，保住用户激活态。这条是 calvin
  //                              在 HTTP 内网 IP（30.23.76.17:3000）下能复制成功的关键。
  //   防线 2（异步 writeText + readText 校验）：HTTPS 下首选；带 500ms 超时，超时/拒绝
  //                              不判失败，仅在"读到内容明确不一致"时降级。
  //   防线 3（手动 Modal）：双路都失败时弹出，确保用户至少能 Ctrl+C，绝不静默假成功。
  const copyToClipboard = useCallback((text) => {
    if (!text) {
      copyLog('called with empty text, skip');
      return;
    }

    copyLog('invoked', {
      textLen: text.length,
      isSecureContext: typeof window !== 'undefined' && window.isSecureContext,
      hasClipboard: !!navigator.clipboard,
      hasWriteText: !!navigator.clipboard?.writeText,
      hasReadText: !!navigator.clipboard?.readText,
      hasFocus: typeof document !== 'undefined' && document.hasFocus?.(),
      activeTag: typeof document !== 'undefined' ? document.activeElement?.tagName : null,
    });

    // [Copy Deploy Fix - 防线 1] 同步 execCommand —— 必须在 onClick 栈内
    // 采用 copy-to-clipboard npm 包同款"硬核"写法，修复 execCommand 返回 true 但
    // 实际粘贴板为空的问题（根因：临时 textarea 没真正拿到 selection 就被 copy 了）
    let execOk = false;
    const prevActive = document.activeElement;
    // 保存用户原 selection，拷贝完恢复，避免干扰页面已选中文字
    const savedRanges = [];
    const sel = document.getSelection();
    if (sel && sel.rangeCount > 0) {
      for (let i = 0; i < sel.rangeCount; i++) savedRanges.push(sel.getRangeAt(i));
    }

    // [Copy Deploy Fix v3 - 修复 Modal 内复制]
    // Chakra <Modal> 默认开启 react-focus-lock：监听 focus/selection 事件，
    // 任何"试图把焦点或 selection 转移到 Modal 外"的尝试都会被立即拽回。
    // 之前 textarea 挂在 document.body 上，刚 select() 完 focus-lock 就把
    // selection 抢回 Modal，导致 execCommand 拷贝的是空 selection（cmdOk=true，
    // 但实际剪贴板为空）。修复：textarea 挂载到当前 dialog 容器内部，
    // focus-lock 视其为"局内元素"，不再干预 selection。
    // [v4 收紧] 只走 activeElement 祖先链，**不再做"全局找最顶层 dialog"的兜底**。
    // 原因：页面上常驻多种隐形 dialog（Chakra toast 容器、tooltip portal、已关闭但
    // 残留的 modal 节点等）都会匹配 [role="dialog"]，导致主列表场景下卡片复制
    // 也被误挂到隐形 dialog 里，selection 直接被抢空（v3 现场表现：mountedIn=dialog
    // 但 selectionLen=0）。
    // 现在的判定：按钮自己的祖先链上有 dialog 才挂 dialog；否则一律 body。
    // 失败也无所谓——反正后面还有手动 Modal 网兜，绝不静默假成功。
    const findCopyMountPoint = () => {
      try {
        const active = document.activeElement;
        if (active && active !== document.body && typeof active.closest === 'function') {
          // 只接受"真正包含按钮的 dialog"——必须是 aria-modal=true 或 chakra modal content，
          // 排除 toast/tooltip/popover 这些常驻浮层节点
          const dialog = active.closest('.chakra-modal__content, [role="dialog"][aria-modal="true"]');
          if (dialog && dialog.offsetParent !== null) return dialog;
        }
      } catch (_) { /* noop, fall through to body */ }
      return document.body;
    };
    const mountPoint = findCopyMountPoint();
    const mountedIn = mountPoint === document.body ? 'body' : 'dialog';

    let ta = null;
    try {
      ta = document.createElement('textarea');
      ta.value = text;
      // iOS 需要 contentEditable=true 才能 select，同时 readOnly 防键盘弹出
      ta.setAttribute('readonly', '');
      ta.contentEditable = 'true';
      // 关键：不用 opacity:0 / pointer-events:none —— 那些会让浏览器跳过 selection。
      // 改用视觉几乎不可见但仍"可交互"：1px × 1px + 接近透明色 + 用 transform 移出视口
      ta.style.cssText =
        'all:unset;position:fixed !important;top:0 !important;left:0 !important;' +
        'width:1px !important;height:1px !important;padding:0 !important;' +
        'border:0 !important;margin:0 !important;font-size:12pt !important;' +
        'background:transparent !important;color:transparent !important;' +
        'z-index:2147483647 !important;';
      mountPoint.appendChild(ta);

      // iOS Safari 专用：用 Range 选择（setSelectionRange 在 iOS 上不触发真选中）
      const range = document.createRange();
      range.selectNodeContents(ta);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      // 双保险：原生 select + setSelectionRange
      ta.setSelectionRange(0, text.length);
      ta.select();

      // 执行前先验证 selection 里真的是我们的文本
      // [BugFix] 旧版 selectionLooksRight = selectedText === text || ta.value === text；
      // 因 ta.value 永远 === text（自己设的），OR 短路让验证形同虚设：
      // 即使 selection 被 focus-lock 抢空也会判 true，弹出虚假"已复制"toast。
      // 修正：只信 selectedText === text（真实 selection 内容）。
      const selectedText = (window.getSelection() || '').toString();
      const selectionMatches = selectedText === text;

      const cmdOk = document.execCommand('copy');
      // 关键：execCommand 返回 true 不代表真写入了，必须 selection 真包含目标文本才算成功
      execOk = cmdOk && selectionMatches;
      copyLog('execCommand path result', {
        cmdOk,
        selectionLen: selectedText.length,
        selectionMatches,
        mountedIn, // 新增：挂载点诊断字段；Modal 内复制必须为 'dialog' 才会成功
        execOk,
      });
    } catch (e) {
      console.warn('[CopyURL] execCommand threw', e);
      execOk = false;
    } finally {
      // 清理临时 textarea
      if (ta && ta.parentNode) ta.parentNode.removeChild(ta);
      // 恢复用户原 selection
      if (savedRanges.length > 0) {
        const s = document.getSelection();
        if (s) {
          s.removeAllRanges();
          savedRanges.forEach((r) => s.addRange(r));
        }
      }
      // 恢复原焦点元素
      if (prevActive && typeof prevActive.focus === 'function') {
        try { prevActive.focus(); } catch (_) { /* noop */ }
      }
    }

    // [Copy Deploy Fix - 防线 2] 异步 writeText + 带超时的 readText 回读校验
    const tryWriteText = async () => {
      if (!navigator.clipboard?.writeText) {
        copyLog('writeText unavailable');
        return false;
      }
      try {
        await navigator.clipboard.writeText(text);
      } catch (e) {
        copyLog('writeText rejected', { reason: e?.message });
        return false;
      }
      // 读不到不判失败：很多部署/扩展会禁用 clipboard-read 但 write 是真写了
      if (!navigator.clipboard?.readText) {
        copyLog('writeText resolved (no readText to verify)');
        return true;
      }
      try {
        const read = await Promise.race([
          navigator.clipboard.readText(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('readText-timeout')), 500)),
        ]);
        if (typeof read === 'string' && read.length > 0 && read !== text) {
          // 读到内容但内容明确不一致 → 显式假成功，判失败
          copyLog('writeText FAKE SUCCESS detected', { readLen: read.length, expectedLen: text.length });
          return false;
        }
        copyLog('writeText verified', { matched: read === text });
        return true;
      } catch (e) {
        copyLog('readText skipped (treat as success)', { reason: e?.message });
        return true;
      }
    };

    let settled = false;
    tryWriteText().then((writeOk) => {
      if (settled) return;
      settled = true;
      if (execOk || writeOk) {
        copyLog('SUCCESS', { execOk, writeOk });
        toast({
          title: t('copiedToClipboard'),
          status: 'success',
          duration: 2000,
        });
      } else {
        // [Copy Deploy Fix - 防线 3] 双路都失败 → 弹手动 Modal（不再用易被忽略的红色 toast 兜底）
        console.warn('[CopyURL] all paths failed, opening manual copy modal');
        setManualCopyText(text);
      }
    }).catch((e) => {
      // 理论上 tryWriteText 内部已 catch；这里再兜一层防御
      if (settled) return;
      settled = true;
      console.warn('[CopyURL] unexpected error in writeText path', e);
      if (execOk) {
        toast({ title: t('copiedToClipboard'), status: 'success', duration: 2000 });
      } else {
        setManualCopyText(text);
      }
    });
  }, [t, toast]);
  // === LM CUSTOMIZATION: Copy Deploy Fix END ===

  // Copy selected URLs - use refs to keep callback reference stable
  const resultsRef = useRef(results);
  resultsRef.current = results;
  // V2: 同步给 Shift+Click 区间选择 handler 使用（[UX Polish R2] 用过滤后数组，让"从 A 到 B"语义与可见卡片一致）
  resultsForSelectionRef.current = tagFilteredResults;
  // [UX Polish R2] 过滤后数组 ref：全选等"以屏幕可见资产为准"的场景用这个
  const tagFilteredResultsRef = useRef(tagFilteredResults);
  tagFilteredResultsRef.current = tagFilteredResults;
  const selectedItemsRef = useRef(selectedItems);
  selectedItemsRef.current = selectedItems;
  
  const copySelectedUrls = useCallback(() => {
    const currentResults = resultsRef.current;
    const currentSelectedItems = selectedItemsRef.current;
    const selectedUrls = currentResults
      .filter(item => {
        const itemId = item.id || item.source?.base_key || item.source?.url;
        return currentSelectedItems.has(itemId);
      })
      .map(item => item.source?.base_key || item.source?.url || item.id)
      .filter(Boolean)
      .join("\n");
    if (selectedUrls) {
      copyToClipboard(selectedUrls);
    }
  }, [copyToClipboard]);

  // Feedback popup state (only if feature is enabled)
  const [searchCount, setSearchCount] = useState(() => {
    if (!FEATURE_FLAGS.ENABLE_FEEDBACK_MODAL) return 0;
    const saved = localStorage.getItem('searchCount');
    return saved ? parseInt(saved) : 0;
  });
  const [showFeedbackPopup, setShowFeedbackPopup] = useState(false);
  const [feedbackDismissed, setFeedbackDismissed] = useState(() => {
    if (!FEATURE_FLAGS.ENABLE_FEEDBACK_MODAL) return true;
    return localStorage.getItem('feedbackDismissed') === 'true';
  });
  const [feedbackShownThisSession, setFeedbackShownThisSession] = useState(false);

  // Search parameters (legacy filters)
  const [searchParams, setSearchParams] = useState({ ...DEFAULT_SEARCH_PARAMS });

  // 同步 userLimit 与 searchParams.limit（userLimit 提前声明以供 visibleResults useMemo 使用）
  useEffect(() => {
    const newLimit = parseInt(searchParams.limit) || DEFAULT_SEARCH_PARAMS.limit;
    setUserLimit(newLimit);
  }, [searchParams.limit]);

  // Helper function to check if backend is S3
  const isS3Backend = (backendString) => {
    return backendString && backendString.toLowerCase().includes('s3');
  };

  // Helper function to check if backend is Nucleus
  const isNucleusBackend = (backendString) => {
    return backendString && backendString.toLowerCase().includes('omniverse://');
  };

  // Shared helper: read auth credentials from localStorage for a given server
  const readAuthCredentials = useCallback((server) => {
    return {
      api_key: (server && localStorage.getItem(`${server}_api_key`)) || localStorage.getItem("api_key") || "",
      nucleus_api_token: (server && localStorage.getItem(`${server}_nucleus_api_token`)) || localStorage.getItem("nucleus_api_token") || "",
      username: server ? (localStorage.getItem(`${server}_username`) ?? localStorage.getItem("username")) : localStorage.getItem("username"),
      password: server ? (localStorage.getItem(`${server}_password`) ?? localStorage.getItem("password")) : localStorage.getItem("password"),
    };
  }, []);

  // Shared helper: check if auth was explicitly cleared for a given server
  const isAuthCleared = useCallback((server) => {
    return (server ? localStorage.getItem(`${server}_auth_cleared`) : localStorage.getItem("auth_cleared")) === "true";
  }, []);

  // Auth state (simplified - you may want to use a proper auth hook)
  const [auth, setAuth] = useState(() => {
    // Determine the initial selected backend to read server-specific keys
    const urlParams = new URLSearchParams(window.location.search);
    const serverParam = urlParams.get('server');
    const initialBackend = (serverParam && Object.keys(SERVER_MAPPING).includes(serverParam))
      ? serverParam
      // [v2 补强 3] 与 selectedBackend / HeaderIcons / AuthForm 保持一致，不要直接 Object.keys()[0]
      : getDefaultServerKey();

    // Check if user explicitly cleared credentials for this server
    if (isAuthCleared(initialBackend)) {
      return { api_key: "", nucleus_api_token: "", username: "", password: "", isAuthenticated: false };
    }

    const creds = {
      api_key: "",
      nucleus_api_token: "",
      username: null,
      password: null,
    };
    // Use the helper to populate credentials
    Object.assign(creds, readAuthCredentials(initialBackend));

    return {
      api_key: creds.api_key,
      nucleus_api_token: creds.nucleus_api_token,
      username: creds.username !== null ? creds.username : AUTH_CONFIG.DEFAULT_USERNAME,
      password: creds.password !== null ? creds.password : AUTH_CONFIG.DEFAULT_PASSWORD,
      isAuthenticated: false,
    };
  });

  // Listen for auth updates from header component
  useEffect(() => {
    const handleAuthUpdate = () => {
      // Check if user explicitly cleared credentials
      if (isAuthCleared(selectedBackend)) {
        setAuth({ api_key: "", nucleus_api_token: "", username: "", password: "", isAuthenticated: false });
        return;
      }

      // Use the shared helper
      const creds = readAuthCredentials(selectedBackend);
      const username = creds.username !== null ? creds.username : AUTH_CONFIG.DEFAULT_USERNAME;
      const password = creds.password !== null ? creds.password : AUTH_CONFIG.DEFAULT_PASSWORD;

      setAuth({
        api_key: creds.api_key,
        nucleus_api_token: creds.nucleus_api_token,
        username,
        password,
        isAuthenticated: !!(creds.api_key || (username !== "" && password !== "")),
      });
    };

    window.addEventListener('auth-updated', handleAuthUpdate);
    window.addEventListener('storage', handleAuthUpdate);
    
    return () => {
      window.removeEventListener('auth-updated', handleAuthUpdate);
      window.removeEventListener('storage', handleAuthUpdate);
    };
  }, [backend, selectedBackend]);

  // === LM CUSTOMIZATION: 登录态自动检查 ===
  useAuthGuard({ selectedBackend, apiUrl, enabled: true, checkDelay: 1500 });

  // Disclosures
  const { isOpen: isDetailsOpen, onClose: onDetailsClose, onOpen: onDetailsOpen } = useDisclosure();
  const { isOpen: __, onClose: ___onWelcomeClose, onOpen: onWelcomeOpen } = useDisclosure();

  // === LM CUSTOMIZATION: SelectionDrawer START ===
  // v3 TC-A4/A6 修复：Drawer 打开时的关闭白名单守卫。
  // - Chakra <Drawer closeOnOverlayClick={false}> 已禁用遮罩点击关闭（在 AssetDetailsDrawer 内）
  // - 这里再补一个全局监听：仅当用户点击带 [data-true-empty-area="true"] 标记的真空白
  //   元素时才触发 onDetailsClose。其他位置（卡片/复选框/工具栏/搜索框）一律不关。
  // - 关闭白名单总览：×按钮 / Esc / server-changed / 真空白点击（共 4 条）
  // 合入英伟达新版时：保留本块；旗标关闭即等价于原版（NVIDIA 原版不会调用本 hook）。
  useDrawerCloseGuard({
    enabled: isDetailsOpen,
    onClose: onDetailsClose,
  });
  // === LM CUSTOMIZATION: SelectionDrawer END ===

  // 注：toast 已在本组件靠前位置定义（Copy Deploy Fix 块），此处不再重复声明。

  // Shared helper: show unauthorized toast (defined after useToast to avoid "before initialization" error)
  // === LM CUSTOMIZATION: Auth Guard toast 去重 ===
  // 当 AuthGuardModal 打开或最近 30s 内刚提示过时，跳过此 toast，避免与居中 Modal 双重提示
  const showUnauthorizedToast = useCallback(() => {
    if (typeof window !== 'undefined' && Date.now() < (window.__authGuardActiveUntil || 0)) {
      return;
    }
    toast({
      title: t('loginRequired'),
      description: t('loginRequiredDescription'),
      status: "warning",
      duration: 8000,
      isClosable: true,
    });
  }, [toast, t]);

  // Memoized serialized values to avoid expensive JSON.stringify on every render
  const serializedSearchParams = useMemo(() => JSON.stringify(searchParams), [searchParams]);
  const serializedHybridConfig = useMemo(() => JSON.stringify(hybridConfig), [hybridConfig]);

  // Refs for values that change frequently but shouldn't recreate callbacks
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;
  // V2: 批量 reindex 的 U8 守卫用同一份 searchQuery（声明放这里避免 TDZ）
  const searchQueryRefForBatch = useRef('');
  searchQueryRefForBatch.current = searchQuery;
  const imageBase64Ref = useRef(imageBase64);
  imageBase64Ref.current = imageBase64;
  // === LM CUSTOMIZATION: Search/Tag decoupling — stable refs for handleSearch ===
  const committedQueryRef = useRef(committedQuery);
  committedQueryRef.current = committedQuery;
  const selectedTagsRef = useRef(selectedTags);
  selectedTagsRef.current = selectedTags;
  const categoryTagRef = useRef(categoryTag);
  categoryTagRef.current = categoryTag;

  // URL serialization functions (memoized to stabilize handleFindSimilar reference)
  const serializedDefaultHybridConfig = useMemo(() => JSON.stringify(DEFAULT_HYBRID_CONFIG), []);

  // === LM CUSTOMIZATION: SearchSettingsCustomBadge START ===
  // 原因：C 组任务 4.6 — 顶栏齿轮按钮需要"Custom"小圆点提示用户当前有非默认配置；
  //       但 hybridConfig state 在 HybridDeepSearchUI 内部，顶栏触发器在 index.js 里，
  //       两者跨组件树。用 CustomEvent 单向广播是最小侵入解法。
  // 合入英伟达新版时：保留本 useEffect。
  useEffect(() => {
    const isCustom = serializedHybridConfig !== serializedDefaultHybridConfig;
    window.dispatchEvent(
      new CustomEvent('hybrid-config-customized', { detail: { isCustom } }),
    );
  }, [serializedHybridConfig, serializedDefaultHybridConfig]);
  // === LM CUSTOMIZATION: SearchSettingsCustomBadge END ===

  const serializeToURL = useCallback((backendOverride = null) => {
    const params = new URLSearchParams();
    
    // Read from refs to avoid dependency on frequently-changing values
    const currentQuery = searchQueryRef.current;
    const currentImage = imageBase64Ref.current;
    // === LM CUSTOMIZATION: Search/Tag decoupling v4 — q 只承载 committedQuery，tags 为手动标签数组 ===
    const currentCommitted = committedQueryRef.current;
    const currentTags = selectedTagsRef.current || [];

    // Basic search parameters
    // q 仅写入 committedQuery（已提交的搜索词），避免用户打字过程污染 URL；
    // 未提交的 searchQuery 仅存在于输入框本地，不进 URL。
    if (currentCommitted && currentCommitted.trim()) {
      params.set('q', currentCommitted.trim());
    }
    // tags 单独编码为逗号分隔字符串，含空格的标签（如 "general building"）作为单个元素保留
    if (Array.isArray(currentTags) && currentTags.length > 0) {
      params.set('tags', currentTags.join(','));
    }
    // 注：categoryTag 对应的 URL 参数 ?category=<id> 由 CategorySidebar 自己管理（push/replaceState），
    // 本函数不重复写 category，避免双写冲突。
    // Store large base64 image data in sessionStorage to avoid URL length limit / browser freeze
    if (currentImage) {
      try {
        sessionStorage.setItem('search_image_base64', currentImage);
        params.set('img', '1');  // Marker: image exists in sessionStorage
      } catch {
        // SessionStorage full or unavailable — skip silently
      }
    } else {
      sessionStorage.removeItem('search_image_base64');
    }
    if (showScores !== SEARCH_DEFAULTS.showScores) params.set('scores', 'true');
    if (viewMode !== SEARCH_DEFAULTS.viewMode) params.set('view', viewMode);
    if (gridSize !== SEARCH_DEFAULTS.gridSize) params.set('gridSize', gridSize);
    if (configCollapsed !== SEARCH_DEFAULTS.configCollapsed) params.set('config_open', 'true');
    if (showOnlyWithPreviews !== SEARCH_DEFAULTS.showOnlyWithPreviews) params.set('with_previews', 'false');

    // Add selected backend to URL parameters
    // [v2 补强 2] 写 server 前做"主 key 归一化"——任何能被 resolveNucleusHost 解析到 'ov.qq.com' 的 key 统一写 'nucleus'。
    // 收益：①复制 URL 永远是干净的 ?server=nucleus（不再有 %3A%2F%2F 编码污染）；
    //      ②老用户带 ?server=omniverse 进入后，搜索一次 URL 自动无声升级到 ?server=nucleus；
    //      ③与 useTagManager.storageKeyAliases 固定 'omniverse' / 'nucleus' 候选配合，URL 升级前后 Tag 都能命中 storage。
    const normalizeServerParam = (key) => {
        if (!key) return key;
        if (resolveNucleusHost(key) === 'ov.qq.com') return 'nucleus';
        return key;
    };
    const serverToWrite = backendOverride || selectedBackend;
    if (serverToWrite) {
        params.set('server', normalizeServerParam(serverToWrite));
    }
    
    // Search filters - skip values that match defaults or are effectively empty
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value === "" || value === null || value === undefined) return;
      if (DEFAULT_SEARCH_PARAMS[key] === value) return; // Skip if value matches default exactly
      // Treat 0, "0", false, "false" as empty when default is "" (filter not active)
      const defaultVal = DEFAULT_SEARCH_PARAMS[key];
      if (defaultVal === "" && (value === 0 || value === "0" || value === false || value === "false")) return;
      params.set(key, value.toString());
    });
    
    // Hybrid config serialization — use memoized strings to avoid repeated JSON.stringify
    if (serializedHybridConfig !== serializedDefaultHybridConfig) {
      const encodedConfig = btoa(serializedHybridConfig);
      params.set('hybrid_config', encodedConfig);
    }
    
    // Update browser URL without reloading the page
    const url = new URL(window.location);
    url.search = params.toString();
    window.history.replaceState({}, '', url);
  }, [showScores, viewMode, gridSize, configCollapsed, showOnlyWithPreviews, selectedBackend, searchParams, serializedHybridConfig, serializedDefaultHybridConfig]);

  const deserializeFromURL = () => {
    const urlParams = new URLSearchParams(window.location.search);
    
    // === LM CUSTOMIZATION: Search/Tag decoupling v4 — 兼容新协议 (q + tags) 与旧 URL ===
    // 规则：?q= 同时写入 searchQuery（输入框显示）与 committedQuery（大标题驱动）；
    //       ?tags= 进 selectedTags；?category= 由 CategorySidebar.syncFromURL 负责恢复。
    // 旧链接（?q=a+b+c 无 ?tags=）整串塞进 searchQuery+committedQuery，不自动 split 成 tag。
    const query = urlParams.get('q');
    const tagsParam = urlParams.get('tags');
    if (tagsParam !== null) {
      const parsedTags = tagsParam
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      if (parsedTags.length > 0) {
        setSelectedTags(parsedTags);
        selectedTagsRef.current = parsedTags;
      }
      if (query) {
        setSearchQuery(query);
        searchQueryRef.current = query;
        setCommittedQuery(query);
        committedQueryRef.current = query;
        setLastSearchQuery(query);
      }
    } else if (query) {
      // Legacy URL：无 tags 参数，整串作为搜索词处理（向后兼容）
      if (query.includes(' ') || query.includes('+')) {
        console.warn('[Search] Legacy URL detected (?q= with spaces, no ?tags=); treating whole string as search query.');
      }
      setSearchQuery(query);
      searchQueryRef.current = query;
      setCommittedQuery(query);
      committedQueryRef.current = query;
      setLastSearchQuery(query);
    }
    
    const img = urlParams.get('img');
    if (img) {
      // Retrieve actual base64 data from sessionStorage (avoids huge URL strings)
      const storedImage = sessionStorage.getItem('search_image_base64');
      if (storedImage) setImageBase64(storedImage);
    }
    
    const scores = urlParams.get('scores');
    if (scores === 'true') setShowScores(true);
    
    // === LM CUSTOMIZATION: HideListView START ===
    // 原因：List 视图入口被隐藏后，旧分享链接 ?view=list 或 localStorage 残留 viewMode=list
    //   仍可能塞回 'list'，导致用户期望"看到 List"但 UI 找不到入口去切回 Grid。
    //   这里在 URL 反序列化时对 'list' 做静默降级到 'grid'。同时清掉 localStorage 中
    //   任何残留的 viewMode='list'（防御式：当前代码没主动写过该 key，但用户/浏览器扩展可能已塞过）。
    // 合入英伟达新版时：如英伟达正式弃用 List 视图，则可以删除本块；否则保留。
    const view = urlParams.get('view');
    if (view) {
      setViewMode(view === 'list' ? 'grid' : view);
    }
    try {
      const lsView = window.localStorage?.getItem('viewMode');
      if (lsView === 'list') {
        window.localStorage.setItem('viewMode', 'grid');
      }
    } catch (_) { /* localStorage 不可用时静默忽略 */ }
    // === LM CUSTOMIZATION: HideListView END ===
    
    const gridSizeParam = urlParams.get('gridSize');
    if (gridSizeParam) setGridSize(gridSizeParam);
    
    const configOpen = urlParams.get('config_open');
    if (configOpen === 'true') setConfigCollapsed(false);
    
    const withPreviews = urlParams.get('with_previews');
    if (withPreviews === 'false') setShowOnlyWithPreviews(false);

    // Handle server parameter - only update if explicitly changing servers
    const serverParam = urlParams.get('server');
    if (serverParam && SERVER_MAPPING[serverParam] && !selectedBackend) {
      setSelectedBackend(serverParam);
    }
    
    // Search filters
    const newSearchParams = { ...searchParams };
    Object.keys(newSearchParams).forEach(key => {
      const value = urlParams.get(key);
      if (value !== null) {
        // Handle boolean values
        if (key === 'bbox_use_scaled_dimensions' || key === 'deduplicate_by_hash') {
          newSearchParams[key] = value === 'true';
        }
        // Handle numeric values
        else if (key === 'limit') {
          newSearchParams[key] = parseInt(value) || DEFAULT_SEARCH_PARAMS.limit;
        }
        // Handle string values
        else {
          newSearchParams[key] = value;
        }
      }
    });
    setSearchParams(newSearchParams);
    
    // Hybrid config deserialization
    const hybridConfigParam = urlParams.get('hybrid_config');
    if (hybridConfigParam) {
      try {
        const decodedConfig = JSON.parse(atob(hybridConfigParam));
        // [TagSearchFix P6] 自动迁移旧链接里的低 tags.tag/tags.value weight，
        // 让带旧 hybrid_config 参数的分享链接也能搜到 tag。
        migrateLegacyWeights(decodedConfig);
        setHybridConfig(decodedConfig);
      } catch (error) {
        console.error('Error deserializing hybrid config from URL:', error);
      }
    }
    
    // Auto-search if we have search parameters
    return query || img || tagsParam; // Return true if we should auto-search
  };

  // Initialize from URL on component mount
  useEffect(() => {
    // Add a small delay to ensure all state is initialized
    const timer = setTimeout(() => {
      deserializeFromURL();
      setIsInitialized(true);
      
      // Always trigger auto-search (Fab: show all products on initial load)
      setShouldAutoSearch(true);
    }, 100);
    
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-search when URL parameters are loaded and ready
  // === LM CUSTOMIZATION: Remove searchQuery/imageBase64 guard — allow empty query (Fab: show all products) ===
  // === LM CUSTOMIZATION: auto-search auth-aware START ===
  // 修复"首次输入令牌登录后首页 0 结果"bug：
  //   - 仅在已认证 + 已初始化时执行 mount 阶段自动搜索
  //   - 未认证时不消费 shouldAutoSearch 标志（不重置为 false），等待下方边沿触发器
  //     在 auth.isAuthenticated 由 false→true 时再次将其置 true 重入本 effect
  useEffect(() => {
    if (!shouldAutoSearch || !isInitialized) return undefined;
    if (!auth.isAuthenticated) {
      // 未认证：跳过自动搜索，避免无效 401 请求与误导性"0 个资产"空态。
      // 保留 shouldAutoSearch=true，由下方 prevAuthRef 边沿 useEffect 在登录完成后重新触发。
      return undefined;
    }
    // Add a small delay to ensure all state updates are fully applied
    const timer = setTimeout(() => {
      handleSearch();
      setShouldAutoSearch(false); // Reset flag
    }, 200);

    return () => clearTimeout(timer);
  }, [shouldAutoSearch, isInitialized, auth.isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // 边沿检测：auth.isAuthenticated 由 false → true 时（且已初始化），
  // 重新置位 shouldAutoSearch 触发一次"显示全部"自动搜索（首登补搜路径）。
  // 已登录用户 mount 时 isAuthenticated 初始即 true，不会被识别为边沿，行为零回归。
  const prevAuthRef = useRef(auth.isAuthenticated);
  useEffect(() => {
    const prev = prevAuthRef.current;
    const curr = auth.isAuthenticated;
    prevAuthRef.current = curr;
    if (!prev && curr && isInitialized) {
      setShouldAutoSearch(true);
    }
  }, [auth.isAuthenticated, isInitialized]);
  // === LM CUSTOMIZATION: auto-search auth-aware END ===

  // Update URL when parameters change (only after initialization)
  // Note: searchQuery is excluded to avoid URL updates on every keystroke
  useEffect(() => {
    if (!isInitialized) return;
    
    const timeoutId = setTimeout(() => {
      serializeToURL();
    }, 300); // Debounce URL updates
    
    return () => clearTimeout(timeoutId);
  }, [
    isInitialized, 
    imageBase64, 
    showScores, 
    showOnlyWithPreviews,
    viewMode, 
    configCollapsed, 
    serializedSearchParams, // Memoized to avoid expensive JSON.stringify on every render
    serializedHybridConfig  // Memoized to avoid expensive JSON.stringify on every render
  ]);

  // === LM CUSTOMIZATION: blur-trigger-search START ===
  // v3: 移除 800ms debounce，改为 FabToolbar 子组件通过 onTriggerSearch 显式触发
  // 保留 ref 避免首次渲染问题
  const isFirstSearchParamsRender = useRef(true);
  useEffect(() => {
    if (!isInitialized) return;
    if (isFirstSearchParamsRender.current) {
      isFirstSearchParamsRender.current = false;
    }
  }, [serializedSearchParams, isInitialized]);

  // FabToolbar 子组件调用此函数显式触发搜索
  // 使用 setTimeout(0) 延迟到下一帧，确保 React state 更新已反映到 ref
  const triggerSearchFromToolbar = useCallback(() => {
    setTimeout(() => {
      handleSearchRef.current?.();
    }, 0);
  }, []);
  // === LM CUSTOMIZATION: blur-trigger-search END ===

  // Auth check
  useEffect(() => {
    const hasValidAuth = 
      (AUTH_CONFIG.ENABLE_NUCLEUS_AUTH && auth.nucleus_api_token) ||
      (AUTH_CONFIG.ENABLE_API_KEY_AUTH && auth.api_key) ||
      (AUTH_CONFIG.ENABLE_BASIC_AUTH && (auth.username !== "" && auth.password !== ""));

    const isAuthRequired = false; // Allow users to use navbar auth instead of modal

    if (hasValidAuth || !isAuthRequired) {
      setAuth(prev => ({ ...prev, isAuthenticated: (auth.username !== "" && auth.password !== "") }));
    } else if (isAuthRequired) {
      onWelcomeOpen();
    }
  }, []);

  // Fetch properties data and plugins info
  useEffect(() => {
    const fetchPropertiesData = async () => {
      try {
        // Only fetch if authenticated
        if (!auth.isAuthenticated) {
          return;
        }
        const headers = getHeaders();
        const response = await fetch(`${apiUrl}/search/stats/usd_properties`, {
          method: 'GET',
          headers: headers
        });
        const data = await response.json();
        setPropertiesData(data);
      } catch (error) {
        console.error("Error fetching property data", error);
      }
    };

    if (auth.isAuthenticated && !propertiesData) {
      fetchPropertiesData();
      fetchPluginsInfo();
      fetchBackendInfo();
    }
  }, [auth.isAuthenticated, propertiesData, selectedBackend]);

  // Update username based on backend type (only when initially loading, not when user clears)
  // [v2 安全修复] 移除 Nucleus 分支的 username auto-fill ('$omni-api-token')，
  //   原因：与 index.js 的 setDefaultUsername 保持一致，让 DeviceFlow 作为 Nucleus backend 的唯一登录入口。
  //   保留 S3 分支：S3 测试 backend 仍允许 dummy 占位，不影响业务。
  useEffect(() => {
    if (backend && localStorage.getItem("username") === null) {
      if (isS3Backend(backend)) {
        setAuth(prev => ({ ...prev, username: "", password: "test" }));
        // Set localStorage so we know it's been initialized
        localStorage.setItem("username", "");
      }
    }
  }, [backend]);


  // Helper functions
  const getHeaders = useCallback(() => {
    const headers = { "Content-Type": "application/json" };

    // Add storage backend header if a backend is selected
    if (selectedBackend) {
      headers["x-usdsearch-storage-backend"] = selectedBackend;
    }

    // 优先级 1: SSO JWT Bearer token
    const ssoToken = localStorage.getItem('omni_access_token');
    if (ssoToken && ssoToken.trim() !== '') {
      // 验证 JWT 未过期（60s 缓冲）
      try {
        const payload = JSON.parse(atob(ssoToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload.exp && 1000 * payload.exp > Date.now() + 60000) {
          headers["Authorization"] = `Bearer ${ssoToken}`;
          return headers;
        }
      } catch (e) {
        // JWT 解析失败，回退到其他方式
      }
    }

    // 优先级 2: 传统认证方式
    // Get auth credentials via shared helper
    const serverAuth = readAuthCredentials(selectedBackend);

    // Only add auth headers if authentication is configured and available
    // Priority: API Key first (if explicitly set), then Basic Auth, then Nucleus
    if (serverAuth.api_key && serverAuth.api_key.trim() !== "") {
      headers["x-api-key"] = serverAuth.api_key;
    } else if (serverAuth.username && serverAuth.username.trim() !== "") {
      headers["Authorization"] = `Basic ${btoa(`${serverAuth.username}:${serverAuth.password || ""}`)}`;
    } else if (serverAuth.nucleus_api_token && serverAuth.nucleus_api_token.trim() !== "") {
      const basicAuth = btoa("$omni-api-token:" + serverAuth.nucleus_api_token);
      headers["Authorization"] = "Basic " + basicAuth;
    }

    return headers;
  }, [selectedBackend, readAuthCredentials]);

  // [TagFilterSearch] 获取全局可用 tag 列表（供 TagsFilter 候选）
  const { globalTags, removeTag: removeGlobalTag, addTag: addGlobalTag } = useGlobalTags({
    serverUrl: nucleusServerUrl,
    getHeaders,
  });

  // [TagFilterSearch] Modal 关闭时乐观更新 results 中对应 item 的 source.tags
  // [TagDeleteSync] 同时同步 globalTags 缓存：新增的 tag 加入候选，被删的 tag 移除候选
  const handleTagsChanged = useCallback((assetId, latestTags) => {
    if (!assetId || !Array.isArray(latestTags)) return;

    // 乐观更新 results 数组
    setResults(prev => {
      const oldItem = prev.find(item => (item.source?.url || item.source?.base_key || '') === assetId);
      const oldTagNames = (oldItem?.source?.tags || []).map(t =>
        typeof t === 'string' ? t : (t?.name || t?.tag || '')
      ).filter(Boolean);
      const newTagNames = latestTags.map(t => t.name || '').filter(Boolean);

      // 同步 globalTags：移除被删的，添加新增的
      const removed = oldTagNames.filter(t => !newTagNames.includes(t));
      const added = newTagNames.filter(t => !oldTagNames.includes(t));
      removed.forEach(t => removeGlobalTag(t));
      added.forEach(t => addGlobalTag(t));

      return prev.map(item => {
        const key = item.source?.url || item.source?.base_key || '';
        if (key === assetId) {
          return {
            ...item,
            source: { ...item.source, tags: latestTags },
          };
        }
        return item;
      });
    });
  }, [removeGlobalTag, addGlobalTag]);

  // ─── V2 批量打标签：编排（放在 getHeaders 之后以避免 TDZ） ────────
  // 注：searchQueryRefForBatch 已在前面（L605 附近）声明，这里复用。

  const { executeBatch } = useBatchTagger({
    getHeaders,
    apiUrl,
    searchQueryRef: searchQueryRefForBatch,
  });

  // 获取当前被选中的资产对象列表
  const getSelectedAssets = useCallback(() => {
    const list = resultsRef.current || [];
    const ids = selectedItemsRef.current;
    return list.filter(r => {
      const id = r?.id || r?.source?.base_key || r?.source?.url;
      return ids.has(id);
    });
  }, []);

  const handleOpenBatchModal = useCallback(() => {
    if (selectedItemsRef.current.size === 0) return;
    setIsBatchModalOpen(true);
  }, []);

  // 先声明 ref 占位，稍后赋值（因为 runBatch 会 reference handleUndoBatchRef）
  const handleUndoBatchRef = useRef(null);

  // 实际执行批量的函数（供确认/重做/重试共用）
  const runBatch = useCallback((params) => {
    const { items, tagName, mode = 'add', onAllDoneExtra } = params;
    if (!Array.isArray(items) || items.length === 0) return;

    setBatchProgress({ current: 0, total: items.length, failedCount: 0, currentItemName: '' });
    setBatchFailedItems([]);

    // 把搜索对象转成 BatchTagger items
    const batchItems = items.map(r => ({
      assetUrl: r?.source?.url || r?.source?.base_key || r?.id,
      serverUrl: nucleusServerUrl, // [Tag Deploy Fix - 防线 1] 用真实 nucleus host，不再传空串
      displayName: (r?.source?.base_key || r?.source?.url || r?.id || '').split('/').pop(),
      existingTags: Array.isArray(r?.source?.tags) ? r.source.tags : undefined,
    }));

    executeBatch({
      items: batchItems,
      tagName,
      mode,
      onProgress: ({ done, total, item, result, reason }) => {
        setBatchProgress(prev => ({
          current: done,
          total,
          failedCount: (prev?.failedCount || 0) + (result === 'failed' ? 1 : 0),
          currentItemName: item?.displayName || '',
        }));
        if (result === 'failed') {
          setBatchFailedItems(prev => [
            ...prev,
            { assetUrl: item?.assetUrl, displayName: item?.displayName, reason },
          ]);
          // U1 持久化到卡片
          setFailedBatchItems(prev => {
            const next = new Map(prev);
            next.set(item?.assetUrl, { reason, timestamp: Date.now() });
            setTimeout(() => {
              setFailedBatchItems(p => {
                const n = new Map(p);
                n.delete(item?.assetUrl);
                return n;
              });
            }, 30 * 60 * 1000);
            return next;
          });
        } else if (result === 'success') {
          setFailedBatchItems(prev => {
            if (!prev.has(item?.assetUrl)) return prev;
            const next = new Map(prev);
            next.delete(item?.assetUrl);
            return next;
          });
        }
      },
      onComplete: (result) => {
        setTimeout(() => setBatchProgress(null), 1500);
        if (onAllDoneExtra) onAllDoneExtra(result);

        if (mode === 'add') {
          setLastBatchResult({
            tagName,
            successItems: result.success.map(s => items.find(r => {
              const u = r?.source?.url || r?.source?.base_key || r?.id;
              return u === s.assetUrl;
            })).filter(Boolean),
            mode,
          });

          const successCount = result.success.length;
          if (successCount > 0) {
            setUndoToastState({
              message: (t('batchTagDoneToast', { count: successCount, tag: tagName })
                || `已为 ${successCount} 个资产打上 "${tagName}"`),
              actionLabel: t('batchTagUndo') || '撤销',
              durationMs: 10000,
              onAction: () => handleUndoBatchRef.current?.(),
              variant: 'default',
            });
          } else {
            setUndoToastState(null);
          }
        }
      },
    });
  }, [executeBatch, t]);

  // 撤销：对 lastBatchResult 反向操作
  const handleUndoBatch = useCallback(() => {
    if (!lastBatchResult || lastBatchResult.mode !== 'add') return;
    const { tagName, successItems } = lastBatchResult;
    setUndoToastState(null);
    runBatch({
      items: successItems,
      tagName,
      mode: 'remove',
      onAllDoneExtra: (undoResult) => {
        const undoneCount = undoResult.success.length;
        if (undoneCount > 0) {
          setUndoToastState({
            message: (t('batchTagUndoneToast', { count: undoneCount }) || `已撤销 ${undoneCount} 项`),
            actionLabel: t('batchTagRedo') || '重做',
            durationMs: 5000,
            variant: 'neutral',
            onAction: () => {
              setUndoToastState(null);
              runBatch({ items: successItems, tagName, mode: 'add' });
            },
          });
        }
      },
    });
  }, [lastBatchResult, runBatch, t]);
  useEffect(() => { handleUndoBatchRef.current = handleUndoBatch; }, [handleUndoBatch]);

  const handleBatchRetry = useCallback((failedItem) => {
    const failedList = failedItem ? [failedItem] : batchFailedItems;
    if (!failedList || failedList.length === 0) return;
    const list = resultsRef.current || [];
    const itemsToRetry = failedList
      .map(f => list.find(r => (r?.source?.url || r?.source?.base_key || r?.id) === f.assetUrl))
      .filter(Boolean);
    if (itemsToRetry.length === 0 || !lastBatchResult?.tagName) return;
    runBatch({ items: itemsToRetry, tagName: lastBatchResult.tagName, mode: 'add' });
  }, [batchFailedItems, lastBatchResult, runBatch]);

  const handleRetryFailedFromCard = useCallback((resultObj) => {
    const url = resultObj?.source?.url || resultObj?.source?.base_key || resultObj?.id;
    const tagName = lastBatchResult?.tagName;
    if (!url || !tagName) return;
    runBatch({ items: [resultObj], tagName, mode: 'add' });
  }, [lastBatchResult, runBatch]);

  const handleBatchConfirm = useCallback(({ tagName, items }) => {
    setIsBatchModalOpen(false);
    runBatch({ items, tagName, mode: 'add' });
  }, [runBatch]);

  // ─── V2 键盘快捷键（E5 + U4 + U7） ──────────────────────────────
  const selectVisible = useCallback(() => {
    try {
      const cards = document.querySelectorAll('[data-card-index]');
      const visible = [];
      const viewportH = window.innerHeight || document.documentElement.clientHeight;
      cards.forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.bottom > 0 && r.top < viewportH) {
          const idx = parseInt(el.dataset.cardIndex, 10);
          if (!Number.isNaN(idx)) visible.push(idx);
        }
      });
      const list = resultsRef.current || [];
      const next = new Set(selectedItemsRef.current);
      visible.forEach(i => {
        const r = list[i];
        const id = r?.id || r?.source?.base_key || r?.source?.url;
        if (id) next.add(id);
      });
      setSelectedItems(next);
    } catch (_) { /* noop */ }
  }, []);

  const selectAllResults = useCallback(() => {
    // [UX Polish R2] 全选以"当前屏幕可见资产"（tag 过滤后）为准
    const list = tagFilteredResultsRef.current || [];
    const next = new Set();
    list.forEach(r => {
      const id = r?.id || r?.source?.base_key || r?.source?.url;
      if (id) next.add(id);
    });
    setSelectedItems(next);
  }, []);

  useKeyboardShortcuts({
    isMultiSelectMode: () => selectedItemsRef.current.size > 0,
    isBatchModalOpen: () => isBatchModalOpen,
    selectVisible,
    selectAll: selectAllResults,
    clearSelection,
    openBatchModal: handleOpenBatchModal,
  });

  const fetchPluginsInfo = async () => {
    try {
      setPlugins(prev => ({ ...prev, isLoading: true }));
      const headers = getHeaders();
      
      const response = await fetch(`${apiUrl}/info/plugins`, { headers });
      if (response.status === 200) {
        const data = await response.json();
        const activePlugins = [];
        const inactivePlugins = [];
        
        data.forEach(plugin => {
          if (plugin.name) {
            const pluginInfo = {
              name: plugin.name,
              active: plugin.active || false,
              description: plugin.description || null
            };
            
            if (pluginInfo.active) {
              activePlugins.push(pluginInfo);
            } else {
              inactivePlugins.push(pluginInfo);
            }
          }
        });
        
        setPlugins({
          active: activePlugins,
          inactive: inactivePlugins,
          isLoading: false
        });
      } else {
        setPlugins(prev => ({ ...prev, isLoading: false }));
      }
    } catch (err) {
      console.error("Error fetching plugins info:", err);
      setPlugins(prev => ({ ...prev, isLoading: false }));
    }
  };

  const fetchBackendInfo = async () => {
    try {
      const headers = getHeaders();
      
      const response = await fetch(`${apiUrl}/info/backend/storage`, { headers });
      if (response.status === 200) {
        const data = await response.json();
        setBackend(Object.keys(data.backends).join(', '));
      } else {
        // Backend info fetch returned non-200 status
      }
    } catch (err) {
      console.error("Error fetching backend info:", err);
    }
  };

  // Re-indexing functions
  // [TagSearchFix] 改为内部调用 reindexService.triggerReindexNow（toast 模式），
  // 自动补齐 refresh_tags/refresh_metadata/refresh_plugins=true 参数；外部调用签名不变。
  const triggerReindexAllPlugins = useCallback(async (url) => {
    const res = await triggerReindexNowApi(apiUrl, url, getHeaders, {
      silent: false,
      poll: false, // 全资产 reindex 较慢，不阻塞 toast 反馈
    });
    if (res.status === 401) {
      toast({
        title: t('loginRequired'),
        description: t('loginRequiredDescription'),
        status: "warning",
        duration: 8000,
        isClosable: true,
      });
    } else if (res.success || res.status === 200) {
      toast({
        title: t('reindexingStarted'),
        description: t('allPluginsReindex'),
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    } else {
      console.error("Error triggering re-index:", res);
      toast({
        title: t('error'),
        description: t('failedTriggerReindex'),
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  }, [apiUrl, getHeaders, toast, t]);

  const triggerReindexIndividualPlugin = useCallback(async (url, pluginName) => {
    // 单 plugin 路径：附加 plugins 参数。reindexService 默认只带通用参数，这里直接 fetch 以保留 plugin 维度。
    try {
      const headers = getHeaders();
      const params = new URLSearchParams();
      params.append('url', url);
      params.append('plugins', pluginName);
      params.append('refresh_tags', 'true');
      params.append('refresh_metadata', 'true');
      params.append('refresh_plugins', 'true');
      
      const response = await fetch(`${apiUrl}/process/asset?${params.toString()}`, {
        method: "GET",
        headers: headers
      });
      
      if (response.status === 401) {
        showUnauthorizedToast();
      } else if (response.ok) {
        toast({
          title: t('reindexingStarted'),
          description: t('pluginReindex', { pluginName }),
          status: "success",
          duration: 3000,
          isClosable: true,
        });
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (err) {
      console.error("Error triggering plugin re-index:", err);
      toast({
        title: t('error'),
        description: t('failedPluginReindex', { pluginName }),
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  }, [apiUrl, getHeaders, showUnauthorizedToast, toast, t]);

  // Refs for feedback state to remove from callback dependency arrays
  const feedbackDismissedRef = useRef(feedbackDismissed);
  feedbackDismissedRef.current = feedbackDismissed;
  const feedbackShownThisSessionRef = useRef(feedbackShownThisSession);
  feedbackShownThisSessionRef.current = feedbackShownThisSession;
  const showFeedbackPopupRef = useRef(showFeedbackPopup);
  showFeedbackPopupRef.current = showFeedbackPopup;

  // Helper function to handle feedback after successful search
  // Uses refs to avoid recreating callback when feedback state changes
  const handleSearchComplete = useCallback(() => {
    // Only handle feedback if feature is enabled
    if (!FEATURE_FLAGS.ENABLE_FEEDBACK_MODAL) return;
    
    // Increment search counter using functional update
    setSearchCount(prev => {
      const newCount = prev + 1;
      localStorage.setItem('searchCount', newCount.toString());
      
      // Check if we should show feedback popup (only if not already shown in this session)
      if (newCount >= 10 && !feedbackDismissedRef.current && !feedbackShownThisSessionRef.current && !showFeedbackPopupRef.current) {
        setFeedbackShownThisSession(true);
        setShowFeedbackPopup(true);
      }
      return newCount;
    });
  }, []); // No dependencies — all state reads go through refs

  // Refs for values used in handleFindSimilar to reduce dependency chain
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;
  const sortByRef = useRef(sortBy);
  sortByRef.current = sortBy;
  const hybridConfigRef = useRef(hybridConfig);
  hybridConfigRef.current = hybridConfig;
  const embeddingConfigRef = useRef(embeddingConfig);
  embeddingConfigRef.current = embeddingConfig;

  const handleFindSimilar = useCallback(async (assetUrl) => {
    // Clear text search and set up image search using the asset URL
    setSearchQuery("");
    setLastSearchQuery(""); // Clear the last search query since this is a similarity search
    setImageBase64(""); // Clear any existing image
    
    // Store the asset information for display
    const filename = assetUrl?.split('/').pop() || 'Unknown Asset';
    setSimilarSearchAsset({
      url: assetUrl,
      filename: filename
    });
    
    // Read from refs to avoid dependency on frequently-changing values
    const currentSearchParams = searchParamsRef.current;
    const currentHybridConfig = hybridConfigRef.current;
    const currentEmbeddingConfig = embeddingConfigRef.current;
    
    // Trigger image search using the asset URL
    // We'll use the vector_queries with the asset URL instead of base64
    const requestBody = {
      limit: getApiLimit(
        parseInt(currentSearchParams.limit),
        {
          showOnlyWithPreviews,
          fileExtensionExclude: currentSearchParams.file_extension_exclude || '',
        }
      ),
      return_images: true,
      return_metadata: true,
      return_vision_generated_metadata: true,
      return_usd_properties: true,
      return_usd_dimensions: true,
      return_tags: true,
      
      // Hybrid search configuration
      scoring_config: currentHybridConfig,
      
      // Vector queries using asset URL for image similarity
      vector_queries: [{
        field_name: currentEmbeddingConfig.field_name,
        query_type: "image",
        query: assetUrl
      }],
      
      // Legacy filters
      ...Object.fromEntries(
        Object.entries(currentSearchParams).filter(([_, value]) => value !== "" && value !== null && value !== undefined)
      ),
    };

    // bbox 参数转 float
    ['min_bbox_x', 'max_bbox_x', 'min_bbox_y', 'max_bbox_y', 'min_bbox_z', 'max_bbox_z'].forEach(key => {
      if (key in requestBody) {
        const num = parseFloat(requestBody[key]);
        if (!isNaN(num)) requestBody[key] = num; else delete requestBody[key];
      }
    });

    // === [calvingu 2026-05-13] limit 鲁棒覆盖 (Similar search 路径) ===
    // 与主搜索同根 bug：spread currentSearchParams 会用原始 limit 覆盖过采样值。
    // 在 fetch 前最后一次显式赋值兜底。
    requestBody.limit = getApiLimit(
      parseInt(currentSearchParams.limit),
      {
        showOnlyWithPreviews,
        fileExtensionExclude: currentSearchParams.file_extension_exclude || '',
      }
    );

    // Clear existing results and start loading
    setIsLoading(true);
    setResults([]);
    
    // Clear active image requests to allow retries on new search
    const { clearActiveRequests } = await import('./utils/imageLoader');
    clearActiveRequests();
    
    // Update URL after state changes
    setTimeout(() => serializeToURL(), 0);

    // Perform the search
    fetch(`${apiUrl}/search_hybrid`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(requestBody),
    })
      .then(response => {
        if (response.status === 401) {
          toast({
            title: t('loginRequired'),
            description: t('loginRequiredDescription'),
            status: "warning",
            duration: 8000,
            isClosable: true,
          });
          setIsLoading(false);
          return Promise.reject(new Error('__auth_required__'));
        }
        if (response.status === 422) {
          // 422 通常是筛选条件导致无法处理，友好提示用户
          toast({
            title: t('noResultsFound') || '未搜到结果',
            description: t('similarSearch422Hint') || '当前筛选条件下无匹配结果，请尝试清除筛选条件后重试',
            status: "warning",
            duration: 5000,
            isClosable: true,
          });
          setIsLoading(false);
          return Promise.reject(new Error('__no_results__'));
        }
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.hits) {
          setResults(data.hits);
        } else {
          setResults(data || []);
        }

        // Handle feedback popup after successful search
        handleSearchComplete();

        if (data.total === 0 || (Array.isArray(data) && data.length === 0)) {
          toast({
            title: t('noSimilarAssetsFound'),
            description: t('adjustSearchConfig'),
            status: "info",
            duration: 3000,
          });
        } else {
          toast({
            title: t('similarAssetsFound'),
            description: t('foundSimilarAssets', { count: data.hits?.length || data.length }),
            status: "success",
            duration: 3000,
          });
        }
      })
      .catch(error => {
        if (error.message === '__auth_required__' || error.message === '__no_results__') return;
        console.error("Similar search error:", error);
        toast({
          title: t('similarSearchFailed'),
          description: error.message,
          status: "error",
          duration: 5000,
        });
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [apiUrl, getHeaders, serializeToURL, handleSearchComplete, toast, t, showOnlyWithPreviews]);

  // Image handling
  const handleFileChange = useCallback((e) => {
    const file = e.target.files[0];
    if (file) {
      // Reset the input value so re-selecting the same file still triggers onChange
      e.target.value = "";
      setImageName(file.name || "image");
      // 校验文件大小 >10MB
      if (file.size > 10 * 1024 * 1024) {
        setImageError(t('imageTooLarge') || '图片过大(>10MB)，请压缩后重试');
        setImageBase64(""); // 不加载过大的图片
        return;
      }
      setImageError("");
      const reader = new FileReader();
      reader.onload = (event) => {
        setImageBase64(event.target.result);
        setSimilarSearchAsset(null);
      };
      reader.readAsDataURL(file);
    }
  }, [t]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      setImageName(file.name || "image");
      // 校验文件大小 >10MB
      if (file.size > 10 * 1024 * 1024) {
        setImageError(t('imageTooLarge') || '图片过大(>10MB)，请压缩后重试');
        setImageBase64("");
        return;
      }
      setImageError("");
      const reader = new FileReader();
      reader.onload = (event) => {
        setImageBase64(event.target.result);
        setSimilarSearchAsset(null);
      };
      reader.readAsDataURL(file);
    }
  }, [t]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);

  // Paste image from clipboard (triggered by right-click context menu)
  const handlePaste = useCallback(async (e) => {
    e.preventDefault();
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find(type => type.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          setImageName("clipboard_image." + (imageType.split('/')[1] || 'png'));
          // 校验文件大小 >10MB
          if (blob.size > 10 * 1024 * 1024) {
            setImageError(t('imageTooLarge') || '图片过大(>10MB)，请压缩后重试');
            setImageBase64("");
            return;
          }
          setImageError("");
          const reader = new FileReader();
          reader.onload = (event) => {
            setImageBase64(event.target.result);
            setSimilarSearchAsset(null);
          };
          reader.readAsDataURL(blob);
          return;
        }
      }
      // No image found in clipboard
      toast({
        title: t('pasteNoImage'),
        status: "warning",
        duration: 3000,
      });
    } catch (err) {
      console.error("Failed to read clipboard:", err);
      toast({
        title: t('pasteFailed'),
        description: t('pasteFailedDescription'),
        status: "error",
        duration: 3000,
      });
    }
  }, [toast, t]);

  // Remove duplicates handler
  const handleRemoveDuplicatesChange = useCallback((e) => {
    const isChecked = e.target.checked;
    setSearchParams(prev => ({
      ...prev,
      deduplicate_by_hash: isChecked,
    }));
  }, []);

  const handleClearImage = useCallback(() => {
    setImageBase64("");
    setImageName("");
    setImageError("");
    setSimilarSearchAsset(null);
    sessionStorage.removeItem('search_image_base64');
    // 清除图片后自动触发搜索，回到浏览全部模式
    setTimeout(() => handleSearchRef.current?.(), 100);
  }, []);

  // === LM CUSTOMIZATION: Sync image state with TopSearchBar START ===
  // 监听从 TopSearchBar 上传/清除的图片
  useEffect(() => {
    const handleTopImage = (e) => {
      const base64 = e.detail?.imageBase64 || '';
      const name = e.detail?.imageName || '';
      const error = e.detail?.imageError || '';
      setImageBase64(base64);
      setImageName(name);
      setImageError(error);
      if (base64) {
        setSimilarSearchAsset(null);
      }
    };
    window.addEventListener('top-image-uploaded', handleTopImage);
    return () => window.removeEventListener('top-image-uploaded', handleTopImage);
  }, []);

  // 当 imageBase64 变化时通知 TopSearchBar 更新缩略图
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('image-state-synced', {
      detail: { imageBase64: imageBase64 || '' }
    }));
  }, [imageBase64]);

  // TopSearchBar 挂载后主动请求当前图片状态
  useEffect(() => {
    const handleRequestImageState = () => {
      window.dispatchEvent(new CustomEvent('image-state-synced', {
        detail: { imageBase64: imageBase64 || '' }
      }));
    };
    window.addEventListener('request-image-state', handleRequestImageState);
    return () => window.removeEventListener('request-image-state', handleRequestImageState);
  });
  // === LM CUSTOMIZATION: Sync image state with TopSearchBar END ===

  // Search handling
  const handleSearch = useCallback(async () => {
    // === LM CUSTOMIZATION: 搜索时自动退出多选 ===
    // 搜索是典型的"结果集整体重置"场景（新搜索词 → 大概率新结果集），此前的选中项在新结果里很可能不可见，
    // 继续保留多选模式会让用户看到"已选中 N 个资产"的 Bar 但找不到它们（幽灵选中），体验割裂。
    // 统一在 handleSearch 入口清一次：无选中时幂等无副作用；URL 恢复/首次加载等走该入口也安全。
    clearSelectionRef.current?.();

    // === LM CUSTOMIZATION: Search/Tag decoupling v4 — committedQuery 仅作快照，不再清空搜索框 ===
    // 把输入框当前文本固化为 committedQuery（供大标题使用），但保留搜索框文字不变——
    // 与 Fab/Google 一致：回车后搜索词仍留在输入框里，光标由 TopSearchBar 做 select()。
    const liveQuery = (searchQueryRef.current || '').trim();
    if (liveQuery !== (committedQueryRef.current || '')) {
      committedQueryRef.current = liveQuery;
      setCommittedQuery(liveQuery);
    }

    // buildSearchPayload 把 committedQuery / searchQuery / categoryTag / selectedTags 四路合并成
    // 当前后端能消费的 q 字符串。未来后端就绪后只改 buildSearchPayload。
    // 注：committedQuery 此刻已是 liveQuery，searchQuery 一并传入时会被 trim+dedup 效果等价。
    const payload = buildSearchPayload({
      committedQuery: liveQuery,
      // searchQuery 与 committedQuery 在 v4 里通常相同，不再重复传避免 q 中出现"abc abc"
      searchQuery: '',
      categoryTag: categoryTagRef.current,
      selectedTags: selectedTagsRef.current,
    });
    const currentQuery = payload.q;
    const currentImage = imageBase64Ref.current;
    const currentSearchParams = searchParamsRef.current;
    const currentHybridConfig = hybridConfigRef.current;
    const currentEmbeddingConfig = embeddingConfigRef.current;

    setIsLoading(true);
    setSimilarSearchAsset(null); // Clear similar search when doing regular search
    setLastSearchQuery(currentQuery); // Store the query being used for this search
    
    // === LM CUSTOMIZATION: InfinitePagination START ===
    // 原因：新搜索发起时 abort 旧请求（覆盖验收 TC-D5），同时重置第 1 层 userLimit、清理加载更多状态。
    // 合入上游新版时：本块仅插在 handleSearch 顶部，与下游 fetch 逻辑不交叉。
    if (searchAbortRef.current) {
      try { searchAbortRef.current.abort(); } catch (_) { /* noop */ }
    }
    const _abortCtrl = new AbortController();
    searchAbortRef.current = _abortCtrl;
    // 第 1 层 userLimit 重置（需求 D-1.3：切搜索词重置 page=1）
    setUserLimit(parseInt(currentSearchParams.limit) || DEFAULT_SEARCH_PARAMS.limit);
    setIsLoadingMore(false);
    setLoadMoreError(null);
    // === LM CUSTOMIZATION: InfinitePagination END ===
    
    // Clear active image requests to allow retries on new search
    const { clearActiveRequests } = await import('./utils/imageLoader');
    clearActiveRequests();
    
    // Update URL with the current search parameters, but don't trigger a backend change
    serializeToURL();

    // [calvingu 2026-05-14 Round4] 浏览模式判定（空 query + 空 image）。
    // 浏览模式下后端命中率仅 31%（实测），需走 getApiLimit 的浏览模式分支
    // 拉大 limit 单次请求拿到全集，避免「打 tag 后假性消失 50→49」。
    const isBrowseMode = !currentQuery && !currentImage;

    try {
      // Build the V3 API request
      const requestBody = {
        // Basic search parameters
        limit: getApiLimit(
          parseInt(currentSearchParams.limit),
          {
            showOnlyWithPreviews,
            fileExtensionExclude: currentSearchParams.file_extension_exclude || '',
          },
          { isBrowseMode }
        ),
        return_images: true,
        return_metadata: true,
        return_vision_generated_metadata: true,
        return_usd_properties: true,
        return_usd_dimensions: true,
        return_tags: true,
        
        // === LM CUSTOMIZATION: 空 query 时使用浏览模式（不发 text/vector query） ===
        ...(currentQuery ? {
          // 有搜索词：正常 hybrid 搜索
          scoring_config: currentHybridConfig,
          hybrid_text_query: currentQuery,
        } : {
          // 无搜索词：浏览全部产品模式（仅靠 file_extension_include 获取所有正常资产）
          ...(currentImage ? { scoring_config: currentHybridConfig } : {}),
          // [calvingu 2026-05-14 Round3] 默认 include 仅在用户未设时生效
          //   原因：之前硬编码 'uasset,fbx' 会在 spread 之后被用户的 include 覆盖
          //   （后写覆盖前写）—— 但因为 file_extension_include 之前在 clientOnlyFields
          //   不会发后端，导致硬编码值 'uasset,fbx' 始终生效，用户筛选 .png/.jpg 完全无效。
          //   现在 file_extension_include 会发后端，spread 顺序也保证用户的会覆盖默认值。
          //   保留默认值是为了：用户清空 include 时，浏览模式仍只展示 uasset/fbx 主资产（避免一上来就堆满 jpg/png 缩略图）。
          ...(currentSearchParams.file_extension_include
            ? {} // 用户已设 include → 由 spread 自然带上，不用默认
            : { file_extension_include: 'uasset,fbx' }),
        }),
        
        // Vector queries (for image and text-to-vector search)
        vector_queries: (() => {
          const vectorQueries = [];
          
          // Add image vector query if present
          if (currentImage) {
            vectorQueries.push({
              field_name: currentEmbeddingConfig.field_name,
              query_type: "image",
              query: currentImage.split(",")[1] // Remove data URL prefix
            });
          }
          
          // Add text-to-vector queries if we have a text query
          if (currentQuery) {
            if (currentHybridConfig.vector_text_expansion?.enabled) {
              // With expansion enabled: send full query + individual words (avoid duplicates)
              const words = currentQuery.trim().split(/\s+/).filter(word => word.length > 0);
              
              // Always add the full query
              vectorQueries.push({
                field_name: currentEmbeddingConfig.field_name,
                query_type: "text",
                query: currentQuery
              });
              
              // Add individual words only if there are multiple words
              if (words.length > 1) {
                words.forEach(word => {
                  vectorQueries.push({
                    field_name: currentEmbeddingConfig.field_name,
                    query_type: "text",
                    query: word
                  });
                });
              }
            } else {
              // With expansion disabled: send only the full query
              vectorQueries.push({
                field_name: currentEmbeddingConfig.field_name,
                query_type: "text",
                query: currentQuery
              });
            }
          }
          
          return vectorQueries;
        })(),
        
        // Legacy filters (exclude client-side-only filter fields that backend handles incorrectly)
        ...Object.fromEntries(
          Object.entries(currentSearchParams).filter(([key, value]) => {
            if (value === "" || value === null || value === undefined) return false;
            // [calvingu 2026-05-14 Round3] file_extension_include/exclude 改为发后端
            //   原因：之前列入 clientOnlyFields → 后端按"无任何 ext 限制"返回 →
            //   样本量不变，客户端只能在固定样本里二次过滤，导致：
            //   - 浏览模式下后端硬编码 'uasset,fbx' 始终生效，用户改 include 无效
            //   - 用户切换 .png/.jpg 筛选 → 客户端样本里没 png/jpg → 0 结果
            //   Similar search 路径（~1805 行）一直全发包含 ext 字段，所以后端是支持的。
            const clientOnlyFields = [
              'limit', // limit 已由 getApiLimit 过采样计算，不要从 searchParams 覆盖
              'file_name', 'exclude_file_name', 'similarity_threshold', 'cutoff_threshold',
              'file_size_greater_than', 'file_size_less_than',
              // 'file_extension_include', 'file_extension_exclude', // ← 已移出，发给后端真正过滤
              'created_after', 'created_before', 'modified_after', 'modified_before',
              'created_by', 'exclude_created_by', 'modified_by', 'exclude_modified_by',
              'search_path', 'exclude_search_path', 'search_in_scene', 'filter_url_regexp',
            ];
            return !clientOnlyFields.includes(key);
          })
        ),
      };

      // Remove empty or default values
      Object.keys(requestBody).forEach(key => {
        if (requestBody[key] === "" || requestBody[key] === null || requestBody[key] === undefined) {
          delete requestBody[key];
        }
      });

      // bbox 参数需要转为 float（后端 API 要求 float 类型）
      const bboxKeys = ['min_bbox_x', 'max_bbox_x', 'min_bbox_y', 'max_bbox_y', 'min_bbox_z', 'max_bbox_z'];
      bboxKeys.forEach(key => {
        if (key in requestBody && requestBody[key] !== undefined) {
          const num = parseFloat(requestBody[key]);
          if (!isNaN(num)) {
            requestBody[key] = num;
          } else {
            delete requestBody[key];
          }
        }
      });
      // 浏览模式（空 query）：移除 file_extension_exclude 避免与 include 冲突
      if (isBrowseMode && requestBody.file_extension_include) {
        delete requestBody.file_extension_exclude;
      }

      // === [calvingu 2026-05-13] limit 鲁棒覆盖 (位置无关) ===
      // 防御 spread 顺序 / clientOnlyFields 漏项 / webpack 缓存等历史踩坑：
      // 在 fetch 前最后一次显式赋值，确保 requestBody.limit === 过采样后的 apiLimit。
      // 任何上面的 spread / Object.fromEntries 都不会再覆盖这一行。
      // [Round4] 同步透传 isBrowseMode，让浏览模式走大 limit 分支。
      requestBody.limit = getApiLimit(
        parseInt(currentSearchParams.limit),
        {
          showOnlyWithPreviews,
          fileExtensionExclude: currentSearchParams.file_extension_exclude || '',
        },
        { isBrowseMode }
      );

      const response = await fetch(`${apiUrl}/search_hybrid`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(requestBody),
        // === LM CUSTOMIZATION: InfinitePagination START ===
        // signal: 让本次请求可被后续搜索 abort（需求 D、验收 TC-D5）。
        signal: _abortCtrl.signal,
        // === LM CUSTOMIZATION: InfinitePagination END ===
      });

      if (response.status === 401) {
        toast({
          title: t('loginRequired'),
          description: t('loginRequiredDescription'),
          status: "warning",
          duration: 8000,
          isClosable: true,
        });
        setIsLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Handle V3 response format
      const hits = data.hits || data || [];

      // [Oversample Shortage 告警] 仅在过采样后 hits 仍凑不齐 userLimit 时打 warn，
      // 用于提示开发者把 oversample.js 的 BACKEND_RECALL_COMPENSATION 调高。
      // 平时不打日志，避免污染控制台。
      const _userLimit = parseInt(currentSearchParams.limit);
      if (hits.length < _userLimit && (data.total || 0) > _userLimit * 2) {
        console.warn(
          `⚠️ [Oversample Shortage] hits (${hits.length}) < userLimit (${_userLimit})，data.total=${data.total}。` +
          ' 建议把 oversample.js 的 BACKEND_RECALL_COMPENSATION 再调高。'
        );
      }

      // === LM CUSTOMIZATION: 客户端过滤（后端暂不支持筛选参数执行） ===
      const filteredHits = (() => {
        let result = hits;
        const params = currentSearchParams;

        // 文件名包含
        if (params.file_name) {
          const terms = params.file_name.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
          if (terms.length) {
            result = result.filter(h => {
              const name = (h.source?.name || h.source?.base_key || '').toLowerCase();
              return terms.some(t => name.includes(t));
            });
          }
        }
        // 文件名排除
        if (params.exclude_file_name) {
          const terms = params.exclude_file_name.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
          if (terms.length) {
            result = result.filter(h => {
              const name = (h.source?.name || h.source?.base_key || '').toLowerCase();
              return !terms.some(t => name.includes(t));
            });
          }
        }
        // 扩展名包含
        if (params.file_extension_include) {
          const exts = params.file_extension_include.split(',').map(s => s.trim().toLowerCase().replace(/^\./, '')).filter(Boolean);
          if (exts.length) {
            result = result.filter(h => {
              const ext = (h.source?.ext || '').toLowerCase();
              return exts.some(e => {
                if (e.includes('*')) { const re = new RegExp('^' + e.replace(/\*/g, '.*') + '$'); return re.test(ext); }
                return ext === e;
              });
            });
          }
        }
        // 扩展名排除
        if (params.file_extension_exclude) {
          const exts = params.file_extension_exclude.split(',').map(s => s.trim().toLowerCase().replace(/^\./, '')).filter(Boolean);
          if (exts.length) {
            result = result.filter(h => {
              const ext = (h.source?.ext || '').toLowerCase();
              if (!ext) return true; // 没有扩展名的保留
              return !exts.some(e => {
                if (e.includes('*')) {
                  const re = new RegExp('^' + e.replace(/\*/g, '.*') + '$');
                  // 保护 uasset/fbx 等主要 3D 资产格式不被 usd* 等通配符误杀
                  if (e.startsWith('usd') && (ext === 'uasset' || ext === 'fbx')) return false;
                  return re.test(ext);
                }
                return ext === e;
              });
            });
          }
        }
        // 路径包含
        if (params.search_path) {
          const paths = params.search_path.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
          if (paths.length) {
            result = result.filter(h => {
              const p = (h.source?.path || h.source?.base_key || '').toLowerCase();
              return paths.some(t => p.includes(t));
            });
          }
        }
        // 路径排除
        if (params.exclude_search_path) {
          const paths = params.exclude_search_path.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
          if (paths.length) {
            result = result.filter(h => {
              const p = (h.source?.path || h.source?.base_key || '').toLowerCase();
              return !paths.some(t => p.includes(t));
            });
          }
        }
        // 文件大小过滤（用户输入单位为 KB，source.size 单位为 bytes）
        if (params.file_size_greater_than) {
          const minSizeKB = parseFloat(params.file_size_greater_than);
          if (!isNaN(minSizeKB)) result = result.filter(h => (h.source?.size || 0) >= minSizeKB * 1024);
        }
        if (params.file_size_less_than) {
          const maxSizeKB = parseFloat(params.file_size_less_than);
          if (!isNaN(maxSizeKB)) result = result.filter(h => (h.source?.size || Infinity) <= maxSizeKB * 1024);
        }
        // 日期过滤（created 与 modified 为 OR 关系，满足其一即显示）
        {
          const hasAfter = params.modified_after || params.created_after;
          const hasBefore = params.modified_before || params.created_before;
          if (hasAfter || hasBefore) {
            result = result.filter(h => {
              const mt = h.source?.modified_timestamp || '';
              const ct = h.source?.created_timestamp || '';
              // after 条件：modified >= after OR created >= after
              if (hasAfter) {
                const afterDate = params.modified_after || params.created_after;
                const passModified = mt && mt >= afterDate;
                const passCreated = ct && ct >= afterDate;
                if (!passModified && !passCreated) return false;
              }
              // before 条件：modified <= before OR created <= before
              if (hasBefore) {
                const beforeDate = (params.modified_before || params.created_before) + 'T23:59:59';
                const passModified = mt && mt <= beforeDate;
                const passCreated = ct && ct <= beforeDate;
                if (!passModified && !passCreated) return false;
              }
              return true;
            });
          }
        }
        // 用户过滤
        if (params.created_by) {
          const users = params.created_by.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
          if (users.length) {
            result = result.filter(h => users.includes((h.source?.created_by || '').toLowerCase()));
          }
        }
        if (params.modified_by) {
          const users = params.modified_by.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
          if (users.length) {
            result = result.filter(h => users.includes((h.source?.modified_by || '').toLowerCase()));
          }
        }
        // === LM CUSTOMIZATION: 精度过滤（前端基于 score 百分位过滤） ===
        // 相似度阈值 → 保留 top N% 结果（0.75 = 保留前 75%）
        // 截断阈值 → 最大保留比例（0.5 = 最多保留前 50%），取两者更严格的
        if (result.length > 1 && (params.similarity_threshold || params.cutoff_threshold)) {
          const simThreshold = params.similarity_threshold ? parseFloat(params.similarity_threshold) : 1;
          const cutThreshold = params.cutoff_threshold ? parseFloat(params.cutoff_threshold) : 1;
          
          if (!isNaN(simThreshold) && !isNaN(cutThreshold)) {
            // 取更严格（更小）的比例
            const keepRatio = Math.min(
              simThreshold > 0 && simThreshold < 1 ? simThreshold : 1,
              cutThreshold > 0 && cutThreshold < 1 ? cutThreshold : 1
            );
            
            if (keepRatio < 1) {
              const keepCount = Math.max(1, Math.ceil(result.length * keepRatio));
              if (keepCount < result.length) {
                // 按 score 降序，保留前 keepCount 条
                const sorted = [...result].sort((a, b) => (b.score || 0) - (a.score || 0));
                const keepIds = new Set(sorted.slice(0, keepCount).map(h => h.id));
                result = result.filter(h => keepIds.has(h.id));
              }
            }
          }
        }
        // === LM CUSTOMIZATION: 精度过滤 END ===
        return result;
      })();
      // === LM CUSTOMIZATION: 客户端过滤 END ===

      setResults(filteredHits);

      // === LM CUSTOMIZATION: 搜索完成后按当前排序重排结果 ===
      const currentSort = sortByRef.current;
      if (currentSort && currentSort !== 'relevance') {
        // 延迟一个 tick，等 state 写入后再重排
        setTimeout(() => onSortChange(currentSort), 0);
      }
      // === LM CUSTOMIZATION: Sort after search END ===

      // Handle feedback popup after successful search
      handleSearchComplete();

      if (data.total === 0 || (Array.isArray(data) && data.length === 0)) {
        toast({
          title: t('noResultsFound'),
          description: t('adjustSearchTerms'),
          status: "info",
          duration: 3000,
        });
      }

    } catch (error) {
      // === LM CUSTOMIZATION: InfinitePagination START ===
      // AbortError 是我们主动 abort 旧请求造成的，不弹 toast / 不记录错误（需求 D、验收 TC-D5）。
      if (error?.name === 'AbortError') {
        return; // 静默退出，不走下方 toast
      }
      // === LM CUSTOMIZATION: InfinitePagination END ===
      console.error("Search error:", error);
      toast({
        title: t('searchFailed'),
        description: error.message,
        status: "error",
        duration: 5000,
      });
    } finally {
      // === LM CUSTOMIZATION: InfinitePagination START ===
      // 收尾清理：仅在当前请求仍是本调用发起者时才重置 isLoadingMore，
      // 避免"后续搜索已接管但旧 finally 最后执行"导致 isLoadingMore 错误关闭。
      if (searchAbortRef.current === _abortCtrl) {
        setIsLoadingMore(false);
      }
      // === LM CUSTOMIZATION: InfinitePagination END ===
      setIsLoading(false);
    }
  }, [apiUrl, getHeaders, serializeToURL, handleSearchComplete, toast, t, showOnlyWithPreviews]);

  const handleFilterChange = useCallback((e) => {
    const { name, value } = e.target;
    setSearchParams(prev => ({
      ...prev,
      [name]: value
    }));
  }, []);

  const handleClearAllFilters = useCallback(() => {
    setSearchParams({
      ...DEFAULT_SEARCH_PARAMS,
    });
  }, []);

  const handleItemClick = useCallback((item) => {
    // === LM CUSTOMIZATION: Perf-Drawer-FastSwitch START ===
    // 修复"连续点击卡片中间几次无反应"：
    //   v1 实现用 startTransition 包 setSelectedItem，让 click event 立即返回不阻塞。
    //   但带来副作用：低优先级渲染会被后续 click 打断丢弃，连续点击 4 张卡片只渲染最后一张，
    //   用户感知就是"前面几次单击没反应"——Playwright 探针实测复现：4 次 click 派发都成功，
    //   但只有最后 1 次触发 drawer-change DOM 变更。
    //   v2 改为同步 setSelectedItem，让每次 click 都立即更新 Drawer 顶层（资产名/缩略图）。
    //   高级面板和 tags 编辑器在 AssetDetailsDrawer 内已用 useDeferredValue 包裹，
    //   重子树会被 React 调度到低优先级渲染，不阻塞主路径。
    //   onDetailsOpen 同步保证 isOpen 立即生效。
    // 合入英伟达新版时：保留本块；useDeferredValue 是 React 18 标准 API。
    setSelectedItem(item);
    onDetailsOpen();
    // === LM CUSTOMIZATION: Perf-Drawer-FastSwitch END ===
  }, [onDetailsOpen]);

  // === LM CUSTOMIZATION: SelectionInteraction START ===
  // Group A 任务 5：方案 B 单击交互接入。
  // 通过 FEATURE_FLAGS.SINGLE_CLICK_DRAWER 双轨：
  //   - 关闭：保持原版 handleToggleSelection 路径不动，双击打开 Modal（NVIDIA 默认）
  //   - 开启：单击本体 → 打开抽屉；点复选框/Shift/Ctrl → 走真值表（见 SELECTION-SPEC.md）
  // hook 内部识别复选框命中通过 [data-role="card-checkbox"]（CardSelectCheckbox 已加）。
  //
  // 合入英伟达新版时：保留本块即可；旗标关闭即等价于原版逻辑。
  const drawerSelect = useDrawerOrSelect({
    results: visibleResults,
    getId: (item) => item?.id || item?.source?.base_key || item?.source?.url,
    selectedIds: selectedItems,
    setSelectedIds: setSelectedItems,
    onOpenDrawer: handleItemClick,           // 复用同一入口：set selectedItem + onDetailsOpen
    onOpenLegacyModal: handleItemClick,       // 旗标关闭时双击退化也走同一函数
    enabled: FEATURE_FLAGS.NEW_CARD_INTERACTION,
    drawerEnabled: FEATURE_FLAGS.SINGLE_CLICK_DRAWER,
  });

  // 包装：onSelectionChange 在新交互下完全由 hook 接管，
  // 在旧交互下退回原 handleToggleSelection。
  const handleSelectionInteractionV2 = useCallback((item, event /* , index */) => {
    if (FEATURE_FLAGS.SINGLE_CLICK_DRAWER) {
      drawerSelect.handleClick(event, item);
    } else {
      handleToggleSelection(item, event /* , index */);
    }
  }, [drawerSelect, handleToggleSelection]);
  // === LM CUSTOMIZATION: SelectionInteraction END ===

  // Feedback popup handlers (only if feature is enabled)
  const handleFeedbackLater = useCallback(() => {
    if (!FEATURE_FLAGS.ENABLE_FEEDBACK_MODAL) return;
    setShowFeedbackPopup(false);
    setFeedbackShownThisSession(false); // Allow it to show again after more searches
    // Set counter to -15 so it will show again after 25 more searches (25 - 15 = 10)
    setSearchCount(prev => {
      const newCount = prev - 15;
      localStorage.setItem('searchCount', newCount.toString());
      return newCount;
    });
  }, []);

  const handleFeedbackDismiss = useCallback(() => {
    if (!FEATURE_FLAGS.ENABLE_FEEDBACK_MODAL) return;
    setShowFeedbackPopup(false);
    setFeedbackDismissed(true);
    localStorage.setItem('feedbackDismissed', 'true');
  }, []);

  const handleFeedbackSubmit = useCallback(() => {
    if (!FEATURE_FLAGS.ENABLE_FEEDBACK_MODAL) return;
    window.open('https://forms.gle/u2UnicMwyFDtFRZc9', '_blank');
    handleFeedbackDismiss();
  }, [handleFeedbackDismiss]);

  // Stable callback refs for search input to avoid re-renders
  const handleSearchRef = useRef(handleSearch);
  handleSearchRef.current = handleSearch;

  const onSearchInputChange = useCallback((e) => {
    setSearchQuery(e.target.value);
  }, []);

  const onSearchInputKeyDown = useCallback((e) => {
    if (e.key === "Enter") handleSearchRef.current();
  }, []);

  // === LM CUSTOMIZATION: Category sidebar + Top search bar integration START ===
  // 🔥 v4（2026-05 结果区大标题版）：
  //   - 分类选中 → 写入 categoryTag（单值，替换而非追加）；不再混入 selectedTags。
  //   - 分类清除 → 清空 categoryTag；selectedTags 不受影响。
  //   - 顶部搜索框输入 → 只更新 searchQuery（输入框受控）；回车/搜索时 handleSearch 会同步 committedQuery 快照并保留搜索框文字。
  //   - 大标题由 committedQuery + categoryTag 驱动；chip 栏只含用户手动 selectedTags。
  useEffect(() => {
    // 切换分类前若处于多选状态，先清空选中并退出多选——避免视图过滤后选中项不再可见造成的"幽灵选中"
    // 反馈方式：依靠 SelectionModeBar 自身的退场动画 + Badge 脉冲，无 toast 噪音（视觉焦点已在 Bar 上）
    const exitMultiSelectIfActive = () => {
      // 无论是否有选中（size 为 0 也可能停留在 sticky 多选模式），统一调 clearSelection 把状态归零
      clearSelectionRef.current?.();
    };

    const handleCategorySelected = (e) => {
      const tag = (e.detail?.searchTag || '').trim();
      const label = (e.detail?.categoryLabel || '').trim() || tag;
      if (!tag) return;
      exitMultiSelectIfActive();
      categoryTagRef.current = tag;
      setCategoryTag(tag);
      setCategoryLabel(label);
      setTimeout(() => handleSearchRef.current?.(), 50);
    };

    const handleCategoryCleared = () => {
      // 清空分类（selectedTags / searchQuery 不受影响）
      exitMultiSelectIfActive();
      categoryTagRef.current = '';
      setCategoryTag('');
      setCategoryLabel('');
      setTimeout(() => handleSearchRef.current?.(), 50);
    };

    // 顶栏搜索框输入同步（仅影响 searchQuery，视觉零联动标签筛选）
    const handleTopSearch = (e) => {
      const q = e.detail?.query ?? '';
      setSearchQuery(q);
      searchQueryRef.current = q;
    };

    // === FIX: 监听 trigger-search 事件，让顶栏箭头按钮和 Enter 键能触发搜索 ===
    const handleTriggerSearch = () => {
      handleSearchRef.current?.();
    };

    window.addEventListener('category-selected', handleCategorySelected);
    window.addEventListener('category-cleared', handleCategoryCleared);
    window.addEventListener('top-search-query-changed', handleTopSearch);
    window.addEventListener('trigger-search', handleTriggerSearch);
    return () => {
      window.removeEventListener('category-selected', handleCategorySelected);
      window.removeEventListener('category-cleared', handleCategoryCleared);
      window.removeEventListener('top-search-query-changed', handleTopSearch);
      window.removeEventListener('trigger-search', handleTriggerSearch);
    };
    // clearSelectionRef 通过 ref 访问，无需加依赖；本 effect 仅挂一次
  }, []);

  // 搜索词变化时同步回顶栏搜索框（仅用于"外部显式清空搜索框"这一类重置场景）
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('search-query-synced', {
      detail: { query: searchQuery }
    }));
  }, [searchQuery]);
  // === LM CUSTOMIZATION: Category sidebar + Top search bar integration END ===

  // Stable callbacks for Switch/Toggle controls to avoid inline functions in JSX
  const onShowOnlyWithPreviewsChange = useCallback((e) => {
    setShowOnlyWithPreviews(e.target.checked);
  }, []);

  const onShowScoresChange = useCallback((e) => {
    setShowScores(e.target.checked);
  }, []);

  const onSetViewModeList = useCallback(() => setViewMode("list"), []);
  const onSetViewModeGrid = useCallback(() => setViewMode("grid"), []);
  const onToggleGridSize = useCallback(() => setGridSize(prev => prev === "L" ? "S" : "L"), []);

  // === LM CUSTOMIZATION: Sort handler — 客户端排序，选择后自动重排结果 ===
  const onSortChange = useCallback((value) => {
    setSortBy(value);
    if (value === 'relevance') {
      // 相关度 → 重新搜索恢复后端默认排序
      setTimeout(() => handleSearchRef.current?.(), 50);
      return;
    }
    setResults(prev => {
      if (prev.length <= 1) return prev; // 只有 0-1 条结果无需排序
      const sorted = [...prev];
      switch (value) {
        case 'newest':
          sorted.sort((a, b) => {
            const da = a.source?.modified_timestamp || a.source?.created_timestamp || '';
            const db = b.source?.modified_timestamp || b.source?.created_timestamp || '';
            return db.localeCompare(da);
          });
          break;
        case 'oldest':
          sorted.sort((a, b) => {
            const da = a.source?.modified_timestamp || a.source?.created_timestamp || '';
            const db = b.source?.modified_timestamp || b.source?.created_timestamp || '';
            return da.localeCompare(db);
          });
          break;
        case 'name-asc':
          sorted.sort((a, b) => {
            const na = (a.source?.base_key || a.source?.url || '').split('/').pop().toLowerCase();
            const nb = (b.source?.base_key || b.source?.url || '').split('/').pop().toLowerCase();
            return na.localeCompare(nb);
          });
          break;
        case 'name-desc':
          sorted.sort((a, b) => {
            const na = (a.source?.base_key || a.source?.url || '').split('/').pop().toLowerCase();
            const nb = (b.source?.base_key || b.source?.url || '').split('/').pop().toLowerCase();
            return nb.localeCompare(na);
          });
          break;
        case 'tagHitFirst': {
          // V2 E6: 命中 tag 的项前移（stable sort 不破坏原相对顺序）
          const isTagHit = (r) => {
            const explanations = r?.metadata?.explanations || [];
            return explanations.some(exp =>
              Array.isArray(exp?.matched_terms) &&
              exp.matched_terms.some(term => typeof term === 'string' && term.includes('tags.tag'))
            );
          };
          sorted.sort((a, b) => {
            const ha = isTagHit(a) ? 1 : 0;
            const hb = isTagHit(b) ? 1 : 0;
            return hb - ha;
          });
          break;
        }
        default: break;
      }
      return sorted;
    });
  }, []);
  // === LM CUSTOMIZATION: Sort handler END ===

  const onSimilarSearchClear = useCallback(() => {
    setSimilarSearchAsset(null);
    // 清除后自动触发正常搜索，回到默认浏览状态
    setTimeout(() => handleSearchRef.current?.(), 100);
  }, []);

  // === LM CUSTOMIZATION: ResultsTitleBar — 大标题相关回调与 props 打包 ===
  // 移除搜索词：清空 committedQuery + searchQuery + URL ?q=
  const onRemoveCommittedQuery = useCallback(() => {
    committedQueryRef.current = '';
    searchQueryRef.current = '';
    setCommittedQuery('');
    setSearchQuery('');
    setTimeout(() => handleSearchRef.current?.(), 50);
  }, []);

  // 移除分类：清 categoryTag + 同步 CategorySidebar URL（删 ?category=）
  const onRemoveCategoryTag = useCallback(() => {
    categoryTagRef.current = '';
    setCategoryTag('');
    setCategoryLabel('');
    const url = new URL(window.location);
    url.searchParams.delete('category');
    window.history.pushState({}, '', url);
    // 派发 category-cleared 让 CategorySidebar 同步清除 selectedId 高亮（它内部监听 popstate + 本事件）
    window.dispatchEvent(new CustomEvent('category-cleared', { detail: { searchTag: '' } }));
    setTimeout(() => handleSearchRef.current?.(), 50);
  }, []);

  const titleBarProps = useMemo(() => ({
    committedQuery,
    categoryTag,
    categoryLabel,
    imageSearchActive: !!imageBase64,
    isResultShortage,
    userLimit,
    onRemoveQuery: onRemoveCommittedQuery,
    onRemoveCategory: onRemoveCategoryTag,
  }), [committedQuery, categoryTag, categoryLabel, imageBase64, isResultShortage, userLimit, onRemoveCommittedQuery, onRemoveCategoryTag]);

  // Memoized active filter count for sidebar badge
  const activeFilterCount = useMemo(() => {
    return Object.entries(searchParams).filter(([key, value]) => {
      if (value === "" || value === null || value === undefined) return false;
      if (key in DEFAULT_SEARCH_PARAMS && value === DEFAULT_SEARCH_PARAMS[key]) return false;
      return true;
    }).length;
  }, [searchParams]);

  return (
    <Box
      h="calc(100vh - 72px)"
      bg="#141517"
      color="white"
      p={4}
      overflow="hidden"
    >
      <VStack spacing={6} align="stretch" maxW="100%" mx="auto" h="100%" overflow="hidden">
        {/* Main Search Area */}
        <VStack spacing={4} align="stretch">
          {/* === LM CUSTOMIZATION: Hide search bar (moved to top bar) START === */}
          {/* 搜索输入行保留在 DOM 中但隐藏，保持数据流不变 */}
          <HStack align="center" display="none">
            <InputGroup size="lg" flex={1} minWidth="200px">
              <Input
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={onSearchInputChange}
                onKeyDown={onSearchInputKeyDown}
                bg="#1C1D20"
                borderColor="#383838"
                _hover={{ borderColor: "#FFD230" }}
                _focus={{ borderColor: "#FFD230", boxShadow: "0 0 0 1px #FFD230" }}
              />
              <InputRightElement>
                <SearchIcon color="gray.400" />
              </InputRightElement>
            </InputGroup>

            <Text color="gray.400" fontSize="sm" whiteSpace="nowrap">{t('or')}</Text>

            <Tooltip label={t('rightClickToPaste')} placement="bottom">
              <Button
                variant="outline"
                size="lg"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                minW="200px"
                color="gray.400"
                borderColor="#383838"
                _hover={{ borderColor: "#FFD230", color: "#FFD230" }}
              >
                {t('dragImageOrClick')}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  onContextMenu={handlePaste}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    opacity: 0,
                    cursor: "pointer",
                  }}
                />
              </Button>
            </Tooltip>

            <Button
              size="lg"
              bg="#FFD230"
              color="black"
              _hover={{ bg: "#F6C80F", transform: "translateY(-1px)", boxShadow: "0 4px 12px rgba(255,210,48,0.3)" }}
              _active={{ bg: "#D4A800" }}
              onClick={handleSearch}
              isLoading={isLoading}
              loadingText={t('searching')}
              leftIcon={<SearchIcon />}
              minW="120px"
              fontWeight="600"
            >
              {t('search')}
            </Button>
          </HStack>
          {/* === LM CUSTOMIZATION: Hide search bar (moved to top bar) END === */}

          {/* === LM CUSTOMIZATION: Image upload now integrated into TopSearchBar (camera icon) === */}

          {/* === LM CUSTOMIZATION: Controls moved into FabToolbar settings popover === */}

          {/* === LM CUSTOMIZATION: Image search preview card (similar to "Find Similar" style) === */}
          {/* 正常态：显示缩略图+文件名+搜索状态；异常态：显示警告 */}
          {(imageBase64 || imageError) && (
            <Box
              position="relative"
              bg="gray.800"
              border="1px solid"
              borderColor={imageError ? "orange.400" : "gray.600"}
              borderRadius="12px"
              p={3}
              transition="all 0.2s ease"
              _hover={{ borderColor: imageError ? "orange.300" : "green.400", boxShadow: imageError ? "0 0 12px rgba(237, 137, 54, 0.15)" : "0 0 12px rgba(118, 230, 80, 0.15)" }}
              maxW="520px"
            >
              <HStack spacing={4} align="center">
                {/* Image thumbnail */}
                <Box
                  position="relative"
                  flexShrink={0}
                  borderRadius="8px"
                  overflow="hidden"
                  boxShadow="0 2px 8px rgba(0,0,0,0.4)"
                  bg="gray.900"
                  w="120px"
                  h="90px"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  {imageBase64 ? (
                    <img
                      src={imageBase64}
                      alt="Uploaded"
                      style={{ width: '120px', height: '90px', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <Text fontSize="xl">⚠️</Text>
                  )}
                  {imageBase64 && (
                    <Box
                      position="absolute"
                      bottom={0}
                      left={0}
                      right={0}
                      h="30%"
                      bgGradient="linear(to-t, blackAlpha.600, transparent)"
                      borderBottomRadius="8px"
                      pointerEvents="none"
                    />
                  )}
                </Box>

                {/* Info section */}
                <VStack align="start" spacing={1} flex={1} minW={0}>
                  {imageError ? (
                    <>
                      {/* 异常态 */}
                      <Text fontSize="xs" color="orange.300" fontWeight="600" noOfLines={1}>
                        {imageName || 'image'}
                      </Text>
                      <Text fontSize="xs" color="orange.200" noOfLines={1}>
                        {imageError}
                      </Text>
                    </>
                  ) : (
                    <>
                      {/* 正常态 / 完成态 */}
                      <HStack spacing={2}>
                        <Box w="6px" h="6px" borderRadius="full" bg={isLoading ? "yellow.400" : "#76E650"} flexShrink={0} />
                        <Text fontSize="xs" color={isLoading ? "yellow.300" : "#76E650"} fontWeight="600" letterSpacing="0.5px">
                          {isLoading ? (t('searchingEllipsis') || '搜索中...') : t('imageSearchActive')}
                        </Text>
                      </HStack>
                      {imageName && (
                        <Text fontSize="xs" color="gray.300" noOfLines={1} title={imageName}>
                          {imageName}
                        </Text>
                      )}
                      <Text fontSize="xs" color="gray.400" noOfLines={1}>
                        {isLoading
                          ? (t('imageSearchingHint') || '正在搜索相似资产...')
                          : visibleResults.length > 0
                            ? (t('foundSimilarAssets') || `找到 ${visibleResults.length} 个相似资产`).replace('{count}', visibleResults.length)
                            : (t('imageSearchHint') || '正在使用图片搜索相似资产')
                        }
                      </Text>
                      {lastSearchQuery && (
                        <Text fontSize="xs" color="gray.500" noOfLines={1} fontFamily="mono">
                          + "{lastSearchQuery}"
                        </Text>
                      )}
                    </>
                  )}
                </VStack>

                {/* Close button */}
                <IconButton
                  size="xs"
                  icon={<CloseIcon boxSize="8px" />}
                  onClick={handleClearImage}
                  aria-label={t('clearImage') || 'Clear image'}
                  variant="ghost"
                  color="gray.400"
                  _hover={{ color: "white", bg: "whiteAlpha.200" }}
                  borderRadius="full"
                  position="absolute"
                  top={2}
                  right={2}
                />
              </HStack>
            </Box>
          )}

          {/* Similar Search Asset Preview */}
          {similarSearchAsset && (
            <Box
              position="relative"
              bg="gray.800"
              border="1px solid"
              borderColor="gray.600"
              borderRadius="12px"
              p={3}
              transition="all 0.2s ease"
              _hover={{ borderColor: "purple.400", boxShadow: "0 0 12px rgba(159, 122, 234, 0.15)" }}
              maxW="520px"
            >
              <HStack spacing={4} align="center">
                {/* Image thumbnail */}
                <Box
                  position="relative"
                  flexShrink={0}
                  borderRadius="8px"
                  overflow="hidden"
                  boxShadow="0 2px 8px rgba(0,0,0,0.4)"
                  bg="gray.900"
                >
                  <AssetImage
                    result={{ source: { base_key: similarSearchAsset.url } }}
                    getHeaders={getHeaders}
                    apiUrl={apiUrl}
                    width="120px"
                    height="90px"
                    borderRadius="0"
                  />
                  {/* Subtle gradient overlay */}
                  <Box
                    position="absolute"
                    bottom={0}
                    left={0}
                    right={0}
                    h="30%"
                    bgGradient="linear(to-t, blackAlpha.600, transparent)"
                    borderBottomRadius="8px"
                    pointerEvents="none"
                  />
                </Box>

                {/* Info section */}
                <VStack align="start" spacing={1.5} flex={1} minW={0}>
                  <HStack spacing={2}>
                    <Box w="6px" h="6px" borderRadius="full" bg="purple.400" flexShrink={0} />
                    <Text fontSize="xs" color="purple.400" fontWeight="600" letterSpacing="0.5px" textTransform="uppercase">
                      {t('findingSimilarTo')}
                    </Text>
                  </HStack>
                  <Text fontSize="xs" color="gray.300" maxW="320px" noOfLines={2} title={similarSearchAsset.filename}>
                    {similarSearchAsset.filename}
                  </Text>
                  <Text fontSize="xs" color="gray.400" maxW="320px" noOfLines={1} fontFamily="mono" title={similarSearchAsset.url}>
                    {similarSearchAsset.url}
                  </Text>
                </VStack>

                {/* Close button */}
                <IconButton
                  size="xs"
                  icon={<CloseIcon boxSize="8px" />}
                  onClick={onSimilarSearchClear}
                  aria-label="Clear similar search"
                  variant="ghost"
                  color="gray.400"
                  _hover={{ color: "white", bg: "whiteAlpha.200" }}
                  borderRadius="full"
                  position="absolute"
                  top={2}
                  right={2}
                />
              </HStack>
            </Box>
          )}

        </VStack>

        {/* === LM CUSTOMIZATION: Single column layout (filters in FabToolbar) START === */}
        {/* 过滤器和配置侧栏隐藏（功能已移植到 FabToolbar Popover 按钮）*/}
        <Grid templateColumns="1fr" gap={6} align="start" flex={1} minH={0} overflow="hidden">
          <GridItem display="none">
            <VStack spacing={3} align="stretch" position="sticky" top="4">
              {/* === Search Filters Panel === */}
              {filtersCollapsed ? (
                <Box
                  bg="gray.800"
                  borderRadius="md"
                  py={3}
                  px={2}
                  w="34px"
                  border="1px solid"
                  borderColor="gray.600"
                  display="flex"
                  flexDirection="column"
                  alignItems="center"
                  justifyContent="flex-start"
                  cursor="pointer"
                  onClick={() => setFiltersCollapsed(false)}
                  _hover={{ borderColor: "gray.400" }}
                  transition="border-color 0.2s"
                >
                  <VStack spacing={2}>
                    <IconButton
                      size="xs"
                      variant="ghost"
                      icon={<ChevronRightIcon />}
                      aria-label="Show filters sidebar"
                      colorScheme="yellow"
                      pointerEvents="none"
                    />

                    {/* Show active filter count if any */}
                    {activeFilterCount > 0 && (
                        <Badge colorScheme="yellow" fontSize="xs" borderRadius="full" px={1} py={0.5}>
                          {activeFilterCount}
                        </Badge>
                    )}

                    {/* Vertical "Search Filters" Text */}
                    <Box
                      sx={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
                      whiteSpace="nowrap"
                    >
                      <Text fontSize="xs" color="white" fontWeight="medium" letterSpacing="tight">
                        {t('searchFilters')}
                      </Text>
                    </Box>
                  </VStack>
                </Box>
              ) : (
                <VStack spacing={2} align="stretch">
                  <HStack justify="flex-end">
                    <Tooltip label={t('hideFilters')} placement="left">
                      <IconButton
                        size="sm"
                        variant="ghost"
                        icon={<ChevronLeftIcon />}
                        onClick={() => setFiltersCollapsed(true)}
                        aria-label="Hide filters sidebar"
                        colorScheme="gray"
                      />
                    </Tooltip>
                  </HStack>
                  <SearchFilters
                    searchParams={searchParams}
                    handleChange={handleFilterChange}
                    setSearchParams={setSearchParams}
                    propertiesData={propertiesData}
                    onClearAll={handleClearAllFilters}
                  />
                </VStack>
              )}

              {/* === Hybrid Search Config Panel === */}
              {configSidebarCollapsed ? (
                <Box
                  bg="gray.800"
                  borderRadius="md"
                  py={3}
                  px={2}
                  w="34px"
                  border="1px solid"
                  borderColor="gray.600"
                  display="flex"
                  flexDirection="column"
                  alignItems="center"
                  justifyContent="flex-start"
                  cursor="pointer"
                  onClick={() => setConfigSidebarCollapsed(false)}
                  _hover={{ borderColor: "gray.400" }}
                  transition="border-color 0.2s"
                >
                  <VStack spacing={2}>
                    <IconButton
                      size="xs"
                      variant="ghost"
                      icon={<ChevronRightIcon />}
                      aria-label="Show config sidebar"
                      colorScheme="yellow"
                      pointerEvents="none"
                    />

                    {/* Vertical "Search Config" Text */}
                    <Box
                      sx={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
                      whiteSpace="nowrap"
                    >
                      <Text fontSize="xs" color="white" fontWeight="medium" letterSpacing="tight">
                        {t('advancedHybridConfig')}
                      </Text>
                    </Box>
                  </VStack>
                </Box>
              ) : (
                <VStack spacing={2} align="stretch">
                  <HStack justify="flex-end">
                    <Tooltip label={t('advancedHybridConfig')} placement="left">
                      <IconButton
                        size="sm"
                        variant="ghost"
                        icon={<ChevronLeftIcon />}
                        onClick={() => setConfigSidebarCollapsed(true)}
                        aria-label="Hide config sidebar"
                        colorScheme="gray"
                      />
                    </Tooltip>
                  </HStack>
                  <HybridSearchConfig
                    value={hybridConfig}
                    onChange={setHybridConfig}
                    isCollapsed={configCollapsed}
                    embeddingConfig={embeddingConfig}
                  />
                </VStack>
              )}
            </VStack>
          </GridItem>

          {/* Right Content - Results */}
          {/* === LM CUSTOMIZATION: SelectionDrawer === v3 TC-A4 修复：
               结果区 GridItem 整体打 data-true-empty-area="true"。
               配合 useDrawerCloseGuard：用户点这个 GridItem 内的"真空白"区域（即卡片以外、
               工具栏以外、SelectionModeBar 以外的页面背景）才会关闭抽屉；
               点卡片本身/复选框/工具栏均被 KEEP_OPEN_SELECTOR 短路，不会关抽屉。 */}
          <GridItem overflow="hidden" display="flex" flexDirection="column" h="100%" data-true-empty-area="true">
            {/* === LM CUSTOMIZATION: FabToolbar / SelectionModeBar 同层 crossfade 互斥显示 === */}
            {/* 关键：两者渲染在同一 relative 容器内，双层 absolute + opacity 切换；
                 容器高度由 FabToolbar 撑起（SelectionModeBar 设为 absolute 脱离流，
                 但容器始终保持 FabToolbar 的自然高度），从而保证切换时下方卡片不抖动。
                 SelectionModeBar 内部垂直居中对齐，视觉上仍是一整条 bar。 */}
            <Box position="relative" mb="8px">
              {/* Layer 1: FabToolbar —— 撑起容器高度，多选时透明但不脱流
                   v2 修复"切换不丝滑"：缩短退出至 120ms 让 FabToolbar 更快让位，
                   delay 0ms（立刻开始），避免与 SelectionModeBar 进入层重叠超过 60ms；
                   transform translateZ 提升合成层但不做位移，纯 opacity 切换。 */}
              <Box
                opacity={isMultiSelectMode ? 0 : 1}
                pointerEvents={isMultiSelectMode ? 'none' : 'auto'}
                transition={
                  isMultiSelectMode
                    ? "opacity 0.12s cubic-bezier(0.4, 0, 1, 1)"  // 退出：稍快、ease-in
                    : "opacity 0.18s cubic-bezier(0.0, 0, 0.2, 1) 0.04s"  // 进入：稍慢、ease-out + 40ms delay 等 SelectionBar 退出
                }
                willChange="opacity"
                transform="translateZ(0)"
                aria-hidden={isMultiSelectMode}
              >
                <FabToolbar
                searchParams={searchParams}
                handleChange={handleFilterChange}
                setSearchParams={setSearchParams}
                onTriggerSearch={triggerSearchFromToolbar}
                sortBy={sortBy}
                onSortChange={onSortChange}
                showScores={showScores}
                onShowScoresChange={onShowScoresChange}
                showOnlyWithPreviews={showOnlyWithPreviews}
                pathTree={pathTree}
                treeStatus={treeStatus}
                treeError={treeError}
                onRefreshTree={refreshTree}
                onShowOnlyWithPreviewsChange={onShowOnlyWithPreviewsChange}
                viewMode={viewMode}
                onSetViewModeList={onSetViewModeList}
                onSetViewModeGrid={onSetViewModeGrid}
                gridSize={gridSize}
                onToggleGridSize={onToggleGridSize}
                deduplicateByHash={searchParams.deduplicate_by_hash}
                onRemoveDuplicatesChange={handleRemoveDuplicatesChange}
                onOpenHybridConfig={() => setConfigSidebarCollapsed(prev => !prev)}
                searchQuery={searchQuery}
                onSearchQueryChange={(newQuery) => {
                  setSearchQuery(newQuery);
                  searchQueryRef.current = newQuery;
                  setTimeout(() => handleSearchRef.current?.(), 50);
                }}
                // === LM CUSTOMIZATION: Search/Tag decoupling — 新增独立 tag / committedQuery props ===
                committedQuery={committedQuery}
                onCommittedQueryChange={(nextVal) => {
                  committedQueryRef.current = nextVal;
                  setCommittedQuery(nextVal);
                  setTimeout(() => handleSearchRef.current?.(), 50);
                }}
                selectedTags={selectedTags}
                onSelectedTagsChange={(nextTags) => {
                  const arr = Array.isArray(nextTags) ? nextTags : [];
                  selectedTagsRef.current = arr;
                  setSelectedTags(arr);
                  setTimeout(() => handleSearchRef.current?.(), 50);
                }}
                // === LM CUSTOMIZATION: Search/Tag decoupling v4 — 分类 tag + 一键清除全部 ===
                categoryTag={categoryTag}
                onCategoryTagChange={(nextVal) => {
                  const v = typeof nextVal === 'string' ? nextVal : '';
                  categoryTagRef.current = v;
                  setCategoryTag(v);
                  if (!v) setCategoryLabel('');
                  if (!v) {
                    // 同步 CategorySidebar（删 URL ?category + 派发 event）
                    const url = new URL(window.location);
                    url.searchParams.delete('category');
                    window.history.pushState({}, '', url);
                    window.dispatchEvent(new CustomEvent('category-cleared', { detail: { searchTag: '' } }));
                  }
                  setTimeout(() => handleSearchRef.current?.(), 50);
                }}
                results={visibleResults}
                // === v5 合并行：TitleBar + 结果计数内嵌 toolbar ===
                titleBarProps={titleBarProps}
                resultCount={visibleResults.length}
                globalTags={globalTags}
                />
              </Box>
              {/* Layer 2: SelectionModeBar —— 绝对定位覆盖在 FabToolbar 上方，
                   v2 修复"切换不丝滑"：
                     - 进入：50ms delay 让 FabToolbar 先消失大半，避免双 bar 叠影
                     - 进入 transform 从 translate3d(0,-6px,0)（更明显的"飞入"方向感）
                     - 进入 ease-out 曲线 + 200ms duration（既快又有质感）
                     - 退出：100ms 快速淡出 + 向上 -4px 收回，给"消散感" */}
              <Box
                position="absolute"
                top={0}
                left={0}
                right={0}
                bottom={0}
                opacity={isMultiSelectMode ? 1 : 0}
                transform={isMultiSelectMode ? 'translate3d(0,0,0)' : 'translate3d(0,-6px,0)'}
                pointerEvents={isMultiSelectMode ? 'auto' : 'none'}
                transition={
                  isMultiSelectMode
                    ? "opacity 0.20s cubic-bezier(0.0, 0, 0.2, 1) 0.05s, transform 0.24s cubic-bezier(0.22, 1, 0.36, 1) 0.05s"
                    : "opacity 0.10s cubic-bezier(0.4, 0, 1, 1), transform 0.14s cubic-bezier(0.4, 0, 1, 1)"
                }
                willChange="opacity, transform"
                display="flex"
                alignItems="center"
                aria-hidden={!isMultiSelectMode}
                className="selection-bar-wrapper"
                px="4px"
              >
                <Box flex="1">
                  <SelectionModeBar
                    selectedCount={selectedItems.size}
                    totalCount={tagFilteredResults?.length || 0}
                    onCopySelectedUrls={copySelectedUrls}
                    onSelectAll={selectAllResults}
                    onDeselectAll={deselectAllKeepMode}
                    onClearSelection={clearSelection}
                    t={t}
                    onBatchTag={handleOpenBatchModal}
                    canBatch={selectedItems.size <= 100}
                    batchLimitTip={t('batchTagLimitTip') || '请先缩小范围至 100 个以内'}
                    batchProgress={batchProgress}
                    batchFailedItems={batchFailedItems}
                    onBatchRetry={handleBatchRetry}
                  />
                </Box>
              </Box>
            </Box>
            {/* === LM CUSTOMIZATION: FabToolbar / SelectionModeBar crossfade END === */}
            {/* === LM CUSTOMIZATION: Search Settings Popover START ===
                 原因：C 组任务 3 — 从顶栏齿轮按钮触发的搜索设置面板。
                 本身不占布局空间（fixed 定位 + isOpen 受控）；
                 监听 CustomEvent('open-search-settings') 开启，与 FabToolbar 的视图设置 Popover 互斥。
                 合入英伟达新版时：本区块整体保留。 */}
            <SearchSettingsPopover
              hybridConfig={hybridConfig}
              onHybridConfigChange={setHybridConfig}
              searchParams={searchParams}
              setSearchParams={setSearchParams}
              onTriggerSearch={triggerSearchFromToolbar}
              defaultHybridConfig={DEFAULT_HYBRID_CONFIG}
              defaultSearchParams={DEFAULT_SEARCH_PARAMS}
            />
            {/* === LM CUSTOMIZATION: Search Settings Popover END === */}
            <MemoizedResults
              results={visibleResults}
              showOnlyWithPreviews={false}
              onItemClick={handleItemClick}
              copyToClipboard={copyToClipboard}
              onFindSimilar={handleFindSimilar}
              showScores={showScores}
              viewMode={viewMode}
              gridSize={gridSize}
              isLoading={isLoading}
              lastSearchQuery={lastSearchQuery}
              getHeaders={getHeaders}
              apiUrl={apiUrl}
              selectedItems={selectedItems}
              onSelectionChange={
                // === LM CUSTOMIZATION: SelectionInteraction START ===
                // 旗标开启 → 走方案 B 真值表 hook；关闭 → 原 handleToggleSelection
                handleSelectionInteractionV2
                // === LM CUSTOMIZATION: SelectionInteraction END ===
              }
              onBatchSelection={setBatchSelection}
              onCopySelectedUrls={copySelectedUrls}
              isMultiSelectMode={isMultiSelectMode}
              failedBatchItems={failedBatchItems}
              onRetryFailed={handleRetryFailedFromCard}
              onEmptyAreaClick={clearSelection}
              titleBarProps={titleBarProps}
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              loadMoreError={loadMoreError}
              isResultShortage={isResultShortage}
              onAutoLoadMore={handleAutoLoadMore}
              onTriggerBackendLoadMore={handleTriggerBackendLoadMore}
              onRetryLoadMore={handleRetryLoadMore}
              // [PERF v3] 移除 onDragStateChange 上抛：isDragging body 样式已合入 useDragSelect
              // === LM CUSTOMIZATION: CardTagBar START ===
              // CardTagBar 需要 nucleus host（已经过 resolveNucleusHost 解析）
              // 合入英伟达新版时：本 prop 透传与 NVIDIA 不交叉，保留。
              serverUrl={nucleusServerUrl}
              // === LM CUSTOMIZATION: CardTagBar END ===
            />
          </GridItem>
        </Grid>
        {/* === LM CUSTOMIZATION: Single column layout (filters in FabToolbar) END === */}
      </VStack>

      {/* Asset Details Modal */}
      {/* === LM CUSTOMIZATION: SelectionInteraction START === */}
      {/* Group A 任务 5：旗标双轨渲染。
            - SINGLE_CLICK_DRAWER=true（默认）：右侧详情抽屉 AssetDetailsDrawer（任务 4 骨架）。
            - SINGLE_CLICK_DRAWER=false：完整退回 NVIDIA 原版 AssetDetailsModal。
          抽屉与 Modal 共用同一 (selectedItem, isDetailsOpen, onDetailsClose)，
          便于一键回滚（仅修改 config.jsx 的旗标）。
          任务 8 性能调优：Drawer 路径常驻挂载（asset 切换复用同一实例，避免每次开关 unmount/remount），
            Modal 路径保留 selectedItem 守卫（原版行为不变）。
          合入英伟达新版时：保留本块；旗标关闭即等价于原版。 */}
      {FEATURE_FLAGS.SINGLE_CLICK_DRAWER ? (
        <AssetDetailsDrawer
          /* TC-A4 修复：isOpen 不再依赖 !!selectedItem，让切换卡片时
             Drawer 持续保持打开（asset 内部用 displayAsset 缓存避免空态闪现）。 */
          isOpen={isDetailsOpen}
          asset={selectedItem}
          onClose={onDetailsClose}
          getHeaders={getHeaders}
          apiUrl={apiUrl}
          serverUrl={nucleusServerUrl}
          copyToClipboard={copyToClipboard}
          // === LM CUSTOMIZATION: AdvancedPanel START ===
          // Group B 任务 7：高级面板填充原 HYBRID/匹配字段信息
          // detail-modal-revamp：扩充为完整高级面板组合（依赖 / 反向依赖 / USD / 索引管理 / 条件性面板 / Hybrid 匹配信息）
          advancedPanelContent={
            selectedItem ? (
              <DrawerAdvancedPanelContainer
                asset={selectedItem}
                plugins={plugins}
                getHeaders={getHeaders}
                triggerReindexAllPlugins={triggerReindexAllPlugins}
                triggerReindexIndividualPlugin={triggerReindexIndividualPlugin}
                isAuthorized={true}
              />
            ) : null
          }
          // === LM CUSTOMIZATION: AdvancedPanel END ===
          // === LM CUSTOMIZATION: AssetTagEditor START ===
          // Group B 任务 8：抽屉内完整 tag 编辑器
          tagsAreaContent={
            selectedItem
              ? <AssetTagEditor asset={selectedItem} serverUrl={nucleusServerUrl} getHeaders={getHeaders} apiUrl={apiUrl} />
              : null
          }
          // === LM CUSTOMIZATION: AssetTagEditor END ===
          // actionButtons 留给 B 组后续任务注入。
        />
      ) : (
        selectedItem && (
          <AssetDetailsModal
            isOpen={isDetailsOpen}
            onClose={onDetailsClose}
            selectedItem={selectedItem}
            copyToClipboard={copyToClipboard}
            showScores={showScores}
            plugins={plugins}
            getHeaders={getHeaders}
            apiUrl={apiUrl}
            serverUrl={nucleusServerUrl}
            triggerReindexAllPlugins={triggerReindexAllPlugins}
            triggerReindexIndividualPlugin={triggerReindexIndividualPlugin}
            onTagsChanged={handleTagsChanged}
          />
        )
      )}
      {/* === LM CUSTOMIZATION: SelectionInteraction END === */}

      {/* V2: 批量打标签弹框 */}
      <BatchTagModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        selectedAssets={getSelectedAssets()}
        defaultTag={searchQuery || ''}
        onConfirm={handleBatchConfirm}
        onDeselect={(key) => {
          setSelectedItems(prev => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }}
        getHeaders={getHeaders}
        t={t}
      />

      {/* V2: 批量完成/撤销 Toast */}
      <UndoToast
        isOpen={!!undoToastState}
        message={undoToastState?.message}
        actionLabel={undoToastState?.actionLabel}
        onAction={undoToastState?.onAction}
        durationMs={undoToastState?.durationMs || 10000}
        variant={undoToastState?.variant || 'default'}
        placement="top"
        onExpire={() => setUndoToastState(null)}
      />

      {/* Feedback Popup */}
      {FEATURE_FLAGS.ENABLE_FEEDBACK_MODAL && showFeedbackPopup && (
        <Modal isOpen={showFeedbackPopup} onClose={() => {}} closeOnOverlayClick={false}>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>{t('helpUsImprove')}</ModalHeader>
            <ModalCloseButton onClick={handleFeedbackLater} />
            <ModalBody>
              <VStack spacing={4}>
                <Text>
                  {t('feedbackMessage')}
                </Text>
                <Text 
                  fontSize="xs" 
                  color="gray.500" 
                  textAlign="center" 
                  cursor="pointer" 
                  onClick={handleFeedbackDismiss}
                  _hover={{ color: "gray.400", textDecoration: "underline" }}
                >
                  {t('dontShowAgain')}
                </Text>
              </VStack>
            </ModalBody>
            <ModalFooter>
              <HStack spacing={3}>
                <Button variant="ghost" onClick={handleFeedbackLater}>
                  {t('later')}
                </Button>
                <Button bg="#FFD230" color="black" _hover={{ bg: "#F6C80F" }} onClick={handleFeedbackSubmit}>
                  {t('takeSurvey')}
                </Button>
              </HStack>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}

      {/* === LM CUSTOMIZATION: Copy Deploy Fix - Manual Copy Modal === */}
      <ManualCopyDialog
        text={manualCopyText}
        onClose={() => setManualCopyText(null)}
        onRetry={() => {
          const t0 = manualCopyText;
          if (!t0) return;
          // 关闭后重新走主流程，给用户主动重试机会（用户激活态从重试按钮的 click 重新计算）
          setManualCopyText(null);
          // 微延迟避免 Modal 关闭过渡抢焦点
          setTimeout(() => copyToClipboard(t0), 0);
        }}
        t={t}
      />
    </Box>
  );
};

// === LM CUSTOMIZATION: Copy Deploy Fix - Manual Copy Modal Component START ===
// 当 navigator.clipboard.writeText 与 document.execCommand('copy') 双路均无法真正写入剪贴板时
// （典型场景：部署层 Permissions-Policy 禁用 / 浏览器扩展拦截 / HTTP 非 localhost 焦点抢占），
// 弹出此 Modal 让用户至少可以肉眼看到 URL，并通过：
//   1. autoFocus + 全选 → Ctrl+C / ⌘+C 手动复制
//   2. "在新标签页打开"链接（地址栏复制基本不会被任何策略禁）
//   3. "重试复制"按钮（用全新的用户激活态再走一遍主流程）
// 来兜底，确保不再出现"绿 toast + 空粘贴板"的静默失败。
const ManualCopyDialog = ({ text, onClose, onRetry, t }) => {
  const textareaRef = useRef(null);

  useEffect(() => {
    if (text && textareaRef.current) {
      // 微延迟，等 Chakra Modal 打开过渡完成再 focus，避免被 trapFocus 抢回
      const id = setTimeout(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        try {
          ta.focus();
          ta.select();
        } catch (_) {
          /* noop */
        }
      }, 50);
      return () => clearTimeout(id);
    }
  }, [text]);

  if (!text) return null;

  const isHttpUrl = /^https?:\/\//i.test(text);

  return (
    <Modal isOpen={!!text} onClose={onClose} size="lg" initialFocusRef={textareaRef} isCentered>
      <ModalOverlay />
      <ModalContent bg="gray.800" color="white">
        <ModalHeader>{t('manualCopyTitle')}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text fontSize="sm" color="gray.400" mb={3}>
            {t('manualCopyHint')}
          </Text>
          <Textarea
            ref={textareaRef}
            value={text}
            isReadOnly
            rows={3}
            fontFamily="mono"
            fontSize="sm"
            bg="gray.900"
            borderColor="yellow.400"
            _focus={{ borderColor: 'yellow.300', boxShadow: '0 0 0 1px #FFD230' }}
            onFocus={(e) => {
              try { e.target.select(); } catch (_) { /* noop */ }
            }}
            onClick={(e) => {
              try { e.target.select(); } catch (_) { /* noop */ }
            }}
          />
        </ModalBody>
        <ModalFooter gap={2}>
          <Button size="sm" variant="ghost" onClick={onRetry}>
            {t('manualCopyRetry')}
          </Button>
          {isHttpUrl && (
            <Button
              size="sm"
              variant="outline"
              as="a"
              href={text}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('manualCopyOpenInTab')}
            </Button>
          )}
          <Button size="sm" colorScheme="yellow" onClick={onClose}>
            {t('manualCopyClose')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
// === LM CUSTOMIZATION: Copy Deploy Fix - Manual Copy Modal Component END ===

export default HybridDeepSearchUI;
