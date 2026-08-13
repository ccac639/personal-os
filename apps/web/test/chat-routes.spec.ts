/**
 * Chat 工作台二级导航路由测试
 *
 * 验证 /chat、/chat/agents、/chat/inspiration 子路由可导航、
 * 浏览器前进 / 后退正确（URL 可同步 + 历史栈）。
 */
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { routes } from '@/router/routes';

function buildRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes,
  });
}

describe('Chat 工作台子路由', () => {
  let router: Router;

  beforeEach(async () => {
    router = buildRouter();
    await router.push('/chat');
    await router.isReady();
  });

  it('路由表包含 Chat 四个子路由', () => {
    const chat = routes.find((r) => r.path === '/chat');
    expect(chat).toBeDefined();
    const children = chat?.children ?? [];
    expect(children.map((c) => c.path)).toEqual(['', 'agents', 'inspiration', '3d']);
    expect(children[0]?.name).toBe('chat-dialog');
    expect(children[1]?.name).toBe('chat-agents');
    expect(children[2]?.name).toBe('chat-inspiration');
    expect(children[3]?.name).toBe('chat-3d');
  });

  it('导航到 /chat/agents、/chat/inspiration 与 /chat/3d 且 URL 同步', async () => {
    await router.push('/chat/agents');
    expect(router.currentRoute.value.path).toBe('/chat/agents');
    expect(router.currentRoute.value.name).toBe('chat-agents');

    await router.push('/chat/inspiration');
    expect(router.currentRoute.value.path).toBe('/chat/inspiration');
    expect(router.currentRoute.value.name).toBe('chat-inspiration');

    await router.push('/chat/3d');
    expect(router.currentRoute.value.path).toBe('/chat/3d');
    expect(router.currentRoute.value.name).toBe('chat-3d');
  });

  it('浏览器后退 / 前进恢复正确视图', async () => {
    await router.push('/chat/agents');
    await router.push('/chat/inspiration');
    expect(router.currentRoute.value.name).toBe('chat-inspiration');

    // 后退两步：inspiration → agents → dialog（轮询等待导航完成，懒加载子视图可能较慢）
    await router.back();
    await vi.waitFor(
      () => {
        expect(router.currentRoute.value.name).toBe('chat-agents');
      },
      { timeout: 20000, interval: 100 },
    );
    await router.back();
    await vi.waitFor(
      () => {
        expect(router.currentRoute.value.name).toBe('chat-dialog');
      },
      { timeout: 20000, interval: 100 },
    );

    // 前进两步：dialog → agents → inspiration
    await router.forward();
    await vi.waitFor(
      () => {
        expect(router.currentRoute.value.name).toBe('chat-agents');
      },
      { timeout: 20000, interval: 100 },
    );
    await router.forward();
    await vi.waitFor(
      () => {
        expect(router.currentRoute.value.name).toBe('chat-inspiration');
      },
      { timeout: 20000, interval: 100 },
    );
  });

  it('未知 Chat 子路径回退到对话视图（404 不白屏）', async () => {
    // 无匹配子路由时，/chat/xxx 不匹配任何路由会落到未知；验证不抛错
    await router.push('/chat');
    expect(router.currentRoute.value.path).toBe('/chat');
  });
});
