/**
 * ConditionalPanels — 条件性折叠子项组合（搜索匹配解释 / AI 元数据 / VLM 元数据）
 *
 * 与 NVIDIA 原版 AssetDetailsModal 中三段条件渲染保持行为一致：
 *  - 仅当 `selectedItem.metadata.explanations`         有值时显示「搜索匹配解释」
 *  - 仅当 `selectedItem.source.vision_generated_metadata` 非空时显示「AI 元数据」
 *  - 仅当 `selectedItem.source` 中存在以 `_vlm_generated` 结尾的 key 时显示「VLM 元数据」
 *
 * 任一条件不满足，对应子项 **完全不渲染**，不留空标题占位。
 */

import React from "react";
import { Box, Table, Thead, Tbody, Tr, Th, Td, Text } from "@chakra-ui/react";
import { useTranslation } from "../../i18n/LanguageContext";
import SearchExplanations from "../../SearchExplanations";
import AdvancedSubPanel from "./AdvancedSubPanel";
import { fabColors, fabSpacing } from "../../theme/fabTokens";

// ---------- 通用 key/value 二列表格 ----------
const KeyValueTable = ({ rows }) => {
  const { t } = useTranslation();
  if (!rows || rows.length === 0) return null;
  return (
    <Table size="sm" variant="simple">
      <Thead>
        <Tr>
          <Th
            color={fabColors.textSecondary}
            borderColor={fabColors.borderFaint}
            fontSize="10px"
            textTransform="uppercase"
            letterSpacing="0.06em"
          >
            {t("field")}
          </Th>
          <Th
            color={fabColors.textSecondary}
            borderColor={fabColors.borderFaint}
            fontSize="10px"
            textTransform="uppercase"
            letterSpacing="0.06em"
          >
            {t("value")}
          </Th>
        </Tr>
      </Thead>
      <Tbody>
        {rows.map(({ key, label, value }) => (
          <Tr key={key}>
            <Td
              fontWeight="500"
              color={fabColors.textSecondary}
              width="35%"
              py={fabSpacing["1"]}
              borderColor={fabColors.borderFaint}
              fontSize="xs"
              wordBreak="break-all"
            >
              {label}
            </Td>
            <Td
              color={fabColors.textPrimary}
              py={fabSpacing["1"]}
              borderColor={fabColors.borderFaint}
              fontSize="xs"
              wordBreak="break-word"
            >
              {value}
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
};

// ---------- 搜索匹配解释 ----------
export const SearchExplanationsSubPanel = ({ asset, defaultOpen = false }) => {
  const { t } = useTranslation();
  const explanations = asset?.metadata?.explanations;
  if (!explanations || explanations.length === 0) return null;
  return (
    <AdvancedSubPanel
      title={t("searchExplanations")}
      defaultOpen={defaultOpen}
      testId="drawer-panel-search-explanations"
    >
      <Box maxH="320px" overflowY="auto" pr={fabSpacing["1"]}>
        <SearchExplanations
          explanations={explanations}
          totalScore={asset.score}
          rrfRank={asset.metadata?.rrf_rank}
          originalRanks={asset.metadata?.original_ranks || {}}
          showSummary={true}
        />
      </Box>
    </AdvancedSubPanel>
  );
};

// ---------- AI 生成元数据 ----------
export const AIGeneratedMetadataSubPanel = ({ asset, defaultOpen = false }) => {
  const { t } = useTranslation();
  const meta = asset?.source?.vision_generated_metadata;
  const entries = meta && typeof meta === "object" ? Object.entries(meta) : [];
  if (entries.length === 0) return null;

  const rows = entries.map(([key, value]) => ({
    key,
    label: key.replace("vision_generated_", "").replace(/_/g, " "),
    value:
      typeof value === "object"
        ? <Text as="span" fontFamily="mono" fontSize="11px">{JSON.stringify(value)}</Text>
        : String(value),
  }));

  return (
    <AdvancedSubPanel
      title={t("aiGeneratedMetadata")}
      count={rows.length}
      defaultOpen={defaultOpen}
      testId="drawer-panel-ai-metadata"
    >
      <Box maxH="320px" overflowY="auto" pr={fabSpacing["1"]}>
        <KeyValueTable rows={rows} />
      </Box>
    </AdvancedSubPanel>
  );
};

// ---------- VLM 元数据（key 以 _vlm_generated 结尾） ----------
export const VLMMetadataSubPanel = ({ asset, defaultOpen = false }) => {
  const { t } = useTranslation();
  const source = asset?.source;
  if (!source || typeof source !== "object") return null;

  const vlmEntries = Object.entries(source).filter(([key]) =>
    key.endsWith("_vlm_generated")
  );
  if (vlmEntries.length === 0) return null;

  // 展平所有数组项
  const rows = vlmEntries
    .flatMap(([fieldKey, fieldValue]) => {
      if (!Array.isArray(fieldValue)) return [];
      return fieldValue.map((item, idx) => {
        let valueText = "";
        if (Array.isArray(item.value_text)) {
          valueText = item.value_text.join(", ");
        } else if (typeof item.value_bool !== "undefined") {
          valueText = String(item.value_bool);
        } else {
          valueText = item.value_text || "";
        }
        return {
          key: `${fieldKey}-${idx}`,
          label: item.name,
          value: valueText,
        };
      });
    })
    .filter(Boolean);

  if (rows.length === 0) return null;

  return (
    <AdvancedSubPanel
      title={t("vlmMetadata")}
      count={rows.length}
      defaultOpen={defaultOpen}
      testId="drawer-panel-vlm-metadata"
    >
      <Box maxH="320px" overflowY="auto" pr={fabSpacing["1"]}>
        <KeyValueTable rows={rows} />
      </Box>
    </AdvancedSubPanel>
  );
};

// 组合导出（按需用 / 也可单独用）
const ConditionalPanels = ({ asset }) => (
  <>
    <SearchExplanationsSubPanel asset={asset} />
    <AIGeneratedMetadataSubPanel asset={asset} />
    <VLMMetadataSubPanel asset={asset} />
  </>
);

export default ConditionalPanels;
