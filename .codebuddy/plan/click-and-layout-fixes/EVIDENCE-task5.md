## 实测证据（2026-05-25，分支 integration/lm-merge-acd）

通过 Playwright MCP 实测当前布局表现，**未发现需要修改的视觉问题**：

### 测试环境

- 视口：1440 × 900
- localhost:3000，server=nucleus
- 内容容器宽度：1088px（左侧栏展开）

### 实测数据对比

| limit | cardCount | cardWidth | cardHeight | containerWidth | 列数 |
| ----- | --------- | --------- | ---------- | -------------- | ---- |
| 50    | 50        | 350px     | 363.45px   | 1088px         | 3    |
| 100   | 78        | 350px     | 360px      | 1088px         | 3    |

### 截图对比

- `d:/period/limit-50-current.png`
- `d:/period/limit-100-current.png`

两张截图视觉表现：

- ✅ 卡片宽度完全一致（350px × 3 列充满 1088px 容器）
- ✅ 卡片高度差仅 3.45px（limit=50 时 absolute 容器允许小溢出，limit=100 时严格 360）
- ✅ 第一行卡片从相同 Y 坐标起始
- ✅ 第二行卡片从相同 Y 坐标起始
- ✅ 标题/作者/标签栏/大小/修改时间/底部按钮全部正确显示

### 结论

用户在上一轮反馈"limit > 50 时有莫名其妙的宽度 / 黑色区域大"——**最新代码已经修复**：

- `VirtualizedResults.jsx` 第 144 行 `actualColWidth = (availableWidth - (cols-1)*gap) / cols` 已实现充满列宽
- `VirtualizedHybridSearchResults.jsx` 第 1257 行 `itemHeight={gridSize === 'S' ? 200 : 360}` 已修复底部内容挤压
- `itemWidth = 280` 仅作为"最小列宽阈值"决定列数，不影响实际渲染宽度

### 决策

按照"evidence-before-assertions"原则，本任务（Task 5）**不修改代码**。
盲改可能引入新问题（违反项目规则"不要总出现之前功能正常 AI 改了之后又异常"）。

如未来用户在不同浏览器/视口/侧边栏状态下再次复现问题，再做针对性修复。
