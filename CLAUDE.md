# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

NVIDIA USD Search Client — hybrid-language monorepo: OpenAPI-generated Python SDK + React search frontend demo with LightArt branding. API v1.3.0, Generator v7.8.0 (PythonClientCodegen), Python 3.8+.

## Commands

### Python SDK
```bash
# Local dev install
pip install -e ".[dev]"

# Type checking
mypy usd_search_client tests

# Run all tests
pytest -v --timeout 30

# Run a single test
pytest tests/test_xxx.py -v -k "test_name"

# Lint
flake8 usd_search_client
```

### Web Frontend
```bash
# Install dependencies
cd web && npm install

# Start dev server (Mock API enabled, port 3000)
npm start

# One-click preview (PowerShell, port 3210, includes env check)
cd scripts && .\dev-preview.ps1

# Preview in Chinese
.\dev-preview.ps1 -Chinese

# Production build
cd web && npm run build

# Run tests
cd web && npm test
```

## Architecture

### Auto-generated vs Hand-written Code

- `usd_search_client/api/` and `usd_search_client/models/` — **auto-generated, do not modify**. Files contain `Do not edit the class manually.` header.
- `usd_search_client/main/` — **the only editable Python code**. Contains 5 async convenience methods wrapping the generated API classes.
- `docs/` — auto-generated Markdown API documentation.

### Python SDK High-Level API (`usd_search_client/main/__init__.py`)

All methods are async and follow the pattern: `async with ApiClient(Configuration(host=...)) as client: await method(..., api_client=client)`

- `search(BasicSearchRequest)` → `AISearchApi.search_post_v2_deepsearch_search_post()`
- `search_hybrid(BasicSearchRequest)` → `AISearchApi.search_hybrid_post()`
- `get_images(asset_url, image_key, img_offset)` → `ImagesApi.images_get()`
- `get_dependencies(root_node_url, ...)` → `AGSAssetGraphApi` (4 dependency query variants based on `flat`/`inverse` flags)
- `get_scene_summary(scene_url)` → `AGSSceneGraphApi.scene_summary_..._get()`

### Web Frontend Data Flow

1. **Search**: `HybridDeepSearchUI.jsx` constructs `DeepSearchSearchRequestV2` → POST `/search_hybrid` → backend returns `{hits, total}`
2. **Image loading**: `thumbnail_exists=true` in results → `useSmartImageLoader` hook → three-tier cache (memory → IndexedDB `persistentImageCache` → GET `/image?url=...`)
3. **Auth**: `HeaderIcons` manages multi-server auth → localStorage keyed by `${serverName}_username/password` → `x-usdsearch-storage-backend` header
4. **Server switching**: `SERVER_MAPPING` (from `REACT_APP_SERVER_MAPPING` JSON) → URL param `?server=xxx` → `CustomEvent('server-changed')` global notification
5. **Mock mode**: `setupProxy.js` as CRA middleware intercepts all API routes with random data; delete the file to disable

### Frontend Stack

- React 18 + CRA (react-scripts 5.0.1), JSX (no TypeScript)
- Chakra UI v2 + Framer Motion
- Theme: `web/src/theme/laTheme.js` — dark theme with gold #FFD230 accent
- i18n: custom `LanguageContext` + `i18n/en.js` / `i18n/zh.js`
- NVIDIA Omniverse private deps via `file:` references in `web/_packages/`

### Environment Variables (Frontend)

- `REACT_APP_API_URL` — API base URL (defaults to local `/api/`)
- `REACT_APP_SERVER_MAPPING` — JSON map of server names to URLs
- `REACT_APP_DEFAULT_EMBEDDING_FIELD_NAME` — embedding field (default: `siglip2-embedding.embedding`)
- `REACT_APP_ENABLE_FEEDBACK_MODAL`, `REACT_APP_ENABLE_NUCLEUS_AUTH`, `REACT_APP_ENABLE_API_KEY_AUTH`, `REACT_APP_ENABLE_BASIC_AUTH`

## Critical Rules

### LM Customization Markers
All frontend customizations are wrapped in `=== LM CUSTOMIZATION: XXX START/END ===` comments. Types: i18n, Brand, Theme, Provider. Search for `LM CUSTOMIZATION` to locate all customization points when merging upstream.

### Key Files by Task

| Task | Location |
|------|----------|
| New high-level search method | `usd_search_client/main/__init__.py` |
| Search UI | `web/src/HybridDeepSearchUI.jsx` |
| Search results display | `web/src/HybridSearchResults.jsx` |
| Search filters | `web/src/SearchFilters.jsx` |
| Asset details modal | `web/src/AssetDetailsModal.jsx` |
| Top nav / auth | `web/src/index.js` |
| Theme / branding | `web/src/theme/laTheme.js`, `web/src/brand/logo.js` |
| i18n strings | `web/src/i18n/en.js`, `web/src/i18n/zh.js` |
| Search defaults | `web/src/config.jsx` |
| Mock data | `web/src/setupProxy.js` |

## Anti-Patterns

- Do not modify files under `usd_search_client/api/` or `usd_search_client/models/`
- Do not commit `web/build/` or `web/node_modules/`
- Do not hardcode credentials — use environment variables or `config.jsx`
- Do not continue adding components to `web/src/index.js` (already oversized, split into separate files)

## Build System

- **Python**: Poetry + `poetry-dynamic-versioning` (version from git tag)
- **Web**: Create React App (react-scripts)
- **CI**: GitHub Actions workflow at `.github/workflows/production.yml`
