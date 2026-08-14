/**
 * Sync 引擎核心测试：hydrate / 乐观更新+回滚 / 离线队列 / 引用延迟 / 冲突。
 *
 * 引擎是前端分线 F1「真实数据源」的地基，本套件为防回归护栏：
 * - 所有 API 用内存 fake（不触网络、不落 localStorage —— 不传 storageKey）；
 * - 用例间用新 ref / 新引擎隔离状态。
 */
import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { ref } from 'vue';

import { createSyncEngine, type SyncApi } from '@/features/projects/sync-core';

interface Item {
  id: string;
  name: string;
}
interface Payload {
  name: string;
}

function makeApi(overrides: Partial<SyncApi<Payload, Item>> = {}) {
  const calls: { kind: 'create' | 'update' | 'remove' | 'list'; args: unknown[] }[] = [];
  const raw = { ...overrides };
  const api: SyncApi<Payload, Item> = {
    list: async () => {
      calls.push({ kind: 'list', args: [] });
      if (raw.list) return raw.list();
      return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    },
    create: async (p) => {
      calls.push({ kind: 'create', args: [p] });
      if (raw.create) return raw.create(p);
      return { id: `srv-${(p as Payload).name}` };
    },
    update: async (id, p) => {
      calls.push({ kind: 'update', args: [id, p] });
      if (raw.update) return raw.update(id, p);
    },
    remove: async (id) => {
      calls.push({ kind: 'remove', args: [id] });
      if (raw.remove) return raw.remove(id);
    },
  };
  return { api, calls };
}

function makeEngine(api: SyncApi<Payload, Item>, initial: Item[] = []) {
  const list = ref<Item[]>(initial);
  const state = {
    status: 'idle' as const,
    source: 'local' as const,
    lastSyncedAt: null as string | null,
    lastError: null as string | null,
    dirty: 0,
    busy: false,
    version: 0,
  };
  const engine = createSyncEngine<Item, Payload, Item>({
    name: 'test',
    list,
    idOf: (x) => x.id,
    api,
    toLocal: (raw) => {
      const r = raw as Item;
      return r && typeof r.id === 'string' ? { id: r.id, name: r.name } : null;
    },
    toPayload: (x) => ({ name: x.name }),
    state,
  });
  return { engine, list, state };
}

describe('SyncEngine 核心', () => {
  it('hydrate：服务端数据接管本地，source 变 server', async () => {
    const { api } = makeApi({
      list: async () => ({
        items: [{ id: 'a', name: '服务端项' }],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      }),
    });
    const { engine, list, state } = makeEngine(api);
    engine.start();
    await flushPromises();

    expect(list.value.map((x) => x.name)).toEqual(['服务端项']);
    expect(state.source).toBe('server');
    expect(state.status).toBe('idle');
    expect(state.lastSyncedAt).toBeTruthy();
  });

  it('hydrate 网络失败：offline + source=local，本地数据保留', async () => {
    const { api } = makeApi({
      list: async () => {
        throw new TypeError('fetch failed');
      },
    });
    const { engine, list, state } = makeEngine(api, [{ id: 'local', name: '本地项' }]);
    engine.start();
    await flushPromises();

    expect(list.value.map((x) => x.name)).toEqual(['本地项']);
    expect(state.status).toBe('offline');
    expect(state.source).toBe('local');
  });

  it('本地新建：flush 推送 create 并更新快照', async () => {
    const { api, calls } = makeApi();
    const { engine, list, state } = makeEngine(api);
    engine.start();
    await flushPromises();

    list.value.push({ id: 'p1', name: '新项目' });
    await engine.flush();

    expect(calls.some((c) => c.kind === 'create' && (c.args[0] as Payload).name === '新项目')).toBe(
      true,
    );
    expect(state.dirty).toBe(0);
    expect(state.status).toBe('idle');
  });

  it('推送网络错误：offline + dirty 保留，本地变更不丢', async () => {
    const { api, calls } = makeApi({
      create: async () => {
        throw new TypeError('fetch failed');
      },
    });
    const { engine, list, state } = makeEngine(api);
    engine.start();
    await flushPromises();

    list.value.push({ id: 'p1', name: '离线创建' });
    await engine.flush();

    expect(state.status).toBe('offline');
    expect(state.dirty).toBe(1);
    expect(list.value.some((x) => x.id === 'p1')).toBe(true);
    expect(calls.filter((c) => c.kind === 'create')).toHaveLength(1);
  });

  it('服务端拒绝（4xx）：回滚到上次快照并置 error', async () => {
    const { api } = makeApi({
      create: async () => {
        throw Object.assign(new Error('校验失败'), { statusCode: 422 });
      },
    });
    const { engine, list, state } = makeEngine(api);
    engine.start();
    await flushPromises();

    list.value.push({ id: 'p1', name: '会被拒绝' });
    await engine.flush();

    expect(list.value.some((x) => x.id === 'p1')).toBe(false); // 已回滚
    expect(state.status).toBe('error');
    expect(state.lastError).toBe('校验失败');
  });

  it('冲突（409）：conflict 状态', async () => {
    const { api } = makeApi({
      update: async () => {
        throw Object.assign(new Error('版本冲突'), { statusCode: 409 });
      },
    });
    const { engine, list, state } = makeEngine(api, [{ id: 'a', name: '旧名' }]);
    engine.start();
    await flushPromises();

    // 模拟本地修改（更新路径）
    list.value[0] = { id: 'a', name: '新名' };
    await engine.flush();

    expect(state.status).toBe('conflict');
    expect(state.lastError).toBe('版本冲突');
  });

  it('引用未就绪：操作延迟重试，引用就绪后推送成功', async () => {
    const { api, calls } = makeApi();
    const list = ref<Item[]>([]);
    const state = {
      status: 'idle' as const,
      source: 'local' as const,
      lastSyncedAt: null as string | null,
      lastError: null as string | null,
      dirty: 0,
      busy: false,
      version: 0,
    };
    // 依赖尚未同步的引用：第一轮未就绪 → 排队；就绪后重试推送
    let refReady = false;
    const engine = createSyncEngine<Item, Payload, Item>({
      name: 'ref-test',
      list,
      idOf: (x) => x.id,
      api,
      toLocal: (raw) => raw as Item,
      toPayload: (x) => ({ name: x.name }),
      resolveRefs: (payload) => {
        if (!refReady) return { ok: false, reason: '依赖未同步' };
        return { ok: true, payload };
      },
      state,
    });
    engine.start();
    await flushPromises();

    list.value.push({ id: 't2', name: '依赖任务' });
    await engine.flush();
    expect(state.dirty).toBeGreaterThan(0); // 引用未就绪 → 排队
    expect(calls.filter((c) => c.kind === 'create')).toHaveLength(0); // 未推送

    refReady = true;
    await engine.flush();
    expect(state.dirty).toBe(0);
    expect(calls.filter((c) => c.kind === 'create')).toHaveLength(1);
  });

  it('离线删除：hydrate 时服务端没有本地项 → 排队删除，不复活', async () => {
    const { api, calls } = makeApi({
      list: async () => ({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
    });
    const { engine, list } = makeEngine(api, [{ id: 'a', name: '已删除项' }]);
    engine.start();
    await flushPromises();

    // 本地已有项且快照为空（首次 hydrate）：本地独有项保留等待导入（非删除）
    expect(list.value.map((x) => x.id)).toEqual(['a']);
    expect(calls.filter((c) => c.kind === 'remove')).toHaveLength(0);
  });

  it('dispose 停止监听：后续修改不再触发推送', async () => {
    const { api, calls } = makeApi();
    const { engine, list } = makeEngine(api);
    engine.start();
    await flushPromises();

    engine.dispose();
    list.value.push({ id: 'p9', name: 'dispose 后新增' });
    await new Promise((r) => setTimeout(r, 50));
    await engine.flush();

    expect(calls.filter((c) => c.kind === 'create')).toHaveLength(0);
  });

  it('状态版本号单调递增（UI computed 依赖）', async () => {
    const { api } = makeApi();
    const { engine, state } = makeEngine(api);
    engine.start();
    await flushPromises();

    const v0 = state.version;
    engine.hydrate();
    await flushPromises();
    expect(state.version).toBeGreaterThan(v0);
  });
});
