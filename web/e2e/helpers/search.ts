/**
 * 搜索操作 helpers
 *
 * 封装搜索相关的常用操作，减少测试代码重复
 */
import { Page, expect } from '@playwright/test';

/**
 * 关闭可能弹出的 Nucleus 认证弹窗
 * 如果用户已认证（storageState 已加载），弹窗不会出现，此函数快速返回
 */
export async function dismissAuthModal(page: Page) {
  // 快速检查——不等太久
  const cancelBtn = page.getByRole('button', { name: /取消|cancel/i });
  if (await cancelBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await cancelBtn.click();
    await page.waitForTimeout(300);
    return;
  }
}

/**
 * 执行一次文本搜索，等待结果出现在 UI 中
 */
export async function doSearch(page: Page, query: string) {
  const input = page.locator('.top-search-input');
  await input.fill(query);
  await input.press('Enter');

  // 等待结果区域出现内容（标题中出现 "的结果" 或 "资产"）
  await page.getByRole('heading', { level: 2 }).filter({ hasText: /结果|资产/ }).waitFor({
    state: 'visible',
    timeout: 15_000,
  });
}

/**
 * 等待搜索结果卡片出现
 */
export async function waitForResults(page: Page) {
  // 等待第一个结果卡片（data-card-index="0"）可见
  await page.locator('[data-card-index="0"]').waitFor({
    state: 'visible',
    timeout: 15_000,
  });
}

/**
 * 获取当前搜索结果数量（从 UI 上的计数文本）
 * 返回 -1 表示未找到计数
 */
export async function getResultCount(page: Page): Promise<number> {
  const countText = page.locator('[class*="count"], [class*="total"], [class*="result"]')
    .filter({ hasText: /\d+/ })
    .first();

  if (await countText.isVisible({ timeout: 5_000 }).catch(() => false)) {
    const text = await countText.textContent();
    const match = text?.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : -1;
  }
  return -1;
}

/**
 * 清除搜索框内容
 */
export async function clearSearch(page: Page) {
  const input = page.locator('input[type="text"], input[type="search"]').first();
  await input.fill('');
  await input.press('Enter');
}
