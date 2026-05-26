/**
 * IndexManagementSubPanel
 *
 * 资产「索引管理」抽屉子面板：
 *  - 显示 overall 状态（颜色文本）
 *  - 三个操作：刷新所有数据（IconButton） / 全部重新索引（主按钮 loading 态） / 单独插件（Popover + PluginStatusTable）
 *  - 重新索引完成后自动 refreshAll()
 *  - 未登录或 getHeaders 不可用时按钮置灰 + Tooltip
 */

import React, { useCallback, useState } from "react";
import {
  Box,
  HStack,
  VStack,
  Text,
  Button,
  IconButton,
  Tooltip,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverArrow,
  PopoverCloseButton,
  PopoverHeader,
  PopoverBody,
} from "@chakra-ui/react";
import { RepeatIcon, ChevronDownIcon } from "@chakra-ui/icons";
import { useTranslation } from "../../i18n/LanguageContext";
import AdvancedSubPanel from "./AdvancedSubPanel";
import PluginStatusTable, { calculateOverallIndexStatus } from "./PluginStatusTable";
import { fabColors, fabRadius, fabSpacing } from "../../theme/fabTokens";

const IndexManagementSubPanel = ({
  adv,
  plugins,
  triggerReindexAllPlugins,
  triggerReindexIndividualPlugin,
  getHeaders,
  isAuthorized = true,
  defaultOpen = false,
}) => {
  const { t } = useTranslation();
  const [pluginStatuses, setPluginStatuses] = useState({});
  const [reindexLoading, setReindexLoading] = useState(false);
  const overall = calculateOverallIndexStatus(pluginStatuses);
  const url = adv?.baseKey;

  const handleRefreshAll = useCallback(() => {
    adv?.refreshAll?.();
  }, [adv]);

  const handleReindexAll = useCallback(async () => {
    if (!url) return;
    setReindexLoading(true);
    try {
      await triggerReindexAllPlugins?.(url);
      // 重新索引触发后，刷新依赖/USD/反向依赖（Toast 由 trigger 函数自身负责）
      adv?.refreshAll?.();
    } finally {
      setReindexLoading(false);
    }
  }, [url, triggerReindexAllPlugins, adv]);

  const disabledTooltip = !isAuthorized
    ? t("detailsDrawerNoIndexPermission")
    : !url
    ? t("detailsDrawerNoAsset")
    : "";
  const disabled = !!disabledTooltip;

  return (
    <AdvancedSubPanel
      title={t("indexManagement")}
      defaultOpen={defaultOpen}
      testId="drawer-panel-index-management"
    >
      <VStack spacing={fabSpacing["3"]} align="stretch">
        {/* 状态行 */}
        <HStack
          justify="space-between"
          p={fabSpacing["2"]}
          bg={fabColors.bgElevatedLow}
          borderRadius={fabRadius["1.5"]}
          borderWidth="1px"
          borderColor={fabColors.borderFaint}
        >
          <Text fontSize="xs" color={fabColors.textSecondary} fontWeight="500">
            {t("indexStatus")}
          </Text>
          <HStack spacing={fabSpacing["1.5"]} align="center">
            <Box
              w="8px"
              h="8px"
              borderRadius="50%"
              bg={overall.color}
              boxShadow={`0 0 6px ${overall.color}`}
            />
            <Text fontSize="xs" color={overall.color} fontWeight="600">
              {overall.status}
            </Text>
          </HStack>
        </HStack>

        {/* 操作行 */}
        <HStack spacing={fabSpacing["2"]} wrap="wrap">
          <Tooltip
            label={disabled ? disabledTooltip : t("refreshAllData")}
            placement="top"
            hasArrow
          >
            <Box>
              <IconButton
                size="sm"
                icon={<RepeatIcon />}
                aria-label={t("refreshAllData")}
                onClick={handleRefreshAll}
                isDisabled={!url}
                variant="outline"
                color={fabColors.iconPrimary}
              />
            </Box>
          </Tooltip>

          <Tooltip
            label={disabled ? disabledTooltip : t("reindexAll")}
            placement="top"
            hasArrow
          >
            <Box>
              <Button
                size="sm"
                variant="solid"
                bg={fabColors.fillSecondaryDefault}
                color={fabColors.textPrimary}
                _hover={{ bg: fabColors.fillSecondaryHover }}
                onClick={handleReindexAll}
                isLoading={reindexLoading}
                isDisabled={disabled}
              >
                {t("reindexAll")}
              </Button>
            </Box>
          </Tooltip>

          <Popover>
            <PopoverTrigger>
              <Button
                size="sm"
                variant="outline"
                rightIcon={<ChevronDownIcon />}
                isDisabled={disabled}
              >
                {t("individualPlugins")}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              bg={fabColors.bgMenu}
              borderColor={fabColors.borderSubtle}
              maxW="380px"
            >
              <PopoverArrow bg={fabColors.bgMenu} />
              <PopoverCloseButton color={fabColors.iconPrimary} />
              <PopoverHeader
                color={fabColors.textPrimary}
                fontWeight="600"
                fontSize="sm"
                borderColor={fabColors.borderSubtle}
              >
                {t("reindexIndividualPlugins")}
              </PopoverHeader>
              <PopoverBody>
                <PluginStatusTable
                  url={url}
                  plugins={plugins || { active: [], inactive: [] }}
                  triggerReindexIndividualPlugin={triggerReindexIndividualPlugin}
                  getHeaders={getHeaders}
                  onStatusChange={setPluginStatuses}
                />
              </PopoverBody>
            </PopoverContent>
          </Popover>
        </HStack>
      </VStack>
    </AdvancedSubPanel>
  );
};

export default IndexManagementSubPanel;
