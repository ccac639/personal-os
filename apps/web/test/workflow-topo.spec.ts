import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useWorkflowStore } from '@/features/workflows';

describe('workflow 拓扑排序与结构校验', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('拓扑排序：线性链按依赖顺序输出', () => {
    const store = useWorkflowStore();
    store.addNode('trigger'); // n-1
    store.addNode('prompt'); // n-2
    store.addNode('ai'); // n-3
    store.addNode('output'); // n-4
    store.addEdge({ source: 'n-1', target: 'n-2' });
    store.addEdge({ source: 'n-2', target: 'n-3' });
    store.addEdge({ source: 'n-3', target: 'n-4' });

    const { order, cycleIds } = store.topoSort();
    expect(cycleIds).toEqual([]);
    expect(order).toEqual(['n-1', 'n-2', 'n-3', 'n-4']);
  });

  it('拓扑排序：汇合节点（多入边）在所有前驱之后', () => {
    const store = useWorkflowStore();
    store.addNode('trigger'); // n-1
    store.addNode('delay'); // n-2
    store.addNode('ai'); // n-3（汇合）
    store.addEdge({ source: 'n-1', target: 'n-3' });
    store.addEdge({ source: 'n-2', target: 'n-3' });

    const { order, cycleIds } = store.topoSort();
    expect(cycleIds).toEqual([]);
    expect(order).toContain('n-1');
    expect(order).toContain('n-2');
    expect(order.indexOf('n-3')).toBeGreaterThan(order.indexOf('n-1'));
    expect(order.indexOf('n-3')).toBeGreaterThan(order.indexOf('n-2'));
  });

  it('拓扑排序：检测环并返回环内节点', () => {
    const store = useWorkflowStore();
    store.addNode('trigger'); // n-1
    store.addNode('ai'); // n-2
    store.addNode('code'); // n-3
    store.addEdge({ source: 'n-1', target: 'n-2' });
    store.addEdge({ source: 'n-2', target: 'n-3' });
    store.addEdge({ source: 'n-3', target: 'n-2' }); // n-2 → n-3 → n-2 环

    const { order, cycleIds } = store.topoSort();
    expect(order[0]).toBe('n-1');
    expect(new Set(cycleIds)).toEqual(new Set(['n-2', 'n-3']));
  });

  it('校验：空画布报错', () => {
    const store = useWorkflowStore();
    const v = store.validate();
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.includes('画布为空'))).toBe(true);
  });

  it('校验：缺少触发器报错', () => {
    const store = useWorkflowStore();
    store.addNode('ai');
    const v = store.validate();
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.includes('触发器'))).toBe(true);
  });

  it('校验：存在环报错', () => {
    const store = useWorkflowStore();
    store.addNode('trigger'); // n-1
    store.addNode('ai'); // n-2
    store.addNode('code'); // n-3
    store.addEdge({ source: 'n-1', target: 'n-2' });
    store.addEdge({ source: 'n-2', target: 'n-3' });
    store.addEdge({ source: 'n-3', target: 'n-2' });

    const v = store.validate();
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.includes('循环依赖'))).toBe(true);
  });

  it('校验：孤立节点给出警告但不阻断', () => {
    const store = useWorkflowStore();
    store.addNode('trigger'); // n-1
    store.addNode('ai'); // n-2（孤立）
    store.addEdge({ source: 'n-1', target: 'n-1' }); // 自环忽略
    // 构造：n-1 触发 → n-2 无连线
    store.edges = [];

    const v = store.validate();
    expect(v.ok).toBe(true);
    expect(v.warnings.some((w) => w.includes('未与任何节点连接'))).toBe(true);
  });

  it('校验：合法链式工作流通过且无警告', () => {
    const store = useWorkflowStore();
    store.addNode('trigger'); // n-1
    store.addNode('ai'); // n-2
    store.addEdge({ source: 'n-1', target: 'n-2' });

    const v = store.validate();
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
  });

  it('executionOrder：与 topoSort 一致且环内节点兜底不重复', () => {
    const store = useWorkflowStore();
    store.addNode('trigger'); // n-1
    store.addNode('ai'); // n-2
    store.addNode('code'); // n-3
    store.addEdge({ source: 'n-1', target: 'n-2' });
    store.addEdge({ source: 'n-2', target: 'n-3' });
    store.addEdge({ source: 'n-3', target: 'n-2' });

    const order = store.executionOrder();
    expect(order).toHaveLength(3);
    expect(new Set(order)).toEqual(new Set(['n-1', 'n-2', 'n-3']));
    // 环外节点先执行
    expect(order[0]).toBe('n-1');
  });
});
