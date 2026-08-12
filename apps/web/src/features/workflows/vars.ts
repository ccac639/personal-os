/**
 * 变量插值（纯函数）
 *
 * 支持 `{{input}}`、`{{previous.output}}` 形式的点路径变量引用。
 * 渲染时缺失变量会被标记并给出提示，而不是静默替换为空。
 */

const VAR_RE = /\{\{\s*([A-Za-z0-9_.\-]+)\s*\}\}/g;

/** 提取文本中的所有变量名（去重、保序） */
export function extractVars(text: string): string[] {
  const out: string[] = [];
  if (!text) return out;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  VAR_RE.lastIndex = 0;
  while ((m = VAR_RE.exec(text)) !== null) {
    const name = m[1]!;
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/** 按点路径从对象取值：lookupPath({a:{b:1}}, 'a.b') → 1 */
export function lookupPath(obj: Record<string, unknown>, path: string): unknown {
  if (!path) return undefined;
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** 标量格式化（插值文本展示用） */
export function formatVarValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export interface TemplateResult {
  ok: boolean;
  /** 渲染后的文本（缺失变量保留原样，便于排查） */
  text: string;
  /** 缺失的变量名 */
  missing: string[];
}

/**
 * 渲染模板：用 vars 中的值替换 {{path}}。
 * 缺失变量保留 `{{name}}` 原样并列入 missing。
 */
export function resolveTemplate(template: string, vars: Record<string, unknown>): TemplateResult {
  const missing: string[] = [];
  if (!template) return { ok: true, text: '', missing };
  const text = template.replace(VAR_RE, (raw, name: string) => {
    const value = lookupPath(vars, name);
    if (value === undefined || value === null) {
      missing.push(name);
      return raw;
    }
    return formatVarValue(value);
  });
  return { ok: missing.length === 0, text, missing };
}

/** 检查文本中的变量引用是否都在 vars 中（无替换，只检测） */
export function findMissingVars(template: string, vars: Record<string, unknown>): string[] {
  const names = extractVars(template);
  return names.filter((n) => lookupPath(vars, n) === undefined);
}

/** 运行时上下文是否含某个节点输出（供条件表达式 / 插值判断） */
export function hasVar(vars: Record<string, unknown>, name: string): boolean {
  return lookupPath(vars, name) !== undefined;
}

/**
 * 在文本的 caret 位置插入变量引用 `{{name}}`。
 * 返回插入后的文本与新的光标位置（便于连续插入）。
 */
export function insertVarRef(
  text: string,
  name: string,
  caret: number = text.length,
): { text: string; caret: number } {
  const ref = `{{${name}}}`;
  const safe = Math.max(0, Math.min(caret, text.length));
  return {
    text: text.slice(0, safe) + ref + text.slice(safe),
    caret: safe + ref.length,
  };
}
