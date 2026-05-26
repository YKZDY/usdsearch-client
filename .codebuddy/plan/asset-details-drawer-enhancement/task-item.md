# 资产详情 Drawer 增强 — 实施计划

> **目标分支：** `integration-lm-merge-acd`（worktree：`d:/period/usdsearch-client/.worktrees/integration-lm-merge-acd/`）
> **配套需求：** [requirements.md](./requirements.md)
> **执行原则：** DRY、YAGNI、小步提交、每步先查看文件再改、每步符合 NVIDIA `LM CUSTOMIZATION` 合入安全规则、每步符合 UX Checklist。

---

- [ ] 1. 抽取「资产高级数据」共享 Hook
  - 新建 `web/src/hooks/useAssetAdvancedData.js`，封装 `loadDependencies` / `loadInverseDependencies` / `loadUSDProperties` / `triggerReindexAllPlugins` / `triggerReindexIndividualPlugin` 五个能力，统一暴露 `{ deps, inverseDeps, usdProps, indexStatus, loading, errors, refreshAll, reindexAll, reindexPlugin }`
  - Hook 内部用 `useRef` Map（key=`asset.url + asset.guid`）做会话内缓存，命中缓存不重复请求
  - Hook 内部用 `AbortController` 在资产切换 / 卸载时取消未完成请求
  - 保持 NVIDIA 原版 `AssetDetailsModal.jsx` 不变；Modal 后续如需也可改用此 hook（本次不强制）
  - _需求：1.2、1.5、1.7、2.1、2.5、3.1、3.3、3.4、8.1、8.2、8.4、10.4_

- [ ] 2. 创建 Drawer 高级面板子组件目录骨架
  - 新建目录 `web/src/components/drawer-panels/`
  - 新建 `drawer-panels/AdvancedSubPanel.jsx`：通用二级折叠子项壳（标题用 `fabColors.textSecondary` eyebrow.sm，内容区背景 `fabColors.bgElevatedHigh`、圆角 `fabRadius['2']`、内边距 `fabSpacing['3']`，hover 150ms 过渡，14px Chevron 箭头），统一所有子面板视觉
  - 新建 `drawer-panels/index.js` 集中导出
  - _需求：5.1、5.2、5.3、5.4、5.5、10.1_

- [ ] 3. 实现「依赖 / 反向依赖」面板
  - 新建 `drawer-panels/DependenciesSubPanel.jsx` 与 `InverseDependenciesSubPanel.jsx`，包裹 `AdvancedSubPanel`，复用 `GraphVisualization`
  - 加载中显示 Spinner + 文案；空数据显示「无依赖 / 无反向依赖」；失败显示「加载失败 + 重试」按钮（调 hook 的 `refresh`）
  - 抽屉宽度 < 480px 时给 GraphVisualization 容器加 `maxW="100%"` + `overflow="auto"` 自适应
  - _需求：1.1、1.2、1.3、1.4、1.6、1.7_

- [ ] 4. 实现「USD 属性」面板
  - 新建 `drawer-panels/UsdPropertiesSubPanel.jsx`，包裹 `AdvancedSubPanel`，复用 `USDPropertiesTable`
  - 表格区块外层加 `maxH="320px"` + `overflowY="auto"` + 自定义滚动条样式，避免占满 Drawer
  - 加载失败显示「加载失败 + 重试」按钮
  - 本任务**不做**搜索框过滤（需求 2.4 标注为可选增强，YAGNI 推迟）
  - _需求：2.1、2.2、2.3、2.5_

- [ ] 5. 实现「索引管理」面板
  - 新建 `drawer-panels/IndexManagementSubPanel.jsx`，包裹 `AdvancedSubPanel`
  - 顶部显示 `overallStatus`（颜色点 + 状态文本）；中部三个按钮：图标按钮「刷新所有数据」(`RepeatIcon`) / 主按钮「全部重新索引」/ 次按钮「单独插件」(Popover 内嵌 `PluginStatusTable`)
  - 重新索引调用后按钮进 loading；用 `useToast` 反馈成功/失败；成功后自动调用 hook 的 `refreshAll`
  - 未登录或无权限时按钮置灰 + Tooltip 解释（沿用 `getHeaders` 是否有 token 作为简易判断）
  - _需求：3.1、3.2、3.3、3.4、3.5、3.6_

- [ ] 6. 实现条件性面板（搜索匹配解释 / AI 元数据 / VLM 元数据）
  - 新建 `drawer-panels/ConditionalPanels.jsx`，根据 `selectedItem.metadata.explanations` / `selectedItem.source.vision_generated_metadata` / `selectedItem.source.vlm_metadata` 三个字段条件性渲染对应子面板
  - 复用 `SearchExplanations` 组件；AI/VLM 元数据用 key/value 二列表格
  - 任一字段不存在则**完全不渲染**该子项（不留空标题）
  - _需求：4.1、4.2、4.3、4.4_

- [ ] 7. 编排 Drawer 高级面板内容并接入主 UI
  - 修改 `web/src/components/AdvancedMatchInfo.jsx`（或新建 `drawer-panels/DrawerAdvancedPanelContainer.jsx`）：按固定顺序组装 `DependenciesSubPanel` → `InverseDependenciesSubPanel` → `UsdPropertiesSubPanel` → `IndexManagementSubPanel` → `ConditionalPanels (Explanations / AI / VLM)` → 现有 `AdvancedMatchInfo`(HYBRID)
  - 在容器内调用 `useAssetAdvancedData(asset)`，把 `{ deps, inverseDeps, usdProps, indexStatus, ... }` 通过 props 注入各子面板
  - 修改 `web/src/HybridDeepSearchUI.jsx` 第 3577 行附近：将 `advancedPanelContent` 改为传入新的容器组件，并补充传入 `triggerReindexAllPlugins` / `triggerReindexIndividualPlugin` / `getHeaders` 等所需 prop（用 `LM CUSTOMIZATION: detail-modal-revamp` 标记包裹）
  - _需求：4.5、5.6、10.3_

- [ ] 8. 重构 Drawer 元数据区块（信息密度与缩略图/标题截断）
  - 修改 `web/src/components/AssetDetailsDrawer.jsx` 区块 1（缩略图）：限制 `maxH="240px"`，`objectFit="contain"`，保持长宽比
  - 修改区块 2（元数据）：改为 `SimpleGrid columns={2} spacingX={fabSpacing['4']} spacingY={fabSpacing['2']}`，每项 label（`textSecondary`）+ value（`textPrimary`）；长路径 `noOfLines={1}` + Tooltip 全文 + 末尾「复制」小图标（用 `CopyIcon`）
  - 字节数走 `formatBytes`；时间戳用 `Intl.DateTimeFormat` 按当前 `language` 格式化
  - 标题超 60 字符 `noOfLines={2}` + Tooltip
  - _需求：6.1、6.2、6.3、6.4、6.5、6.6_

- [ ] 9. 重构 Drawer 底部 Action Bar（按钮分层）
  - 修改 `AssetDetailsDrawer.jsx` 底部 footer：按主/次/图标三层排列
    - 主：「复制路径」金色实底（保持）
    - 次：「在 Omniverse 打开」描边按钮（仅当 `asset.nucleus_url` 或 `asset.omniverse_url` 存在时显示）
    - 图标：「刷新元数据」`IconButton`，点击调用 hook `refreshAll` + 进入 loading 态
  - 折叠态隐藏 / `flexWrap="wrap"` 自动换行（保持现有行为，添加测试用例确认）
  - 未登录或 API 不可用按钮置灰 + Tooltip
  - _需求：7.1、7.2、7.3、7.4、7.5、7.6、7.7_

- [ ] 10. 国际化补全 + 端到端验收 + 提交
  - 在 `web/src/i18n/zh.js` 与 `i18n/en.js` 文件末尾「LM CUSTOMIZATION」段补齐所有新 key（`detailsDrawerRefreshAll` / `detailsDrawerNoIndexPermission` / `detailsDrawerRetry` / `detailsDrawerOpenInOmniverse` / `detailsDrawerLoadFailed` 等），复用 Modal 已有 key（`dependencies` / `inverseDependencies` / `usdProperties` / `indexManagement` / `loadingDependencies` / `noDependencies` / `reindexAll` / `individualPlugins` …）
  - 手动 SOP 验收：
    1.  打开任一资产 → 展开高级面板 → 依次展开 4 个子面板，确认数据加载、空态、失败重试、视觉一致
    2.  切换资产 → 确认前一资产请求被取消、缓存命中无重复请求
    3.  点击「全部重新索引」→ Toast 反馈 + 数据自动刷新
    4.  资源含 omniverse_url → 确认底部「在 Omniverse 打开」次按钮出现
    5.  中英文切换 → 确认所有新文案都有翻译、不撑爆按钮
    6.  Drawer 折叠态 → 确认高级面板与 Action Bar 隐藏
  - 运行 `cd web && npm start` 启动 3000 端口；可选跑 Playwright e2e（3001 端口），覆盖「点击卡片 → 展开依赖 → 切换资产 → 缓存生效」核心流程
  - 运行 `git diff` 复核所有 LM 标记是否正确包裹；提交：`git commit -m "feat(drawer): 高级面板补齐 + 视觉/布局/Action Bar 优化"`
  - _需求：8.3、8.5、9.1、9.2、9.3、9.4、10.2、10.3、10.5_
