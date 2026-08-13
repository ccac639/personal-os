import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useWorkflowStore } from '@/features/workflows/store';
import {
  LEGACY_STORAGE_KEY,
  STORAGE_KEY_V3,
  ensureV4Defaults,
  parseWorkflowJson,
  saveAllWorkflows,
  defaultRunConfig,
} from '@/features/workflows/migrate';
import type { StoredWorkflow } from '@/features/workflows/migrate';

const baseRecord: StoredWorkflow = {
  id: 'wf-1',
  name: '旧数据',
  updatedAt: 1,
  seq: 3,
  nodes: [
    { id: 'a', position: { x: 0, y: 0 }, data: { kind: 'trigger', label: 'T', status: 'idle' } },
  ],
  edges: [],
};

describe('workflow v4 迁移与持久化', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('ensureV4Defaults：旧记录自动补齐契约与运行配置，节点配置不丢失', () => {
    const rec = ensureV4Defaults(baseRecord);
    expect(rec.inputs).toEqual([]);
    expect(rec.outputs).toEqual([]);
    expect(rec.modules).toEqual([]);
    expect(rec.runConfig).toEqual(defaultRunConfig());
    expect(rec.nodes[0]!.data.kind).toBe('trigger');
    expect(rec.nodes[0]!.data.label).toBe('T');
  });

  it('saveAllWorkflows 写 v4 信封；读取兼容 v3 数据', () => {
    expect(saveAllWorkflows([baseRecord])).toBe(true);
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY_V3)!);
    expect(raw.version).toBe(4);
    expect(raw.workflows[0].inputs).toEqual([]);

    // 预置 v3 信封，load 应正常迁移
    localStorage.setItem(STORAGE_KEY_V3, JSON.stringify({ version: 3, workflows: [baseRecord] }));
    const store = useWorkflowStore();
    store.load();
    expect(store.workflows).toHaveLength(1);
    expect(store.inputDefs).toEqual([]);
    expect(store.outputDefs).toEqual([]);
    expect(store.runConfig).toBeTruthy();
  });

  it('损坏数据：非阻塞警告，页面保持可用', () => {
    localStorage.setItem(STORAGE_KEY_V3, '{broken');
    const store = useWorkflowStore();
    const result = store.load();
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(store.workflows).toHaveLength(0);
  });

  it('写入失败：saveAllWorkflows 返回 false 而非抛出', () => {
    // 模拟 localStorage.setItem 抛错
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('quota');
    };
    try {
      expect(saveAllWorkflows([baseRecord])).toBe(false);
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it('导入过新版本：明确拒绝', () => {
    const r = parseWorkflowJson(JSON.stringify({ version: 99, workflows: [baseRecord] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.preview.errors.some((e) => e.includes('过新'))).toBe(true);
  });

  it('导入预览展示名称/节点数/边数/输入输出/模块数量', () => {
    const json = JSON.stringify({
      version: 4,
      workflows: [
        {
          ...baseRecord,
          inputs: [{ name: 'role', label: '角色', type: 'text', required: true }],
          outputs: [{ name: 'out', type: 'any', source: 'a' }],
          modules: [
            {
              id: 'mod-1',
              name: 'M',
              version: 1,
              nodes: [
                {
                  id: 'a',
                  position: { x: 0, y: 0 },
                  data: { kind: 'trigger', label: 'T', status: 'idle' },
                },
              ],
              edges: [],
              ports: [],
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        },
      ],
    });
    const r = parseWorkflowJson(json);
    expect(r.ok).toBe(true);
    expect(r.preview.version).toBe(4);
    expect(r.preview.nodeCount).toBe(1);
    expect(r.preview.inputCount).toBe(1);
    expect(r.preview.outputCount).toBe(1);
    expect(r.preview.moduleCount).toBe(1);
  });

  it('导入校验：模块引用不存在的工作流节点 → 错误，不部分写入', () => {
    const json = JSON.stringify({
      version: 4,
      workflows: [
        {
          ...baseRecord,
          modules: [
            {
              id: 'mod-1',
              name: 'M',
              version: 1,
              nodes: [
                {
                  id: 'ghost',
                  position: { x: 0, y: 0 },
                  data: { kind: 'trigger', label: 'T', status: 'idle' },
                },
              ],
              edges: [],
              ports: [],
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        },
      ],
    });
    const r = parseWorkflowJson(json);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.preview.errors.some((e) => e.includes('不在工作流节点'))).toBe(true);
  });

  it('导入校验：子流程自引用被拒绝', () => {
    const json = JSON.stringify({
      version: 4,
      workflows: [
        {
          ...baseRecord,
          id: 'wf-self',
          nodes: [
            {
              id: 's',
              position: { x: 0, y: 0 },
              data: { kind: 'subworkflow', label: '子', status: 'idle', workflowRef: 'wf-self' },
            },
          ],
        },
      ],
    });
    const r = parseWorkflowJson(json);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.preview.errors.some((e) => e.includes('自引用'))).toBe(true);
  });

  it('legacy 单工作流仍可迁移（v1 → v4）', () => {
    localStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify({ name: '老流程', seq: 2, nodes: baseRecord.nodes, edges: [] }),
    );
    const store = useWorkflowStore();
    const result = store.load();
    expect(result.source).toBe('legacy');
    expect(store.records[0]!.runConfig).toBeTruthy();
    expect(store.records[0]!.inputs).toEqual([]);
  });
});
