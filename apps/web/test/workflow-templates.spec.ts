import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useWorkflowStore } from '@/features/workflows/store';
import {
  buildTemplate,
  loadTemplates,
  parseTemplateJson,
  saveTemplates,
  TEMPLATES_STORAGE_KEY,
} from '@/features/workflows/templates';
import type { WorkflowNodeModel } from '@/features/workflows/types';

function mk(id: string, kind: WorkflowNodeModel['data']['kind'] = 'trigger'): WorkflowNodeModel {
  return {
    id,
    type: 'custom',
    position: { x: 0, y: 0 },
    data: { kind, label: id, status: 'idle' },
  };
}

describe('workflow 节点模板（数据层）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('buildTemplate：剥离运行时状态与敏感字段，只保留内部边', () => {
    const tpl = buildTemplate(
      '子流程',
      [
        {
          ...mk('a'),
          data: { kind: 'trigger', label: 'a', status: 'success', apiKey: 'sk-x' } as never,
        },
        mk('b', 'ai'),
        mk('c', 'notify'),
      ],
      [
        { id: 'e-1', source: 'a', target: 'b' },
        { id: 'e-2', source: 'b', target: 'c' },
        { id: 'e-3', source: 'a', target: 'missing' }, // 孤立边应被剔除
      ],
    );
    expect(tpl.nodes).toHaveLength(3);
    expect(tpl.nodes.every((n) => n.data.status === 'idle')).toBe(true);
    expect(tpl.nodes.every((n) => n.selected === false)).toBe(true);
    expect('apiKey' in tpl.nodes[0]!.data).toBe(false);
    expect(tpl.edges).toHaveLength(2);
    expect(tpl.edges.some((e) => e.id === 'e-3')).toBe(false);
    expect(tpl.id.startsWith('tpl-')).toBe(true);
  });

  it('持久化：saveTemplates / loadTemplates 往返一致，损坏数据安全跳过', () => {
    const tpl = buildTemplate('T', [mk('a')], []);
    expect(saveTemplates([tpl])).toBe(true);
    const loaded = loadTemplates();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.id).toBe(tpl.id);
    expect(loaded[0]!.name).toBe('T');

    localStorage.setItem(TEMPLATES_STORAGE_KEY, '{broken');
    expect(loadTemplates()).toEqual([]);
  });

  it('parseTemplateJson：未知节点类型 / 孤立边 / 错误 schema 一律拒绝', () => {
    const badKind = parseTemplateJson(
      JSON.stringify({
        name: 'x',
        nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { kind: 'alien' } }],
        edges: [],
      }),
    );
    expect(badKind.ok).toBe(false);
    expect(badKind.errors.some((e) => e.includes('未知节点类型'))).toBe(true);

    const orphan = parseTemplateJson(
      JSON.stringify({
        name: 'x',
        nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { kind: 'trigger' } }],
        edges: [{ id: 'e', source: 'a', target: 'missing' }],
      }),
    );
    expect(orphan.ok).toBe(false);
    expect(orphan.errors.some((e) => e.includes('不存在的节点'))).toBe(true);

    const badSchema = parseTemplateJson(
      JSON.stringify({
        name: 'x',
        nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { kind: 'notify', level: 'urgent' } }],
        edges: [],
      }),
    );
    expect(badSchema.ok).toBe(false);
    expect(badSchema.errors.some((e) => e.includes('level 无效'))).toBe(true);
  });

  it('parseTemplateJson：合法模板解析并生成全新 ID（导入即独立）', () => {
    const text = JSON.stringify({
      version: 1,
      templates: [
        {
          id: 'tpl-old',
          name: '审查子流程',
          createdAt: 1,
          nodes: [
            { id: 'a', position: { x: 0, y: 0 }, data: { kind: 'ai', label: '审查' } },
            { id: 'b', position: { x: 300, y: 0 }, data: { kind: 'output', label: '报告' } },
          ],
          edges: [{ id: 'e', source: 'a', target: 'b' }],
        },
      ],
    });
    const result = parseTemplateJson(text);
    expect(result.ok).toBe(true);
    expect(result.templates).toHaveLength(1);
    // 导入后使用全新 ID（不沿用 tpl-old）
    expect(result.templates[0]!.id).not.toBe('tpl-old');
    expect(result.templates[0]!.nodes[0]!.id).toBe('a');
  });
});

describe('workflow store 节点模板', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('保存选中子图为模板：仅包含选中节点与内部边', () => {
    const store = useWorkflowStore();
    store.addNode('trigger', { x: 0, y: 0 });
    store.addNode('ai', { x: 300, y: 0 });
    store.addNode('notify', { x: 600, y: 0 });
    store.addEdge({ source: 'n-1', target: 'n-2' });
    store.addEdge({ source: 'n-2', target: 'n-3' });

    store.selectMany(['n-1', 'n-2']);
    const tpl = store.saveSelectionAsTemplate('触发+AI');
    expect(tpl).not.toBeNull();
    expect(tpl!.nodes.map((n) => n.id)).toEqual(['n-1', 'n-2']);
    expect(tpl!.edges).toHaveLength(1);
    expect(store.nodeTemplates).toHaveLength(1);
    // 已持久化
    expect(loadTemplates()).toHaveLength(1);
  });

  it('插入模板：生成全新节点 ID、内部边重映射、可撤销', () => {
    const store = useWorkflowStore();
    store.addNode('trigger', { x: 0, y: 0 });
    store.addNode('ai', { x: 300, y: 0 });
    store.addEdge({ source: 'n-1', target: 'n-2' });
    store.selectMany(['n-1', 'n-2']);
    const tpl = store.saveSelectionAsTemplate('链')!;

    // 清空画布后插入
    store.clear();
    expect(store.insertTemplate(tpl.id, { x: 50, y: 50 })).toBe(true);
    expect(store.nodes).toHaveLength(2);
    // 全新 ID（原 n-1/n-2 已被 clear 释放，插入应分配新序列）
    const newIds = store.nodes.map((n) => n.id);
    expect(new Set(newIds).size).toBe(2);
    // 内部边重映射到新节点
    expect(store.edges).toHaveLength(1);
    const e = store.edges[0]!;
    expect(store.nodes.some((n) => n.id === e.source)).toBe(true);
    expect(store.nodes.some((n) => n.id === e.target)).toBe(true);

    // 可撤销
    store.undo();
    expect(store.nodes).toHaveLength(0);
  });

  it('模板插入不影响模板本身（解耦）', () => {
    const store = useWorkflowStore();
    store.addNode('trigger');
    store.selectMany(['n-1']);
    const tpl = store.saveSelectionAsTemplate('单节点')!;
    store.insertTemplate(tpl.id, { x: 200, y: 200 });
    // 修改新节点不影响模板
    const newNode = store.nodes.find((n) => n.id !== 'n-1')!;
    store.updateNodeData(newNode.id, { cron: '0 5 * * *' });
    const reloaded = loadTemplates().find((t) => t.id === tpl.id)!;
    // 模板仍保留保存时的默认 cron（未被新节点修改污染）
    expect(reloaded.nodes[0]!.data.cron).toBe('0 9 * * *');
  });

  it('删除 / 导出 / 导入模板', () => {
    const store = useWorkflowStore();
    store.addNode('trigger');
    store.selectMany(['n-1']);
    store.saveSelectionAsTemplate('T1');

    const json = store.exportTemplatesJson();
    expect(json).toContain('T1');

    // 导出后删除，再导入回来
    expect(store.deleteTemplate(store.nodeTemplates[0]!.id)).toBe(true);
    expect(store.nodeTemplates).toHaveLength(0);

    const result = store.importTemplatesJson(json);
    expect(result.ok).toBe(true);
    expect(result.added).toBe(1);
    expect(store.nodeTemplates).toHaveLength(1);
    expect(store.nodeTemplates[0]!.name).toBe('T1');
  });

  it('导入错误数据整体拒绝，不写入', () => {
    const store = useWorkflowStore();
    const result = store.importTemplatesJson(
      JSON.stringify({
        templates: [
          {
            name: 'bad',
            nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { kind: 'unknown' } }],
            edges: [],
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(store.nodeTemplates).toHaveLength(0);
  });
});
