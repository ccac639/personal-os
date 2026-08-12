import { describe, expect, it } from 'vitest';
import {
  createRunControl,
  evalCondition,
  executeNode,
  runWorkflow,
  type RunSnapshot,
} from '@/features/workflows/runner';
import { getNodeDef, type WorkflowNodeModel } from '@/features/workflows/types';

const noSleep = () => Promise.resolve();

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

const chain: RunSnapshot = {
  nodes: [
    mk('n-1', 'trigger', { cron: '0 9 * * *' }),
    mk('n-2', 'ai', { model: 'deepseek-v3', prompt: '总结 {{input}}' }),
    mk('n-3', 'output', { format: 'text', outputName: '报告' }),
  ],
  edges: [
    { id: 'e-1', source: 'n-1', target: 'n-2', type: 'smoothstep' },
    { id: 'e-2', source: 'n-2', target: 'n-3', type: 'smoothstep' },
  ],
};

describe('workflow runner', () => {
  it('完整执行成功：按拓扑顺序执行全部节点，产出输出与日志', async () => {
    const result = await runWorkflow({
      snapshot: chain,
      mode: 'full',
      params: { initialText: '代码审查', variables: {} },
      control: createRunControl(),
      hooks: { sleep: noSleep },
    });
    expect(result.status).toBe('success');
    expect(result.ok).toBe(true);
    expect(result.failedNodeId).toBeUndefined();
    expect(Object.keys(result.outputs)).toEqual(['n-1', 'n-2', 'n-3']);
    // 日志含运行节点与成功
    const runLogs = result.logs.filter((l) => l.level === 'run');
    expect(runLogs.map((l) => l.nodeId)).toEqual(['n-1', 'n-2', 'n-3']);
    expect(result.logs.some((l) => l.level === 'success')).toBe(true);
  });

  it('失败注入：错误日志带节点 id，含修复建议，后续节点不执行', async () => {
    const snapshot: RunSnapshot = {
      nodes: [
        mk('n-1', 'trigger'),
        mk('n-2', 'ai', { simulateError: '模拟 API 超时' }),
        mk('n-3', 'output'),
      ],
      edges: [
        { id: 'e-1', source: 'n-1', target: 'n-2', type: 'smoothstep' },
        { id: 'e-2', source: 'n-2', target: 'n-3', type: 'smoothstep' },
      ],
    };
    const result = await runWorkflow({
      snapshot,
      mode: 'full',
      params: {},
      control: createRunControl(),
      hooks: { sleep: noSleep },
    });
    expect(result.status).toBe('failed');
    expect(result.failedNodeId).toBe('n-2');
    expect(result.error).toContain('模拟 API 超时');
    expect(result.suggestion).toBeTruthy();
    // 失败后 n-3 未执行
    expect(result.outputs['n-3']).toBeUndefined();
    const errorLogs = result.logs.filter((l) => l.level === 'error');
    expect(errorLogs.some((l) => l.nodeId === 'n-2')).toBe(true);
  });

  it('单节点执行：只执行目标节点', async () => {
    const result = await runWorkflow({
      snapshot: chain,
      mode: 'single',
      targetId: 'n-2',
      params: { initialText: 'x' },
      control: createRunControl(),
      hooks: { sleep: noSleep },
    });
    expect(result.status).toBe('success');
    expect(Object.keys(result.outputs)).toEqual(['n-2']);
  });

  it('从选中继续：执行目标及其后继', async () => {
    const result = await runWorkflow({
      snapshot: chain,
      mode: 'from',
      targetId: 'n-2',
      params: { initialText: 'x' },
      control: createRunControl(),
      hooks: { sleep: noSleep },
    });
    expect(result.status).toBe('success');
    expect(Object.keys(result.outputs)).toEqual(['n-2', 'n-3']);
  });

  it('取消：运行中途停止并标记 cancelled', async () => {
    const control = createRunControl();
    const promise = runWorkflow({
      snapshot: chain,
      mode: 'full',
      params: {},
      control,
      hooks: {
        sleep: () => new Promise((r) => setTimeout(r, 5)),
        onProgress: ({ status }) => {
          if (status === 'running') control.cancel();
        },
      },
    });
    const result = await promise;
    expect(result.status).toBe('cancelled');
    expect(result.ok).toBe(false);
  });

  it('暂停与继续：paused 时执行挂起，resume 后完成', async () => {
    const control = createRunControl();
    let progressCount = 0;
    const result = await runWorkflow({
      snapshot: chain,
      mode: 'full',
      params: {},
      control,
      hooks: {
        sleep: noSleep,
        onProgress: ({ status }) => {
          progressCount++;
          if (status === 'running' && progressCount === 1) {
            control.paused = true;
            setTimeout(() => control.resume(), 10);
          }
        },
      },
    });
    expect(result.status).toBe('success');
    expect(Object.keys(result.outputs)).toHaveLength(3);
  });

  it('条件分支：表达式成立走 true，不成立走 false，输出 result', () => {
    const ok = executeNode(
      mk('c', 'condition', { expr: 'risks > 0' }),
      { risks: 3 },
      {},
      createRunControl(),
    );
    expect(ok.ok).toBe(true);
    expect(ok.output).toEqual({ result: true });
    expect(ok.branch).toBe('true');

    const no = executeNode(
      mk('c', 'condition', { expr: 'risks > 0' }),
      { risks: 0 },
      {},
      createRunControl(),
    );
    expect(no.branch).toBe('false');
  });

  it('条件表达式错误：返回可读错误与建议', () => {
    const r = executeNode(mk('c', 'condition', { expr: 'risks >' }), {}, {}, createRunControl());
    expect(r.ok).toBe(false);
    expect(r.error).toContain('条件表达式错误');
    expect(r.suggestion).toBeTruthy();
  });

  it('安全求值：evalCondition 支持比较/逻辑/括号/字符串', () => {
    expect(evalCondition('a == 1', { a: 1 })).toEqual({ ok: true, result: true });
    expect(evalCondition('a > 1 && b < 3', { a: 2, b: 1 })).toEqual({ ok: true, result: true });
    expect(evalCondition('!(a >= 5)', { a: 2 })).toEqual({ ok: true, result: true });
    expect(evalCondition('status == "ok"', { status: 'ok' })).toEqual({ ok: true, result: true });
    expect(evalCondition('a + b * 2 > 5', { a: 1, b: 3 })).toEqual({ ok: true, result: true });
    // 非法语法
    const bad = evalCondition('a &&', { a: 1 });
    expect(bad.ok).toBe(false);
  });

  it('日志级别筛选与错误定位（数据层）', async () => {
    const snapshot: RunSnapshot = {
      nodes: [mk('n-1', 'trigger'), mk('n-2', 'ai', { simulateError: 'boom' })],
      edges: [{ id: 'e-1', source: 'n-1', target: 'n-2', type: 'smoothstep' }],
    };
    const result = await runWorkflow({
      snapshot,
      mode: 'full',
      params: {},
      control: createRunControl(),
      hooks: { sleep: noSleep },
    });
    // 级别筛选：error 级别日志中存在带 nodeId 的条目（用于点击定位）
    const errors = result.logs.filter((l) => l.level === 'error');
    expect(errors.length).toBeGreaterThan(0);
    // 错误定位：能从带 nodeId 的日志找到失败节点
    const failEntry = errors.find((l) => l.nodeId === 'n-2');
    expect(failEntry).toBeTruthy();
    expect(failEntry!.text).toContain('boom');
  });

  it('空图 / 无目标节点返回失败建议', async () => {
    const r1 = await runWorkflow({
      snapshot: { nodes: [], edges: [] },
      mode: 'full',
      params: {},
      control: createRunControl(),
      hooks: { sleep: noSleep },
    });
    expect(r1.status).toBe('failed');
    expect(r1.suggestion).toBeTruthy();

    const r2 = await runWorkflow({
      snapshot: chain,
      mode: 'single',
      params: {},
      control: createRunControl(),
      hooks: { sleep: noSleep },
    });
    expect(r2.status).toBe('failed');
    expect(r2.error).toContain('没有可执行');
  });
});
