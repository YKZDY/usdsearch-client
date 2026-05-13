/**
 * 通用断言 helpers
 */
import { Page, expect } from '@playwright/test';

/**
 * 断言页面无 console error
 * 忽略已知的无害错误（favicon、CORS、Nucleus discovery 等）
 */
export async function expectNoConsoleErrors(
  errors: Array<{ text: string; url: string }>
) {
  const realErrors = errors.filter(
    (e) =>
      !e.text.includes('favicon') &&
      !e.text.includes('manifest.json') &&
      !e.text.includes('net::ERR_') &&
      !e.text.includes('CORS') &&
      !e.text.includes('ov.qq.com') &&
      !e.text.includes('426') &&
      !e.text.includes('Upgrade Required') &&
      !e.text.includes('discovery') &&
      !e.text.includes('healthcheck') &&
      !e.text.includes('ERR_FAILED') &&
      !e.text.includes('ERR_CONNECTION')
  );

  if (realErrors.length > 0) {
    console.log('Console errors detected:', realErrors);
  }
  expect(realErrors).toHaveLength(0);
}

/**
 * 断言指定资产名称在搜索结果中可见
 */
export async function expectAssetVisible(page: Page, assetName: string) {
  await expect(page.getByText(assetName).first()).toBeVisible({ timeout: 10_000 });
}

/**
 * 断言搜索结果数量大于 N
 */
export async function expectMinResults(page: Page, min: number) {
  // 计算可见的结果卡片/行数
  const cards = page.locator('img[src*="image"], img[src*="picsum"], img[src*="data:image"]');
  await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  const count = await cards.count();
  expect(count).toBeGreaterThanOrEqual(min);
}
