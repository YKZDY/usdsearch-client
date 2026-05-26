# SSO 登录侦察 + 同域 Token 写回重设计

> 本目录是「SSO 登录方向纠偏」的侦察记录与设计产出集合。
> 计划源文件：`.codebuddy/plan/sso-login-recon-redesign/{requirements,task-item}.md`
> 当前阶段：**第一/二阶段（侦察 + 设计）**，不涉及业务代码改动。

---

## 背景速览

`market.lightart-dev.woa.com/?server=nucleus` 当前 SSO 登录卡在「弹窗不自动关闭，用户必须手动复制 token」。

光哥在两次会议中明确指出：

1. **方向曾错** — demo 站（`lightart-dev.woa.com/usdsearch`）和 market 站后端**不是同一套**：demo 走 Nucleus Auth + Light Up 新架构，market 仍走 ov.qq.com 旧体系；不能简单照抄前端跳转代码
2. **真正根因是跨域** — `ov.qq.com` 设的 cookie / `localStorage` 无法被 `market.lightart-dev.woa.com` 读取
3. **正确方向** — 让 SAML callback 回到**同域**地址（`market.lightart-dev.woa.com/omni/auth/login/sso/...`），由前端 JS 接管响应、写入 token

本目录就是为了**用 Playwright 录制的网络事实**取代猜测，再据此重设计方案。

---

## 文档清单与阅读顺序

| #   | 文档                                                                       | 用途                                                                         | 状态    |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------- |
| 0   | [README.md](./README.md)                                                   | 本文，导读与脱敏约定                                                         | ✅ 完成 |
| 1   | [playwright-recipe.md](./playwright-recipe.md)                             | Playwright MCP 标准操作手册（侦察前先读）                                    | ✅ 完成 |
| 2   | [demo-success-trace.md](./demo-success-trace.md)                           | demo 站首次成功登录链路（基线，含 § 9 修订）                                 | ✅ 完成 |
| 3   | [market-failure-trace.md](./market-failure-trace.md)                       | market 站登录链路实测（含 § 9 修订）                                         | ✅ 完成 |
| 4   | [relogin-comparison-trace.md](./relogin-comparison-trace.md)               | 复登录态对比（含 § 6 修订）                                                  | ✅ 完成 |
| 5   | [diff-analysis.md](./diff-analysis.md)                                     | **决策核心**：事实对比 + 根因 + 方案 A                                       | ✅ 完成 |
| 6   | [plan-A-spec.md](./plan-A-spec.md)                                         | 双轨实施规格（B 短期 UX + A1 中期 IOA）                                      | ✅ 完成 |
| 7   | [risk-rollback.md](./risk-rollback.md)                                     | 风险登记 + Tag 验收清单 + 回滚预案                                           | ✅ 完成 |
| —   | [saml-api-400-trace.md](./saml-api-400-trace.md)                           | ⚠️ **反编译参考（已降级）** — 不是当前 bug 修复入口，仅作 main.js 反编译留档 | 历史    |
| —   | [base-href-experiment.md](./base-href-experiment.md)                       | ⚠️ 同上，base href DevTools 实验剧本                                         | 历史    |
| —   | [saml-400-plan-D-monkey-patch.md](./saml-400-plan-D-monkey-patch.md)       | ⚠️ 同上，前端 monkey-patch `Gs` 调度器实测脚本                               | 历史    |
| —   | [market-deviceflow-success-trace.md](./market-deviceflow-success-trace.md) | 当前 Device Flow 跑通的完整证据（业务接口 200 + Tag 200）                    | ✅ 完成 |

**推荐阅读顺序**：1 → 2 → 3 → 4 → 5 → 6 → 7。

> ⚠️ 表格末尾标 "历史" 的 3 份（saml-api-400-trace / base-href-experiment / saml-400-plan-D-monkey-patch）属于早期"把 SAML POST 400 当作当前线上 bug 在修"路径下的反编译产物。当前业务方真正的痛点是 **Device Flow UX 烂**（光哥反馈），不是 SAML 400 撞墙；调研结论已收敛到 [`diff-analysis.md`](./diff-analysis.md) + [`plan-A-spec.md`](./plan-A-spec.md) 的双轨方案，**不要再把 saml-api-400-trace 当成当前需要立即修复的 bug 根因**。

如果你只想**最快了解结论**：直接看 [`diff-analysis.md` § 0 TL;DR](./diff-analysis.md) + [`plan-A-spec.md` § 0 双轨总览](./plan-A-spec.md) + [`risk-rollback.md` § 2 Tag 验收清单](./risk-rollback.md)。

---

## 关键结论速览（5 条）

1. **Device Flow 一直能跑通**，业务方让改的真因是“用户要复制 8 位码 + 跨域跳 ov.qq.com” UX 难看，而非登录失败
2. demo 站与 market 站的**业务接口认证**统一靠 `Basic btoa("$omni-api-token:" + 永久 API Token)`，**与 cookie 无关**
3. 永久 API Token 由 [`createApiToken()`](../../web/src/nucleus.jsx) 生成，**Tag 功能 100% 依赖** `localStorage.<host>_nucleus_access_token`
4. IOA SAML 弹窗路径**只写 cookie 不写 localStorage**，当前后端未对齐 demo 站 → 前端拿不到 access_token 去调 createApiToken
5. **双轨提案**：
   - 轨道 B（短期、零后端依赖）：Device Flow UX 优化，自动复制 + 自动开窗，用户从 5 步降到 2 步
   - 轨道 A1（中期、需运维 + 后端配合）：IOA SAML 弹窗 + 后端在 SAML callback 写 `omni_access_token` 到 localStorage，前端轮询 + createApiToken

> 两轨互不阻塞，B 立即可发布，A1 可后续平滑切换。

---

## 脱敏约定（强制）

录制过程会经过太湖 SAML，响应里包含真实工号、邮箱、签名、token 等敏感信息。所有写入本目录的文档**必须**遵守以下脱敏规则：

| 字段                                            | 脱敏方式                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------- |
| 工号 / RTX 名（如 `bybluewang`）                | `<REDACTED_UID>`                                                              |
| 邮箱（如 `xxx@tencent.com`）                    | `<REDACTED_EMAIL>`                                                            |
| 中文姓名（如 `王博扬`）                         | `<REDACTED_NAME>`                                                             |
| `omni_access_token` / `nucleus_access_token` 值 | `<REDACTED_TOKEN length=N>`（保留长度信息辅助判断格式）                       |
| Cookie 值                                       | `<REDACTED_COOKIE>`（保留 key 名称、Domain、Path、SameSite、Secure 等元数据） |
| SAML Response Base64（`?saml=eyJ...`）          | `<REDACTED_SAML_BASE64 length=N>`（保留长度，必要时仅摘录解析后的关键字段名） |
| 内部签名证书 / 私钥                             | 一律不抄录，注明「原文含 X.509 证书，已省略」                                 |
| IP 地址（含办公网段）                           | `<REDACTED_IP>`                                                               |

**追加规则**：

1. 真实 token 与 cookie 值**绝对不入 git**；如必须保留长字符串供调试，落到 `.gitignore` 范围外的本地暂存文件
2. 仅摘录 **header 名称 + 长度 + 关键属性**（如 `Domain`/`SameSite`），不抄完整字符串
3. URL 中的 query 参数若包含 token / saml，必须替换为 `?<param>=<REDACTED>`，但保留参数名以便对比
4. 截图保存前裁剪 / 涂抹姓名、邮箱、工号显示区域

---

## 安全与合规

1. SAML Response 含个人身份信息（uid、邮箱、cn、affiliation 等），**禁止原样抄录到 markdown**
2. 录制产生的 `.har` / 临时网络日志若需要分享，必须先经过脱敏脚本处理（见 `playwright-recipe.md` 末尾）
3. 本目录所有文档以**事实 + 推断**两段式书写：事实段必须可被 Playwright 记录复现，推断段需明确标注「假设」

---

## 范围声明

- ✅ 本目录产出**仅文档**，不修改任何业务代码
- ✅ 不修改 NVIDIA 原版文件，不会影响未来 `git merge upstream`
- ❌ 不包含 nginx 实际部署、后端透传 header 实际开发、前端弹窗实际实现 —— 这些是后续阶段的事
- ❌ 不会自动跑 SSO（涉及扫脸/授权点击），所有交互步骤由人工在浏览器手动完成

---

## 当前进度

| 阶段       | 任务                                      | 状态    |
| ---------- | ----------------------------------------- | ------- |
| 侦察准备   | 任务 1：目录与索引（本文）                | ✅ 完成 |
| 侦察准备   | 任务 2：操作手册                          | ✅ 完成 |
| 侦察执行   | 任务 3：demo 站首次登录录制               | ✅ 完成 |
| 侦察执行   | 任务 4：market 站登录链路实测             | ✅ 完成 |
| 侦察执行   | 任务 5：复登录态对比                      | ✅ 完成 |
| 分析与设计 | 任务 6：差异分析（diff-analysis.md）      | ✅ 完成 |
| 分析与设计 | 任务 7：方案 A 实施规格（plan-A-spec.md） | ✅ 完成 |
| 分析与设计 | 任务 8：风险与回滚（risk-rollback.md）    | ✅ 完成 |
| 交付       | 任务 9：README 索引更新                   | ✅ 完成 |
| 下一步     | 进入实现阶段（轨道 B 立即可做）           | ⏳ 待办 |

> 文档阶段已交付完毕。进入代码实现阶段前，请先确认 [`plan-A-spec.md` § 1.2 改动清单](./plan-A-spec.md) 与红线约束。
> | 侦察准备 | 任务 2：操作手册 | ✅ 完成 |
> | 侦察执行 | 任务 3：demo 站首次登录录制 | ✅ 完成 |
> | 侦察执行 | 任务 4：market 站登录链路实测 | ✅ 完成 |
> | 侦察执行 | 任务 5：复登录态对比 | ✅ 完成 |
> | 分析与设计 | 任务 6：差异分析（diff-analysis.md） | ✅ 完成 |
> | 分析与设计 | 任务 7：方案 A 实施规格（plan-A-spec.md） | ✅ 完成 |
> | 分析与设计 | 任务 8：风险与回滚（risk-rollback.md） | ✅ 完成 |
> | 交付 | 任务 9：README 索引更新 | ✅ 完成 |
> | 下一步 | 进入实现阶段（轨道 B 立即可做） | ⏳ 待办 |

> 文档阶段已交付完毕。进入代码实现阶段前，请先确认 [`plan-A-spec.md` § 1.2 改动清单](./plan-A-spec.md) 与红线约束。
