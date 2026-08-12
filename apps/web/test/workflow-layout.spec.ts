import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  alignPositions,
  autoLayoutPositions,
  distributePositions,
  type AlignAxis,
} from '@/features/workflows/layout';
import { useWorkflowStore } from '@/features/workflows/store';
import type { WorkflowNodeModel } from '@/features/workflows/types';

function mk(id: string, x: number, y: number): WorkflowNodeModel {
  return {
    id,
    type: 'custom',
    position: { x, y },
    data: { kind: 'trigger', label: id, status: 'idle' },
  };
}

describe('workflow 布局工具（对齐 / 分布 / 自动布局）', () => {
  it('对齐：left 对齐到最小 x，right 对齐到最大 x', () => {
    const nodes = [mk('a', 0, 0), mk('b', 100, 50), mk('c', 300, 120)];
    const left = alignPositions(nodes, 'left');
    const xs = left.map((p) => p.position.x);
    expect(new Set(xs).size).toBe(1);
    // 中心对齐回退到左上角：左边界 = min(centerX) - 半宽 = 0
    expect(xs[0]).toBe(0);

    const right = alignPositions(nodes, 'right');
    const rx = right.map((p) => p.position.x);
    expect(new Set(rx).size).toBe(1);
    expect(rx[0]).toBe(300); // max(centerX) - 半宽 = 420 - 120
  });

  it('对齐：top / bottom / centerV / centerH', () => {
    const nodes = [mk('a', 0, 0), mk('b', 100, 100), mk('c', 300, 300)];
    const top = alignPositions(nodes, 'top');
    const ys = top.map((p) => p.position.y);
    expect(new Set(ys).size).toBe(1);

    const bottom = alignPositions(nodes, 'bottom');
    expect(new Set(bottom.map((p) => p.position.y)).size).toBe(1);

    const cv = alignPositions(nodes, 'centerV');
    expect(new Set(cv.map((p) => p.position.y)).size).toBe(1);

    const ch = alignPositions(nodes, 'centerH');
    expect(new Set(ch.map((p) => p.position.x)).size).toBe(1);
  });

  it('对齐：少于 2 个节点不处理', () => {
    expect(alignPositions([mk('a', 0, 0)], 'left')).toEqual([]);
  });

  it('分布：水平方向在首尾之间均匀分布，首尾保持原位', () => {
    const nodes = [mk('a', 0, 0), mk('b', 100, 10), mk('c', 400, 20)];
    const out = distributePositions(nodes, 'horizontal');
    const byId = new Map(out.map((p) => [p.id, p.position]));
    expect(byId.get('a')!.x).toBe(0);
    expect(byId.get('c')!.x).toBe(400);
    // b 应位于中间（200）
    expect(byId.get('b')!.x).toBe(200);
    // y 保持不变
    expect(byId.get('b')!.y).toBe(10);
  });

  it('分布：垂直方向同理；少于 3 个节点不处理', () => {
    const nodes = [mk('a', 0, 0), mk('b', 10, 100), mk('c', 20, 300)];
    const out = distributePositions(nodes, 'vertical');
    const byId = new Map(out.map((p) => [p.id, p.position]));
    expect(byId.get('a')!.y).toBe(0);
    expect(byId.get('c')!.y).toBe(300);
    expect(byId.get('b')!.y).toBe(150);
    expect(byId.get('b')!.x).toBe(10);

    expect(distributePositions([mk('a', 0, 0), mk('b', 10, 10)], 'horizontal')).toEqual([]);
  });

  it('自动布局：按拓扑深度分列，同列不重叠', () => {
    const nodes = [mk('n-1', 0, 0), mk('n-2', 0, 0), mk('n-3', 0, 0), mk('n-4', 0, 0)];
    const edges = [
      { id: 'e-1', source: 'n-1', target: 'n-2' },
      { id: 'e-2', source: 'n-1', target: 'n-3' },
      { id: 'e-3', source: 'n-2', target: 'n-4' },
    ];
    const out = autoLayoutPositions(nodes, edges as never);
    const byId = new Map(out.map((p) => [p.id, p.position]));
    // n-1 深度 0，n-2/n-3 深度 1，n-4 深度 2
    expect(byId.get('n-1')!.x).toBe(40);
    expect(byId.get('n-2')!.x).toBe(340);
    expect(byId.get('n-3')!.x).toBe(340);
    expect(byId.get('n-4')!.x).toBe(640);
    // n-2 / n-3 同列纵向错开
    expect(byId.get('n-2')!.y).not.toBe(byId.get('n-3')!.y);
  });

  it('自动布局：环内节点兜底放在最后一列之后', () => {
    const nodes = [mk('n-1', 0, 0), mk('n-2', 0, 0), mk('n-3', 0, 0)];
    const edges = [
      { id: 'e-1', source: 'n-1', target: 'n-2' },
      { id: 'e-2', source: 'n-2', target: 'n-3' },
      { id: 'e-3', source: 'n-3', target: 'n-2' }, // 环
    ];
    const out = autoLayoutPositions(nodes, edges as never);
    const byId = new Map(out.map((p) => [p.id, p.position]));
    expect(byId.get('n-1')!.x).toBe(40);
    // 环内节点放在更靠后的列
    expect(byId.get('n-2')!.x).toBeGreaterThan(byId.get('n-1')!.x);
    expect(byId.get('n-3')!.x).toBeGreaterThan(byId.get('n-1')!.x);
  });
});

describe('workflow store 布局操作（可撤销）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('对齐 / 分布 / 自动布局均可撤销', () => {
    const store = useWorkflowStore();
    store.addNode('trigger', { x: 0, y: 0 });
    store.addNode('ai', { x: 100, y: 80 });
    store.addNode('code', { x: 300, y: 160 });
    store.selectMany(['n-1', 'n-2', 'n-3']);

    expect(store.alignSelected('left')).toBe(true);
    const xs = new Set(store.nodes.map((n) => n.position.x));
    expect(xs.size).toBe(1);
    store.undo();
    expect(new Set(store.nodes.map((n) => n.position.x)).size).toBe(3);

    expect(store.distributeSelected('horizontal')).toBe(true);
    const xs2 = store.nodes.map((n) => n.position.x);
    expect(xs2[0]).toBe(xs2[0]); // 首尾保留
    store.undo();

    expect(store.autoLayoutCanvas()).toBe(true);
    expect(store.nodes[0]!.position.x).toBe(40);
    store.undo();
    expect(store.nodes[0]!.position.x).toBe(0);
  });

  it('选中不足时不执行', () => {
    const store = useWorkflowStore();
    store.addNode('trigger');
    store.selectMany(['n-1']);
    expect(store.alignSelected('left')).toBe(false);
    expect(store.distributeSelected('horizontal')).toBe(false);
    store.addNode('ai');
    expect(store.autoLayoutCanvas()).toBe(true);
  });

  it('对齐轴类型约束', () => {
    const axes: AlignAxis[] = ['left', 'centerH', 'right', 'top', 'centerV', 'bottom'];
    const nodes = [mk('a', 0, 0), mk('b', 100, 100)];
    for (const axis of axes) {
      expect(alignPositions(nodes, axis).length).toBe(2);
    }
  });
});
