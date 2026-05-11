# AGENTS.md — web/src

## OVERVIEW
React 搜索前端源码，基于 CRA + Chakra UI v2，LightArt 深色主题定制。

## STRUCTURE
```
src/
├── index.js                  # 入口 + App + AuthForm + HeaderIcons（1323行，待拆分）
├── HybridDeepSearchUI.jsx    # 核心搜索页面组件 SearchApp
├── HybridSearchResults.jsx   # 混合搜索结果展示
├── HybridSearchConfig.jsx    # 搜索配置面板
├── SearchFilters.jsx         # 搜索过滤器面板
├── SearchExplanations.jsx    # 搜索评分解释
├── AssetDetailsModal.jsx     # 资产详情弹窗（52KB 大文件）
├── DeepSearchUI.jsx          # 旧版搜索 UI（86KB，可能弃用）
├── Graph.jsx                 # D3 依赖关系图可视化
├── config.jsx                # 集中配置（API URL、默认参数、Feature Flags）
├── nucleus.jsx               # Omniverse Nucleus 认证逻辑
├── setupProxy.js             # Mock API 中间件（CRA 开发时自动拦截）
├── components/               # 可复用组件（6个）
│   ├── VirtualizedHybridSearchResults.jsx  # 虚拟化长列表
│   ├── NavigableAssetImage.jsx             # 可导航资产图片
│   └── ...ImageSkeleton, AssetImage, SmartAssetImage
├── hooks/                    # 自定义 Hooks（图片懒加载相关）
├── utils/                    # 工具函数（图片加载、缓存、格式化）
├── i18n/                     # 国际化（en.js, zh.js, LanguageContext.jsx）
├── theme/                    # laTheme.js — LightArt Chakra 主题
├── brand/                    # logo.js — 品牌 Logo
├── fonts/                    # 自定义字体
└── img/                      # 静态图片
```

## CONVENTIONS
- 页面级组件直接在 `src/` 根目录，以 JSX 大驼峰命名
- 所有定制代码用 `=== LM CUSTOMIZATION ===` 标记包裹
- 搜索默认值统一在 `config.jsx` 的 `SEARCH_DEFAULTS` 和 `DEFAULT_SEARCH_PARAMS`
- 认证信息按服务器隔离存储在 localStorage（`${serverName}_username` 格式）
- 图片加载使用三级策略：内存缓存 → IndexedDB 持久缓存 → 网络请求

## WHERE TO LOOK
| 需求 | 文件 |
|------|------|
| 搜索主流程 | `HybridDeepSearchUI.jsx` |
| 搜索结果卡片 | `HybridSearchResults.jsx` + `components/VirtualizedHybridSearchResults.jsx` |
| 搜索过滤逻辑 | `SearchFilters.jsx` |
| 资产详情展示 | `AssetDetailsModal.jsx` |
| 顶栏/认证/服务器切换 | `index.js`（AuthForm, HeaderIcons） |
| API 配置 | `config.jsx` |
| Mock 数据 | `setupProxy.js` |

## ANTI-PATTERNS
- `index.js` 混合了 App + 3 个大组件 — 新功能不要再往这里加
- `DeepSearchUI.jsx`（86KB）可能是旧版，新功能应基于 `HybridDeepSearchUI.jsx`
- 勿在组件中硬编码 API URL — 统一从 `config.jsx` 导入
