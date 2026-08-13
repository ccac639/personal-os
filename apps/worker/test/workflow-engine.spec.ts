/**
 * Worker 执行引擎测试：
 * - 拓扑执行 / mock 节点语义
 * - 失败策略（节点级 errorPolicy + 运行级 failStrategy）
 * - 子流程深度 / 循环 / 不存在
 * - 步数上限 / 超时 / 取消
 * - 日志上限 / 输出汇总
 * - 输入必填校验
 */
import { describe, expect, it } from 'vitest';

import { evalCondition, executeWorkflow, normalizeRunConfig, RUN_LIMITS, topoSort } from '../src/jobs/workflows/index.js';
import { edge, node, simpleChainSnapshot, snapshot } from './helpers/workflow-fixtures.js';

const noSleep = async (): Promise<void> => undefined;

function runNow(ms: number): () => number {
  const t = ms;
  return () => t;
}

describe('workflow engine: 拓扑与基础执行', () => {
  it('拓扑排序：链式图按依赖顺序执行', () => {
    const { order, cycleIds } = topoSort(
      [node('a', { kind: 'trigger' }), node('b', { kind: 'code' }), node('c', { kind: 'output' })],
      [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')],
    );
    expect(cycleIds).toEqual([]);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('拓扑排序：annotation 节点被排除', () => {
    const { order } = topoSort(
      [node('a', { kind: 'trigger' }), node('note', { kind: 'annotation', text: '说明' }), node('b', { kind: 'code' })],
      [edge('e1', 'a', 'b')],
    );
    expect(order).toEqual(['a', 'b']);
    expect(order).not.toContain('note');
  });

  it('执行成功：mock 节点按确定性语义产出，输出汇总按定义提取', async () => {
    const result = await executeWorkflow(
      simpleChainSnapshot(),
      { variables: { name: 'World' } },
      {},
      { sleep: noSleep, now: runNow(0) },
    );
    expect(result.status).toBe('success');
    expect(result.error).toBeUndefined();
    // prompt 节点渲染 {{name}}
    const promptOut = result.outputs['n2'] as { text: string };
    expect(promptOut.text).toBe('你好 World');
    // 输出汇总：n2.text
    expect(result.outputSummary['greeting']).toBe('你好 World');
    // 节点结果记录齐全
    expect(result.nodeResults.map((r) => r.nodeId)).toEqual(['n1', 'n2', 'n3']);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('输入必填缺失：运行预检失败', async () => {
    const result = await executeWorkflow(simpleChainSnapshot(), { variables: {} }, {}, { sleep: noSleep });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('运行预检失败');
    expect(result.error).toContain('name');
  });

  it('condition 节点：表达式成立走 true 分支', async () => {
    const wf = snapshot({
      nodes: [
        node('t', { kind: 'trigger' }),
        node('c', { kind: 'condition', expr: 'score >= 60', trueLabel: '通过', falseLabel: '不通过' }),
        node('o', { kind: 'output' }),
      ],
      edges: [edge('e1', 't', 'c'), edge('e2', 'c', 'o')],
    });
    const result = await executeWorkflow(wf, { variables: { score: 80 } }, {}, { sleep: noSleep });
    expect(result.status).toBe('success');
    const condOut = result.outputs['c'] as { result: boolean };
    expect(condOut.result).toBe(true);
  });

  it('switch 节点：按 case 表达式路由', async () => {
    const wf = snapshot({
      nodes: [
        node('t', { kind: 'trigger' }),
        node('s', {
          kind: 'switch',
          expr: 'type',
          cases: [
            { label: 'A', expr: "type == 'a'" },
            { label: 'B', expr: "type == 'b'" },
          ],
          defaultLabel: 'other',
        }),
      ],
      edges: [edge('e1', 't', 's')],
    });
    const result = await executeWorkflow(wf, { variables: { type: 'b' } }, {}, { sleep: noSleep });
    expect(result.status).toBe('success');
    const sw = result.outputs['s'] as { branch: string };
    expect(sw.branch).toBe('B');
  });

  it('transform / merge / notify / manual-approval / http / schedule 可预测 mock', async () => {
    const wf = snapshot({
      nodes: [
        node('t', { kind: 'trigger' }),
        // transform template 模式渲染 {{input}}（initialText）
        node('tr', { kind: 'transform', transformOp: 'template', transformTemplate: '{{input}}' }),
        node('jp', { kind: 'transform', transformOp: 'jsonpath', jsonPath: 'input' }),
        node('m', { kind: 'merge', mergeMode: 'concat' }),
        node('n', { kind: 'notify', channel: 'telegram', message: 'done' }),
        node('ap', { kind: 'manual-approval', approvalPrompt: '确认？' }),
        node('h', { kind: 'http-request', method: 'GET', url: 'https://mock.local', mockStatus: 200, mockBody: '{"ok":1}' }),
        node('sc', { kind: 'schedule', scheduleType: 'interval', intervalValue: 5, intervalUnit: 'min' }),
      ],
      edges: [
        edge('e1', 't', 'tr'),
        edge('e2', 'tr', 'jp'),
        edge('e3', 'jp', 'm'),
        edge('e4', 'm', 'n'),
        edge('e5', 'n', 'ap'),
        edge('e6', 'ap', 'h'),
        edge('e7', 'h', 'sc'),
      ],
    });
    const result = await executeWorkflow(wf, { initialText: 'hi' }, {}, { sleep: noSleep });
    expect(result.status).toBe('success');
    const tr = result.outputs['tr'] as { text: string };
    expect(tr.text).toBe('hi');
    const jp = result.outputs['jp'] as { value: unknown };
    expect(jp.value).toBe('hi');
    const ap = result.outputs['ap'] as { approved: boolean };
    expect(ap.approved).toBe(true);
    const h = result.outputs['h'] as { status: number; data: { ok: number } };
    expect(h.status).toBe(200);
    expect(h.data.ok).toBe(1);
    const sc = result.outputs['sc'] as { type: string };
    expect(sc.type).toBe('interval');
  });

  it('delay 节点：真实等待并受秒数上限约束', async () => {
    const slept: number[] = [];
    const wf = snapshot({
      nodes: [
        node('t', { kind: 'trigger' }),
        node('d', { kind: 'delay', seconds: 2 }),
        node('d2', { kind: 'delay', delayValue: 4000, delayUnit: 'ms' }),
      ],
      edges: [edge('e1', 't', 'd'), edge('e2', 'd', 'd2')],
    });
    const result = await executeWorkflow(wf, {}, {}, {
      sleep: async (ms) => {
        slept.push(ms);
      },
    });
    expect(result.status).toBe('success');
    // 2s + 4s
    expect(slept).toEqual([2000, 4000]);
    expect((result.outputs['d'] as { seconds: number }).seconds).toBe(2);
  });
});

describe('workflow engine: 失败策略', () => {
  it('节点失败 + 运行级 stop：中止并记录失败节点', async () => {
    const wf = snapshot({
      nodes: [
        node('t', { kind: 'trigger' }),
        node('bad', { kind: 'code', simulateError: 'boom' }),
        node('o', { kind: 'output' }),
      ],
      edges: [edge('e1', 't', 'bad'), edge('e2', 'bad', 'o')],
    });
    const result = await executeWorkflow(wf, {}, {}, { sleep: noSleep });
    expect(result.status).toBe('failed');
    expect(result.failedNodeId).toBe('bad');
    expect(result.error).toContain('boom');
    // o 未执行
    expect(result.nodeResults.map((r) => r.nodeId)).not.toContain('o');
  });

  it('运行级 failStrategy=continue：失败后继续后续节点', async () => {
    const wf = snapshot({
      runConfig: { failStrategy: 'continue' },
      nodes: [
        node('t', { kind: 'trigger' }),
        node('bad', { kind: 'code', simulateError: 'boom' }),
        node('o', { kind: 'output' }),
      ],
      edges: [edge('e1', 't', 'bad'), edge('e2', 'bad', 'o')],
    });
    const result = await executeWorkflow(wf, {}, {}, { sleep: noSleep });
    expect(result.status).toBe('failed');
    expect(result.failedNodeId).toBe('bad');
    expect(result.nodeResults.map((r) => r.nodeId)).toContain('o');
  });

  it('节点级 errorPolicy=skip：跳过失败节点继续', async () => {
    const wf = snapshot({
      nodes: [
        node('t', { kind: 'trigger' }),
        node('bad', { kind: 'code', simulateError: 'boom', errorPolicy: { strategy: 'skip' } }),
        node('o', { kind: 'output' }),
      ],
      edges: [edge('e1', 't', 'bad'), edge('e2', 'bad', 'o')],
    });
    const result = await executeWorkflow(wf, {}, {}, { sleep: noSleep });
    expect(result.status).toBe('success');
    expect(result.handledNodes).toContainEqual(
      expect.objectContaining({ nodeId: 'bad', handling: 'skip' }),
    );
    // 被跳过的节点不写入输出
    expect(result.outputs['bad']).toBeUndefined();
  });

  it('节点级 errorPolicy=default：使用默认输出', async () => {
    const wf = snapshot({
      nodes: [
        node('t', { kind: 'trigger' }),
        node('bad', {
          kind: 'code',
          simulateError: 'boom',
          errorPolicy: { strategy: 'default', defaultOutput: '{"fallback":1}' },
        }),
        node('o', { kind: 'output' }),
      ],
      edges: [edge('e1', 't', 'bad'), edge('e2', 'bad', 'o')],
    });
    const result = await executeWorkflow(wf, {}, {}, { sleep: noSleep });
    expect(result.status).toBe('success');
    expect(result.outputs['bad']).toEqual({ fallback: 1 });
    expect(result.handledNodes).toContainEqual(
      expect.objectContaining({ nodeId: 'bad', handling: 'default' }),
    );
  });

  it('节点级 errorPolicy=retry：重试成功（模拟失败为瞬时故障）', async () => {
    const wf = snapshot({
      nodes: [
        node('t', { kind: 'trigger' }),
        node('bad', {
          kind: 'code',
          simulateError: 'transient',
          errorPolicy: { strategy: 'retry', retryCount: 2, retryDelayMs: 1 },
        }),
      ],
      edges: [edge('e1', 't', 'bad')],
    });
    const result = await executeWorkflow(wf, {}, {}, { sleep: noSleep });
    expect(result.status).toBe('success');
    expect(result.handledNodes).toContainEqual(
      expect.objectContaining({ nodeId: 'bad', handling: 'retry' }),
    );
    const out = result.outputs['bad'] as { text: string };
    expect(out.text).toContain('[模拟]');
  });
});

describe('workflow engine: 子流程', () => {
  const sub = (id: string, extra: Partial<WorkflowSnapshot> = {}): WorkflowSnapshot =>
    snapshot({
      id,
      name: `sub-${id}`,
      nodes: [node('s1', { kind: 'trigger' }), node('s2', { kind: 'code' })],
      edges: [edge('se1', 's1', 's2')],
      ...extra,
    });

  it('subworkflow 节点：递归执行并将子流程输出作为节点输出', async () => {
    const wf = snapshot({
      nodes: [
        node('t', { kind: 'trigger' }),
        node('sw', { kind: 'subworkflow', workflowRef: 'wf-sub' }),
      ],
      edges: [edge('e1', 't', 'sw')],
    });
    const result = await executeWorkflow(
      wf,
      {},
      {},
      {
        sleep: noSleep,
        loadSubflow: async (id) => (id === 'wf-sub' ? sub('wf-sub') : null),
      },
    );
    expect(result.status).toBe('success');
    // 子流程节点输出 = 子流程各节点输出
    const swOut = result.outputs['sw'] as Record<string, unknown>;
    expect(swOut['s2']).toBeDefined();
    expect(result.nodeResults.map((r) => r.nodeId)).toContain('s2');
  });

  it('子流程循环引用被阻止', async () => {
    const wfA = snapshot({
      id: 'wf-a',
      nodes: [node('t', { kind: 'trigger' }), node('sw', { kind: 'subworkflow', workflowRef: 'wf-b' })],
      edges: [edge('e1', 't', 'sw')],
    });
    const wfB = snapshot({
      id: 'wf-b',
      nodes: [node('t', { kind: 'trigger' }), node('sw', { kind: 'subworkflow', workflowRef: 'wf-a' })],
      edges: [edge('e1', 't', 'sw')],
    });
    const result = await executeWorkflow(
      wfA,
      {},
      {},
      {
        sleep: noSleep,
        loadSubflow: async (id) => (id === 'wf-b' ? wfB : null),
      },
    );
    expect(result.status).toBe('failed');
    expect(result.error).toContain('循环子流程');
  });

  it('子流程嵌套深度超过上限被拒绝', async () => {
    // 链 wf-0 → wf-1 → ... → wf-6（深度 6 > 5）
    const chain: Record<string, WorkflowSnapshot> = {};
    for (let i = 0; i < 7; i++) {
      chain[`wf-${i}`] = snapshot({
        id: `wf-${i}`,
        nodes: [
          node('t', { kind: 'trigger' }),
          node('sw', { kind: 'subworkflow', workflowRef: `wf-${i + 1}` }),
        ],
        edges: [edge('e1', 't', 'sw')],
      });
    }
    const result = await executeWorkflow(
      chain['wf-0']!,
      {},
      {},
      {
        sleep: noSleep,
        loadSubflow: async (id) => chain[id] ?? null,
      },
    );
    expect(result.status).toBe('failed');
    expect(result.error).toContain('嵌套深度超过上限');
    expect(result.error).toContain(String(RUN_LIMITS.MAX_SUBFLOW_DEPTH));
  });

  it('子流程不存在：业务失败', async () => {
    const wf = snapshot({
      nodes: [node('t', { kind: 'trigger' }), node('sw', { kind: 'subworkflow', workflowRef: 'nope' })],
      edges: [edge('e1', 't', 'sw')],
    });
    const result = await executeWorkflow(wf, {}, {}, { sleep: noSleep, loadSubflow: async () => null });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('不存在');
  });
});

describe('workflow engine: 运行时限制', () => {
  it('步数上限：超过 maxSteps 中止', async () => {
    // 100 个节点链，maxSteps=10 → 第 11 步中止
    const nodes = Array.from({ length: 100 }, (_, i) => node(`n${i}`, { kind: 'code' }));
    const edges = nodes.slice(1).map((n, i) => edge(`e${i}`, nodes[i]!.id, n.id));
    const wf = snapshot({ nodes, edges, runConfig: { maxSteps: 10 } });
    const result = await executeWorkflow(wf, {}, {}, { sleep: noSleep });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('最大执行步数');
  });

  it('超时上限：超时中止', async () => {
    const wf = simpleChainSnapshot({ runConfig: { timeoutMs: 1000 } });
    // 时钟：context 创建时为 0，之后每次检查返回 5000 → 立即超过 1000ms 上限
    let calls = 0;
    const result = await executeWorkflow(wf, { variables: { name: 'x' } }, {}, {
      sleep: noSleep,
      now: () => (calls++ === 0 ? 0 : 5000),
    });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('运行超时');
  });

  it('节点数超过上限被拒绝', async () => {
    const nodes = Array.from({ length: RUN_LIMITS.MAX_NODES + 1 }, (_, i) => node(`n${i}`, { kind: 'code' }));
    const wf = snapshot({ nodes, edges: [] });
    const result = await executeWorkflow(wf, {}, {}, { sleep: noSleep });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('节点数超过上限');
  });

  it('取消：执行中被取消返回 cancelled', async () => {
    const wf = simpleChainSnapshot();
    let cancelled = false;
    const result = await executeWorkflow(
      wf,
      { variables: { name: 'x' } },
      {},
      {
        sleep: noSleep,
        isCancelled: async () => {
          cancelled = !cancelled;
          return cancelled;
        },
      },
    );
    expect(result.status).toBe('cancelled');
  });

  it('日志上限：超限时丢弃最旧日志', async () => {
    // 200 个节点 → 每个节点至少 1 条日志 + 汇总
    const nodes = Array.from({ length: 200 }, (_, i) => node(`n${i}`, { kind: 'code' }));
    const edges = nodes.slice(1).map((n, i) => edge(`e${i}`, nodes[i]!.id, n.id));
    const wf = snapshot({ nodes, edges });
    const result = await executeWorkflow(wf, {}, {}, { sleep: noSleep });
    expect(result.status).toBe('success');
    expect(result.logs.length).toBeLessThanOrEqual(RUN_LIMITS.MAX_RUN_LOGS);
    // 序号单调递增
    const ids = result.logs.map((l) => l.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });
});

describe('workflow engine: 配置与表达式', () => {
  it('normalizeRunConfig：非法值回落默认', () => {
    expect(normalizeRunConfig(undefined).maxSteps).toBe(1000);
    expect(normalizeRunConfig({ maxSteps: -5 }).maxSteps).toBe(1);
    expect(normalizeRunConfig({ maxSteps: 999999 }).maxSteps).toBe(RUN_LIMITS.MAX_STEPS);
    expect(normalizeRunConfig({ timeoutMs: 1 }).timeoutMs).toBe(RUN_LIMITS.MIN_TIMEOUT_MS);
    expect(normalizeRunConfig({ failStrategy: 'continue' }).failStrategy).toBe('continue');
  });

  it('evalCondition：安全求值（无代码执行）', () => {
    expect(evalCondition('a > 1', { a: 2 }).result).toBe(true);
    expect(evalCondition('a > 1', { a: 0 }).result).toBe(false);
    expect(evalCondition('!flag', { flag: false }).result).toBe(true);
    const bad = evalCondition('process.exit(1)', {});
    expect(bad.ok).toBe(false);
    expect(bad.error).toBeDefined();
  });
});
