# 需求文档：连续点击偶发失灵的真正根因修复 + 虚拟化布局对齐 + Commit 注释中文化

## 引言

本次任务是对 `integration-lm-merge-acd` 工作树上 Drawer/卡片交互的**第三轮收尾修复**。在用户提供了关键决定性线索"**只有点击资产卡片缩略图以外的区域才会出现偶发失灵，缩略图区域 100% 正常**"后，我重新做了精准的代码侦察，**推翻了前两轮"逻辑叠加"的猜想**，定位到完全不同的真正根因：

### 🎯 真正根因（决定性证据）

`web/src/components/CardTagBar.jsx` 第 173-177 行对 CardTagBar 的容器层注册了：

```js
const containerHandlers = {
  onClick: (e) => e.stopPropagation(),
  onMouseDown: (e) => e.stopPropagation(),
  onDoubleClick: (e) => e.stopPropagation(),
};
```

**这三个事件被注册在 CardTagBar 的整个容器（HStack）上，对所有冒泡事件无条件 stopPropagation。**

### DOM 层级与事件吞没分布

| 用户点击的卡片区域                        | DOM 路径                                                                            | onClick 能否冒泡到 `<Card>` 根 | 用户感知                               |
| ----------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------- |
| 缩略图本体                                | `Card → CardBody → VStack → Box → NavigableAssetImage`                              | ✅ 能冒泡                      | **100% 灵敏**（与用户报告一致）        |
| 标题/评分行                               | `Card → CardBody → VStack → VStack → HStack`                                        | ✅ 能冒泡                      | 大概率灵敏                             |
| **CardTagBar（标签栏占下半部 1/3 高度）** | `Card → CardBody → VStack → VStack → CardTagBar 容器（带 onClick stopPropagation）` | ❌ **被吞**                    | **完全无响应**（用户报告的"偶发失灵"） |
| 文件大小/日期文本                         | `Card → CardBody → VStack → VStack → VStack`                                        | ✅ 能冒泡                      | 灵敏                                   |
| 底部按钮（Copy/Similar 图标）             | 各自 `onClick` 内 stopPropagation                                                   | ❌ 被吞                        | 无响应（设计行为）                     |

### 为什么是"偶发"

CardTagBar 占据卡片下半部 1/3 高度，用户**主观上以为是连续一片区域**，但 DOM 上分成多个不同层级：

- 标签 chip 之间的间隙、加号按钮的 padding 周围、空标签时的"未编辑"占位 placeholder——**整片都是 CardTagBar 容器的 hit-test 区域**
- 用户随手点击时落在 CardTagBar 容器（无论是 chip 还是空白处）→ 全部被 stopPropagation 吞掉
- 用户偶尔点到标题/缩略图/底部按钮区域 → 灵敏

**这才是用户报告"连续单击有时灵敏有时失灵"、"日常 Ctrl+click 多选偶发失败"、"切换 Drawer 偶发不响应"的真正根因。** 之前两轮修复（onMouseUp 模拟修饰键 click、startTransition 改回同步 setState、innerPending 缓冲态）都没触及这条事件吞没链路。

### 历史结论纠正

需求 5「消除 onMouseUp 修饰键 click 模拟与 useDragSelect paint 起步的双重 toggle」**降级为 P2 防御性优化**——不是当前症状的根因，但仍是一个值得清理的架构债。

## 需求

### 需求 1（P0 核心）：CardTagBar 容器停止吞没卡片本体的 click/dblclick

**用户故事：** 作为用户，我希望在卡片任何区域（包括标签栏、标签间隙、加号按钮周围）点击都能触发卡片的单击行为，以便建立"卡片任何位置都能点开 Drawer / 进入多选"的稳定预期

#### 验收标准

1. WHEN 用户单击 CardTagBar 容器内任何**非交互元素**（如标签 chip 之间的间隙、空标签占位 placeholder、加号按钮周围 padding） THEN 事件 SHALL 冒泡到 `<Card>` 根，触发 `useDrawerCardHandlers.handleClick` → `onSelectionChange` → 打开 Drawer / toggle 多选
2. WHEN 用户单击 CardTagBar 内**真正的交互元素**（如某个具体的 tag chip、加号按钮、+N 折叠按钮、Popover 触发器） THEN 事件 SHALL 仅在该元素自身被消费（保持现有行为，不冒泡到卡片根，避免点 chip 也打开 Drawer）
3. WHEN 用户在 CardTagBar 区域 Ctrl+click / Shift+click（位移 0-15px） THEN SHALL 与点缩略图同样的行为：进入多选模式或区间选
4. WHEN 用户在 CardTagBar 区域开始拖拽框选（位移 > 8px） THEN `useDragSelect` SHALL 正常进入 paint 模式（不被 stopPropagation 拦截）
5. WHEN 修复落地 THEN [CardTagBar.jsx](../../web/src/components/CardTagBar.jsx) 第 173-177 行的 `containerHandlers` SHALL 被移除或重构为"仅在交互元素上 stopPropagation"，禁止对整个容器无条件 stopPropagation
6. WHEN 修复落地 THEN 已有的 `AddTagButton` / `MoreChip` 等内部交互元素 SHALL 保留它们各自的 stopPropagation（在元素自身的 handler 内），不破坏 Popover 弹出等已有功能
7. WHEN 修复落地 THEN Playwright 探针：在卡片下半部 1/3 区域（标签栏覆盖区）100 个随机坐标连点 SHALL 100% 触发 onSelectionChange

### 需求 2（P0 核心）：消除底部按钮区与卡片本体的"点击死区"

**用户故事：** 作为用户，我希望在卡片底部按钮（Copy / FindSimilar）**之间的间隙**点击仍然能触发卡片单击，以便不再因为"差一点点点到按钮"而失败

#### 验收标准

1. WHEN 用户点击 Copy / FindSimilar IconButton **本身** THEN 行为 SHALL 保持现状（执行复制/查找相似，stopPropagation 不冒泡）
2. WHEN 用户点击底部 HStack 内**按钮之间的间隙** THEN 事件 SHALL 冒泡到 `<Card>` 根，触发 onSelectionChange
3. IF 当前实现中 HStack 自身没有 stopPropagation（仅按钮自身有） THEN 本需求 SHALL 自动满足，仅作侦察验证用例

### 需求 3（P1）：虚拟化分支卡片宽高与非虚拟化分支视觉对齐

**用户故事：** 作为用户，我希望 limit > 50（虚拟化）卡片视觉与 ≤ 50 时一致，以便在不同 limit 下获得稳定的视觉体验

#### 验收标准

1. WHEN 用户切换 limit 从 ≤ 50 到 > 50 THEN 卡片宽度 SHALL 仍然填满网格列宽（不再用 280px 写死导致右侧留白）
2. WHEN 用户处于 limit > 50 模式 THEN 视口底部黑色未填充区域 SHALL 与 limit ≤ 50 模式视觉等高（偏差 ≤ 一行卡片高度的 5%）
3. WHEN 用户处于 gridSize='S' 紧凑模式 THEN 虚拟化与非虚拟化分支 SHALL 使用相同的卡片宽高比例
4. IF 容器宽度变化（侧边栏展开/收起、Drawer 开关） THEN 虚拟化卡片网格 SHALL 自动重新计算列数与列宽
5. WHEN 视觉修复完成 THEN [VirtualizedHybridSearchResults.jsx](../../web/src/components/VirtualizedHybridSearchResults.jsx) 第 1257、1262 行的 `itemHeight={... 360 ...}` 和 `itemWidth={... 280 ...}` SHALL 改为根据容器宽度动态计算（与非虚拟化分支同源）

### 需求 4（P1）：Commit 注释 unicode 转义乱码消除 + 防回归

**用户故事：** 作为协作开发者，我希望 git log 显示的 commit message 是简体中文原文，以便快速读懂历史改动

#### 验收标准

1. WHEN 任何一次新 commit 提交 THEN commit message 中的中文 SHALL 是简体中文原文（UTF-8 编码），禁止出现 `\u4xxx` 形式的 unicode 转义
2. WHEN 用户运行 `git log --oneline -10` THEN 最近 10 条 commit 显示 SHALL 全是可读中文，无任何转义码
3. IF 历史已有的乱码 commit 已经推到远端 THEN SHALL **不修改**（不 force-push 改写历史，避免破坏其他人的本地分支），只保证本轮起的新 commit 不再乱码
4. IF 终端 / git CLI 在 Windows + Git Bash 环境下偶尔自动转义中文 THEN 本轮 SHALL 提供一个 `git config` 校验命令（例如 `git config --global core.quotepath false` + `git config --global i18n.commitencoding utf-8`）作为永久预防

### 需求 5（P2 防御性优化）：消除 onMouseUp 修饰键 click 模拟与 useDragSelect 的潜在重叠

**用户故事：** 作为开发者，我希望两条 click 处理路径在重叠区间（5-18px 位移）有清晰的分工契约，以便降低未来回归风险

#### 验收标准

1. WHEN 用户在卡片本体 Ctrl+click（位移 5-8px） THEN `useDrawerCardHandlers.handleMouseUp` 模拟 click 与 `useDragSelect` 的 innerPending 静默清理 SHALL 互斥（其中之一处理）
2. WHEN 用户在卡片本体 Ctrl+click（位移 8-18px） THEN 系统 SHALL 仅派发**一次** `onSelectionChange` toggle，禁止 `useDrawerCardHandlers.handleMouseUp` 与 `useDragSelect.applyPaint` 同时生效
3. IF `useDragSelect` 已经进入 `isActive=true` THEN 后续 mouseup 时 `useDrawerCardHandlers.handleMouseUp` SHALL 检测到该状态并放弃模拟 click
4. **本需求是防御性优化，不是当前症状的根因**——可以延后到下一轮迭代单独处理

### 需求 6（P0 验证）：根因修复的 Playwright 回归用例

**用户故事：** 作为质量负责人，我希望本轮 P0 修复有可重放的 Playwright 验证脚本，以便后续任何重构都能快速回归测试

#### 验收标准

1. WHEN 修复完成 THEN SHALL 在 [docs/click-bug-replay.md](../../docs/click-bug-replay.md)（新建）中提供 5 个标准验证用例：
   - 用例 A：在卡片标签栏区域（CardTagBar 占据的 1/3 卡片高度）随机 20 个坐标点击 SHALL 100% 触发 onSelectionChange
   - 用例 B：在标签 chip 之间的间隙单击 SHALL 触发 onSelectionChange（不再被吞）
   - 用例 C：直接点 tag chip 本身 SHALL 触发该 chip 的 Popover（不冒泡到卡片）
   - 用例 D：在 CardTagBar 区域开始拖拽框选（位移 > 8px） SHALL 正常进入 paint 模式
   - 用例 E：limit=100 模式下卡片视觉布局截图 SHALL 与 limit=50 视觉对比偏差 < 5%
2. WHEN 用例执行 THEN SHALL 100% 命中预期，任何一个失败 SHALL 视作"修复未完成"

## 关键技术约束（NVIDIA 合入安全）

- 所有改动**必须**用 `LM CUSTOMIZATION` 标记包裹
- [CardTagBar.jsx](../../web/src/components/CardTagBar.jsx) 的修改 SHALL 保留原 `containerHandlers` 行为的备选分支（FEATURE_FLAGS 控制），便于必要时快速回滚
- 优先保持原文件结构不变，仅在事件 handler 层做最小侵入修改

## 成功标准

| 维度                                                    | 验收指标            |
| ------------------------------------------------------- | ------------------- |
| CardTagBar 区域 100 次随机点击 onSelectionChange 触发率 | 100/100             |
| 标签 chip 之间间隙的点击 onSelectionChange 触发率       | 100%                |
| 标签 chip 本身的点击 SHALL 触发 Popover 不打开 Drawer   | 100%                |
| limit=100 与 limit=50 卡片宽度差异                      | < 5%                |
| limit=100 视口底部空白带高度偏差                        | ≤ 一行卡片高度的 5% |
| 新 commit message 含 `\\u` 转义码数量                   | 0                   |
| LM CUSTOMIZATION 标记覆盖率                             | 100%                |

## 边界情况与非目标

**边界情况已考虑**：

- CardTagBar 容器 stopPropagation 移除后，确保 tag chip 本身的 onClick（弹出 Popover）仍然工作（chip 自身的 stopPropagation 在更细粒度位置仍然存在）
- AddTagButton（加号按钮）和 MoreChip（+N 折叠 chip）必须保留它们 onClick 弹出 Popover 的行为
- 拖拽框选起点落在 CardTagBar 区域时不被中间层 stopPropagation 截断
- Drawer 已开切换：保持上一轮的 `containerProps={pointerEvents: 'none'}` 修复

**非目标**（本轮不做）：

- 不重写 useDragSelect 的 paint 模式数据流
- 不重做虚拟化库（react-window 等保持不变，只调 itemHeight/itemWidth 计算策略）
- 不修改 NVIDIA `usd_search_client/api/`、`usd_search_client/models/` 自动生成代码
- 不引入新的 npm 依赖
- **需求 5（onMouseUp 模拟与 useDragSelect 协调）本轮不实施**——已确认不是当前症状根因，留作下一轮迭代

## 修复策略概览

### 必改（P0）

1. **`CardTagBar.jsx` 第 173-177 行**：移除容器级无条件 stopPropagation
   - 仅在真正的交互元素（chip / 加号 / +N 按钮）上保留它们各自的事件消费
   - 容器层（HStack）让事件透传到 Card 根
   - 用 LM CUSTOMIZATION 标记，备注"原行为是无条件吞没，改为透传以修复偶发失灵"

### 应改（P1）

2. **`VirtualizedHybridSearchResults.jsx` 第 1257、1262 行**：动态计算 itemHeight/itemWidth
3. **git 配置永久化**：本地 git config 设 quotepath=false + commitencoding=utf-8
4. **新建 `docs/click-bug-replay.md`**：5 个 Playwright 用例脚本

### 留作下一轮（P2）

5. onMouseUp 模拟与 useDragSelect 的协调 ref（防御性优化）
