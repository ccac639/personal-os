import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useWorkflowStore } from '@/features/workflows/store';

describe('workflow 多选 / 复制粘贴', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('多选：toggleNodeSelected 追加 / 移除 / 单选', () => {
    const store = useWorkflowStore();
    store.addNode('trigger'); // n-1
    store.addNode('ai'); // n-2
    store.addNode('code'); // n-3
    store.selectNode(null); // 清掉 addNode 的自动选中

    store.toggleNodeSelected('n-1', true);
    store.toggleNodeSelected('n-2', true);
    expect(store.selectedIds).toEqual(['n-1', 'n-2']);

    // 再点 n-1 → 移除
    store.toggleNodeSelected('n-1', true);
    expect(store.selectedIds).toEqual(['n-2']);

    // 非追加 → 单选
    store.toggleNodeSelected('n-3', false);
    expect(store.selectedIds).toEqual(['n-3']);
  });

  it('框选 selectMany 与清空选择', () => {
    const store = useWorkflowStore();
    store.addNode('trigger');
    store.addNode('ai');
    store.selectMany(['n-1', 'n-2']);
    expect(store.selectedIds).toHaveLength(2);
    expect(store.nodes.every((n) => n.selected)).toBe(true);

    store.clearSelection();
    expect(store.selectedIds).toHaveLength(0);
    expect(store.nodes.every((n) => !n.selected)).toBe(true);
  });

  it('批量删除：removeNodes 清理节点与关联边', () => {
    const store = useWorkflowStore();
    store.addNode('trigger'); // n-1
    store.addNode('ai'); // n-2
    store.addNode('notify'); // n-3
    store.addEdge({ source: 'n-1', target: 'n-2' });
    store.addEdge({ source: 'n-2', target: 'n-3' });

    store.removeNodes(['n-1', 'n-2']);
    expect(store.nodes.map((n) => n.id)).toEqual(['n-3']);
    expect(store.edges).toHaveLength(0);
  });

  it('复制粘贴：新 ID、内部边重映射、不重叠', () => {
    const store = useWorkflowStore();
    store.addNode('trigger'); // n-1
    store.addNode('ai'); // n-2
    store.addEdge({ source: 'n-1', target: 'n-2' });

    store.selectMany(['n-1', 'n-2']);
    expect(store.copySelection()).toBe(true);

    // 粘贴到指定位置
    expect(store.pasteNodes({ x: 400, y: 200 })).toBe(true);
    expect(store.nodes).toHaveLength(4);
    const newIds = store.nodes.filter((n) => !['n-1', 'n-2'].includes(n.id));
    expect(newIds).toHaveLength(2);
    // 内部边已重映射（源/目标都在新节点中）
    const newEdge = store.edges.find(
      (e) => e.source !== 'n-1' && e.target !== 'n-2' && e.id !== store.edges[0]?.id,
    );
    expect(newEdge).toBeTruthy();
    expect(newIds.some((n) => n.id === newEdge!.source)).toBe(true);
    expect(newIds.some((n) => n.id === newEdge!.target)).toBe(true);
    // 粘贴位置不与原节点重叠
    const orig = new Set(
      store.nodes
        .filter((n) => ['n-1', 'n-2'].includes(n.id))
        .map((n) => `${n.position.x},${n.position.y}`),
    );
    const pasted = new Set(newIds.map((n) => `${n.position.x},${n.position.y}`));
    for (const key of pasted) {
      expect(orig.has(key)).toBe(false);
    }
  });

  it('粘贴后自动选中新节点并保持原有边', () => {
    const store = useWorkflowStore();
    store.addNode('trigger');
    store.addNode('ai');
    store.addEdge({ source: 'n-1', target: 'n-2' });
    store.selectMany(['n-1', 'n-2']);
    store.copySelection();
    store.pasteNodes({ x: 300, y: 100 });

    expect(store.selectedIds).toHaveLength(2);
    // 原边仍在
    expect(store.edges.some((e) => e.source === 'n-1' && e.target === 'n-2')).toBe(true);
  });

  it('无选中时复制返回 false，空剪贴板粘贴返回 false', () => {
    const store = useWorkflowStore();
    store.addNode('trigger');
    store.selectNode(null);
    expect(store.copySelection()).toBe(false);
    expect(store.pasteNodes()).toBe(false);
  });

  it('deleteSelection 删除多选', () => {
    const store = useWorkflowStore();
    store.addNode('trigger');
    store.addNode('ai');
    store.selectMany(['n-1', 'n-2']);
    store.deleteSelection();
    expect(store.nodes).toHaveLength(0);
  });
});
