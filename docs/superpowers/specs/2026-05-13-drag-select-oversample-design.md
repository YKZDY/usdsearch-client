# Design: 框选启动点扩展 + 搜索过采样

Date: 2026-05-13

## 需求2：框选启动点提升到页面级

将 `useDragSelect` 的 mousedown 从容器级 prop 提升为 document 级 addEventListener，让用户可以从左侧 CategorySidebar 空白、上方工具栏空白等任何非交互区域开始框选。

### 关键规则
- 起点在结果区卡片内 → paint 模式（不变）
- 起点在任何空白区（含容器外的 sidebar/toolbar 空白）→ rect 模式
- 交互控件（button/input/link/treeitem/switch 等）不拦截
- Modal 打开时完全不启动
- 搜索栏（支持图片拖放）标记 data-drag-select-skip
- 选中判定仍只对 `[data-card-index]` 卡片做交叉检测

### 排除列表
button, input, textarea, select, a[href], [role="treeitem"], [role="button"], [role="switch"], [role="slider"], [role="menuitem"], [role="option"], [data-drag-select-skip], [contenteditable], label, .chakra-modal__overlay, .chakra-modal__content, .chakra-popover__content

## 需求3：过采样 + UI 提示

### 流程
1. 用户设定 limit → 计算过采样系数 → 实际请求 apiLimit
2. API 返回 → 客户端过滤链 → 截取前 userLimit 条
3. 不足时显示 tooltip 提示

### 过采样系数
- showOnlyWithPreviews 开启: ×1.5
- file_extension_exclude 非空: ×(1 + extCount×0.05, 上限 0.4)
- 总上限: 3.0
- apiLimit 上限: 10000

### UI 提示
位置: "共 X 个资产" 旁 info icon tooltip
文案: "已请求 N 条，当前过滤条件下仅找到 M 条。可尝试关闭"仅含预览"或调整格式过滤。"

## 需求1（Shift 多选）暂不实现，等后端确认。

---

## [calvingu 2026-05-13 18:30] 第二轮修复（替代前次方案）

### 前次方案（opus4.6）失败原因

1. **框选启动点**：opus4.6 加了"容器外 outerPending + 20px 阈值"框架，方向正确，但 `isInteractiveElement` 仍把以下情况一刀切 return，导致 outerPending 分支根本进不去：
   - 顶部 bar 整块 `data-drag-select-skip="true"`（line 41 的 closest 命中）
   - 左侧 sidebar 的 `[role="treeitem"]`（line 43 命中）
   - logo 的 `<a>` / `<img>`（line 39 的 tag 命中）
   且容器外起点完全不阻止浏览器原生 `dragstart`（line 241 注释明确"不 preventDefault"），导致 logo/img 被浏览器叼走原生拖拽。

2. **limit=49 vs 50**：opus4.6 在 `clientOnlyFields` 加 `'limit'` 排除项，逻辑正确但**脆弱**——依赖 spread 顺序、字段名一致性、webpack 是否成功 hot-reload；任一环节出问题就失效。用户报告确实没生效，可能源于 webpack 缓存或别的边角情形。同源 bug 在 `Similar search` 路径（HybridDeepSearchUI.jsx ~1779-1816）**完全没修**。

### 本次最终方案

**A. `useDragSelect.js` — 拆分硬交互/软交互/原生 drag 源**

- `isHardInteractive`：真正会 focus/submit/跳转的元素（INPUT/BUTTON/`<a href>`/contenteditable/role=button|switch|...）任何起点都 return。
- `isContainerInnerSkip`：仅容器内起点参考 `data-drag-select-skip`，容器外不再受其影响。
- `isNativeDragSource`：IMG/A/[draggable="true"] 类元素，容器外起点遇到时立刻 `e.preventDefault()` 阻止浏览器原生 dragstart。
- 新增 `dragstart` capture 监听：当 hook 处于 `outerPending` 或 `isActive` 时统一 `preventDefault()` 兜底。
- 容器外起点行为：mousedown 仅记录坐标进入 `outerPending`；mousemove 位移≥20px 才激活 rect 模式；位移<20px 时不干预，让 `useExitMultiSelectOnEmptyClick` 正常处理"单击退出多选"。

**B. `HybridDeepSearchUI.jsx` — 位置无关的 limit 鲁棒覆盖**

不再依赖 `clientOnlyFields` 排除列表。改在 `requestBody` 构造完成、所有 spread/`forEach delete` 之后，在 `fetch()` 前最后一行：

```js
requestBody.limit = getApiLimit(
  parseInt(currentSearchParams.limit),
  { showOnlyWithPreviews, fileExtensionExclude: currentSearchParams.file_extension_exclude || '' }
);
```

主搜索（约 2218 行前）和 Similar search（约 1818 行前）两处都加。同时把两个 `useCallback` 的依赖列表加上 `showOnlyWithPreviews`，避免 stale closure。

诊断日志增强：`[Oversample Debug]` 同时打印 `userLimit / 过采样系数 / apiLimitFinal / hits.length / data.total`，让用户一眼看出哪一层缺数据。

### 不需要做的事

- 顶部 bar 的 `data-drag-select-skip="true"` 保留不动（它仅影响容器内起点判断，容器外起点不再参考）。
- 不重构 `useExitMultiSelectOnEmptyClick`（与 useDragSelect 通过位移阈值 8px vs 20px 天然互斥）。
- 不动 `oversample.js`（计算逻辑正确）、不动 `visibleResults` 截断（已正确）。

---

## [calvingu 2026-05-14 09:30] 第三轮诊断（实质修复 + Trace 日志）

### 第二轮实施后剩余的两个现象

1. **残留矩形**（截图：sidebar 空白处出现持续跟随鼠标的黄色框选矩形，需"再单击"才退出）
2. **结果数 50→49**（`limit=100` 请求 → `hits.length=49`，但 `data.total=600`）+ 用户筛选 `.png/.jpg` → 0 结果

### 第二轮根因结论的自我反驳（基于代码再读 + docs 查询）

| 之前的假设 | 第三轮验证 |
|------------|-----------|
| 残留矩形是浏览器 native drag 阻断 mouseup | ❌ sidebar 元素只有 SVG icon（chakra ChevronDownIcon 等），SVG 默认 `draggable=false`，不会触发 native dragstart |
| 残留矩形是 mousemove 不校验 e.buttons | ❌ 代码状态机里 `outerPending` 只在 mousedown 设 true，mouseup 必清；不存在"无按键移动激活"的合法路径 |
| 50→49 是后端 uasset+fbx 总匹配数恰好 49 | ❌ `data.total=600` 表明后端能匹配 600 条，但只返回 49 条 |
| 50→49 是用户开了去重 (deduplicate_by_hash) | ❌ 用户确认开关在「关」状态 |
| 浏览模式硬编码 `'uasset,fbx'` 让 png/jpg 筛选失效 | ✅ 100% 确认（HybridDeepSearchUI.jsx 第 2133 行旧代码） |
| `file_extension_include/exclude` 不发后端 | ✅ 100% 确认（HybridDeepSearchUI.jsx 第 2195 行旧代码列入 clientOnlyFields） |

**结论**：
- **残留矩形**真因尚未定位 → 加临时 trace 日志，等用户复现
- **50→49** 真因可能是后端 OpenSearch collapse 默认开启或别的机制（与 `deduplicate_by_hash` 无关）→ 加诊断日志把 `data.search_metadata` + `hits[].hash_value` 抽样打出来

### 调研记录（USD Search V2 API）

读 `docs/DeepSearchSearchRequestV2.md`（V2 请求模型完整字段表）：
- **完全没有** `offset / skip / cursor / page_token / search_after / next_token` 等分页字段
- **有** `deduplicate_by_hash: bool`（"using OpenSearch collapse"）
- **有** `limit: int` 和 `return_*` 一系列布尔开关

读 `docs/SearchResponse.md`（响应模型）：
- `total: int`、`hits: List[...]`、`search_metadata: object`（**未文档化的诊断信息，可能含 collapse / filter 命中数**）

→ **结论**：前端无法做"自动续接"（V2 API 架构上不支持分页）。只能加诊断日志，把 `search_metadata` 暴露出来再决策。

### 本轮代码改动

**修复 1（已确认根因）**：`web/src/HybridDeepSearchUI.jsx`
- `clientOnlyFields` 移除 `file_extension_include` 和 `file_extension_exclude` → 用户的 ext 筛选真正发后端
- 浏览模式默认 `'uasset,fbx'` 改为：`currentSearchParams.file_extension_include` 已设时不再硬塞默认值（让 spread 自然带上用户值）

**诊断 1（残留矩形 trace）**：`web/src/hooks/useDragSelect.js`
- 新增 `describeEl(el)` helper 把元素描述成短字符串
- `[DragSelect Trace] DOWN outer` — 容器外 mousedown 时打印（含 target / buttons / nativeDragSource）
- `[DragSelect Trace] ACTIVATE rect (outer→active)` — outerPending 越阈值激活时打印（含位移距离 / buttons）
- `[DragSelect Trace] UP` — 任何 mouseup 都打印当前 stateRef 状态（outerPending / isActive / mode / target / buttons）
- `[DragSelect Trace] DRAGSTART` — 任何 dragstart 打印（含是否被 preventDefault）
- `[DragSelect Trace] DRAGEND` — 任何 dragend 打印（验证"mouseup 丢失"假设）

**诊断 2（50→49 trace）**：`web/src/HybridDeepSearchUI.jsx`
- `[Oversample Debug]` 新增打印：`dedup 开关状态` / `requestBody.file_extension_include` / `requestBody.file_extension_exclude` / `data.search_metadata` / `hits[0..2]` 抽样（path/ext/hash_value）
- 检测异常并 `console.warn` 红字告警：当 `hits.length < limit*0.7 && total > hits.length*2` 时

### Round 3 验证清单

**[修复 1 验证]**
- [ ] 筛选 `.png/.jpg` 应有结果（不再 0 条）
- [ ] 浏览模式默认仍展示 uasset/fbx 主资产（用户清空 include 时）

**[残留矩形 trace 验证]**
- [ ] 复现"鼠标跟随矩形"现象后，复制全部 `[DragSelect Trace]` 日志贴回。重点看：
  - 是否有 mousedown 但**没有**对应的 mouseup？
  - 是否有 dragstart / dragend 出现？
  - 最后一条 UP 日志时 `target` 落在哪个元素？
  - 中间是否被 ACTIVATE 但没被 UP？

**[50→49 trace 验证]**
- [ ] limit=50 时再复现一次，复制完整 `[Oversample Debug]` 日志贴回。重点看：
  - `data.search_metadata` 内容（这是揭示后端真因的钥匙）
  - `hits[0..2]` 三条样本的 `hash_value` 是否相同（暗示 collapse）
  - 是否出现 ⚠️ 红字告警

### 不做的事

- 自动续接（V2 API 架构上不支持）
- 重构 useDragSelect / useExitMultiSelectOnEmptyClick
- 任何"症状性补丁"（在根因未定位前不加 e.buttons 卫生检查 / 多重事件兜底，避免污染日志、掩盖真因）

