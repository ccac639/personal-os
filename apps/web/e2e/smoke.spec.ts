import { expect, test } from '@playwright/test';

test('首页渲染 Dashboard', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
