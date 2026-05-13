// @ts-check
import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const isCI = !!process.env.CI;
const isLive = process.env.TEST_PROFILE === 'live';

// 认证状态文件路径（e2e:auth 保存到此处）
const authStatePath = path.join(__dirname, '.auth', 'storage-state.json');
const hasAuthState = fs.existsSync(authStatePath);

/**
 * Playwright 配置
 *
 * 使用流程：
 *   1. npm start                 → 启动 dev server（代理到真实后端）
 *   2. npm run e2e:auth          → 弹出浏览器，手动完成 Nucleus 认证，保存状态
 *   3. npm run e2e:smoke         → 跑 smoke test（自动复用认证状态）
 *   4. npm run e2e               → 跑全量测试
 *
 * Profiles:
 *   - live-chromium:  连接真实后端（默认，需要先 e2e:auth）
 *   - mock-chromium:  使用 Mock API（无需认证）
 *   - visual:         视觉回归截图对比
 */
export default defineConfig({
  testDir: './e2e/tests',

  /* 全局超时 */
  timeout: isLive ? 60_000 : 30_000,
  expect: {
    timeout: 10_000, // Chakra UI 动画需要时间
  },

  /* 并行 & 重试 */
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 2 : 0,

  /* 报告 */
  reporter: isCI
    ? [['github'], ['html', { open: 'never' }]]
    : [['html', { open: 'on-failure' }]],

  /* 全局设置 */
  use: {
    baseURL: 'http://localhost:3000',
    locale: 'zh-CN',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  /* 测试 Projects */
  projects: [
    {
      name: 'live-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        // 复用 e2e:auth 保存的认证状态（localStorage）
        ...(hasAuthState && { storageState: authStatePath }),
      },
      testIgnore: ['**/m08-auth.spec.ts'],
    },
    {
      name: 'mock-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
      testIgnore: ['**/m08-auth.spec.ts'],
    },
    {
      name: 'visual',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        ...(hasAuthState && { storageState: authStatePath }),
      },
      testMatch: ['**/m11-visual.spec.ts'],
    },
  ],

  /* Dev Server — 复用已启动的 dev server */
  webServer: {
    command: 'cross-env BROWSER=none npm start',
    port: 3000,
    timeout: 120_000,
    reuseExistingServer: true, // 始终复用用户已启动的 server
  },
});
