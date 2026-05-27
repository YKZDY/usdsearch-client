# 需求文档 — 格式筛选功能修复（integration-lm-merge-acd）

## 引言

本需求针对 `usdsearch-client` 在 worktree `integration-lm-merge-acd` 分支上的"格式筛选"功能进行 Bug 修复与逻辑优化。

由于业务侧已正式将 USD 系列文件（`.usd` `.usda` `.usdc` `.usdz`）纳入正常资产，原版 NVIDIA 默认设计中"把 USD 系列视为衍生文件并默认排除"的策略已不再适用。当前代码中存在以下 4 个用户可见的故障：

1. 在格式筛选 Popover 中勾选 `.usd`，搜索结果为 0 条；
2. 默认排除列表硬编码了 `usd,usda,usdc,usdz,jpg,png`，与"USD 是合法资产"的新业务定义直接冲突；
3. 即便在"包含扩展名"中输入其他后缀（如 `.png`、`.jpg`），结果仍为 0；
4. 请求体（body）外观看上去正常，但功能依然异常 —— 真正原因是 `include` 与默认 `exclude` 在后端被 AND 求交，互相抵消。

修复目标：让"格式筛选" Popover 与请求构造链路在所有典型场景下都能产出正确的搜索结果，并通过 **Playwright MCP** 端到端验证。

### 范围与不变量

- 仅修改 worktree `integration-lm-merge-acd` 分支
- 所有修改涉及 NVIDIA 原版文件时，遵守 `nvidia-merge-safety.md`：用 `LM CUSTOMIZATION` 块包裹
- 不修改 `usd_search_client/api/` 与 `usd_search_client/models/`（OpenAPI 自动生成）
- 不引入新的 npm 依赖

### 关键事实（用于约束实现）

- 后端 OpenAPI 定义：`file_extension_include` 与 `file_extension_exclude` 是 **AND 关系**，同字段内 `,` 为 OR、`;` 为 AND，支持 `*` `?` 通配符
- `web/src/utils/oversample.js` 中的 `getOversampleFactor` 会根据 `fileExtensionExclude` 的逗号项数动态放大过采样系数；修改默认值会影响该系数

---

## 需求

### 需求 1 — 默认排除列表移除 USD 系列

**用户故事：** 作为 LightArt 内部用户，我希望默认浏览资产时不会被排除掉 `.usd`/`.usda`/`.usdc`/`.usdz`，以便能直接看到我们刚接入的 USD 资产。

#### 验收标准

1. WHEN 用户首次进入页面（未曾设置任何筛选） THEN 全局 `DEFAULT_SEARCH_PARAMS.file_extension_exclude` 中 SHALL NOT 包含 `usd`、`usda`、`usdc`、`usdz` 任一项
2. WHEN 用户点击"格式"筛选区的"恢复默认"按钮 THEN `file_extension_exclude` SHALL 被设置为新的默认值，且仍不包含任何 USD 系列扩展名
3. WHEN 用户点击 FabToolbar 的"清空格式"快捷操作（`clearFormat`） THEN 重置后的 `file_extension_exclude` SHALL 与 `DEFAULT_SEARCH_PARAMS.file_extension_exclude` 完全一致
4. IF 新默认值为空字符串 THEN 系统 SHALL 在请求体中省略 `file_extension_exclude` 字段
5. WHEN 用户清空"包含扩展名"且未自定义"排除扩展名" THEN 浏览模式下后端兜底规则 SHALL 保持不变（仍可使用 `uasset,fbx` 兜底，避免一打开页面就被纹理图刷屏）

> 实现侧选项（最终方案在用户批准后定）：
>
> - 选项 A：默认 `file_extension_exclude = ""`
> - 选项 B：默认 `file_extension_exclude = "jpg,png"`（推荐：保留对纹理刷屏的防御）

### 需求 2 — Include 与 Exclude 冲突自动消解

**用户故事：** 作为用户，当我在 include 中明确选择某个扩展名时，希望它绝不会因为同时出现在 exclude 默认列表中而被静默过滤掉。

#### 验收标准

1. WHEN 构造搜索请求体且 `file_extension_include` 与 `file_extension_exclude` 存在交集 THEN 系统 SHALL 从 `file_extension_exclude` 中移除与 include 重复的所有扩展名后再发送请求
2. WHEN include 与 exclude 的交集移除后 exclude 变为空 THEN 系统 SHALL 不在请求体中携带 `file_extension_exclude` 字段
3. WHEN 用户在 FormatFilter 弹窗中勾选某个 `.usd` 系列扩展名 THEN 顶部摘要条 SHALL 显示"⚠ 冲突：.usd 同时被包含与排除"提示（已存在的 conflictExts 逻辑），且实际请求 SHALL 已自动消解该冲突
4. WHEN 浏览模式（无 query 无 image）且 include 非空 THEN 系统 SHALL 维持现有"删除 exclude 避免冲突"的行为不变（`HybridDeepSearchUI.jsx:2432`）
5. IF 修改是发生在 NVIDIA 原版文件 `HybridDeepSearchUI.jsx` 内 THEN 修改 SHALL 用 `LM CUSTOMIZATION: FormatFilter` 标记块包裹

### 需求 3 — Client 端二次过滤的 USD 通配符特殊保护需重审

**用户故事：** 作为用户，我希望 client 端二次过滤行为与新业务语义（USD 是主资产）一致，不会再出现"勾选 .usd 但被通配符兜底逻辑误杀"。

#### 验收标准

1. WHEN client 端二次过滤执行 `exclude` 通配符匹配（`HybridDeepSearchUI.jsx:2533` 段） THEN 系统 SHALL NOT 再使用 `e.startsWith('usd') && (ext === 'uasset' || ext === 'fbx')` 这种针对 `usd*` 的 hack 保护
2. WHEN 用户显式 include `.uasset` 或 `.fbx` 且 exclude 含 `usd*` 通配符 THEN 通用的"include 优先于 exclude"消解（需求 2）SHALL 保证 uasset/fbx 不会被误杀，无需特殊 hack
3. WHEN 用户在 exclude 中输入 `usd*` 通配符（高级场景） THEN 系统 SHALL 按字面通配符语义工作，匹配所有以 `usd` 开头的扩展名
4. IF 修改涉及 NVIDIA 原版文件 THEN SHALL 用 `LM CUSTOMIZATION: FormatFilter` 标记包裹

### 需求 4 — Placeholder 文案与默认值一致

**用户故事：** 作为用户，我希望 UI 提示的"包含/排除扩展名"占位符与项目当前的默认行为保持一致，不会引导我去做"已经默认排除掉的事"。

#### 验收标准

1. WHEN 用户查看"包含扩展名" Input 的 placeholder THEN 中英文占位符 SHALL 不再以 `usd*` 作为示例（改为更中性的 `.uasset, .fbx, .png` 等）
2. WHEN 用户查看"排除扩展名" Input 的 placeholder THEN 中英文占位符 SHALL 与新默认值的语义保持一致
3. WHEN 用户切换中英文 THEN 中英文 i18n key 的占位符 SHALL 同时更新（`web/src/i18n/zh.js` 与 `web/src/i18n/en.js` 双侧）

### 需求 5 — 兼容老用户的 localStorage 历史值

**用户故事：** 作为已经使用过本工具的老用户，我打开页面时不希望被遗留在 localStorage / sessionStorage 中的旧默认 `usd,usda,usdc,usdz,jpg,png` 卡死。

#### 验收标准

1. WHEN 应用启动且检测到 `searchParams.file_extension_exclude` 等于旧硬编码默认值 `"usd,usda,usdc,usdz,jpg,png"` THEN 系统 SHALL 自动迁移为新的默认值
2. WHEN 迁移发生 THEN 系统 SHALL NOT 影响用户自定义过的非默认值（仅当完全等于旧默认时才迁移）
3. IF 项目当前没有持久化 searchParams 到 storage（仅内存态） THEN 本需求只需在页面刷新场景下满足"新默认生效"即可，无需额外迁移逻辑

> 备注：调研阶段需先确认 `searchParams` 是否有持久化。如未持久化，需求 5 自动满足，无需额外代码。

### 需求 6 — Playwright MCP 端到端验证

**用户故事：** 作为开发者，我希望本次修复能用 Playwright MCP 的真实浏览器自动化验证，而非仅依赖手工点击或 console 推理。

#### 验收标准

1. WHEN 修复完成 THEN SHALL 使用 Playwright MCP 启动开发服务器（或连接已运行实例）并完成下列验证序列：
   - **TC-1（症状 1）**：默认状态下，打开"格式"Popover → 在"USD 资产"组勾选 `.usd` → 关闭 Popover → 等待结果 → 断言：返回结果 > 0 条 且 至少一条结果的 ext 命中 usd 系列
   - **TC-2（症状 2）**：刷新页面 → 打开"格式"Popover → 在"已排除"区域 SHALL NOT 看到 `.usd / .usda / .usdc / .usdz`（默认不再排除 USD）
   - **TC-3（症状 3）**：清空 include → 在"图片纹理"组勾选 `.png` → 等待结果 → 断言：返回结果 > 0 条 且 至少一条结果 ext === 'png'
   - **TC-4（症状 4 / 请求体审查）**：在 TC-1 的请求中，使用 Playwright `browser_network_request` 检查 `/search_hybrid` 的 request body：`file_extension_include` 含 `usd`，且 `file_extension_exclude` 不含 `usd`（或不存在）
   - **TC-5（回归）**：勾选多个组合（`.usd + .uasset + .fbx`）→ 断言每个 ext 都至少有一条命中
2. WHEN 任一 TC 失败 THEN SHALL 截图保存到 `.codebuddy/plan/format-filter-fix/screenshots/` 并将错误日志整理回报
3. WHEN 所有 TC 通过 THEN SHALL 生成一份 `verification-report.md` 列出每个 TC 的请求/响应快照

---

## 边界与风险

| #   | 风险                                                                                   | 缓解                                                             |
| --- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | 后端某些 ext 实际没有数据，"搜不到"不一定是前端 bug                                    | TC-3 在测试前先用空 include 浏览模式确认数据集中 `.png` 是否存在 |
| 2   | `getOversampleFactor` 依赖 exclude 项数，改默认值可能导致过采样系数下降 → 结果数量减少 | 在需求 1 实现后回归 limit 行为；如必要在 oversample.js 设保底    |
| 3   | NVIDIA 合入冲突                                                                        | 所有原版文件改动用 `LM CUSTOMIZATION: FormatFilter` 标记         |
| 4   | 旧记忆 chip 中可能还有"usd\*"组合，点击后照旧异常                                      | 修复 `handleMemoryTag` 路径走需求 2 的消解逻辑即可解决           |

## 成功判定

- 4 个用户提报的症状全部消失
- Playwright MCP 6 条 TC 全部通过
- 所有改动有 `LM CUSTOMIZATION` 标记
- 不引入新 lint 错误
- 中英文 i18n 同步
