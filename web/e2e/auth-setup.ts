/**
 * 认证 Setup 脚本
 *
 * 用途：打开一个可见的浏览器窗口，让你手动完成 Nucleus Device Flow 登录，
 *       然后保存认证状态（localStorage）到文件，供后续测试自动复用。
 *
 * 运行方式：
 *   npm run e2e:auth
 *
 * 流程：
 *   1. 弹出浏览器窗口，打开 localhost:3000
 *   2. 你手动完成 Nucleus 认证（复制令牌、填入等）
 *   3. 认证成功后，在终端按回车（或等待页面显示"已认证"）
 *   4. 浏览器状态自动保存到 e2e/.auth/storage-state.json
 *   5. 之后跑 e2e:smoke / e2e 时自动复用此认证状态
 *
 * 注意：认证状态有有效期，过期后需要重新运行此脚本。
 */
import { chromium } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as readline from 'readline';

const STORAGE_STATE_PATH = path.join(__dirname, '..', '.auth', 'storage-state.json');

async function setup() {
  console.log('');
  console.log('=== Playwright 认证 Setup ===');
  console.log('');
  console.log('即将打开浏览器窗口，请手动完成 Nucleus 认证。');
  console.log('认证成功后回到这里按回车键保存状态。');
  console.log('');

  // 确保 .auth 目录存在
  const authDir = path.dirname(STORAGE_STATE_PATH);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // 启动可见的浏览器
  const browser = await chromium.launch({
    headless: false, // 显示浏览器窗口！
    args: ['--start-maximized'],
  });

  const context = await browser.newContext({
    viewport: null, // 让窗口跟随系统大小
  });

  const page = await context.newPage();
  await page.goto('http://localhost:3000');

  console.log('浏览器已打开 http://localhost:3000');
  console.log('');
  console.log('请在浏览器中完成认证：');
  console.log('  1. 等待 Nucleus 认证弹窗出现');
  console.log('  2. 点击"打开 Nucleus 登录页面"');
  console.log('  3. 在 Nucleus 页面输入设备码');
  console.log('  4. 认证成功后回到此终端');
  console.log('');

  // 等待用户按回车
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  await new Promise<void>((resolve) => {
    rl.question('✓ 认证完成后按回车键保存状态...', () => {
      rl.close();
      resolve();
    });
  });

  // 保存浏览器状态（localStorage + cookies）
  await context.storageState({ path: STORAGE_STATE_PATH });

  console.log('');
  console.log(`✓ 认证状态已保存到: ${STORAGE_STATE_PATH}`);
  console.log('  之后运行 npm run e2e:smoke 会自动使用此状态。');
  console.log('  如果 Token 过期，重新运行 npm run e2e:auth 即可。');
  console.log('');

  await browser.close();
}

setup().catch((err) => {
  console.error('Setup 失败:', err);
  process.exit(1);
});
