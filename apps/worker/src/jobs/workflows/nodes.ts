/**
 * 节点确定性 mock 执行器（语义对齐 web 端 runner.ts executeNode）
 *
 * - ai / code：确定性模拟输出，绝不调用真实模型 / 执行任意代码
 * - http-request：返回 mockStatus/mockBody，绝不发起真实网络
 * - schedule：仅本地预览，绝不注册真实定时任务
 * - manual-approval：本地工具无真实审批，按 approvalMode 确定性自动通过/拒绝
 * - delay：真实等待（受 MAX_DELAY_SECONDS 与运行超时约束；测试可注入 sleep）
 * - subworkflow：解析 inputMap 并标记 asyncNeeded，由主引擎递归执行
 */
import type { RunLogLevel, WorkflowNodeModel } from './types.js';
import { evalCondition, formatVarValue, lookupPath, resolveTemplate } from './expression.js';
import { RUN_LIMITS } from './limits.js';

export interface NodeExecution {
  nodeId: string;
  output: unknown;
  logs: Array<{ level: RunLogLevel; text: string }>;
  ok: boolean;
  error?: string;
  suggestion?: string;
  /** 条件 / 分支节点走的分支标识 */
  branch?: string;
  /** 需要主循环异步处理（子流程调用） */
  asyncNeeded?: boolean;
  /** subworkflow：解析后的子流程输入 */
  subflowInputs?: Record<string, unknown>;
}

export interface NodeExecuteOptions {
  /** manual-approval 的确定性 mock 行为 */
  approvalMode: 'auto-approve' | 'auto-reject';
  /** delay 真实等待（ms）；测试注入 0 或极短 */
  sleep: (ms: number) => Promise<void>;
}

function truncate(text: string, n = 120): string {
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

/** 构建子流程输入：本地 ctx 变量路径 → 子流程端口名 */
export function buildSubflowInputs(
  node: WorkflowNodeModel,
  ctx: Record<string, unknown>,
): Record<string, unknown> {
  const inputMap = node.data.inputMap ?? {};
  const inputs: Record<string, unknown> = {};
  for (const [local, port] of Object.entries(inputMap)) {
    inputs[port] = lookupPath(ctx, local);
  }
  return inputs;
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

/**
 * 模拟执行单个节点（deterministic）。
 * ctx 为运行上下文（变量 + 各节点输出 + previous）。
 */
export async function executeNode(
  node: WorkflowNodeModel,
  ctx: Record<string, unknown>,
  upstreamIds: string[],
  opts: NodeExecuteOptions,
): Promise<NodeExecution> {
  const data = node.data;
  const label = data.label || node.id;
  const logs: NodeExecution['logs'] = [];

  // 失败注入（演示 / 测试用）
  if (data.simulateError) {
    return {
      nodeId: node.id,
      output: null,
      logs: [{ level: 'error', text: `${label}：${data.simulateError}` }],
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
      const rendered = resolveTemplate(template, ctx);
      if (rendered.missing.length > 0) {
        logs.push({
          level: 'warn',
          text: `${label}：模板缺失变量 ${rendered.missing.join('、')}，已保留原样`,
        });
      }
      logs.push({ level: 'success', text: `${label}：模板渲染完成` });
      return { nodeId: node.id, output: { text: rendered.text, kind: 'prompt' }, logs, ok: true };
    }
    case 'ai': {
      const prompt = data.prompt ?? '';
      const rendered = resolveTemplate(prompt, ctx);
      if (rendered.missing.length > 0) {
        logs.push({
          level: 'warn',
          text: `${label}：提示词缺失变量 ${rendered.missing.join('、')}`,
        });
      }
      const content = rendered.text || prompt;
      logs.push({
        level: 'success',
        text: `${label}：[模拟] ${data.model ?? ''} 生成完成（${content.length} 字符）`,
      });
      return {
        nodeId: node.id,
        output: {
          text: truncate(content),
          model: data.model ?? '',
          outputFormat: data.outputFormat ?? 'text',
          kind: 'ai',
        },
        logs,
        ok: true,
      };
    }
    case 'code': {
      logs.push({ level: 'success', text: `${label}：[模拟] ${data.lang ?? 'python'} 执行成功` });
      return {
        nodeId: node.id,
        output: {
          text: `[模拟] ${data.lang ?? 'python'} 代码执行成功`,
          lang: data.lang,
          kind: 'code',
        },
        logs,
        ok: true,
      };
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
            { level: 'info', text: '修复建议：检查表达式语法；变量需来自运行参数或上游节点输出' },
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
      // 规范化秒数（兼容 delayValue/delayUnit 与旧 seconds 字段）
      let seconds = data.seconds ?? 0;
      if (data.delayValue !== undefined) {
        const unitMs = data.delayUnit === 'ms' ? 0.001 : data.delayUnit === 'min' ? 60 : 1;
        seconds = data.delayValue * unitMs;
      }
      seconds = Math.max(0, Math.min(seconds, RUN_LIMITS.MAX_DELAY_SECONDS));
      if (seconds > 0) {
        logs.push({ level: 'info', text: `${label}：等待 ${seconds}s` });
        await opts.sleep(seconds * 1000);
      } else {
        logs.push({ level: 'info', text: `${label}：无需等待` });
      }
      return { nodeId: node.id, output: { seconds }, logs, ok: true };
    }
    case 'notify': {
      const title = resolveTemplate(data.title ?? '', ctx).text;
      const message = resolveTemplate(data.message ?? '', ctx).text;
      logs.push({
        level: 'success',
        text: `${label}：[模拟] 通知 ${data.channel ?? ''}（${data.level ?? 'info'}）已发送`,
      });
      return {
        nodeId: node.id,
        output: {
          channel: data.channel ?? '',
          title,
          message,
          level: data.level ?? 'info',
          kind: 'notify',
        },
        logs,
        ok: true,
      };
    }
    case 'output': {
      const previous = ctx.previous;
      const content =
        previous !== undefined
          ? typeof previous === 'object'
            ? JSON.stringify(previous, null, 2)
            : String(previous)
          : '（无上游输出）';
      logs.push({
        level: 'success',
        text: `${label}：${data.outputName || '输出'} 汇总 ${truncate(content, 60)}`,
      });
      return {
        nodeId: node.id,
        output: {
          name: data.outputName ?? '',
          format: data.format ?? 'text',
          content,
          kind: 'output',
        },
        logs,
        ok: true,
      };
    }
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
          out = { value: lookupPath(ctx, path), path, kind: 'transform' };
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
      logs.push({ level: 'info', text: `${label}：路由到「${branchLabel}」分支` });
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
      } else if (mode === 'first') {
        out = { value: values.find((v) => v !== undefined && v !== null) ?? null, kind: 'merge' };
      } else {
        out = { value: values[values.length - 1] ?? null, kind: 'merge' };
      }
      logs.push({ level: 'success', text: `${label}：聚合 ${values.length} 个输入（${mode}）` });
      return { nodeId: node.id, output: out, logs, ok: true };
    }
    case 'manual-approval': {
      const approved = opts.approvalMode !== 'auto-reject';
      logs.push({
        level: approved ? 'success' : 'warn',
        text: `${label}：${approved ? '已确认' : '已拒绝'}（mock ${opts.approvalMode}）`,
      });
      return {
        nodeId: node.id,
        output: { approved, prompt: data.approvalPrompt ?? '' },
        logs,
        ok: true,
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
      logs.push({
        level: okStatus ? 'success' : 'warn',
        text: `${label}：[Mock] ${data.method ?? 'GET'} ${data.url ?? ''} → ${status}`,
      });
      return {
        nodeId: node.id,
        output: {
          status,
          ok: okStatus,
          data: body,
          method: data.method ?? 'GET',
          url: data.url ?? '',
          kind: 'http-request',
        },
        logs,
        ok: true,
      };
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
      const subflowInputs = buildSubflowInputs(node, ctx);
      logs.push({
        level: 'info',
        text: `${label}：准备调用子流程（${Object.keys(subflowInputs).length} 个输入）`,
      });
      return {
        nodeId: node.id,
        output: null,
        logs,
        ok: true,
        asyncNeeded: true,
        subflowInputs,
      };
    }
    case 'annotation':
      // 引擎层已排除；兜底跳过
      return { nodeId: node.id, output: null, logs: [], ok: true };
    default:
      return {
        nodeId: node.id,
        output: null,
        logs: [{ level: 'error', text: `${label}：未知节点类型 ${String(data.kind)}` }],
        ok: false,
        error: `未知节点类型 ${String(data.kind)}`,
        suggestion: '删除该节点后重新从节点库添加',
      };
  }
}
