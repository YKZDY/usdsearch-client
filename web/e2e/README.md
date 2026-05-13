# E2E 测试 (Playwright)

## 快速开始

```bash
# 1. 安装浏览器（只需执行一次）
npm run e2e:install

# 2. 启动 dev server（另开一个终端）
npm start

# 3. 首次使用：登录认证（弹出浏览器，手动完成 Nucleus Device Flow）
npm run e2e:auth

# 4. 运行 Smoke Test
npm run e2e:smoke
```

## 认证说明

Playwright 使用独立的 Chromium 浏览器，不共享你 Chrome 的登录状态。
所以首次使用（或 Token 过期后）需要运行 `npm run e2e:auth`：

1. 会弹出一个**可见的浏览器窗口**
2. 你在这个窗口里完成 Nucleus Device Flow 认证
3. 认证成功后回到终端按回车
4. 认证状态保存到 `e2e/.auth/storage-state.json`（已 gitignore）
5. 之后所有测试自动复用此状态，直到 Token 过期

## 可用命令

| 命令 | 说明 | 耗时 |
|------|------|------|
| `npm run e2e:auth` | 认证 Setup（弹出浏览器手动登录） | ~1min |
| `npm run e2e:smoke` | 演示前 Smoke Test（6 个核心检查） | ~30s |
| `npm run e2e` | 全量真实后端测试 | ~3-5min |
| `npm run e2e:mock` | Mock 模式测试（无需认证/网络） | ~2min |
| `npm run e2e:visual` | 视觉回归截图对比 | ~2min |
| `npm run e2e:visual:update` | 更新视觉基线截图 | ~2min |
| `npm run e2e:ui` | 打开 Playwright UI 模式（可视化调试） | - |
| `npm run e2e:debug` | 调试模式（弹出浏览器 + 逐步执行） | - |
| `npm run e2e:report` | 查看上次测试的 HTML 报告 | - |

## 日常使用流程

```
每天开始工作：
  npm start                     ← 启动 dev server

演示前快检：
  npm run e2e:smoke             ← 30 秒跑完

开发完一个功能后：
  npm run e2e:smoke             ← 快速验证没搞坏别的

Token 过期了（测试报告里看到认证弹窗）：
  npm run e2e:auth              ← 重新认证一次
```

## 测试架构

```
e2e/
├── .auth/                     ← 认证状态（gitignore，本地生成）
├── fixtures/                  ← 共享 fixtures（错误捕获、测试数据）
├── helpers/                   ← 操作封装（搜索、过滤、选择）
├── tests/                     ← 测试文件（按模块组织）
│   ├── smoke.spec.ts          ← 演示前必过（最重要）
│   ├── m01-search.spec.ts     ← 搜索核心
│   └── ...
├── screenshots/               ← 视觉回归 baseline
└── auth-setup.ts              ← 认证 setup 脚本
```

## 注意事项

- 默认跑的是**真实后端**测试（`live-chromium`），确保 dev server 已启动
- 首次运行或 Token 过期需要 `npm run e2e:auth`
- `npm run e2e:mock` 用 mock 数据，无需网络和认证
- 测试失败时查看 `playwright-report/` 里的截图和录屏
