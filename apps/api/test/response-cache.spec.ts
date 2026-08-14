import { describe, expect, it } from 'vitest';

import { ResponseCache, type CacheStoreLike } from '../src/common/cache/response-cache.js';

/** 内存 fake 缓存 store：get/set/del，可注入延迟 */
class FakeStore implements CacheStoreLike {
  private readonly map = new Map<string, { value: string; ttlMs: number }>();
  getCalls = 0;

  async get(key: string): Promise<string | null> {
    this.getCalls += 1;
    return this.map.get(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlMs: number): Promise<number> {
    this.map.set(key, { value, ttlMs });
    return 1;
  }

  async del(key: string): Promise<number> {
    return this.map.delete(key) ? 1 : 0;
  }

  size(): number {
    return this.map.size;
  }
}

describe('ResponseCache（单元）', () => {
  it('首次未命中 → 执行 loader 并写入；后续命中 → 不再执行 loader', async () => {
    const store = new FakeStore();
    const cache = new ResponseCache(store, 'c:');
    let loads = 0;

    const key = cache.keyFor('/api/articles', { page: 1 });
    expect(key).toBe('c:/api/articles?page=1');

    const first = await cache.wrap(key, 1000, async () => {
      loads += 1;
      return '{"items":[]}';
    });
    expect(first).toBe('{"items":[]}');
    expect(loads).toBe(1);

    const second = await cache.wrap(key, 1000, async () => {
      loads += 1;
      return 'never';
    });
    expect(second).toBe('{"items":[]}');
    expect(loads).toBe(1); // loader 未再执行
    expect(store.size()).toBe(1);
  });

  it('并发同键 → 只执行一次 loader（防踩踏 singleflight）', async () => {
    const store = new FakeStore();
    const cache = new ResponseCache(store, 'c:');
    let loads = 0;

    const key = 'c:/api/articles';
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        cache.wrap(key, 1000, async () => {
          loads += 1;
          await new Promise((r) => setTimeout(r, 5));
          return 'payload';
        }),
      ),
    );

    expect(loads).toBe(1);
    expect(results.every((r) => r === 'payload')).toBe(true);
  });

  it('不同键互不干扰（不串键）', async () => {
    const store = new FakeStore();
    const cache = new ResponseCache(store, 'c:');

    const k1 = cache.keyFor('/api/articles', { page: 1, tag: 'nuxt' });
    const k2 = cache.keyFor('/api/articles', { tag: 'nuxt', page: 1 }); // 顺序无关
    const k3 = cache.keyFor('/api/articles', { page: 2, tag: 'nuxt' });

    expect(k1).toBe(k2); // 查询参数排序规范化 → 同键
    expect(k1).not.toBe(k3); // 不同查询 → 不同键

    await cache.wrap(k1, 1000, async () => 'A');
    const got = await cache.wrap(k3, 1000, async () => 'B');
    expect(got).toBe('B'); // 新键未命中 → loader 执行
    expect((await cache.wrap(k1, 1000, async () => 'X')).toString()).toBe('A');
    expect((await cache.wrap(k3, 1000, async () => 'Y')).toString()).toBe('B');
  });

  it('invalidate 删除键与进行中的任务', async () => {
    const store = new FakeStore();
    const cache = new ResponseCache(store, 'c:');
    const key = 'c:/api/config';

    await cache.wrap(key, 1000, async () => 'old');
    expect(store.size()).toBe(1);

    await cache.invalidate(key);
    expect(store.size()).toBe(0);

    const reloaded = await cache.wrap(key, 1000, async () => 'new');
    expect(reloaded).toBe('new');
  });

  it('keyFor 空查询 → 仅路径', () => {
    const cache = new ResponseCache(new FakeStore(), 'c:');
    expect(cache.keyFor('/api/articles', {})).toBe('c:/api/articles');
  });
});
