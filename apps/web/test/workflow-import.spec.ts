import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useWorkflowStore } from '@/features/workflows/store';
import {
  parseWorkflowJson,
  sanitizeNodeData,
  snapshotSignature,
  LEGACY_STORAGE_KEY,
  STORAGE_KEY_V2,
  STORAGE_KEY_V3,
} from '@/features/workflows/migrate';

describe('workflow 导入校验', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('未知节点类型：明确错误，不静默丢失', () => {
    const r = parseWorkflowJson(
      JSON.stringify({
        name: 'x',
        nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { kind: 'magic' } }],
        edges: [],
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.preview.errors.some((e) => e.includes('未知节点类型'))).toBe(true);
    expect(r.preview.errors.some((e) => e.includes('magic'))).toBe(true);
  });

  it('孤立边：引用不存在节点 → 错误', () => {
    const r = parseWorkflowJson(
      JSON.stringify({
        name: 'x',
        nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { kind: 'trigger' } }],
        edges: [{ id: 'e', source: 'a', target: 'missing' }],
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.preview.errors.some((e) => e.includes('不存在的节点'))).toBe(true);
  });

  it('损坏配置：缺 position / 缺 data → 错误', () => {
    const noPos = parseWorkflowJson(
      JSON.stringify({ nodes: [{ id: 'a', data: { kind: 'trigger' } }], edges: [] }),
    );
    expect(noPos.ok).toBe(false);
    expect(noPos.preview.errors.some((e) => e.includes('position'))).toBe(true);

    const noData = parseWorkflowJson(
      JSON.stringify({ nodes: [{ id: 'a', position: { x: 0, y: 0 } }], edges: [] }),
    );
    expect(noData.ok).toBe(false);
    expect(noData.preview.errors.some((e) => e.includes('data'))).toBe(true);
  });

  it('过新版本信封：明确拒绝', () => {
    const r = parseWorkflowJson(
      JSON.stringify({
        version: 99,
        workflows: [{ name: 'x', nodes: [], edges: [] }],
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.preview.errors.some((e) => e.includes('版本过新'))).toBe(true);
  });

  it('v3 信封多工作流：导入第一个并警告', () => {
    const r = parseWorkflowJson(
      JSON.stringify({
        version: 3,
        workflows: [
          { name: 'A', nodes: [], edges: [] },
          { name: 'B', nodes: [], edges: [] },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.preview.name).toBe('A');
    expect(r.preview.warnings.some((w) => w.includes('仅导入第一个'))).toBe(true);
  });

  it('合法快照：预览信息正确，导入为新工作流', () => {
    const text = JSON.stringify({
      name: '导入',
      seq: 3,
      nodes: [
        { id: 'a', position: { x: 1, y: 2 }, data: { kind: 'trigger', cron: '0 1 * * *' } },
        { id: 'b', position: { x: 300, y: 2 }, data: { kind: 'output' } },
      ],
      edges: [{ id: 'e', source: 'a', target: 'b', type: 'smoothstep' }],
    });
    const r = parseWorkflowJson(text);
    expect(r.ok).toBe(true);
    expect(r.preview.nodeCount).toBe(2);
    expect(r.preview.edgeCount).toBe(1);
    expect(r.preview.errors).toEqual([]);

    const store = useWorkflowStore();
    expect(store.importJson(text)).toBe(true);
    expect(store.workflows).toHaveLength(1);
    expect(store.name).toBe('导入');
  });

  it('导出脱敏：敏感字段被剔除，普通字段保留', () => {
    const cleaned = sanitizeNodeData({
      kind: 'ai',
      label: 'x',
      status: 'idle',
      prompt: 'p',
      apiKey: 'sk-123',
      token: 'abc',
      config: { password: 'secret', keep: 1 },
    });
    expect(cleaned.prompt).toBe('p');
    expect('apiKey' in cleaned).toBe(false);
    expect('token' in cleaned).toBe(false);
    const config = cleaned.config as Record<string, unknown>;
    expect('password' in config).toBe(false);
    expect(config.keep).toBe(1);
  });

  it('快照签名：结构相同签名一致，变化则不同', () => {
    const mkNodes = () => [
      { id: 'a', position: { x: 0, y: 0 }, data: { kind: 'trigger', label: 't' } },
    ];
    const nodes1 = mkNodes() as never[];
    const nodes2 = mkNodes() as never[];
    const edges1 = [{ id: 'e', source: 'a', target: 'b' }];
    expect(snapshotSignature(nodes1 as never, edges1)).toBe(
      snapshotSignature(nodes2 as never, edges1),
    );
    expect(snapshotSignature(nodes1 as never, edges1)).not.toBe(
      snapshotSignature(nodes1 as never, []),
    );
  });

  it('导出文件内容不含敏感数据（store 级）', () => {
    const store = useWorkflowStore();
    store.addNode('ai');
    store.updateNodeData('n-1', { prompt: 'p', apiKey: 'sk-leak' } as never);
    const json = store.exportJson();
    expect(json).not.toContain('sk-leak');
    expect(json).not.toContain('apiKey');
  });
});

describe('workflow 持久化与迁移', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('旧版 v2 数组自动迁移为 v3 信封，数据保留', () => {
    localStorage.setItem(
      STORAGE_KEY_V2,
      JSON.stringify([
        {
          id: 'wf-old',
          name: '旧工作流',
          updatedAt: 1,
          seq: 5,
          nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { kind: 'notify', label: '提醒' } }],
          edges: [],
        },
      ]),
    );
    const store = useWorkflowStore();
    const result = store.load();
    expect(result.source).toBe('v2');
    expect(store.workflows).toHaveLength(1);
    expect(store.name).toBe('旧工作流');
    // 已写为 v4 信封（v3 → v4 升级，旧数据自动补契约默认值）
    const v4 = JSON.parse(localStorage.getItem(STORAGE_KEY_V3)!);
    expect(v4.version).toBe(4);
    expect(v4.workflows).toHaveLength(1);
    expect(v4.workflows[0].inputs).toEqual([]);
    expect(v4.workflows[0].outputs).toEqual([]);
    expect(v4.workflows[0].runConfig).toBeTruthy();
    expect(v4.workflows[0].modules).toEqual([]);
  });

  it('旧版单工作流（v1）迁移', () => {
    localStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify({
        name: '单工作流',
        seq: 3,
        nodes: [
          { id: 'a', position: { x: 0, y: 0 }, data: { kind: 'trigger', cron: '0 1 * * *' } },
        ],
        edges: [],
      }),
    );
    const store = useWorkflowStore();
    const result = store.load();
    expect(result.source).toBe('legacy');
    expect(store.name).toBe('单工作流');
    expect(store.nodes[0]!.data.cron).toBe('0 1 * * *');
  });

  it('迁移幂等：重复 load 不产生重复数据', () => {
    const store = useWorkflowStore();
    store.createWorkflow('A');
    store.save();
    store.load();
    expect(store.workflows).toHaveLength(1);
  });

  it('损坏 localStorage：JSON 解析失败安全返回空', () => {
    localStorage.setItem(STORAGE_KEY_V3, '{broken json');
    localStorage.setItem(STORAGE_KEY_V2, 'not-json');
    const store = useWorkflowStore();
    const result = store.load();
    expect(result.records).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(store.workflows).toHaveLength(0);
  });

  it('未知节点类型在迁移中被安全丢弃并警告', () => {
    localStorage.setItem(
      STORAGE_KEY_V2,
      JSON.stringify([
        {
          id: 'w',
          name: 'x',
          updatedAt: 1,
          seq: 1,
          nodes: [
            { id: 'ok', position: { x: 0, y: 0 }, data: { kind: 'trigger' } },
            { id: 'bad', position: { x: 0, y: 0 }, data: { kind: 'alien' } },
          ],
          edges: [],
        },
      ]),
    );
    const store = useWorkflowStore();
    const result = store.load();
    expect(store.nodes.map((n) => n.id)).toEqual(['ok']);
    expect(result.warnings.some((w) => w.includes('alien'))).toBe(true);
  });

  it('保存失败：内存状态继续可用，persistError 非阻塞提示', () => {
    const store = useWorkflowStore();
    store.createWorkflow('A');
    store.addNode('trigger');
    // 模拟存储不可用
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const ok = store.save();
    expect(ok).toBe(false);
    expect(store.persistError).toContain('保存失败');
    // 内存仍可用
    expect(store.nodes).toHaveLength(1);
    expect(store.name).toBe('A');
    spy.mockRestore();
  });

  it('保存成功后 persistError 清空', () => {
    const store = useWorkflowStore();
    store.createWorkflow('A');
    store.save();
    expect(store.persistError).toBeNull();
  });
});
