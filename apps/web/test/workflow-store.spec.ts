import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useWorkflowStore } from '@/stores/workflow';
import { nodeData } from '@/features/workflows/types';

describe('workflow store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('添加节点：id 递增、位置自动右移、自动选中', () => {
    const store = useWorkflowStore();
    store.addNode('trigger');
    store.addNode('ai');

    expect(store.nodes).toHaveLength(2);
    expect(store.nodes[0]!.id).toBe('n-1');
    expect(store.nodes[1]!.id).toBe('n-2');
    // 第二个节点自动放到第一个右侧
    expect(store.nodes[1]!.position.x).toBeGreaterThan(store.nodes[0]!.position.x);
    expect(store.selectedId).toBe('n-2');
  });

  it('连线：生成 smoothstep 边、去重、携带条件 handle', () => {
    const store = useWorkflowStore();
    store.addNode('trigger');
    store.addNode('condition');
    store.addEdge({ source: 'n-1', target: 'n-2' });
    store.addEdge({ source: 'n-1', target: 'n-2' }); // 重复
    store.addEdge({ source: 'n-2', sourceHandle: 'false', target: 'n-1' });

    expect(store.edges).toHaveLength(2);
    expect(store.edges[0]!.type).toBe('smoothstep');
    expect(store.edges[1]!.sourceHandle).toBe('false');
  });

  it('删除节点：连带清理相连边；删除选中节点时清空选中态', () => {
    const store = useWorkflowStore();
    store.addNode('trigger'); // n-1，随后被 n-2 取代选中
    store.addNode('ai'); // n-2（当前选中）
    store.addEdge({ source: 'n-1', target: 'n-2' });

    // 删除未选中的 n-1：边被清理，选中态保留
    store.removeNode('n-1');
    expect(store.nodes.map((n) => n.id)).toEqual(['n-2']);
    expect(store.edges).toHaveLength(0);
    expect(store.selectedId).toBe('n-2');

    // 删除选中的 n-2：选中态清空
    store.removeNode('n-2');
    expect(store.nodes).toHaveLength(0);
    expect(store.selectedId).toBeNull();
  });

  it('序列化：剥离运行时 status 与 selected', () => {
    const store = useWorkflowStore();
    store.addNode('trigger');
    store.nodes[0]!.data.status = 'success';
    store.nodes[0]!.selected = true;

    const json = store.exportJson();
    const parsed = JSON.parse(json);
    expect(parsed.nodes[0]!.data.status).toBe('idle');
    expect(parsed.nodes[0]!.selected).toBeUndefined();
    expect(parsed.edges).toEqual([]);
  });

  it('导入：拒绝未知节点类型，接受合法快照', () => {
    const store = useWorkflowStore();
    expect(
      store.importJson(
        JSON.stringify({
          name: 'x',
          seq: 1,
          nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { kind: 'unknown' } }],
          edges: [],
        }),
      ),
    ).toBe(false);

    const ok = store.importJson(
      JSON.stringify({
        name: '导入的工作流',
        seq: 5,
        nodes: [{ id: 'a', position: { x: 10, y: 20 }, data: { kind: 'notify', label: '提醒' } }],
        edges: [],
      }),
    );
    expect(ok).toBe(true);
    expect(store.name).toBe('导入的工作流');
    expect(nodeData(store.nodes[0]!).kind).toBe('notify');
    // 缺失字段用默认值补齐
    expect(nodeData(store.nodes[0]!).channel).toBe('邮件');
  });

  it('执行顺序：BFS 从触发器开始，环内节点兜底', () => {
    const store = useWorkflowStore();
    store.addNode('trigger'); // n-1
    store.addNode('ai'); // n-2
    store.addNode('code'); // n-3
    store.addEdge({ source: 'n-1', target: 'n-2' });
    store.addEdge({ source: 'n-2', target: 'n-3' });
    store.addEdge({ source: 'n-3', target: 'n-2' }); // 环

    const order = store.executionOrder();
    expect(order[0]).toBe('n-1');
    expect(order).toContain('n-2');
    expect(order).toContain('n-3');
    expect(new Set(order).size).toBe(3);
  });
});
