import { expect, test } from '@playwright/test';

/**
 * Chat 发送往返冒烟：
 * - 打开 Chat 工作台 → 输入消息 → Enter 发送；
 * - 后端不可达（本地 e2e 无 API 服务）→ HttpChatReplyService 降级 mock 回复，
 *   mock 回复含「本地演示」署名（验证真实优先 + 降级链路端到端可用）。
 */
test('Chat 发送消息获得回复（真实优先 + mock 降级往返）', async ({ page }) => {
  await page.goto('/chat');
  const composer = page.getByRole('textbox', { name: '消息输入框' });
  await expect(composer).toBeVisible({ timeout: 15_000 });

  await composer.fill('帮我写一个 Vue 组件');
  await composer.press('Enter');

  // mock 回复（降级）最终渲染完成：署名「本地演示」
  await expect(page.getByText('本地演示').first()).toBeVisible({ timeout: 20_000 });
  // 用户消息保留在会话中
  await expect(page.getByText('帮我写一个 Vue 组件').first()).toBeVisible();
});
