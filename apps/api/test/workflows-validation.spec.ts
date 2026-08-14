/**
 * 工作流导入校验测试：节点类型、边引用（孤立边）、循环、输入输出映射
 */
import { describe, expect, it } from 'vitest';

import { validateWorkflowPayload } from '../src/modules/workflows/workflow.validation.js';
import { evalCondition, resolveTemplate } from '../src/modules/workflows/workflow.expression.js';
import { redactValue } from '../src/modules/workflows/workflow.redact.js';

function baseNodes() {
  return [
    { id: 'n-1', data: { kind: 'trigger', label: '触发' } },
    { id: 'n-2', data: { kind: 'output', label: '输出' } },
  ];
}

describe('workflow validation', () => {
  it('接受合法结构', () => {
    const { result, diagnostic } = validateWorkflowPayload({
      name: 'ok',
      nodes: baseNodes(),
      edges: [{ id: 'e-1', source: 'n-1', target: 'n-2' }],
      inputs: [],
      outputs: [],
    });
    expect(result.ok).toBe(true);
    expect(diagnostic.nodeCount).toBe(2);
    expect(diagnostic.edgeCount).toBe(1);
  });

  it('拒绝未知节点类型', () => {
    const { result } = validateWorkflowPayload({
      name: 'bad',
      nodes: [
        { id: 'n-1', data: { kind: 'trigger', label: '触发' } },
        { id: 'n-2', data: { kind: 'hacker', label: 'x' } },
      ],
      edges: [],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('')).toContain('类型非法');
  });

  it('拒绝节点 id 重复', () => {
    const { result } = validateWorkflowPayload({
      name: 'bad',
      nodes: [
        { id: 'n-1', data: { kind: 'trigger', label: 'a' } },
        { id: 'n-1', data: { kind: 'output', label: 'b' } },
      ],
      edges: [],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('')).toContain('重复');
  });

  it('拒绝孤立边（引用不存在的节点）与自环', () => {
    const r1 = validateWorkflowPayload({
      name: 'bad',
      nodes: baseNodes(),
      edges: [{ id: 'e-1', source: 'n-1', target: 'ghost' }],
    });
    expect(r1.result.ok).toBe(false);
    expect(r1.result.errors.join('')).toContain('孤立边');

    const r2 = validateWorkflowPayload({
      name: 'bad',
      nodes: baseNodes(),
      edges: [{ id: 'e-1', source: 'n-1', target: 'n-1' }],
    });
    expect(r2.result.ok).toBe(false);
    expect(r2.result.errors.join('')).toContain('自环');
  });

  it('拒绝图循环（含多节点环）', () => {
    const { result } = validateWorkflowPayload({
      name: 'loop',
      nodes: [
        { id: 'n-1', data: { kind: 'trigger', label: 'a' } },
        { id: 'n-2', data: { kind: 'output', label: 'b' } },
        { id: 'n-3', data: { kind: 'output', label: 'c' } },
      ],
      edges: [
        { id: 'e-1', source: 'n-1', target: 'n-2' },
        { id: 'e-2', source: 'n-2', target: 'n-3' },
        { id: 'e-3', source: 'n-3', target: 'n-2' },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('')).toContain('循环依赖');
  });

  it('annotation 节点不参与拓扑（不误报环）', () => {
    const { result } = validateWorkflowPayload({
      name: 'anno',
      nodes: [
        { id: 'n-1', data: { kind: 'trigger', label: 'a' } },
        { id: 'n-2', data: { kind: 'output', label: 'b' } },
        { id: 'n-3', data: { kind: 'annotation', label: '说明', text: 'hi' } },
      ],
      edges: [{ id: 'e-1', source: 'n-1', target: 'n-2' }],
    });
    expect(result.ok).toBe(true);
  });

  it('拒绝非法输入映射（名称非法 / 重复 / select 缺选项）', () => {
    const { result } = validateWorkflowPayload({
      name: 'bad-inputs',
      nodes: baseNodes(),
      edges: [{ id: 'e-1', source: 'n-1', target: 'n-2' }],
      inputs: [
        { name: 'bad name!', label: 'x', type: 'text', required: true },
        { name: 'sel', label: 's', type: 'select', required: false, options: [] },
      ],
      outputs: [],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('')).toContain('非法字符');
    expect(result.errors.join('')).toContain('必须配置选项');
  });

  it('拒绝输出引用不存在的节点', () => {
    const { result } = validateWorkflowPayload({
      name: 'bad-output',
      nodes: baseNodes(),
      edges: [{ id: 'e-1', source: 'n-1', target: 'n-2' }],
      inputs: [],
      outputs: [{ name: 'out', type: 'text', source: 'n-99.text' }],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('')).toContain('引用的节点「n-99」不存在');
  });

  it('拒绝子流程自引用与非法映射', () => {
    const { result } = validateWorkflowPayload({
      name: 'sub',
      nodes: [
        { id: 'n-1', data: { kind: 'trigger', label: 'a' } },
        {
          id: 'n-2',
          data: {
            kind: 'subworkflow',
            label: 'sub',
            workflowRef: 'n-2',
            inputMap: { a: '' },
          },
        },
      ],
      edges: [{ id: 'e-1', source: 'n-1', target: 'n-2' }],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('')).toContain('不能引用自身');
    expect(result.errors.join('')).toContain('映射目标必须是非空字符串');
  });

  it('拒绝越界 runConfig', () => {
    const { result } = validateWorkflowPayload({
      name: 'cfg',
      nodes: baseNodes(),
      edges: [],
      runConfig: { maxSteps: 999999, timeoutMs: 0, failStrategy: 'boom' },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('')).toContain('maxSteps');
    expect(result.errors.join('')).toContain('timeoutMs');
    expect(result.errors.join('')).toContain('failStrategy');
  });

  it('条件表达式安全求值（无代码执行）', () => {
    expect(evalCondition('result == "ok"', { result: 'ok' }).result).toBe(true);
    expect(evalCondition('a.b > 1 && !flag', { a: { b: 2 }, flag: false }).result).toBe(true);
    expect(evalCondition('a + 1 == 3', { a: 2 }).result).toBe(true);
    // 条件表达式标识符不含 `-`（与 web 端语义一致；模板插值才支持 n-1 形式）
    expect(evalCondition('a.text', { a: { text: 'x' } }).result).toBe(true);
    expect(evalCondition('a.text', { a: { text: 'x' } }).ok).toBe(true);
    // 非法语法 → ok=false 而不是抛异常
    const bad = evalCondition('process.exit(1)', {});
    expect(bad.ok).toBe(false);
    // 无法通过表达式执行函数（无调用语法）
    const evil = evalCondition('1; require("fs")', {});
    expect(evil.ok).toBe(false);
  });

  it('模板插值：缺失变量保留原样', () => {
    const r = resolveTemplate('hi {{name}}, {{missing.x}}', { name: 'OS' });
    expect(r.text).toBe('hi OS, {{missing.x}}');
    expect(r.missing).toEqual(['missing.x']);
  });

  it('脱敏：密钥 / 二进制 / 长字符串 / 循环引用', () => {
    const obj: Record<string, unknown> = {
      apiKey: 'sk-1234567890',
      password: 'p@ss',
      data: Buffer.from('binary-bytes'),
      long: 'x'.repeat(500),
      nested: { list: Array.from({ length: 50 }, (_, i) => i) },
    };
    obj.self = obj;
    const redacted = redactValue(obj) as Record<string, unknown>;
    expect(redacted.apiKey).toBe('[REDACTED]');
    expect(redacted.password).toBe('[REDACTED]');
    expect(redacted.data).toBe('[binary]');
    expect(String(redacted.long)).toContain('已截断');
    // 循环引用被替换为标记
    expect(redacted.self).toBe('[circular]');
  });
});
