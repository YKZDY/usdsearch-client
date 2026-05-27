# 需求文档：修复相似搜索使用错误预览图的 Bug

## 引言

### 问题描述

当用户在 `house.usd` 等多渲染图资产的卡片上 hover 切换到非黑色预览图（如第 8 张），然后点击底部 🔍 "查找相似资产"按钮时，发送给后端的 `vector_queries[0].query` 仍然是纯 asset URL（`"omniverse://ov.qq.com/Library/RenderTest1/house.usd"`），而非当前展示的预览图的 base64 数据。

### 预期行为

- 当用户在 offset > 0 的预览图上点击"查找相似"时，应该使用**当前展示的预览图的 base64 数据**作为 `vector_queries[0].query`
- 当用户在 offset = 0 时点击"查找相似"，使用 asset URL 是正确的（后端会用默认 embedding）

### 实际行为

- 无论用户切换到哪张预览图，`query` 始终是纯 asset URL
- 导致相似搜索始终基于 offset=0 的图片（可能是黑图），而非用户当前看到的图

### 影响

- 用户体验极差：用户明确选择了一张非黑色的预览图，但搜索结果基于黑色图片
- 搜索结果为 0 或不相关

---

## 架构分析

### 数据流路径

```
用户 hover 切换预览图
  → NavigableAssetImage 内部 currentOffset state 变为 7
  → NavigableAssetImage 通过 onOffsetChange 回调通知父组件
  → VirtualizedResultGridItem 的 imageStateRef.current.currentOffset 应更新为 7
  → 用户点击底部 🔍 按钮
  → handleFindSimilar 读取 imageStateRef 或 DOM 获取当前图片
  → 调用 onFindSimilar(baseKey, offset, imageData)
  → HybridDeepSearchUI.handleFindSimilar(assetUrl, imgOffset, currentImageData)
  → 构建 vector_queries，如果有 imageData 则用 base64
```

### 已确认的事实

1. **NavigableAssetImage 内部的 hover 分区切换是正常的**（圆点指示器正确显示 "8/11"）
2. **后端 API 不支持 `?img_offset=X` URL 参数格式**（`vector_queries.query` 只接受纯 URL 或 base64 字符串）
3. **DOM 中的 `<img>` 元素确实有 base64 data URL 作为 src**（Playwright 验证过）
4. **`handleFindSimilar` 发送的 `query` 始终是纯 URL**（多次手动验证确认）

### 已尝试的方案及失败原因

| #   | 方案                                                         | 失败原因                                              |
| --- | ------------------------------------------------------------ | ----------------------------------------------------- |
| 1   | `onOffsetChange` 回调 + `currentOffsetRef`                   | `currentOffsetRef.current` 在点击时始终为 0，原因不明 |
| 2   | `useEffect` 依赖 `onOffsetChange` 同步 offset                | 内联函数引用每次渲染变化，导致 effect 行为不可预测    |
| 3   | `useRef` 存储回调避免依赖问题                                | 仍然无效，`currentOffsetRef.current` 在点击时为 0     |
| 4   | `forwardRef` + `useImperativeHandle` 暴露状态                | ref 在虚拟列表 + React.memo 环境下绑定不可靠          |
| 5   | DOM 遍历 `e.currentTarget` → while 循环找 `data-card-index`  | `e.currentTarget` 可能不在预期的 DOM 层级             |
| 6   | DOM 遍历 `e.target.closest('[data-card-index]')` + `cardRef` | 最新方案，尚未验证                                    |

### 核心疑问（需要调查）

1. **为什么 `cardRef.current.querySelector('img[alt="Asset thumbnail"]').src` 获取不到 base64？**
   - 可能原因 A：`cardRef` 没有正确绑定到 Card 元素
   - 可能原因 B：`<img>` 的 `src` 在点击时已经被重置（组件重新渲染）
   - 可能原因 C：Chakra UI 的 `Card` 组件不支持 `ref` 转发
   - 可能原因 D：虚拟列表在点击时触发了组件卸载/重新挂载

2. **为什么 `onOffsetChange` 回调传递的 offset 在点击时为 0？**
   - 可能原因 A：React.memo 阻止了 `NavigableAssetImage` 的重新渲染
   - 可能原因 B：虚拟列表的 item 在某些时机被卸载重新挂载
   - 可能原因 C：`useCallback` 的闭包捕获了旧值
   - 可能原因 D：HMR 热更新对 memo 组件不可靠（但用户已重启 dev server）

---

## 需求

### 需求 1：相似搜索使用当前展示的预览图

**用户故事：** 作为一名数字资产搜索用户，我希望点击"查找相似资产"时使用我当前看到的预览图进行搜索，以便找到与我选择的视角/渲染图相似的资产。

#### 验收标准

1. WHEN 用户在多图资产卡片上 hover 切换到 offset > 0 的预览图 AND 点击"查找相似资产"按钮 THEN 系统 SHALL 使用当前展示的预览图的 base64 数据作为 `vector_queries[0].query`
2. WHEN 用户在 offset = 0 的预览图上点击"查找相似资产" THEN 系统 SHALL 使用 asset URL 作为 `vector_queries[0].query`（后端使用默认 embedding）
3. WHEN 当前预览图为黑图（纯黑/近黑） AND 用户点击"查找相似资产" THEN 系统 SHALL 自动选择第一张有效（非黑）预览图进行搜索，并通过 toast 通知用户
4. WHEN 所有预览图均为黑图 THEN 系统 SHALL 中止搜索并通过 toast 提示用户"该资产无有效预览图"

### 需求 2：确保数据传递链路可靠

**用户故事：** 作为开发者，我希望 NavigableAssetImage 的当前状态能可靠地传递给父组件的事件处理器，以便在任何 React 渲染环境下都能正确工作。

#### 验收标准

1. WHEN NavigableAssetImage 的 currentOffset 变化 THEN 父组件 SHALL 能在任意时刻同步读取到最新的 offset 值
2. WHEN NavigableAssetImage 的 imageData 变化 THEN 父组件 SHALL 能在任意时刻同步读取到最新的图片 data URL
3. IF 组件被 React.memo 包裹 THEN 数据传递机制 SHALL 不受 memo 优化影响
4. IF 组件在虚拟列表中被卸载/重新挂载 THEN 数据传递机制 SHALL 正确重新初始化

---

## 调试计划

### Phase 1：确认 DOM 状态（最小化验证）

在浏览器 Console 中手动执行以下代码，确认 DOM 中的 `<img>` 状态：

```javascript
// 步骤 1：hover 到 house.usd 卡片，切换到非黑色图
// 步骤 2：在 Console 中执行：
const cards = document.querySelectorAll("[data-card-index]");
cards.forEach((card, i) => {
  const img = card.querySelector('img[alt="Asset thumbnail"]');
  if (img) {
    console.log(
      `Card ${i}: src type = ${img.src.startsWith("data:") ? "base64" : "url"}, src length = ${img.src.length}`,
    );
  }
});
```

**预期结果**：hover 过的卡片的 img.src 应该是 base64（长度 > 1000）

### Phase 2：确认 cardRef 绑定

```javascript
// 在 VirtualizedResultGridItem 的 handleFindSimilar 中临时添加：
console.log("cardRef.current:", cardRef.current);
console.log("cardRef tag:", cardRef.current?.tagName);
const img = cardRef.current?.querySelector('img[alt="Asset thumbnail"]');
console.log("img found:", !!img);
console.log(
  "img.src type:",
  img?.src?.startsWith("data:") ? "base64" : img?.src?.substring(0, 50),
);
```

### Phase 3：确认 Chakra Card 的 ref 转发

Chakra UI v2 的 `Card` 组件是否支持 `ref` 转发？如果不支持，需要用 `Box` 包裹或使用 `as` prop。

### Phase 4：备选方案评估

如果 DOM 方案仍然失败，考虑以下架构级方案：

| 方案             | 描述                                                                                              | 优点                    | 缺点                             |
| ---------------- | ------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------- |
| A. 全局 Store    | 用 Context/Zustand 存储每个卡片的当前 offset 和 imageData                                         | 完全绕过 React 渲染问题 | 引入新依赖，状态管理复杂         |
| B. Window 事件   | NavigableAssetImage 在 offset 变化时 dispatch CustomEvent                                         | 完全绕过 React 组件树   | 不够 React-idiomatic             |
| C. DOM data 属性 | NavigableAssetImage 在 offset 变化时设置 `data-current-offset` 和 `data-current-image` 到自身 DOM | 最简单，完全绕过 React  | data 属性长度限制（base64 太长） |
| D. 全局 Map      | 用 `window.__imageStateMap = new Map()` 存储                                                      | 最简单粗暴              | 不优雅但 100% 可靠               |

---

## 技术约束

1. 组件在 `React.memo` + 虚拟列表环境中运行
2. 后端 API 的 `vector_queries[0].query` 只接受纯 URL 字符串或 base64 字符串
3. 所有改动必须用 `LM CUSTOMIZATION` 标记包裹
4. 不能引入新的 npm 依赖
