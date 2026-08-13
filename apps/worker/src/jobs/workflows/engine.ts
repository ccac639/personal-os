/**
 * 确定性本地执行引擎
 *
 * - Kahn 拓扑排序（annotation 节点排除）
 * - 限制：最大步数 / 超时 / 最大嵌套子流程深度 / 子流程循环链 / 日志上限
 * - 节点失败策略（errorPolicy）：stop / skip / default / retry
 * - 运行级失败策略：stop（中止）/ continue（跳过继续）
 * - 子流程：经 deps.loadSubflow 递归执行（深度受限、链上防循环）
 * - 取消：每节点前经 deps.isCancelled 检查
 * - 输出：节点结果（脱敏）与按 outputs 定义汇总的输出摘要
 */
import type {
  HandledNode,
  RunLogEntry,
  RunLogLevel,
  RunMode,
  RunNodeResult,
  RunParams,
  WorkflowEdgeModel,
  WorkflowInputDef,
  WorkflowNodeModel,
  WorkflowOutputDef,
  WorkflowSnapshot,
} from './types.js';
import { executeNode, type NodeExecution } from './nodes.js';
import { extractVars } from './expression.js';
import { normalizeRunConfig, RUN_LIMITS } from './limits.js';
import { redactNodeOutput } from './redact.js';

export interface EngineDeps {
  sleep?: (ms: number) => Promise<void>;
  /** 每节点执行前检查取消（默认不取消） */
  isCancelled?: () => Promise<boolean>;
  /** 子流程加载（默认不支持子流程） */
  loadSubflow?: (workflowId: string) => Promise<WorkflowSnapshot | null>;
  now?: () => number;
}

export interface ExecuteWorkflowOptions {
  mode?: RunMode;
  targetId?: string;
  approvalMode?: 'auto-approve' | 'auto-reject';
  /** 覆盖快照运行配置（processor 可从运行记录带出） */
  runConfig?: Partial<{ maxSteps: number; timeoutMs: number; failStrategy: 'stop' | 'continue' }>;
}

export interface EngineResult {
  status: 'success' | 'failed' | 'cancelled';
  /** 节点 id → 输出 */
  outputs: Record<string, unknown>;
  /** 按 outputs 定义汇总（脱敏） */
  outputSummary: Record<string, unknown>;
  nodeResults: RunNodeResult[];
  logs: RunLogEntry[];
  handledNodes: HandledNode[];
  failedNodeId?: string;
  error?: string;
  durationMs: number;
}

interface RunContext {
  logs: RunLogEntry[];
  nodeResults: RunNodeResult[];
  handledNodes: HandledNode[];
  logSeq: number;
  startedAt: number;
  steps: number;
}

const defaultNow = () => Date.now();
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createRunContext(now = defaultNow): RunContext {
  return {
    logs: [],
    nodeResults: [],
    handledNodes: [],
    logSeq: 0,
    startedAt: now(),
    steps: 0,
  };
}

/** 拓扑排序（Kahn，annotation 排除） */
export function topoSort(
  nodes: WorkflowNodeModel[],
  edges: WorkflowEdgeModel[],
): { order: string[]; cycleIds: string[] } {
  const incoming = new Map<string, number>();
  const out = new Map<string, string[]>();
  const execNodes = nodes.filter((n) => n.data?.kind !== 'annotation');
  for (const n of execNodes) {
    incoming.set(n.id, 0);
    out.set(n.id, []);
  }
  for (const e of edges) {
    if (!incoming.has(e.source) || !incoming.has(e.target)) continue;
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
    out.get(e.source)?.push(e.target);
  }
  const queue = execNodes.filter((n) => (incoming.get(n.id) ?? 0) === 0).map((n) => n.id);
  const order: string[] = [];
  const visited = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    order.push(id);
    for (const next of out.get(id) ?? []) {
      const v = (incoming.get(next) ?? 0) - 1;
      incoming.set(next, v);
      if (v <= 0 && !visited.has(next)) queue.push(next);
    }
  }
  const cycleIds = execNodes.filter((n) => !visited.has(n.id)).map((n) => n.id);
  return { order, cycleIds };
}

/** 解析「使用默认值」策略的兜底输出 */
export function parseDefaultOutput(raw: string | undefined): unknown {
  if (raw === undefined || raw === null || raw.trim() === '') return '';
  const text = raw.trim();
  try {
    return JSON.parse(text);
  } catch {
    return raw;
  }
}

function pushLog(
  ctx: RunContext,
  level: RunLogLevel,
  text: string,
  nodeId?: string,
): void {
  if (ctx.logs.length >= RUN_LIMITS.MAX_RUN_LOGS) ctx.logs.shift();
  ctx.logs.push({ id: ctx.logSeq++, level, text, nodeId, ts: defaultNow() });
}

/** 按点路径从节点输出提取 */
function extractPath(obj: unknown, path: string | undefined): unknown {
  if (!path) return obj;
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (!part) continue;
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** 按输出定义汇总（缺失来源置 null） */
function summarizeOutputs(
  defs: WorkflowOutputDef[],
  nodeOutputs: Record<string, unknown>,
): Record<string, unknown> {
  const outputs: Record<string, unknown> = {};
  for (const def of defs) {
    const parts = def.source.split('.');
    const nodeId = parts[0] ?? '';
    const nodeOut = nodeOutputs[nodeId];
    if (nodeOut === undefined) {
      outputs[def.name] = null;
      continue;
    }
    const value = parts.length > 1 ? extractPath(nodeOut, parts.slice(1).join('.')) : nodeOut;
    outputs[def.name] = value === undefined ? null : value;
  }
  return outputs;
}

/** 构建运行输入（必填校验 + 默认值合并） */
function buildRunInput(
  defs: WorkflowInputDef[],
  userInput: Record<string, unknown>,
): { variables: Record<string, unknown>; errors: Record<string, string> } {
  const variables: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const def of defs) {
    const hasUser = Object.prototype.hasOwnProperty.call(userInput, def.name);
    const raw = hasUser ? userInput[def.name] : def.defaultValue;
    if (raw === undefined || raw === null || raw === '') {
      if (def.required) errors[def.name] = '该输入为必填项';
      continue;
    }
    variables[def.name] = raw;
  }
  return { variables, errors };
}

interface RunGraphOptions {
  snapshot: WorkflowSnapshot;
  params: RunParams;
  mode: RunMode;
  targetId?: string;
  approvalMode: 'auto-approve' | 'auto-reject';
  overrideConfig?: ExecuteWorkflowOptions['runConfig'];
  deps: EngineDeps;
  ctx: RunContext;
  depth: number;
  /** 从根到当前链上的 workflow id（子流程循环检测） */
  chain: Set<string>;
}

/**
 * 执行工作流图（可递归：subworkflow 节点再次进入本函数）。
 * 返回本层的执行结果（与父层共享 ctx）。
 */
async function runGraph(opts: RunGraphOptions): Promise<{
  status: 'success' | 'failed' | 'cancelled';
  outputs: Record<string, unknown>;
  failedNodeId?: string;
  error?: string;
}> {
  const { snapshot, params, mode, targetId, approvalMode, overrideConfig, deps, ctx, depth, chain } = opts;
  const now = deps.now ?? defaultNow;
  const sleep = deps.sleep ?? defaultSleep;
  const isCancelled = deps.isCancelled ?? (async () => false);

  const config = normalizeRunConfig(overrideConfig ?? snapshot.runConfig);
  const started = ctx.startedAt;

  // 结构防御：节点数 / 环
  if (snapshot.nodes.length > RUN_LIMITS.MAX_NODES) {
    pushLog(ctx, 'error', `节点数超过上限 ${RUN_LIMITS.MAX_NODES}，运行已中止`);
    return { status: 'failed', outputs: {}, error: `节点数超过上限 ${RUN_LIMITS.MAX_NODES}` };
  }
  const { order, cycleIds } = topoSort(snapshot.nodes, snapshot.edges);
  if (cycleIds.length > 0) {
    pushLog(ctx, 'error', `检测到循环依赖：${cycleIds.join(' → ')}`);
    return {
      status: 'failed',
      outputs: {},
      error: `检测到循环依赖：${cycleIds.join(' → ')}`,
      failedNodeId: cycleIds[0],
    };
  }

  let execOrder: string[];
  if (mode === 'single') {
    execOrder = targetId ? [targetId] : [];
  } else if (mode === 'from') {
    execOrder = targetId ? fromNodeOrder(snapshot, targetId, order) : order;
  } else {
    execOrder = order;
  }
  if (execOrder.length === 0) {
    pushLog(ctx, 'error', '没有可执行的节点（请先添加触发器）');
    return { status: 'failed', outputs: {}, error: '没有可执行的节点' };
  }

  // 输入标准化（api 端已预检；此处防御）
  const built = buildRunInput(snapshot.inputs, {
    ...(params.context ?? {}),
    ...(params.variables ?? {}),
  });
  const inputErrors = Object.entries(built.errors);
  if (inputErrors.length > 0) {
    const msg = inputErrors.map(([k, v]) => `输入「${k}」：${v}`).join('；');
    pushLog(ctx, 'error', `运行预检失败：${msg}`);
    return { status: 'failed', outputs: {}, error: `运行预检失败：${msg}` };
  }

  // 变量上下文
  const scope: Record<string, unknown> = {
    ...(params.variables ?? {}),
    ...(params.context ?? {}),
    ...built.variables,
  };
  if (params.initialText !== undefined) scope.input = params.initialText;

  // 变量可达性警告
  const warnings = collectVariableWarnings(snapshot.nodes, scope, new Set(snapshot.nodes.map((n) => n.id)));
  for (const w of warnings) pushLog(ctx, 'warn', w);

  const outputs: Record<string, unknown> = {};
  const nodeById = new Map(snapshot.nodes.map((n) => [n.id, n]));

  // 入边索引（merge / transform concat 上游收集）
  const upstream = new Map<string, string[]>();
  for (const n of snapshot.nodes) upstream.set(n.id, []);
  for (const e of snapshot.edges) {
    upstream.get(e.target)?.push(e.source);
  }

  const failFast = config.failStrategy === 'stop';
  let failedNodeId: string | undefined;
  let firstError: string | undefined;

  for (const nodeId of execOrder) {
    // 取消检查
    if (await isCancelled()) {
      pushLog(ctx, 'warn', '运行已被取消');
      return { status: 'cancelled', outputs };
    }
    // 步数上限（全局共享）
    ctx.steps++;
    if (ctx.steps > config.maxSteps) {
      pushLog(ctx, 'error', `达到最大执行步数 ${config.maxSteps}，运行已中止`);
      return {
        status: 'failed',
        outputs,
        failedNodeId: nodeId,
        error: `达到最大执行步数 ${config.maxSteps}`,
      };
    }
    // 超时（全局共享）
    if (now() - started > config.timeoutMs) {
      pushLog(ctx, 'error', `运行超时（${config.timeoutMs}ms），已中止`);
      return {
        status: 'failed',
        outputs,
        failedNodeId: nodeId,
        error: `运行超时（${config.timeoutMs}ms）`,
      };
    }

    const node = nodeById.get(nodeId);
    if (!node) continue;
    const label = node.data.label || nodeId;

    pushLog(ctx, 'run', `RUN ${label}`, nodeId);

    let exec: NodeExecution = await executeNode(node, scope, upstream.get(nodeId) ?? [], {
      approvalMode,
      sleep,
    });
    for (const l of exec.logs) pushLog(ctx, l.level, l.text, nodeId);

    // 子流程：递归执行
    if (node.data.kind === 'subworkflow' && exec.asyncNeeded) {
      const ref = node.data.workflowRef;
      if (!ref) {
        exec = {
          nodeId,
          output: null,
          logs: [],
          ok: false,
          error: '子流程未配置 workflowRef',
          suggestion: '选择被调用的工作流',
        };
      } else if (!deps.loadSubflow) {
        exec = {
          nodeId,
          output: null,
          logs: [],
          ok: false,
          error: '子流程执行器未配置',
          suggestion: '运行层需注入子流程加载器',
        };
      } else if (chain.has(ref)) {
        exec = {
          nodeId,
          output: null,
          logs: [],
          ok: false,
          error: `检测到循环子流程引用：${[...chain, ref].join(' → ')}`,
        };
      } else if (depth + 1 > RUN_LIMITS.MAX_SUBFLOW_DEPTH) {
        exec = {
          nodeId,
          output: null,
          logs: [],
          ok: false,
          error: `子流程嵌套深度超过上限 ${RUN_LIMITS.MAX_SUBFLOW_DEPTH}`,
        };
      } else {
        const sub = await deps.loadSubflow(ref);
        if (!sub) {
          exec = {
            nodeId,
            output: null,
            logs: [],
            ok: false,
            error: `子流程「${ref}」不存在或已删除`,
          };
        } else {
          const nextChain = new Set(chain);
          nextChain.add(ref);
          const subResult = await runGraph({
            snapshot: sub,
            params: { variables: exec.subflowInputs ?? {} },
            mode: 'full',
            approvalMode,
            overrideConfig: undefined,
            deps,
            ctx,
            depth: depth + 1,
            chain: nextChain,
          });
          if (subResult.status === 'success') {
            exec = {
              nodeId,
              output: subResult.outputs,
              logs: [{ level: 'success', text: `${label}：子流程执行完成` }],
              ok: true,
            };
          } else if (subResult.status === 'cancelled') {
            pushLog(ctx, 'warn', '子流程执行被取消，运行中止');
            return { status: 'cancelled', outputs };
          } else {
            exec = {
              nodeId,
              output: null,
              logs: [],
              ok: false,
              error: subResult.error ?? '子流程执行失败',
            };
          }
        }
      }
      for (const l of exec.logs) pushLog(ctx, l.level, l.text, nodeId);
    }

    // 取消（子流程 / 慢节点之后复查）
    if (await isCancelled()) {
      pushLog(ctx, 'warn', '运行已被取消');
      return { status: 'cancelled', outputs };
    }

    // 失败处理：节点级 errorPolicy → 运行级 failStrategy
    if (!exec.ok) {
      const policy = node.data.errorPolicy;
      let finalExec = exec;
      if (policy && policy.strategy !== 'stop') {
        if (policy.strategy === 'skip') {
          ctx.handledNodes.push({ nodeId, handling: 'skip', error: exec.error });
          pushLog(ctx, 'warn', `${label} 执行失败，按节点策略「跳过」，继续后续节点`, nodeId);
          recordNodeResult(ctx, node, 'success', undefined, exec.error, 'skip');
          continue;
        }
        if (policy.strategy === 'default') {
          const fallback = parseDefaultOutput(policy.defaultOutput);
          outputs[nodeId] = fallback;
          scope[nodeId] = fallback;
          scope.previous = fallback;
          ctx.handledNodes.push({ nodeId, handling: 'default', error: exec.error });
          pushLog(ctx, 'warn', `${label} 执行失败，按节点策略「使用默认值」`, nodeId);
          recordNodeResult(ctx, node, 'success', fallback, exec.error, 'default');
          continue;
        }
        if (policy.strategy === 'retry') {
          const retries = Math.min(Math.max(policy.retryCount ?? 1, 1), 5);
          const delayMs = Math.min(Math.max(policy.retryDelayMs ?? 200, 0), 5000);
          let retried: NodeExecution | null = null;
          for (let attempt = 1; attempt <= retries; attempt++) {
            await sleep(delayMs);
            if (await isCancelled()) {
              pushLog(ctx, 'warn', '运行已被取消');
              return { status: 'cancelled', outputs };
            }
            pushLog(ctx, 'run', `${label} 第 ${attempt}/${retries} 次重试…`, nodeId);
            // 重试时清除 simulateError（视为瞬时故障）
            const retryNode: WorkflowNodeModel = {
              ...node,
              data: { ...node.data, simulateError: undefined },
            };
            retried = await executeNode(retryNode, scope, upstream.get(nodeId) ?? [], {
              approvalMode,
              sleep,
            });
            for (const l of retried.logs) pushLog(ctx, l.level, l.text, nodeId);
            if (retried.ok) break;
          }
          if (retried?.ok) {
            outputs[nodeId] = retried.output;
            scope[nodeId] = retried.output;
            scope.previous = retried.output;
            ctx.handledNodes.push({ nodeId, handling: 'retry' });
            pushLog(ctx, 'success', `${label} 失败后重试成功（策略：重试模拟）`, nodeId);
            recordNodeResult(ctx, node, 'success', retried.output, undefined, 'retry');
            continue;
          }
          ctx.handledNodes.push({
            nodeId,
            handling: 'retry',
            error: retried?.error ?? exec.error,
          });
          finalExec = retried ?? exec;
        }
      }

      // 运行级失败策略
      recordNodeResult(ctx, node, 'error', null, finalExec.error);
      outputs[nodeId] = null;
      if (failedNodeId === undefined) {
        failedNodeId = nodeId;
        firstError = finalExec.error ?? '执行失败';
      }
      pushLog(ctx, 'error', `${label} 执行失败：${finalExec.error ?? '未知原因'}`, nodeId);
      if (failFast) break;
      pushLog(ctx, 'warn', `${label} 执行失败，按「失败继续」策略跳过`, nodeId);
      continue;
    }

    // 成功
    outputs[nodeId] = exec.output;
    scope[nodeId] = exec.output;
    scope.previous = exec.output;
    recordNodeResult(ctx, node, 'success', exec.output);
  }

  if (await isCancelled()) {
    pushLog(ctx, 'warn', '运行已被取消');
    return { status: 'cancelled', outputs };
  }
  if (failedNodeId !== undefined) {
    return { status: 'failed', outputs, failedNodeId, error: firstError };
  }
  return { status: 'success', outputs };
}

function recordNodeResult(
  ctx: RunContext,
  node: WorkflowNodeModel,
  status: 'success' | 'error',
  output: unknown,
  error?: string,
  handling?: 'skip' | 'default' | 'retry',
): void {
  ctx.nodeResults.push({
    nodeId: node.id,
    label: node.data.label || node.id,
    kind: node.data.kind,
    status,
    output: status === 'success' ? redactNodeOutput(output) : undefined,
    error: status === 'error' ? error : undefined,
    handling,
  });
}

/** 从目标节点开始的后继集合（from 模式） */
function fromNodeOrder(
  snapshot: WorkflowSnapshot,
  targetId: string,
  topoOrder: string[],
): string[] {
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

/** 节点模板 / 表达式中的变量静态可达性检查（仅警告） */
function collectVariableWarnings(
  nodes: WorkflowNodeModel[],
  variables: Record<string, unknown>,
  nodeIds: Set<string>,
): string[] {
  const allTexts = nodes
    .map((n) => {
      const d = n.data;
      return [d.prompt, d.template, d.message, d.expr, d.transformTemplate]
        .filter((x): x is string => Boolean(x))
        .join('\n');
    })
    .join('\n');
  const used = extractVars(allTexts);
  const ctxKeys = new Set<string>([...Object.keys(variables), ...nodeIds, 'previous']);
  const warnings: string[] = [];
  for (const v of used) {
    const head = v.split('.')[0] ?? '';
    if (!ctxKeys.has(head) && head !== 'input') {
      warnings.push(`变量「${v}」可能缺失（运行参数或上游节点未提供）`);
    }
  }
  return warnings;
}

/** 执行工作流（顶层入口） */
export async function executeWorkflow(
  snapshot: WorkflowSnapshot,
  params: RunParams,
  options: ExecuteWorkflowOptions = {},
  deps: EngineDeps = {},
): Promise<EngineResult> {
  const now = deps.now ?? defaultNow;
  const ctx = createRunContext(now);
  const started = ctx.startedAt;

  const result = await runGraph({
    snapshot,
    params,
    mode: options.mode ?? 'full',
    targetId: options.targetId,
    approvalMode: options.approvalMode ?? 'auto-approve',
    overrideConfig: options.runConfig,
    deps,
    ctx,
    depth: 0,
    chain: new Set([snapshot.id]),
  });

  const durationMs = now() - started;
  const outputSummary = redactNodeOutput(
    summarizeOutputs(snapshot.outputs, result.outputs),
  ) as Record<string, unknown>;

  if (result.status === 'success') {
    pushLog(ctx, 'success', `运行完成，共执行 ${snapshot.nodes.filter((n) => n.data?.kind !== 'annotation').length} 个节点`);
  } else if (result.status === 'failed' && result.error) {
    pushLog(ctx, 'error', `运行失败：${result.error}`);
  }

  return {
    status: result.status,
    outputs: result.outputs,
    outputSummary,
    nodeResults: ctx.nodeResults,
    logs: ctx.logs,
    handledNodes: ctx.handledNodes,
    failedNodeId: result.failedNodeId,
    error: result.error,
    durationMs,
  };
}
