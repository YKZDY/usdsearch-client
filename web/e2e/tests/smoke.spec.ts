/**
 * Smoke Tests — 对应 DEMO-SMOKE.md
 *
 * 演示前必过的 6 个核心检查点。
 * 全部通过 = 可以放心演示。
 *
 * 交互逻辑（基于源码确认）：
 *   - 单击卡片 = 选中（多选模式）
 *   - 双击卡片 = 打开详情弹窗
 *   - 视图切换在 "Display settings" 齿轮按钮的 Popover 里
 *   - 卡片用 data-card-index 属性定位
 *
 * 前提条件：
 *   1. dev server 已启动 (npm start)
 *   2. 已运行 npm run e2e:auth 完成认证
 *
 * 运行: npm run e2e:smoke
 */
import { test, expect, waitForAppReady } from '../fixtures/base';
import { doSearch, waitForResults, dismissAuthModal } from '../helpers/search';
import { expectNoConsoleErrors } from '../helpers/assertions';

test.describe('Smoke Tests (DEMO-SMOKE)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await dismissAuthModal(page);
  });

  test('S1: 页面加载无 JS Error', async ({ page, consoleErrors }) => {
    await page.waitForTimeout(3000);
    expectNoConsoleErrors(consoleErrors);
  });

  test('S2: 搜索返回结果', async ({ page }) => {
    await doSearch(page, 'building');
    // 确认有搜索结果（标题显示"找到 X 个结果"）
    await expect(
      page.getByRole('heading', { level: 2 }).filter({ hasText: /找到.*\d+.*结果|results/i })
    ).toBeVisible({ timeout: 10_000 });
  });

  test('S3: 缩略图正常渲染（非空白/破碎）', async ({ page }) => {
    await doSearch(page, 'building');
    await waitForResults(page);

    // 用 data-card-index 精确定位第一张结果卡片的缩略图
    const img = page.locator('[data-card-index="0"] img[alt="Asset thumbnail"]').first();
    await expect(img).toBeVisible({ timeout: 10_000 });

    // naturalWidth > 0 表示图片实际加载成功
    const naturalWidth = await img.evaluate(
      (el: HTMLImageElement) => el.naturalWidth
    );
    expect(naturalWidth).toBeGreaterThan(0);
  });

  test('S4: 双击卡片打开详情弹窗', async ({ page }) => {
    await doSearch(page, 'building');
    await waitForResults(page);
    await page.waitForTimeout(1000);

    // 双击第一张卡片 → 打开详情（单击是多选，双击才是详情）
    const firstCard = page.locator('[data-card-index="0"]').first();
    await firstCard.dblclick();

    // Chakra UI Modal 使用 role="dialog"
    await expect(
      page.getByRole('dialog')
    ).toBeVisible({ timeout: 8_000 });
  });

  test('S5: Grid/List 视图切换正常', async ({ page }) => {
    await doSearch(page, 'building');
    await waitForResults(page);

    // 点击 "Display settings" 齿轮按钮打开设置 Popover
    const settingsBtn = page.locator('button[aria-label="Display settings"]');
    await settingsBtn.click();
    await page.waitForTimeout(500);

    // 点击 "List view" 按钮切换到列表视图
    const listViewBtn = page.locator('button[aria-label="List view"]');
    await listViewBtn.click();
    await page.waitForTimeout(800);

    // 切换后页面不白屏 — 仍有结果可见
    await expect(
      page.locator('[data-card-index="0"]')
    ).toBeVisible({ timeout: 5_000 });

    // 切回 Grid 视图
    const gridViewBtn = page.locator('button[aria-label="Grid view"]');
    if (await gridViewBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await gridViewBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test('S6: 全流程无 console error', async ({ page, consoleErrors }) => {
    // 搜索
    await doSearch(page, 'building');
    await waitForResults(page);
    await page.waitForTimeout(1000);

    // 双击打开详情弹窗
    const firstCard = page.locator('[data-card-index="0"]').first();
    await firstCard.dblclick();
    await page.waitForTimeout(2000);

    // 关闭弹窗（Chakra ModalCloseButton）
    const closeBtn = page.locator('button[aria-label="Close"]').first();
    if (await closeBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await closeBtn.click();
    }
    await page.waitForTimeout(1000);

    // 断言全程无 error
    expectNoConsoleErrors(consoleErrors);
  });
});
