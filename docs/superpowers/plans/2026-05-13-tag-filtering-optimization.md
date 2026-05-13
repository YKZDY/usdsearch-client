# Tag 功能优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让标签筛选器通过 API 搜索全量含某 tag 的资产（而非仅前端本地过滤 50 条），并在 Modal 关闭时乐观更新卡片上的 tag 显示。

**Architecture:** 修改 `buildSearchPayload` 将 selectedTags 重新拼入搜索词 q 发给后端；新增 `useGlobalTags` hook 通过 wss tagQuery 获取全量可用标签；Modal 关闭时将最新 tags 乐观写回 results 数组以即时展示。

**Tech Stack:** React 18, CRA, Chakra UI v2, JSX (无 TypeScript), WebSocket (Nucleus Tagging3)

---

## File Structure

| 文件 | 职责 | 操作 |
|------|------|------|
| `web/src/utils/buildSearchPayload.js` | 搜索请求构建（将 selectedTags 拼入 q） | 修改 |
| `web/src/utils/__tests__/buildSearchPayload.test.mjs` | buildSearchPayload 单元测试 | 修改（更新期望值） |
| `web/src/hooks/useGlobalTags.js` | 通过 wss tagQuery 获取全局可用 tag 列表 | 新建 |
| `web/src/components/filters/TagsFilter.jsx` | 标签筛选面板（接入 globalTags，合并候选列表） | 修改 |
| `web/src/components/FabToolbar.jsx` | 透传 globalTags prop | 修改 |
| `web/src/components/EditableTagsPanel.jsx` | 暴露 onTagsSnapshot 回调给父组件 | 修改 |
| `web/src/AssetDetailsModal.jsx` | 接收 onTagsChanged prop，关闭时上报 | 修改 |
| `web/src/HybridDeepSearchUI.jsx` | 集成 useGlobalTags + handleTagsChanged + 传 props | 修改 |
| `web/src/i18n/en.js` | 新增英文文案 | 修改 |
| `web/src/i18n/zh.js` | 新增中文文案 | 修改 |

---

### Task 1: 修改 buildSearchPayload — 将 selectedTags 拼回 q

**Files:**
- Modify: `web/src/utils/buildSearchPayload.js`
- Modify: `web/src/utils/__tests__/buildSearchPayload.test.mjs`

- [ ] **Step 1: 修改 buildSearchPayload.js**

当前代码不把 `selectedTags` 加入 `parts` 数组（UX Polish R2 移除了）。现在需要加回来。

打开 `web/src/utils/buildSearchPayload.js`，将第 43-44 行：

```js
  // [UX Polish R2] selectedTags 不再进 q。只保留搜索词 + 分类。
  const parts = [committedQuery, searchQuery, cat]
    .map(s => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean);
```

替换为：

```js
  // [TagFilterSearch] selectedTags 重新拼入 q，让后端通过 tags.tag 全文索引命中含该 tag 的资产。
  // 前端仍保留 tagFilteredResults 做二次 AND 验证，排除文件名误命中的噪音。
  const parts = [committedQuery, searchQuery, cat, ...tags]
    .map(s => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean);
```

- [ ] **Step 2: 确认测试期望值无需更改**

现有测试文件 `buildSearchPayload.test.mjs` 的 case 如 `'[关键回归] 含空格标签 "general building" 不被切分'` 期望 `q: 'general building'`——这恰好与我们的改动一致（tags 拼入 q）。

运行测试确认全部通过：

Run: `cd web && node src/utils/__tests__/buildSearchPayload.test.mjs`
Expected: `10/10 passed`（所有 case 都 PASS）

- [ ] **Step 3: Commit**

```bash
git add web/src/utils/buildSearchPayload.js
git commit -m "feat(search): re-include selectedTags in search query q field

Tags selected in the filter panel are now appended to the hybrid_text_query
sent to the backend, enabling tag-based search via the tags.tag full-text
index. Frontend AND filtering is retained for precision."
```

---

### Task 2: 新建 useGlobalTags hook

**Files:**
- Create: `web/src/hooks/useGlobalTags.js`

- [ ] **Step 1: 创建 useGlobalTags.js**

在 `web/src/hooks/` 下新建文件 `useGlobalTags.js`：

```js
/**
 * useGlobalTags - 通过 wss tagQuery 获取 Nucleus 上所有已有的 tag
 *
 * 用途：供 TagsFilter 展示全量可用标签（而非仅当前 50 条搜索结果中的 tag）。
 * 缓存 5 分钟。未登录（无 token）时返回空数组，不报错。
 *
 * @param {object} options
 * @param {string} options.serverUrl - Nucleus host（如 'ov.qq.com'）
 * @param {Function} options.getHeaders - 获取 auth headers 的函数
 * @returns {{ globalTags: string[], isLoading: boolean }}
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  tagQuery as apiTagQuery,
  extractHost,
  getTaggingToken,
  isValidNucleusHost,
} from '../services/taggingService';
import { resolveNucleusHost } from '../config';

const CACHE_TTL = 5 * 60 * 1000; // 5 分钟缓存

// 模块级缓存（跨组件共享，避免重复 wss 调用）
let _cache = { host: '', tags: [], time: 0 };

export default function useGlobalTags({ serverUrl, getHeaders }) {
  const [globalTags, setGlobalTags] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // 稳定化 effectiveHost
  const effectiveHost = resolveNucleusHost(serverUrl) || '';

  useEffect(() => {
    if (!effectiveHost || !isValidNucleusHost(effectiveHost)) {
      setGlobalTags([]);
      return;
    }

    // 缓存命中
    if (_cache.host === effectiveHost && Date.now() - _cache.time < CACHE_TTL && _cache.tags.length > 0) {
      setGlobalTags(_cache.tags);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    getTaggingToken(effectiveHost, getHeaders)
      .then(token => {
        if (cancelled || !token) {
          if (mountedRef.current) setIsLoading(false);
          return;
        }
        const host = extractHost(effectiveHost);
        return apiTagQuery(host, token, '/');
      })
      .then(result => {
        if (cancelled || !mountedRef.current) return;
        const tagNames = (result?.tags || [])
          .map(t => t.name || t.tag || (typeof t === 'string' ? t : ''))
          .filter(Boolean);
        _cache = { host: effectiveHost, tags: tagNames, time: Date.now() };
        setGlobalTags(tagNames);
      })
      .catch(() => {
        // tagQuery 失败静默降级（用户未登录 / 无权限）
        if (mountedRef.current) setGlobalTags([]);
      })
      .finally(() => {
        if (mountedRef.current) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [effectiveHost, getHeaders]);

  // 允许外部强制刷新（如用户刚加了 tag 后想看到新候选）
  const refresh = useCallback(() => {
    _cache = { host: '', tags: [], time: 0 };
    // 触发 re-run：通过把 globalTags 清空让 useEffect 重跑
    setGlobalTags([]);
  }, []);

  return { globalTags, isLoading, refresh };
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/hooks/useGlobalTags.js
git commit -m "feat: add useGlobalTags hook for fetching all available tags via wss tagQuery"
```

---

### Task 3: 修改 TagsFilter — 接入 globalTags 候选列表

**Files:**
- Modify: `web/src/components/filters/TagsFilter.jsx`

- [ ] **Step 1: 新增 globalTags prop 并合并候选列表**

在 `TagsFilter` 的 props 列表中添加 `globalTags = []`：

```js
const TagsFilter = memo(function TagsFilter({
  selectedTags = [],
  onSelectedTagsChange,
  onTriggerSearch,
  results = [],
  globalTags = [],  // ← 新增
  t,
}) {
```

- [ ] **Step 2: 重写 availableTags 计算逻辑 — 合并 globalTags + 结果中的 tag**

将第 80-98 行的 `availableTags` useMemo 替换为合并逻辑：

```js
  // [TagFilterSearch] 候选标签合并：全局 tagQuery 结果 + 当前搜索结果中的 tag
  // 全局 tag 提供完整候选（用户能看到所有打过的 tag），结果中的 tag 附带计数。
  const availableTags = useMemo(() => {
    // 1) 从搜索结果中提取 tag + 计数
    const resultTagMap = new Map();
    results.forEach(item => {
      const tags = item.source?.tags;
      if (!Array.isArray(tags)) return;
      tags.forEach(tagItem => {
        const tagStr = typeof tagItem === 'string'
          ? tagItem
          : (tagItem?.name || tagItem?.tag || tagItem?.value || '');
        if (tagStr) {
          resultTagMap.set(tagStr, (resultTagMap.get(tagStr) || 0) + 1);
        }
      });
    });

    // 2) 合并 globalTags（无计数，标记来源为 'global'）
    const merged = new Map();
    // 全局 tag 优先填充（保证全量可见）
    globalTags.forEach(tagName => {
      if (tagName && !merged.has(tagName)) {
        merged.set(tagName, { label: tagName, value: tagName, count: 0, source: 'global' });
      }
    });
    // 结果中的 tag 覆盖（附带计数 + 标记为 'results'）
    resultTagMap.forEach((count, tagName) => {
      merged.set(tagName, { label: tagName, value: tagName, count, source: 'results' });
    });

    // 3) 排序：有计数的排前面（按 count 降序），无计数的按字母序
    return Array.from(merged.values())
      .sort((a, b) => {
        if (a.count > 0 && b.count === 0) return -1;
        if (a.count === 0 && b.count > 0) return 1;
        if (a.count !== b.count) return b.count - a.count;
        return a.label.localeCompare(b.label);
      })
      .slice(0, 30);
  }, [results, globalTags]);
```

- [ ] **Step 3: 更新候选标签渲染 — 视觉区分来源**

将候选标签渲染区（约第 276-303 行）的 Tag 组件更新，让全局 tag（无计数）色调稍淡：

```jsx
            <Wrap spacing={2}>
              {filteredAvailableTags.map((tag, idx) => (
                <WrapItem key={idx}>
                  <Tag
                    size="md"
                    variant="subtle"
                    bg={tag.source === 'results' ? 'whiteAlpha.100' : 'whiteAlpha.50'}
                    color={tag.source === 'results' ? 'whiteAlpha.800' : 'whiteAlpha.500'}
                    border="1px solid transparent"
                    borderRadius="full"
                    cursor="pointer"
                    px={3}
                    py={1}
                    minH="28px"
                    _hover={{ bg: 'whiteAlpha.200', borderColor: 'whiteAlpha.300' }}
                    transition="all 0.15s ease"
                    onClick={() => handleSelectTag(tag.value)}
                    userSelect="none"
                  >
                    <TagLabel fontSize="13px">
                      {tag.label} {tag.count > 1 && `(${tag.count})`}
                    </TagLabel>
                  </Tag>
                </WrapItem>
              ))}
            </Wrap>
```

- [ ] **Step 4: 更新空状态提示文案**

将最末尾的两个空状态提示合并为一个更通用的（约第 306-317 行）：

```jsx
        {availableTags.length === 0 && (
          <Text fontSize="12px" color="whiteAlpha.500" letterSpacing="0.02em" lineHeight="1.6">
            {t?.('tagsNoCandidates') || '暂无可用标签。打开任意资产详情可手动添加标签，或在上方输入框直接输入标签名搜索。'}
          </Text>
        )}
```

- [ ] **Step 5: Commit**

```bash
git add web/src/components/filters/TagsFilter.jsx
git commit -m "feat(TagsFilter): integrate globalTags for full candidate list

Merge wss tagQuery results with search-result tags. Global tags appear
with lighter styling; result-sourced tags show hit count. Empty state
message updated."
```

---

### Task 4: 修改 FabToolbar — 透传 globalTags

**Files:**
- Modify: `web/src/components/FabToolbar.jsx`

- [ ] **Step 1: 添加 globalTags prop 到 FabToolbar**

在 `FabToolbar` 的 props 列表中（约第 131 行 `selectedTags` 附近）添加：

```js
  selectedTags = [],
  onSelectedTagsChange,
  globalTags = [],  // ← 新增
  committedQuery = '',
```

- [ ] **Step 2: 透传给 TagsFilter**

在 `<TagsFilter>` 渲染处（约第 247 行）添加 `globalTags` prop：

```jsx
        <TagsFilter
          selectedTags={selectedTags}
          onSelectedTagsChange={onSelectedTagsChange}
          onTriggerSearch={onTriggerSearch}
          results={results}
          globalTags={globalTags}
          t={t}
        />
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/FabToolbar.jsx
git commit -m "feat(FabToolbar): pass globalTags prop through to TagsFilter"
```

---

### Task 5: 修改 EditableTagsPanel — 暴露 tags 快照给父组件

**Files:**
- Modify: `web/src/components/EditableTagsPanel.jsx`

- [ ] **Step 1: 新增 onTagsSnapshot prop**

在 `EditableTagsPanel` 的 props 中添加 `onTagsSnapshot`：

```js
const EditableTagsPanel = memo(function EditableTagsPanel({
  serverUrl,
  assetPath,
  initialTags = [],
  getHeaders,
  apiUrl,
  assetUrl,
  onTagsSnapshot,  // ← 新增：(latestTags: Array<{name, tag_namespace, value}>) => void
}) {
```

- [ ] **Step 2: 在 tags 变化时通过 ref 暴露最新快照**

在 `useTagManager` 解构之后、`lastErrorAtRef` 之前，添加一个 effect 将最新的正常 tag 暴露：

```js
  // [TagFilterSearch] 当 tags 变化时通知父组件最新快照（仅 normal 状态的）
  const latestNormalTags = useMemo(
    () => tags.filter(t => t.status === 'normal').map(t => ({ name: t.name, tag_namespace: t.tag_namespace, value: t.value })),
    [tags]
  );
  const latestNormalTagsRef = useRef(latestNormalTags);
  latestNormalTagsRef.current = latestNormalTags;

  // 暴露给父组件的 imperative 读取方法：getLatestTags()
  // 父组件在 onClose 时调用，避免每次 tag 变化都触发回调
  useEffect(() => {
    if (onTagsSnapshot) {
      onTagsSnapshot({ getLatestTags: () => latestNormalTagsRef.current });
    }
  }, [onTagsSnapshot]);
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/EditableTagsPanel.jsx
git commit -m "feat(EditableTagsPanel): expose onTagsSnapshot for parent to read latest tags on close"
```

---

### Task 6: 修改 AssetDetailsModal — 关闭时上报 tags

**Files:**
- Modify: `web/src/AssetDetailsModal.jsx`

- [ ] **Step 1: 新增 onTagsChanged prop**

在 `AssetDetailsModal` 的 props 解构中（约第 410 行）添加：

```js
const AssetDetailsModal = ({ 
  isOpen, 
  onClose, 
  selectedItem, 
  copyToClipboard, 
  showScores = SEARCH_DEFAULTS.showScores,
  plugins,
  getHeaders,
  apiUrl,
  serverUrl,
  triggerReindexAllPlugins,
  triggerReindexIndividualPlugin,
  onTagsChanged,  // ← 新增：(assetId: string, tags: Array) => void
}) => {
```

- [ ] **Step 2: 添加 tagsSnapshotRef 和 handleTagsSnapshot**

在组件内 `useDisclosure` 声明之后（约第 441 行后）添加：

```js
  // [TagFilterSearch] 读取 EditableTagsPanel 最新 tags 的 ref
  const tagsSnapshotRef = useRef(null);
  const handleTagsSnapshot = useCallback(({ getLatestTags }) => {
    tagsSnapshotRef.current = getLatestTags;
  }, []);
```

- [ ] **Step 3: 包装 onClose — 关闭时上报最新 tags**

在同一位置添加 `handleClose`：

```js
  // [TagFilterSearch] 关闭 Modal 时把最新 tags 上报给父组件
  const handleClose = useCallback(() => {
    if (onTagsChanged && tagsSnapshotRef.current && selectedItem) {
      const assetId = selectedItem.source?.url || selectedItem.source?.base_key || '';
      const latestTags = tagsSnapshotRef.current();
      if (assetId && Array.isArray(latestTags)) {
        onTagsChanged(assetId, latestTags);
      }
    }
    onClose();
  }, [onClose, onTagsChanged, selectedItem]);
```

- [ ] **Step 4: 替换 Modal 的 onClose 为 handleClose**

在 `<Modal isOpen={isOpen} onClose={onClose} ...>` 中将 `onClose` 改为 `handleClose`：

```jsx
    <Modal isOpen={isOpen} onClose={handleClose} size="6xl">
```

同时检查 Modal 内部所有直接调用 `onClose()` 的地方也改为 `handleClose()`（如 ModalCloseButton 会自动使用 Modal 的 onClose，无需手动改）。

- [ ] **Step 5: 传递 onTagsSnapshot 给 EditableTagsPanel**

在 `<EditableTagsPanel>` 渲染处（约第 864 行）添加 prop：

```jsx
                  <EditableTagsPanel
                    serverUrl={serverUrl}
                    assetPath={baseKey}
                    initialTags={selectedItem.source.tags}
                    getHeaders={getHeaders}
                    apiUrl={apiUrl}
                    assetUrl={baseKey}
                    onTagsSnapshot={handleTagsSnapshot}
                  />
```

- [ ] **Step 6: Commit**

```bash
git add web/src/AssetDetailsModal.jsx
git commit -m "feat(AssetDetailsModal): report latest tags to parent on close

On modal close, reads the current tags from EditableTagsPanel and
invokes onTagsChanged(assetId, tags) so the parent can optimistically
update the results array."
```

---

### Task 7: 修改 HybridDeepSearchUI — 集成 useGlobalTags + handleTagsChanged

**Files:**
- Modify: `web/src/HybridDeepSearchUI.jsx`

- [ ] **Step 1: 导入 useGlobalTags**

在文件顶部 import 区域（约第 91 行 `usePathSuggestions` 附近）添加：

```js
import useGlobalTags from "./hooks/useGlobalTags";
```

- [ ] **Step 2: 调用 useGlobalTags hook**

在 `nucleusServerUrl` 的 useMemo 之后（约第 295 行后）添加：

```js
  // [TagFilterSearch] 获取全局可用 tag 列表（供 TagsFilter 候选）
  const { globalTags } = useGlobalTags({
    serverUrl: nucleusServerUrl,
    getHeaders,
  });
```

注意：`getHeaders` 在后面才定义（约第 1282 行），但因为 React hooks 的闭包特性和 `useGlobalTags` 内部是在 useEffect 里调用 `getHeaders`（异步），不会有 TDZ 问题。但为安全起见，把 `useGlobalTags` 的调用放在 `getHeaders` 定义之后更稳妥。

实际位置：在 `getHeaders` useCallback 定义之后（约第 1300 行后）添加：

```js
  // [TagFilterSearch] 获取全局可用 tag 列表（供 TagsFilter 候选）
  const { globalTags } = useGlobalTags({
    serverUrl: nucleusServerUrl,
    getHeaders,
  });
```

- [ ] **Step 3: 添加 handleTagsChanged 回调**

在 `getHeaders` 附近（约第 1300 行后）添加：

```js
  // [TagFilterSearch] Modal 关闭时乐观更新 results 中对应 item 的 source.tags
  const handleTagsChanged = useCallback((assetId, latestTags) => {
    if (!assetId || !Array.isArray(latestTags)) return;
    setResults(prev => prev.map(item => {
      const key = item.source?.url || item.source?.base_key || '';
      if (key === assetId) {
        return {
          ...item,
          source: { ...item.source, tags: latestTags },
        };
      }
      return item;
    }));
  }, []);
```

- [ ] **Step 4: 传 globalTags 给 FabToolbar**

在 `<FabToolbar>` 渲染处（约第 3030-3090 行区域），在 `selectedTags` prop 附近添加：

```jsx
                selectedTags={selectedTags}
                onSelectedTagsChange={(nextTags) => {
                  const arr = Array.isArray(nextTags) ? nextTags : [];
                  selectedTagsRef.current = arr;
                  setSelectedTags(arr);
                  setTimeout(() => handleSearchRef.current?.(), 50);
                }}
                globalTags={globalTags}
```

- [ ] **Step 5: 传 onTagsChanged 给 AssetDetailsModal**

在 `<AssetDetailsModal>` 渲染处（约第 3166 行）添加 prop：

```jsx
        <AssetDetailsModal
          isOpen={isDetailsOpen}
          onClose={onDetailsClose}
          selectedItem={selectedItem}
          copyToClipboard={copyToClipboard}
          showScores={showScores}
          plugins={plugins}
          getHeaders={getHeaders}
          apiUrl={apiUrl}
          serverUrl={nucleusServerUrl}
          triggerReindexAllPlugins={triggerReindexAllPlugins}
          triggerReindexIndividualPlugin={triggerReindexIndividualPlugin}
          onTagsChanged={handleTagsChanged}
        />
```

- [ ] **Step 6: Commit**

```bash
git add web/src/HybridDeepSearchUI.jsx
git commit -m "feat(HybridDeepSearchUI): integrate useGlobalTags + handleTagsChanged

- Call useGlobalTags to fetch all available tags via wss tagQuery
- Pass globalTags to FabToolbar for TagsFilter candidate list
- Add handleTagsChanged callback that optimistically updates results
  array when AssetDetailsModal closes after tag edits
- Pass onTagsChanged to AssetDetailsModal"
```

---

### Task 8: 添加 i18n 文案

**Files:**
- Modify: `web/src/i18n/en.js`
- Modify: `web/src/i18n/zh.js`

- [ ] **Step 1: 添加英文文案**

在 `web/src/i18n/en.js` 的 `tagsNoRealTagsHint` 行之后（约第 506 行）添加：

```js
  tagsNoCandidates: "No tags available yet. Open any asset's details to add tags, or type a tag name above to search.",
  tagsGlobalSection: "All available tags",
  tagsResultsSection: "Tags in current results",
```

- [ ] **Step 2: 添加中文文案**

在 `web/src/i18n/zh.js` 的 `tagsNoRealTagsHint` 行之后（约第 506 行）添加：

```js
  tagsNoCandidates: "暂无可用标签。打开任意资产详情可手动添加标签，或在上方输入框直接输入标签名搜索。",
  tagsGlobalSection: "所有可用标签",
  tagsResultsSection: "当前结果中的标签",
```

- [ ] **Step 3: Commit**

```bash
git add web/src/i18n/en.js web/src/i18n/zh.js
git commit -m "i18n: add tag filter empty state and section label messages"
```

---

### Task 9: 端到端验证

**Files:** 无新文件改动，纯验证步骤

- [ ] **Step 1: 运行 buildSearchPayload 测试**

Run: `cd web && node src/utils/__tests__/buildSearchPayload.test.mjs`
Expected: `10/10 passed`

- [ ] **Step 2: 启动 dev server 确认编译通过**

Run: `cd web && npm start`（或 PowerShell `cd scripts && .\dev-preview.ps1`）
Expected: 编译成功，无 TypeScript/ESLint 错误，页面正常加载

- [ ] **Step 3: 手动验证核心场景**

1. **标签筛选搜索**：
   - 先给某资产加标签 "testxyz"
   - 搜索空白（浏览模式）→ 打开标签筛选 → 输入 "testxyz" → 确认
   - 期望：页面发起新搜索请求（q 包含 "testxyz"），结果中出现含该 tag 的资产

2. **卡片即时更新**：
   - 搜索出某资产 → 点击打开详情 Modal → 加标签 "newone"
   - 关闭 Modal
   - 期望：卡片上立即看到 "newone" tag badge

3. **候选列表全量**：
   - 打开标签筛选面板
   - 期望："点击标签可快速添加"区域显示从 tagQuery 拉取的全部 tag（不只是当前结果中的）

4. **降级场景**：
   - 未登录 Nucleus 时打开标签筛选面板
   - 期望：候选列表只显示当前结果中的 tag（无 wss 全局 tag），不报错

- [ ] **Step 4: 最终 Commit（如有 lint 修复）**

```bash
git add -A
git commit -m "fix: lint/format cleanup after tag filter optimization"
```

---

## 注意事项

1. **不要修改** `web/src/services/taggingService.js` 和 `web/src/hooks/useTagManager.js` — 它们已有完整能力，直接复用
2. `buildSearchPayload` 测试文件的期望值在历史上已经被更新为"tags 拼入 q"的形式（从 case 内容看），所以改动后测试应该直接通过
3. `useGlobalTags` 的 `getHeaders` 依赖注意 React hooks 规则——确保在 `getHeaders` useCallback 定义之后调用该 hook（或利用 ref 解耦）
4. `AssetDetailsModal` 的 `onClose` 替换为 `handleClose` 后，ModalCloseButton 和 ESC 关闭都会自动走新路径（Chakra Modal 把 onClose 传给 ModalContent 内部处理）
