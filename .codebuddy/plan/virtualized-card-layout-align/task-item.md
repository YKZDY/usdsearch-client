# 虚拟化分支卡片布局视觉对齐 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 limit > 50(虚拟化分支)的卡片布局与 limit ≤ 50(非虚拟化分支)在视觉上完全对齐,消除"内部空白带"和"视口底部黑带"。

**Architecture:** 通过 Playwright 实测先确定非虚拟化分支(基线)在当前视口下卡片自然内容总高,据此修正 `VirtualizedHybridSearchResults.jsx` 第 1257 行的 `itemHeight` 硬编码值,并视情况移除内部冗余的 `flex={1}` 撑开。所有改动用 `LM CUSTOMIZATION` 标记包裹,不动非虚拟化分支文件,不重写 react-window 调度。

**Tech Stack:** React + react-window + Chakra UI + Playwright MCP(测量)

**Worktree:** `d:/period/usdsearch-client/.worktrees/integration-lm-merge-acd/`

---

## 任务清单

- [ ] **1. 实测非虚拟化基线高度(BEFORE 数据)**
  - 启动 Playwright MCP 浏览到 limit=50,搜索一组真实数据(如关键字 "robot")
  - 用 `browser_evaluate` 测量第一张卡片矩形高度 + 内部 6 个关键节点 Y 坐标:缩略图 bottom、标题 top、CardTagBar top、大小行 top、底部按钮行 top、卡片 bottom
  - 记录视口底部黑带高度(列表容器底 - 最后一行卡片底)
  - 切换到 limit=100 重复同样测量
  - 数据写入 `.codebuddy/plan/virtualized-card-layout-align/EVIDENCE.md` 的 "## BEFORE" 章节
  - _需求:4.1、4.2、1.2_

- [ ] **2. 修正 `itemHeight` 硬编码值**
  - 修改文件:`web/src/components/VirtualizedHybridSearchResults.jsx` 第 1257 行附近
  - 将 `itemHeight={viewMode === "grid" ? (gridSize === "S" ? 200 : 360) : 184}` 改为基于 Task 1 实测的紧凑值(预计 grid 默认值从 360 降到约 320-340,gridSize='S' 从 200 降到约 180-190,具体以实测为准)
  - 用 `// === LM CUSTOMIZATION: VirtualGridItemHeight START/END ===` 标记包裹改动行,注释说明"对齐非虚拟化分支自然高度,避免 flex={1} 撑开空白带"
  - _需求:1.5、2.1、2.2_

- [ ] **3. 审视并清理冗余 `flex={1}`**
  - 检查文件:`web/src/components/VirtualizedHybridSearchResults.jsx` 第 517、530、595 行的 `flex={1}`
  - 在 itemHeight 紧贴内容后,运行一次 Playwright 验证;若仍出现"中段空白被推开"现象,移除非必要的 `flex={1}`,改为内容自然贴合 + 底部按钮 `mt="auto"` 自动贴边
  - 改动用 `LM CUSTOMIZATION: VirtualGridFlexCleanup` 包裹
  - 若实测无空白带,本任务可跳过(并在 EVIDENCE 中说明)
  - _需求:3.1、3.2、3.3_

- [ ] **4. AFTER 实测对照与截图**
  - 重新运行 Task 1 同样的 Playwright 脚本,测量 limit=50 vs limit=100 的卡片矩形高度 + 6 个内部节点 Y 坐标 + 视口底部黑带高度
  - 数据写入 `EVIDENCE.md` 的 "## AFTER" 章节
  - 用 `browser_take_screenshot` 截图保存到 `d:/period/limit-50-after.png` 和 `d:/period/limit-100-after.png`
  - 验证差异 ≤ 8px,黑带差异 ≤ 一行卡片高度的 5%
  - _需求:4.1、4.2、4.3、1.1、1.2、2.1_

- [ ] **5. gridSize='S' 紧凑模式回归验证**
  - 切换到 gridSize='S' 紧凑模式,重复 Task 4 的测量
  - 在 EVIDENCE 中补充 "## AFTER - gridSize='S'" 章节
  - 验证紧凑模式下视觉同样对齐
  - _需求:1.3_

- [ ] **6. 不同视口宽度回归验证**
  - 触发侧边栏开关 / Drawer 开关,改变容器宽度
  - 用 Playwright `browser_resize` 调整为 1280×720 和 1920×1080 各测一次
  - 验证不同宽度下虚拟化卡片仍保持紧贴布局,不出现新空白带
  - 在 EVIDENCE 中补充 "## AFTER - 多视口" 章节
  - _需求:1.4_

- [ ] **7. 提交修复**
  - 运行 `git -C d:/period/usdsearch-client/.worktrees/integration-lm-merge-acd/ status` 确认改动文件清单
  - 提交命令(简体中文 commit message,绝不用 Unicode 转义):
    ```bash
    git -C d:/period/usdsearch-client/.worktrees/integration-lm-merge-acd/ add web/src/components/VirtualizedHybridSearchResults.jsx .codebuddy/plan/virtualized-card-layout-align/
    git -C d:/period/usdsearch-client/.worktrees/integration-lm-merge-acd/ commit -m "fix(virtualized): 修正 itemHeight 与非虚拟化分支视觉对齐,消除底部黑带"
    ```
  - 确认提交日志为简体中文(用 `git log -1 --format=%s` 验证)
  - _需求:LM CUSTOMIZATION 完整性、不引入新依赖_

---

## 验收标准汇总

| 维度                              | 通过条件            |
| --------------------------------- | ------------------- |
| 卡片内 6 节点 Y 坐标差(50 vs 100) | ≤ 8px               |
| 视口底部黑带高度差(50 vs 100)     | ≤ 一行卡片高度的 5% |
| gridSize='S' 紧凑模式             | 同样达标            |
| 多视口(1280/1920)回归             | 同样达标            |
| EVIDENCE.md BEFORE/AFTER 数据     | 完整                |
| `LM CUSTOMIZATION` 标记           | 100% 包裹           |
| 非虚拟化分支文件                  | 未修改              |
| 新 npm 依赖                       | 未引入              |
| commit message                    | 简体中文            |
