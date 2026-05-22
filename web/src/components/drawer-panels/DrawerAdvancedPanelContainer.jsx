/**
 * DrawerAdvancedPanelContainer
 *
 * Drawer 高级面板（Advanced Panel）的内容编排容器：
 *  - 按固定顺序组装 7 个二级折叠子项：
 *      1. 依赖（Dependencies）
 *      2. 反向依赖（Inverse Dependencies）
 *      3. USD 属性（USD Properties）
 *      4. 索引管理（Index Management）
 *      5. 搜索匹配解释（Search Explanations，条件性）
 *      6. AI 元数据（AI Generated Metadata，条件性）
 *      7. VLM 元数据（VLM Metadata，条件性）
 *      8. HYBRID 匹配解释（AdvancedMatchInfo，仅 hybrid 搜索时由现有组件自决渲染）
 *  - 在容器内调用 useAssetAdvancedData(asset)，把数据通过 props 注入子面板
 *
 * 用法：
 *   <AssetDetailsDrawer
 *     advancedPanelContent={
 *       <DrawerAdvancedPanelContainer
 *         asset={selectedItem}
 *         plugins={plugins}
 *         getHeaders={getHeaders}
 *         triggerReindexAllPlugins={triggerReindexAllPlugins}
 *         triggerReindexIndividualPlugin={triggerReindexIndividualPlugin}
 *         isAuthorized={isLoggedIn}
 *       />
 *     }
 *   />
 */

import React, { useImperativeHandle, forwardRef, useEffect } from "react";
import { VStack } from "@chakra-ui/react";
import useAssetAdvancedData from "../../hooks/useAssetAdvancedData";
import {
  DependenciesSubPanel,
  InverseDependenciesSubPanel,
  UsdPropertiesSubPanel,
  IndexManagementSubPanel,
  SearchExplanationsSubPanel,
  AIGeneratedMetadataSubPanel,
  VLMMetadataSubPanel,
} from "./index";
import AdvancedMatchInfo from "../AdvancedMatchInfo";
import { fabSpacing } from "../../theme/fabTokens";

const DrawerAdvancedPanelContainer = forwardRef(function DrawerAdvancedPanelContainer(
  {
    asset,
    plugins,
    getHeaders,
    triggerReindexAllPlugins,
    triggerReindexIndividualPlugin,
    isAuthorized = true,
  },
  ref
) {
  const adv = useAssetAdvancedData({ asset, getHeaders });

  // 监听 Drawer 底部“刷新元数据”按钮派发的事件，调用 hook refreshAll
  useEffect(() => {
    const handler = () => {
      if (asset) adv.refreshAll();
    };
    window.addEventListener("details-drawer-refresh-metadata", handler);
    return () =>
      window.removeEventListener("details-drawer-refresh-metadata", handler);
  }, [asset, adv]);

  // 把 refreshAll 暴露给上层（用于 Drawer Action Bar 的"刷新元数据"按钮）
  useImperativeHandle(
    ref,
    () => ({
      refreshAll: () => adv.refreshAll(),
      isLoading: () =>
        !!(adv.loading.deps || adv.loading.inverseDeps || adv.loading.usdProps),
    }),
    [adv]
  );

  if (!asset) return null;

  return (
    <VStack spacing={fabSpacing["2"]} align="stretch">
      <DependenciesSubPanel adv={adv} />
      <InverseDependenciesSubPanel adv={adv} />
      <UsdPropertiesSubPanel adv={adv} />
      <IndexManagementSubPanel
        adv={adv}
        plugins={plugins}
        triggerReindexAllPlugins={triggerReindexAllPlugins}
        triggerReindexIndividualPlugin={triggerReindexIndividualPlugin}
        getHeaders={getHeaders}
        isAuthorized={isAuthorized}
      />
      {/* 三个条件性面板：内部各自判断字段存在性，不存在则不渲染 */}
      <SearchExplanationsSubPanel asset={asset} />
      <AIGeneratedMetadataSubPanel asset={asset} />
      <VLMMetadataSubPanel asset={asset} />
      {/* 现有 hybrid 匹配信息：内部已自带条件渲染，hybrid 搜索时才显示 */}
      <AdvancedMatchInfo asset={asset} />
    </VStack>
  );
});

export default React.memo(DrawerAdvancedPanelContainer);
