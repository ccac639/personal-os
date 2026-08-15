import { expect, test } from '@playwright/test';

/**
 * 核心导航冒烟：Projects / Sub2API / Achievements 三个高频模块页面可渲染。
 * （Blog 预览：前端无 blog 页面，02-blog 内容线 A/B 未决；页面落地后补 e2e。）
 */
test('核心导航冒烟：三个高频模块页面渲染', async ({ page }) => {
  await page.goto('/');

  // Projects 工作台
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: '开发中' })).toBeVisible({ timeout: 15_000 });

  // Sub2API 控制台
  await page.goto('/sub2api');
  await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 15_000 });
  await expect(page).not.toHaveURL(/not-found/);

  // Achievements 成果展示
  await page.goto('/achievements');
  await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 15_000 });
  await expect(page).not.toHaveURL(/not-found/);
});
