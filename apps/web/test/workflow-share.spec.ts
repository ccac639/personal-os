/**
 * workflows store 分享快照薄封装测试
 *
 * 覆盖 store 对 share.ts 纯函数的三个薄封装：
 * - buildShareSnapshotJson：当前工作流 → 只读快照 JSON
 * - quickCheckShare：导入前轻量结构检查
 * - importShareSnapshot：导入为新工作流（独立 ID + 节点重映射）
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useWorkflowStore } from '@/features/workflows';
import { SHARE_KIND, SHARE_VERSION } from '@/features/workflows/share';

describe('workflow share 薄封装', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('buildShareSnapshotJson：无激活工作流返回空串', () => {
    const store = useWorkflowStore();
    expect(store.buildShareSnapshotJson()).toBe('');
  });

  it('buildShareSnapshotJson：生成只读快照 JSON（kind/version/运行时态剥离）', () => {
    const store = useWorkflowStore();
    store.addNode('trigger');
    store.addNode('ai');
    store.addEdge({ source: 'n-1', target: 'n-2' });

    const parsed = JSON.parse(store.buildShareSnapshotJson()) as {
      kind: string;
      version: number;
      workflow: { nodes: Array<{ data: { status: string } }>; edges: unknown[] };
    };
    expect(parsed.kind).toBe(SHARE_KIND);
    expect(parsed.version).toBe(SHARE_VERSION);
    expect(parsed.workflow.nodes).toHaveLength(2);
    expect(parsed.workflow.nodes.every((n) => n.data.status === 'idle')).toBe(true);
    expect(parsed.workflow.edges).toHaveLength(1);
  });

  it('quickCheckShare：快照结构快速检查（轻量，不深校验）', () => {
    const store = useWorkflowStore();
    expect(store.quickCheckShare('not-json').ok).toBe(false);
    expect(
      store.quickCheckShare(
        '{"kind":"workflow-share","version":1,"workflow":{"nodes":[],"edges":[]}}',
      ).ok,
    ).toBe(true);
    expect(store.quickCheckShare('{"kind":"other","version":1}').ok).toBe(false);
  });

  it('importShareSnapshot：导入为新工作流（独立 ID + 节点重映射 + 画布切换）', () => {
    const store = useWorkflowStore();
    store.addNode('trigger'); // 工作流 A：n-1
    const before = store.workflows.length;

    const result = store.importShareSnapshot(store.buildShareSnapshotJson());
    expect(result.ok).toBe(true);
    expect(store.workflows).toHaveLength(before + 1);

    const imported = store.records.find((r) => r.id === store.activeId)!;
    expect(imported.id).not.toBe(store.records.find((r) => r.id !== imported.id)!.id);
    expect(imported.nodes).toHaveLength(1);
    expect(imported.nodes[0]!.data.kind).toBe('trigger');
    // 序号推进：后续 addNode 不与重映射的 n-1 冲突
    expect(imported.seq).toBe(2);
    expect(imported.nodes[0]!.data.status).toBe('idle');
  });

  it('importShareSnapshot：非法输入返回错误清单', () => {
    const store = useWorkflowStore();
    const result = store.importShareSnapshot('broken');
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
