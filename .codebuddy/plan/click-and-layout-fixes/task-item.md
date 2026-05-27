# 实施计划

> **For Claude:** 本计划用于修复 `integration-lm-merge-acd` 工作树上 Drawer/卡片交互"非缩略图区域偶发失灵"的真正根因（CardTagBar 容器级 stopPropagation 吞没事件），并对齐虚拟化卡片视觉、消除 commit 乱码。所有改动必须用 `LM CUSTOMIZATION` 标记包裹以保障 NVIDIA 合入安全。

**目标：** 让用户在卡片任意区域（含标签栏、底部按钮间隙）单击都能稳定触发 Drawer/多选行为，同时统一虚拟化与非虚拟化卡片视觉。

**架构：** 最小侵入式修复 — 仅调整 CardTagBar 容器层事件处理策略（"容器透传 + 元素消费"），动态计算虚拟化卡片宽高，永久化 git 中文 commit 配置。

**技术约束：** Chakra UI v2 + framer-motion + react-window；不引入新依赖；不修改 NVIDIA 自动生成代码。

---

- [ ] 1. 侦察 CardTagBar 内部 chip / AddTagButton / MoreChip 的事件消费现状
  - 读取 [CardTagBar.jsx](../../web/src/components/CardTagBar.jsx) 全文（279 行）
  - 验证 `AddTagButton` 第 47-52 行、`MoreChip` 第 99-104 行已在元素自身做 stopPropagation
  - 用 grep 搜索所有引用 `containerHandlers` 的位置，确认只在 CardTagBar 自身使用
  - 输出：确认"chip / 加号 / +N 折叠按钮自身已有 stopPropagation"的证据，可以安全移除容器级阻断
  - _需求：1.5、1.6_

- [ ] 2. CardTagBar 容器级 stopPropagation 改为"按需消费"+ Feature Flag 回滚开关
  - 修改 [CardTagBar.jsx](../../web/src/components/CardTagBar.jsx) 第 173-177 行
  - 引入 `FEATURE_FLAGS.CARD_TAGBAR_BUBBLE`（默认 true = 透传，false = 旧行为）
  - 用 `LM CUSTOMIZATION: CardTagBarBubble` 标记包裹
  - 新行为：`containerHandlers = FEATURE_FLAGS.CARD_TAGBAR_BUBBLE ? {} : { onClick/onMouseDown/onDoubleClick: stopPropagation }`
  - 注释清楚"原行为是无条件吞没，改为透传以修复偶发失灵；保留 Flag 用于必要时快速回滚"
  - _需求：1.1、1.2、1.5_

- [ ] 3. 在 featureFlags.js 中注册 CARD_TAGBAR_BUBBLE 开关
  - 定位 `web/src/utils/featureFlags.js`（或同名配置文件）
  - 用 `LM CUSTOMIZATION` 标记新增 `CARD_TAGBAR_BUBBLE: true`
  - 确认与已有的 `NEW_CARD_INTERACTION` / `SINGLE_CLICK_DRAWER` 风格一致
  - _需求：1.5、关键技术约束_

- [ ] 4. 验证 chip 自身点击仍能弹 Popover（关键回归点）
  - 静态走查：`AddTagButton` / `MoreChip` 内部的 `handleMouseDown`、tag chip 上 `cloneElement` 注入的 `onClick: stopPropagation` 是否仍然生效
  - 确认 forwardRef 链路完整：Popover → cloneElement → AddTagButton(handleMouseDown stopPropagation) → button onClick(原透传)
  - 静态确认即可，不动代码（如发现链路被破坏才回到 Task 2 调整）
  - _需求：1.2、1.6、边界情况_

- [ ] 5. VirtualizedHybridSearchResults 卡片宽高改为响应式动态计算
  - 修改 [VirtualizedHybridSearchResults.jsx](../../web/src/components/VirtualizedHybridSearchResults.jsx) 第 1257、1262 行附近
  - 用 `LM CUSTOMIZATION: VirtualizedCardSizing` 标记
  - 改为：`itemWidth = containerWidth / columnCount - gap`；`itemHeight` 维持 16:9 缩略图 + 内容区按 gridSize 动态算
  - 验证 gridSize='S' 紧凑模式与非虚拟化分支视觉对齐
  - _需求：3.1、3.2、3.3、3.4、3.5_

- [ ] 6. 永久化 git UTF-8 中文 commit 配置（防止后续乱码回归）
  - 在工作树根（`.worktrees/integration-lm-merge-acd`）执行：
    - `git config --local i18n.commitencoding utf-8`
    - `git config --local i18n.logoutputencoding utf-8`
    - `git config --local core.quotepath false`
  - 在 `.codebuddy/plan/click-and-layout-fixes/` 下新增 `git-utf8-setup.md` 记录命令
  - 验证：用 `git log --oneline -5` 确认现有中文显示正常
  - _需求：4.1、4.2、4.4_

- [ ] 7. 新建 docs/click-bug-replay.md 包含 5 个 Playwright 验证用例
  - 路径：[docs/click-bug-replay.md](../../docs/click-bug-replay.md)
  - 用例 A：CardTagBar 覆盖区随机 20 坐标连点 → 100% 触发 onSelectionChange
  - 用例 B：标签 chip 间隙单击 → 触发 onSelectionChange（不再被吞）
  - 用例 C：直接点 tag chip → 触发 Popover（不打开 Drawer）
  - 用例 D：CardTagBar 区域起点拖拽 > 8px → 进入 paint 模式
  - 用例 E：limit=100 vs limit=50 视觉对比 → 偏差 < 5%
  - 每个用例附 Playwright 探针代码片段（page.evaluate / page.mouse.click）
  - _需求：6.1、6.2_

- [ ] 8. ESLint + 静态自检
  - 运行 `cd web && npx eslint src/components/CardTagBar.jsx src/components/VirtualizedHybridSearchResults.jsx`
  - 期望：0 error；warning 不增加（与修改前对比）
  - 自检 `LM CUSTOMIZATION` 标记成对出现（grep 数 START/END 是否相等）
  - _需求：关键技术约束、成功标准_

- [ ] 9. Playwright MCP 实跑用例 A/B/C/D（核心 P0 验收）
  - 启动 dev server 或对接现有 localhost:3000
  - 顺序跑 4 个用例并记录数据：
    - A：100% 触发率（≥ 19/20）
    - B：触发 onSelectionChange
    - C：触发 Popover 且未触发 onSelectionChange
    - D：drag-paint 状态进入
  - 任何一项不通过则回到 Task 2 调试
  - _需求：1.7、6.2、成功标准_

- [ ] 10. 提交并验证 commit message 中文显示
  - 分两个原子 commit：
    - commit 1：`fix(card): CardTagBar 容器停止吞没单击事件，修复非缩略图区域偶发失灵`
    - commit 2：`fix(virtualized): 虚拟化分支卡片宽高改为响应式，与非虚拟化对齐`
  - 验证 `git log --oneline -5` 中文显示无 `\u` 转义
  - 验证 `LM CUSTOMIZATION` 标记完整
  - _需求：4.1、4.2、关键技术约束_

---

## 备注：本轮不实施的需求 5（P2 防御性优化）

需求 5「消除 onMouseUp 模拟 click 与 useDragSelect 的潜在重叠」已确认**不是**当前症状根因，留作下一轮单独迭代，避免本轮范围扩散。

## 任务粒度说明

- Task 1（侦察）、Task 4（静态验证）、Task 6（git 配置）：3 分钟内
- Task 2、3、5（核心代码修改）：每项 5 分钟内
- Task 7（写文档）：5 分钟
- Task 8（lint）、Task 9（Playwright 验跑）：每项 3-5 分钟
- Task 10（提交）：2 分钟
- **总计预估：~ 35-45 分钟**
