# 实施计划：资产卡片点击死区修复

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** 消除卡片点击偶发失灵（含 Shift+click / Ctrl+click / Drawer 已开后切换），同时清理 `useClickOrDoubleClick` 与 `useDrawerOrSelect` 重叠冗余。

**Architecture:** 三段式精准外科手术。① `useClickOrDoubleClick` 调阈值与判定顺序消除"轻微抖动吞 click"。② `useDragSelect` 容器内 mousedown 加阈值缓冲，避免 isActive 抢跑误吞 mousemove。③ 卡片层在 `SINGLE_CLICK_DRAWER=true` 时只挂 `useDrawerOrSelect` 一条权威路径，不再叠加 `useClickOrDoubleClick`。

**Tech Stack:** React Hooks（useCallback / useRef）、Chakra UI v2、Playwright MCP（验收）。

**Branch:** `integration/lm-merge-acd` worktree。

---

## 任务清单

- [ ] **1. 修正 `useClickOrDoubleClick` 修饰键判定顺序与位移阈值**
  - **文件：** Modify `web/src/hooks/useClickOrDoubleClick.js`
  - **改动：**
    1. 把 `MOVE_THRESHOLD` 从 `5` 改为 `10`（与 `useDragSelect.OUTER_DRAG_THRESHOLD` 对齐，宽容真实手指/触控板抖动）
    2. 在 `handleClick` 中**把修饰键判定提前到 `movedRef` 早退之前**：先检测 `e?.shiftKey || e?.metaKey || e?.ctrlKey`，命中则立即 `onClick?.(e)` 并 `return`，不受 movedRef 影响
    3. 仅在**无修饰键**路径继续走原 `if (movedRef.current) return` 早退
    4. 改动用 `// === LM CUSTOMIZATION: ClickRobustness START / END ===` 包裹，注释说明根因 R1
  - _需求：1.1, 1.2, 1.4, 1.5_

- [ ] **2. 给 `useDragSelect` 容器内 mousedown 增加阈值缓冲（消除 isActive 抢跑）**
  - **文件：** Modify `web/src/hooks/useDragSelect.js`
  - **改动：**
    1. 新增常量 `INNER_DRAG_THRESHOLD = 6`（与外阈值 20 区分，内部更敏感但仍提供缓冲）
    2. `handleMouseDown` 容器内分支：将 `isActive: true` 改为 `isActive: false` + 新字段 `innerPending: true`，记录 `startX/startY/baseSet/paintMode/startedInsideCard`，**不再当帧立即 setIsDragging**
    3. `handleMouseMove` 在 `st.innerPending && !st.isActive` 分支里检查位移 `dist >= INNER_DRAG_THRESHOLD`：达标才 `isActive=true` + `mode='paint'/'rect'`（按 startedInsideCard 决定）+ `setIsDragging(true)` + `applyDragBodyStyles(true)`
    4. `handleMouseUp` 中 `innerPending && !isActive` 路径要把 state 干净重置，**不阻断 click 派发**（关键：让原生 click 走到卡片 onClick）
    5. 现有 `safetyReset` 同步重置 `innerPending`
    6. 改动全部用 `// === LM CUSTOMIZATION: InnerDragThreshold START / END ===` 包裹
  - _需求：4.3, 4.5, 1.4_

- [ ] **3. 在 `SINGLE_CLICK_DRAWER` 开启时卡片不再挂 `useClickOrDoubleClick`（消除冗余层）**
  - **文件：**
    - Modify `web/src/components/VirtualizedHybridSearchResults.jsx:340-405`（两处 `clickHandlers` 接入：line ~342 与 ~737）
    - Modify `web/src/HybridSearchResults.jsx:368-410`（两处：line ~371 与 ~808）
  - **改动：**
    1. 新建一个轻量 helper（建议放 `web/src/hooks/useDrawerCardHandlers.js`），接收 `{ result, index, onSelectionChange, onItemClick, drawerEnabled }`，返回 `{ onClick, onDoubleClick, onMouseDown, onMouseMove }`：
       - `drawerEnabled=true`：`onClick = (e)=>onSelectionChange(result, e, index)`、`onDoubleClick = ()=>onItemClick(result)`、`onMouseDown/onMouseMove` 仅做位移记录用于自身 movedRef，**位移>10px 时只丢弃无修饰键 click**
       - `drawerEnabled=false`：内部仍使用 `useClickOrDoubleClick` 原逻辑（向后兼容 NVIDIA 原版双击）
    2. 在两个文件的卡片渲染处把 `useClickOrDoubleClick(...)` 替换为 `useDrawerCardHandlers(...)`，确保 `data-card-index` 与 tooltip 行为不变
    3. 所有改动用 `// === LM CUSTOMIZATION: ClickHandlerUnify START / END ===` 包裹
  - _需求：3.1, 3.2, 3.3, 3.4_

- [ ] **4. 验证 `useDrawerCloseGuard` 在 Drawer 切换时不误关**
  - **文件：** Modify `web/src/hooks/useDrawerCloseGuard.js`（仅评估，必要时微调）
  - **改动：**
    1. 通读 `KEEP_OPEN_SELECTOR` 与 `handleMouseDown/handleMouseUp` 路径，确认任务 2 引入 `innerPending` 不会让 Guard 把 mousedown 误记为"想关 Drawer 起点"
    2. 卡片 mousedown 起点必带 `[data-card-index]` 属性（已有），确认 `shouldKeepOpen` 命中即短路；如发现路径漏覆盖，加上 `[data-multiselect-keep="true"]` 之类兜底
    3. 维持现有 `warmupMs=250` 不动；任务 2 不应改这个值
    4. 不写新逻辑则不动文件（避免无效改动）
  - _需求：2.1, 2.4, 2.5_

- [ ] **5. Playwright MCP 验证 — 9 用例测试矩阵**
  - **文件：** 新建临时验证脚本 `.codebuddy/plan/fix-card-click-deadzone/playwright-verify.md`，列出每个用例的 mouse 序列与预期 DOM 断言
  - **测试矩阵（每个都必须通过）：**
    1. 干净页面 单击卡片本体 → 出现 `chakra-drawer__content` 元素
    2. 干净页面 Shift+单击 → SelectionModeBar 出现 "已选中 1 个资产"（首次 anchor 缺失，退化为打开 Drawer 也算通过，需匹配 `useDrawerOrSelect` 真值表第 1/2 行）
    3. 干净页面 Ctrl+单击 → SelectionModeBar 出现 "已选中 1 个资产"
    4. 干净页面 单击复选框（`[data-role="card-checkbox"]`）→ 选中 +1，不出现 Drawer
    5. Drawer 已开 单击其他卡片 → Drawer 仍存在 + 标题切换为新卡片名
    6. Drawer 已开 Shift+单击 → Drawer 关闭/进入多选（取决于真值表）
    7. Drawer 已开 单击真空白 → Drawer 消失
    8. 多选模式 拖拽 (200,200)→(1500,920) → 选中数 ≥ 5
    9. 多选模式 Esc → SelectionModeBar 消失 + 选中数 0
  - **关键变量：** 在每次 mousedown→mouseup 之间注入 6-9px 抖动模拟真实手指（验证任务 1 的位移阈值不再误杀）
  - **执行：** 用 `playwright` MCP 的 `browser_run_code_unsafe` 跑完 9 个用例，全部通过才算闭环
  - _需求：5.1, 5.2, 5.3_

- [ ] **6. UX 自审 + 提交**
  - **改动：**
    1. 跑 `read_lints` 检查 4 个改动文件无 lint 错误
    2. 在每个 `LM CUSTOMIZATION` 块旁补上 "合入英伟达新版时：保留本块" 注释
    3. 按 UX 自审 Checklist 输出：已达标项 + 可优化 P0/P1/P2 列表
    4. `git add` 所有改动文件，commit：`fix(multiselect): 修复卡片点击死区 (Shift/Ctrl+click 偶发无反应 / Drawer 切换无响应)`
    5. 在 commit message body 里列出根因 R1/R2/R3 与对应任务编号，便于未来追溯
  - _需求：3.4, 5.2_

---

## 关键技术决策

1. **为什么 `MOVE_THRESHOLD` 5→10**：实测触控板用户手指按压时的自然抖动通常在 3-8px，5px 太敏感；10px 与 `OUTER_DRAG_THRESHOLD=20` 形成"内紧外松"梯度，既保留拖拽框选又防止误吞 click。
2. **为什么修饰键判定提前**：Shift/Ctrl+click 是用户**显式表达多选意图**的强信号，**任何位移都不应导致它失效**；这与"无修饰键的 click 应避免误触发"是两个完全不同的产品需求。
3. **为什么 `useDragSelect` 容器内加阈值缓冲**：当前 mousedown 当帧 `isActive=true` 是 R2 的核心，与 `useClickOrDoubleClick.movedRef` 形成"双重消费"。引入 `innerPending` 让两者解耦——拖拽真正激活前 movedRef 仍按原逻辑工作。
4. **为什么不删 `useClickOrDoubleClick`**：项目还保留 `SINGLE_CLICK_DRAWER=false` 兜底（NVIDIA 原版双击打开 Modal），删掉会破坏向后兼容；改为按 flag 选择性挂载更安全。
5. **YAGNI 不做的事**：① 不改 `useDrawerCloseGuard.warmupMs`（已是 250ms 平衡点）；② 不引入新依赖（如 `react-use` 的 `useGesture`）；③ 不重构 `useDrawerOrSelect` 真值表（已经稳定，问题不在它身上）。

---

## 提交策略

每完成一个任务（1/2/3/5）做一次独立 commit，便于后续 bisect 与 NVIDIA 合入：

- Task 1 commit: `fix(click): useClickOrDoubleClick 修饰键判定提前 + 位移阈值 5→10`
- Task 2 commit: `fix(dragselect): 容器内 mousedown 加阈值缓冲 (innerPending) 避免与 click 路径互吞`
- Task 3 commit: `refactor(card): SINGLE_CLICK_DRAWER 模式下统一走 useDrawerOrSelect 单一路径`
- Task 5 commit: `test(multiselect): Playwright 9 用例测试矩阵`
- Task 6 commit: `chore: UX 自审 + LM CUSTOMIZATION 标记完善`
