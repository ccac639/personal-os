import { describe, expect, it } from 'vitest';
import {
  extractVars,
  findMissingVars,
  lookupPath,
  resolveTemplate,
} from '@/features/workflows/vars';

describe('workflow 变量插值', () => {
  it('提取变量：{{input}} 与 {{previous.output}} 点路径', () => {
    expect(extractVars('你好 {{input}}，结果是 {{ previous.output }}')).toEqual([
      'input',
      'previous.output',
    ]);
    expect(extractVars('没有变量')).toEqual([]);
    expect(extractVars('')).toEqual([]);
  });

  it('渲染：替换存在的变量，缺失保留原样并列入 missing', () => {
    const r = resolveTemplate('结果是 {{result}}，来自 {{input}}', {
      result: 'ok',
      input: '测试',
    });
    expect(r.ok).toBe(true);
    expect(r.text).toBe('结果是 ok，来自 测试');
    expect(r.missing).toEqual([]);

    const m = resolveTemplate('{{a}} 与 {{b}}', { a: 1 });
    expect(m.ok).toBe(false);
    expect(m.text).toBe('1 与 {{b}}');
    expect(m.missing).toEqual(['b']);
  });

  it('点路径取值：lookupPath 支持嵌套对象', () => {
    const vars = { previous: { output: { text: 'hello' } }, input: 'x' };
    expect(lookupPath(vars, 'previous.output.text')).toBe('hello');
    expect(lookupPath(vars, 'previous.output')).toEqual({ text: 'hello' });
    expect(lookupPath(vars, 'missing.path')).toBeUndefined();
  });

  it('对象值渲染为 JSON 字符串', () => {
    const r = resolveTemplate('数据：{{data}}', { data: { a: 1 } });
    expect(r.text).toBe('数据：{"a":1}');
  });

  it('缺失变量检测：findMissingVars', () => {
    expect(findMissingVars('{{a}} {{b.c}}', { a: 1, b: { c: 2 } })).toEqual([]);
    expect(findMissingVars('{{a}} {{b.c}}', { a: 1 })).toEqual(['b.c']);
    expect(findMissingVars('', {})).toEqual([]);
  });
});
