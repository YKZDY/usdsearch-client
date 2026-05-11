# AGENTS.md

This file provides guidance to CodeBuddy when working with code in this repository.

## OVERVIEW
NVIDIA USD Search Client — 混合语言 monorepo：OpenAPI 自动生成的 Python SDK + React 搜索前端演示，带 LightArt 品牌定制层。API v1.3.0，Generator v7.8.0 (`PythonClientCodegen`)，Python 3.8+。

## COMMANDS

### Python SDK
```bash
# 安装（从 NVIDIA PyPI）
pip install usd-search-client --extra-index-url https://pypi.nvidia.com

# 本地开发安装
cd usdsearch-client && pip install -e ".[dev]"

# 类型检查
mypy usd_search_client tests

# 运行测试（需 tests/ 目录存在）
pytest -v --timeout 30

# 运行单个测试
pytest tests/test_xxx.py -v -k "test_name"

# Lint
flake8 usd_search_client
```

### Web 前端
```bash
# 安装依赖
cd web && npm install

# 启动开发服务器（含 Mock API，端口 3000）
npm start

# 一键预览（PowerShell，端口 3210，含环境检查）
cd scripts && .\dev-preview.ps1

# 预览（中文界面）
.\dev-preview.ps1 -Chinese

# 构建生产版本
cd web && npm run build

# 运行测试
cd web && npm test
```

## ARCHITECTURE

```
usdsearch-client/
├── usd_search_client/        # Python SDK（90% OpenAPI Generator 自动生成）
│   ├── api/                  # 10 个 API 端点类（自动生成，勿改）
│   ├── models/               # 74 个 Pydantic 模型（自动生成，勿改）
│   ├── main/                 # ⚡ 唯一手写层：search, search_hybrid, get_images 等高级封装
│   ├── api_client.py         # HTTP 客户端核心（自动生成）
│   ├── configuration.py      # 连接配置（自动生成）
│   └── rest.py               # REST 底层（自动生成）
├── web/                      # React 前端（CRA + Chakra UI）
│   ├── src/                  # 前端源码（JSX，无 TypeScript）
│   ├── _packages/            # NVIDIA Omniverse 私有依赖（file: 引用）
│   └── build/                # 构建产物（不应入库）
├── docs/                     # 78 个 Markdown API 文档（自动生成）
├── scripts/                  # Windows 开发预览脚本（ps1/bat）
└── pyproject.toml            # Poetry 构建配置
```

### 数据流

1. **搜索请求**：`HybridDeepSearchUI.jsx` 构造 `DeepSearchSearchRequestV2` → POST `/search_hybrid` → 后端返回 `{hits, total}`
2. **图片加载**：搜索结果中 `thumbnail_exists=true` → `useSmartImageLoader` hook → 三级缓存（内存 → IndexedDB `persistentImageCache` → GET `/image?url=...`）
3. **认证**：`HeaderIcons` 管理多服务器认证 → localStorage 按 `${serverName}_username/password` 隔离 → `x-usdsearch-storage-backend` header 指定后端
4. **服务器切换**：`SERVER_MAPPING`（从 `REACT_APP_SERVER_MAPPING` JSON 解析）→ URL 参数 `?server=xxx` → `CustomEvent('server-changed')` 通知全局
5. **Mock 模式**：`setupProxy.js` 作为 CRA middleware 自动拦截所有 API 路由返回随机数据，删除此文件即禁用

### Python SDK 高级封装层

`usd_search_client/main/__init__.py` 提供 5 个异步便捷方法，封装底层 OpenAPI 生成的 API 类：
- `search(BasicSearchRequest)` → `AISearchApi.search_post_v2_deepsearch_search_post()`
- `search_hybrid(BasicSearchRequest)` → `AISearchApi.search_hybrid_post()`
- `get_images(asset_url, image_key, img_offset)` → `ImagesApi.images_get()`
- `get_dependencies(root_node_url, ...)` → `AGSAssetGraphApi` 的 4 种依赖查询方法
- `get_scene_summary(scene_url)` → `AGSSceneGraphApi.scene_summary_..._get()`

使用模式统一：`async with ApiClient(Configuration(host=...)) as client: await method(..., api_client=client)`

## CRITICAL RULES

### 自动生成 vs 手写代码
- `usd_search_client/api/` 和 `usd_search_client/models/` — **禁止手动修改**，重新生成时会覆盖
- `usd_search_client/main/` — **唯一可编辑的 Python 代码**，重新生成需手动保护此目录
- 所有含 `Do not edit the class manually.` 的文件均为自动生成

### LM 定制标记
- 前端所有定制代码使用 `=== LM CUSTOMIZATION: XXX START/END ===` 注释包裹
- 定制类型：i18n（国际化）、Brand（品牌 Logo）、Theme（主题色）、Provider（上下文包裹）
- 合并上游变更时，搜索 `LM CUSTOMIZATION` 定位所有定制点

### 安全问题
- `web/src/index.js:177` 含硬编码 JWT token — 需移除或替换为环境变量

## CONVENTIONS

### Python SDK
- 构建：Poetry + `poetry-dynamic-versioning`（版本来自 git tag）
- 类型检查：mypy 严格模式（`check_untyped_defs`, `disallow_any_generics`）
- 异步：所有 API 调用使用 `aiohttp`，公开方法为 `async def`
- 许可证：MIT，每个文件头部有 SPDX 标识

### Web 前端
- 框架：React 18 + CRA（react-scripts 5.0.1）
- UI：Chakra UI v2 + Framer Motion 动画
- 主题：`web/src/theme/laTheme.js` — LightArt 深色主题（金色 #FFD230 为主色）
- 国际化：自实现 `LanguageContext` + `i18n/en.js` / `i18n/zh.js`
- Mock 开发：`setupProxy.js` 提供完整 Mock API，`npm start` 自动激活
- 环境变量：`REACT_APP_API_URL`、`REACT_APP_SERVER_MAPPING`、`REACT_APP_DEFAULT_EMBEDDING_FIELD_NAME`

## WHERE TO LOOK

| 需求 | 位置 |
|------|------|
| 添加新的高级搜索方法 | `usd_search_client/main/__init__.py` |
| 修改搜索 UI | `web/src/HybridDeepSearchUI.jsx`（核心搜索页） |
| 修改搜索结果展示 | `web/src/HybridSearchResults.jsx` |
| 修改搜索过滤器 | `web/src/SearchFilters.jsx` |
| 修改资产详情弹窗 | `web/src/AssetDetailsModal.jsx` |
| 修改顶部导航/认证 | `web/src/index.js`（AuthForm, HeaderIcons 组件） |
| 修改主题/品牌 | `web/src/theme/laTheme.js`, `web/src/brand/logo.js` |
| 修改国际化文案 | `web/src/i18n/en.js`, `web/src/i18n/zh.js` |
| 添加新组件 | `web/src/components/` |
| 修改搜索默认参数 | `web/src/config.jsx` |
| 修改 Mock 数据 | `web/src/setupProxy.js` |
| 查看 API 文档 | `docs/*.md` |
| 本地预览启动 | `scripts/dev-preview.ps1` |

## ANTI-PATTERNS
- 勿修改 `usd_search_client/api/` 或 `usd_search_client/models/` 下的文件
- 勿在 `index.js` 中继续堆叠组件（已 1323 行，应拆分）
- 勿将构建产物提交到 `web/build/`
- 勿硬编码凭证/Token — 使用环境变量或 `config.jsx` 配置
