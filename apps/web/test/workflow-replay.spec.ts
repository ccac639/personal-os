import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useWorkflowStore } from '@/features/workflows/store';

describe('workflow 回放', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('startReplay：进入只读回放态，节点按历史状态着色', async () => {
    const store = useWorkflowStore();
    store.addNode('trigger');
    store.addNode('ai');
    store.addEdge({ source: 'n-1', target: 'n-2' });
    await store.runWorkflow('full');
    const runId = store.runHistory[0]!.id;

    expect(store.startReplay(runId)).toBe(true);
    expect(store.isReplaying).toBe(true);
    // 节点状态按历史着色
    expect(store.nodes.every((n) => n.data.status !== 'idle')).toBe(true);

    // 回放态禁止编辑：记录撤销点前节点数
    const count = store.nodes.length;
    store.addNode('trigger');
    expect(store.nodes.length).toBe(count);
    store.removeNode('n-1');
    expect(store.nodes.length).toBe(count);
  });

  it('exitReplay：退出后恢复编辑态与 idle 状态', async () => {
    const store = useWorkflowStore();
    store.addNode('trigger');
    await store.runWorkflow('full');
    const runId = store.runHistory[0]!.id;
    store.startReplay(runId);
    expect(store.isReplaying).toBe(true);

    store.exitReplay();
    expect(store.isReplaying).toBe(false);
    expect(store.nodes.every((n) => n.data.status === 'idle')).toBe(true);
  });

  it('rerunFromHistory：用历史输入重新运行为新记录，不覆盖历史', async () => {
    const store = useWorkflowStore();
    store.addNode('trigger', { x: 0, y: 0 });
    store.addNode('prompt', { x: 300, y: 0 });
    store.addEdge({ source: 'n-1', target: 'n-2' });
    store.updateNodeData('n-2', { template: '你好 {{name}}' });
    store.runParams = { ...store.runParams, variables: { name: '第一次' } };
    await store.runWorkflow('full');
    expect(store.runHistory).toHaveLength(1);
    const first = store.runHistory[0]!;

    store.runParams = { ...store.runParams, variables: { name: '第二次' } };
    await store.runWorkflow('full');
    expect(store.runHistory).toHaveLength(2);

    // 从第一次历史重新运行 → 产生第三条，且输入用历史的
    const ok = await store.rerunFromHistory(first.id);
    expect(ok).toBe(true);
    expect(store.runHistory).toHaveLength(3);
    expect(store.runHistory[0]!.id).not.toBe(first.id);
    expect(store.runHistory[0]!.inputSummary.name).toBe('第一次');
  });
});
