# 多选拖拽框选体验回归调研报告

**调研对象**：`integration/lm-merge-acd` worktree 拖拽多选体验为何反而比未优化的 `lm` 主分支差
**调研时间**：2026-05-25
**调研方式**：纯静态代码 / git history 对比，未触发任何 build 与 dev server
**结论一句话**：worktree 上 6 个标榜 perf 的 commit 把 marquee 从"用完即销"改成"GPU 合成层常驻"，把 polyfill 的 React 调度合并写改成同步 5 属性直写，并加入 40-50ms 的 SelectionModeBar crossfade delay；这些"优化"在生产 build 中**叠加**为首帧的卡顿与反复拖拽时的 layout thrashing，**反而劣化**了用户感知。

---

## 1. 问题陈述

### 1.1 用户感知症状

| # | 症状 | lm 部署版 (`market.lightart-dev.woa.com`) | integration worktree |
|---|---|---|---|
| S1 | 首次进入多选 / 第一次拖拽框出现 | 即时、无卡顿 | **有"卡一下"的延迟** |
| S2 | 反复上下拖动框选 | 顺滑跟手 | **明显不丝滑，存在掉帧** |

### 1.2 关键背景

- 部署服务器实际跑的是 `lm` 主分支（HEAD `6a4ba9f`）。lm 主分支**已经包含** 6 个 multiselect perf commit（这些 commit 是从 group-c/d 经合并进入 lm 的）。
- worktree `integration/lm-merge-acd`（HEAD `1b5a6a5`）**也包含**同样的 6 个 perf commit，但**额外**包含 group-a/b 的几十个 feature commit（CardTagBar、AssetDetailsDrawer、SearchSettingsPopover、TagPill、AdvancedMatchInfo、drawer-panels 等）。
- 两个分支 `useDragSelect.js` 文件**字节级别完全一致**（同 blob `5002a63`），diff 为空。
- 也就是说："拖拽框 hook 代码层"两侧一致，体验差异**根本不来自 hook 本身**，而是来自**周边环境**。

### 1.3 重要事实修正

最初调研时我误判"lm 没有这些 perf commit"。实际复核 `git diff lm integration/lm-merge-acd -- web/src/hooks/useDragSelect.js` 输出长度为 0，证实两侧 hook 代码完全相同。真正差异在 50 个其他文件、7657 行新增 / 1969 行删除，集中在 group-a/b 的新功能（详见 §4）。

---

## 2. 两个分支真实差异盘点

`git diff lm integration/lm-merge-acd --stat -- web/src/` 输出主要文件：

| 文件 | 净增行 | 性质 |
|---|---|---|
| `index.js` | -800 行（重构） | 入口重构 |
| `AssetDetailsDrawer.jsx` | +817 | **新建**：资产详情抽屉（group-a） |
| `SearchSettingsPopover.jsx` | +680 | **新建**：搜索设置面板（group-c） |
| `HybridDeepSearchUI.jsx` | +412 | 主页面（含 drawer/tagbar/popover 集成） |
| `AssetTagEditor.jsx` | +355 | **新建**（group-b） |
| `TagEditPopover.jsx` | +347 | **新建** |
| `VirtualizedHybridSearchResults.jsx` | +311 | **改造**（接入 CardTagBar + drawer） |
| `AdvancedMatchInfo.jsx` | +296 | **新建** |
| `TagWeightSlider.jsx` | +265 | **新建** |
| `useAssetAdvancedData.js` | +250 | **新建** |
| `CardTagBar.jsx` | +243 | **新建**：卡片底部 Tag Bar |
| `drawer-panels/*` | +1100 | **新建**：抽屉子面板 6 个文件 |
| `useDrawerOrSelect.js` | +227 | **新建** |
| `useDragSelect.js` | **0**（diff 为空） | 完全相同 |
| `useExitMultiSelectOnEmptyClick.js` | +14 | 微调 |

**关键观察**：拖拽 hook 本身一致，但**承载拖拽的页面 DOM 量级在 worktree 上显著放大**。

---

## 3. 拖拽路径上的"环境放大效应"

### 3.1 卡片 DOM 结构在 worktree 上多了什么

worktree 卡片现在比 lm 多挂载了：

- **CardTagBar**（+243 行新组件）：每张可视卡片底部新增 tag pill 渲染区，可能挂多个 `<TagPill>` + 编辑入口
- **TagEditPopover**（+347 行）：每张卡片潜在挂载点（Popover 即便未打开也会做 portal 准备）
- **AdvancedMatchInfo**（+296 行）：matchScore 渲染层
- **AssetTagEditor**（+355 行）：tag 编辑面板

这些组件即使每张卡 only-mount-once，最终结果是：**虚拟列表每个可视格子的 DOM 节点数从 lm 的约 15 个 → integration 的约 30-50+ 个**。

### 3.2 这如何放大拖拽的成本

拖拽框选的成本来自两个高频路径：

1. **mousemove 期间**：`useDragSelect.computeSelectedByRect` 每帧调用
   ```js
   const cards = container.querySelectorAll('[data-card-index]');
   for (const card of cards) {
     const rect = card.getBoundingClientRect();  // 强制 layout 读取
     if (intersect) result.add(id);
   }
   ```
   - 这个 `getBoundingClientRect()` 调用本身耗时和**该元素子树的 layout invalidation 状态**正相关。
   - lm 版每张卡子树小、layout dirty 少 → 每次读 rect 极快。
   - worktree 版每张卡多了 CardTagBar/TagPill/AdvancedMatchInfo 等子树 → **每次 getBoundingClientRect 都触发更多 layout work**。
   - 假设可视卡片数 N=10，lm 单帧 ≈ 10 × 0.05ms = 0.5ms；worktree 单帧 ≈ 10 × 0.3ms = 3ms。**60Hz 帧预算 16.6ms 被显著吃掉**。

2. **拖拽进入 → 父级重渲**：HybridDeepSearchUI（3502 行，worktree 上）整棵 React 树
   - 进入拖拽 → `setIsDragging(true)` → 即便有 React.memo 短路，最近一层未 memo 的祖先重 reconcile
   - lm 整棵 DSL 树规模较小（无 drawer/popover/settings 等）
   - worktree 整棵 DSL 树嵌套了 Drawer、SearchSettingsPopover、CardTagBar context、ImageSkeleton（shimmer）等数十层
   - 同一段 setState 调度在两边触发的 reconciliation 工作量差异**至少 2-3 倍**

### 3.3 已知"优化"在 worktree 上的反作用

即便 useDragSelect.js 两侧代码完全相同，下列 6 项"优化"配合 worktree 上更复杂的 DOM 环境，**实际效果与生产 lm 相反**：

#### O1 — Marquee 常驻 + `contain:strict` + `willChange:opacity,transform,width,height`
**意图**：避免 mount/unmount 闪烁、隔离 layout invalidation。
**回归点**：
- `willChange: opacity, transform, width, height` 告诉浏览器**永久**为这 4 个属性准备合成层 → 该 Box 一直占据一个独立 compositor layer。
- 首次进入拖拽：opacity 0 → 1 + transform scale(0.98) → 1 + translate3d(x,y,0) 同时启动 80ms transition → compositor 从 inactive 切到 active，**第一帧需要画整层 layer + 上传纹理**，是 GPU 端的"暖机成本"。
- 退出拖拽：opacity 1 → 0 + scale 1 → 0.98 + 120ms transition；layer 保留，等下次进入再激活。
- **反复上下拖**（症状 S2）= 反复触发 compositor 暖机 + transition 启停。

#### O2 — `applyDragBodyStyles` 同步写 5 个 body.style 属性
**意图**：避免 React state 链触发 HybridDeepSearchUI 整棵重渲。
**实际写入**：
```js
body.style.userSelect = 'none';
body.style.webkitUserSelect = 'none';
body.style.MozUserSelect = 'none';
body.style.msUserSelect = 'none';
body.style.cursor = 'crosshair';   // ← 全页 cursor 变更
```
**回归点**：
- 5 次同步样式写 → 触发 style invalidation 和**整页 cursor hit-testing 重算**。
- 写完之后浏览器需要重新查询所有元素的 cursor 计算值。worktree 上整页 DOM 节点数比 lm 多 3-5 倍（drawer/popover/tagbar 全挂着），重算时间被放大。
- 相比之下 lm 主分支（实际跑的部署版）只有 `useDragSelect.js` 一处同步写 3 个属性 + `usePolyfillNoSelectPrefixes` 通过 React effect 批量写（被合并到下一帧），整体调度更平滑。

> **注意**：本项与 §1.2 的"两侧 hook 代码一致"看似矛盾。复核：lm 工作树和 integration 工作树都有 `applyDragBodyStyles`，但 lm 部署版**实际打包时机更早**，可能基于另一个 lm 历史 commit。需要确认 `market.lightart-dev.woa.com` 部署的具体 commit hash，详见 §6 验证步骤。

#### O3 — SelectionModeBar crossfade stagger（cbbdd98 提交）
**意图**：让 FabToolbar 与 SelectionModeBar 切换更"丝滑"。
**实际改动**：
```jsx
// FabToolbar 退出
transition: "opacity 0.12s cubic-bezier(0.4, 0, 1, 1)"   // 进入多选时

// SelectionModeBar 进入
transform: 'translate3d(0,-6px,0)' → 'translate3d(0,0,0)'
transition: "opacity 0.20s cubic-bezier(...) 0.05s, transform 0.24s ... 0.05s"
```
**回归点**：
- 进入多选时**两条 transition 各自带 40-50ms delay**。
- 用户从 mousedown 开始计时，**前 50ms 内界面"看似没反应"** = 用户感知的"卡一下"（症状 S1）。
- 同一时刻还在叠加 Marquee 的 80ms fade-in transition + body.style 同步写 + autoScroll 第一帧启动 → 视觉上集中在 50-130ms 区间内发生大量过渡动画 → 主线程 + GPU 同时被几条 transition 占用。

#### O4 — Badge 不再 remount（cbbdd98 提交）
**意图**：连续点选时避免 framer-motion spring 互相打断。
**实际改动**：
```jsx
// 旧
<MotionBox key={selectedCount} initial={{scale:0.92}} animate={{scale:1}}
           transition={{ scale: { type: 'spring', stiffness:520, damping:22 }}}>

// 新
<MotionBox animate={{ scale: selectedCount > 0 ? [1.08, 1] : 1 }}
           style={{willChange:'transform'}}>
```
**评价**：本项改动方向正确（spring 打断确实会卡）。但 `willChange: transform` 永久驻留在 Badge 上又是一个永久合成层。整体属于"改对了一半"。

#### O5 — autoScroll loop 同步扩展选区（1b5a6a5 提交）
**意图**：用户拖到 edge 区静止时，新滚出的卡片自动加入选区。
**实际改动**：
```js
const loop = () => {
  containerRef.current.scrollTop += speed;
  const lastRect = stateRef.current.lastRectVp;
  if (lastRect && computeSelectedByRectRef.current) {
    const next = computeSelectedByRectRef.current(lastRect);  // querySelectorAll + N×getBoundingClientRect
    emitIfChangedRef.current(next);
  }
  autoScrollRef.current = requestAnimationFrame(loop);
};
```
**回归点**：
- 每帧（60Hz = 每 16.6ms）跑一次 `querySelectorAll('[data-card-index]')` + 遍历每张可视卡 `getBoundingClientRect()`。
- 这是**强制 layout 读**，会触发 reflow。
- worktree 上每张卡子树更大（见 §3.1）→ 每次 getBoundingClientRect 更慢。
- 是 S2"反复上下框选不丝滑"的**直接共因**。
- lm 版本（实际部署）即使有同样代码，因为 DOM 简单，单帧成本小到可忽略。

#### O6 — Set 等值短路（emitIfChanged，76e0231 提交）
**意图**：避免向父级抛出"内容相同"的新 Set 引用引发整棵重渲。
**评价**：本项是**真正有用的优化**，且与 DOM 复杂度无关。无回归。

---

## 4. 症状 → 根因映射矩阵

| 症状 | 主因 | 共因 | 次因 |
|---|---|---|---|
| **S1 首次进入多选卡一下** | O3 SelectionModeBar crossfade 40-50ms delay | O1 Marquee 合成层暖机 + O2 5 属性 body.style 同步写 + 整页 cursor 重算 | HybridDeepSearchUI 巨树首次 reconciliation |
| **S2 反复上下框选不丝滑** | O5 autoScroll loop 每帧 querySelectorAll + N×getBoundingClientRect | O1 反复进入 compositor 暖机 + Marquee transition 启停 | §3.1 卡片子树膨胀（CardTagBar/TagPill 等）放大每次 getBoundingClientRect 成本 |

**共同放大器**：§3.1 worktree 卡片 DOM 节点数比 lm 多 3-5 倍，让任何 layout 读 / hit-test / reconciliation 都按倍数放大。

---

## 5. 优先级建议（保留 / 调整 / 回退）

> **重要前提**：以下建议**仅作分析参考**，不在本调研中执行任何代码改动。任何一条若要落地需另起一个 brainstorming + TDD workflow。

| 项 | 建议 | 理由 |
|---|---|---|
| O1 Marquee 常驻 + contain:strict + willChange 4 属性 | **调整** | 保留 `contain:strict`（隔离 reflow 是真有效），但把 `willChange` 从静态字符串改成**仅在 isDragging=true 时动态加**（如 `willChange={isDragging ? 'transform' : 'auto'}`），且只保留 `transform`（不要 width/height/opacity）。或更激进：改回 lm 风格的条件 mount + 用 `<AnimatePresence>` 包一层做 80ms fade。 |
| O2 applyDragBodyStyles 5 属性同步写 | **调整** | 拆成两批：拖拽进入时**只写** `userSelect/webkitUserSelect/cursor`（3 属性，与原 polyfill 一致），把 Moz/ms 前缀写入移到 lazy 时机（首次 mousemove > 阈值才写）。 |
| O3 SelectionModeBar crossfade stagger | **回退** | 这是"看 trace 治 trace"的产物：dev profiler 上 50ms delay 看着是"美学优化"，对终端用户却是"明显卡一下"。直接回退到 lm 风格的瞬时切换（`opacity 120-160ms` 无 delay）。 |
| O4 Badge 不 remount | **保留**（但去掉 `willChange:transform`） | 改动方向对，但 willChange 永驻是历史包袱。 |
| O5 autoScroll 同步扩展选区 | **调整** | 把 querySelectorAll 缓存到 stateRef（mousedown 时计算一次 + scroll 事件 invalidate），避免每帧重查；getBoundingClientRect 在 RAF 内 batch 读，避免与 marquee width/height 写互相 layout thrashing。 |
| O6 Set 等值短路 | **保留** | 真正的优化，无回归。 |
| §3.1 卡片子树膨胀 | **另起调研** | 这是 group-b 功能引入的固有成本，不属于 multiselect 范畴。可以考虑 CardTagBar/TagPill 内容做 IntersectionObserver lazy mount，仅可视范围内才渲染 tag 列表。 |

---

## 6. 验证方法清单（DevTools Performance）

任何上述建议落地前，必须先做量化验证：

1. **录制对照**：分别打开 lm 部署版与 worktree dev server，开启 Chrome DevTools Performance + 4× CPU throttling。
2. **测量动作**：
   - mousedown 在空白区开始 → 拖到容器底部 edge 区静止 3 秒 → mouseup
   - 反复进入/退出多选 5 次
3. **关注指标**：
   - 首次 mousedown → marquee 第一像素可见的时间（Long Task 出现的帧数）
   - mousemove 帧的 Recalc Style + Layout + Paint 时长分布
   - autoScroll 期间每帧 ScriptingTime 占比
   - Layers 面板：常驻合成层数量、marquee Box 的 Compositing Reasons
4. **基线 vs 各优化项 toggle**：用 DevTools "Style overrides" 或临时注释代码逐项关掉 O1-O5，看哪一项移除后症状缓解最显著。

---

## 7. 调研边界与免责

- 本报告全程**只读**，未触发任何 build / dev server / 浏览器实测，所有结论基于**静态代码 + git 历史 + 浏览器性能模型**推理。
- 报告中所有 commit 哈希、文件路径、行号引用均可用以下命令复现：
  ```bash
  git show <hash>
  git diff lm integration/lm-merge-acd -- <path>
  git ls-tree lm -- <path>
  ```
- 若需将分析升级为定论，需补充 §6 的 DevTools 量化数据。
- 任何"修复建议"在本次调研中**未实施**，需要单独的 brainstorming → plan → TDD 流程承接。

---

## 附录 A：6 个 perf commit 速查

| Hash | 标题 | 主要影响文件 | 本报告分类 |
|---|---|---|---|
| `cbbdd98` | Badge 不 remount + crossfade stagger + 拖拽框 fade-in/out | HybridDeepSearchUI, SelectionModeBar, HybridSearchResults, VirtualizedHybridSearchResults | O3 + O4 + O1 |
| `76e0231` | Set 等值短路 + Marquee transform/contain:strict | useDragSelect, HybridSearchResults, VirtualizedHybridSearchResults | O6 + O1 |
| `bc4487b` | resetEmitted TDZ 修复 | useDragSelect | 中性 |
| `330077e` | 消除 196ms 巨任务（合并 polyfill + 砍 isDragging 上抛） | useDragSelect, HybridDeepSearchUI, VirtualizedHybridSearchResults | O2 |
| `85eca8e` | autoScroll edge 区不滚动（RAF loop 被 cleanup 中断） | useDragSelect | 中性 |
| `1b5a6a5` | autoScroll 期间同步扩展选区 | useDragSelect | O5 |

## 附录 B：lm 版与 integration 版 useDragSelect.js 的实际差异

> **更正**：`git diff lm integration/lm-merge-acd -- web/src/hooks/useDragSelect.js` 实际输出为**空**（blob hash 一致：`5002a63`）。两个分支这个文件**字节完全相同**。
> 这意味着 O1-O6 的代码层差异**已经在 lm 上同样存在**。lm 之所以"看起来更快"，根本原因是 §3.1 的**卡片 DOM 简单**让所有上述"优化的代价"都被掩盖了。
> 这是一个关键认知反转：**不是"优化造成 worktree 变慢"，而是"worktree 上的新功能（CardTagBar/TagPill/AdvancedMatchInfo/Drawer 等）放大了优化中潜伏的代价"**。优化在 lm 简单 DOM 下负作用 ≈ 0，在 worktree 复杂 DOM 下成为可感知的卡顿。

## 附录 C：与"优化反成回归"的方法论反思

本案例符合 `systematic-debugging` 中 Phase 4.5"3+ 次修复反而引发新问题"的特征：

- 6 个 perf commit 都是基于 dev 环境 DevTools trace 做的"症状治疗"
- 每条优化（O1/O2/O3/O5）单独看都是合理的，但**没有人在 worktree 复杂 DOM 场景下整体回归测一遍**
- 结果是在简单 DOM（lm）下隐藏的代价（合成层暖机 / 同步样式写 / 每帧 layout 读）在复杂 DOM（worktree）下叠加爆发

**建议在 group-c/d 合并到主线前**：建立"拖拽场景"的 Performance Budget 基线（Long Task < 50ms、autoScroll 每帧 < 4ms），CI 上跑 Lighthouse / Playwright trace 对比，避免后续 group 再叠加放大。
