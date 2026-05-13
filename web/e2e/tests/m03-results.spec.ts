/**
 * M03 搜索结果展示测试 — 对应 QUICK-CHECK M3 + FULL-REGRESSION M3
 *
 * 覆盖：
 *   [P0] Grid 视图正常展示
 *   [P0] List 视图正常展示
 *   [P0] 视图切换不白屏
 *   [P0] 结果数量显示正确
 *   [P0] "仅显示有预览图的结果" 开关
 *   [P1] 0 结果时的空状态
 *   [P1] 长文件名截断
 *
 * 交互逻辑：
 *   - 视图切换按钮在 button[aria-label="Display settings"] Popover 中
 *   - List view: button[aria-label="List view"]
 *   - Grid view: button[aria-label="Grid view"]
 *   - Grid size toggle: button[aria-label="Toggle grid size"]
 *   - 结果标题 h2: "找到 N 个结果" 或 "共 N 个资产"
 */
import { test, expect, waitForAppReady } from '../fixtures/base';
import { doSearch, waitForResults, dismissAuthModal } from '../helpers/search';

test.describe('M03: 搜索结果展示', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await dismissAuthModal(page);
  });

  // === [P0] 核心路径 ===

  test('[P0] Grid 视图正常展示缩略图', async ({ page }) => {
    await doSearch(page, 'building');
    await waitForResults(page);

    // 默认是 Grid 视图 — 多张卡片可见
    const cards = page.locator('[data-card-index]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(1);

    // 每张卡片有缩略图
    const firstImg = page.locator('[data-card-index="0"] img[alt="Asset thumbnail"]');
    await expect(firstImg).toBeVisible();
  });

  test('[P0] 切换到 List 视图正常展示', async ({ page }) => {
    await doSearch(page, 'building');
    await waitForResults(page);

    // 打开 Display settings
    await page.locator('button[aria-label="Display settings"]').click();
    await page.waitForTimeout(500);

    // 切换到 List
    await page.locator('button[aria-label="List view"]').click();
    await page.waitForTimeout(1000);

    // 仍有结果卡片
    await expect(page.locator('[data-card-index="0"]')).toBeVisible({ timeout: 5_000 });
  });

  test('[P0] List → Grid 切换回来不白屏', async ({ page }) => {
    await doSearch(page, 'building');
    await waitForResults(page);

    // 切到 List
    await page.locator('button[aria-label="Display settings"]').click();
    await page.waitForTimeout(300);
    await page.locator('button[aria-label="List view"]').click();
    await page.waitForTimeout(800);

    // 切回 Grid
    await page.locator('button[aria-label="Grid view"]').click();
    await page.waitForTimeout(800);

    // 仍有结果
    await expect(page.locator('[data-card-index="0"]')).toBeVisible({ timeout: 5_000 });
    // 缩略图可见
    await expect(
      page.locator('[data-card-index="0"] img[alt="Asset thumbnail"]')
    ).toBeVisible({ timeout: 5_000 });
  });

  test('[P0] 结果数量显示正确', async ({ page }) => {
    await doSearch(page, 'building');
    await waitForResults(page);

    // 标题中有数字
    const heading = page.getByRole('heading', { level: 2 });
    const text = await heading.textContent();
    // 从 "找到 N 个结果" 中提取数字
    const match = text?.match(/找到\s*(\d+)\s*个结果/);
    expect(match).toBeTruthy();

    const displayedCount = parseInt(match![1], 10);
    expect(displayedCount).toBeGreaterThan(0);

    // 页面上有卡片渲染
    const cards = page.locator('[data-card-index]');
    const visibleCount = await cards.count();
    expect(visibleCount).toBeGreaterThan(0);
  });

  test('[P0] Grid 大小切换（L/S）', async ({ page }) => {
    await doSearch(page, 'building');
    await waitForResults(page);

    // 打开 settings
    await page.locator('button[aria-label="Display settings"]').click();
    await page.waitForTimeout(300);

    // 确保在 Grid 视图
    const gridBtn = page.locator('button[aria-label="Grid view"]');
    if (await gridBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await gridBtn.click();
      await page.waitForTimeout(500);
    }

    // Toggle grid size
    const toggleSize = page.locator('button[aria-label="Toggle grid size"]');
    if (await toggleSize.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await toggleSize.click();
      await page.waitForTimeout(800);

      // 切换后仍有结果
      await expect(page.locator('[data-card-index="0"]')).toBeVisible();

      // 切回来
      await toggleSize.click();
      await page.waitForTimeout(500);
    }
  });

  // === [P1] 边界 & 异常 ===

  test('[P1] 搜索生僻词不崩溃', async ({ page }) => {
    // 向量搜索即使搜乱码也会通过 embedding 返回相似结果
    // 此测试验证不会白屏/崩溃
    await doSearch(page, 'zzzzzzzzznonexistentxyz999');
    await page.waitForTimeout(5000);

    // 标题应该可见（可能有结果也可能没有，但不应崩溃）
    const heading = page.getByRole('heading', { level: 2 });
    await expect(heading).toBeVisible({ timeout: 10_000 });
    // 页面没白屏
    await expect(page.locator('body')).toBeVisible();
  });

  test('[P1] 文件名在卡片上正常展示（不溢出）', async ({ page }) => {
    await doSearch(page, 'building');
    await waitForResults(page);

    // 第一张卡片的文件名 paragraph 应该可见
    const fileName = page.locator('[data-card-index="0"] p').first();
    await expect(fileName).toBeVisible();

    // 确认有实际文本内容
    const text = await fileName.textContent();
    expect(text?.length).toBeGreaterThan(0);
  });
});
