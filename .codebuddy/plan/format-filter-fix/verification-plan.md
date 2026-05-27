# Playwright MCP 验证计划

> 测试目标：用 Playwright MCP 真实浏览器自动化验证 R6 验收标准。
> 入口 URL（本地默认）：`http://localhost:3000`（如不通则尝试 3001 / 询问用户）。
> 关键 API 路径：`POST /search_hybrid`（用 `browser_network_requests` + `browser_network_request` 抽查）。

---

## 前置条件

1. dev server 已启动（`cd web && npm start`），或已有运行实例
2. API 后端可访问（避免 401/网络错误污染验证结果）
3. 进入页面后等待首屏加载完成（看到任意搜索结果或浏览模式资产）

如果 dev server 未启动 → 询问用户是否启动；不擅自起服务（避免与用户当前调试环境冲突）。

---

## TC-1：勾选 .usd 应有结果（症状 1 修复）

### 步骤

1. `browser_navigate` → 应用首页
2. `browser_snapshot` 抓取页面 a11y tree，定位"格式"按钮
3. `browser_click` 打开格式 Popover
4. 在"USD 资产"组找到 `.usd` chip 并 click
5. `browser_click` 关闭 Popover（点击空白处或 Esc）
6. `browser_wait_for` 等待结果区刷新（1-2s 或等"loading"消失）
7. `browser_network_requests filter="/search_hybrid"` 抓最新请求
8. `browser_network_request index=N part=request-body` 取请求体

### 断言

- requestBody.file_extension_include 含 `usd`（精确或带 `.`）
- requestBody.file_extension_exclude 不含 `usd`（**核心验收**：冲突已被消解）
- response hits.length > 0
- 至少一条 hit.source.ext ∈ {usd, usda, usdc, usdz}

### 预期失败处理

- 若 hits === 0：`browser_take_screenshot` 存到 screenshots/tc1-failure.png 并把请求体粘贴到 verification-report.md

---

## TC-2：默认排除区不再含 USD（症状 2 修复）

### 步骤

1. `browser_navigate` 重新加载（或刷新）
2. `browser_click` 打开格式 Popover
3. 展开"已排除"折叠区（如默认收起，先点开）
4. `browser_snapshot` 抓 Popover 内容

### 断言

- snapshot 文本中"已排除"区域**不出现** `.usd` `.usda` `.usdc` `.usdz` 任何一项
- 应仅出现 `jpg` `png`（或它们的变体显示）

---

## TC-3：勾选 .png 应有结果（症状 3 修复）

### 步骤

1. 清空 include（点 reset 或手动取消）
2. 打开格式 Popover → 勾选"图片纹理"组的 `.png`
3. 关闭 Popover → 等待结果
4. 抓请求 + 响应

### 断言

- requestBody.file_extension_include 含 `png`
- requestBody.file_extension_exclude **不含** `png`（被任务 3 消解逻辑剔除）
- response hits.length > 0
- 至少一条 hit.source.ext === 'png'

### 数据存在性预检

若发现 hits === 0，先做基线检查：清空 include 浏览模式 → 看默认 hits 中是否本来就有 png 资产；若数据集没有 png 则降级为"请求体正确即通过"。

---

## TC-4：请求体冲突消解审查（症状 4 修复）

依赖 TC-1 已抓的请求体。重点检查：

- include 与 exclude 不再有 `usd*` 系列重叠
- 浏览模式下若 include 非空，exclude 字段干脆不存在（保留旧逻辑）
- 非浏览模式下若 include 与 exclude 有交集，exclude 中已剔除交集项

---

## TC-5：多扩展组合回归

### 步骤

1. 重置后勾选 `.usd + .uasset + .fbx`
2. 抓请求 + 结果

### 断言

- requestBody.file_extension_include 同时含三种 ext
- 三种 ext **各至少一条命中**
- 若数据集中确实缺某种 ext，验证报告中标注并降级为"请求体正确 + 服务端无报错"

---

## 输出物

每个 TC 完成后，往 `verification-report.md` 追加一节：

- 步骤实际操作
- 请求体（关键字段）
- 响应摘要（hits 数 + 前 3 条 ext 分布）
- ✅ / ⚠️ / ❌ 结论

所有 TC 跑完后在报告末尾汇总：

- 通过/失败统计
- 失败截图引用（如有）
- LM CUSTOMIZATION 标记自检命令输出
- lint 命令输出（如可运行）
