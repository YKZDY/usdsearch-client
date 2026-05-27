# 多选拖拽体验回归 · 一页纸决策摘要

> 给评审者快速决策用。详情见 [`multiselect-perf-regression-report.md`](./multiselect-perf-regression-report.md)。

## TL;DR

`integration/lm-merge-acd` worktree 的多选拖拽体验之所以**比 lm 主分支差**，**不是因为优化没做**，而是因为：

> **worktree 上 group-a/b 新增功能（CardTagBar、TagPill、AdvancedMatchInfo、AssetDetailsDrawer、SearchSettingsPopover 等）让每张卡片的 DOM 子树膨胀 3-5 倍，把原本在 lm 简单 DOM 下成本可忽略的几个"优化代价"（GPU 合成层暖机、5 属性同步样式写、每帧 querySelectorAll+getBoundingClientRect）放大成了可感知的卡顿。**

`useDragSelect.js` 在两个分支上**字节完全相同**（blob `5002a63`），所以问题不在 hook 代码本身。

## 三个反直觉结论

1. **lm 部署版"流畅"不是因为它没优化**——它和 worktree 用的是**同一份** useDragSelect 代码。它流畅是因为**周边 DOM 简单**。
2. **不能简单"把 worktree 的 multiselect 代码替换回更早的版本"**——因为没有更早的"更好"版本可以替换。
3. **真正的修复方向**是**让"优化"在复杂 DOM 下也保持轻量**，主要是 3 点（按性价比排序）：

   | 修复项 | 预期收益 | 改动量 |
   |---|---|---|
   | 回退 `SelectionModeBar` / `FabToolbar` 的 40-50ms crossfade delay（cbbdd98 部分）→ 解决"卡一下" | **高** | 极小 |
   | `willChange` 从静态改成 `isDragging ? 'transform' : 'auto'`、只保留 transform → 解决合成层常驻 | **中** | 小 |
   | autoScroll loop 缓存 querySelectorAll 结果，批量读 getBoundingClientRect → 解决"反复上下不丝滑" | **中** | 中 |

## 不建议做的事

- ❌ **不要** revert 6 个 perf commit 中的全部——其中 `76e0231` 的 Set 等值短路、`85eca8e` 的 RAF cleanup 修复、`bc4487b` 的 TDZ 修复是**真正正确的优化**，盲目全 revert 会引入新问题。
- ❌ **不要**直接把 lm 部署版部署到生产代替 worktree——lm 缺少 group-a/b 的全部新功能，那是回退一个里程碑的产品功能。
- ❌ **不要**在没有 DevTools Performance 量化数据前直接动代码——可能在错误的方向上花时间。

## 建议的下一步

1. 在 worktree 上跑一次 Chrome DevTools Performance 录制，对比修复前后的 Long Task / Layout 时长，确认主因究竟是 O3 (crossfade delay)、O1 (合成层) 还是 O5 (autoScroll layout 读)
2. 按 §修复项 1 先做最小动作 → 复测 → 再决定是否做 2、3
3. 给"拖拽场景"建立 Performance Budget，避免 group-c/d 后续合并再次放大

## 责任边界

本报告**只读分析**，未改动任何业务代码。所有修复建议需另起 brainstorming + TDD workflow 承接。
