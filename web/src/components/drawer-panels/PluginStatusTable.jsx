/**
 * PluginStatusTable（drawer 专用复刻）
 *
 * 复刻自 NVIDIA 原版 AssetDetailsModal 内部同名组件：
 *  - 拉取 `/info/indexing/asset/status?url=...` 获取每个插件最近一次状态
 *  - 显示 plugin 名 + 最新状态（colored）+ 单独 "重新索引" 按钮
 *  - 通过 onStatusChange 回调把 statuses 上报给父组件（IndexManagementSubPanel 用来计算 overall）
 *
 * 视觉：
 *  - 去掉 NVIDIA 原版的 gray.700 / blue colorScheme 硬编码
 *  - 改用 fabTokens（bgElevatedLow / borderFaint / textPrimary / textSecondary 等）
 *
 * 不修改 NVIDIA 原版 Modal 文件，保证合入安全。
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  IconButton,
  Tooltip,
  CircularProgress,
} from "@chakra-ui/react";
import { RepeatIcon } from "@chakra-ui/icons";
import { useTranslation } from "../../i18n/LanguageContext";
import { apiUrl } from "../../config";
import { fabColors, fabRadius, fabSpacing } from "../../theme/fabTokens";

// 与 Modal 中保持一致的颜色映射（直接用 fab 状态色）
const getStatusColor = (status) => {
  if (!status) return fabColors.textSecondary;
  const lower = status.toLowerCase();
  if (lower === "ok" || lower === "completed" || lower === "success") {
    return fabColors.success;
  }
  if (lower === "processing" || lower === "pending" || lower === "running") {
    return fabColors.informational;
  }
  if (lower === "queued") {
    return fabColors.warning;
  }
  return fabColors.critical;
};

const PluginStatusTable = ({
  url,
  plugins,
  triggerReindexIndividualPlugin,
  getHeaders,
  onStatusChange,
}) => {
  const { t } = useTranslation();
  const [pluginStatuses, setPluginStatuses] = useState({});
  const [pluginStatusDetails, setPluginStatusDetails] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  const fetchPluginStatuses = useCallback(async () => {
    if (!url) return;
    setIsLoading(true);
    try {
      const headers = getHeaders ? getHeaders() : {};
      const response = await fetch(
        `${apiUrl}/info/indexing/asset/status?url=${encodeURIComponent(url)}`,
        { headers }
      );
      if (response.status === 200) {
        const data = await response.json();
        const statuses = {};
        const statusDetails = {};
        if (data.plugins_statuses) {
          Object.entries(data.plugins_statuses).forEach(([pluginName, pluginData]) => {
            if (pluginData.plugin_status_history && pluginData.plugin_status_history.length > 0) {
              const firstStatus = pluginData.plugin_status_history[0];
              const status = firstStatus.status || "Unknown";
              statuses[pluginName] = status;
              statusDetails[pluginName] = {
                status,
                timestamp: firstStatus.processing_timestamp || null,
                exception: firstStatus.exception || null,
              };
            } else {
              statuses[pluginName] = "No status";
              statusDetails[pluginName] = { status: "No status", timestamp: null, exception: null };
            }
          });
        }
        setPluginStatuses(statuses);
        setPluginStatusDetails(statusDetails);
        if (onStatusChange) onStatusChange(statuses);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Error fetching plugin statuses:", err);
    } finally {
      setIsLoading(false);
    }
  }, [url, getHeaders, onStatusChange]);

  useEffect(() => {
    fetchPluginStatuses();
  }, [fetchPluginStatuses]);

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "No timestamp available";
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return timestamp;
      return date.toISOString().slice(0, 19).replace("T", " ");
    } catch (e) {
      return timestamp;
    }
  };

  const createTooltipContent = (pluginName) => {
    const details = pluginStatusDetails[pluginName];
    if (!details) return "No status information available";
    let content = `Status: ${details.status}`;
    if (details.timestamp) content += `\nTimestamp: ${formatTimestamp(details.timestamp)}`;
    if (details.exception) content += `\nException: ${details.exception}`;
    return content;
  };

  const activePlugins = plugins?.active || [];
  const pluginsWithStatus = activePlugins.filter((p) =>
    Object.prototype.hasOwnProperty.call(pluginStatuses, p.name)
  );
  const pluginsWithoutStatus = activePlugins.filter(
    (p) => !Object.prototype.hasOwnProperty.call(pluginStatuses, p.name)
  );

  if (isLoading) {
    return (
      <Box textAlign="center" p={fabSpacing["3"]}>
        <CircularProgress isIndeterminate size="32px" color={fabColors.iconPrimary} />
        <Text mt={fabSpacing["1"]} fontSize="xs" color={fabColors.textSecondary}>
          {t("loadingPluginStatuses")}
        </Text>
      </Box>
    );
  }

  const renderRow = (plugin, statusText) => {
    const statusColor = getStatusColor(statusText);
    return (
      <HStack
        key={plugin.name}
        justify="space-between"
        p={fabSpacing["2"]}
        bg={fabColors.bgElevatedLow}
        borderRadius={fabRadius["1.5"]}
        borderWidth="1px"
        borderColor={fabColors.borderFaint}
        spacing={fabSpacing["2"]}
      >
        <VStack align="start" spacing={0} flex={1} minW={0}>
          <Text fontSize="xs" fontWeight="600" color={fabColors.textPrimary} noOfLines={1}>
            {plugin.name}
          </Text>
          <Tooltip
            label={createTooltipContent(plugin.name)}
            placement="top"
            whiteSpace="pre-wrap"
          >
            <Text fontSize="11px" color={statusColor} noOfLines={1}>
              {statusText || "Unknown"}
            </Text>
          </Tooltip>
        </VStack>
        <Button
          size="xs"
          variant="outline"
          onClick={() => triggerReindexIndividualPlugin?.(url, plugin.name)}
        >
          {t("reindex")}
        </Button>
      </HStack>
    );
  };

  return (
    <Box>
      <HStack justify="space-between" align="center" mb={fabSpacing["2"]}>
        <Text fontSize="xs" color={fabColors.textSecondary}>
          {t("pluginStatusReindexing")}
        </Text>
        <Tooltip label={t("refreshPluginStatuses")}>
          <IconButton
            size="xs"
            variant="ghost"
            icon={<RepeatIcon />}
            onClick={fetchPluginStatuses}
            aria-label={t("refreshPluginStatuses")}
            isLoading={isLoading}
            color={fabColors.iconPrimary}
          />
        </Tooltip>
      </HStack>
      <VStack spacing={fabSpacing["1.5"]} align="stretch">
        {pluginsWithStatus.map((plugin) => renderRow(plugin, pluginStatuses[plugin.name]))}
        {pluginsWithoutStatus.map((plugin) => renderRow(plugin, t("noStatusAvailable")))}
      </VStack>
    </Box>
  );
};

export default PluginStatusTable;

// 计算总状态：与 NVIDIA 原版 calculateOverallIndexStatus 行为完全一致
export const calculateOverallIndexStatus = (pluginStatuses) => {
  if (!pluginStatuses || Object.keys(pluginStatuses).length === 0) {
    return { status: "Unknown", color: fabColors.textSecondary };
  }
  const statuses = Object.values(pluginStatuses);
  const hasError = statuses.some((s) => s && s.toLowerCase().includes("error"));
  const hasProcessing = statuses.some(
    (s) =>
      s &&
      (s.toLowerCase().includes("processing") ||
        s.toLowerCase().includes("pending") ||
        s.toLowerCase().includes("running") ||
        s.toLowerCase().includes("queued") ||
        s.toLowerCase().includes("thumbnail_missing"))
  );
  const allCompleted = statuses.every(
    (s) =>
      s &&
      (s.toLowerCase().includes("ok") ||
        s.toLowerCase().includes("completed") ||
        s.toLowerCase().includes("success") ||
        s.toLowerCase().includes("thumbnail_missing"))
  );

  if (hasError) return { status: "Error", color: fabColors.critical };
  if (allCompleted) return { status: "Ok", color: fabColors.success };
  if (hasProcessing) return { status: "Partial", color: fabColors.warning };
  return { status: "Unknown", color: fabColors.textSecondary };
};
