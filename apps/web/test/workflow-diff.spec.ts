import { describe, expect, it } from 'vitest';
import { diffObjects, formatDiffValue, summarizeDiff } from '@/features/workflows/diff';
import { compareRuns, createRunRecord } from '@/features/workflows/history';

describe('workflow 对象差异比较', () => {
  it('基础值变更 / 新增 / 删除', () => {
    const entries = diffObjects({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 });
    const byPath = new Map(entries.map((e) => [e.path, e]));
    expect(byPath.get('b')).toMatchObject({ kind: 'changed', from: 2, to: 3 });
    expect(byPath.get('c')).toMatchObject({ kind: 'added', to: 4 });
    expect(entries.some((e) => e.kind === 'removed')).toBe(false);
  });

  it('嵌套对象与数组递归比较', () => {
    const entries = diffObjects(
      { user: { name: 'a', tags: ['x', 'y'] } },
      { user: { name: 'b', tags: ['x', 'z'] } },
    );
    const paths = entries.map((e) => e.path);
    expect(paths).toContain('user.name');
    expect(paths).toContain('user.tags[1]');
  });

  it('相同对象无差异', () => {
    expect(diffObjects({ a: { b: [1, 2] } }, { a: { b: [1, 2] } })).toEqual([]);
  });

  it('summarizeDiff 统计数量', () => {
    const entries = diffObjects({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 });
    const s = summarizeDiff(entries);
    expect(s.changed).toBe(1);
    expect(s.added).toBe(1);
    expect(s.removed).toBe(0);
  });

  it('formatDiffValue 截断长字符串', () => {
    expect(formatDiffValue('x'.repeat(100), 10)).toContain('…');
    expect(formatDiffValue(null)).toBe('null');
    expect(formatDiffValue(undefined)).toBe('（无）');
  });
});

describe('workflow 两次运行对比', () => {
  it('compareRuns：状态 / 耗时 / 输入 / 输出 / 失败节点差异', () => {
    const a = createRunRecord({
      workflowId: 'wf-1',
      workflowName: 'W',
      workflowVersion: 'v1',
      mode: 'full',
      status: 'success',
      startedAt: 1,
      finishedAt: 100,
      durationMs: 99,
      inputSummary: { role: '审查员', limit: 5 },
      outputSummary: { report: 'A' },
      nodeResults: [],
      logs: [],
    });
    const b = createRunRecord({
      workflowId: 'wf-1',
      workflowName: 'W',
      workflowVersion: 'v1',
      mode: 'full',
      status: 'failed',
      startedAt: 2,
      finishedAt: 500,
      durationMs: 498,
      inputSummary: { role: '审查员', limit: 10 },
      outputSummary: { report: 'B' },
      nodeResults: [],
      logs: [],
      failedNodeId: 'n-2',
    });
    const cmp = compareRuns(a, b);
    expect(cmp.statusChanged).toBe(true);
    expect(cmp.durationChanged).toBe(true);
    expect(cmp.failedNodeChanged).toBe(true);
    expect(cmp.inputDiff.some((d) => d.path === 'limit')).toBe(true);
    expect(cmp.outputDiff.some((d) => d.path === 'report')).toBe(true);
  });
});
