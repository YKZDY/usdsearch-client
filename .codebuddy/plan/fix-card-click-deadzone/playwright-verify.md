# Playwright MCP 验证脚本（9 用例测试矩阵）

> 在 Playwright MCP 可用时，按以下脚本顺序执行验证。每个用例的 mouse 序列里都注入 6-9px 抖动，模拟真实手指输入，验证 R1（Shift/Ctrl+click 不被位移误吞）回归不再发生。

## 前置准备

```js
async (page) => {
  // 等待页面就绪
  return await page.evaluate(() => ({
    url: location.href,
    cards: document.querySelectorAll("[data-card-index]").length,
    sc: !!document.querySelector(".css-10inswv"),
  }));
};
// 期望：{ url: "http://localhost:3000/...", cards: >=10, sc: true }
```

---

## 用例 1：干净页面 单击卡片本体 → 打开 Drawer

```js
async (page) => {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const card = await page.evaluate(() => {
    const c = document.querySelector('[data-card-index="0"]');
    const r = c.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(card.x, card.y);
  await page.mouse.down();
  // 注入 7px 抖动
  await page.mouse.move(card.x + 4, card.y + 5);
  await page.mouse.move(card.x + 6, card.y + 3);
  await page.mouse.up();
  await page.waitForTimeout(400);
  return await page.evaluate(() => ({
    drawerOpen: !!document.querySelector(".chakra-drawer__content"),
    selected: parseInt(
      (document
        .querySelector("p.chakra-text")
        ?.textContent.match(/已选中\s*(\d+)/) || [])[1] || "0",
      10,
    ),
  }));
};
// 期望：{ drawerOpen: true, selected: 0 }
```

## 用例 2：干净页面 Shift+单击卡片本体 → 进入多选 / 退化为单击

```js
async (page) => {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const card = await page.evaluate(() => {
    const c = document.querySelector('[data-card-index="1"]');
    const r = c.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.keyboard.down("Shift");
  await page.mouse.move(card.x, card.y);
  await page.mouse.down();
  // 注入 8px 抖动（关键：原 5px 阈值会吞掉，10px 阈值不再吞）
  await page.mouse.move(card.x + 5, card.y + 6);
  await page.mouse.move(card.x + 6, card.y + 5);
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await page.waitForTimeout(400);
  return await page.evaluate(() => ({
    drawerOpen: !!document.querySelector(".chakra-drawer__content"),
    selected: parseInt(
      (document
        .querySelector("p.chakra-text")
        ?.textContent.match(/已选中\s*(\d+)/) || [])[1] || "0",
      10,
    ),
  }));
};
// 期望：drawer 打开（首次 anchor=null 退化）或 selected >=1。**禁止** drawerOpen=false && selected=0
```

## 用例 3：干净页面 Ctrl+单击卡片本体 → 进入多选 toggle

```js
async (page) => {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const card = await page.evaluate(() => {
    const c = document.querySelector('[data-card-index="2"]');
    const r = c.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.keyboard.down("Control");
  await page.mouse.move(card.x, card.y);
  await page.mouse.down();
  // 注入 8px 抖动
  await page.mouse.move(card.x + 6, card.y + 5);
  await page.mouse.up();
  await page.keyboard.up("Control");
  await page.waitForTimeout(400);
  return await page.evaluate(() => ({
    selected: parseInt(
      (document
        .querySelector("p.chakra-text")
        ?.textContent.match(/已选中\s*(\d+)/) || [])[1] || "0",
      10,
    ),
  }));
};
// 期望：selected === 1
```

## 用例 4：干净页面 单击复选框 → toggle 选中

```js
async (page) => {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const cb = await page.evaluate(() => {
    const c = document.querySelector(
      '[data-card-index="3"] [data-role="card-checkbox"]',
    );
    const r = c.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(cb.x, cb.y);
  await page.waitForTimeout(300);
  return await page.evaluate(() => ({
    drawerOpen: !!document.querySelector(".chakra-drawer__content"),
    selected: parseInt(
      (document
        .querySelector("p.chakra-text")
        ?.textContent.match(/已选中\s*(\d+)/) || [])[1] || "0",
      10,
    ),
  }));
};
// 期望：{ drawerOpen: false, selected: 1 }
```

## 用例 5：Drawer 已开 单击其他卡片 → 切换 Drawer 内容

```js
async (page) => {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  // 先开 Drawer
  await page.evaluate(() => {
    const c = document.querySelector('[data-card-index="0"]');
    const r = c.getBoundingClientRect();
    window.__c0 = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(
    await page.evaluate(() => window.__c0.x),
    await page.evaluate(() => window.__c0.y),
  );
  await page.waitForTimeout(500);
  const beforeTitle = await page.evaluate(
    () =>
      document.querySelector(".chakra-drawer__content")?.querySelector("h2,h3")
        ?.textContent,
  );
  // 等 warmup 过期
  await page.waitForTimeout(300);
  // 单击 card 5
  const c5 = await page.evaluate(() => {
    const c = document.querySelector('[data-card-index="5"]');
    const r = c.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(c5.x, c5.y);
  await page.mouse.down();
  await page.mouse.move(c5.x + 5, c5.y + 4);
  await page.mouse.up();
  await page.waitForTimeout(500);
  return await page.evaluate(() => ({
    drawerOpen: !!document.querySelector(".chakra-drawer__content"),
    titleAfter: document
      .querySelector(".chakra-drawer__content")
      ?.querySelector("h2,h3")?.textContent,
  }));
};
// 期望：drawerOpen=true，title 与开 Drawer 时不同
```

## 用例 6：Drawer 已开 Shift+单击 → 进入多选

```js
// 类似用例 5，但 click 时按住 Shift。期望 drawerOpen 关闭/保留 + selected >=1
```

## 用例 7：Drawer 已开 单击真空白 → 关闭 Drawer

```js
async (page) => {
  // 在用例 5 状态下
  await page.waitForTimeout(300); // warmup
  await page.mouse.click(50, 50); // 顶栏外左上角
  await page.waitForTimeout(400);
  return await page.evaluate(() => ({
    drawerOpen: !!document.querySelector(".chakra-drawer__content"),
  }));
};
// 期望：drawerOpen === false
```

## 用例 8：多选模式 拖拽框选 → 选中数 >= 5

```js
// 与之前 autoScroll 验证脚本一致：mousedown(200,200) → smooth move to (1500,920) → mouseup
// 期望：selected >= 5
```

## 用例 9：多选模式 Esc → 退出多选

```js
async (page) => {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  return await page.evaluate(() => ({
    bar: !!document.querySelector(".selection-bar-wrapper"),
    selected: parseInt(
      (document
        .querySelector("p.chakra-text")
        ?.textContent.match(/已选中\s*(\d+)/) || [])[1] || "0",
      10,
    ),
  }));
};
// 期望：{ bar: false, selected: 0 }
```

---

## 验收准则

- 9 个用例全部通过 → 修复闭环
- 任一失败 → 回到 systematic-debugging 流程定位剩余原因
- 关键回归点：用例 2、3、5 都注入 6-9px 抖动，**修复前会失败**（click 被 movedRef 早退吞掉），**修复后不应失败**
