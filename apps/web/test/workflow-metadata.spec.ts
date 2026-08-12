import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useWorkflowStore } from '@/features/workflows/store';
import { parseWorkflowJson } from '@/features/workflows/migrate';
import { validateDataShape } from '@/features/workflows/schema';

describe('workflow 元数据与列表摘要', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('renameActive：工具栏重命名可撤销 / 重做', () => {
    const store = useWorkflowStore();
    store.createWorkflow('A');
    store.renameActive('A v2');
    expect(store.name).toBe('A v2');

    store.undo();
    expect(store.name).toBe('A');
    store.redo();
    expect(store.name).toBe('A v2');

    // 空名称 / 相同名称不产生历史
    store.renameActive('   ');
    store.renameActive('A v2');
    store.undo();
    expect(store.name).toBe('A');
  });

  it('撤销恢复多选状态（框选 / 多选不丢失）', () => {
    const store = useWorkflowStore();
    store.addNode('trigger');
    store.addNode('ai');
    store.addNode('code');
    store.selectMany(['n-1', 'n-2', 'n-3']);
    expect(store.selectedIds).toHaveLength(3);

    // 一个可撤销操作（如改配置）后撤销，应恢复多选
    store.updateNodeData('n-2', { prompt: 'p' });
    expect(store.selectedIds).toHaveLength(3);
    store.undo();
    expect(store.selectedIds).toEqual(['n-1', 'n-2', 'n-3']);
    expect(store.selectedId).toBe('n-1');
  });

  it('updateMeta：描述 / 标签可撤销，列表元数据同步', () => {
    const store = useWorkflowStore();
    const id = store.createWorkflow('工作流');
    store.updateMeta(id, { description: '每日摘要', tags: ['每日', '摘要'] });

    const meta = store.workflows.find((w) => w.id === id)!;
    expect(meta.description).toBe('每日摘要');
    expect(meta.tags).toEqual(['每日', '摘要']);
    expect(meta.favorite).toBe(false);
    expect(meta.isTemplate).toBe(false);
    expect(meta.versionCount).toBe(0);

    store.toggleFavorite(id);
    expect(store.workflows.find((w) => w.id === id)!.favorite).toBe(true);
    expect(store.favoriteWorkflows.map((w) => w.id)).toContain(id);

    // 元数据修改可撤销（描述 + 收藏一次撤销）
    store.undo();
    expect(store.workflows.find((w) => w.id === id)!.favorite).toBe(false);
  });

  it('最近运行摘要：lastRun 含状态 / 时间 / 耗时，列表元数据透出', async () => {
    const store = useWorkflowStore();
    const id = store.createWorkflow('运行摘要');
    store.addNode('trigger', { x: 0, y: 0 });
    store.addNode('output', { x: 300, y: 0 });
    store.addEdge({ source: 'n-1', target: 'n-2' });
    await store.runWorkflow('full');

    const meta = store.workflows.find((w) => w.id === id)!;
    expect(meta.lastRun?.status).toBe('success');
    expect(typeof meta.lastRun?.at).toBe('number');
    expect(meta.lastRun?.durationMs).toBeGreaterThanOrEqual(0);
    expect(meta.lastRun?.logs.length).toBeGreaterThan(0);
  });

  it('列表排序：最近编辑 / 名称 / 最近运行', () => {
    const store = useWorkflowStore();
    const a = store.createWorkflow('Alpha');
    const b = store.createWorkflow('Beta');
    // 调整 updatedAt 保证确定性
    const recA = store.records.find((r) => r.id === a)!;
    const recB = store.records.find((r) => r.id === b)!;
    recA.updatedAt = 2000;
    recB.updatedAt = 1000;

    const byUpdated = [...store.workflows].map((w) => w.name);
    expect(byUpdated).toEqual(['Alpha', 'Beta']);
  });
});

describe('workflow 数据形状校验（导入严格性）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('validateDataShape：枚举与类型检查', () => {
    expect(
      validateDataShape({ kind: 'delay', label: 'd', status: 'idle', delayUnit: 'hrs' as never }),
    ).toEqual(expect.arrayContaining([expect.stringContaining('delayUnit')]));
    expect(
      validateDataShape({
        kind: 'notify',
        label: 'n',
        status: 'idle',
        level: 'urgent' as never,
      }),
    ).toEqual(expect.arrayContaining([expect.stringContaining('level')]));
    expect(
      validateDataShape({ kind: 'ai', label: 'a', status: 'idle', temperature: 'hot' as never }),
    ).toEqual(expect.arrayContaining([expect.stringContaining('temperature')]));
    expect(validateDataShape({ kind: 'trigger', label: 't', status: 'idle' })).toEqual([]);
  });

  it('导入：错误 schema（非法枚举 / 类型）被明确拒绝', () => {
    const badLevel = parseWorkflowJson(
      JSON.stringify({
        name: 'x',
        nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { kind: 'notify', level: 'urgent' } }],
        edges: [],
      }),
    );
    expect(badLevel.ok).toBe(false);
    expect(badLevel.preview.errors.some((e) => e.includes('level 无效'))).toBe(true);

    const badDelay = parseWorkflowJson(
      JSON.stringify({
        name: 'x',
        nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { kind: 'delay', delayUnit: 'hrs' } }],
        edges: [],
      }),
    );
    expect(badDelay.ok).toBe(false);
    expect(badDelay.preview.errors.some((e) => e.includes('delayUnit'))).toBe(true);
  });

  it('store.importJson：错误 schema 拒绝，合法数据通过', () => {
    const store = useWorkflowStore();
    expect(
      store.importJson(
        JSON.stringify({
          name: 'bad',
          nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { kind: 'output', format: 'pdf' } }],
          edges: [],
        }),
      ),
    ).toBe(false);

    expect(
      store.importJson(
        JSON.stringify({
          name: 'ok',
          nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { kind: 'output', format: 'json' } }],
          edges: [],
        }),
      ),
    ).toBe(true);
  });
});
