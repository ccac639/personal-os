import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useWorkflowStore } from '@/features/workflows';
import { nodeData } from '@/features/workflows/types';

describe('workflow store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('添加节点：id 递增、位置自动右移、自动选中（无工作流时自动创建）', () => {
    const store = useWorkflowStore();
    store.addNode('trigger');
    store.addNode('ai');

    expect(store.nodes).toHaveLength(2);
    expect(store.nodes[0]!.id).toBe('n-1');
    expect(store.nodes[1]!.id).toBe('n-2');
    // 第二个节点自动放到第一个右侧
    expect(store.nodes[1]!.position.x).toBeGreaterThan(store.nodes[0]!.position.x);
    expect(store.selectedId).toBe('n-2');
    // 自动创建了一个工作流
    expect(store.workflows).toHaveLength(1);
  });

  it('添加节点：支持指定位置（拖放落点）', () => {
    const store = useWorkflowStore();
    store.addNode('trigger', { x: 120, y: 240 });
    expect(store.nodes[0]!.position).toEqual({ x: 120, y: 240 });
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

  it('工作流 CRUD：创建 / 重命名 / 复制 / 删除 / 切换', () => {
    const store = useWorkflowStore();
    const a = store.createWorkflow('A');
    const b = store.createWorkflow('B');
    // 同一毫秒内创建时 updatedAt 可能相同，手动拉开时间戳后应「最近编辑优先」
    const recA = store.records.find((r) => r.id === a)!;
    recA.updatedAt -= 1000;
    expect(store.workflows.map((w) => w.name)).toEqual(['B', 'A']);

    // 在 A 中加入节点再复制
    store.openWorkflow(a);
    store.addNode('trigger');
    const copyId = store.duplicateWorkflow(a);
    expect(store.workflows).toHaveLength(3);
    const copy = store.workflows.find((w) => w.id === copyId);
    expect(copy?.name).toBe('A（副本）');
    // 副本节点 id 后缀 -c，且被复制后自动切换为当前工作流
    expect(store.activeId).toBe(copyId);
    expect(store.nodes.map((n) => n.id)).toEqual(['n-1-c']);

    // 重命名
    store.renameWorkflow(copyId, 'A v2');
    expect(store.workflows.find((w) => w.id === copyId)?.name).toBe('A v2');

    // 删除当前工作流后自动切换到剩余一条
    store.deleteWorkflow(copyId);
    expect(store.workflows).toHaveLength(2);
    expect(store.activeId).toBe(b);

    // 删除后仍保留另一条
    store.deleteWorkflow(a);
    store.deleteWorkflow(b);
    expect(store.workflows).toHaveLength(0);
  });

  it('持久化：save 后重新 load 能还原工作流与节点', () => {
    const store = useWorkflowStore();
    const id = store.createWorkflow('持久化测试');
    store.addNode('trigger');
    store.addNode('ai');
    store.save();

    // 模拟刷新：全新 pinia 实例
    setActivePinia(createPinia());
    const store2 = useWorkflowStore();
    store2.load();
    expect(store2.workflows).toHaveLength(1);
    expect(store2.workflows[0]!.id).toBe(id);
    expect(store2.name).toBe('持久化测试');
    expect(store2.nodes).toHaveLength(2);
    expect(store2.nodes[0]!.data.kind).toBe('trigger');
  });

  it('迁移：旧版单工作流 localStorage 数据自动导入为第一条工作流', () => {
    localStorage.setItem(
      'personal-os-workflow-v1',
      JSON.stringify({
        name: '旧工作流',
        seq: 3,
        nodes: [{ id: 'n-1', position: { x: 0, y: 0 }, data: { kind: 'notify', label: '旧' } }],
        edges: [],
      }),
    );
    const store = useWorkflowStore();
    store.load();
    expect(store.workflows).toHaveLength(1);
    expect(store.name).toBe('旧工作流');
    expect(nodeData(store.nodes[0]!).kind).toBe('notify');
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

  it('导入：拒绝未知节点类型 / 非法结构，接受合法快照并补齐默认字段', () => {
    const store = useWorkflowStore();
    // 未知节点类型
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
    // 边引用不存在的节点
    expect(
      store.importJson(
        JSON.stringify({
          name: 'x',
          seq: 1,
          nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { kind: 'trigger' } }],
          edges: [{ id: 'e', source: 'a', target: 'missing' }],
        }),
      ),
    ).toBe(false);
    // 节点缺 position
    expect(
      store.importJson(
        JSON.stringify({
          name: 'x',
          seq: 1,
          nodes: [{ id: 'a', data: { kind: 'trigger' } }],
          edges: [],
        }),
      ),
    ).toBe(false);

    // 预置一个已有工作流，导入的新工作流应与其并存
    store.createWorkflow('既有工作流');
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
    // 导入的新工作流与原有工作流并存
    expect(store.workflows).toHaveLength(2);
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

  it('模拟运行：失败注入的节点置 error，lastRun 记录失败与错误日志', async () => {
    const store = useWorkflowStore();
    store.addNode('trigger', { x: 0, y: 0 });
    store.updateNodeData('n-1', { simulateError: '模拟磁盘写入失败' });

    await store.simulateRun();

    expect(store.nodes[0]!.data.status).toBe('error');
    expect(store.activeLastRun?.status).toBe('failed');
    expect(store.runLogs.some((l) => l.includes('模拟磁盘写入失败'))).toBe(true);
    expect(store.runLogs[0]).toContain('RUN');
  });

  it('模拟运行：校验失败（缺触发器）时不执行，直接记录失败日志', async () => {
    const store = useWorkflowStore();
    store.addNode('ai', { x: 0, y: 0 });

    await store.simulateRun();

    expect(store.running).toBe(false);
    expect(store.activeLastRun?.status).toBe('failed');
    expect(store.runLogs.some((l) => l.includes('触发器'))).toBe(true);
  });

  it('模拟运行：合法工作流全部节点 success，lastRun 记录成功', async () => {
    const store = useWorkflowStore();
    store.addNode('trigger', { x: 0, y: 0 });
    store.addNode('output', { x: 300, y: 0 });
    store.addEdge({ source: 'n-1', target: 'n-2' });

    await store.simulateRun();

    expect(store.activeLastRun?.status).toBe('success');
    expect(store.nodes.every((n) => nodeData(n).status === 'success')).toBe(true);
    expect(store.runLogs.some((l) => l.startsWith('OK'))).toBe(true);
  });
});
