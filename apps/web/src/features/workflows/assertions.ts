/**
 * 运行结果断言（纯函数，无 Vue 依赖）
 *
 * 对工作流输出变量设置简单断言：存在 / 等于 / 包含 / 正则匹配 / 数值范围。
 * 模拟运行完成后执行；失败写入运行日志与历史。断言只读输入，
 * 不修改任何运行结果。
 */
export type AssertionOp = 'exists' | 'equals' | 'contains' | 'regex' | 'range';

export interface OutputAssertion {
  id: string;
  /** 输出定义名（如 output1）或节点输出路径（如 n-2.text） */
  source: string;
  op: AssertionOp;
  /** equals/contains/regex 的期望值 */
  expected?: string;
  /** range 下界（含） */
  min?: number;
  /** range 上界（含） */
  max?: number;
  enabled: boolean;
}

export interface AssertionResult {
  id: string;
  source: string;
  op: AssertionOp;
  /** 可读描述（如：output1 等于 "ok"） */
  label: string;
  passed: boolean;
  /** 实际值展示（截断） */
  actual?: unknown;
  message?: string;
}

export const ASSERTION_OPS: Array<{ value: AssertionOp; label: string }> = [
  { value: 'exists', label: '存在' },
  { value: 'equals', label: '等于' },
  { value: 'contains', label: '包含' },
  { value: 'regex', label: '正则匹配' },
  { value: 'range', label: '数值范围' },
];

export function assertionOpLabel(op: AssertionOp): string {
  return ASSERTION_OPS.find((o) => o.value === op)?.label ?? op;
}

/** 断言描述文案 */
export function describeAssertion(a: OutputAssertion): string {
  switch (a.op) {
    case 'exists':
      return `${a.source} 存在`;
    case 'equals':
      return `${a.source} 等于 ${formatExpect(a.expected)}`;
    case 'contains':
      return `${a.source} 包含 ${formatExpect(a.expected)}`;
    case 'regex':
      return `${a.source} 匹配 /${a.expected ?? ''}/`;
    case 'range': {
      const min = a.min !== undefined ? String(a.min) : '−∞';
      const max = a.max !== undefined ? String(a.max) : '+∞';
      return `${a.source} 在范围 [${min}, ${max}]`;
    }
    default:
      return a.source;
  }
}

function formatExpect(v: string | undefined): string {
  const s = v ?? '';
  return s.length > 40 ? `${s.slice(0, 40)}…` : JSON.stringify(s);
}

/** 值展示（截断，避免日志/历史过大） */
export function formatActual(v: unknown, maxLen = 80): string {
  if (v === undefined || v === null) return String(v);
  if (typeof v === 'string') return v.length > maxLen ? `${v.slice(0, maxLen)}…` : v;
  if (typeof v === 'object') {
    try {
      const s = JSON.stringify(v);
      return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
    } catch {
      return '[对象]';
    }
  }
  return String(v);
}

/** 宽松相等：数字字符串与数字互比；否则字符串比较 */
function looseEquals(actual: unknown, expected: string): boolean {
  if (typeof actual === 'number' && Number.isFinite(actual)) {
    const n = Number(expected);
    return Number.isFinite(n) ? actual === n : String(actual) === expected;
  }
  return String(actual) === expected;
}

/**
 * 执行单条断言。getValue 由调用方注入（支持「输出定义名」与「节点输出路径」两种来源）。
 */
export function evaluateAssertion(
  a: OutputAssertion,
  getValue: (source: string) => unknown,
): AssertionResult {
  const label = describeAssertion(a);
  const actual = getValue(a.source);
  const present = actual !== undefined && actual !== null;

  switch (a.op) {
    case 'exists':
      return {
        id: a.id,
        source: a.source,
        op: a.op,
        label,
        passed: present,
        actual,
        message: present ? undefined : `「${a.source}」不存在（值为空）`,
      };
    case 'equals': {
      const passed = present && looseEquals(actual, a.expected ?? '');
      return {
        id: a.id,
        source: a.source,
        op: a.op,
        label,
        passed,
        actual,
        message: passed
          ? undefined
          : `期望 ${formatExpect(a.expected)}，实际 ${formatActual(actual)}`,
      };
    }
    case 'contains': {
      const text = String(actual ?? '');
      const passed = present && text.includes(a.expected ?? '');
      return {
        id: a.id,
        source: a.source,
        op: a.op,
        label,
        passed,
        actual,
        message: passed
          ? undefined
          : `「${formatActual(actual)}」不包含 ${formatExpect(a.expected)}`,
      };
    }
    case 'regex': {
      let re: RegExp;
      try {
        re = new RegExp(a.expected ?? '');
      } catch {
        return {
          id: a.id,
          source: a.source,
          op: a.op,
          label,
          passed: false,
          actual,
          message: `正则表达式无效：${a.expected ?? ''}`,
        };
      }
      const passed = present && re.test(String(actual));
      return {
        id: a.id,
        source: a.source,
        op: a.op,
        label,
        passed,
        actual,
        message: passed ? undefined : `「${formatActual(actual)}」不匹配 /${a.expected ?? ''}/`,
      };
    }
    case 'range': {
      const n = typeof actual === 'number' ? actual : Number(String(actual));
      const valid = Number.isFinite(n);
      const passed =
        valid && (a.min === undefined || n >= a.min) && (a.max === undefined || n <= a.max);
      return {
        id: a.id,
        source: a.source,
        op: a.op,
        label,
        passed,
        actual,
        message: valid
          ? `值 ${n} 超出范围 [${a.min ?? '−∞'}, ${a.max ?? '+∞'}]`
          : `「${formatActual(actual)}」不是有效数值`,
      };
    }
    default:
      return {
        id: a.id,
        source: a.source,
        op: a.op,
        label,
        passed: false,
        actual,
        message: '未知断言类型',
      };
  }
}

/**
 * 批量执行断言（enabled=false 跳过）。getValue 支持两种来源：
 * 1. 输出定义名（汇总后的工作流输出）
 * 2. 节点输出路径：nodeId 或 nodeId.字段路径
 */
export function runAssertions(
  assertions: OutputAssertion[],
  getValue: (source: string) => unknown,
): AssertionResult[] {
  const results: AssertionResult[] = [];
  for (const a of assertions) {
    if (!a.enabled) continue;
    results.push(evaluateAssertion(a, getValue));
  }
  return results;
}

/** 断言摘要：通过 / 失败 / 跳过计数 */
export function summarizeAssertions(results: AssertionResult[]): {
  total: number;
  passed: number;
  failed: number;
} {
  const passed = results.filter((r) => r.passed).length;
  return { total: results.length, passed, failed: results.length - passed };
}

/** 生成断言 id */
export function nextAssertionId(): string {
  return `as-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
