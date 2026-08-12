import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useWorkflowStore } from '@/features/workflows/store';
import { createUndoStack } from '@/features/workflows/undo';

describe('workflow undo/redo', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('节点新增可撤销/重做', () => {
    const store = useWorkflowStore();
    store.addNode('trigger'); // n-1
    store.addNode('ai'); // n-2
    expect(store.nodes).toHaveLength(2);

    store.undo();
    expect(store.nodes).toHaveLength(1);
    expect(store.nodes[0]!.id).toBe('n-1');

    store.undo();
    expect(store.nodes).toHaveLength(0);

    store.redo();
    expect(store.nodes).toHaveLength(1);
    store.redo();
    expect(store.nodes).toHaveLength(2);
  });

  it('连线新增可撤销，删除节点连带清边可撤销', () => {
    const store = useWorkflowStore();
    store.addNode('trigger'); // n-1
    store.addNode('ai'); // n-2
    store.addEdge({ source: 'n-1', target: 'n-2' });
    expect(store.edges).toHaveLength(1);

    store.undo(); // 撤销连线
    expect(store.edges).toHaveLength(0);
    store.redo();
    expect(store.edges).toHaveLength(1);

    store.removeNode('n-1');
    expect(store.nodes).toHaveLength(1);
    expect(store.edges).toHaveLength(0);

    store.undo(); // 撤销删除（节点与边都回来）
    expect(store.nodes).toHaveLength(2);
    expect(store.edges).toHaveLength(1);
  });

  it('属性修改可撤销/重做', () => {
    const store = useWorkflowStore();
    store.addNode('trigger'); // n-1
    store.updateNodeData('n-1', { cron: '0 8 * * *' });
    expect(nodeCron(store, 'n-1')).toBe('0 8 * * *');

    store.undo();
    expect(nodeCron(store, 'n-1')).toBe('0 9 * * *'); // 默认值

    store.redo();
    expect(nodeCron(store, 'n-1')).toBe('0 8 * * *');
  });

  it('工作流操作可撤销：新建 / 删除', () => {
    const store = useWorkflowStore();
    store.createWorkflow('A');
    store.createWorkflow('B');
    expect(store.workflows).toHaveLength(2);
    expect(store.name).toBe('B');

    store.undo(); // 撤销新建 B
    expect(store.workflows).toHaveLength(1);
    expect(store.name).toBe('A');

    store.redo();
    expect(store.workflows).toHaveLength(2);
    expect(store.name).toBe('B');
  });

  it('撤销栈：连续相同重命名只产生一条历史', () => {
    const store = useWorkflowStore();
    store.createWorkflow('A');
    store.renameWorkflow(store.activeId!, 'B');
    store.renameWorkflow(store.activeId!, 'B'); // 无变化，不产生新历史
    store.undo();
    expect(store.name).toBe('A'); // 只撤销了一次重命名
    expect(store.canRedo).toBe(true);
    store.redo();
    expect(store.name).toBe('B');
  });

  it('纯函数 undo 栈：push/undo/redo/canUndo/canRedo', () => {
    const stack = createUndoStack<number>(3);
    stack.push(1);
    stack.push(2);
    expect(stack.canUndo()).toBe(true);
    expect(stack.undo()).toBe(1);
    expect(stack.canRedo()).toBe(true);
    expect(stack.redo()).toBe(2);
    stack.push(3);
    stack.push(4);
    stack.push(5);
    stack.push(6);
    expect(stack.size().past).toBe(3); // 上限截断
  });
});

function nodeCron(store: ReturnType<typeof useWorkflowStore>, id: string): string {
  const n = store.nodes.find((x) => x.id === id);
  return n?.data.cron ?? '';
}
