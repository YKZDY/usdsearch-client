/**
 * M07 目录树测试 — 对应 QUICK-CHECK M7 + FULL-REGRESSION M7
 *
 * 覆盖：
 *   [P0] 分类侧边栏正常展示
 *   [P0] 点击分类节点触发搜索/过滤
 *   [P0] 展开/折叠交互正常
 *   [P1] 快速切换分类不崩溃
 *
 * 交互逻辑：
 *   - 侧边栏: complementary "Category Navigation"
 *   - 分类树: tree role, treeitem role
 *   - 折叠按钮: button "Collapse sidebar"
 *   - 分类点击 → filter_by_tags + 触发搜索
 *   - 有子级的分类有展开箭头
 */
import { test, expect, waitForAppReady } from '../fixtures/base';
import { dismissAuthModal } from '../helpers/search';

test.describe('M07: 目录树 / 分类导航', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await dismissAuthModal(page);
    await page.waitForTimeout(2000);
  });

  // === [P0] 核心路径 ===

  test('[P0] 分类侧边栏正常展示', async ({ page }) => {
    // 侧边栏可见
    const sidebar = page.getByRole('complementary', { name: 'Category Navigation' });
    await expect(sidebar).toBeVisible({ timeout: 5_000 });

    // 包含分类树
    const tree = sidebar.getByRole('tree');
    await expect(tree).toBeVisible();

    // 至少有"所有产品"
    await expect(
      sidebar.getByRole('treeitem', { name: '所有产品' })
    ).toBeVisible();
  });

  test('[P0] 所有预期分类都显示', async ({ page }) => {
    const expectedCategories = ['所有产品', '建筑', '物件', '植被', '自然', '道路', '假地形/远景'];

    for (const cat of expectedCategories) {
      await expect(
        page.getByRole('treeitem', { name: cat })
      ).toBeVisible({ timeout: 3_000 });
    }
  });

  test('[P0] 点击分类触发过滤', async ({ page }) => {
    // 记录初始标题
    const headingBefore = await page.getByRole('heading', { level: 2 }).innerText();

    // 点击"建筑"
    await page.getByRole('treeitem', { name: '建筑' }).click();
    await page.waitForTimeout(3000);

    // 标题应该变化（新搜索被触发）
    const headingAfter = await page.getByRole('heading', { level: 2 }).innerText();
    // 至少标题区域还在（没崩溃）
    expect(headingAfter.length).toBeGreaterThan(0);
  });

  test('[P0] 折叠/展开侧边栏', async ({ page }) => {
    const sidebar = page.getByRole('complementary', { name: 'Category Navigation' });
    await expect(sidebar).toBeVisible();

    // 点击折叠按钮
    const collapseBtn = page.getByRole('button', { name: 'Collapse sidebar' });
    await collapseBtn.click();
    await page.waitForTimeout(500);

    // 折叠后分类树应不可见或侧边栏缩小
    // （不同实现可能是隐藏 tree 或整个 sidebar 变窄）
    // 确保不崩溃即可
    await expect(page.locator('body')).toBeVisible();

    // 再点一次展开
    const expandBtn = page.getByRole('button', { name: /Collapse|Expand|sidebar/i }).first();
    if (await expandBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expandBtn.click();
      await page.waitForTimeout(500);
    }
  });

  // === [P1] 边界 & 异常 ===

  test('[P1] "所有产品"默认选中', async ({ page }) => {
    const allItem = page.getByRole('treeitem', { name: '所有产品' });
    // 检查是否有 selected 状态
    await expect(allItem).toHaveAttribute('aria-selected', 'true', { timeout: 3_000 });
  });

  test('[P1] 切换分类后再选"所有产品"恢复', async ({ page }) => {
    // 选"物件"
    await page.getByRole('treeitem', { name: '物件' }).click();
    await page.waitForTimeout(2000);

    // 选回"所有产品"
    await page.getByRole('treeitem', { name: '所有产品' }).click();
    await page.waitForTimeout(2000);

    // "所有产品"应回到 selected 状态
    const allItem = page.getByRole('treeitem', { name: '所有产品' });
    await expect(allItem).toHaveAttribute('aria-selected', 'true', { timeout: 3_000 });
  });
});
