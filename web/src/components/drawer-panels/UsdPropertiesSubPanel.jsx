/**
 * UsdPropertiesSubPanel
 *
 * 资产「USD 属性表」抽屉子面板。
 *  - 内部包含 UsdPropertiesTable（复刻 NVIDIA 原版 AssetDetailsModal 中同名内部组件，
 *    去掉 #FFD230 / gray.700 硬编码，统一使用 fabTokens；保持 NVIDIA 文件不变）
 *  - 数据来自 useAssetAdvancedData hook
 *  - 表格容器 maxH 320px + overflowY auto，避免长属性表占满 Drawer
 */

import React, { useState } from "react";
import {
  Box,
  Text,
  Table,
  Tbody,
  Tr,
  Td,
  Collapse,
  HStack,
  IconButton,
  Button,
  CircularProgress,
  VStack,
} from "@chakra-ui/react";
import { ChevronDownIcon, ChevronUpIcon } from "@chakra-ui/icons";
import { useTranslation } from "../../i18n/LanguageContext";
import AdvancedSubPanel from "./AdvancedSubPanel";
import { fabColors, fabRadius, fabSpacing } from "../../theme/fabTokens";

// USD 属性表格组件（drawer 专用，不动 NVIDIA 原版 Modal 内部 USDPropertiesTable）
const UsdPropertiesTable = ({ usdProperties }) => {
  const { t } = useTranslation();
  const [expandedGroups, setExpandedGroups] = useState({});

  if (!usdProperties || Object.keys(usdProperties).length === 0) {
    return (
      <Box p={fabSpacing["3"]} textAlign="center" color={fabColors.textSecondary}>
        <Text fontSize="sm">{t("noUsdProperties")}</Text>
      </Box>
    );
  }

  // 按属性 key 第一个冒号前的前缀分组
  const groupedProperties = {};
  Object.entries(usdProperties).forEach(([key, value]) => {
    const prefix = key.split(":")[0] || "ungrouped";
    if (!groupedProperties[prefix]) groupedProperties[prefix] = [];
    groupedProperties[prefix].push([key, value]);
  });

  return (
    <VStack spacing={fabSpacing["2"]} align="stretch">
      {Object.entries(groupedProperties).map(([group, properties]) => {
        const shouldCollapse = properties.length > 1;
        const isExpanded = shouldCollapse ? expandedGroups[group] || false : true;
        return (
          <Box key={group}>
            {shouldCollapse ? (
              <>
                <HStack
                  cursor="pointer"
                  onClick={() =>
                    setExpandedGroups((prev) => ({ ...prev, [group]: !isExpanded }))
                  }
                  px={fabSpacing["2"]}
                  py={fabSpacing["1.5"]}
                  bg={fabColors.bgElevatedLow}
                  borderRadius={fabRadius["1"]}
                  _hover={{ bg: fabColors.bgMenu }}
                  transition="background-color 150ms ease"
                  spacing={fabSpacing["1.5"]}
                >
                  <IconButton
                    size="xs"
                    variant="ghost"
                    icon={isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                    aria-label="Toggle property group"
                    pointerEvents="none"
                  />
                  <Text
                    fontWeight="600"
                    color={fabColors.textPrimary}
                    fontSize="sm"
                    flex="1"
                    noOfLines={1}
                  >
                    {group}{" "}
                    <Text as="span" color={fabColors.textSecondary} fontWeight="400">
                      ({properties.length})
                    </Text>
                  </Text>
                </HStack>
                <Collapse in={isExpanded} animateOpacity>
                  <Box mt={fabSpacing["1"]}>
                    <Table size="sm" variant="simple">
                      <Tbody>
                        {properties.map(([key, value]) => (
                          <Tr key={key}>
                            <Td
                              fontWeight="500"
                              color={fabColors.textSecondary}
                              width="40%"
                              py={fabSpacing["1"]}
                              borderColor={fabColors.borderFaint}
                              fontSize="xs"
                              wordBreak="break-all"
                            >
                              {key}
                            </Td>
                            <Td
                              py={fabSpacing["1"]}
                              fontSize="xs"
                              color={fabColors.textPrimary}
                              borderColor={fabColors.borderFaint}
                              wordBreak="break-all"
                            >
                              {typeof value === "object"
                                ? JSON.stringify(value)
                                : String(value)}
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
                <Text
                  fontWeight="600"
                  color={fabColors.textPrimary}
                  mb={fabSpacing["1"]}
                  fontSize="sm"
                >
                  {group}
                </Text>
                <Table size="sm" variant="simple">
                  <Tbody>
                    {properties.map(([key, value]) => (
                      <Tr key={key}>
                        <Td
                          fontWeight="500"
                          color={fabColors.textSecondary}
                          width="40%"
                          py={fabSpacing["1"]}
                          borderColor={fabColors.borderFaint}
                          fontSize="xs"
                          wordBreak="break-all"
                        >
                          {key}
                        </Td>
                        <Td
                          py={fabSpacing["1"]}
                          fontSize="xs"
                          color={fabColors.textPrimary}
                          borderColor={fabColors.borderFaint}
                          wordBreak="break-all"
                        >
                          {typeof value === "object"
                            ? JSON.stringify(value)
                            : String(value)}
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

const UsdPropertiesSubPanel = ({ adv, defaultOpen = false }) => {
  const { t } = useTranslation();
  const data = adv?.usdProps;
  const isLoading = !!adv?.loading?.usdProps;
  const error = adv?.errors?.usdProps;
  const count = data && typeof data === "object" ? Object.keys(data).length : undefined;

  const renderContent = () => {
    if (isLoading) {
      return (
        <Box textAlign="center" py={fabSpacing["6"]}>
          <CircularProgress isIndeterminate size="32px" color={fabColors.iconPrimary} />
          <Text mt={fabSpacing["2"]} fontSize="xs" color={fabColors.textSecondary}>
            {t("loadingUsdProperties")}
          </Text>
        </Box>
      );
    }
    if (error) {
      return (
        <HStack justify="space-between" align="center" spacing={fabSpacing["3"]}>
          <Text fontSize="sm" color={fabColors.critical}>
            {t("detailsDrawerLoadFailed")}
          </Text>
          <Button size="xs" variant="outline" onClick={() => adv?.loadUSDProperties?.(true)}>
            {t("detailsDrawerRetry")}
          </Button>
        </HStack>
      );
    }
    return (
      <Box maxH="320px" overflowY="auto" pr={fabSpacing["1"]}>
        <UsdPropertiesTable usdProperties={data} />
      </Box>
    );
  };

  return (
    <AdvancedSubPanel
      title={t("usdProperties")}
      count={count}
      defaultOpen={defaultOpen}
      onToggleOpen={(next) => {
        if (next) adv?.loadUSDProperties?.();
      }}
      testId="drawer-panel-usd-properties"
    >
      {renderContent()}
    </AdvancedSubPanel>
  );
};

export default UsdPropertiesSubPanel;
