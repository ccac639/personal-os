/**
 * 本地模拟执行器（纯函数，无 Vue 依赖）
 *
 * 输入：工作流快照 + 运行参数 + 运行模式；输出：执行结果（日志 / 节点输出 /
 * 失败信息与修复建议）。支持暂停 / 继续 / 取消，通过共享 RunControl 实现。
 *
 * 真实执行（AI 调用 / 代码运行 / 通知发送）后续由 service 注入，
 * 此处仅做前端模拟：为每个节点生成确定性的模拟输出。
 */
import {
  getNodeDef,
  nodeData,
  type RunLogEntry,
  type RunLogLevel,
  type RunMode,
  type RunParams,
  type WorkflowEdgeModel,
  type WorkflowNodeModel,
} from './types';
import { topoSort } from './topo';
import { resolveTemplate, extractVars, formatVarValue } from './vars';
import { buildRunInput } from './io';
import type { WorkflowInputDef, WorkflowOutputDef } from './types';

export interface RunSnapshot {
  nodes: WorkflowNodeModel[];
  edges: WorkflowEdgeModel[];
}

export interface RunResult {
  status: 'success' | 'failed' | 'cancelled';
  ok: boolean;
  logs: RunLogEntry[];
  /** 节点 id → 模拟输出 */
  outputs: Record<string, unknown>;
  /** 失败节点 id（failed 时） */
  failedNodeId?: string;
  /** 可读错误信息 */
  error?: string;
  /** 修复建议 */
  suggestion?: string;
  durationMs: number;
}

export interface RunProgress {
  nodeId: string;
  status: 'running' | 'success' | 'error';
}

export interface RunnerHooks {
  onLog?: (entry: RunLogEntry) => void;
  onProgress?: (progress: RunProgress) => void;
  onEdgeActive?: (sourceId: string, active: boolean) => void;
  /** 命中断点（执行前暂停），UI 可据此切换「已暂停」状态 */
  onBreakpoint?: (nodeId: string) => void;
  /** 单步执行完一个节点后自动暂停，UI 可据此切换「已暂停」状态 */
  onPause?: () => void;
  /** 人工确认节点进入等待时通知 UI */
  onApprovalWait?: (nodeId: string) => void;
  /** 演示用的等待（默认 60ms，测试可注入 0） */
  sleep?: (ms: number) => Promise<void>;
}

export interface RunControl {
  paused: boolean;
  cancelled: boolean;
  /** 断点节点 id 集合（执行前暂停） */
  breakpoints: Set<string>;
  /** 单步请求：执行完下一个节点后自动暂停 */
  stepOnce: boolean;
  /** 人工确认结果（manual-approval 节点使用） */
  approval: 'approved' | 'rejected' | null;
  resume(): void;
  cancel(): void;
  waitIfPaused(): Promise<void>;
}

/** 创建共享运行控制 */
export function createRunControl(): RunControl {
  let resumeResolvers: Array<() => void> = [];
  const ctrl: RunControl = {
    paused: false,
    cancelled: false,
    breakpoints: new Set<string>(),
    stepOnce: false,
    approval: null,
    resume() {
      ctrl.paused = false;
      const resolvers = resumeResolvers;
      resumeResolvers = [];
      for (const r of resolvers) r();
    },
    cancel() {
      ctrl.cancelled = true;
      ctrl.paused = false;
      const resolvers = resumeResolvers;
      resumeResolvers = [];
      for (const r of resolvers) r();
    },
    async waitIfPaused() {
      while (ctrl.paused && !ctrl.cancelled) {
        await new Promise<void>((resolve) => {
          resumeResolvers.push(resolve);
          // 防御：即使 resume 未触发也尽快重查
          setTimeout(() => {
            const idx = resumeResolvers.indexOf(resolve);
            if (idx >= 0) resumeResolvers.splice(idx, 1);
            resolve();
          }, 120);
        });
      }
    },
  };
  return ctrl;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ================= 安全表达式求值（条件节点） ================= */

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
    if (
      two === '==' ||
      two === '!=' ||
      two === '>=' ||
      two === '<=' ||
      two === '&&' ||
      two === '||'
    ) {
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
    // 点路径变量：从上下文取值
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

/**
 * 条件表达式求值（安全，不执行任意代码）。
 * 语法：变量（点路径）、数字、字符串、布尔、比较、逻辑、四则、括号。
 */
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

/* ================= 节点模拟执行 ================= */

export interface NodeExecution {
  nodeId: string;
  output: unknown;
  logs: Array<{ level: RunLogLevel; text: string }>;
  ok: boolean;
  error?: string;
  suggestion?: string;
  /** 条件/分支节点走的分支标识（true/false 或 switch 用例标签） */
  branch?: string;
  /** 需要主循环异步处理（子流程调用 / 人工确认等待） */
  asyncNeeded?: boolean;
}

function truncate(text: string, n = 120): string {
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

/**
 * 模拟执行单个节点。
 * ctx 为运行上下文（变量 + 各节点输出）。
 * upstreamIds 为入边源节点 id（merge/transform concat 收集上游用）。
 * params / control 保留为 service 注入边界（真实执行时使用）。
 */
export function executeNode(
  node: WorkflowNodeModel,
  ctx: Record<string, unknown>,
  params: RunParams,
  control: RunControl,
  upstreamIds: string[] = [],
): NodeExecution {
  // params / control 保留为 service 注入边界（真实执行时使用）
  void params;
  void control;
  const data = nodeData(node);
  const label = data.label || getNodeDef(data.kind).label;
  const logs: NodeExecution['logs'] = [];

  // 失败注入（演示/测试用）
  if (data.simulateError) {
    return {
      nodeId: node.id,
      output: null,
      logs: [
        { level: 'error', text: `${label}：${data.simulateError}` },
        {
          level: 'info',
          text: '修复建议：检查节点的「模拟失败注入」配置，移除后重试',
        },
      ],
      ok: false,
      error: data.simulateError,
      suggestion: '检查节点的「模拟失败注入」配置，移除后重试',
    };
  }

  switch (data.kind) {
    case 'trigger': {
      const output = { cron: data.cron ?? '', source: 'trigger' };
      return {
        nodeId: node.id,
        output,
        logs: [{ level: 'info', text: `${label}：定时 ${data.cron ?? '未配置'}` }],
        ok: true,
      };
    }
    case 'prompt': {
      const template = data.template ?? '';
      const missing = extractVars(template).filter((v) => lookupInCtx(ctx, v) === undefined);
      const rendered = resolveTemplate(template, ctx);
      const out = { text: rendered.text, kind: 'prompt' };
      if (missing.length > 0) {
        logs.push({
          level: 'warn',
          text: `${label}：模板缺失变量 ${missing.join('、')}，已保留原样`,
        });
      }
      logs.push({ level: 'success', text: `${label}：模板渲染完成` });
      return { nodeId: node.id, output: out, logs, ok: true };
    }
    case 'ai': {
      const prompt = data.prompt ?? '';
      const missing = extractVars(prompt).filter((v) => lookupInCtx(ctx, v) === undefined);
      const rendered = resolveTemplate(prompt, ctx);
      if (missing.length > 0) {
        logs.push({
          level: 'warn',
          text: `${label}：提示词缺失变量 ${missing.join('、')}`,
        });
      }
      const content = rendered.text || prompt;
      const out = {
        text: truncate(content),
        model: data.model ?? '',
        outputFormat: data.outputFormat ?? 'text',
        kind: 'ai',
      };
      logs.push({
        level: 'success',
        text: `${label}：[模拟] ${data.model ?? ''} 生成完成（${content.length} 字符）`,
      });
      return { nodeId: node.id, output: out, logs, ok: true };
    }
    case 'code': {
      const out = {
        text: `[模拟] ${data.lang ?? 'python'} 代码执行成功`,
        lang: data.lang,
        kind: 'code',
      };
      logs.push({ level: 'success', text: `${label}：[模拟] ${data.lang ?? 'python'} 执行成功` });
      return { nodeId: node.id, output: out, logs, ok: true };
    }
    case 'condition': {
      const expr = data.expr ?? '';
      const { ok, result, error } = evalCondition(expr, ctx);
      if (!ok) {
        return {
          nodeId: node.id,
          output: null,
          logs: [
            { level: 'error', text: `${label}：条件表达式错误 - ${error ?? '未知'}` },
            {
              level: 'info',
              text: '修复建议：检查表达式语法；变量需来自运行参数或上游节点输出',
            },
          ],
          ok: false,
          error: `条件表达式错误：${error ?? '未知'}`,
          suggestion: '检查表达式语法；变量需来自运行参数或上游节点输出',
        };
      }
      const branch: 'true' | 'false' = result ? 'true' : 'false';
      logs.push({
        level: 'info',
        text: `${label}：条件 ${result ? '成立' : '不成立'}，走「${
          result ? data.trueLabel || '通过' : data.falseLabel || '不通过'
        }」分支`,
      });
      return { nodeId: node.id, output: { result }, logs, ok: true, branch };
    }
    case 'delay': {
      const seconds = data.seconds ?? 0;
      logs.push({ level: 'info', text: `${label}：模拟等待 ${seconds}s（演示加速）` });
      return { nodeId: node.id, output: { seconds }, logs, ok: true };
    }
    case 'notify': {
      const title = resolveTemplate(data.title ?? '', ctx).text;
      const message = resolveTemplate(data.message ?? '', ctx).text;
      const out = {
        channel: data.channel ?? '',
        title,
        message,
        level: data.level ?? 'info',
        kind: 'notify',
      };
      logs.push({
        level: 'success',
        text: `${label}：[模拟] 通知 ${data.channel ?? ''}（${data.level ?? 'info'}）已发送`,
      });
      return { nodeId: node.id, output: out, logs, ok: true };
    }
    case 'output': {
      const previous = ctx.previous;
      const content =
        previous !== undefined
          ? typeof previous === 'object'
            ? JSON.stringify(previous, null, 2)
            : String(previous)
          : '（无上游输出）';
      const out = {
        name: data.outputName ?? '',
        format: data.format ?? 'text',
        content,
        kind: 'output',
      };
      logs.push({
        level: 'success',
        text: `${label}：${data.outputName || '输出'} 汇总 ${truncate(content, 60)}`,
      });
      return { nodeId: node.id, output: out, logs, ok: true };
    }
    /* ---------- 自动化节点 ---------- */
    case 'transform': {
      const op = data.transformOp ?? 'template';
      const input = ctx.previous ?? ctx.input;
      let out: unknown;
      switch (op) {
        case 'template': {
          const rendered = resolveTemplate(data.transformTemplate ?? '', ctx);
          if (rendered.missing.length > 0) {
            logs.push({
              level: 'warn',
              text: `${label}：模板缺失变量 ${rendered.missing.join('、')}`,
            });
          }
          out = { text: rendered.text, kind: 'transform' };
          break;
        }
        case 'jsonpath': {
          const path = data.jsonPath ?? '';
          out = { value: lookupInCtx(ctx, path), path, kind: 'transform' };
          break;
        }
        case 'upper':
          out = { text: String(input ?? '').toUpperCase(), kind: 'transform' };
          break;
        case 'lower':
          out = { text: String(input ?? '').toLowerCase(), kind: 'transform' };
          break;
        case 'trim':
          out = { text: String(input ?? '').trim(), kind: 'transform' };
          break;
        case 'concat': {
          const sep = data.separator ?? ',';
          const values = collectUpstreamValues(upstreamIds, ctx);
          out = { text: values.map((v) => formatVarValue(v)).join(sep), kind: 'transform' };
          break;
        }
        case 'slice': {
          const s = String(input ?? '');
          const start = data.sliceStart ?? 0;
          const end = data.sliceEnd;
          out = {
            text: end !== undefined ? s.slice(start, end) : s.slice(start),
            kind: 'transform',
          };
          break;
        }
        default:
          out = { text: '', kind: 'transform' };
      }
      logs.push({ level: 'success', text: `${label}：转换完成（${op}）` });
      return { nodeId: node.id, output: out, logs, ok: true };
    }
    case 'switch': {
      const expr = data.expr ?? '';
      const { ok, result, error } = evalCondition(expr, ctx);
      if (!ok) {
        return {
          nodeId: node.id,
          output: null,
          logs: [
            { level: 'error', text: `${label}：路由表达式错误 - ${error ?? '未知'}` },
            { level: 'info', text: '修复建议：检查表达式语法与变量来源' },
          ],
          ok: false,
          error: `路由表达式错误：${error ?? '未知'}`,
          suggestion: '检查表达式语法与变量来源',
        };
      }
      const cases = data.cases ?? [];
      const matched = cases.find((c) => evalCondition(c.expr, ctx).result);
      const branchLabel = matched?.label ?? data.defaultLabel ?? 'default';
      logs.push({
        level: 'info',
        text: `${label}：路由到「${branchLabel}」分支`,
      });
      return {
        nodeId: node.id,
        output: { branch: branchLabel, value: result },
        logs,
        ok: true,
        branch: branchLabel,
      };
    }
    case 'merge': {
      const values = collectUpstreamValues(upstreamIds, ctx);
      const mode = data.mergeMode ?? 'concat';
      let out: unknown;
      if (mode === 'concat') out = { list: values, kind: 'merge' };
      else if (mode === 'object') {
        const obj: Record<string, unknown> = {};
        for (const v of values) {
          if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(obj, v);
        }
        out = { obj, kind: 'merge' };
      } else if (mode === 'first')
        out = { value: values.find((v) => v !== undefined && v !== null) ?? null, kind: 'merge' };
      else out = { value: values[values.length - 1] ?? null, kind: 'merge' };
      logs.push({ level: 'success', text: `${label}：聚合 ${values.length} 个输入（${mode}）` });
      return { nodeId: node.id, output: out, logs, ok: true };
    }
    case 'manual-approval': {
      // 模拟等待：设置暂停并标记需要主循环通知 UI（resume / reject 后继续）
      if (!control.paused && !control.cancelled) {
        control.paused = true;
        logs.push({
          level: 'warn',
          text: `${label}：等待本地确认（${data.approvalPrompt ?? '是否继续？'}）`,
        });
      } else {
        const approved = control.approval !== 'rejected';
        logs.push({
          level: 'success',
          text: `${label}：${approved ? '已确认' : '已拒绝'}`,
        });
      }
      const approved = control.approval !== 'rejected';
      return {
        nodeId: node.id,
        output: { approved, prompt: data.approvalPrompt ?? '' },
        logs,
        ok: true,
        asyncNeeded: control.paused,
      };
    }
    case 'http-request': {
      // 仅 mock：绝不发起真实网络请求
      const status = data.mockStatus ?? 200;
      let body: unknown = data.mockBody ?? '';
      try {
        body = JSON.parse(data.mockBody ?? '');
      } catch {
        body = data.mockBody ?? '';
      }
      const okStatus = status >= 200 && status < 300;
      const out = {
        status,
        ok: okStatus,
        data: body,
        method: data.method ?? 'GET',
        url: data.url ?? '',
        kind: 'http-request',
      };
      logs.push({
        level: okStatus ? 'success' : 'warn',
        text: `${label}：[Mock] ${data.method ?? 'GET'} ${data.url ?? ''} → ${status}`,
      });
      return { nodeId: node.id, output: out, logs, ok: true };
    }
    case 'schedule': {
      const isCron = data.scheduleType !== 'interval';
      const preview = isCron
        ? `Cron ${data.cron ?? '未配置'}（本地预览，不注册真实定时任务）`
        : `每 ${data.intervalValue ?? 1}${data.intervalUnit ?? 'min'}（本地预览）`;
      logs.push({ level: 'info', text: `${label}：${preview}` });
      return {
        nodeId: node.id,
        output: {
          type: isCron ? 'cron' : 'interval',
          cron: isCron ? data.cron : undefined,
          intervalValue: isCron ? undefined : data.intervalValue,
          intervalUnit: isCron ? undefined : data.intervalUnit,
          kind: 'schedule',
        },
        logs,
        ok: true,
      };
    }
    case 'subworkflow': {
      // 异步执行在主循环处理；此处返回「需要异步」标记
      const inputValues = buildSubflowInputs(node, ctx);
      const pending: NodeExecution & { asyncNeeded: true } = {
        nodeId: node.id,
        output: null,
        logs: [
          {
            level: 'info',
            text: `${label}：准备调用子流程（${Object.keys(inputValues).length} 个输入）`,
          },
        ],
        ok: true,
        asyncNeeded: true,
      };
      return pending;
    }
    default:
      return {
        nodeId: node.id,
        output: null,
        logs: [{ level: 'error', text: `${label}：未知节点类型 ${data.kind}` }],
        ok: false,
        error: `未知节点类型 ${data.kind}`,
        suggestion: '删除该节点后重新从节点库添加',
      };
  }
}

function lookupInCtx(ctx: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = ctx;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** 收集某节点的所有上游节点输出（入边源节点的 ctx 值） */
function collectUpstreamValues(upstreamIds: string[], ctx: Record<string, unknown>): unknown[] {
  const values: unknown[] = [];
  for (const id of upstreamIds) {
    const v = ctx[id];
    if (v !== undefined) values.push(v);
  }
  return values;
}

/** 构建子流程输入：本地 ctx 变量路径 → 子流程端口名 */
export function buildSubflowInputs(
  node: WorkflowNodeModel,
  ctx: Record<string, unknown>,
): Record<string, unknown> {
  const inputMap = node.data.inputMap ?? {};
  const inputs: Record<string, unknown> = {};
  for (const [local, port] of Object.entries(inputMap)) {
    inputs[port] = lookupInCtx(ctx, local);
  }
  return inputs;
}

/* ================= 主执行循环 ================= */

export interface RunConfigInput {
  maxSteps?: number;
  timeoutMs?: number;
  failStrategy?: 'stop' | 'continue';
}

export interface SubflowExecutor {
  (
    node: WorkflowNodeModel,
    inputValues: Record<string, unknown>,
  ): Promise<{
    ok: boolean;
    outputs: Record<string, unknown>;
    error?: string;
    suggestion?: string;
  }>;
}

export interface RunRequest {
  snapshot: RunSnapshot;
  mode: RunMode;
  /** 单节点 / 从节点继续的目标节点 id */
  targetId?: string;
  params: RunParams;
  control: RunControl;
  hooks?: RunnerHooks;
  /** 运行配置：最大步数 / 超时 / 失败策略 */
  runConfig?: RunConfigInput;
  /** 输入定义（预检必填输入与标准化用） */
  inputDefs?: WorkflowInputDef[];
  /** 输出定义（预检输出引用用） */
  outputDefs?: WorkflowOutputDef[];
  /** 子流程执行器（由调用方注入，实现递归执行） */
  subflowExecutor?: SubflowExecutor;
}

export interface PreflightResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 运行前统一预检：必填输入、输出引用、节点变量可达性。
 * 纯函数，不执行任何节点。
 */
export function preflightRun(req: {
  snapshot: RunSnapshot;
  params: RunParams;
  inputDefs?: WorkflowInputDef[];
  outputDefs?: WorkflowOutputDef[];
}): PreflightResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const vars = { ...(req.params.variables ?? {}), ...(req.params.context ?? {}) };
  if (req.params.initialText !== undefined) vars.input = req.params.initialText;

  // 必填输入（含默认值合并与字段级校验）
  const built = buildRunInput(req.inputDefs ?? [], vars);
  for (const [name, msg] of Object.entries(built.errors)) {
    errors.push(`输入「${name}」：${msg}`);
  }

  // 输出引用
  const nodeIds = new Set(req.snapshot.nodes.map((n) => n.id));
  for (const def of req.outputDefs ?? []) {
    const head = def.source.split('.')[0] ?? '';
    if (!nodeIds.has(head)) {
      errors.push(`输出「${def.name}」引用的节点「${head}」不存在`);
    }
  }

  // 节点变量静态可达性（仅提示）
  const allTexts = req.snapshot.nodes
    .map((n) => {
      const d = n.data;
      return [d.prompt, d.template, d.message, d.expr, d.transformTemplate]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');
  const used = extractVars(allTexts);
  const ctxKeys = new Set([...Object.keys(built.variables), ...nodeIds, 'previous']);
  for (const v of used) {
    const head = v.split('.')[0] ?? '';
    if (!ctxKeys.has(head) && head !== 'input') {
      warnings.push(`变量「${v}」可能缺失（运行参数或上游节点未提供）`);
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * 执行工作流。
 * - full：按拓扑顺序执行全部
 * - single：仅执行 targetId
 * - from：执行 targetId 及其后继（按拓扑顺序）
 * - 预检：必填输入 / 输出引用 / 节点变量可达性
 * - 运行配置：最大步数（超限失败）、超时（超时失败）、失败策略（stop/continue）
 * - 子流程：通过 subflowExecutor 递归执行（禁止真实网络与后端）
 */
export async function runWorkflow(req: RunRequest): Promise<RunResult> {
  const { snapshot, mode, targetId, params, control, hooks } = req;
  const sleep = hooks?.sleep ?? defaultSleep;
  const onLog = hooks?.onLog ?? (() => {});
  const onProgress = hooks?.onProgress ?? (() => {});
  const onEdgeActive = hooks?.onEdgeActive ?? (() => {});
  const onBreakpoint = hooks?.onBreakpoint ?? (() => {});
  const onPause = hooks?.onPause ?? (() => {});
  const onApprovalWait = hooks?.onApprovalWait ?? (() => {});

  const started = Date.now();
  const logs: RunLogEntry[] = [];
  let logSeq = 0;
  const pushLog = (level: RunLogLevel, text: string, nodeId?: string) => {
    const entry: RunLogEntry = { id: logSeq++, level, text, nodeId, ts: Date.now() };
    logs.push(entry);
    onLog(entry);
  };

  // 运行配置
  const maxSteps = req.runConfig?.maxSteps ?? 0; // 0 = 不限制
  const timeoutMs = req.runConfig?.timeoutMs ?? 0; // 0 = 不限制
  const failStrategy = req.runConfig?.failStrategy ?? 'stop';

  // 统一预检（完整运行时）
  const preflight = preflightRun({
    snapshot,
    params,
    inputDefs: req.inputDefs,
    outputDefs: req.outputDefs,
  });
  for (const w of preflight.warnings) pushLog('warn', w);
  if (!preflight.ok) {
    for (const e of preflight.errors) pushLog('error', e);
    return {
      status: 'failed',
      ok: false,
      logs,
      outputs: {},
      error: `运行预检失败：${preflight.errors[0] ?? '未知原因'}`,
      suggestion: '检查必填输入与输出映射后重试',
      durationMs: Date.now() - started,
    };
  }

  // 结构校验（完整执行时）
  const sorted = topoSort(snapshot.nodes, snapshot.edges);

  let order: string[];
  if (mode === 'single') {
    order = targetId ? [targetId] : [];
  } else if (mode === 'from') {
    order = targetId ? fromNodeOrder(snapshot, targetId, sorted.order) : sorted.order;
  } else {
    order = sorted.order;
  }

  if (order.length === 0) {
    pushLog('error', '没有可执行的节点（请先选择节点）');
    return {
      status: 'failed',
      ok: false,
      logs,
      outputs: {},
      error: '没有可执行的节点',
      suggestion: '先选中一个节点，或添加触发器后执行完整工作流',
      durationMs: Date.now() - started,
    };
  }

  // 运行上下文（输入定义标准化 + 用户变量，无定义时保留全部用户变量）
  const built = buildRunInput(req.inputDefs ?? [], {
    ...(params.context ?? {}),
    ...(params.variables ?? {}),
  });
  const ctx: Record<string, unknown> = {
    ...(params.variables ?? {}),
    ...(params.context ?? {}),
    ...built.variables,
  };
  if (params.initialText !== undefined) {
    ctx.input = params.initialText;
  }

  const outputs: Record<string, unknown> = {};
  const failedNodes: Array<{ nodeId: string; error: string; suggestion: string }> = [];
  let steps = 0;

  // 入边索引（merge/transform 上游收集）
  const upstream = new Map<string, string[]>();
  for (const n of snapshot.nodes) upstream.set(n.id, []);
  for (const e of snapshot.edges) {
    upstream.get(e.target)?.push(e.source);
  }

  for (const nodeId of order) {
    if (control.cancelled) break;

    // 步数上限
    steps++;
    if (maxSteps > 0 && steps > maxSteps) {
      pushLog('error', `达到最大执行步数 ${maxSteps}，运行已中止`);
      pushLog('info', '修复建议：提高「最大执行步数」配置，或简化流程/断开环路');
      return {
        status: 'failed',
        ok: false,
        logs,
        outputs,
        failedNodeId: nodeId,
        error: `达到最大执行步数 ${maxSteps}`,
        suggestion: '提高「最大执行步数」配置，或简化流程/断开环路',
        durationMs: Date.now() - started,
      };
    }

    // 超时
    if (timeoutMs > 0 && Date.now() - started > timeoutMs) {
      pushLog('error', `运行超时（${timeoutMs}ms），已中止`);
      return {
        status: 'failed',
        ok: false,
        logs,
        outputs,
        failedNodeId: nodeId,
        error: `运行超时（${timeoutMs}ms）`,
        suggestion: '提高「默认超时」配置，或减少 AI/HTTP 节点的模拟耗时',
        durationMs: Date.now() - started,
      };
    }

    // 断点：执行前暂停并通知 UI（继续 / 单步可解除）
    if (control.breakpoints.has(nodeId)) {
      control.paused = true;
      const bpNode = snapshot.nodes.find((n) => n.id === nodeId);
      const label = bpNode ? nodeData(bpNode).label || nodeId : nodeId;
      pushLog('warn', `命中断点：${label}`, nodeId);
      onBreakpoint(nodeId);
    }
    await control.waitIfPaused();
    if (control.cancelled) break;

    // 单步请求：等待暂停解除后才消费，本次执行一个节点后自动暂停
    const stepOnce = control.stepOnce;
    control.stepOnce = false;

    const node = snapshot.nodes.find((n) => n.id === nodeId);
    if (!node) continue;

    const label = nodeData(node).label || getNodeDef(nodeData(node).kind).label;
    onProgress({ nodeId, status: 'running' });
    pushLog('run', `RUN ${label}`, nodeId);
    for (const e of snapshot.edges) {
      if (e.source === nodeId) onEdgeActive(nodeId, true);
    }

    const exec = executeNode(node, ctx, params, control, upstream.get(nodeId) ?? []);
    for (const l of exec.logs) pushLog(l.level, l.text, nodeId);

    // 子流程：异步递归执行
    let finalExec = exec;
    if (node.data.kind === 'subworkflow') {
      const inputValues = buildSubflowInputs(node, ctx);
      if (!req.subflowExecutor) {
        finalExec = {
          nodeId,
          output: null,
          logs: [{ level: 'error', text: `${label}：子流程执行器未配置` }],
          ok: false,
          error: '子流程执行器未配置',
          suggestion: '子流程需要由运行层注入执行器',
        };
      } else {
        try {
          const sub = await req.subflowExecutor(node, inputValues);
          if (sub.ok) {
            finalExec = {
              nodeId,
              output: sub.outputs,
              logs: [{ level: 'success', text: `${label}：子流程执行完成` }],
              ok: true,
            };
          } else {
            finalExec = {
              nodeId,
              output: null,
              logs: [{ level: 'error', text: `${label}：子流程执行失败 - ${sub.error ?? '未知'}` }],
              ok: false,
              error: sub.error ?? '子流程执行失败',
              suggestion: sub.suggestion ?? '检查被调用工作流配置',
            };
          }
        } catch (e) {
          finalExec = {
            nodeId,
            output: null,
            logs: [{ level: 'error', text: `${label}：子流程执行异常` }],
            ok: false,
            error: e instanceof Error ? e.message : '子流程执行异常',
          };
        }
      }
    }

    // 人工确认：等待通知 UI，用户确认 / 拒绝后继续
    if (node.data.kind === 'manual-approval' && finalExec.asyncNeeded) {
      onApprovalWait(nodeId);
      await control.waitIfPaused();
      if (control.cancelled) break;
      // 暂停解除后重放执行（此时 approval 已设置）
      const reExec = executeNode(node, ctx, params, control, upstream.get(nodeId) ?? []);
      finalExec = reExec;
      for (const l of finalExec.logs) pushLog(l.level, l.text, nodeId);
    }

    if (control.cancelled) {
      onProgress({ nodeId, status: 'error' });
      for (const e of snapshot.edges) {
        if (e.source === nodeId) onEdgeActive(nodeId, false);
      }
      break;
    }

    if (!finalExec.ok) {
      onProgress({ nodeId, status: 'error' });
      for (const e of snapshot.edges) {
        if (e.source === nodeId) onEdgeActive(nodeId, false);
      }
      outputs[nodeId] = null;
      failedNodes.push({
        nodeId,
        error: finalExec.error ?? '执行失败',
        suggestion: finalExec.suggestion ?? '检查节点配置与上游连线',
      });
      if (failStrategy === 'continue') {
        pushLog('warn', `${label} 执行失败，按「失败继续」策略跳过`, nodeId);
        await sleep(60);
        continue;
      }
      break;
    }

    onProgress({ nodeId, status: 'success' });
    for (const e of snapshot.edges) {
      if (e.source === nodeId) onEdgeActive(nodeId, false);
    }
    outputs[nodeId] = finalExec.output;
    ctx[nodeId] = finalExec.output;
    ctx.previous = finalExec.output;

    await sleep(60);
    if (stepOnce) {
      control.paused = true;
      onPause();
    }
  }

  if (control.cancelled) {
    pushLog('warn', '运行已被取消');
    return {
      status: 'cancelled',
      ok: false,
      logs,
      outputs,
      durationMs: Date.now() - started,
    };
  }

  if (failedNodes.length > 0) {
    const first = failedNodes[0]!;
    pushLog('error', `运行失败：${first.error}`);
    pushLog('info', `修复建议：${first.suggestion}`);
    return {
      status: 'failed',
      ok: false,
      logs,
      outputs,
      failedNodeId: first.nodeId,
      error: first.error,
      suggestion: first.suggestion,
      durationMs: Date.now() - started,
    };
  }

  pushLog('success', `运行完成，共执行 ${order.length} 个节点`);
  return { status: 'success', ok: true, logs, outputs, durationMs: Date.now() - started };
}

/** 从目标节点开始的后继集合（按拓扑顺序过滤可达节点） */
function fromNodeOrder(snapshot: RunSnapshot, targetId: string, topoOrder: string[]): string[] {
  // 从 targetId 沿出边 BFS 可达集合（含自身）
  const adj = new Map<string, string[]>();
  for (const n of snapshot.nodes) adj.set(n.id, []);
  for (const e of snapshot.edges) {
    adj.get(e.source)?.push(e.target);
  }
  const reachable = new Set<string>();
  const queue = [targetId];
  while (queue.length) {
    const id = queue.shift()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const next of adj.get(id) ?? []) queue.push(next);
  }
  return topoOrder.filter((id) => reachable.has(id));
}
