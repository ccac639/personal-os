import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useWorkflowStore } from '@/features/workflows/store';
import { MAX_VERSIONS } from '@/features/workflows/migrate';

describe('workflow 版本与模板', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('创建版本：生成快照摘要，结构变化时自动记录', () => {
    const store = useWorkflowStore();
    store.addNode('trigger');
    const v = store.createVersion('初始版本');
    expect(v).toBeTruthy();
    expect(store.listVersions()).toHaveLength(1);
    expect(store.listVersions()[0]!.summary).toBe('初始版本');
    expect(store.listVersions()[0]!.nodes).toHaveLength(1);
  });

  it('手动保存：结构变化时生成自动版本，相同结构不重复', () => {
    const store = useWorkflowStore();
    store.addNode('trigger');
    store.save(); // 生成版本 1
    const v1 = store.listVersions().length;
    store.save(); // 结构未变，不生成
    expect(store.listVersions().length).toBe(v1);
    store.addNode('ai');
    store.save(); // 结构变化，生成版本 2
    expect(store.listVersions().length).toBe(v1 + 1);
  });

  it('版本上限截断', () => {
    const store = useWorkflowStore();
    store.addNode('trigger');
    for (let i = 0; i < MAX_VERSIONS + 5; i++) {
      store.updateNodeData('n-1', { cron: `0 ${i} * * *` });
      store.createVersion(`v${i}`);
    }
    expect(store.listVersions().length).toBeLessThanOrEqual(MAX_VERSIONS);
  });

  it('恢复版本：覆盖当前画布并可撤销', () => {
    const store = useWorkflowStore();
    store.addNode('trigger'); // n-1
    store.updateNodeData('n-1', { cron: '0 8 * * *' });
    const v = store.createVersion('v1')!;

    store.addNode('ai'); // n-2
    expect(store.nodes).toHaveLength(2);

    expect(store.restoreVersion(v)).toBe(true);
    expect(store.nodes).toHaveLength(1);
    expect(store.nodes[0]!.data.cron).toBe('0 8 * * *');

    // 可撤销
    store.undo();
    expect(store.nodes).toHaveLength(2);
  });

  it('恢复版本生成独立副本：修改节点不污染版本快照', () => {
    const store = useWorkflowStore();
    store.addNode('trigger');
    const v = store.createVersion('v1')!;

    store.updateNodeData('n-1', { cron: '0 1 * * *' });
    store.restoreVersion(v);
    expect(store.nodes[0]!.data.cron).toBe('0 9 * * *'); // 版本内默认值

    // 恢复后再改，版本不变
    store.updateNodeData('n-1', { cron: '0 2 * * *' });
    expect(store.listVersions()[0]!.nodes[0]!.data.cron).toBe('0 9 * * *');
  });

  it('模板：标记 / 取消 / 从模板复制为新工作流', () => {
    const store = useWorkflowStore();
    const id = store.createWorkflow('模板A');
    store.addNode('trigger');
    store.toggleTemplate(id);
    expect(store.records.find((r) => r.id === id)!.isTemplate).toBe(true);
    expect(store.workflows.find((w) => w.id === id)!.isTemplate).toBe(true);

    const copyId = store.createFromTemplate(id);
    expect(copyId).not.toBe(id);
    const copy = store.records.find((r) => r.id === copyId)!;
    expect(copy.nodes).toHaveLength(1);
    expect(copy.id).not.toBe(id);
    expect(copy.nodes[0]!.id).not.toBe('n-1'); // 独立 ID
  });

  it('元数据：标签 / 描述 / 收藏', () => {
    const store = useWorkflowStore();
    const id = store.createWorkflow('工作流');
    store.updateMeta(id, { tags: ['自动化', '每日'], description: '每日摘要' });
    const meta = store.workflows.find((w) => w.id === id)!;
    expect(meta.tags).toEqual(['自动化', '每日']);
    expect(meta.description).toBe('每日摘要');

    store.toggleFavorite(id);
    expect(store.favoriteWorkflows.map((w) => w.id)).toContain(id);
  });
});
