import { describe, expect, it } from 'vitest';
import {
  buildSubflowInputs,
  createRunControl,
  executeNode,
  runWorkflow,
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

describe('workflow 自动化节点（transform / switch / merge / approval / http / schedule）', () => {
  it('transform：模板替换缺失变量保留原样', () => {
    const node = mk('n-1', 'transform', {
      transformOp: 'template',
      transformTemplate: '你好 {{name}}',
    });
    const exec = executeNode(node, { name: '小明' }, {}, createRunControl());
    expect(exec.ok).toBe(true);
    expect((exec.output as { text: string }).text).toBe('你好 小明');
  });

  it('transform：jsonpath 提取 / upper / trim', () => {
    const jp = executeNode(
      mk('n-1', 'transform', { transformOp: 'jsonpath', jsonPath: 'data.name' }),
      { data: { name: 'x' } },
      {},
      createRunControl(),
    );
    expect((jp.output as { value: string }).value).toBe('x');

    const up = executeNode(
      mk('n-1', 'transform', { transformOp: 'upper' }),
      { previous: 'abc' },
      {},
      createRunControl(),
    );
    expect((up.output as { text: string }).text).toBe('ABC');

    const tr = executeNode(
      mk('n-1', 'transform', { transformOp: 'trim' }),
      { previous: '  pad  ' },
      {},
      createRunControl(),
    );
    expect((tr.output as { text: string }).text).toBe('pad');
  });

  it('switch：命中用例分支 / 默认分支', () => {
    const node = mk('n-1', 'switch', {
      expr: 'value',
      cases: [
        { label: 'one', expr: 'value == 1' },
        { label: 'two', expr: 'value == 2' },
      ],
      defaultLabel: 'other',
    });
    const hit = executeNode(node, { value: 2 }, {}, createRunControl());
    expect(hit.ok).toBe(true);
    expect(hit.branch).toBe('two');

    const miss = executeNode(node, { value: 9 }, {}, createRunControl());
    expect(miss.branch).toBe('other');
  });

  it('switch：表达式错误 → 失败并给出建议', () => {
    const node = mk('n-1', 'switch', { expr: 'value ===', cases: [] });
    const exec = executeNode(node, { value: 1 }, {}, createRunControl());
    expect(exec.ok).toBe(false);
    expect(exec.suggestion).toContain('表达式');
  });

  it('merge：concat 聚合上游输出', () => {
    const node = mk('n-3', 'merge', { mergeMode: 'concat' });
    const exec = executeNode(
      node,
      { 'n-1': { text: 'a' }, 'n-2': { text: 'b' } },
      {},
      createRunControl(),
      ['n-1', 'n-2'],
    );
    expect(exec.ok).toBe(true);
    expect((exec.output as { list: unknown[] }).list).toHaveLength(2);
  });

  it('manual-approval：默认等待暂停，拒绝后 approved=false', () => {
    const ctrl = createRunControl();
    const node = mk('n-1', 'manual-approval', { approvalPrompt: '继续？' });
    const first = executeNode(node, {}, {}, ctrl);
    expect(first.asyncNeeded).toBe(true);
    expect(ctrl.paused).toBe(true);

    // 用户拒绝后放行，重放执行
    ctrl.approval = 'rejected';
    ctrl.paused = false;
    const second = executeNode(node, {}, {}, ctrl);
    expect((second.output as { approved: boolean }).approved).toBe(false);

    // 确认
    ctrl.approval = 'approved';
    const third = executeNode(node, {}, {}, ctrl);
    expect((third.output as { approved: boolean }).approved).toBe(true);
  });

  it('http-request：返回确定性 mock 响应，绝不发起真实网络', () => {
    const node = mk('n-1', 'http-request', {
      method: 'POST',
      url: 'https://api.example.com/x',
      mockStatus: 201,
      mockBody: '{"ok":true}',
    });
    const exec = executeNode(node, {}, {}, createRunControl());
    expect(exec.ok).toBe(true);
    const out = exec.output as { status: number; data: unknown; ok: boolean; url: string };
    expect(out.status).toBe(201);
    expect(out.data).toEqual({ ok: true });
    expect(out.url).toContain('example.com');
  });

  it('schedule：cron 与 interval 本地预览，不注册真实任务', () => {
    const cron = executeNode(
      mk('n-1', 'schedule', { scheduleType: 'cron', cron: '0 9 * * *' }),
      {},
      {},
      createRunControl(),
    );
    expect((cron.output as { type: string }).type).toBe('cron');
    expect(cron.logs.some((l) => l.text.includes('不注册真实定时任务'))).toBe(true);

    const interval = executeNode(
      mk('n-1', 'schedule', { scheduleType: 'interval', intervalValue: 5, intervalUnit: 'min' }),
      {},
      {},
      createRunControl(),
    );
    expect((interval.output as { type: string }).type).toBe('interval');
  });

  it('subworkflow：buildSubflowInputs 按映射提取本地变量', () => {
    const node = mk('n-1', 'subworkflow', {
      workflowRef: 'wf-2',
      inputMap: { 'n-1.name': 'user', input: 'query' },
    });
    const inputs = buildSubflowInputs(node, { 'n-1': { name: '张三' }, input: '报告' });
    expect(inputs).toEqual({ user: '张三', query: '报告' });
  });

  it('subworkflow：通过 subflowExecutor 递归执行并汇总输出', async () => {
    const node = mk('n-1', 'subworkflow', {
      workflowRef: 'wf-2',
      inputMap: { input: 'query' },
      outputMap: { result: 'summary' },
    });
    const result = await runWorkflow({
      snapshot: { nodes: [node], edges: [] },
      mode: 'full',
      params: { variables: { input: '任务' } },
      control: createRunControl(),
      hooks: { sleep: noSleep },
      subflowExecutor: async (_n, inputs) => {
        return { ok: true, outputs: { summary: `完成：${String(inputs.query ?? '')}` } };
      },
    });
    expect(result.status).toBe('success');
    expect((result.outputs['n-1'] as Record<string, unknown>).summary).toBe('完成：任务');
  });

  it('subworkflow：无执行器时明确报错', async () => {
    const node = mk('n-1', 'subworkflow', { workflowRef: 'wf-2' });
    const result = await runWorkflow({
      snapshot: { nodes: [node], edges: [] },
      mode: 'full',
      params: {},
      control: createRunControl(),
      hooks: { sleep: noSleep },
    });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('执行器');
  });
});
