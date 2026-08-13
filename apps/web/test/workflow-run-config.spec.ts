import { describe, expect, it } from 'vitest';
import { createRunControl, preflightRun, runWorkflow } from '@/features/workflows/runner';
import { getNodeDef, type WorkflowNodeModel } from '@/features/workflows/types';
import type { WorkflowInputDef } from '@/features/workflows/types';

const noSleep = () => Promise.resolve();

function mk(id: string, kind: WorkflowNodeModel['data']['kind']): WorkflowNodeModel {
  const def = getNodeDef(kind);
  return {
    id,
    type: 'custom',
    position: { x: 0, y: 0 },
    data: { kind, label: def.label, status: 'idle', ...def.defaults },
  };
}

const chain = {
  nodes: [mk('n-1', 'trigger'), mk('n-2', 'ai'), mk('n-3', 'output')],
  edges: [
    { id: 'e-1', source: 'n-1', target: 'n-2', type: 'smoothstep' },
    { id: 'e-2', source: 'n-2', target: 'n-3', type: 'smoothstep' },
  ],
};

describe('workflow 运行配置（步数 / 超时 / 预检）', () => {
  it('缺失必填输入：预检失败，运行不执行任何节点', async () => {
    const defs: WorkflowInputDef[] = [
      { name: 'role', label: '角色', type: 'text', required: true },
    ];
    const pre = preflightRun({ snapshot: chain, params: {}, inputDefs: defs });
    expect(pre.ok).toBe(false);
    expect(pre.errors.some((e) => e.includes('role'))).toBe(true);

    const result = await runWorkflow({
      snapshot: chain,
      mode: 'full',
      params: {},
      control: createRunControl(),
      hooks: { sleep: noSleep },
      inputDefs: defs,
    });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('预检失败');
    expect(result.outputs).toEqual({});
  });

  it('最大步数：超过上限可预测失败并给出建议', async () => {
    const result = await runWorkflow({
      snapshot: chain,
      mode: 'full',
      params: {},
      control: createRunControl(),
      hooks: { sleep: noSleep },
      runConfig: { maxSteps: 2 },
    });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('最大执行步数');
    expect(result.suggestion).toContain('最大执行步数');
  });

  it('超时：超过 timeoutMs 失败', async () => {
    const result = await runWorkflow({
      snapshot: chain,
      mode: 'full',
      params: {},
      control: createRunControl(),
      hooks: { sleep: () => new Promise((r) => setTimeout(r, 50)) },
      runConfig: { timeoutMs: 5 },
    });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('超时');
  });

  it('失败继续策略：失败节点跳过，其余继续执行', async () => {
    const nodes = [
      mk('n-1', 'trigger'),
      { ...mk('n-2', 'ai'), data: { ...mk('n-2', 'ai').data, simulateError: '故意失败' } },
      mk('n-3', 'output'),
    ];
    const result = await runWorkflow({
      snapshot: { nodes, edges: chain.edges },
      mode: 'full',
      params: {},
      control: createRunControl(),
      hooks: { sleep: noSleep },
      runConfig: { failStrategy: 'continue' },
    });
    expect(result.status).toBe('failed');
    expect(result.failedNodeId).toBe('n-2');
    // continue 模式下 n-3 仍执行
    expect(result.outputs['n-3']).toBeTruthy();
  });

  it('失败停止策略（默认）：失败后中断后续节点', async () => {
    const nodes = [
      mk('n-1', 'trigger'),
      { ...mk('n-2', 'ai'), data: { ...mk('n-2', 'ai').data, simulateError: '故意失败' } },
      mk('n-3', 'output'),
    ];
    const result = await runWorkflow({
      snapshot: { nodes, edges: chain.edges },
      mode: 'full',
      params: {},
      control: createRunControl(),
      hooks: { sleep: noSleep },
    });
    expect(result.status).toBe('failed');
    expect(result.outputs['n-3']).toBeUndefined();
  });

  it('预检输出引用：输出定义引用不存在的节点 → 错误', () => {
    const pre = preflightRun({
      snapshot: chain,
      params: {},
      outputDefs: [{ name: 'x', type: 'any', source: 'n-99' }],
    });
    expect(pre.ok).toBe(false);
    expect(pre.errors.some((e) => e.includes('n-99'))).toBe(true);
  });

  it('预检节点变量可达性：仅提示警告，不阻断', () => {
    const nodes = [
      { ...mk('n-1', 'prompt'), data: { ...mk('n-1', 'prompt').data, template: '你好 {{ghost}}' } },
    ];
    const pre = preflightRun({ snapshot: { nodes, edges: [] }, params: {} });
    expect(pre.ok).toBe(true);
    expect(pre.warnings.some((w) => w.includes('ghost'))).toBe(true);
  });
});
