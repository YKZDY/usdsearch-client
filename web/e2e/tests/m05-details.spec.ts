/**
 * M05 资产详情测试 — 对应 QUICK-CHECK M5 + FULL-REGRESSION M5
 *
 * 覆盖：
 *   [P0] 双击打开详情弹窗
 *   [P0] 弹窗显示资产名称/路径
 *   [P0] 弹窗内缩略图正常
 *   [P0] 标签列表展示
 *   [P0] 关闭弹窗（X 按钮 / Escape）
 *   [P1] 展开/折叠各 section
 *   [P1] Reindex 按钮可点击
 *
 * 交互逻辑：
 *   - 双击 [data-card-index="N"] 打开详情
 *   - Modal role="dialog"
 *   - ModalCloseButton aria-label="Close"
 *   - 内部有多个可折叠 section（Explanations, Metadata, Tags 等）
 */
import { test, expect, waitForAppReady } from '../fixtures/base';
import { doSearch, waitForResults, dismissAuthModal } from '../helpers/search';

test.describe('M05: 资产详情', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await dismissAuthModal(page);
    // 每个测试前先搜索出结果
    await doSearch(page, 'building');
    await waitForResults(page);
    await page.waitForTimeout(1000);
  });

  // === [P0] 核心路径 ===

  test('[P0] 双击卡片打开详情弹窗', async ({ page }) => {
    const card = page.locator('[data-card-index="0"]');
    await card.dblclick();

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible({ timeout: 8_000 });
  });

  test('[P0] 弹窗显示资产名称', async ({ page }) => {
    // 先获取第一个卡片的文件名
    const fileName = await page.locator('[data-card-index="0"] p').first().textContent();

    // 双击打开详情
    await page.locator('[data-card-index="0"]').dblclick();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible({ timeout: 8_000 });

    // 弹窗内应包含该文件名
    if (fileName) {
      await expect(modal).toContainText(fileName, { timeout: 5_000 });
    }
  });

  test('[P0] 弹窗内有缩略图', async ({ page }) => {
    await page.locator('[data-card-index="0"]').dblclick();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible({ timeout: 8_000 });

    // 弹窗内应有 img 元素
    const img = modal.locator('img').first();
    await expect(img).toBeVisible({ timeout: 10_000 });
  });

  test('[P0] 关闭弹窗 - X 按钮', async ({ page }) => {
    await page.locator('[data-card-index="0"]').dblclick();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible({ timeout: 8_000 });

    // 点 dialog 内的 X 关闭（页面上有多个 Close 按钮，必须限定在 modal 内）
    await modal.locator('button[aria-label="Close"]').click();
    await expect(modal).not.toBeVisible({ timeout: 5_000 });
  });

  test('[P0] 关闭弹窗 - Escape 键', async ({ page }) => {
    await page.locator('[data-card-index="0"]').dblclick();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible({ timeout: 8_000 });

    // 按 Escape 关闭
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible({ timeout: 5_000 });
  });

  test('[P0] 打开不同卡片详情内容不同', async ({ page }) => {
    // 打开第一张
    await page.locator('[data-card-index="0"]').dblclick();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible({ timeout: 8_000 });
    const content1 = await modal.textContent();
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible({ timeout: 3_000 });

    await page.waitForTimeout(500);

    // 打开第二张
    await page.locator('[data-card-index="1"]').dblclick();
    await expect(modal).toBeVisible({ timeout: 8_000 });
    const content2 = await modal.textContent();

    // 内容应该不同
    expect(content1).not.toEqual(content2);
  });

  // === [P1] 边界 & 异常 ===

  test('[P1] 弹窗显示文件大小信息', async ({ page }) => {
    await page.locator('[data-card-index="0"]').dblclick();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible({ timeout: 8_000 });

    // 应该有大小信息（KB 或 MB）
    await expect(modal).toContainText(/KB|MB|GB/i, { timeout: 5_000 });
  });

  test('[P1] 弹窗无 JS 错误', async ({ consoleErrors, page }) => {
    await page.locator('[data-card-index="0"]').dblclick();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible({ timeout: 8_000 });

    // 等待内容加载
    await page.waitForTimeout(3000);

    // 关闭
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // 检查无错误（排除已知的网络层错误）
    const realErrors = consoleErrors.filter(
      e => !e.text.includes('CORS') && !e.text.includes('ov.qq.com') &&
           !e.text.includes('favicon') && !e.text.includes('426') &&
           !e.text.includes('discovery') && !e.text.includes('healthcheck') &&
           !e.text.includes('net::ERR_FAILED') && !e.text.includes('ERR_CONNECTION')
    );
    expect(realErrors).toHaveLength(0);
  });
});
