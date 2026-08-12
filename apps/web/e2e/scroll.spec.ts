import { expect, test } from '@playwright/test';

/**
 * 回归测试：首页（及所有页面）内容必须可滚动。
 * 历史 bug：default-layout 的 <main> 使用 overflow-y-clip，彻底禁止滚动
 * （clip 与 hidden 不同，既不可滚轮也不可编程滚动）。已改为 overflow-y-auto。
 */
test('首页内容可滚动（回归：overflow-y-clip 锁死滚动）', async ({ page }) => {
  await page.goto('/');

  // vite 冷启动会触发依赖预构建/页面重载，先等 Dashboard 真实内容渲染
  //（避免 main 为空时误判「内容未溢出」）
  await expect(page.locator('main h2').first()).toBeVisible({ timeout: 20_000 });

  // 等页面过渡遮罩收起（SAFETY_MS = 1500ms 兜底，正常 ~700ms）
  await expect(page.locator('.page-transition-overlay')).toHaveCount(0, { timeout: 5000 });

  const main = page.locator('main');
  await expect(main).toBeVisible();

  // 1) 内容必须溢出容器（否则滚动无从谈起）
  const metrics = await main.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

  // 2) 真实鼠标滚轮向下滚动必须生效
  await page.mouse.move(720, 400);
  await page.mouse.wheel(0, 800);
  await page.waitForTimeout(300);
  const scrolled = await main.evaluate((el) => el.scrollTop);
  expect(scrolled).toBeGreaterThan(0);

  // 3) 必须能滚到底部（scrollTop 到达最大可滚动距离）
  await page.mouse.wheel(0, 5000);
  await page.waitForTimeout(300);
  const bottom = await main.evaluate((el) => ({
    scrollTop: el.scrollTop,
    max: el.scrollHeight - el.clientHeight,
  }));
  expect(bottom.scrollTop).toBe(bottom.max);
});
