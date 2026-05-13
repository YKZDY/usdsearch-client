/**
 * M09 多选 & 交互测试 — 对应 QUICK-CHECK M9 + FULL-REGRESSION M9
 *
 * 覆盖：
 *   [P0] 单击卡片 = 选中（多选模式）
 *   [P0] 双击卡片 = 打开详情弹窗
 *   [P0] 选中后 SelectionModeBar 出现
 *   [P0] SelectionModeBar 显示选中数量
 *   [P0] 退出多选
 *   [P0] 选中状态下双击仍可打开详情
 *   [P1] 多张卡片连续选中
 *   [P1] Escape 退出多选
 *
 * 交互逻辑（源码确认）：
 *   - 单击卡片 → 切换选中状态（useClickOrDoubleClick, 500ms 窗口）
 *   - 双击卡片 → 打开详情弹窗
 *   - 选中时 checkbox 出现 (checkbox[checked])
 *   - SelectionModeBar 显示 "已选中 N 个资产"
 *   - "退出多选" 按钮清除所有选中
 *   - Escape 键退出多选
 */
import { test, expect, waitForAppReady } from '../fixtures/base';
import { doSearch, waitForResults, dismissAuthModal } from '../helpers/search';

test.describe('M09: 多选 & 交互', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await dismissAuthModal(page);
    await doSearch(page, 'building');
    await waitForResults(page);
    await page.waitForTimeout(1000);
  });

  // === [P0] 核心路径 ===

  test('[P0] 单击卡片选中', async ({ page }) => {
    const card = page.locator('[data-card-index="0"]');
    await card.click();
    await page.waitForTimeout(600); // 等待 500ms 双击窗口过期

    // 选中后 checkbox 出现且勾选（Chakra 自定义 checkbox 用 role="checkbox"）
    const checkbox = card.getByRole('checkbox');
    await expect(checkbox).toBeChecked({ timeout: 3_000 });
  });

  test('[P0] 双击卡片打开详情（不是选中）', async ({ page }) => {
    const card = page.locator('[data-card-index="0"]');
    await card.dblclick();

    // 详情弹窗出现
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible({ timeout: 8_000 });
  });

  test('[P0] 选中后 SelectionModeBar 显示', async ({ page }) => {
    // 单击选中第一张
    await page.locator('[data-card-index="0"]').click();
    await page.waitForTimeout(600);

    // SelectionModeBar 显示 "已选中 1 个资产"
    await expect(
      page.getByText(/已选中\s*1\s*个资产/)
    ).toBeVisible({ timeout: 5_000 });
  });

  test('[P0] 选中数量正确累加', async ({ page }) => {
    // 选中第一张
    await page.locator('[data-card-index="0"]').click();
    await page.waitForTimeout(600);

    // 选中第二张
    await page.locator('[data-card-index="1"]').click();
    await page.waitForTimeout(600);

    // 显示 "已选中 2 个资产"
    await expect(
      page.getByText(/已选中\s*2\s*个资产/)
    ).toBeVisible({ timeout: 5_000 });
  });

  test('[P0] 退出多选按钮清除选中', async ({ page }) => {
    // 选中一张
    await page.locator('[data-card-index="0"]').click();
    await page.waitForTimeout(600);
    await expect(page.getByText(/已选中\s*1/)).toBeVisible({ timeout: 3_000 });

    // 点击"退出多选"
    const exitBtn = page.getByRole('button', { name: /退出多选/ });
    await exitBtn.click();
    await page.waitForTimeout(500);

    // 选中数变为 0
    await expect(page.getByText(/已选中\s*0\s*个资产/)).toBeVisible({ timeout: 3_000 });
  });

  test('[P0] 选中状态下双击仍可打开详情', async ({ page }) => {
    // 先选中第一张
    await page.locator('[data-card-index="0"]').click();
    await page.waitForTimeout(600);
    await expect(page.getByText(/已选中\s*1/)).toBeVisible({ timeout: 3_000 });

    // 双击第二张 → 应打开详情而非选中
    await page.locator('[data-card-index="1"]').dblclick();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible({ timeout: 8_000 });
  });

  test('[P0] 再次单击已选卡片取消选中', async ({ page }) => {
    const card = page.locator('[data-card-index="0"]');

    // 选中
    await card.click();
    await page.waitForTimeout(600);
    await expect(card.getByRole('checkbox')).toBeChecked({ timeout: 3_000 });

    // 再次单击取消选中
    await card.click();
    await page.waitForTimeout(600);
    await expect(card.getByRole('checkbox')).not.toBeChecked({ timeout: 3_000 });
  });

  // === [P1] 边界 & 异常 ===

  test('[P1] Escape 键退出多选', async ({ page }) => {
    // 选中一张
    await page.locator('[data-card-index="0"]').click();
    await page.waitForTimeout(600);
    await expect(page.getByText(/已选中\s*1/)).toBeVisible({ timeout: 3_000 });

    // 按 Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // 选中数变为 0
    await expect(page.getByText(/已选中\s*0\s*个资产/)).toBeVisible({ timeout: 3_000 });
  });

  test('[P1] SelectionModeBar 无页面抖动', async ({ page }) => {
    // 获取第一张卡片初始位置
    const card = page.locator('[data-card-index="0"]');
    const boxBefore = await card.boundingBox();

    // 选中触发 SelectionModeBar
    await card.click();
    await page.waitForTimeout(800);

    // 卡片位置不应有大幅偏移（允许 5px 容差）
    const boxAfter = await card.boundingBox();
    if (boxBefore && boxAfter) {
      expect(Math.abs(boxAfter.y - boxBefore.y)).toBeLessThan(5);
    }
  });
});
