# 修复相似搜索使用错误预览图 - 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复"查找相似资产"按钮始终使用 asset URL 而非当前展示的预览图 base64 的 bug。

**Architecture:** 采用分层方案：

1. **主方案（DOM 直接读取）**：`handleFindSimilar` 通过 `cardRef` 或 `e.target.closest()` 找到卡片 DOM，再 `querySelector('img[alt="Asset thumbnail"]')` 获取当前 `<img>` 的 `src`（base64 data URL）。
2. **保险方案（全局 Map）**：如果 DOM 方案因为 Chakra Card ref 不支持或 img.src 为空等原因失败，则使用 `window.__imageStateMap` 全局 Map 存储每个资产的当前状态。

**Tech Stack:** React, Chakra UI v2, 原生 JavaScript

**关键文件：**

- `web/src/utils/imageStateStore.js` — 全局 Map 存储（新增）
- `web/src/components/NavigableAssetImage.jsx` — 写入全局 Map
- `web/src/components/VirtualizedHybridSearchResults.jsx` — handleFindSimilar 读取
- `web/src/HybridDeepSearchUI.jsx` — 消费 imageData 构建 vector_queries

---

## 根因分析（最终版）

### 已确认的事实

1. `ImageWithSkeleton` 渲染标准 `<img>` 元素（`Box as="img" src={src} alt={alt}`）
2. `NavigableAssetImage` 的 `src` 变量在 offset > 0 时来自 `imageData` state（base64 data URL）
3. `handleFindSimilar` 已实现 `cardRef` + `e.target.closest()` 双重 DOM 查询
4. `HybridDeepSearchUI.handleFindSimilar` 中 `if (effectiveImageData)` 条件正确
5. 用户多次测试仍然发送 URL — **说明 DOM 查询获取不到 base64**

### 最可能的根因（按概率排序）

| #   | 假设                                                                                              | 验证方式                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | **Chakra UI `Card` 组件不转发 ref** — `cardRef.current` 始终为 null                               | 在 Console 中执行 `document.querySelector('[data-card-index]').__reactFiber$` 检查                              |
| 2   | **`img.src` 在点击时不是 base64** — 可能因为 React 重新渲染导致 src 被重置为空                    | 在 Console 中执行 `document.querySelector('[data-card-index] img[alt="Asset thumbnail"]').src.substring(0, 50)` |
| 3   | **`e.target.closest('[data-card-index]')` 返回 null** — 按钮在 Tooltip wrapper 内，closest 找不到 | 在 Console 中检查按钮的 DOM 层级                                                                                |
| 4   | **HMR 没有正确更新** — 旧代码仍在运行                                                             | 完全重启 dev server                                                                                             |

### 为什么全局 Map 方案能 100% 解决

全局 Map 方案完全绕过了上述所有可能的失败点：

- 不依赖 `ref`（绕过假设 1）
- 不依赖 DOM 查询（绕过假设 2、3）
- 不依赖 HMR（模块级变量在 import 时初始化）
- `NavigableAssetImage` 在 `setImageData` 时同步写入全局 Map
- `handleFindSimilar` 在触发时同步从全局 Map 读取

---

## 实施步骤

- [ ] 1. 创建全局图片状态管理模块 `imageStateStore.js`
  - 创建文件：`web/src/utils/imageStateStore.js`
  - 实现一个简单的模块级 Map 存储，以 assetUrl 为 key
  - 存储 `{ currentOffset, imageData, lastUpdated }`
  - 提供 `setImageState(assetUrl, offset, imageData)` 和 `getImageState(assetUrl)` 函数
  - 用 `LM CUSTOMIZATION` 标记包裹
  - _需求：2.1、2.2、2.3_

- [ ] 2. 修改 `NavigableAssetImage.jsx` — 在状态变化时写入全局 Map
  - 修改文件：`web/src/components/NavigableAssetImage.jsx`
  - import `setImageState`
  - 在现有的 `useEffect([currentOffset])` 中，除了调用 `onOffsetChangeRef.current`，同时调用 `setImageState(assetUrl, currentOffset, imageData || src)`
  - 在现有的 `useEffect([imageData])` 中，同时调用 `setImageState(assetUrl, currentOffset, imageData)`
  - **关键**：当 offset=0 且 `imageData` 为 null 时，使用 `result.source.image` 构造 `data:image/png;base64,${result.source.image}` 写入
  - 保留现有的 `onOffsetChange` / `onCurrentImageChange` 回调（向后兼容）
  - _需求：2.1、2.2_

- [ ] 3. 修改 `VirtualizedHybridSearchResults.jsx` — handleFindSimilar 优先从全局 Map 读取
  - 修改文件：`web/src/components/VirtualizedHybridSearchResults.jsx`
  - import `getImageState`
  - 修改 `VirtualizedResultGridItem` 的 `handleFindSimilar`：
    - 优先从 `getImageState(baseKey)` 读取
    - 保留 `cardRef` + `closest()` 作为兜底
  - 同样修改 `VirtualizedResultListItem` 的 `handleFindSimilar`
  - _需求：1.1、1.2_

- [ ] 4. 修改 `NavigableAssetImage.jsx` 内部 FindSimilar 按钮
  - 修改文件：`web/src/components/NavigableAssetImage.jsx`
  - 修改 `FindSimilarOverlay` 按钮的 onClick：当 `imageData` 为 null 且 offset=0 时，使用 `result.source.image` 构造 base64 传递
  - 确保 `onFindSimilar(assetUrl, currentOffset, effectiveImageData)` 中 `effectiveImageData` 永远不为 null
  - _需求：1.1_

- [ ] 5. 确认 `HybridDeepSearchUI.jsx` 中 vector_queries 逻辑正确
  - 修改文件：`web/src/HybridDeepSearchUI.jsx`（第 2040 行附近）
  - 确认当 `effectiveImageData` 不为 null 时，使用 `effectiveImageData.replace(/^data:image\/[^;]+;base64,/, '')` 作为 query
  - 确认当 `effectiveImageData` 为 null 且 `effectiveOffset === 0` 时，使用 assetUrl
  - 当前代码已正确实现此逻辑，只需验证无需修改
  - _需求：1.1、1.2_

- [ ] 6. 清理调试代码
  - 搜索并移除所有与此 bug 相关的临时 `console.log` / `console.debug` 语句
  - 确保 `imageStateRef` / `handleOffsetChange` / `handleCurrentImageChange` 等冗余代码被清理或保留为兜底
  - _需求：代码质量_

- [ ] 7. 手动验证
  - **必须完全重启 dev server**（`Ctrl+C` → `npm start`）
  - TC1：hover house.usd → 切换到非黑色图 → 点击底部 🔍 → 检查 `vector_queries[0].query` 是否为 base64
  - TC2：不 hover（offset=0）→ 点击底部 🔍 → 检查 `vector_queries[0].query` 是否为 asset URL
  - TC3：验证 house.usd 显示 11 张预览图（"1/11"）
  - TC4：验证控制台无 `[TaggingService] dialing` 大量日志
  - _需求：1.1、1.2、1.3_

---

## 技术细节

### `imageStateStore.js` 接口设计

```javascript
// web/src/utils/imageStateStore.js
// === LM CUSTOMIZATION: ImageStateStore START ===
const imageStateMap = new Map();

export function setImageState(assetUrl, offset, imageData) {
  if (!assetUrl) return;
  imageStateMap.set(assetUrl, {
    currentOffset: offset,
    imageData,
    lastUpdated: Date.now(),
  });
}

export function getImageState(assetUrl) {
  return imageStateMap.get(assetUrl) || null;
}

export function clearImageState(assetUrl) {
  imageStateMap.delete(assetUrl);
}
// === LM CUSTOMIZATION: ImageStateStore END ===
```

### `handleFindSimilar` 最终版逻辑

```javascript
const handleFindSimilar = useCallback(
  (e) => {
    e.stopPropagation();

    // 方式 1（最可靠）：从全局 Map 读取
    const globalState = getImageState(baseKey);
    let imageData = globalState?.imageData || null;
    let currentOffset = globalState?.currentOffset || 0;

    // 方式 2（兜底）：从 DOM 获取
    if (!imageData) {
      const cardEl = cardRef.current;
      if (cardEl) {
        const img = cardEl.querySelector('img[alt="Asset thumbnail"]');
        if (img && img.src && img.src.startsWith("data:")) {
          imageData = img.src;
        }
      }
    }

    // 方式 3（最后兜底）：从事件冒泡路径获取
    if (!imageData) {
      const card = e.target?.closest?.("[data-card-index]");
      if (card) {
        const img = card.querySelector('img[alt="Asset thumbnail"]');
        if (img && img.src && img.src.startsWith("data:")) {
          imageData = img.src;
        }
      }
    }

    onFindSimilar?.(baseKey, currentOffset, imageData);
  },
  [onFindSimilar, baseKey],
);
```

### 为什么全局 Map 方案能 100% 解决

| 对比维度               | React ref/callback | DOM 查询 | 全局 Map |
| ---------------------- | ------------------ | -------- | -------- |
| 受 React.memo 影响     | ✅ 是              | ❌ 否    | ❌ 否    |
| 受虚拟列表卸载影响     | ✅ 是              | ❌ 否    | ❌ 否    |
| 受 Chakra ref 转发影响 | ✅ 是              | ❌ 否    | ❌ 否    |
| 受 img.src 重置影响    | N/A                | ✅ 是    | ❌ 否    |
| 受闭包捕获影响         | ✅ 是              | ❌ 否    | ❌ 否    |
| 实现复杂度             | 高                 | 中       | 低       |
| 可靠性                 | 低                 | 中       | 高       |

---

## 技术约束

1. 组件在 `React.memo` + 虚拟列表环境中运行
2. 后端 API 的 `vector_queries[0].query` 只接受纯 URL 字符串或 base64 字符串
3. 所有改动必须用 `LM CUSTOMIZATION` 标记包裹
4. 不能引入新的 npm 依赖
5. Chakra UI v2 的 `Card` 组件基于 `Box`，理论上支持 ref 转发
6. `ImageWithSkeleton` 渲染 `<Box as="img" src={src} alt={alt} />`（标准 img 元素）
