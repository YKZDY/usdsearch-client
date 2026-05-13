# Tag 功能优化设计文档

## 概述

优化 USD Search Client 前端的标签筛选功能，解决两个核心问题：
1. 标签筛选只从当前已加载的 50 条结果中做本地过滤，无法找到全量含某 tag 的资产
2. 在资产详情 Modal 中给资产加标签后，卡片列表无法即时反映新标签

**约束：后端不可改动，所有改动限于前端。**

---

## 问题 1：标签筛选应发后端搜索请求

### 现状

- `buildSearchPayload` 在 [UX Polish R2] 中将 `selectedTags` 从 `q` 字段中移除
- `HybridDeepSearchUI.jsx` 的 `tagFilteredResults` 仅从已加载的 `results`（≤50 条）中按 `source.tags` 做前端 AND 过滤
- 用户选中 tag 后只能看到当前 50 条结果中恰好有该 tag 的资产，大量真正含该 tag 的资产不可见
- `TagsFilter` 的候选标签列表只从当前 50 条结果的 `source.tags` 聚合，通常为空或极少

### 方案

#### A. 搜索请求拼接 — 修改 `buildSearchPayload`

**改动：** 当 `selectedTags` 非空时，将其拼入 `q` 字段（与 committedQuery 共存）。

```js
// buildSearchPayload.js 改动
const parts = [committedQuery, searchQuery, cat, ...tags]
  .map(s => (typeof s === 'string' ? s.trim() : ''))
  .filter(Boolean);
```

**效果：**
- 用户搜索 "apple" + 选 tag "statzzz" → `q = "apple statzzz"`
- 后端 `hybrid_text_query` 全文索引命中 `tags.tag` 字段 → 返回含 statzzz tag 的资产
- 同时保留 apple 相关性评分

**为什么行得通：** 用户在搜索框输入 tag 名已验证后端能通过 `tags.tag` 索引命中。

#### B. 前端二次验证 — 保留精确过滤

**改动：** 保留 `tagFilteredResults` 的 AND 过滤逻辑不变。

**作用：** 后端全文搜索可能命中"文件名恰好包含该词"的噪音结果。前端二次验证确保展示的每条结果 `source.tags` 里真实包含该 tag，实现精准过滤。

#### C. 候选标签列表扩充 — 接入 `tagQuery` API

**改动：** 给 `TagsFilter` 组件新增 prop `globalTags`（来自 wss `tagQuery` API），合并到候选列表。

**数据流：**
1. `HybridDeepSearchUI` 或 `FabToolbar` 层新增一个 `useGlobalTags` hook
2. 该 hook 调用 `taggingService.tagQuery(host, token, '/')` 获取根路径下所有已有 tag
3. 结果缓存 5 分钟（复用 `useTagManager` 中已有的 `queryCache` TTL 机制）
4. `TagsFilter` 的"点击标签可快速添加"区域：优先展示 `globalTags`（全量），标注出现在当前结果中的 tag 的命中计数

**Fallback：** 若用户未登录 Nucleus（无 token）→ 降级为仅展示当前结果中的 tag（现有行为）。

### 边界情况

| 场景 | 行为 |
|------|------|
| 用户选 tag 但搜索返回 0 结果 | 展示提示："该标签可能尚未被索引，请稍后重试" + "立即刷新"按钮 |
| 用户清除所有 selectedTags | 仅用 committedQuery 重搜，回到原结果 |
| 用户同时选多个 tag | 所有 tag 拼入 q（空格分隔），前端 AND 验证所有 tag 都存在 |
| URL 分享 | 已有 `?tags=a,b` 序列化/反序列化支持，无需改动 |
| tag 名与搜索词重复 | q 中出现重复词对后端无影响（scoring 不会加倍），前端 dedup 可选 |

---

## 问题 2：加标签后卡片即时展示

### 现状

- `AssetDetailsModal` 内 `EditableTagsPanel` 维护了最新 tags（乐观更新 + wss 持久化）
- 关闭 Modal 后，卡片列表读取的 `result.source.tags` 仍是后端搜索引擎返回的旧快照
- 用户体验：刚打的标签在卡片上不可见，需要等 reindex + 重搜

### 方案

#### 乐观更新 results 数组

**改动：**

1. `AssetDetailsModal` 新增 prop：`onTagsChanged(assetIdentifier, latestTags)`
2. `EditableTagsPanel` 的 `useTagManager` 已有 `tags` state，Modal 监听变化并上报
3. `HybridDeepSearchUI` 收到回调后，更新 `results` state 中对应 item 的 `source.tags`：

```js
// HybridDeepSearchUI.jsx
const handleTagsChanged = useCallback((assetId, latestTags) => {
  setResults(prev => prev.map(item => {
    const key = item.source?.url || item.source?.base_key || '';
    if (key === assetId) {
      return {
        ...item,
        source: { ...item.source, tags: latestTags }
      };
    }
    return item;
  }));
}, []);
```

4. 卡片列表自动 re-render，新 tag 可见

**标识匹配：** 使用 `source.url` 或 `source.base_key`（即 `omniverse://` 全路径）作为 item 唯一标识。

### 触发时机

- **方案 A（推荐）：** Modal `onClose` 时读取最新 tags 一次性上报
  - 优点：一次更新，不频繁触发 re-render
  - 缺点：如果用户不关闭 Modal 就看不到卡片变化（但 Modal 打开时卡片本身被遮挡，不影响）

- **方案 B：** tags 每次变化实时上报
  - 优点：即时
  - 缺点：高频 re-render（每次加/删 tag 都触发整个列表更新）

**选择方案 A** — Modal 关闭时一次性同步。

### 边界情况

| 场景 | 行为 |
|------|------|
| 加 tag 后 wss 失败（status=failed） | 不上报失败的 tag，只上报 status=normal 的 |
| 用户加 tag 后立即重新搜索 | 重搜结果覆盖 results → 若 reindex 完成则自然包含新 tag；若未完成则旧快照但 Modal 重开后仍能看到 |
| 同一资产出现在多个结果中（去重关闭时） | 用 assetId 全量匹配更新所有命中项 |

---

## 额外优化点

### 1. 空结果引导

当 tag 搜索返回 0 条 **且** 前端二次过滤也为 0 时：

```
"未找到含标签 "{tagName}" 的资产。
可能原因：索引更新需要几秒，请稍后重试。"
[立即刷新] 按钮
```

### 2. 候选列表视觉区分

`TagsFilter` 候选区分两类来源：
- **当前结果中的 tag** — 显示命中计数 badge（如 `abc (3)`）
- **全局 tag（来自 tagQuery）** — 无计数，色调稍淡，暗示"全局可用但当前结果未命中"

### 3. Loading 状态已覆盖

现有 `handleSearch` 内 `setIsLoading(true)` + `onTriggerSearch` 触发链路已确保 tag 选中后有 loading 反馈，无需额外改动。

### 4. URL 共享一致性

现有 `serializeToURL` 写 `?tags=a,b` + `deserializeFromURL` 恢复 `selectedTags` 的链路不变。新方案下分享带 tag 的 URL → 对方打开 → 自动搜索含该 tag 的资产。

---

## 涉及文件

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `web/src/utils/buildSearchPayload.js` | 修改 | 将 selectedTags 重新拼入 q |
| `web/src/components/filters/TagsFilter.jsx` | 修改 | 接收 globalTags prop，合并候选列表 |
| `web/src/hooks/useGlobalTags.js` | 新增 | 调用 tagQuery API 获取全量 tag |
| `web/src/HybridDeepSearchUI.jsx` | 修改 | 传 globalTags 给 FabToolbar；新增 handleTagsChanged；传给 AssetDetailsModal |
| `web/src/AssetDetailsModal.jsx` | 修改 | 新增 onTagsChanged prop，关闭时上报 |
| `web/src/components/EditableTagsPanel.jsx` | 修改 | 暴露当前 tags 给父组件（通过 ref 或回调） |
| `web/src/components/FabToolbar.jsx` | 修改 | 透传 globalTags prop 给 TagsFilter |
| `web/src/i18n/en.js` / `zh.js` | 修改 | 新增空结果提示文案 |

---

## 不改动

- 后端 API / 索引逻辑
- `taggingService.js`（已有 `tagQuery` 能力，直接复用）
- `useTagManager.js`（内部逻辑不变，只是 EditableTagsPanel 需要把 tags 暴露出去）
- URL 序列化/反序列化（已支持 `?tags=`）

---

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| tag 名恰好是常见英文单词（如 "set"），拼入 q 导致大量无关结果 | 前端二次验证 AND 过滤只保留真正含该 tag 的；用户可见结果精确 |
| tagQuery API 需要 wss 连接，未登录时不可用 | 降级为现有行为（仅当前结果中的 tag），不阻塞核心流程 |
| 乐观更新后下一次搜索可能覆盖（reindex 未完成） | 可接受 — 用户再打开 Modal 仍能看到正确 tag，reindex 完成后搜索自然恢复 |
| 多个 tag 同时选中时 q 过长 | 后端 hybrid_text_query 对多词处理为 OR 逻辑（任一命中即返回），前端 AND 验证确保全部命中 |
