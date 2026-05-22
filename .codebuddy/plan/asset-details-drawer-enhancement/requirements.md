# 资产详情 Drawer 增强 — 需求文档

## 引言

资产详情 Drawer (`AssetDetailsDrawer.jsx`) 当前已具备：

- 标题、路径、缩略图、元数据网格
- Tag 编辑器（`AssetTagEditor`）
- 高级面板插槽内的 HYBRID 匹配解释（`AdvancedMatchInfo`）

但相对于英伟达原版 `AssetDetailsModal.jsx` 仍缺失四类**核心高级信息**：

1. **依赖图（Dependencies）** — 该资产引用了哪些其他资产（GraphVisualization）
2. **反向依赖图（Inverse Dependencies）** — 哪些资产引用了该资产
3. **USD 属性表（USD Properties）** — Prim/属性树形结构
4. **索引管理（Index Management）** — 索引状态可视化 + 重新索引触发

此外，社区/QA 反馈现有 Drawer 在"视觉一致性、布局信息密度、按钮层次"三个维度仍有提升空间。

本次迭代目标：

- **完整性**：把上述 4 个高级面板补齐到 Drawer 内（与 Modal 行为一致），同时将"AI 元数据 / VLM 元数据 / 搜索匹配解释"等条件性面板纳入
- **一致性**：用 LM 设计令牌 (`fabTokens`) 重写区块样式，移除原版 Modal 风格残留（`gray.750`、`#FFD230` 硬编码）
- **可用性**：底部 action bar 增设次级动作（在 Omniverse 打开 / 刷新数据 / 重新索引），按主次分层，不喧宾夺主
- **NVIDIA 合入安全**：所有改动用 `LM CUSTOMIZATION` 包裹，新建子组件优先放到 `components/drawer-panels/` 子目录

---

## 需求

### 需求 1：依赖图与反向依赖图面板

**用户故事：** 作为一名 USD 资产搜索用户，我希望在 Drawer 中查看当前资产的依赖关系图与反向依赖关系图，以便快速判断该资产被哪些场景引用、它本身依赖哪些子资产。

#### 验收标准

1. WHEN 用户展开"高级折叠面板" THEN Drawer SHALL 在面板内同时呈现"依赖"与"反向依赖"两个二级折叠子项
2. WHEN 用户首次展开"依赖"子项 THEN Drawer SHALL 调用 `loadDependencies(asset)` 异步拉取数据，加载期间显示 Spinner + "加载依赖中..."提示文案
3. WHEN 数据返回且 `nodes.length > 0` 或 `edges.length > 0` THEN Drawer SHALL 复用现有 `GraphVisualization` 组件渲染图（与 Modal 一致）
4. WHEN 数据为空 THEN Drawer SHALL 显示"无依赖"占位文案
5. WHEN 用户切换到另一资产卡片 THEN Drawer SHALL 重置已加载的依赖数据，避免显示上一个资产的图
6. IF 抽屉宽度 < 480px THEN GraphVisualization SHALL 自适应缩放，节点不溢出
7. WHEN 加载失败（网络/服务端报错） THEN Drawer SHALL 显示"加载失败"+"重试"按钮，不让用户刷新整页

### 需求 2：USD 属性表面板

**用户故事：** 作为一名美术/技术美术，我希望在 Drawer 内查看资产的 USD Prim 路径与属性详情，以便核对材质、变换、Mesh 等属性是否正确。

#### 验收标准

1. WHEN 用户展开"USD 属性"子项 THEN Drawer SHALL 调用 `loadUSDProperties(asset)` 异步拉取
2. WHEN 数据返回 THEN Drawer SHALL 复用现有 `USDPropertiesTable` 组件（含 `expandedGroups` 展开状态管理）
3. WHEN 表格行过多（> 50 条） THEN 表格区块 SHALL 限制最大高度（约 320px）并启用内部纵向滚动，避免占满 Drawer
4. WHEN 用户在搜索框中输入关键词（可选增强） THEN 表格 SHALL 按 Prim 路径或属性名做即时过滤
5. IF 数据加载失败 THEN Drawer SHALL 显示"加载失败"+"重试"按钮

### 需求 3：索引管理面板

**用户故事：** 作为一名管理员/运维，我希望在 Drawer 内查看该资产的索引状态、并能触发重新索引，以便诊断搜索召回问题。

#### 验收标准

1. WHEN 用户展开"索引管理"子项 THEN Drawer SHALL 显示当前 `overallStatus`（颜色 + 状态文本：已索引/索引中/失败/未索引）
2. WHEN 用户点击"刷新所有数据"图标按钮 THEN Drawer SHALL 同时强制刷新依赖、反向依赖、USD 属性三类数据
3. WHEN 用户点击"全部重新索引"按钮 THEN Drawer SHALL 调用 `triggerReindexAllPlugins(baseKey)`，按钮进入 loading 态，成功/失败均通过 toast 反馈
4. WHEN 用户点击"单独插件"按钮 THEN Drawer SHALL 弹出 Popover 列出 `PluginStatusTable`，可逐个触发 `triggerReindexIndividualPlugin`
5. WHEN 重新索引完成 THEN Drawer SHALL 自动刷新依赖/USD 等数据，并通过 toast 通知"索引已更新"
6. IF 用户未登录或无权限 THEN 重新索引按钮 SHALL 置灰并 tooltip 提示"需要管理员权限"

### 需求 4：条件性高级面板（搜索匹配解释 / AI 元数据 / VLM 元数据）

**用户故事：** 作为一名搜索调优工程师，我希望在结果是混合搜索时查看匹配解释、在资产带有 AI 视觉元数据时查看自动标注，以便理解搜索排序逻辑或扩展元数据。

#### 验收标准

1. WHEN `selectedItem.metadata.explanations` 存在且 `length > 0` THEN Drawer SHALL 显示"搜索匹配解释"子折叠项（复用 `SearchExplanations` 组件，参数与 Modal 一致）
2. WHEN `selectedItem.source.vision_generated_metadata` 存在且非空 THEN Drawer SHALL 显示"AI 生成元数据"子折叠项（key/value 二列表格）
3. WHEN `selectedItem.source.vlm_metadata` 存在 THEN Drawer SHALL 显示"VLM 元数据"子折叠项
4. WHEN 上述任一条件不满足 THEN Drawer SHALL **完全不渲染**对应子项（不显示空标题占位）
5. WHEN 多个条件性面板同时存在 THEN Drawer SHALL 按固定顺序排列：依赖 → 反向依赖 → USD 属性 → 索引管理 → 搜索匹配解释 → AI 元数据 → VLM 元数据 → HYBRID 匹配信息（已有）

### 需求 5：高级面板视觉一致性重构

**用户故事：** 作为一名设计/前端，我希望所有高级面板的二级折叠项视觉与 Drawer 主体保持一致，避免 Modal 风格的硬编码颜色（`gray.750`、`#FFD230`）残留。

#### 验收标准

1. WHEN 渲染任意二级折叠项 THEN 标题颜色 SHALL 使用 `fabColors.textSecondary`（小写 eyebrow 风格），而非 `#FFD230` 硬编码
2. WHEN 二级折叠项展开 THEN 内容区背景 SHALL 使用 `fabColors.bgElevatedHigh`，圆角 `fabRadius['2']`（6px），内边距 `fabSpacing['3']`（12px）
3. WHEN 鼠标 hover 二级折叠项标题行 THEN 背景 SHALL 平滑过渡到 `fabColors.bgElevatedHigh`（150ms ease），不闪烁
4. WHEN 多个二级折叠项垂直排列 THEN 间距 SHALL 统一为 `fabSpacing['2']`（8px），不出现"有的紧贴有的松散"
5. WHEN 二级折叠项展开/收起箭头 THEN SHALL 使用 14px `ChevronRightIcon` / `ChevronDownIcon`，颜色 `fabColors.textTertiary`
6. WHEN Drawer 处于折叠态（DRAWER_WIDTH_COLLAPSED） THEN 高级面板 SHALL 不渲染（已是默认行为，确认保持）

### 需求 6：信息密度与布局优化

**用户故事：** 作为一名经常使用 Drawer 查看资产元信息的用户，我希望主要元数据（路径/大小/格式/上传时间/上传者）在视觉上分组清晰、可一眼扫读，而不是平铺成一长串。

#### 验收标准

1. WHEN 渲染元数据区块（区块 2） THEN Drawer SHALL 用 2 列网格 `SimpleGrid columns={2} spacingX={fabSpacing['4']} spacingY={fabSpacing['2']}` 布局，每项左侧 label（textSecondary 小字）+ 右侧 value（textPrimary 主字）
2. WHEN 元数据值为长路径（> 32 字符） THEN SHALL `noOfLines={1}` 截断 + Tooltip 显示全文 + 末尾"复制"小图标
3. WHEN 元数据值为字节数 THEN SHALL 通过 `formatBytes` 格式化为 "1.2 MB"
4. WHEN 元数据值为时间戳 THEN SHALL 根据当前 `language` 通过 `Intl.DateTimeFormat` 格式化（中文：2026年5月22日 / 英文：May 22, 2026）
5. WHEN 缩略图区块（区块 1）渲染 THEN SHALL 限制最大高度 240px，保持 16:9/4:3 自适应，不撑爆 Drawer
6. WHEN 标题文本为长名（> 60 字符） THEN SHALL `noOfLines={2}` 截断 + 全文 Tooltip

### 需求 7：底部 Action Bar 按钮分层重构

**用户故事：** 作为一名用户，我希望在 Drawer 底部一眼看到主要操作（复制路径），同时能方便地访问次要操作（在 Omniverse 打开、刷新元数据），按钮层次清晰不喧宾夺主。

#### 验收标准

1. WHEN 渲染底部 Action Bar THEN SHALL 包含三类按钮按视觉层级排列：主按钮（金色实底）+ 次按钮（描边/ghost）+ 图标按钮（IconButton）
2. WHEN "复制路径"按钮可见 THEN SHALL 保持金色 `brandColors.primary` 实底主按钮（已有，不变）
3. WHEN 资产含 `nucleus_url` 或 `omniverse_url` THEN SHALL 显示"在 Omniverse 打开"次按钮（描边样式，brandColors.primary 边框）
4. WHEN 用户点击"刷新"图标按钮 THEN SHALL 重新拉取依赖/USD/索引状态三类数据，按钮进入 loading 态
5. WHEN Drawer 折叠态（DRAWER_WIDTH_COLLAPSED） THEN Action Bar SHALL 隐藏（已是默认行为，确认保持）
6. WHEN 按钮组合宽度 > Drawer 内宽 THEN SHALL `flexWrap="wrap"` 自动换行（已有，确认保持）
7. IF 用户处于"未登录"或对应 API 不可用 THEN 相关按钮 SHALL 置灰 + tooltip 解释原因

### 需求 8：性能与状态管理

**用户故事：** 作为一名快速浏览大量资产的用户，我希望切换卡片时 Drawer 不卡顿、不重复请求已加载过的数据。

#### 验收标准

1. WHEN 用户切换到新资产 THEN Drawer SHALL 取消上一资产仍在进行的依赖/USD 请求（AbortController）
2. WHEN 用户在同一会话内重复打开同一资产 THEN Drawer SHALL 命中本地缓存（`useRef` Map，key 为 `asset.url + asset.guid`），不重复请求
3. WHEN 用户折叠某二级面板后再展开 THEN Drawer SHALL 不重新请求数据（数据保持在 state 中）
4. WHEN Drawer 关闭 THEN SHALL 清理所有未完成请求，避免内存泄漏
5. WHEN 数据加载耗时 > 200ms THEN SHALL 显示 Spinner（达标 UX 反馈即时性）

### 需求 9：国际化

**用户故事：** 作为一名中英文用户，我希望所有新增面板的文案在中英文环境下都能正确切换。

#### 验收标准

1. WHEN 新增任意文案 THEN SHALL 同时在 `i18n/en.js` 和 `i18n/zh.js` 中添加 key
2. WHEN 复用 Modal 已有 i18n key（如 `dependencies` / `inverseDependencies` / `usdProperties` / `indexManagement` / `loadingDependencies` / `noDependencies` 等） THEN SHALL 直接复用，不重复定义
3. WHEN 新增 Drawer 专属 key（如 `detailsDrawerRefreshAll` / `detailsDrawerNoIndexPermission`） THEN SHALL 加 `detailsDrawer` 前缀避免与 Modal key 冲突
4. WHEN 中文长字符串撑爆按钮 THEN SHALL 用 `noOfLines={1}` 或缩短措辞

### 需求 10：NVIDIA 合入安全

**用户故事：** 作为项目维护者，我希望本次新增代码在英伟达发新版本时不会与上游冲突。

#### 验收标准

1. WHEN 新增依赖图/USD/索引子面板组件 THEN SHALL 创建在 `web/src/components/drawer-panels/` 新目录下（零风险，不修改原版文件）
2. WHEN 修改 `AssetDetailsDrawer.jsx`（已是 LM 新建文件） THEN 无需 LM 标记
3. WHEN 修改 `HybridDeepSearchUI.jsx` 注入新 props THEN SHALL 用 `LM CUSTOMIZATION: detail-modal-revamp` 包裹
4. WHEN 复用 Modal 中已有的 `loadDependencies` / `triggerReindexAllPlugins` 等函数 THEN SHALL 通过 props 注入或抽到 hook（如 `useAssetAdvancedData`），不直接 import Modal 文件
5. WHEN 新增 i18n key THEN SHALL 加在文件末尾"LM CUSTOMIZATION"段，便于合入时识别

---

## 范围之外（YAGNI）

以下内容**本次不做**，避免范围蔓延：

- ❌ Drawer 标签页（Tabs）改造 — 现有 Accordion 折叠面板已能承载所有内容，引入 Tabs 会增加切换成本
- ❌ 缩略图轮播或 3D 预览 — 当前缩略图已满足主流程，3D 预览属于另一个独立大特性
- ❌ 资产对比模式（多选 → Drawer 并排显示） — 留待 Group D 多选系列扩展
- ❌ 评论/协作功能 — 不在本项目范围
- ❌ 自定义"高级面板"展开顺序持久化（用户偏好） — 当前固定顺序即可
