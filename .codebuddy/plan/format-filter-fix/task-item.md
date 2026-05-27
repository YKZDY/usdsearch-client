# 实施计划 — 格式筛选功能修复

> 工作目录：`d:/period/usdsearch-client/.worktrees/integration-lm-merge-acd/`
> 前置确认：`searchParams` 未持久化到 storage（grep 已确认），需求 5 自动满足，本计划不再单列迁移任务。
> 默认值策略：采用需求 1 的**选项 B**（`file_extension_exclude = "jpg,png"`，保留对纹理图刷屏的防御）。如用户后续要求改 A，仅需调整任务 1 的字符串值。

---

- [ ] 1. 修改全局默认排除列表，移除 USD 系列
  - 编辑 `web/src/config.jsx` 的 `DEFAULT_SEARCH_PARAMS.file_extension_exclude`，由 `"usd,usda,usdc,usdz,jpg,png"` 改为 `"jpg,png"`
  - 该文件为新增/已定制文件，无需 LM CUSTOMIZATION 标记
  - _需求：1.1_

- [ ] 2. 同步 FabToolbar 与 FormatFilter 中硬编码的默认值
  - 修改 `web/src/components/FabToolbar.jsx` 的 `clearFormat` 回调，把硬编码 `'usd,usda,usdc,usdz,jpg,png'` 改为引用 `DEFAULT_SEARCH_PARAMS.file_extension_exclude`
  - 验证 `web/src/components/filters/FormatFilter.jsx` 中 `DEFAULT_EXCLUDE` 已通过 `DEFAULT_SEARCH_PARAMS` 派生（无需改动），并确保"恢复默认"按钮行为同步
  - _需求：1.2、1.3_

- [ ] 3. 在 `HybridDeepSearchUI.jsx` 请求构造处加入 include/exclude 冲突自动消解
  - 在 `requestBody` 完成 spread 后，删除空字段循环之前，新增逻辑：若 `requestBody.file_extension_include` 与 `requestBody.file_extension_exclude` 解析后存在交集，则从 exclude 中剔除交集项；剔除后若 exclude 为空字符串，删除该字段
  - 用 `// === LM CUSTOMIZATION: FormatFilter START === ... END ===` 包裹（含原因 + 合入建议注释）
  - 保持现有"浏览模式 + include 非空 → 删除 exclude"逻辑不动（需求 2.4）
  - _需求：2.1、2.2、2.5_

- [ ] 4. 移除 client 端二次过滤里的 `usd*` 通配符 hack
  - 修改 `HybridDeepSearchUI.jsx` 第 ~2533 行的"扩展名排除"客户端过滤分支，删除 `if (e.startsWith('usd') && (ext === 'uasset' || ext === 'fbx')) return false;` 这一段保护，回归通用通配符语义
  - 整体仍保持在 LM CUSTOMIZATION 块内（与任务 3 同一标记块或独立标记块均可，注释清晰即可）
  - _需求：3.1、3.2、3.3、3.4_

- [ ] 5. 更新 i18n 占位符文案
  - 修改 `web/src/i18n/zh.js`：`includeExtensionsPlaceholder` 改为 `"例如：.uasset, .fbx, .usd"`；`excludeExtensionsPlaceholder` 改为 `"例如：jpg, png, tmp"` 或与默认一致的语义
  - 同步修改 `web/src/i18n/en.js`：英文占位符同样去除 `usd*`，改为中性示例
  - _需求：4.1、4.2、4.3_

- [ ] 6. 创建 Playwright 验证脚本骨架与目录
  - 在 `.codebuddy/plan/format-filter-fix/` 下创建 `screenshots/` 子目录占位
  - 编写 `verification-plan.md` 记录 5 条 TC 的执行步骤、断言条件、预期 request body 与结果集判定
  - _需求：6.1_

- [ ] 7. 执行 Playwright MCP TC-1 与 TC-2（USD 默认与勾选）
  - 启动/连接开发服务器，导航到 web 应用根路径
  - TC-1：勾选 `.usd` → 通过 `browser_network_requests` 抓取 `/search_hybrid`，断言 `hits.length > 0` 且至少一条 ext ∈ {usd,usda,usdc,usdz}
  - TC-2：刷新后打开 FormatFilter，通过 `browser_snapshot` 断言"已排除"区域不含 `.usd*`
  - 失败则保存截图到 screenshots/，记录到 `verification-report.md`
  - _需求：6.1（TC-1、TC-2）、6.2_

- [ ] 8. 执行 Playwright MCP TC-3 与 TC-4（其他扩展 + 请求体审查）
  - TC-3：清空 include → 勾选 `.png` → 抓取请求 + 结果，断言 hit ext === 'png' 至少一条；若数据集中 png 为 0，先用空 include 浏览模式确认数据存在性
  - TC-4：在 TC-1 请求 body 中 assert `file_extension_include` 含 usd，`file_extension_exclude` 不含 usd（或字段不存在）
  - 失败处理同任务 7
  - _需求：6.1（TC-3、TC-4）、6.2_

- [ ] 9. 执行 Playwright MCP TC-5（多扩展组合回归）
  - 同时勾选 `.usd + .uasset + .fbx` → 抓取请求 + 结果
  - 断言三个 ext 各至少一条命中（若数据集中确实缺某种 ext，在 verification-report.md 注明并将判定降级为"请求体正确 + 服务端无报错"）
  - _需求：6.1（TC-5）、6.2_

- [ ] 10. 汇总 `verification-report.md` 并提交
  - 列出 5 条 TC 的请求体快照、响应摘要、通过/失败结论、相关截图引用
  - 校验是否所有改动均含 `LM CUSTOMIZATION: FormatFilter` 标记（用 `grep -rn "LM CUSTOMIZATION: FormatFilter" web/src` 自检）
  - 跑一遍 lint（如 `cd web && npm run lint` 可用）确认无新错误
  - _需求：6.3、范围与不变量、成功判定_
