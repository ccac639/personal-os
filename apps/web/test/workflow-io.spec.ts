import { describe, expect, it } from 'vitest';
import {
  buildRunInput,
  extractPath,
  parseJsonInput,
  summarizeOutputs,
  summarizeValue,
  validateInputDefs,
  validateInputValue,
  validateOutputDefs,
} from '@/features/workflows/io';
import type { WorkflowInputDef } from '@/features/workflows/types';

const textInput: WorkflowInputDef = {
  name: 'role',
  label: '角色',
  type: 'text',
  required: true,
  defaultValue: '审查员',
};

describe('workflow 输入输出契约', () => {
  it('输入字段校验：必填、类型、选择项', () => {
    expect(validateInputValue(textInput, undefined)).toBe('该输入为必填项');
    expect(validateInputValue({ ...textInput, required: false }, undefined)).toBeNull();
    expect(validateInputValue({ ...textInput, type: 'number' }, 'abc')).toBe('需要数字类型');
    expect(validateInputValue({ ...textInput, type: 'number' }, '3.14')).toBeNull();
    expect(validateInputValue({ ...textInput, type: 'boolean' }, 'yes')).toContain('布尔');
    expect(validateInputValue({ ...textInput, type: 'boolean' }, true)).toBeNull();
    expect(
      validateInputValue({ ...textInput, type: 'select', options: ['a', 'b'] }, 'c'),
    ).toContain('选择项');
    expect(
      validateInputValue({ ...textInput, type: 'select', options: ['a', 'b'] }, 'a'),
    ).toBeNull();
  });

  it('JSON 输入解析：合法对象通过，语法错误清晰反馈', () => {
    expect(parseJsonInput('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseJsonInput('   ')).toEqual({ ok: true, value: undefined });
    const bad = parseJsonInput('{a:1}');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('JSON 解析失败');
  });

  it('输入定义校验：名称重复 / 非法字符 / select 缺选项', () => {
    const issues = validateInputDefs([
      { name: 'a', label: 'A', type: 'text', required: false },
      { name: 'a', label: 'A2', type: 'text', required: false },
      { name: 'bad name!', label: 'B', type: 'text', required: false },
      { name: 's', label: 'S', type: 'select', required: false, options: [] },
    ]);
    expect(issues.some((i) => i.message.includes('重复'))).toBe(true);
    expect(issues.some((i) => i.message.includes('非法字符'))).toBe(true);
    expect(issues.some((i) => i.message.includes('必须配置选项'))).toBe(true);
  });

  it('buildRunInput：默认值合并 + 必填缺失错误', () => {
    const defs: WorkflowInputDef[] = [
      { name: 'role', label: '角色', type: 'text', required: true },
      { name: 'limit', label: '数量', type: 'number', required: false, defaultValue: 10 },
    ];
    const r1 = buildRunInput(defs, {});
    expect(r1.errors.role).toBeTruthy();
    expect(r1.variables.limit).toBe(10);

    const r2 = buildRunInput(defs, { role: '管理员', limit: 5 });
    expect(r2.errors).toEqual({});
    expect(r2.variables).toEqual({ role: '管理员', limit: 5 });
  });

  it('输出映射校验：来源节点不存在 / 名称重复', () => {
    const issues = validateOutputDefs(
      [
        { name: 'out', type: 'any', source: 'n-1' },
        { name: 'out', type: 'any', source: 'missing' },
      ],
      ['n-1'],
    );
    expect(issues.some((i) => i.message.includes('重复'))).toBe(true);
    expect(issues.some((i) => i.message.includes('不存在'))).toBe(true);
  });

  it('summarizeOutputs：按契约提取运行输出，缺失来源置 null', () => {
    const { outputs, missing } = summarizeOutputs(
      [
        { name: 'report', type: 'text', source: 'n-2.text' },
        { name: 'raw', type: 'any', source: 'n-1' },
        { name: 'gone', type: 'any', source: 'n-9' },
      ],
      { 'n-2': { text: '报告内容' }, 'n-1': { ok: true } },
    );
    expect(outputs.report).toBe('报告内容');
    expect(outputs.raw).toEqual({ ok: true });
    expect(outputs.gone).toBeNull();
    expect(missing).toEqual(['n-9']);
  });

  it('extractPath：点路径提取嵌套值', () => {
    expect(extractPath({ a: { b: { c: 1 } } }, 'a.b.c')).toBe(1);
    expect(extractPath({ a: 1 }, 'a.b')).toBeUndefined();
    expect(extractPath({ a: 1 }, undefined)).toEqual({ a: 1 });
  });

  it('summarizeValue：脱敏敏感键、截断长字符串', () => {
    const s = summarizeValue({ token: 'abc', name: 'x'.repeat(100), nested: { apiKey: 'k' } });
    expect(s).toMatchObject({ token: '[已脱敏]' });
    const obj = s as Record<string, unknown>;
    expect(String(obj.name)).toContain('已截断');
    expect(obj.nested).toMatchObject({ apiKey: '[已脱敏]' });
  });
});
