import { expect, test } from '@playwright/test';

test('首页渲染 Dashboard', async ({ page }) => {
  await page.goto('/');
  // vite 冷启动会触发依赖预构建/页面重载，等 Dashboard 真实区块渲染
  await expect(page.getByRole('heading', { name: '今日工作台' })).toBeVisible({
    timeout: 20_000,
  });
});
