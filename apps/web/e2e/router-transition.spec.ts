import { expect, test } from '@playwright/test';

/**
 * 回归测试：路由连续切换后页面内容必须始终显示。
 * 历史 bug：<Transition mode="out-in"> + 懒加载组件在连续/快速切换时
 * Vue 过渡状态机吞掉 enter 阶段，<main> 只剩注释节点、页面空白。
 * 修复：移除 Transition 组件，改为「导航守卫显示遮罩 + RouterView 同步切换
 * + 过渡窗口内导航串行化」（见 router/index.ts 与 default-layout.vue）。
 */

const NAV = [
  { label: '首页', path: '/' },
  { label: 'Chat', path: '/chat' },
  { label: '工作流', path: '/workflows' },
  { label: '开发中', path: '/projects' },
  { label: '已完成', path: '/achievements' },
  { label: '管理系统', path: '/admin' },
  { label: '设置', path: '/settings' },
];

test('连续浏览全部页面：内容始终显示、URL 跟随导航', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main h1, main h2').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.page-transition-overlay')).toHaveCount(0, { timeout: 5000 });

  for (const { label, path } of NAV) {
    await page.getByRole('link', { name: label, exact: true }).first().click();
    // 等待 URL 变化（串行化防抖下点击后最多 ~1.6s 内生效）
    await expect(page).toHaveURL(new RegExp(`${path.replace('/', '\\/')}$`), { timeout: 4000 });
    // 等待内容渲染 + 遮罩收起
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const m = document.querySelector('main');
            return {
              children: m?.children.length ?? -1,
              overlay: !!document.querySelector('.page-transition-overlay'),
            };
          }),
        { timeout: 5000 },
      )
      .toMatchObject({ children: 1, overlay: false });
  }
});

test('快速连点导航：最终页面正常显示（回归：过渡状态机卡死）', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main h1, main h2').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.page-transition-overlay')).toHaveCount(0, { timeout: 5000 });

  const navLinks = page.locator('header nav a');
  await expect(navLinks).toHaveCount(6);

  // 3 轮快速连点（间隔远小于过渡窗口，制造挂起/合并）
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 6; i++) {
      await navLinks.nth(i).click({ force: true });
      await page.waitForTimeout(100);
    }
  }

  // 等待全部过渡结束
  await expect(page.locator('.page-transition-overlay')).toHaveCount(0, { timeout: 10_000 });
  await page.waitForTimeout(500);

  // main 必须渲染出内容（历史 bug：这里只剩注释节点）
  const children = await page.locator('main').evaluate((el) => el.children.length);
  expect(children).toBeGreaterThan(0);
});
