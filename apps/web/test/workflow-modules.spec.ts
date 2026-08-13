import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useWorkflowStore } from '@/features/workflows/store';
import { buildModule, inferPorts, instantiateModule, uid } from '@/features/workflows/modules';
import {
  getNodeDef,
  type WorkflowEdgeModel,
  type WorkflowNodeModel,
} from '@/features/workflows/types';

function mk(id: string, kind: WorkflowNodeModel['data']['kind']): WorkflowNodeModel {
  const def = getNodeDef(kind);
  return {
    id,
    type: 'custom',
    position: { x: 0, y: 0 },
    data: { kind, label: def.label, status: 'idle', ...def.defaults },
  };
}

const sub = {
  nodes: [mk('a', 'transform'), mk('b', 'output')],
  edges: [{ id: 'e1', source: 'a', target: 'b', type: 'smoothstep' }],
};

describe('workflow 模块化子图', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('inferPorts：无内部入边 = 输入端口，无内部出边 = 输出端口', () => {
    const { inputs, outputs } = inferPorts(sub.nodes, sub.edges);
    expect(inputs).toEqual(['a']);
    expect(outputs).toEqual(['b']);
  });

  it('buildModule：封装节点与内部边，生成独立 id', () => {
    const { module, warnings } = buildModule(sub.nodes, sub.edges, '数据模块', '描述');
    expect(module.nodes).toHaveLength(2);
    expect(module.edges).toHaveLength(1);
    expect(module.ports).toHaveLength(2);
    expect(module.ports[0]!.kind).toBe('in');
    expect(module.ports[1]!.kind).toBe('out');
    expect(warnings).toEqual([]);
  });

  it('instantiateModule：全新节点 id、内部边重映射', () => {
    const { module } = buildModule(sub.nodes, sub.edges, 'M');
    const inst = instantiateModule(module);
    expect(inst.nodes[0]!.id).not.toBe('a');
    expect(inst.nodes[1]!.id).not.toBe('b');
    expect(inst.edges[0]!.source).toBe(inst.nodes[0]!.id);
    expect(inst.edges[0]!.target).toBe(inst.nodes[1]!.id);
    expect(inst.inputNodeIds).toEqual([inst.nodes[0]!.id]);
  });

  it('uid：生成唯一前缀 id', () => {
    expect(uid('mod')).toMatch(/^mod-/);
    expect(uid('mod')).not.toBe(uid('mod'));
  });

  it('store：保存选中节点为模块并可重复插入（可撤销）', () => {
    const store = useWorkflowStore();
    store.addNode('transform', { x: 0, y: 0 });
    store.addNode('output', { x: 300, y: 0 });
    store.addEdge({ source: 'n-1', target: 'n-2' });
    store.selectMany(['n-1', 'n-2']);

    const module = store.saveSelectionAsModule('转换输出');
    expect(module).toBeTruthy();
    expect(store.modules).toHaveLength(1);
    expect(store.modules[0]!.version).toBe(1);

    // 插入两次：各自独立 id
    store.insertModule(module!.id, { x: 500, y: 0 });
    const after1 = store.nodes.length;
    store.insertModule(module!.id, { x: 800, y: 0 });
    const after2 = store.nodes.length;
    expect(after2).toBeGreaterThan(after1);

    // 撤销插入
    store.undo();
    expect(store.nodes.length).toBe(after1);
  });

  it('store：模块版本更新 + 同步实例替换', () => {
    const store = useWorkflowStore();
    store.addNode('transform', { x: 0, y: 0 });
    store.addNode('output', { x: 300, y: 0 });
    store.addEdge({ source: 'n-1', target: 'n-2' });
    store.selectMany(['n-1', 'n-2']);
    const module = store.saveSelectionAsModule('M')!;

    store.insertModule(module.id, { x: 600, y: 0 });
    const instanceIds = store.nodes
      .filter((n) => n.id !== 'n-1' && n.id !== 'n-2')
      .map((n) => n.id);
    expect(instanceIds.length).toBe(2);

    // 更新定义：不同步 → 新版本
    store.updateModuleDefinition(module.id, 'M v2', '', false);
    expect(store.modules[0]!.version).toBe(2);
    expect(store.modules[0]!.name).toBe('M v2');
  });

  it('store：删除模块定义不影响画布实例', () => {
    const store = useWorkflowStore();
    store.addNode('transform');
    store.selectMany(['n-1']);
    const module = store.saveSelectionAsModule('单节点')!;
    store.insertModule(module.id, { x: 200, y: 0 });
    const count = store.nodes.length;
    store.removeModule(module.id);
    expect(store.modules).toHaveLength(0);
    expect(store.nodes.length).toBe(count);
  });
});

describe('workflow 模块边界（边过滤）', () => {
  it('buildModule 只包含模块内部边', () => {
    const externalEdge: WorkflowEdgeModel = {
      id: 'ext',
      source: 'x',
      target: 'a',
      type: 'smoothstep',
    };
    const { module } = buildModule(sub.nodes, [...sub.edges, externalEdge], 'M');
    expect(module.edges).toHaveLength(1);
    expect(module.edges[0]!.id).toBe('e1');
  });
});
