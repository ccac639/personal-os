import { describe, expect, it } from 'vitest';
import {
  checkTypeCompatibility,
  diagnoseWorkflow,
  estimatePerformance,
  nodeInputExpects,
  nodeOutputType,
} from '@/features/workflows/diagnostics';
import {
  getNodeDef,
  type WorkflowEdgeModel,
  type WorkflowNodeModel,
} from '@/features/workflows/types';

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

const E: WorkflowEdgeModel = (s: string, t: string) => ({
  id: `${s}-${t}`,
  source: s,
  target: t,
  type: 'smoothstep',
});

describe('workflow 健康诊断', () => {
  it('孤立节点 / 空画布 / 循环引用', () => {
    const empty = diagnoseWorkflow([], []);
    expect(empty.some((d) => d.title === '画布为空' && d.severity === 'error')).toBe(true);

    const isolated = diagnoseWorkflow([mk('a', 'trigger'), mk('b', 'ai')], []);
    expect(isolated.some((d) => d.nodeId === 'b' && d.title === '孤立节点')).toBe(true);

    // 环：a → b → a
    const cyclic = diagnoseWorkflow(
      [mk('a', 'trigger'), mk('b', 'ai')],
      [E('a', 'b'), E('b', 'a')],
    );
    expect(cyclic.some((d) => d.title === '检测到循环引用' && d.severity === 'error')).toBe(true);
  });

  it('缺失配置（字段级校验）与输出来源不存在', () => {
    const noConfig = diagnoseWorkflow([mk('a', 'ai', { prompt: '' })], []);
    expect(noConfig.some((d) => d.category === 'config' && d.nodeId === 'a')).toBe(true);

    const badOut = diagnoseWorkflow([mk('a', 'trigger')], [], [], [{ name: 'x', source: 'n-99' }]);
    expect(badOut.some((d) => d.title === '输出来源节点不存在')).toBe(true);
  });

  it('未使用输入 / 无输出定义提示', () => {
    const issues = diagnoseWorkflow([mk('a', 'trigger')], [], [{ name: 'unused' }]);
    expect(issues.some((d) => d.title === '未使用的输入')).toBe(true);
    expect(issues.some((d) => d.title === '没有输出定义')).toBe(true);
  });

  it('过多分支警告', () => {
    const nodes = Array.from({ length: 7 }, (_, i) => mk(`c${i}`, 'condition', { expr: 'a == 1' }));
    const issues = diagnoseWorkflow(nodes, []);
    expect(issues.some((d) => d.title === '分支数量过多')).toBe(true);
  });
});

describe('workflow 性能预估', () => {
  it('估算步数 / 耗时 / 分支数（启发式）', () => {
    const est = estimatePerformance(
      [mk('a', 'trigger'), mk('b', 'condition'), mk('c', 'ai')],
      [E('a', 'b'), E('b', 'c')],
    );
    expect(est.estimatedSteps).toBeGreaterThanOrEqual(3);
    expect(est.branches).toBe(2); // condition 2 分支
    expect(est.estimatedMs).toBeGreaterThan(0);
    expect(est.mayLoop).toBe(false);
  });

  it('环路 → 标记潜在无限循环', () => {
    const est = estimatePerformance(
      [mk('a', 'trigger'), mk('b', 'ai')],
      [E('a', 'b'), E('b', 'a')],
    );
    expect(est.mayLoop).toBe(true);
    expect(est.mayExceedSteps).toBe(true);
  });
});

describe('workflow 类型兼容检查', () => {
  it('nodeOutputType / nodeInputExpects 推断', () => {
    expect(nodeOutputType(mk('a', 'condition'))).toBe('boolean');
    expect(nodeOutputType(mk('a', 'http-request'))).toBe('json');
    expect(nodeInputExpects('prompt')).toBe('text');
    expect(nodeInputExpects('merge')).toBe('json');
  });

  it('不兼容边产生警告，merge/switch 覆盖检查', () => {
    // boolean → text 不兼容（condition 输出接 prompt）
    const nodes = [mk('a', 'condition', { expr: 'x' }), mk('b', 'prompt')];
    const issues = checkTypeCompatibility(nodes, [E('a', 'b')]);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.message).toContain('不兼容');
  });

  it('兼容边不报错', () => {
    const nodes = [mk('a', 'prompt'), mk('b', 'ai')];
    expect(checkTypeCompatibility(nodes, [E('a', 'b')])).toEqual([]);
  });
});
