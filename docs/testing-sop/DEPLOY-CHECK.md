# 部署后专项检查 (DEPLOY-CHECK)

> **用途**：每次从本地 dev 部署到生产环境后必须执行。覆盖本地→线上的差异点。
> **预计耗时**：~20 分钟
> **关键**：使用隐私模式浏览器，排除本地缓存干扰

---

## 前置条件

- [ ] 部署完成，线上可访问
- [ ] 使用隐私模式（Chrome: Ctrl+Shift+N）
- [ ] 确认不是本地 dev 环境（地址栏非 localhost）
- [ ] 准备好测试账号（用户名/密码）

---

## 1. 环境变量 & 配置

- [ ] 页面加载正常（不白屏）
- [ ] 控制台无 `Failed to parse SERVER_MAPPING` 错误
- [ ] 控制台无 `REACT_APP_*` 相关的 undefined 错误
- [ ] 右上角能正常显示服务器信息（SERVER_MAPPING 生效）
- [ ] 确认 REACT_APP_API_URL 指向正确后端

---

## 2. 认证链路

- [ ] 首次访问（无缓存）→ 提示用户登录（非直接搜索无结果无提示）
- [ ] Basic Auth 输入凭据 → 认证成功
- [ ] 认证后 x-usdsearch-storage-backend header 正确携带
- [ ] Token 存入 localStorage → 刷新后仍保持登录

---

## 3. 标签系统（历史重灾区）

> 标签功能依赖 wss 连接，本地 dev → 部署后最容易翻车

- [ ] wss:// 连接建立成功（控制台无 WebSocket 错误）
- [ ] 打开资产详情 → 添加标签 → **成功**（非静默失败）
- [ ] 删除标签 → **成功**
- [ ] 换一台设备/浏览器访问 → 标签变更已同步（非本地缓存假象）
- [ ] TagsFilter 能加载到标签列表（globalTags 请求成功）
- [ ] resolveNucleusHost 解析正确（不是把 "omniverse" 当 host 用）

---

## 4. API 连通性

- [ ] 搜索请求 POST /search_hybrid 返回 200
- [ ] 图片请求 GET /image?url=... 返回图片数据
- [ ] 无 CORS 错误
- [ ] 无 Mixed Content 警告（HTTPS 页面不调用 HTTP API）
- [ ] 代理/反向代理路径映射正确

---

## 5. 静态资源

- [ ] logo 正常加载（非 broken image）
- [ ] 字体加载正常
- [ ] CSS 无丢失（深色主题 + 金色强调色正确渲染）
- [ ] 图标 SVG 正常显示

---

## 6. 功能快检

- [ ] 搜索"建筑" → 有结果 → 缩略图加载
- [ ] 分类侧边栏点击 → 过滤生效
- [ ] 目录树在登录后加载（非空白）
- [ ] 视图切换 Grid/List 正常

---

## 常见部署翻车原因 & 排查

| 现象 | 可能原因 | 排查方法 |
|------|---------|---------|
| 页面白屏 | 环境变量未注入 / build 产物过旧 | 检查 page source 中 `%REACT_APP_*%` 是否被替换 |
| Tag 静默失败 | SERVER_MAPPING 为 `{}` → host 解析成别名字符串 | 控制台搜 `resolveNucleusHost` 返回值 |
| 图片不加载 | 认证 header 未携带 / 代理路径错误 | Network tab 检查 /image 请求 status |
| wss 连接失败 | 代理不支持 WebSocket / SSL 证书问题 | 控制台搜 `WebSocket` 错误 |
| 本地正常线上坏 | 本地有 localStorage 缓存（认证/标签）| 用隐私模式复现 |
| 认证后仍无权限 | storage-backend header 值错误 | Network tab 检查请求 headers |

---

## 不通过处理

1. **标签相关问题** → 优先检查 SERVER_MAPPING 和 wss 连接
2. **白屏** → 检查 build 产物中环境变量注入
3. **API 调用失败** → 检查反向代理配置
4. 记录问题到 KNOWN-PITFALLS.md，通知相关方
