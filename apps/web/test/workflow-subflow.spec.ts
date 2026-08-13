import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useWorkflowStore } from '@/features/workflows/store';
import {
  collectSubflowRefs,
  detectWorkflowCycle,
  validateSubflowRefs,
} from '@/features/workflows/subworkflow';
import { getNodeDef, type WorkflowNodeModel } from '@/features/workflows/types';

function mk(
  id: string,
  kind: WorkflowNodeModel['data']['kind'],
  overrides: Partial<WorkflowNodeModel['data']> = {},
): WorkflowNodeModel {
  const def = getNodeDef(kind);
  return {
    id,
    type: 'custom',
    position: { x: 0, y: 0 },
    data: { kind, label: def.label, status: 'idle', ...def.defaults, ...overrides },
  };
}

describe('workflow 子流程引用', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('collectSubflowRefs：收集全部子流程引用', () => {
    const refs = collectSubflowRefs([
      mk('a', 'subworkflow', { workflowRef: 'wf-2' }),
      mk('b', 'trigger'),
      mk('c', 'subworkflow', { workflowRef: 'wf-3' }),
    ]);
    expect(refs).toHaveLength(2);
    expect(refs[0]).toEqual({ nodeId: 'a', refId: 'wf-2' });
  });

  it('validateSubflowRefs：自引用 / 不存在 / 已归档 / 必填输入未映射', () => {
    const nodes = [
      mk('a', 'subworkflow', { workflowRef: 'wf-self' }),
      mk('b', 'subworkflow', { workflowRef: 'wf-missing' }),
      mk('c', 'subworkflow', { workflowRef: 'wf-archived', inputMap: {} }),
      mk('d', 'subworkflow', { workflowRef: 'wf-ok', inputMap: { input: 'x' } }),
    ];
    const stubs = [
      { id: 'wf-self', name: '自身', inputPorts: {}, outputPorts: [] },
      { id: 'wf-archived', name: '已归档', archived: true, inputPorts: {}, outputPorts: [] },
      {
        id: 'wf-ok',
        name: '正常',
        inputPorts: { x: true, y: false },
        outputPorts: ['summary'],
      },
    ];
    const issues = validateSubflowRefs(nodes, stubs, 'wf-self');
    expect(issues.some((i) => i.message.includes('自身'))).toBe(true);
    expect(issues.some((i) => i.message.includes('不存在'))).toBe(true);
    expect(issues.some((i) => i.message.includes('已归档'))).toBe(true);
    // wf-ok 的必填输入 x 已映射，但 d 映射的 local=input → port=x
    expect(issues.some((i) => i.nodeId === 'd' && i.message.includes('未映射'))).toBe(false);
  });

  it('必填输入未映射：明确报错', () => {
    const nodes = [mk('a', 'subworkflow', { workflowRef: 'wf-ok' })];
    const issues = validateSubflowRefs(
      nodes,
      [{ id: 'wf-ok', name: '正常', inputPorts: { must: true }, outputPorts: [] }],
      'wf-self',
    );
    expect(issues.some((i) => i.message.includes('must') && i.message.includes('未映射'))).toBe(
      true,
    );
  });

  it('输出映射端口不存在：报错', () => {
    const nodes = [mk('a', 'subworkflow', { workflowRef: 'wf-ok', outputMap: { r: 'ghost' } })];
    const issues = validateSubflowRefs(
      nodes,
      [{ id: 'wf-ok', name: '正常', inputPorts: {}, outputPorts: ['summary'] }],
      'wf-self',
    );
    expect(issues.some((i) => i.message.includes('ghost'))).toBe(true);
  });

  it('detectWorkflowCycle：A→B→A 检测环', () => {
    const allRefs = new Map<string, string[]>([
      ['wf-a', ['wf-b']],
      ['wf-b', ['wf-a']],
    ]);
    const cycle = detectWorkflowCycle('wf-a', allRefs);
    expect(cycle).not.toBeNull();
    expect(cycle!.length).toBeGreaterThanOrEqual(2);
  });

  it('detectWorkflowCycle：无环返回 null', () => {
    const allRefs = new Map<string, string[]>([
      ['wf-a', ['wf-b']],
      ['wf-b', ['wf-c']],
      ['wf-c', []],
    ]);
    expect(detectWorkflowCycle('wf-a', allRefs)).toBeNull();
  });

  it('store：选择自身作为子流程被阻止（诊断报错）', () => {
    const store = useWorkflowStore();
    store.addNode('trigger');
    const wfId = store.activeId!;
    store.addNode('subworkflow', { x: 200, y: 0 });
    store.updateNodeData('n-2', { workflowRef: wfId });
    const { issues } = store.validateSubflows();
    expect(issues.some((i) => i.message.includes('自身'))).toBe(true);
  });

  it('store：子流程执行器递归运行被调用工作流', async () => {
    const store = useWorkflowStore();
    // 被调用工作流
    store.addNode('trigger');
    store.updateMeta(store.activeId!, { name: '子流程B' });
    const subId = store.activeId!;
    // 新工作流：子流程 A 引用 B（含 trigger 通过结构校验）
    store.createWorkflow('主流程A');
    store.addNode('trigger', { x: 0, y: 0 });
    store.addNode('subworkflow', { x: 300, y: 0 });
    store.updateNodeData('n-2', { workflowRef: subId });
    await store.runWorkflow('full');
    expect(store.activeLastRun?.status).toBe('success');
  });
});
