# 模块依赖关系 & 影响范围快查表

> 改了模块 X → 除了跑 X 自身的 checklist，还要连带跑哪些模块？

## 模块一览

| # | 模块 | 核心文件 |
|---|------|---------|
| M1 | 搜索核心 | `HybridDeepSearchUI.jsx`, `buildSearchPayload.js`, `config.jsx`, `TopSearchBar.jsx` |
| M2 | 搜索过滤器 | `SearchFilters.jsx`, `components/filters/*`, `useFilterMemory.js` |
| M3 | 搜索结果展示 | `HybridSearchResults.jsx`, `VirtualizedHybridSearchResults.jsx` |
| M4 | 图片加载系统 | `useSmartImageLoader.js`, `persistentImageCache.js`, `AssetImage.jsx` |
| M5 | 资产详情 | `AssetDetailsModal.jsx`, `EditableTagsPanel.jsx` |
| M6 | 标签系统 | `useTagManager.js`, `useGlobalTags.js`, `TagsFilter.jsx`, `FabToolbar.jsx` |
| M7 | 目录树 | `useNucleusTree.js`, `usePathSuggestions.js`, `PathTreeBrowser.jsx`, `PathFilter.jsx` |
| M8 | 认证 & 服务器 | `index.js`(AuthForm/HeaderIcons), `nucleus.jsx`, `useAuthGuard.js` |
| M9 | 多选 & 交互 | `useDragSelect.js`, `SelectionModeBar.jsx`, `CardSelectCheckbox.jsx`, `FabToolbar.jsx` |
| M10 | 演示专项 | 综合（全模块关键路径） |
| M11 | i18n & 视觉一致性 | `i18n/en.js`, `i18n/zh.js`, `LanguageContext.jsx`, `laTheme.js` |
| M12 | 部署差异 | 环境变量、SERVER_MAPPING、wss 连接、缓存差异 |

## 依赖关系图

```
M8 (认证&服务器)
 ├──→ M1 (搜索核心) ──→ M2 (过滤器)
 │                   ──→ M3 (结果展示) ──→ M4 (图片加载)
 │                                     ──→ M5 (资产详情) ──→ M6 (标签)
 │                                     ──→ M9 (多选交互)
 ├──→ M7 (目录树)
 └──→ M6 (标签系统, wss写入需认证)

M11 (i18n) ──→ 影响全部 UI 模块
M12 (部署差异) ──→ 重点关注 M6, M8
```

## 影响范围快查表

| 你改了… | 必须连带测… | 原因 |
|---------|-----------|------|
| M1 搜索核心 | M2, M3, M7 | 搜索参数变化影响过滤器/结果/路径补全 |
| M2 过滤器 | M1, M3 | 过滤条件变化影响搜索请求和结果展示 |
| M3 结果展示 | M4, M5, M9 | 卡片渲染影响图片加载、详情入口、选中交互 |
| M4 图片加载 | M3 | 缓存策略影响卡片展示 |
| M5 资产详情 | M6 | 详情弹窗内标签操作影响全局标签缓存 |
| M6 标签系统 | M2, M5, M1 | 标签变化影响过滤器选项、详情展示、搜索结果 |
| M7 目录树 | M1, M8 | 路径选择触发搜索，树加载依赖认证 |
| M8 认证 | M6, M7, M1 | 认证状态影响标签写入、目录树、搜索权限 |
| M9 多选交互 | M3, M5 | 选中逻辑影响卡片点击行为和详情打开 |
| M11 i18n | 所有 UI 模块 | 文案变化全局影响 |
| M12 部署 | M6, M8 | 部署环境差异主要影响 wss 和认证 |

## 使用方法

1. 完成开发后确定改动涉及哪个模块
2. 查上表找到"必须连带测"的模块列表
3. 跑改动模块的全部 [P0] + 连带模块的 [P0]
4. 发版前跑 FULL-REGRESSION.md 全量
