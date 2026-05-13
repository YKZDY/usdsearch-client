/**
 * M10 i18n & 视觉一致性测试 — 对应 QUICK-CHECK M11 + FULL-REGRESSION M11
 *
 * 覆盖：
 *   [P0] 中文模式所有可见文案为中文（无 i18n key 暴露）
 *   [P0] 按钮/placeholder 中文化
 *   [P0] 弹窗内文案中文化
 *   [P1] 中英文切换
 *
 * 交互逻辑：
 *   - 语言切换按钮: button "EN" / "中"
 *   - 所有 UI 文案通过 useTranslation() 的 t() 函数渲染
 *   - i18n key 形如 camelCase（authMethod, searchPlaceholder 等），如果暴露说明翻译缺失
 */
import { test, expect, waitForAppReady } from '../fixtures/base';
import { doSearch, waitForResults, dismissAuthModal } from '../helpers/search';

test.describe('M10: i18n & 视觉一致性', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await dismissAuthModal(page);
  });

  // === [P0] 核心路径 ===

  test('[P0] 页面无 i18n key 暴露', async ({ page }) => {
    await page.waitForTimeout(3000);

    // 获取页面所有可见文本
    const bodyText = await page.locator('body').innerText();

    // 常见的 i18n key 模式（camelCase 单词组合）
    // 如果这些出现在页面上说明翻译缺失
    const suspiciousKeys = [
      'authMethod', 'searchPlaceholder', 'noResults',
      'serverConfiguration', 'enterUsername', 'enterPassword',
      'failedFetchDependencies', 'loginRequired',
    ];

    for (const key of suspiciousKeys) {
      expect(bodyText).not.toContain(key);
    }
  });

  test('[P0] 搜索框 placeholder 为中文', async ({ page }) => {
    const input = page.locator('.top-search-input');
    const placeholder = await input.getAttribute('placeholder');
    // 应包含中文字符
    expect(placeholder).toMatch(/[一-鿿]/);
  });

  test('[P0] 分类侧边栏为中文', async ({ page }) => {
    // 侧边栏的分类应该是中文
    await expect(page.getByRole('treeitem', { name: '所有产品' })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('treeitem', { name: '建筑' })).toBeVisible();
  });

  test('[P0] 搜索后结果标题为中文', async ({ page }) => {
    await doSearch(page, 'building');
    await waitForResults(page);

    const heading = page.getByRole('heading', { level: 2 });
    const text = await heading.innerText();
    // 应包含"结果"或"资产"等中文
    expect(text).toMatch(/结果|资产/);
  });

  test('[P0] 详情弹窗内文案为中文', async ({ page }) => {
    await doSearch(page, 'building');
    await waitForResults(page);
    await page.locator('[data-card-index="0"]').dblclick();

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible({ timeout: 8_000 });

    // 弹窗内应有中文文案
    const modalText = await modal.innerText();
    expect(modalText).toMatch(/资产信息|标签|详情|大小|修改时间/);
  });

  // === [P1] 边界 & 异常 ===

  test('[P1] 语言切换按钮可见', async ({ page }) => {
    // EN 或 中文 按钮应该可见
    const langBtn = page.getByRole('button', { name: /^EN$|^中文?$/ });
    await expect(langBtn).toBeVisible({ timeout: 5_000 });
  });

  test('[P1] 切换到英文后文案变为英文', async ({ page }) => {
    // 点击语言切换按钮
    const langBtn = page.getByRole('button', { name: /^EN$|^中文?$/ });
    await langBtn.click();
    await page.waitForTimeout(1000);

    // 切换后页面应有英文文案
    const bodyText = await page.locator('body').innerText();
    const hasEnglish = /All Products|Format|Size|Date|Path|Tags/i.test(bodyText);

    expect(hasEnglish).toBe(true);

    // 切回中文
    const langBtnBack = page.getByRole('button', { name: /^EN$|^中文?$/ });
    await langBtnBack.click();
    await page.waitForTimeout(500);
  });
});
