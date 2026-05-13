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

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Button,
  IconButton,
  Tooltip,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Collapse,
  useDisclosure,
  Grid,
  GridItem,
  CircularProgress,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverBody,
  PopoverArrow,
  PopoverCloseButton,
} from "@chakra-ui/react";
import {
  CopyIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  RepeatIcon,
} from "@chakra-ui/icons";
import SearchExplanations from "./SearchExplanations";
import NavigableAssetImage from "./components/NavigableAssetImage";
import GraphVisualization from "./Graph";
import { apiUrl, SEARCH_DEFAULTS } from "./config";
import { formatFileSize, formatDate } from "./utils/formatUtils";
// === LM CUSTOMIZATION: i18n START ===
import { useTranslation } from "./i18n/LanguageContext";
// === LM CUSTOMIZATION: i18n END ===
import EditableTagsPanel from "./components/EditableTagsPanel";

// === LM CUSTOMIZATION: detail-modal-revamp START ===
// 高级模式开关：URL 参数 ?advanced=1 写入 localStorage 持久化，
// ?advanced=0 清除；仅在加载时求值一次（切换需刷新页面）。
// 关闭时，索引管理 / 搜索解释 / AI 元数据 / VLM 元数据 / AGS / USD 属性 /
// 依赖 / 反向依赖 等高级面板会被 hide 掉，源代码保留。
const ADVANCED_MODE = (() => {
  try {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("advanced");
    if (flag === "1") {
      window.localStorage.setItem("lm_advanced_mode", "1");
    } else if (flag === "0") {
      window.localStorage.removeItem("lm_advanced_mode");
    }
    return window.localStorage.getItem("lm_advanced_mode") === "1";
  } catch (e) {
    return false;
  }
})();
// === LM CUSTOMIZATION: detail-modal-revamp END ===

// Status utility functions
const getStatusColor = (status) => {
  if (!status) return "white";
  const lowerStatus = status.toLowerCase();
  if (lowerStatus === "ok" || lowerStatus === "completed" || lowerStatus === "success") {
    return "#52C41A";
  } else if (lowerStatus === "processing" || lowerStatus === "pending" || lowerStatus === "running") {
    return "blue.400";
  } else if (lowerStatus === "queued") {
    return "yellow.400";
  } else {
    return "red.400";
  }
};

const calculateOverallIndexStatus = (pluginStatuses) => {
  if (!pluginStatuses || Object.keys(pluginStatuses).length === 0) {
    return { status: "Unknown", color: "gray.400" };
  }

  const statuses = Object.values(pluginStatuses);
  const hasError = statuses.some(status => 
    status && status.toLowerCase().includes("error")
  );
  const hasProcessing = statuses.some(status => 
    status && (status.toLowerCase().includes("processing") || 
               status.toLowerCase().includes("pending") || 
               status.toLowerCase().includes("running") ||
               status.toLowerCase().includes("queued") ||
               status.toLowerCase().includes("thumbnail_missing"))
  );
  const allCompleted = statuses.every(status => 
    status && (status.toLowerCase().includes("ok") || 
               status.toLowerCase().includes("completed") || 
               status.toLowerCase().includes("success") ||
               status.toLowerCase().includes("thumbnail_missing"))
  );

  if (hasError) {
    return { status: "Error", color: "red.400" };
  } else if (allCompleted) {
    return { status: "Ok", color: "#52C41A" };
  } else if (hasProcessing) {
    return { status: "Partial", color: "yellow.400" };
  } else {
    return { status: "Unknown", color: "gray.400" };
  }
};

const PluginStatusTable = ({ url, plugins, triggerReindexIndividualPlugin, getHeaders, onStatusChange }) => {
  const { t } = useTranslation();
  const [pluginStatuses, setPluginStatuses] = useState({});
  const [pluginStatusDetails, setPluginStatusDetails] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  const fetchPluginStatuses = useCallback(async () => {
    if (!url) return;
    
    setIsLoading(true);
    try {
      const headers = getHeaders();
      const response = await fetch(`${apiUrl}/info/indexing/asset/status?url=${encodeURIComponent(url)}`, { headers });
      
      if (response.status === 200) {
        const data = await response.json();
        const statuses = {};
        const statusDetails = {};
        
        if (data.plugins_statuses) {
          Object.entries(data.plugins_statuses).forEach(([pluginName, pluginData]) => {
            if (pluginData.plugin_status_history && pluginData.plugin_status_history.length > 0) {
              const firstStatus = pluginData.plugin_status_history[0];
              const status = firstStatus.status || 'Unknown';
              statuses[pluginName] = status;
              
              statusDetails[pluginName] = {
                status: status,
                timestamp: firstStatus.processing_timestamp || null,
                exception: firstStatus.exception || null
              };
            } else {
              statuses[pluginName] = 'No status';
              statusDetails[pluginName] = {
                status: 'No status',
                timestamp: null,
                exception: null
              };
            }
          });
        }
        
        setPluginStatuses(statuses);
        setPluginStatusDetails(statusDetails);
        if (onStatusChange) {
          onStatusChange(statuses);
        }
      }
    } catch (err) {
      console.error("Error fetching plugin statuses:", err);
    } finally {
      setIsLoading(false);
    }
  }, [url, getHeaders, onStatusChange]);

  useEffect(() => {
    fetchPluginStatuses();
  }, [fetchPluginStatuses]);

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'No timestamp available';
    
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return timestamp;
      }
      return date.toISOString().slice(0, 19).replace('T', ' ');
    } catch (e) {
      return timestamp;
    }
  };

  const createTooltipContent = (pluginName) => {
    const details = pluginStatusDetails[pluginName];
    if (!details) return 'No status information available';
    
    let content = `Status: ${details.status}`;
    
    if (details.timestamp) {
      content += `\nTimestamp: ${formatTimestamp(details.timestamp)}`;
    }
    
    if (details.exception) {
      content += `\nException: ${details.exception}`;
    }
    
    return content;
  };

  const pluginsWithStatus = plugins.active?.filter(plugin => 
    pluginStatuses.hasOwnProperty(plugin.name)
  ) || [];

  if (isLoading) {
    return (
      <Box textAlign="center" p={4}>
        <CircularProgress isIndeterminate size="40px" />
        <Text mt={2} fontSize="sm" color="gray.400">{t('loadingPluginStatuses')}</Text>
      </Box>
    );
  }

  return (
    <Box>
      <HStack justify="space-between" align="center" mb={2}>
        <Text fontSize="sm" color="gray.400">
          {t('pluginStatusReindexing')}
        </Text>
        <Tooltip label={t('refreshPluginStatuses')}>
          <IconButton
            size="xs"
            variant="ghost"
            icon={<RepeatIcon />}
            onClick={fetchPluginStatuses}
            aria-label="Refresh plugin statuses"
            colorScheme="blue"
            isLoading={isLoading}
          />
        </Tooltip>
      </HStack>
      <VStack spacing={2} align="stretch">
        {pluginsWithStatus.map((plugin) => {
          const status = pluginStatuses[plugin.name];
          const statusColor = getStatusColor(status);
          
          return (
            <HStack key={plugin.name} justify="space-between" p={2} bg="gray.700" borderRadius="md">
              <VStack align="start" spacing={0} flex={1}>
                <Text fontSize="sm" fontWeight="semibold">{plugin.name}</Text>
                <Tooltip label={createTooltipContent(plugin.name)} placement="top">
                  <Text fontSize="xs" color={statusColor}>
                    {status || 'Unknown'}
                  </Text>
                </Tooltip>
              </VStack>
              <Button
                size="xs"
                colorScheme="blue"
                onClick={() => triggerReindexIndividualPlugin?.(url, plugin.name)}
              >
                {t('reindex')}
              </Button>
            </HStack>
          );
        })}
        
        {plugins.active?.filter(plugin => !pluginStatuses.hasOwnProperty(plugin.name)).map((plugin) => (
          <HStack key={plugin.name} justify="space-between" p={2} bg="gray.700" borderRadius="md">
            <VStack align="start" spacing={0} flex={1}>
              <Text fontSize="sm" fontWeight="semibold">{plugin.name}</Text>
              <Text fontSize="xs" color="gray.400">{t('noStatusAvailable')}</Text>
            </VStack>
            <Button
              size="xs"
              colorScheme="blue"
              onClick={() => triggerReindexIndividualPlugin?.(url, plugin.name)}
            >
              {t('reindex')}
            </Button>
          </HStack>
        ))}
      </VStack>
    </Box>
  );
};

const USDPropertiesTable = ({ usdProperties, expandedGroups, setExpandedGroups }) => {
  const { t } = useTranslation();
  if (!usdProperties || Object.keys(usdProperties).length === 0) {
    return (
      <Box p={4} textAlign="center" color="gray.400">
        <Text>{t('noUsdProperties')}</Text>
      </Box>
    );
  }

  // Group properties by prefix (before the first colon)
  const groupedProperties = {};
  Object.entries(usdProperties).forEach(([key, value]) => {
    const prefix = key.split(':')[0] || 'ungrouped';
    if (!groupedProperties[prefix]) {
      groupedProperties[prefix] = [];
    }
    groupedProperties[prefix].push([key, value]);
  });

  return (
    <VStack spacing={3} align="stretch">
      {Object.entries(groupedProperties).map(([group, properties]) => {
        const shouldCollapse = properties.length > 1;
        const isExpanded = shouldCollapse ? (expandedGroups?.[group] || false) : true;
        
        return (
          <Box key={group}>
            {shouldCollapse ? (
              <>
                <HStack
                  cursor="pointer"
                  onClick={() => setExpandedGroups?.(prev => ({ ...prev, [group]: !isExpanded }))}
                  p={2}
                  bg="gray.700"
                  borderRadius="md"
                  _hover={{ bg: "gray.650" }}
                >
                  <IconButton
                    size="xs"
                    variant="ghost"
                    icon={isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                    aria-label="Toggle group"
                  />
                  <Text fontWeight="semibold" color="#FFD230">
                    {group} ({properties.length})
                  </Text>
                </HStack>
                <Collapse in={isExpanded} animateOpacity>
                  <Box mt={2}>
                    <Table size="sm" variant="simple">
                      <Tbody>
                        {properties.map(([key, value]) => (
                          <Tr key={key}>
                            <Td fontWeight="semibold" color="gray.300" width="40%" py={1}>
                              {key}
                            </Td>
                            <Td py={1} fontSize="sm">
                              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </Box>
                </Collapse>
              </>
            ) : (
              <Box>
                <Text fontWeight="semibold" color="#FFD230" mb={2} fontSize="sm">
                  {group}
                </Text>
                <Table size="sm" variant="simple">
                  <Tbody>
                    {properties.map(([key, value]) => (
                      <Tr key={key}>
                        <Td fontWeight="semibold" color="gray.300" width="40%" py={1}>
                          {key}
                        </Td>
                        <Td py={1} fontSize="sm">
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            )}
          </Box>
        );
      })}
    </VStack>
  );
};

const AssetDetailsModal = ({
  isOpen,
  onClose,
  selectedItem,
  copyToClipboard,
  showScores = SEARCH_DEFAULTS.showScores,
  plugins,
  getHeaders,
  apiUrl,
  serverUrl,
  triggerReindexAllPlugins,
  triggerReindexIndividualPlugin,
  onTagsChanged,
}) => {
  const [pluginStatuses, setPluginStatuses] = useState({});
  const { t } = useTranslation();
  const [assetDependencies, setAssetDependencies] = useState(null);
  const [assetInverseDependencies, setAssetInverseDependencies] = useState(null);
  const [usdProperties, setUsdProperties] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [loadingDeps, setLoadingDeps] = useState(false);
  const [loadingInverseDeps, setLoadingInverseDeps] = useState(false);
  const [loadingUsdProps, setLoadingUsdProps] = useState(false);

  // [DemoFix] 安全阀：如果加载状态超过 10 秒未结束，自动清除并标记超时
  useEffect(() => {
    if (!loadingDeps && !loadingInverseDeps && !loadingUsdProps) return;
    const timer = setTimeout(() => {
      if (loadingDeps) setLoadingDeps(false);
      if (loadingInverseDeps) setLoadingInverseDeps(false);
      if (loadingUsdProps) setLoadingUsdProps(false);
    }, 10000);
    return () => clearTimeout(timer);
  }, [loadingDeps, loadingInverseDeps, loadingUsdProps]);
  
  const { isOpen: isExplanationsOpen, onToggle: toggleExplanations } = useDisclosure();
  const { isOpen: isMetadataOpen, onToggle: toggleMetadata } = useDisclosure();
  const { isOpen: isVlmMetadataOpen, onToggle: toggleVlmMetadata } = useDisclosure();
  const { isOpen: isUsdPropsOpen, onToggle: toggleUsdProps } = useDisclosure();
  const { isOpen: isDepsOpen, onToggle: toggleDeps } = useDisclosure();
  const { isOpen: isInverseDepsOpen, onToggle: toggleInverseDeps } = useDisclosure();
  const { isOpen: isTechnicalOpen, onToggle: toggleTechnical } = useDisclosure();
  const { isOpen: isTagsOpen, onToggle: toggleTags } = useDisclosure({ defaultIsOpen: true });
  const { isOpen: isIndexMgmtOpen, onToggle: toggleIndexMgmt } = useDisclosure({ defaultIsOpen: false });

  // [TagFilterSearch] 读取 EditableTagsPanel 最新 tags 的 ref
  const tagsSnapshotRef = useRef(null);
  const handleTagsSnapshot = useCallback(({ getLatestTags }) => {
    tagsSnapshotRef.current = getLatestTags;
  }, []);

  // [TagFilterSearch] 关闭 Modal 时把最新 tags 上报给父组件
  const handleClose = useCallback(() => {
    if (onTagsChanged && tagsSnapshotRef.current && selectedItem) {
      const assetId = selectedItem.source?.url || selectedItem.source?.base_key || '';
      const latestTags = tagsSnapshotRef.current();
      if (assetId && Array.isArray(latestTags)) {
        onTagsChanged(assetId, latestTags);
      }
    }
    onClose();
  }, [onClose, onTagsChanged, selectedItem]);

  // === LM CUSTOMIZATION: detail-modal-revamp START ===
  // URL 行复制按钮的反馈状态
  const [urlCopiedAt, setUrlCopiedAt] = useState(0);
  // 详情面板的"显示技术字段"开关
  const [showTechFields, setShowTechFields] = useState(false);
  // 高级面板折叠组的展开状态（持久化偏好；默认值：管理员模式开 / 普通模式关，
  // 但 localStorage 中显式写过的值优先）
  const [isAdvancedPanelsOpen, setIsAdvancedPanelsOpen] = useState(() => {
    try {
      if (typeof window === "undefined") return ADVANCED_MODE;
      const saved = window.localStorage.getItem("lm_advanced_panels_open");
      if (saved === "1") return true;
      if (saved === "0") return false;
      return ADVANCED_MODE;
    } catch (e) {
      return ADVANCED_MODE;
    }
  });
  const toggleAdvancedPanels = useCallback(() => {
    setIsAdvancedPanelsOpen((prev) => {
      const next = !prev;
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("lm_advanced_panels_open", next ? "1" : "0");
        }
      } catch (e) { /* ignore quota / privacy mode */ }
      return next;
    });
  }, []);
  // 复制反馈定时器句柄（卸载时清理）
  const urlCopyTimerRef = useRef(null);

  // 卸载时清理定时器，避免在已卸载组件上 setState 报警告
  useEffect(() => {
    return () => {
      if (urlCopyTimerRef.current) clearTimeout(urlCopyTimerRef.current);
    };
  }, []);
  // === LM CUSTOMIZATION: detail-modal-revamp END ===


  
  const overallStatus = calculateOverallIndexStatus(pluginStatuses);

  // Load dependencies when collapse is opened
  const loadDependencies = async (forceReload = false) => {
    if (loadingDeps || (!forceReload && assetDependencies)) return;
    
    const url = baseKey;
    if (!url || !getHeaders) return;
    
    setLoadingDeps(true);
    try {
      const payload = {
        root_node_url: url,
        limit: 10000,
      };
      const headers = getHeaders();
      const requestOptions = {
        method: "GET",
        headers: headers,
      };
      const endpoint = `${apiUrl}/dependency_graph/graph?`;
      const response = await fetch(
        endpoint + new URLSearchParams(payload).toString(),
        requestOptions,
      );
      if (response.ok) {
        const data = await response.json();
        setAssetDependencies(data || []);
      }
    } catch (error) {
      console.error('Error loading dependencies:', error);
    } finally {
      setLoadingDeps(false);
    }
  };

  // Load inverse dependencies when collapse is opened
  const loadInverseDependencies = async (forceReload = false) => {
    if (loadingInverseDeps || (!forceReload && assetInverseDependencies)) return;
    
    const url = baseKey;
    if (!url || !getHeaders) return;
    
    setLoadingInverseDeps(true);
    try {
      const payload = {
        root_node_url: url,
        limit: 10000,
      };
      const headers = getHeaders();
      const requestOptions = {
        method: "GET",
        headers: headers,
      };
      const endpoint = `${apiUrl}/dependency_graph/inverse/graph?`;
      const response = await fetch(
        endpoint + new URLSearchParams(payload).toString(),
        requestOptions,
      );
      if (response.ok) {
        const data = await response.json();
        setAssetInverseDependencies(data || []);
      }
    } catch (error) {
      console.error('Error loading inverse dependencies:', error);
    } finally {
      setLoadingInverseDeps(false);
    }
  };

  // Load USD properties when collapse is opened
  const loadUSDProperties = async (forceReload = false) => {
    if (loadingUsdProps || (!forceReload && usdProperties)) return;
    
    const url = baseKey;
    if (!url || !getHeaders) return;
    
    setLoadingUsdProps(true);
    try {
      const payload = {
        scene_url: url
      };
      const headers = getHeaders();
      const requestOptions = {
        method: "GET",
        headers: headers,
      };
      const endpoint = `${apiUrl}/asset_graph/usd/scene_summary/?`;
      const response = await fetch(
        endpoint + new URLSearchParams(payload).toString(),
        requestOptions,
      );
      if (response.ok) {
        const data = await response.json();
        setUsdProperties(data?.default_prim?.properties || {});
      }
    } catch (error) {
      console.error('Error loading USD properties:', error);
    } finally {
      setLoadingUsdProps(false);
    }
  };

  // Effect to handle modal opening and selectedItem changes
  useEffect(() => {
    if (isOpen && selectedItem) {
      // Clear cached data when modal opens or asset changes
      setAssetDependencies(null);
      setAssetInverseDependencies(null);
      setUsdProperties(null);
      setExpandedGroups({});
      // === LM CUSTOMIZATION: detail-modal-revamp START ===
      setShowTechFields(false);
      setUrlCopiedAt(0);
      // === LM CUSTOMIZATION: detail-modal-revamp END ===
      
      // If collapse sections are already open, reload their data for the new asset
      // Use setTimeout to ensure state is cleared first
      const timerId = setTimeout(() => {
        if (isDepsOpen) {
          loadDependencies(true);
        }
        if (isInverseDepsOpen) {
          loadInverseDependencies(true);
        }
        if (isUsdPropsOpen) {
          loadUSDProperties(true);
        }
      }, 0);
      
      return () => clearTimeout(timerId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedItem]);

  // Handle toggle functions with lazy loading - always reload when opened
  const handleToggleDeps = () => {
    if (!isDepsOpen) {
      loadDependencies(true); // Force reload
    }
    toggleDeps();
  };

  const handleToggleInverseDeps = () => {
    if (!isInverseDepsOpen) {
      loadInverseDependencies(true); // Force reload
    }
    toggleInverseDeps();
  };

  const handleToggleUsdProps = () => {
    if (!isUsdPropsOpen) {
      loadUSDProperties(true); // Force reload
    }
    toggleUsdProps();
  };

  // Note: Image error handling is now managed by AssetImage component

  if (!selectedItem) {
    return null;
  }


  const baseKey = selectedItem.source?.base_key || selectedItem.source?.url || selectedItem.id;
  const filename = baseKey?.split('/').pop() || 'Unknown';

  // === LM CUSTOMIZATION: detail-modal-revamp START ===
  const isUrlJustCopied = urlCopiedAt > 0;
  const handleCopyUrlInline = () => {
    if (baseKey && copyToClipboard) copyToClipboard(baseKey);
    setUrlCopiedAt(Date.now());
    if (urlCopyTimerRef.current) clearTimeout(urlCopyTimerRef.current);
    urlCopyTimerRef.current = setTimeout(() => setUrlCopiedAt(0), 1500);
  };
  const tagCount = Array.isArray(selectedItem.source?.tags)
    ? selectedItem.source.tags.length
    : 0;
  // === LM CUSTOMIZATION: detail-modal-revamp END ===
  
  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="6xl">
      <ModalOverlay />
      <ModalContent bg="gray.800" color="white" maxH="90vh" boxShadow="0 0 20px 5px rgba(72, 187, 120, 0.3)" borderRadius="md">
        <ModalHeader borderBottomWidth="1px" borderColor="gray.600">
          <HStack pr={10}>
            <Text isTruncated flex={1}>{filename}</Text>
            {/* === LM CUSTOMIZATION: detail-modal-revamp START === */}
            {ADVANCED_MODE && (
              <Badge colorScheme="purple" variant="subtle">
                {t('adminMode')}
              </Badge>
            )}
            {/* === LM CUSTOMIZATION: detail-modal-revamp END === */}
            {showScores && (
              <Badge colorScheme="yellow">{t('scoreLabel')}{selectedItem.score?.toFixed(3)}</Badge>
            )}
          </HStack>
        </ModalHeader>
        <ModalCloseButton />
        
        <ModalBody overflowY="auto">
          <VStack spacing={6} align="stretch">
            {/* Image and Basic Info */}
            <Grid templateColumns="300px 1fr" gap={6}>
              <GridItem>
                {/* Asset Image */}
                <NavigableAssetImage
                  result={selectedItem}
                  getHeaders={getHeaders}
                  apiUrl={apiUrl}
                  width="100%"
                  height="250px"
                  borderRadius="md"
                />
              </GridItem>

              <GridItem>
                {/* Basic Asset Information */}
                <VStack spacing={4} align="stretch">
                  <Box>
                    <Text fontSize="lg" fontWeight="semibold" color="#FFD230" mb={2}>
                      {t('assetInformation')}
                    </Text>
                    <VStack spacing={2} align="stretch">
                      {/* Base Key / URL */}
                      {/* === LM CUSTOMIZATION: detail-modal-revamp START === */}
                      <HStack
                        align="flex-start"
                        spacing={2}
                        px={2}
                        mx={-2}
                        py={1}
                        borderRadius="md"
                        _hover={{ bg: 'whiteAlpha.50' }}
                        transition="background 0.15s"
                      >
                        <Text fontWeight="semibold" minW="100px">{t('url')}</Text>
                        <Text
                          fontSize="sm"
                          wordBreak="break-all"
                          flex={1}
                          fontFamily="mono"
                          userSelect="all"
                          cursor="text"
                        >
                          {baseKey}
                        </Text>
                        <Tooltip label={isUrlJustCopied ? t('urlCopied') : t('copyUrlTooltip')} placement="top">
                          <IconButton
                            size="xs"
                            variant="ghost"
                            aria-label={t('copyUrl')}
                            icon={isUrlJustCopied ? <CheckIcon color="green.300" /> : <CopyIcon />}
                            onClick={handleCopyUrlInline}
                          />
                        </Tooltip>
                      </HStack>
                      {/* === LM CUSTOMIZATION: detail-modal-revamp END === */}

                      {/* Essential Information */}
                      {selectedItem.source && (
                        <>
                          {selectedItem.source.name && (
                            <HStack>
                              <Text fontWeight="semibold" minW="100px">{t('name')}</Text>
                              <Text>{selectedItem.source.name}</Text>
                            </HStack>
                          )}
                          {selectedItem.source.ext && (
                            <HStack>
                              <Text fontWeight="semibold" minW="100px">{t('type')}</Text>
                              <Badge colorScheme="blue">{selectedItem.source.ext.toUpperCase()}</Badge>
                            </HStack>
                          )}
                          {selectedItem.source.size && (
                            <HStack>
                              <Text fontWeight="semibold" minW="100px">{t('size')}</Text>
                              <Text>{formatFileSize(selectedItem.source.size)}</Text>
                            </HStack>
                          )}
                          {selectedItem.source.created_timestamp && (
                            <HStack>
                              <Text fontWeight="semibold" minW="100px">{t('created')}</Text>
                              <Text fontSize="sm">{formatDate(selectedItem.source.created_timestamp)}</Text>
                            </HStack>
                          )}
                          {selectedItem.source.modified_timestamp && (
                            <HStack>
                              <Text fontWeight="semibold" minW="100px">{t('modified')}</Text>
                              <Text fontSize="sm">{formatDate(selectedItem.source.modified_timestamp)}</Text>
                            </HStack>
                          )}
                          {/* === LM CUSTOMIZATION: detail-modal-revamp START === */}
                          {/* pathType 字段已下沉到「详情」面板（业务字段），此处保留源码以便恢复 */}
                          {/*
                          {selectedItem.source.pathType && (
                            <HStack>
                              <Text fontWeight="semibold" minW="100px">{t('pathType')}</Text>
                              <Badge colorScheme="yellow" size="sm">{selectedItem.source.pathType}</Badge>
                            </HStack>
                          )}
                          */}
                          {/* status === 'None' 视为无意义信息隐藏 */}
                          {selectedItem.source.status && selectedItem.source.status !== 'None' && (
                            <HStack>
                              <Text fontWeight="semibold" minW="100px">{t('status')}</Text>
                              <Badge colorScheme="yellow" size="sm">
                                {selectedItem.source.status}
                              </Badge>
                            </HStack>
                          )}
                          {/* === LM CUSTOMIZATION: detail-modal-revamp END === */}
                        </>
                      )}
                    </VStack>
                  </Box>

                  {/* Search Scores */}
                  {showScores && (
                    <Box>
                      <Text fontSize="lg" fontWeight="semibold" color="#FFD230" mb={2}>
                        {t('searchScores')}
                      </Text>
                      <HStack spacing={4}>
                        <Badge colorScheme="yellow" p={2}>
                          {t('totalScore')}{selectedItem.score?.toFixed(3)}
                        </Badge>
                        <Badge colorScheme="blue" p={2}>
                          {t('rrfScoreLabel')}{selectedItem.rrf_score?.toFixed(3)}
                        </Badge>
                        {selectedItem.metadata?.rrf_rank && (
                          <Badge colorScheme="yellow" p={2}>
                            {t('rank')} #{selectedItem.metadata.rrf_rank}
                          </Badge>
                        )}
                      </HStack>
                    </Box>
                  )}
                </VStack>
              </GridItem>
            </Grid>


              {/* Tags */}
              <Box>
              <HStack
                justify="space-between" mb={2}
                onClick={toggleTags}
                cursor="pointer"
                px={3} mx={-3} py={1}
                borderRadius="md"
                _hover={{ bg: 'whiteAlpha.50' }}
                transition="background 0.15s"
              >
                <Text 
                  fontSize="lg" 
                  fontWeight="semibold" 
                  color="#FFD230"
                >
                  {t('tagsSection')}
                  {/* === LM CUSTOMIZATION: detail-modal-revamp START === */}
                  {tagCount > 0 && (
                    <Badge ml={2} colorScheme="yellow" variant="subtle">
                      {tagCount}
                    </Badge>
                  )}
                  {/* === LM CUSTOMIZATION: detail-modal-revamp END === */}
                </Text>
                <IconButton
                  size="sm"
                  variant="ghost"
                  icon={isTagsOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
                  aria-label="Toggle tags"
                  pointerEvents="none"
                />
              </HStack>
              <Collapse in={isTagsOpen} animateOpacity>
                <Box bg="gray.750" p={4} borderRadius="md" overflow="visible">
                  <EditableTagsPanel
                    serverUrl={serverUrl}
                    assetPath={baseKey}
                    initialTags={selectedItem.source.tags}
                    getHeaders={getHeaders}
                    apiUrl={apiUrl}
                    assetUrl={baseKey}
                    onTagsSnapshot={handleTagsSnapshot}
                  />
                  </Box>
              </Collapse>
            </Box>

            {/* Details */}
            {selectedItem.source && (
              <Box>
                <HStack
                  justify="space-between" mb={2}
                  onClick={toggleTechnical}
                  cursor="pointer"
                  px={3} mx={-3} py={1}
                  borderRadius="md"
                  _hover={{ bg: 'whiteAlpha.50' }}
                  transition="background 0.15s"
                >
                  <Text 
                    fontSize="lg" 
                    fontWeight="semibold" 
                    color="#FFD230"
                  >
                    {t('details')}
                  </Text>
                  <HStack spacing={1}>
                    {/* === LM CUSTOMIZATION: detail-modal-revamp START === */}
                    {isTechnicalOpen && (
                      <Button
                        size="xs"
                        variant="ghost"
                        colorScheme="yellow"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowTechFields((v) => !v);
                        }}
                      >
                        {showTechFields ? t('hideTechnicalFields') : t('showTechnicalFields')}
                      </Button>
                    )}
                    {/* === LM CUSTOMIZATION: detail-modal-revamp END === */}
                    <IconButton
                      size="sm"
                      variant="ghost"
                      icon={isTechnicalOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
                      aria-label="Toggle technical details"
                      pointerEvents="none"
                    />
                  </HStack>
                </HStack>
                <Collapse in={isTechnicalOpen} animateOpacity>
                  <Box bg="gray.750" p={4} borderRadius="md">
                    <Table size="sm" variant="simple">
                      <Thead>
                        <Tr>
                          <Th color="gray.300">{t('property')}</Th>
                          <Th color="gray.300">{t('value')}</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {/* === LM CUSTOMIZATION: detail-modal-revamp START === */}
                        {/* 业务字段（默认显示）：创建者 / 修改者 / 路径类型 */}
                        {selectedItem.source.created_by && (
                          <Tr>
                            <Td fontWeight="semibold" color="gray.300" width="30%">{t('createdBy')}</Td>
                            <Td fontSize="sm">{selectedItem.source.created_by}</Td>
                          </Tr>
                        )}
                        {selectedItem.source.modified_by && (
                          <Tr>
                            <Td fontWeight="semibold" color="gray.300" width="30%">{t('modifiedBy')}</Td>
                            <Td fontSize="sm">{selectedItem.source.modified_by}</Td>
                          </Tr>
                        )}
                        {selectedItem.source.pathType && (
                          <Tr>
                            <Td fontWeight="semibold" color="gray.300" width="30%">{t('pathType').replace(/[:：]\s*$/, '')}</Td>
                            <Td fontSize="sm">
                              <Badge colorScheme="yellow" size="sm">{selectedItem.source.pathType}</Badge>
                            </Td>
                          </Tr>
                        )}
                        {/* 创建者/修改者均缺失且未展开技术字段时，给出友好提示 */}
                        {!selectedItem.source.created_by &&
                          !selectedItem.source.modified_by &&
                          !selectedItem.source.pathType &&
                          !showTechFields && (
                          <Tr>
                            <Td colSpan={2} textAlign="center" color="gray.500" fontSize="sm" py={4}>
                              {t('showTechnicalFields')}
                            </Td>
                          </Tr>
                        )}

                        {/* 技术字段（受 showTechFields 开关控制） */}
                        {showTechFields && (
                          <>
                            {selectedItem.source.etag && (
                              <Tr>
                                <Td fontWeight="semibold" color="gray.300" width="30%">{t('etag')}</Td>
                                <Td fontSize="sm" fontFamily="mono">{selectedItem.source.etag}</Td>
                              </Tr>
                            )}
                            {selectedItem.source.hash_value && (
                              <Tr>
                                <Td fontWeight="semibold" color="gray.300" width="30%">{t('hashValue')}</Td>
                                <Td fontSize="sm" fontFamily="mono">{selectedItem.source.hash_value}</Td>
                              </Tr>
                            )}
                            {selectedItem.source.empty !== undefined && (
                              <Tr>
                                <Td fontWeight="semibold" color="gray.300" width="30%">{t('empty')}</Td>
                                <Td fontSize="sm">{selectedItem.source.empty ? t('yes') : t('no')}</Td>
                              </Tr>
                            )}
                            {selectedItem.source.on_mount !== undefined && (
                              <Tr>
                                <Td fontWeight="semibold" color="gray.300" width="30%">{t('onMount')}</Td>
                                <Td fontSize="sm">{selectedItem.source.on_mount ? t('yes') : t('no')}</Td>
                              </Tr>
                            )}
                            {selectedItem.source.content_type && (
                              <Tr>
                                <Td fontWeight="semibold" color="gray.300" width="30%">{t('contentType')}</Td>
                                <Td fontSize="sm">{selectedItem.source.content_type}</Td>
                              </Tr>
                            )}
                            {selectedItem.source.mime_type && (
                              <Tr>
                                <Td fontWeight="semibold" color="gray.300" width="30%">{t('mimeType')}</Td>
                                <Td fontSize="sm">{selectedItem.source.mime_type}</Td>
                              </Tr>
                            )}
                            {selectedItem.source.is_directory !== undefined && (
                              <Tr>
                                <Td fontWeight="semibold" color="gray.300" width="30%">{t('isDirectory')}</Td>
                                <Td fontSize="sm">{selectedItem.source.is_directory ? t('yes') : t('no')}</Td>
                              </Tr>
                            )}
                            {selectedItem.source.permissions && (
                              <Tr>
                                <Td fontWeight="semibold" color="gray.300" width="30%">{t('permissions')}</Td>
                                <Td fontSize="sm">{selectedItem.source.permissions}</Td>
                              </Tr>
                            )}
                            {selectedItem.source.checksum && (
                              <Tr>
                                <Td fontWeight="semibold" color="gray.300" width="30%">{t('checksum')}</Td>
                                <Td fontSize="sm" fontFamily="mono">{selectedItem.source.checksum}</Td>
                              </Tr>
                            )}
                            {selectedItem.source.version && (
                              <Tr>
                                <Td fontWeight="semibold" color="gray.300" width="30%">{t('version')}</Td>
                                <Td fontSize="sm">{selectedItem.source.version}</Td>
                              </Tr>
                            )}
                            {/* Additional fields that might exist */}
                            {Object.entries(selectedItem.source).map(([key, value]) => {
                              const skipFields = [
                                'base_key', 'url', 'name', 'ext', 'size', 'created_timestamp',
                                'modified_timestamp', 'pathType', 'status', 'image',
                                'vision_generated_metadata', 'usd_properties', 'etag',
                                'hash_value', 'empty', 'on_mount', 'created_by', 'modified_by',
                                'content_type', 'mime_type', 'is_directory', 'permissions',
                                'checksum', 'version', 'path', 'tags'
                              ];

                              if (skipFields.includes(key) || value === null || value === undefined || value === '') {
                                return null;
                              }

                              const fieldNamesMap = {
                                'type': t('type'),
                                'created': t('created'),
                                'modified': t('modified'),
                                'created_timestamp': t('created'),
                                'modified_timestamp': t('modified'),
                                'created_by': t('createdBy'),
                                'modified_by': t('modifiedBy'),
                                'ext': t('type'),
                                'pathType': t('pathType'),
                                'status': t('status'),
                                'size': t('size'),
                                'hash_value': t('hashValue'),
                                'hash': t('hashValue'),
                                'hash_type': t('hashType'),
                                'checksum': t('checksum'),
                              };
                              const displayName = fieldNamesMap[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

                              return (
                                <Tr key={key}>
                                  <Td fontWeight="semibold" color="gray.300" width="30%">
                                    {displayName}
                                  </Td>
                                  <Td fontSize="sm">
                                    {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                                  </Td>
                                </Tr>
                              );
                            })}
                          </>
                        )}
                        {/* === LM CUSTOMIZATION: detail-modal-revamp END === */}
                      </Tbody>
                    </Table>
                  </Box>
                </Collapse>
              </Box>
            )}

            {/* === LM CUSTOMIZATION: advanced-panels-collapse START === */}
            {/* 分隔区：显示/隐藏高级面板按钮 */}
            <Box position="relative" py={2}>
              <Box borderTopWidth="1px" borderColor="gray.600" position="absolute" top="50%" left={0} right={0} />
              <HStack justify="center" position="relative">
                <Button
                  size="sm"
                  variant="ghost"
                  colorScheme="yellow"
                  onClick={toggleAdvancedPanels}
                  rightIcon={isAdvancedPanelsOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
                >
                  {isAdvancedPanelsOpen ? t('hideAdvancedPanels') : t('showAdvancedPanels')}
                </Button>
              </HStack>
            </Box>

            {/* 高级面板组（懒挂载：折叠时不渲染，避免 GraphVisualization 等重组件副作用） */}
            <Collapse in={isAdvancedPanelsOpen} animateOpacity unmountOnExit>
              <VStack spacing={6} align="stretch">

            {/* Dependencies */}
            <Box>
              <HStack
                justify="space-between" mb={2}
                onClick={handleToggleDeps}
                cursor="pointer"
                px={3} mx={-3} py={1}
                borderRadius="md"
                _hover={{ bg: 'whiteAlpha.50' }}
                transition="background 0.15s"
              >
                <Text fontSize="lg" fontWeight="semibold" color="#FFD230">
                  {t('dependencies')}
                </Text>
                <IconButton
                  size="sm"
                  variant="ghost"
                  icon={isDepsOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
                  aria-label="Toggle dependencies"
                  pointerEvents="none"
                />
              </HStack>
              <Collapse in={isDepsOpen} animateOpacity>
                <Box bg="gray.750" p={4} borderRadius="md">
                  {loadingDeps ? (
                    <Box textAlign="center" py={8}>
                      <CircularProgress isIndeterminate size="40px" />
                      <Text mt={2} fontSize="sm" color="gray.400">{t('loadingDependencies')}</Text>
                    </Box>
                  ) : assetDependencies && (assetDependencies.nodes?.length > 0 || assetDependencies.edges?.length > 0) ? (
                    <GraphVisualization data={assetDependencies} />
                  ) : (
                    <Box textAlign="center" py={8} color="gray.400">
                      <Text>{t('noDependencies')}</Text>
                    </Box>
                  )}
                </Box>
              </Collapse>
            </Box>

            {/* Inverse Dependencies */}
            <Box>
              <HStack
                justify="space-between" mb={2}
                onClick={handleToggleInverseDeps}
                cursor="pointer"
                px={3} mx={-3} py={1}
                borderRadius="md"
                _hover={{ bg: 'whiteAlpha.50' }}
                transition="background 0.15s"
              >
                <Text fontSize="lg" fontWeight="semibold" color="#FFD230">
                  {t('inverseDependencies')}
                </Text>
                <IconButton
                  size="sm"
                  variant="ghost"
                  icon={isInverseDepsOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
                  aria-label="Toggle inverse dependencies"
                  pointerEvents="none"
                />
              </HStack>
              <Collapse in={isInverseDepsOpen} animateOpacity>
                <Box bg="gray.750" p={4} borderRadius="md">
                  {loadingInverseDeps ? (
                    <Box textAlign="center" py={8}>
                      <CircularProgress isIndeterminate size="40px" />
                      <Text mt={2} fontSize="sm" color="gray.400">{t('loadingInverseDependencies')}</Text>
                    </Box>
                  ) : assetInverseDependencies && (assetInverseDependencies.nodes?.length > 0 || assetInverseDependencies.edges?.length > 0) ? (
                    <GraphVisualization data={assetInverseDependencies} isInverse={true} />
                  ) : (
                    <Box textAlign="center" py={8} color="gray.400">
                      <Text>{t('noInverseDependencies')}</Text>
                    </Box>
                  )}
                </Box>
              </Collapse>
            </Box>

            {/* USD Properties */}
            <Box>
              <HStack
                justify="space-between" mb={2}
                onClick={handleToggleUsdProps}
                cursor="pointer"
                px={3} mx={-3} py={1}
                borderRadius="md"
                _hover={{ bg: 'whiteAlpha.50' }}
                transition="background 0.15s"
              >
                <Text fontSize="lg" fontWeight="semibold" color="#FFD230">
                  {t('usdProperties')}
                </Text>
                <IconButton
                  size="sm"
                  variant="ghost"
                  icon={isUsdPropsOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
                  aria-label="Toggle USD properties"
                  pointerEvents="none"
                />
              </HStack>
              <Collapse in={isUsdPropsOpen} animateOpacity>
                <Box bg="gray.750" p={4} borderRadius="md">
                  {loadingUsdProps ? (
                    <Box textAlign="center" py={8}>
                      <CircularProgress isIndeterminate size="40px" />
                      <Text mt={2} fontSize="sm" color="gray.400">{t('loadingUsdProperties')}</Text>
                    </Box>
                  ) : (
                    <USDPropertiesTable
                      usdProperties={usdProperties}
                      expandedGroups={expandedGroups}
                      setExpandedGroups={setExpandedGroups}
                    />
                  )}
                </Box>
              </Collapse>
            </Box>

            {/* Index Management */}
            <Box>
              <HStack
                justify="space-between" mb={2}
                onClick={toggleIndexMgmt}
                cursor="pointer"
                px={3} mx={-3} py={1}
                borderRadius="md"
                _hover={{ bg: 'whiteAlpha.50' }}
                transition="background 0.15s"
              >
                <Text fontSize="lg" fontWeight="semibold" color="#FFD230">
                  {t('indexManagement')}
                </Text>
                <IconButton
                  size="sm"
                  variant="ghost"
                  icon={isIndexMgmtOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
                  aria-label="Toggle index management"
                  pointerEvents="none"
                />
              </HStack>
              <Collapse in={isIndexMgmtOpen} animateOpacity>
                <Box bg="gray.750" p={4} borderRadius="md">
                  <HStack justify="center" spacing={4} mb={4}>
                    <HStack spacing={2} align="center">
                      <Text fontSize="sm" fontWeight="bold">{t('indexStatus')}</Text>
                      <Text fontSize="sm" color={overallStatus.color} fontWeight="bold">
                        {overallStatus.status}
                      </Text>
                    </HStack>
                  </HStack>
                  <HStack spacing={4} justify="center" wrap="wrap">
                    <IconButton
                      size="sm"
                      icon={<RepeatIcon />}
                      aria-label={t('refreshAllData')}
                      onClick={() => {
                        loadDependencies(true);
                        loadInverseDependencies(true);
                        loadUSDProperties(true);
                      }}
                    />
                    <Button
                      size="sm"
                      colorScheme="blue"
                      onClick={() => {
                        const url = baseKey;
                        if (url) {
                          triggerReindexAllPlugins?.(url);
                        }
                      }}
                    >
                      {t('reindexAll')}
                    </Button>
                    <Popover>
                      <PopoverTrigger>
                        <Button
                          size="sm"
                          variant="outline"
                          rightIcon={<ChevronDownIcon />}
                        >
                          {t('individualPlugins')}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent>
                        <PopoverArrow />
                        <PopoverCloseButton />
                        <PopoverHeader>{t('reindexIndividualPlugins')}</PopoverHeader>
                        <PopoverBody>
                          <PluginStatusTable 
                            url={baseKey}
                            plugins={plugins || { active: [], inactive: [] }}
                            triggerReindexIndividualPlugin={triggerReindexIndividualPlugin}
                            getHeaders={getHeaders}
                            onStatusChange={setPluginStatuses}
                          />
                        </PopoverBody>
                      </PopoverContent>
                    </Popover>
                  </HStack>
                </Box>
              </Collapse>
            </Box>

            {/* Search Explanations (conditional) */}
            {selectedItem.metadata?.explanations && selectedItem.metadata.explanations.length > 0 && (
              <Box>
                <HStack
                  justify="space-between" mb={2}
                  onClick={toggleExplanations}
                  cursor="pointer"
                  px={3} mx={-3} py={1}
                  borderRadius="md"
                  _hover={{ bg: 'whiteAlpha.50' }}
                  transition="background 0.15s"
                >
                  <Text fontSize="lg" fontWeight="semibold" color="#FFD230">
                    {t('searchMatchExplanations')}
                  </Text>
                  <IconButton
                    size="sm"
                    variant="ghost"
                    icon={isExplanationsOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
                    aria-label="Toggle explanations"
                    pointerEvents="none"
                  />
                </HStack>
                <Collapse in={isExplanationsOpen} animateOpacity>
                  <Box bg="gray.750" p={4} borderRadius="md">
                    <SearchExplanations
                      explanations={selectedItem.metadata.explanations}
                      totalScore={selectedItem.score}
                      rrfRank={selectedItem.metadata?.rrf_rank}
                      originalRanks={selectedItem.metadata?.original_ranks || {}}
                      showSummary={true}
                    />
                  </Box>
                </Collapse>
              </Box>
            )}

            {/* AI Generated Metadata (conditional) */}
            {selectedItem.source?.vision_generated_metadata && 
             Object.keys(selectedItem.source.vision_generated_metadata).length > 0 && (
              <Box>
                <HStack
                  justify="space-between" mb={2}
                  onClick={toggleMetadata}
                  cursor="pointer"
                  px={3} mx={-3} py={1}
                  borderRadius="md"
                  _hover={{ bg: 'whiteAlpha.50' }}
                  transition="background 0.15s"
                >
                  <Text fontSize="lg" fontWeight="semibold" color="#FFD230">
                    {t('aiGeneratedMetadata')}
                  </Text>
                  <IconButton
                    size="sm"
                    variant="ghost"
                    icon={isMetadataOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
                    aria-label="Toggle metadata"
                    pointerEvents="none"
                  />
                </HStack>
                <Collapse in={isMetadataOpen} animateOpacity>
                  <Box bg="gray.750" p={4} borderRadius="md">
                    <Table size="sm" variant="simple">
                      <Thead>
                        <Tr>
                          <Th color="gray.300">{t('field')}</Th>
                          <Th color="gray.300">{t('value')}</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {Object.entries(selectedItem.source.vision_generated_metadata).map(([key, value]) => (
                          <Tr key={key}>
                            <Td fontWeight="semibold" color="gray.300" width="30%">
                              {key.replace('vision_generated_', '').replace(/_/g, ' ')}
                            </Td>
                            <Td>{value}</Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </Box>
                </Collapse>
              </Box>
            )}

            {/* VLM Generated Metadata (conditional) */}
            {selectedItem.source && Object.keys(selectedItem.source).some(key => key.endsWith('_vlm_generated')) && (
              <Box>
                <HStack
                  justify="space-between" mb={2}
                  onClick={toggleVlmMetadata}
                  cursor="pointer"
                  px={3} mx={-3} py={1}
                  borderRadius="md"
                  _hover={{ bg: 'whiteAlpha.50' }}
                  transition="background 0.15s"
                >
                  <Text fontSize="lg" fontWeight="semibold" color="#FFD230">
                    {t('vlmMetadata')}
                  </Text>
                  <IconButton
                    size="sm"
                    variant="ghost"
                    icon={isVlmMetadataOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
                    aria-label="Toggle VLM metadata"
                    pointerEvents="none"
                  />
                </HStack>
                <Collapse in={isVlmMetadataOpen} animateOpacity>
                  <Box bg="gray.750" p={4} borderRadius="md">
                    <Table size="sm" variant="simple">
                      <Thead>
                        <Tr>
                          <Th color="gray.300">{t('field')}</Th>
                          <Th color="gray.300">{t('value')}</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {Object.entries(selectedItem.source)
                          .filter(([key]) => key.endsWith('_vlm_generated'))
                          .map(([fieldKey, fieldValue]) => 
                            Array.isArray(fieldValue) ? fieldValue.map((item, index) => (
                              <Tr key={`${fieldKey}-${index}`}>
                                <Td fontWeight="semibold" color="gray.300" width="30%">
                                  {item.name}
                                </Td>
                                <Td>
                                  {Array.isArray(item.value_text) ? item.value_text.join(', ') : 
                                   typeof item.value_bool !== 'undefined' ? item.value_bool.toString() : 
                                   item.value_text || ''}
                                </Td>
                              </Tr>
                            )) : null
                          ).flat().filter(Boolean)}
                      </Tbody>
                    </Table>
                  </Box>
                </Collapse>
              </Box>
            )}

            {/* AGS Data (conditional) */}
            {selectedItem.ags_data?.root_prims && 
             selectedItem.ags_data.root_prims.length > 0 && (
              <Box>
                <Text fontSize="lg" fontWeight="semibold" color="#FFD230" mb={3}>
                  {t('usdSceneData')}
                </Text>
                <Box bg="gray.750" p={4} borderRadius="md">
                  <VStack spacing={3} align="stretch">
                    {selectedItem.ags_data.root_prims.map((prim, index) => (
                      <Box key={index} p={3} bg="gray.700" borderRadius="md">
                        <HStack mb={2}>
                          <Text fontWeight="semibold" color="cyan.400">
                            {prim.usd_path}
                          </Text>
                          <Badge colorScheme="teal" size="sm">
                            {prim.prim_type}
                          </Badge>
                        </HStack>
                        {prim.properties && Object.keys(prim.properties).length > 0 && (
                          <Box ml={4}>
                            <Text fontSize="sm" fontWeight="semibold" color="gray.300" mb={2}>
                              {t('properties')}
                            </Text>
                            <Table size="sm" variant="simple">
                              <Tbody>
                                {Object.entries(prim.properties).map(([key, value]) => (
                                  <Tr key={key}>
                                    <Td fontWeight="semibold" color="gray.300" width="30%" py={1}>
                                      {key}
                                    </Td>
                                    <Td py={1} fontSize="sm">
                                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                    </Td>
                                  </Tr>
                                ))}
                              </Tbody>
                            </Table>
                          </Box>
                        )}
                      </Box>
                    ))}
                  </VStack>
                </Box>
              </Box>
            )}

              </VStack>
            </Collapse>
            {/* === LM CUSTOMIZATION: advanced-panels-collapse END === */}

          </VStack>
        </ModalBody>

        <ModalFooter borderTopWidth="1px" borderColor="gray.600">
          <HStack>
            <Button 
              colorScheme="yellow" 
              leftIcon={isUrlJustCopied ? <CheckIcon color="green.300" /> : <CopyIcon />}
              onClick={handleCopyUrlInline}
            >
              {isUrlJustCopied ? t('urlCopied') : t('copyUrl')}
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default React.memo(AssetDetailsModal);
