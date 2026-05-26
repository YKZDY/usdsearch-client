# 需求文档：资产卡片点击死区修复

## 引言

在 worktree `integration/lm-merge-acd` 上发现一组高频用户体验 bug：用户单击/Shift+单击/Ctrl+单击资产卡片本体时**偶发完全无响应**——既不打开 Drawer，也不进入多选，也不切换抽屉内容。问题在多种场景下都会复现：

1. 干净页面 Shift+单击卡片本体 → 应进入多选/区间选择，但偶发无任何反应
2. 干净页面 Ctrl+单击卡片本体 → 应 toggle 选中并进入多选，但偶发无任何反应
3. 已打开 Drawer 的状态下单击其他卡片 → 应切换 Drawer 内容到新卡片，但偶发无反应（既不切换也不关闭）

经过对 `useDragSelect.js` / `useClickOrDoubleClick.js` / `useDrawerOrSelect.js` / `useDrawerCloseGuard.js` 四个 hook 的全链路代码审查，已锁定三类**协作冲突 + 冗余逻辑**的根因，需要做最小侵入但精准的修复。

---

## 根因摘要（供需求条目引用）

- **R1**：[useClickOrDoubleClick.js](web/src/hooks/useClickOrDoubleClick.js) 的 `movedRef` 阈值（5px）+ 早退顺序：`handleClick` 第一句就检查 `movedRef`，**修饰键判定在早退之后**。用户按下→抖动 6px→松开时，整次点击（含 Shift/Ctrl）被当作"拖拽"丢弃。
- **R2**：[useDragSelect.js](web/src/hooks/useDragSelect.js) 容器内 mousedown 立即 `isActive=true`，没有阈值缓冲；任何 mousemove 都会进入 paint 模式判定，与 `useClickOrDoubleClick.movedRef` 双重消费 mousemove，加剧 R1。
- **R3**：当前两条点击链路在卡片上**同时挂载**——`useClickOrDoubleClick` 在 [VirtualizedHybridSearchResults.jsx:342](web/src/components/VirtualizedHybridSearchResults.jsx) 与 :737、[HybridSearchResults.jsx:371](web/src/HybridSearchResults.jsx) 与 :808 各挂一份，而真正语义判定（toggle / 区间选 / Drawer）由 `useDrawerOrSelect` 接管。`useClickOrDoubleClick` 的"双击 toggle 回滚"逻辑在新交互下**已没用**，反而成为冗余层加大失败概率。

---

## 需求

### 需求 1：消除 Shift+click / Ctrl+click 失灵

**用户故事：** 作为一名使用键盘修饰键多选资产的用户，我希望 Shift+单击 和 Ctrl+单击 永远生效，不会因为手指轻微抖动就被吞掉。

#### 验收标准

1. WHEN 用户在卡片本体上 Shift+单击，且 mousedown→mouseup 之间位移在合理阈值（≤10px）内 THEN 系统 SHALL 进入多选模式并正确执行区间选择（anchor→target）
2. WHEN 用户在卡片本体上 Ctrl/Cmd+单击 THEN 系统 SHALL toggle 该卡片选中态并进入多选模式，无论 mousedown→mouseup 之间是否有 ≤10px 的轻微抖动
3. WHEN 用户在干净页面（无 Drawer / 无多选）首次 Shift+单击 THEN 系统 SHALL 退化为无修饰键单击行为（即打开 Drawer），与现有 `useDrawerOrSelect` 真值表第 1/2 行一致
4. IF 修饰键点击的 mousedown→mouseup 位移超过 10px THEN 系统 SHALL 视为拖拽框选起点，不触发 click 语义（避免与拖拽多选冲突）
5. WHEN 修饰键判定与"是否移动过"判定同时存在 THEN 系统 SHALL **优先判定修饰键**，即修饰键 click 不被 movedRef 早退拦截

---

### 需求 2：抽屉打开时点击其他卡片必须切换内容

**用户故事：** 作为一名通过 Drawer 浏览资产详情的用户，我希望在 Drawer 已打开时单击另一张卡片就能立即切换 Drawer 内容到新卡片，而不是无反应。

#### 验收标准

1. WHEN Drawer 已打开 AND 用户单击另一张卡片本体 AND 鼠标位移 ≤10px THEN 系统 SHALL 切换 Drawer 内容到新卡片（不关闭抽屉）
2. WHEN Drawer 已打开 AND 用户 Shift+click 另一张卡片 THEN 系统 SHALL 进入多选模式（关闭抽屉或保留抽屉的策略由真值表决定，不得"完全无反应"）
3. WHEN Drawer 已打开 AND 用户在抽屉**外的真空白区域**（非卡片、非工具栏、非交互控件）单击 THEN 系统 SHALL 关闭 Drawer（保持现有 `useDrawerCloseGuard` 行为）
4. WHEN Drawer 刚打开后 ≤250ms（warmup 期）AND 用户单击其他卡片 THEN 系统 SHALL 立即响应该 click（不能因 warmup 误吞 click）
5. IF Drawer 切换内容时新卡片 click 触发了 useDrawerCloseGuard 的 mousedown 路径 THEN 系统 SHALL 因 KEEP_OPEN 命中（`[data-card-index]`）短路而不关闭抽屉

---

### 需求 3：清理冗余 hook，统一点击事件来源

**用户故事：** 作为代码维护者，我希望卡片的点击事件链路只有一个权威实现，避免两条 hook 互相打架，让未来维护和合入英伟达上游更安全。

#### 验收标准

1. WHEN 新交互（`FEATURE_FLAGS.NEW_CARD_INTERACTION=true` AND `FEATURE_FLAGS.SINGLE_CLICK_DRAWER=true`）启用 THEN 系统 SHALL 只走 `useDrawerOrSelect` 一条点击判定路径，不再经过 `useClickOrDoubleClick` 的双击补偿回滚机制
2. WHEN 旧交互（`FEATURE_FLAGS.SINGLE_CLICK_DRAWER=false`）启用 THEN 系统 SHALL 保留 `useClickOrDoubleClick` 原有行为不变（向后兼容 NVIDIA 原版双击 Modal 路径）
3. WHEN 修复完成 THEN 卡片 onClick / onMouseDown / onMouseMove / onDoubleClick 的事件源 SHALL 由一个清晰的判定函数决定（不再由两个 hook 同时挂载，避免 movedRef 在不同 hook 间不同步）
4. IF 修复涉及修改原版 NVIDIA 文件（VirtualizedHybridSearchResults.jsx / HybridSearchResults.jsx 由我们维护非纯原版） THEN 修改区域 SHALL 用 `LM CUSTOMIZATION` 注释块包裹（遵守 nvidia-merge-safety.md 规则）

---

### 需求 4：拖拽框选与单击修饰键不互相干扰

**用户故事：** 作为同时使用拖拽框选和键盘修饰键多选的用户，我希望两种交互各司其职，不互相吞事件。

#### 验收标准

1. WHEN 用户按下并拖动鼠标 ≥10px THEN 系统 SHALL 进入拖拽框选（rect / paint）模式，本次释放鼠标时不触发 click 语义
2. WHEN 用户按下并松开鼠标位移 <10px AND 任何修饰键 THEN 系统 SHALL 触发 click 语义并交给 `useDrawerOrSelect` 真值表处理
3. WHEN 用户在容器内卡片本体上 mousedown THEN 系统 SHALL **不立即** 设 `isActive=true`，而是采用与容器外相同的阈值缓冲（`OUTER_DRAG_THRESHOLD` 或单独的内部阈值）激活；mousemove 距离不足时让原生 click 正常派发
4. WHEN 拖拽框选激活 AND 用户松开鼠标 THEN 系统 SHALL 阻止本次 click 派发到 useDrawerOrSelect（避免 false-positive 打开 Drawer）
5. IF 容器内 mousedown 起点是非卡片空白区 THEN 系统 SHALL 保留现有的 `preventDefault` 阻止文本选区行为，但**不立即** isActive=true

---

### 需求 5：测试与验证

**用户故事：** 作为质量保证者，我希望修复后能用一个可重复运行的测试矩阵确认每条点击路径都正常工作。

#### 验收标准

1. WHEN 修复完成 THEN 验证 SHALL 包含以下手动测试矩阵（共 9 个组合，每个用例都必须通过）：
   - 干净页面 单击卡片本体 → 打开 Drawer
   - 干净页面 Shift+单击卡片本体 → 进入多选 / 区间选择 或 退化为单击（取决于 anchor 状态）
   - 干净页面 Ctrl+单击卡片本体 → 进入多选 toggle
   - 干净页面 单击复选框 → toggle 选中（不打开 Drawer）
   - Drawer 已开 单击其他卡片本体 → 切换 Drawer 内容
   - Drawer 已开 Shift+单击其他卡片 → 进入多选
   - Drawer 已开 单击真空白 → 关闭 Drawer
   - 多选模式 拖拽框选 → 矩形圈选生效
   - 多选模式 Esc → 清空选中并退出多选
2. WHEN 所有用例通过 THEN 修复 SHALL 视为完成；任一失败必须回到 systematic-debugging 流程定位剩余原因
3. WHEN 使用 Playwright MCP 验证 THEN 测试 SHALL 注入轻微（5-9px）抖动模拟真实手指输入，验证 R1 回归不再发生
