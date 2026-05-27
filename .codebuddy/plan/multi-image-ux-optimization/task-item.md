# 实施计划：USD 多图预览体验极致优化

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 USD 多图资产实现 hover 分区切换 + 圆点指示器、详情面板多图支持、查找相似资产智能选图与黑图防护。

**Architecture:**

- 新增 `utils/blackImageDetector.js` 工具模块（canvas 采样检测黑图）
- 改造 `NavigableAssetImage.jsx`：从箭头切换升级为 hover 分区 + 圆点指示器
- 改造 `AssetDetailsDrawer.jsx`：将 `AssetImage` 替换为 `NavigableAssetImage`（复用多图能力）
- 改造 `VirtualizedHybridSearchResults.jsx` + `HybridDeepSearchUI.jsx`：传递当前 offset 到 handleFindSimilar，支持带 offset 的相似搜索

**Tech Stack:** React 18, Chakra UI v2, Canvas API, 现有 imageLoader 缓存体系

---

## 涉及文件清单

| 操作 | 文件路径                                                |
| ---- | ------------------------------------------------------- |
| 新增 | `web/src/utils/blackImageDetector.js`                   |
| 修改 | `web/src/components/NavigableAssetImage.jsx`            |
| 修改 | `web/src/components/AssetDetailsDrawer.jsx`             |
| 修改 | `web/src/components/VirtualizedHybridSearchResults.jsx` |
| 修改 | `web/src/HybridDeepSearchUI.jsx`                        |
| 修改 | `web/src/i18n/en.js`                                    |
| 修改 | `web/src/i18n/zh.js`                                    |

---

## 任务清单

- [ ] 1. 创建黑图检测工具模块 `blackImageDetector.js`
  - 新增 `web/src/utils/blackImageDetector.js`
  - 实现 `isBlackImage(imageDataUrl)` 函数：将 data URL 绘制到离屏 canvas，采样像素计算平均亮度，阈值 < 10 判定为黑图
  - 实现 `findFirstValidImageIndex(imageDataUrls[])` 函数：遍历图片数组，返回第一张非黑图的索引
  - 导出为 ES Module，异步函数（返回 Promise）
  - _需求：3.2、3.3（黑图检测策略）_

- [ ] 2. 改造 `NavigableAssetImage` — hover 分区切换 + 圆点指示器
  - 修改 `web/src/components/NavigableAssetImage.jsx`
  - 移除左右箭头导航 UI（保留 `handlePrevious` / `handleNext` 逻辑供键盘可达性使用）
  - 新增 hover 分区逻辑：将图片区域按 `maxOffset + 1` 等分为 N 个水平区域，`onMouseMove` 计算鼠标所在区域索引并切换 `currentOffset`
  - 新增底部圆点指示器：N 个小圆点，当前 offset 对应的圆点高亮（金色 `brandColors.primary`），其余为半透明白色
  - 仅在 `maxOffset > 0`（多图）且 hover 时显示圆点指示器
  - 保持 progressive loading 触发逻辑：首次 hover 到非 offset-0 区域时触发 `startProgressiveLoading`
  - 新增 `onOffsetChange` 回调 prop，每次 offset 变化时通知父组件（供需求 3 使用）
  - 新增 `exposeCurrentOffset` ref prop（可选），让父组件能读取当前 offset
  - _需求：1.1、1.2、1.3、1.4、1.5_

- [ ] 3. 改造 `AssetDetailsDrawer` — 预览区多图支持
  - 修改 `web/src/components/AssetDetailsDrawer.jsx`
  - 将预览区的 `<AssetImage>` 替换为 `<NavigableAssetImage>`，传入 `displayAsset`、`getHeaders`、`apiUrl`
  - 设置预览区的 `NavigableAssetImage` 尺寸为 `width="100%" height="100%"`，保持 16:9 aspectRatio
  - 集成黑图检测：当 `NavigableAssetImage` 完成 progressive loading 后，对所有缓存图片执行 `isBlackImage` 检测，自动跳转到第一张有效图
  - 当用户切换到不同资产时（`displayAsset` 变化），重置到第一张有效图
  - 用 `LM CUSTOMIZATION: MultiImageDrawer` 标记包裹所有改动
  - _需求：2.1、2.2、2.4、2.5_

- [ ] 4. 改造 `VirtualizedResultGridItem` — 传递当前 offset 到 handleFindSimilar
  - 修改 `web/src/components/VirtualizedHybridSearchResults.jsx`
  - 在 `VirtualizedResultGridItem` 中为 `NavigableAssetImage` 添加 `onOffsetChange` 回调，用 `useRef` 记录当前 offset
  - 修改 `handleFindSimilar` 回调：从 `onFindSimilar?.(baseKey)` 改为 `onFindSimilar?.(baseKey, currentOffsetRef.current)`
  - 用 `LM CUSTOMIZATION: SimilarSearchOffset` 标记包裹改动
  - _需求：3.1、3.5_

- [ ] 5. 改造 `handleFindSimilar` — 支持带 offset 的相似搜索
  - 修改 `web/src/HybridDeepSearchUI.jsx`
  - 修改 `handleFindSimilar(assetUrl, imgOffset)` 签名，接收第二个参数 `imgOffset`
  - 在 `vector_queries` 中：如果 `imgOffset > 0`，将 `query` 改为 `assetUrl` + 附加 `img_offset` 参数（格式待确认，优先尝试 `?img_offset=N` 后缀；如果后端不支持，则改为先 fetch 该 offset 的图片 base64 再传入）
  - 在 `setSimilarSearchAsset` 中记录使用的 offset，用于结果顶部展示
  - 用 `LM CUSTOMIZATION: SimilarSearchOffset` 标记包裹改动
  - _需求：3.1、3.5_

- [ ] 6. 实现黑图防护逻辑 — 相似搜索前的智能选图
  - 修改 `web/src/HybridDeepSearchUI.jsx`
  - 在 `handleFindSimilar` 开头：获取当前 offset 对应的缓存图片 data URL，调用 `isBlackImage` 检测
  - 如果当前图为黑图：从 imageLoader 缓存中获取所有已加载的 offset 图片，调用 `findFirstValidImageIndex` 找到第一张有效图，使用该 offset 进行搜索，并 toast 提示"已自动选择最佳预览图进行搜索"
  - 如果所有图均为黑图：toast 警告"该资产无有效预览图，无法进行相似搜索"，中止搜索
  - 用 `LM CUSTOMIZATION: BlackImageGuard` 标记包裹改动
  - _需求：3.2、3.3、3.4_

- [ ] 7. 优化相似搜索错误处理
  - 修改 `web/src/HybridDeepSearchUI.jsx`
  - 在 `handleFindSimilar` 的 `.catch` 分支中：如果 HTTP 500 且是图片相关错误，展示友好提示"该预览图无法用于相似搜索，请尝试切换到其他预览图后重试"
  - 在 422 分支中也加入图片相关的友好提示
  - 用 `LM CUSTOMIZATION: SimilarSearchErrorUX` 标记包裹改动
  - _需求：3.4_

- [ ] 8. 添加国际化文案
  - 修改 `web/src/i18n/en.js` 和 `web/src/i18n/zh.js`
  - 新增文案 key：
    - `autoSelectedBestPreview`: "已自动选择最佳预览图进行搜索" / "Automatically selected the best preview for search"
    - `noValidPreviewForSimilar`: "该资产无有效预览图，无法进行相似搜索" / "No valid preview available for similarity search"
    - `similarSearchImageError`: "该预览图无法用于相似搜索，请尝试切换到其他预览图后重试" / "This preview cannot be used for similarity search. Try switching to another preview."
    - `previewCount`: "{current}/{total}" （圆点指示器 aria-label 用）
  - _需求：国际化约束_

- [ ] 9. 使用 Playwright MCP 进行端到端验证
  - 打开应用页面，搜索 USD 资产（如 house.usd）
  - TC-1：验证卡片 hover 时出现圆点指示器，鼠标水平移动切换图片
  - TC-2：验证右侧详情面板展示多图，默认跳过黑图
  - TC-3：验证"查找相似资产"使用当前展示的图片（非 offset=0 黑图）
  - TC-4：验证所有图为黑图时按钮禁用 + tooltip 提示
  - TC-5：验证单图资产无多图 UI 干扰
  - _需求：全部验收标准_
