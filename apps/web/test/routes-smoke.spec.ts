/**
 * 路由注册 smoke 测试
 *
 * 覆盖任务三的 /ai 路由注册：路径 / 名称 / 标题 / 懒加载组件可解析。
 * 禁止文件存在但路由不可达的孤儿态。
 */
import { describe, expect, it } from 'vitest';
import { routes } from '@/router/routes';

describe('路由注册 smoke', () => {
  it('/ai 路由已注册（懒加载 + meta.title）且组件模块可解析', async () => {
    const ai = routes.find((r) => r.path === '/ai');
    expect(ai).toBeDefined();
    expect(ai!.name).toBe('ai');
    expect(ai!.meta?.title).toBe('AI 工作台');
    // 懒加载组件为函数；解析后拿到组件模块（证明页面文件存在且可编译）
    const loader = ai!.component as () => Promise<unknown>;
    expect(typeof loader).toBe('function');
    await expect(loader()).resolves.toBeDefined();
  });

  it('/ai 不在 404 兜底之后（避免被通配路由吞掉）', () => {
    const idx = routes.findIndex((r) => r.path === '/ai');
    const notFound = routes.findIndex((r) => r.name === 'not-found');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(notFound).toBeGreaterThan(idx);
  });
});
