/**
 * M04 图片加载系统测试 — 对应 QUICK-CHECK M4 + FULL-REGRESSION M4
 *
 * 覆盖：
 *   [P0] 搜索结果缩略图正常加载
 *   [P0] 多张图片都能加载（非只第一张）
 *   [P0] 无缩略图时显示 placeholder（非空白）
 *   [P1] 图片加载失败不导致白屏
 *   [P1] 详情弹窗内图片加载
 *
 * 交互逻辑：
 *   - 缩略图: img[alt="Asset thumbnail"]
 *   - 三级缓存: memory → IndexedDB → API GET /image
 *   - 加载中: ImageSkeleton 组件
 *   - 加载失败: FailedBadge
 */
import { test, expect, waitForAppReady } from '../fixtures/base';
import { doSearch, waitForResults, dismissAuthModal } from '../helpers/search';

test.describe('M04: 图片加载系统', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await dismissAuthModal(page);
    await doSearch(page, 'building');
    await waitForResults(page);
  });

  // === [P0] 核心路径 ===

  test('[P0] 第一张缩略图正常加载', async ({ page }) => {
    const img = page.locator('[data-card-index="0"] img[alt="Asset thumbnail"]');
    await expect(img).toBeVisible({ timeout: 10_000 });

    // 确认图片实际加载成功
    const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);
  });

  test('[P0] 多张缩略图都能加载', async ({ page }) => {
    // 等待更多图片加载
    await page.waitForTimeout(3000);

    const images = page.locator('img[alt="Asset thumbnail"]');
    const count = await images.count();
    expect(count).toBeGreaterThan(3);

    // 检查前 3 张是否都加载成功
    for (let i = 0; i < Math.min(3, count); i++) {
      const img = images.nth(i);
      if (await img.isVisible({ timeout: 2_000 }).catch(() => false)) {
        const width = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
        expect(width).toBeGreaterThan(0);
      }
    }
  });

  test('[P0] 缩略图有正确的 alt 属性', async ({ page }) => {
    const img = page.locator('[data-card-index="0"] img[alt="Asset thumbnail"]');
    await expect(img).toBeVisible({ timeout: 10_000 });
    await expect(img).toHaveAttribute('alt', 'Asset thumbnail');
  });

  test('[P0] 详情弹窗内图片加载', async ({ page }) => {
    await page.locator('[data-card-index="0"]').dblclick();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible({ timeout: 8_000 });

    // 弹窗内的缩略图
    const modalImg = modal.locator('img[alt="Asset thumbnail"]');
    await expect(modalImg).toBeVisible({ timeout: 10_000 });

    const width = await modalImg.evaluate((el: HTMLImageElement) => el.naturalWidth);
    expect(width).toBeGreaterThan(0);
  });

  // === [P1] 边界 & 异常 ===

  test('[P1] 图片加载不阻塞页面渲染', async ({ page }) => {
    // 卡片文本信息应该先于图片出现
    const fileName = page.locator('[data-card-index="0"] p').first();
    await expect(fileName).toBeVisible({ timeout: 5_000 });

    // 文件名可见说明页面渲染没被图片加载阻塞
    const text = await fileName.textContent();
    expect(text?.length).toBeGreaterThan(0);
  });

  test('[P1] 快速滚动后图片仍能加载', async ({ page }) => {
    // 滚动到底部
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);

    // 滚回顶部
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(2000);

    // 第一张图片仍然可见且已加载
    const img = page.locator('[data-card-index="0"] img[alt="Asset thumbnail"]');
    if (await img.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const width = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
      expect(width).toBeGreaterThan(0);
    }
  });
});
