# 需求文档:虚拟化分支卡片布局与非虚拟化分支视觉对齐

## 引言

`integration-lm-merge-acd` 工作树上,limit > 50 时(虚拟化分支)与 limit ≤ 50 时(非虚拟化分支)的卡片视觉表现存在明显差异,具体表现为:

1. 虚拟化分支卡片**内部空白区域被撑大**(标签栏与文件大小/按钮之间多出空白)
2. 视口底部出现**大段黑色未渲染区域**

### 🎯 真正根因(已侦察确认)

`HybridDeepSearchUI.jsx` 第 226 行存在分支选择:

```js
const ResultsComponent =
  useVirtualization && filteredResults.length > 50
    ? VirtualizedHybridSearchResults // → 走虚拟化分支
    : HybridSearchResults; // → 走非虚拟化分支
```

**两个分支是完全不同的两个文件,卡片渲染代码独立**:

| 维度              | 非虚拟化 (`web/src/HybridSearchResults.jsx`) | 虚拟化 (`web/src/components/VirtualizedHybridSearchResults.jsx`)                                 |
| ----------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 卡片高度策略      | **由内容自然撑开**(无外部固定 h)             | **react-window 强制 `itemHeight=360`**(第 1257 行)                                               |
| 卡片内 VStack     | `<VStack h="100%">` 自然填满                 | `<VStack h="100%">` 被强制撑到 360px                                                             |
| `flex={1}` 撑开点 | 内容不超时,`flex={1}` 仅作 fallback          | **内容 < 360px 时,`flex={1}` 把"文件大小/日期/底部按钮"区域往整体高度上拉开**,产生看似空白的留白 |
| 容器总高          | DOM 自然高度                                 | `Math.ceil(items / cols) × 360` 固定值                                                           |
| 视口溢出          | 自然滚动,无空带                              | 容器总高 > 实际内容高 → **底部黑带**                                                             |

### 视觉对照(2026-05-25 实测)

- limit=50:`cardHeight ≈ 363.45px`,内容紧凑贴合
- limit=100:`cardHeight = 360px`(strict),但内容自然只需 ~320px → **多余 40px 被 `flex={1}` 推开形成空白带**
- 视口底部:limit=100 显著多出 50-80px 黑带

### 历史 EVIDENCE 偏差解释

`.codebuddy/plan/click-and-layout-fixes/EVIDENCE-task5.md` 当时只测了"卡片矩形外尺寸"(363 vs 360 几乎一致),**没测内部内容布局**,所以没暴露问题。这次用户从体感上明确指出"limit 大于 50 时空白领域 + 大幅黑色",证明 EVIDENCE 测量维度不够。

---

## 需求

### 需求 1(P0):虚拟化分支卡片高度紧贴内容,与非虚拟化分支视觉一致

**用户故事:** 作为用户,我希望 limit > 50 时卡片内部不出现莫名空白带,以便不同 limit 下视觉体验一致

#### 验收标准

1. WHEN 用户在 limit > 50 模式下查看卡片 THEN 卡片**标签栏区域(`CardTagBar`)与"文件大小/日期"行之间** SHALL 紧贴,垂直空白 ≤ 8px(与非虚拟化分支一致)
2. WHEN 用户切换 limit 50 ↔ 100 THEN 同一张卡片**内部各区域(缩略图 / 标题 / 标签栏 / 大小日期 / 底部按钮)的相对位置 SHALL 视觉一致**,人眼对比偏差 < 5%
3. WHEN 用户在 gridSize='S' 紧凑模式下切换 limit THEN 紧凑卡片同样保持视觉一致
4. IF 容器宽度变化(侧边栏开关、Drawer 开关) THEN 虚拟化卡片仍 SHALL 保持紧贴布局,不出现新的空白带
5. WHEN 修复落地 THEN [`VirtualizedHybridSearchResults.jsx`](../../web/src/components/VirtualizedHybridSearchResults.jsx) 第 1257 行的 `itemHeight={... 360 ...}` SHALL 改为接近"非虚拟化分支实测自然高度"(约 320-340px),具体数值通过实测确定

### 需求 2(P0):消除视口底部"大幅黑色"未填充区

**用户故事:** 作为用户,我希望滚动到底部时不出现大段黑色无内容区,以便视觉清爽不困惑

#### 验收标准

1. WHEN 用户处于 limit > 50 模式且滚动到底部 THEN 视口底部黑色未渲染区高度 SHALL ≤ 一行卡片高度的 5%(与 limit ≤ 50 模式一致)
2. WHEN react-window 列表的 `Math.ceil(items / cols) × itemHeight` 总高度计算被修正 THEN 总高度 SHALL 紧贴实际内容,不再产生过度留白
3. IF "无限滚动加载"被触发 THEN 新加载的卡片 SHALL 紧贴上一批,不出现填充区

### 需求 3(P1):卡片内 `flex={1}` 撑开策略调整

**用户故事:** 作为前端开发者,我希望卡片内部不依赖 `flex={1}` 强制撑开,以便高度变化时布局自然回流

#### 验收标准

1. WHEN 卡片高度从 360px 改为更紧凑的值 THEN [`VirtualizedHybridSearchResults.jsx`](../../web/src/components/VirtualizedHybridSearchResults.jsx) 第 517、530、595 行的 `flex={1}` SHALL 被审视,移除不必要的撑开
2. WHEN 内容自然高度 < itemHeight THEN VStack 内部 SHALL 不再把空白推到中间或底部,改为内容紧贴顶部 + 底部按钮自然贴边
3. WHEN gridSize='S' 紧凑模式 THEN 卡片紧凑布局 SHALL 同样保持紧贴,不依赖 `flex={1}`

### 需求 4(P0 验证):Playwright 实测对照证据

**用户故事:** 作为质量负责人,我希望本次修复有可重放的实测数据证明非虚拟化与虚拟化分支布局对齐

#### 验收标准

1. WHEN 修复完成 THEN SHALL 在 [`.codebuddy/plan/virtualized-card-layout-align/EVIDENCE.md`](EVIDENCE.md)(新建)中记录:
   - **修复前**:limit=50 vs limit=100 卡片**内部 6 个关键节点**(缩略图 bottom、标题 top、标签栏 top、大小行 top、按钮行 top、卡片 bottom)的 Y 坐标差异
   - **修复后**:同样 6 个节点的 Y 坐标差异 SHALL ≤ 8px
2. WHEN 修复完成 THEN SHALL 提供修复前后视口底部黑带高度对比数据
3. WHEN 修复完成 THEN SHALL 提供修复前后两次截图,文件保存到 `d:/period/limit-50-after.png` 和 `d:/period/limit-100-after.png`

### 需求 5(P2 防御):itemHeight 改为响应 gridSize + 内容预测

**用户故事:** 作为前端开发者,我希望未来卡片内容增减时不需要再改硬编码,以便降低后续维护成本

#### 验收标准

1. IF 卡片内容结构未来变化(如增加/减少行) THEN `itemHeight` SHALL 通过常量集中管理,而非散落在多处
2. **本需求是防御性优化**,本轮可仅改硬编码值,不强制做配置抽取

---

## 关键技术约束(NVIDIA 合入安全)

- 所有改动**必须**用 `LM CUSTOMIZATION` 标记包裹
- 优先**最小侵入**:仅调整 `itemHeight` 数值常量,不重构 react-window 调度逻辑
- 不修改非虚拟化分支 [`HybridSearchResults.jsx`](../../web/src/HybridSearchResults.jsx)(以非虚拟化为基线)
- 不引入新 npm 依赖
- 不修改 NVIDIA `usd_search_client/api/`、`usd_search_client/models/`

## 成功标准

| 维度                                  | 验收指标            |
| ------------------------------------- | ------------------- |
| 卡片内 6 个节点 Y 坐标差异(50 vs 100) | ≤ 8px               |
| 视口底部黑带高度差(50 vs 100)         | ≤ 一行卡片高度的 5% |
| 紧凑 gridSize='S' 一致性              | 同样达标            |
| LM CUSTOMIZATION 标记完整性           | 100%                |
| 不引入新 npm 依赖                     | ✓                   |
| 非虚拟化分支文件未修改                | ✓                   |

## 边界情况与非目标

**边界情况已考虑**:

- 不同视口宽度(侧边栏展开/收起、Drawer 开关)下,虚拟化卡片高度仍保持紧贴
- gridSize='S' 紧凑模式 itemHeight=200 也需相应核对
- 列数由容器宽度计算 → itemHeight 调整不影响列数

**非目标**(本轮不做):

- 不重写 `react-window` / `VirtualizedResults.jsx` 调度逻辑
- 不合并虚拟化与非虚拟化两个分支组件(架构性重构,留作下一轮)
- 不修改 NVIDIA 自动生成代码
- 需求 5(itemHeight 配置抽取)本轮不强制实施

## 修复策略概览

### 必改(P0)

1. **实测**非虚拟化分支(limit ≤ 50)在当前视口下的卡片**自然内容总高**
   - Playwright 测量第一张卡片 `getBoundingClientRect()` 的实际 height
   - 同时测内部各节点 Y 坐标作为对照基线
2. **修改** [`VirtualizedHybridSearchResults.jsx`](../../web/src/components/VirtualizedHybridSearchResults.jsx) 第 1257 行
   - `itemHeight={viewMode === "grid" ? (gridSize === "S" ? 200 : 360) : 184}`
   - 改为 `itemHeight={viewMode === "grid" ? (gridSize === "S" ? <实测值> : <实测值>) : 184}`
   - 用 `LM CUSTOMIZATION: VirtualGridItemHeight` 标记包裹
3. **审视** 第 517、530、595 行 `flex={1}` 的必要性,如果 itemHeight 紧贴内容,可保留(因为不再有"空白要撑");如果仍出现空白,移除非必要 `flex={1}`

### 应改(P1)

4. 写 EVIDENCE.md 记录修复前后实测对照数据
5. Playwright MCP 跑前后对照截图

### 留作下一轮(P2)

6. itemHeight 常量集中管理(防御性优化)
