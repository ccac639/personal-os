/**
 * 可读递归对象差异（纯函数，无 Vue 依赖）
 *
 * 用于两次运行对比：状态、耗时、输入/输出差异、失败节点差异。
 * 输出为扁平化的「路径 → { from, to }」映射，便于表格展示。
 * 数组按索引比较；对象键排序保证确定性输出。
 */
export type DiffKind = 'added' | 'removed' | 'changed';

export interface DiffEntry {
  path: string;
  kind: DiffKind;
  from?: unknown;
  to?: unknown;
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 递归比较两个值，返回差异条目（路径以点分隔，数组用 [i] 标记） */
export function diffObjects(a: unknown, b: unknown, base = ''): DiffEntry[] {
  const entries: DiffEntry[] = [];
  if (Object.is(a, b)) return entries;

  // 基础类型或类型不同 → 直接记录变更
  if (!isPlainObject(a) || !isPlainObject(b)) {
    if (Array.isArray(a) && Array.isArray(b)) {
      const len = Math.max(a.length, b.length);
      for (let i = 0; i < len; i++) {
        const av = i < a.length ? a[i] : undefined;
        const bv = i < b.length ? b[i] : undefined;
        if (Object.is(av, bv)) continue;
        const p = `${base}[${i}]`;
        if (av === undefined) entries.push({ path: p, kind: 'added', to: bv });
        else if (bv === undefined) entries.push({ path: p, kind: 'removed', from: av });
        else entries.push(...diffObjects(av, bv, p));
      }
      return entries;
    }
    return [{ path: base || '$', kind: 'changed', from: a, to: b }];
  }

  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const k of keys) {
    const p = base ? `${base}.${k}` : k;
    const av = a[k];
    const bv = b[k];
    if (Object.is(av, bv)) continue;
    if (av === undefined) entries.push({ path: p, kind: 'added', to: bv });
    else if (bv === undefined) entries.push({ path: p, kind: 'removed', from: av });
    else entries.push(...diffObjects(av, bv, p));
  }
  return entries;
}

/** 汇总统计（供对比面板展示数量） */
export function summarizeDiff(entries: DiffEntry[]): {
  added: number;
  removed: number;
  changed: number;
} {
  return {
    added: entries.filter((e) => e.kind === 'added').length,
    removed: entries.filter((e) => e.kind === 'removed').length,
    changed: entries.filter((e) => e.kind === 'changed').length,
  };
}

/** 值展示（截断长字符串/对象，避免对比表过宽） */
export function formatDiffValue(v: unknown, maxLen = 60): string {
  if (v === undefined) return '（无）';
  if (v === null) return 'null';
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
