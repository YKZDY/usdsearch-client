# 风险登记 + Tag 功能验收清单 + 回滚预案

> **写作时间**：2026-05-15
> **配套文档**：[diff-analysis.md](./diff-analysis.md) / [plan-A-spec.md](./plan-A-spec.md)
> **核心红线**：Tag 功能 100% 不能挂

---

## 1. 风险登记表

### 1.1 高风险（必须有兜底）

| #      | 风险                                                                                  | 触发场景                            | 影响                              | 兜底/缓解                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **R1** | 改动 Device Flow UI 时不慎波及 [`createApiToken`](../../web/src/nucleus.jsx) 调用入参 | 重构时手抖                          | 🔴 Tag 功能立即全挂               | ① 改动严格限制在 UI/clipboard 层 ② Tag 功能验收清单（§ 2）每次改完跑 ③ 用 git diff 双重检查 nucleus.jsx 和 authStorage.js 0 改动 |
| **R2** | A1 的后端 SAML callback 写 localStorage 涉及多服务（lightart-dev / market 不同后端）  | 运维只在 demo 站改了，market 站漏改 | 🔴 A1 路径完全失效                | ① 联调阶段实地用 Playwright 录两站 callback 响应对比 ② 前端轮询超时降级到 B 路径                                                 |
| **R3** | 浏览器拒绝 `navigator.clipboard.writeText` 静默失败                                   | HTTPS 但用户拒绝权限 / iframe 限制  | 🟡 用户感受不到自动复制，等同现状 | ① 调用包 try/catch + Toast 提示 ② 保留"手动复制"按钮                                                                             |
| **R4** | A1 弹窗被现代浏览器拦截                                                               | 非用户手势触发 / 严格隐私模式       | 🔴 A1 路径无法启动                | ① 弹窗一定要在 onClick 同步路径里调用 ② 拦截后 Toast 引导用户允许，并提供"手动打开"按钮（同 R3）                                 |
| **R5** | NVIDIA 上游 `nucleus.jsx` 升级修改了 createApiToken API 签名                          | 未来合并 upstream                   | 🟡 编译时报错可发现               | ① 依赖严格锁定 ② 所有 LM 标记块写清依赖项 ③ 写一个最小自测脚本固化期望签名                                                       |

### 1.2 中风险（监控即可）

| #   | 风险                                                                                         | 缓解                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| R6  | `omni_access_token` 与 `<host>_nucleus_access_token` 过期不同步                              | 沿用现有 [`authStorage.js nucleusAccessTokenExpiry`](../../web/src/utils/authStorage.js) 过期检查；过期后强制重登        |
| R7  | 用户多账号切换                                                                               | 退出登录时清掉 3 层 key（沿用现有 logout 逻辑）                                                                          |
| R8  | 移动端 Safari `window.open` + `localStorage` 行为差异                                        | 暂不在主目标用户群内，作为已知限制；A1 路径在 Safari 上做降级回 B                                                        |
| R9  | SAML Response 仍残留 ov.qq.com 字段（[market-failure-trace § 3](./market-failure-trace.md)） | 当前 NVIDIA Auth SP 放宽 Recipient 校验所以可用；未来 NVIDIA 收紧时立即失效 → 推动后端注册 market 域到太湖 SAML Audience |

### 1.3 低风险（已知，可忽略）

| #   | 描述                                                     |
| --- | -------------------------------------------------------- |
| L1  | `ov.qq.com/healthcheck → 426` 噪音不影响功能，可顺手清掉 |
| L2  | i18n 中英文长度差异（IOA 按钮等）做一次手动检查即可      |

---

## 2. Tag 功能验收清单（每次改完必跑）

> **任何分支提 PR 前，下面 12 条全 ✅ 才算通过**。任何一条 ❌ 立即停手回滚。

### 2.1 Storage 层（不需要 UI 操作）

```js
// 浏览器 console 跑
const host = location.host; // 或当前 server
const tokens = {
  hostScoped: localStorage.getItem(`${host}_nucleus_access_token`),
  bare: localStorage.getItem("nucleus_access_token"),
  expiry: localStorage.getItem(`${host}_nucleus_access_token_expiry`),
};
console.table(tokens);
```

- [ ] `hostScoped` 有值，是 JWT 格式（3 段 base64，以 `eyJ` 开头）
- [ ] JWT decode 后 `exp` 距今 > 7 天（永久 API Token 标志）
- [ ] `expiry` 有值，与 JWT exp 一致

### 2.2 网络层（拦截一次业务请求看 header）

- [ ] DevTools Network 找到 `/search_hybrid` 请求
- [ ] `Authorization` header 存在且以 `Basic ` 开头
- [ ] base64 decode 后是 `$omni-api-token:<永久 token>`
- [ ] 响应 status 200

### 2.3 Tag UI 层（跑这些场景）

- [ ] 打开任意资产 → `EditableTagsPanel` 显示"当前无错误"或"权限正常"，**不**显示"重新登录 Nucleus（DeviceFlow）"
- [ ] `BatchTagModal` 打开 → 能列出全局 tags 列表
- [ ] 选 1+ 个资产 → 加 tag → 保存成功，列表刷新出现新 tag
- [ ] 选 1+ 个资产 → 删 tag → 保存成功，列表刷新少了那个 tag
- [ ] `useGlobalTags` 全局 tag 输入下拉 → 能搜索 / 能选中
- [ ] 退出登录 → 重新登录 → 上述 5 项再跑一次（防止 token 不刷新）

---

## 3. 回滚预案

### 3.1 轨道 B 回滚

> Device Flow UX 优化只动 UI 层，回滚极简。

```bash
# 直接 revert 最近一次提交
git log --oneline | head -5
git revert <commit-sha>
git push
```

如果 PR 还没合：直接关 PR + 在分支上 reset。

### 3.2 轨道 A1 回滚

> 涉及登录入口切换，回滚需先关闭"用 IOA SSO 登录"按钮。

#### 紧急（用户已经发现登不上）

1. 进 [`index.js`](../../web/src/index.js) 找 `LM CUSTOMIZATION: SSO IOA Login Path START / END`
2. 把整个块注释掉（不删除，便于事后排查）
3. 用户立即看到只剩"从 Nucleus 获取令牌"按钮（B 路径），等同上线前
4. Toast 提示用户"SSO 临时不可用，已切回兜底登录"
5. 5 分钟内可发 hotfix

#### 非紧急

- 走标准 revert 流程，与 B 一致

### 3.3 后端 A1 改动回滚

> 如果后端在 SAML callback 写 localStorage 后引发问题。

1. 后端撤回 callback 响应里的 JS 注入
2. 前端 A1 路径会自动超时降级到 B 路径（plan-A-spec § 2.6 已设计）
3. 无需前端立即跟进

---

## 4. 监控与告警建议

### 4.1 前端埋点（沿用现有 Aegis）

- 登录入口点击事件（区分 IOA vs Device Flow）
- `createApiToken` 成功率
- `omni_access_token` 轮询命中率（A1 健康度核心指标）
- `<host>_nucleus_access_token` 写入成功率
- Tag UI 显示"权限错误"频率

### 4.2 阈值告警

| 指标                    | 阈值       | 含义                            |
| ----------------------- | ---------- | ------------------------------- |
| `createApiToken` 成功率 | < 95%      | Tag 链断了                      |
| A1 轮询命中率           | < 80%      | 后端 callback 没写 localStorage |
| Tag UI "权限错误"       | 分钟级 > 0 | 立即排查 token 链               |

---

## 5. 相关知识沉淀

- 本次踩坑：**误以为 demo 站 cookie 路径可以照抄到 market 站**，实际 market 业务接口完全不依赖 cookie
- 永久建议：**项目代码里用 `LM CUSTOMIZATION` 标记的所有登录路径都应有 README 说明依赖链**
- 经验教训：先用 Playwright + DevTools 录真实数据再设计，比基于假设设计快 10 倍
