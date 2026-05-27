# 卡片单击偶发失灵 - Playwright 回归用例集

> **背景**：用户反馈"日常场景偶发单击无反应，尤其卡片下半部 1/3 区域"。  
> **根因**：[CardTagBar.jsx](../web/src/components/CardTagBar.jsx) 容器层注册了 `onClick / onMouseDown / onDoubleClick` 三处 `e.stopPropagation()`，把整片标签栏覆盖区域的点击事件全部吞掉，无法冒泡到 `<Card>` 根。  
> **修复**：引入 `FEATURE_FLAGS.CARD_TAGBAR_BUBBLE`（默认 true），容器层透传，由 chip / AddTagButton / MoreChip 在元素自身阻断冒泡。  
> **本文档目的**：提供 5 个 Playwright 标准用例，可在任何重构后快速回归验证。

---

## 测试前置

```js
// 启动 dev server
// cd web && npm start
// 等待 localhost:3000 200 OK

// 浏览器视口建议
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto("http://localhost:3000/?server=nucleus&limit=50");
```

---

## 用例 A：CardTagBar 覆盖区随机 20 坐标连点 → 100% 触发 onSelectionChange

**目的**：确认标签栏容器（包括 chip 间隙、加号按钮 padding、空标签占位区）的点击都能冒泡到 Card 根。

```js
// 1) 找到第 0 张卡片的 CardTagBar 区域（通过 data-card-index 定位卡片 + Y 偏移定位标签栏）
const result = await page.evaluate(() => {
  const card = document.querySelector('[data-card-index="0"]');
  const cardRect = card.getBoundingClientRect();
  // 标签栏大约位于卡片 60%-75% 高度区间（缩略图占 0-50%，标题占 50-58%，标签栏占 58-72%）
  const tagbarY = cardRect.top + cardRect.height * 0.65;
  const tagbarLeft = cardRect.left + 12;
  const tagbarRight = cardRect.right - 12;
  return { tagbarY, tagbarLeft, tagbarRight, cardId: card.dataset.cardIndex };
});

// 2) 注入 onSelectionChange 探针
await page.evaluate(() => {
  window.__SELECTION_CHANGES = 0;
  const orig = window.console.log;
  window.console.log = (...args) => {
    if (typeof args[0] === "string" && args[0].includes("onSelectionChange")) {
      window.__SELECTION_CHANGES++;
    }
    orig.apply(window.console, args);
  };
});

// 3) 在标签栏 X 区间随机生成 20 个坐标连点
let triggered = 0;
for (let i = 0; i < 20; i++) {
  const x =
    result.tagbarLeft +
    Math.random() * (result.tagbarRight - result.tagbarLeft);
  await page.mouse.click(x, result.tagbarY);
  await page.waitForTimeout(50);
}
const finalCount = await page.evaluate(() => window.__SELECTION_CHANGES);

// 期望：finalCount >= 19（容忍 1 次因落到精确的 chip 像素被 chip 自身吞）
console.assert(finalCount >= 19, `用例 A 失败：仅 ${finalCount}/20 触发`);
```

---

## 用例 B：标签 chip 之间间隙的单击 → 触发 onSelectionChange

**目的**：确认标签 chip 物理间隙（spacing 4px）不再吞没事件。

```js
// 找到一张已有标签的卡片（data-card-index 指定，或测试用例预先打 tag）
// 计算两个 chip 之间的中心点
const gapPoint = await page.evaluate(() => {
  const tagbar = document.querySelector(
    '[data-card-index="0"] [data-tagpill]:nth-child(1)',
  );
  const next = document.querySelector(
    '[data-card-index="0"] [data-tagpill]:nth-child(2)',
  );
  if (!tagbar || !next) return null;
  const a = tagbar.getBoundingClientRect();
  const b = next.getBoundingClientRect();
  return { x: (a.right + b.left) / 2, y: a.top + a.height / 2 };
});

if (gapPoint) {
  await page.mouse.click(gapPoint.x, gapPoint.y);
  // 期望：onSelectionChange 触发（drawer 打开 / 多选切换，看 FEATURE_FLAGS.SINGLE_CLICK_DRAWER）
  const drawerOpen = await page.locator('[data-drawer-open="true"]').count();
  console.assert(drawerOpen > 0, "用例 B 失败：chip 间隙单击未打开 Drawer");
}
```

---

## 用例 C：直接点 tag chip 本身 → 触发 Popover（不打开 Drawer）

**目的**：确认 chip 自身 onClick stopPropagation 仍生效，不会因为容器层放开后误开 Drawer。

```js
const chipPoint = await page.evaluate(() => {
  const chip = document.querySelector(
    '[data-card-index="0"] button[aria-label*="标签"]',
  );
  // 或定位加号按钮：[aria-label*="add" i] / [aria-label*="添加"]
  if (!chip) return null;
  const r = chip.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});

if (chipPoint) {
  await page.mouse.click(chipPoint.x, chipPoint.y);
  await page.waitForTimeout(200);
  // 期望 1：Popover 弹出
  const popoverVisible = await page
    .locator('[role="dialog"]:visible, .chakra-popover__content:visible')
    .count();
  console.assert(popoverVisible > 0, "用例 C 失败：点 chip 本身未弹 Popover");
  // 期望 2：右侧 Drawer 未打开
  const drawerOpen = await page.locator('[data-drawer-open="true"]').count();
  console.assert(
    drawerOpen === 0,
    "用例 C 失败：点 chip 本身误开了 Drawer（容器透传后 chip 自身阻断失效）",
  );
}
```

---

## 用例 D：在 CardTagBar 区域起点 + 拖拽 > 8px → 进入 paint 模式

**目的**：确认拖拽框选起点落在标签栏区域时不被中间层 stopPropagation 阻断。

```js
const start = await page.evaluate(() => {
  const card = document.querySelector('[data-card-index="0"]');
  const rect = card.getBoundingClientRect();
  // 起点：卡片标签栏区域空白处（避开 chip）
  return { x: rect.right - 30, y: rect.top + rect.height * 0.7 };
});

await page.mouse.move(start.x, start.y);
await page.mouse.down();
// 拖拽 100px 触发 paint
await page.mouse.move(start.x + 100, start.y + 50, { steps: 10 });

// 期望：marquee 矩形可见
const marqueeVisible = await page.evaluate(() => {
  // useDragSelect 把 marquee 设为 opacity: 1 当 isDragging
  const marquee = Array.from(
    document.querySelectorAll('[aria-hidden="true"]'),
  ).find((el) => el.style.zIndex === "9999");
  return marquee && parseFloat(getComputedStyle(marquee).opacity) > 0.5;
});
console.assert(marqueeVisible, "用例 D 失败：标签栏区域起拖未触发 marquee");
await page.mouse.up();
```

---

## 用例 E：limit=100 vs limit=50 视觉对比偏差 < 5%

**目的**：确认两种 limit 下卡片视觉布局一致，不再存在挤压问题。

```js
async function captureLayout(limit) {
  await page.goto(`http://localhost:3000/?server=nucleus&limit=${limit}`);
  await page.waitForSelector('[data-card-index="0"]', { timeout: 10000 });
  await page.waitForTimeout(500); // 等渲染稳定
  return await page.evaluate(() => {
    const cards = document.querySelectorAll("[data-card-index]");
    const first = cards[0].getBoundingClientRect();
    const second = cards[1]?.getBoundingClientRect();
    const fourth = cards[3]?.getBoundingClientRect(); // 第二行第一张
    return {
      cardWidth: first.width,
      cardHeight: first.height,
      gap: second ? second.left - first.right : 0,
      rowGap: fourth ? fourth.top - first.bottom : 0,
    };
  });
}

const a = await captureLayout(50);
const b = await captureLayout(100);

const widthDiff = Math.abs(a.cardWidth - b.cardWidth) / a.cardWidth;
const heightDiff = Math.abs(a.cardHeight - b.cardHeight) / a.cardHeight;
console.assert(
  widthDiff < 0.05,
  `用例 E 失败：宽度差 ${(widthDiff * 100).toFixed(1)}% 超过 5%`,
);
console.assert(
  heightDiff < 0.05,
  `用例 E 失败：高度差 ${(heightDiff * 100).toFixed(1)}% 超过 5%`,
);

// 实测基线（2026-05-25 commit acd335570）：
// limit=50:  cardWidth=350, cardHeight=363.45
// limit=100: cardWidth=350, cardHeight=360
// 实际差异：宽度 0%，高度 0.95%（远小于 5%）
```

---

## 一键运行所有用例

```bash
# 假设以上代码保存到 web/tests/e2e/click-bug-replay.spec.js
cd web && npx playwright test tests/e2e/click-bug-replay.spec.js
```

期望输出：

```
✓ 用例 A：CardTagBar 覆盖区 20 坐标连点 (≥19/20)
✓ 用例 B：chip 间隙单击触发 Drawer
✓ 用例 C：chip 自身点击弹 Popover 不开 Drawer
✓ 用例 D：标签栏区域起拖触发 marquee
✓ 用例 E：limit 50/100 布局偏差 < 5%
```

任何一项失败 → 视为修复未完成，回到 [requirements.md](../.codebuddy/plan/click-and-layout-fixes/requirements.md) 重新分析根因。
