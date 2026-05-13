/**
 * 基础 test fixture — 自动捕获 console errors
 *
 * 用法：
 *   import { test, expect } from '../fixtures/base';
 *   test('my test', async ({ page, consoleErrors }) => { ... });
 */
import { test as base, expect, Page } from '@playwright/test';

type ConsoleError = {
  text: string;
  url: string;
};

type BaseFixtures = {
  consoleErrors: ConsoleError[];
};

/**
 * 扩展 Playwright test，自动监听 console.error
 * 测试结束后可通过 consoleErrors 获取所有错误
 */
export const test = base.extend<BaseFixtures>({
  consoleErrors: async ({ page }, use) => {
    const errors: ConsoleError[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // 忽略常见的无害错误
        if (text.includes('favicon.ico') || text.includes('manifest.json')) return;
        errors.push({ text, url: page.url() });
      }
    });

    page.on('pageerror', (err) => {
      errors.push({ text: err.message, url: page.url() });
    });

    await use(errors);
  },
});

export { expect };

/**
 * 等待页面加载完成（搜索框可见）
 */
export async function waitForAppReady(page: Page) {
  // 等待搜索输入框出现，说明 React 已渲染完成
  await page.locator('input[type="text"], input[type="search"]').first().waitFor({
    state: 'visible',
    timeout: 15_000,
  });
}
