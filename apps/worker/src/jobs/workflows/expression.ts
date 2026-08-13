/**
 * 变量插值与安全条件表达式求值（语义与 api 端 workflow.expression.ts / web 端一致）
 */

const VAR_RE = /\{\{\s*([A-Za-z0-9_.\-]+)\s*\}\}/g;

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

export function formatVarValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export interface TemplateResult {
  ok: boolean;
  text: string;
  missing: string[];
}

export function resolveTemplate(
  template: string,
  vars: Record<string, unknown>,
): TemplateResult {
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

/* ---------- 条件表达式 ---------- */

type Token =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'ident'; v: string }
  | { t: 'op'; v: string };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = src.trim();
  while (i < s.length) {
    const c = s[i]!;
    if (c === ' ' || c === '\t') {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] ?? ''))) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j]!)) j++;
      tokens.push({ t: 'num', v: Number(s.slice(i, j)) });
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let buf = '';
      while (j < s.length && s[j] !== c) {
        buf += s[j]!;
        j++;
      }
      tokens.push({ t: 'str', v: buf });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_.]/.test(s[j]!)) j++;
      tokens.push({ t: 'ident', v: s.slice(i, j) });
      i = j;
      continue;
    }
    const two = s.slice(i, i + 2);
    if (two === '==' || two === '!=' || two === '>=' || two === '<=' || two === '&&' || two === '||') {
      tokens.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if ('()+-*/%!<>&|'.includes(c)) {
      tokens.push({ t: 'op', v: c });
      i++;
      continue;
    }
    throw new Error(`无法识别的字符：${c}`);
  }
  return tokens;
}

interface Parser {
  tokens: Token[];
  pos: number;
}

function peek(p: Parser): Token | null {
  return p.tokens[p.pos] ?? null;
}
function next(p: Parser): Token | null {
  const t = p.tokens[p.pos] ?? null;
  if (t) p.pos++;
  return t;
}
function expectOp(p: Parser, v: string): boolean {
  const t = peek(p);
  if (t && t.t === 'op' && t.v === v) {
    p.pos++;
    return true;
  }
  return false;
}

type Value = number | string | boolean | null;

function parseOr(p: Parser, ctx: Record<string, unknown>): Value {
  let left = parseAnd(p, ctx);
  while (expectOp(p, '||')) {
    const right = parseAnd(p, ctx);
    left = Boolean(left) || Boolean(right);
  }
  return left;
}
function parseAnd(p: Parser, ctx: Record<string, unknown>): Value {
  let left = parseNot(p, ctx);
  while (expectOp(p, '&&')) {
    const right = parseNot(p, ctx);
    left = Boolean(left) && Boolean(right);
  }
  return left;
}
function parseNot(p: Parser, ctx: Record<string, unknown>): Value {
  if (expectOp(p, '!')) {
    return !Boolean(parseNot(p, ctx));
  }
  return parseCompare(p, ctx);
}
function parseCompare(p: Parser, ctx: Record<string, unknown>): Value {
  const left = parseAdd(p, ctx);
  const t = peek(p);
  if (t && t.t === 'op' && ['==', '!=', '>', '<', '>=', '<='].includes(t.v)) {
    p.pos++;
    const right = parseAdd(p, ctx);
    const op = t.v;
    if (op === '==') return looseEq(left, right);
    if (op === '!=') return !looseEq(left, right);
    const ln = Number(left);
    const rn = Number(right);
    if (op === '>') return ln > rn;
    if (op === '<') return ln < rn;
    if (op === '>=') return ln >= rn;
    return ln <= rn;
  }
  return left;
}
function parseAdd(p: Parser, ctx: Record<string, unknown>): Value {
  let left = parseMul(p, ctx);
  for (;;) {
    const t = peek(p);
    if (t && t.t === 'op' && (t.v === '+' || t.v === '-')) {
      p.pos++;
      const right = parseMul(p, ctx);
      const op = t.v;
      if (op === '+') {
        if (typeof left === 'string' || typeof right === 'string') {
          left = `${formatVarValue(left)}${formatVarValue(right)}`;
        } else {
          left = Number(left) + Number(right);
        }
      } else {
        left = Number(left) - Number(right);
      }
      continue;
    }
    break;
  }
  return left;
}
function parseMul(p: Parser, ctx: Record<string, unknown>): Value {
  let left = parseUnary(p, ctx);
  for (;;) {
    const t = peek(p);
    if (t && t.t === 'op' && ['*', '/', '%'].includes(t.v)) {
      p.pos++;
      const right = parseUnary(p, ctx);
      const op = t.v;
      if (op === '*') left = Number(left) * Number(right);
      else if (op === '/') left = Number(left) / Number(right);
      else left = Number(left) % Number(right);
      continue;
    }
    break;
  }
  return left;
}
function parseUnary(p: Parser, ctx: Record<string, unknown>): Value {
  const t = peek(p);
  if (t && t.t === 'op' && (t.v === '-' || t.v === '+')) {
    p.pos++;
    const v = parseUnary(p, ctx);
    return t.v === '-' ? -Number(v) : Number(v);
  }
  return parsePrimary(p, ctx);
}
function parsePrimary(p: Parser, ctx: Record<string, unknown>): Value {
  const t = next(p);
  if (!t) throw new Error('表达式意外结束');
  if (t.t === 'num') return t.v;
  if (t.t === 'str') return t.v;
  if (t.t === 'op' && t.v === '(') {
    const v = parseOr(p, ctx);
    if (!expectOp(p, ')')) throw new Error('缺少右括号');
    return v;
  }
  if (t.t === 'ident') {
    if (t.v === 'true') return true;
    if (t.v === 'false') return false;
    if (t.v === 'null') return null;
    const parts = t.v.split('.');
    let cur: unknown = ctx;
    for (const part of parts) {
      if (cur === null || cur === undefined || typeof cur !== 'object') {
        cur = undefined;
        break;
      }
      cur = (cur as Record<string, unknown>)[part];
    }
    return (cur as Value) ?? null;
  }
  throw new Error(`意外的符号：${t.v}`);
}

function looseEq(a: Value, b: Value): boolean {
  if (a === null || b === null) return a === b;
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  if (typeof a === 'string' && typeof b === 'string') return a === b;
  return String(a) === String(b);
}

export function evalCondition(
  expr: string,
  ctx: Record<string, unknown>,
): { ok: boolean; result: boolean; error?: string } {
  try {
    const tokens = tokenize(expr);
    const parser: Parser = { tokens, pos: 0 };
    const value = parseOr(parser, ctx);
    if (parser.pos !== tokens.length) {
      return { ok: false, result: false, error: '表达式包含多余的符号' };
    }
    return { ok: true, result: Boolean(value) };
  } catch (e) {
    return {
      ok: false,
      result: false,
      error: e instanceof Error ? e.message : '表达式无法解析',
    };
  }
}
