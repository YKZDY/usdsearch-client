/**
 * DependenciesSubPanel / InverseDependenciesSubPanel
 *
 * 资产「依赖图」与「反向依赖图」抽屉子面板。
 *  - 复用 NVIDIA 原版 `Graph.jsx` 中的 GraphVisualization 组件（不修改原版文件）
 *  - 数据来源：useAssetAdvancedData hook（懒加载 / 取消 / 缓存已在 hook 内处理）
 *  - 状态：loading / 空数据 / 失败 + 重试，三态全覆盖
 *  - 自适应：抽屉窄于 480px 时容器 maxW 100% + overflow auto，节点不溢出
 *
 * 用法：
 *   <DependenciesSubPanel adv={adv} />
 *   <InverseDependenciesSubPanel adv={adv} />
 */

import React from "react";
import { Box, Text, HStack, Button, CircularProgress } from "@chakra-ui/react";
import { useTranslation } from "../../i18n/LanguageContext";
import GraphVisualization from "../../Graph";
import AdvancedSubPanel from "./AdvancedSubPanel";
import { fabColors, fabSpacing } from "../../theme/fabTokens";

// ---------- 通用内容渲染：loading / empty / error / data ----------
const DependencyContent = ({
  data,
  isLoading,
  error,
  onRetry,
  loadingLabel,
  emptyLabel,
  isInverse = false,
}) => {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <Box textAlign="center" py={fabSpacing["6"]}>
        <CircularProgress isIndeterminate size="32px" color={fabColors.iconPrimary} />
        <Text mt={fabSpacing["2"]} fontSize="xs" color={fabColors.textSecondary}>
          {loadingLabel}
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
        <Button size="xs" variant="outline" onClick={onRetry}>
          {t("detailsDrawerRetry")}
        </Button>
      </HStack>
    );
  }

  const hasData = data && (data.nodes?.length > 0 || data.edges?.length > 0);
  if (!hasData) {
    return (
      <Box textAlign="center" py={fabSpacing["6"]} color={fabColors.textSecondary}>
        <Text fontSize="sm">{emptyLabel}</Text>
      </Box>
    );
  }

  return (
    <Box maxW="100%" overflowX="auto" overflowY="hidden">
      <GraphVisualization data={data} isInverse={isInverse} />
    </Box>
  );
};

// ---------- 依赖面板 ----------
export const DependenciesSubPanel = ({ adv, defaultOpen = false }) => {
  const { t } = useTranslation();
  const count =
    adv?.deps && (adv.deps.nodes?.length || 0);

  return (
    <AdvancedSubPanel
      title={t("dependencies")}
      count={count}
      defaultOpen={defaultOpen}
      onToggleOpen={(next) => {
        if (next) adv?.loadDependencies?.();
      }}
      testId="drawer-panel-dependencies"
    >
      <DependencyContent
        data={adv?.deps}
        isLoading={!!adv?.loading?.deps}
        error={adv?.errors?.deps}
        onRetry={() => adv?.loadDependencies?.(true)}
        loadingLabel={t("loadingDependencies")}
        emptyLabel={t("noDependencies")}
        isInverse={false}
      />
    </AdvancedSubPanel>
  );
};

// ---------- 反向依赖面板 ----------
export const InverseDependenciesSubPanel = ({ adv, defaultOpen = false }) => {
  const { t } = useTranslation();
  const count =
    adv?.inverseDeps && (adv.inverseDeps.nodes?.length || 0);

  return (
    <AdvancedSubPanel
      title={t("inverseDependencies")}
      count={count}
      defaultOpen={defaultOpen}
      onToggleOpen={(next) => {
        if (next) adv?.loadInverseDependencies?.();
      }}
      testId="drawer-panel-inverse-dependencies"
    >
      <DependencyContent
        data={adv?.inverseDeps}
        isLoading={!!adv?.loading?.inverseDeps}
        error={adv?.errors?.inverseDeps}
        onRetry={() => adv?.loadInverseDependencies?.(true)}
        loadingLabel={t("loadingInverseDependencies")}
        emptyLabel={t("noInverseDependencies")}
        isInverse={true}
      />
    </AdvancedSubPanel>
  );
};

export default DependenciesSubPanel;
