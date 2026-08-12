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
  /** 条件节点走的分支 handle */
  branch?: 'true' | 'false';
}

function truncate(text: string, n = 120): string {
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

/**
 * 模拟执行单个节点。
 * ctx 为运行上下文（变量 + 各节点输出）。
 * params / control 保留为 service 注入边界（真实执行时使用）。
 */
export function executeNode(
  node: WorkflowNodeModel,
  ctx: Record<string, unknown>,
  params: RunParams,
  control: RunControl,
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

/* ================= 主执行循环 ================= */

export interface RunRequest {
  snapshot: RunSnapshot;
  mode: RunMode;
  /** 单节点 / 从节点继续的目标节点 id */
  targetId?: string;
  params: RunParams;
  control: RunControl;
  hooks?: RunnerHooks;
}

/**
 * 执行工作流。
 * - full：按拓扑顺序执行全部
 * - single：仅执行 targetId
 * - from：执行 targetId 及其后继（按拓扑顺序）
 */
export async function runWorkflow(req: RunRequest): Promise<RunResult> {
  const { snapshot, mode, targetId, params, control, hooks } = req;
  const sleep = hooks?.sleep ?? defaultSleep;
  const onLog = hooks?.onLog ?? (() => {});
  const onProgress = hooks?.onProgress ?? (() => {});
  const onEdgeActive = hooks?.onEdgeActive ?? (() => {});
  const onBreakpoint = hooks?.onBreakpoint ?? (() => {});
  const onPause = hooks?.onPause ?? (() => {});

  const started = Date.now();
  const logs: RunLogEntry[] = [];
  let logSeq = 0;
  const pushLog = (level: RunLogLevel, text: string, nodeId?: string) => {
    const entry: RunLogEntry = { id: logSeq++, level, text, nodeId, ts: Date.now() };
    logs.push(entry);
    onLog(entry);
  };

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

  // 运行上下文
  const ctx: Record<string, unknown> = {
    ...(params.context ?? {}),
    ...(params.variables ?? {}),
  };
  if (params.initialText !== undefined) {
    ctx.input = params.initialText;
  }

  const outputs: Record<string, unknown> = {};
  let failed: { nodeId: string; error: string; suggestion: string } | null = null;

  for (const nodeId of order) {
    if (control.cancelled) break;
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

    const exec = executeNode(node, ctx, params, control);
    for (const l of exec.logs) pushLog(l.level, l.text, nodeId);

    if (control.cancelled) {
      onProgress({ nodeId, status: 'error' });
      for (const e of snapshot.edges) {
        if (e.source === nodeId) onEdgeActive(nodeId, false);
      }
      break;
    }

    if (!exec.ok) {
      onProgress({ nodeId, status: 'error' });
      for (const e of snapshot.edges) {
        if (e.source === nodeId) onEdgeActive(nodeId, false);
      }
      outputs[nodeId] = null;
      failed = {
        nodeId,
        error: exec.error ?? '执行失败',
        suggestion: exec.suggestion ?? '检查节点配置与上游连线',
      };
      break;
    }

    onProgress({ nodeId, status: 'success' });
    for (const e of snapshot.edges) {
      if (e.source === nodeId) onEdgeActive(nodeId, false);
    }
    outputs[nodeId] = exec.output;
    ctx[nodeId] = exec.output;
    ctx.previous = exec.output;

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

  if (failed) {
    pushLog('error', `运行失败：${failed.error}`);
    pushLog('info', `修复建议：${failed.suggestion}`);
    return {
      status: 'failed',
      ok: false,
      logs,
      outputs,
      failedNodeId: failed.nodeId,
      error: failed.error,
      suggestion: failed.suggestion,
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
