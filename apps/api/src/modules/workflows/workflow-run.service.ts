/**
 * 运行服务：创建运行 / 详情 / 取消 / 日志 / 历史
 *
 * - 创建运行：预检（必填输入 / 输出引用 / 变量可达性）→ 脱敏输入摘要 →
 *   落库（queued）→ 入队 workflow-runs
 * - 运行记录不存 API Key / Token / 二进制 / 完整附件（redact 层保证）
 * - 取消：更新状态 + 尝试从队列移除（running 中的 job 由 worker 每步检查 DB 中止）
 */
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import type {
  RunLogEntry,
  RunMode,
  RunParams,
  WorkflowRunEntity,
} from './workflow.types.js';
import { RUN_LIMITS } from './workflow.types.js';
import { buildInputSummary } from './workflow.redact.js';
import { buildRunInput } from './workflow.io.js';
import { extractVars } from './workflow.expression.js';
import { RUN_QUEUE_PORT, type RunQueuePort } from './workflow.queue.js';
import { RUN_STORE, WORKFLOW_STORE, type RunStore, type WorkflowStore } from './workflow.store.js';

export interface CreateRunInput {
  mode?: RunMode;
  params?: RunParams;
}

@Injectable()
export class WorkflowRunService {
  constructor(
    @Inject(WORKFLOW_STORE) private readonly workflowStore: WorkflowStore,
    @Inject(RUN_STORE) private readonly runStore: RunStore,
    @Inject(RUN_QUEUE_PORT) private readonly queue: RunQueuePort,
  ) {}

  /** 创建运行：预检 → 落库 → 入队 */
  async createRun(workflowId: string, input: CreateRunInput): Promise<WorkflowRunEntity> {
    const workflow = await this.workflowStore.findById(workflowId);
    if (!workflow) throw new NotFoundException(`工作流不存在：${workflowId}`);
    if (workflow.archived) {
      throw new BadRequestException('归档的工作流不能创建运行，请先取消归档');
    }
    const mode: RunMode = input.mode === 'from' || input.mode === 'single' ? input.mode : 'full';
    const params: RunParams = input.params ?? {};

    // 预检 1：必填输入与字段级校验
    const built = buildRunInput(workflow.inputs, {
      ...(params.context ?? {}),
      ...(params.variables ?? {}),
    });
    const preflightErrors: string[] = [];
    for (const [name, msg] of Object.entries(built.errors)) {
      preflightErrors.push(`输入「${name}」：${msg}`);
    }

    // 预检 2：输出引用（source 指向存在的节点）
    const nodeIds = new Set(workflow.nodes.map((n) => n.id));
    for (const def of workflow.outputs) {
      const head = def.source.split('.')[0] ?? '';
      if (!nodeIds.has(head)) {
        preflightErrors.push(`输出「${def.name}」引用的节点「${head}」不存在`);
      }
    }
    if (preflightErrors.length > 0) {
      throw new BadRequestException(`运行预检失败：${preflightErrors.join('；')}`);
    }

    // 预检 3：变量静态可达性（仅警告，写入运行日志）
    const warnings = this.collectVariableWarnings(workflow, built.variables, nodeIds);

    const logs: RunLogEntry[] = warnings.map((w, i) => ({
      id: i,
      level: 'warn',
      text: w,
      ts: Date.now(),
    }));

    const inputSummary = buildInputSummary(params, built.variables);

    const run = await this.runStore.createRun({
      workflowId,
      workflowName: workflow.name,
      workflowVersion: workflow.version,
      mode,
      status: 'queued',
      trigger: 'api',
      inputSummary,
      outputSummary: {},
      nodeResults: [],
      logs,
      handledNodes: [],
      attempts: 0,
      startedAt: new Date().toISOString(),
    });

    // 入队；失败时标记运行失败（本地工具：不阻塞调用方太久）
    try {
      await this.queue.enqueue(run.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : '队列不可用';
      await this.runStore.updateRun(run.id, {
        status: 'failed',
        error: `入队失败：${message}`,
        finishedAt: new Date().toISOString(),
      });
      throw new ServiceUnavailableException(`运行队列不可用：${message}`);
    }
    return run;
  }

  async getRun(runId: string): Promise<WorkflowRunEntity> {
    const run = await this.runStore.findRunById(runId);
    if (!run) throw new NotFoundException(`运行不存在：${runId}`);
    return run;
  }

  /** 取消运行：更新状态 + 尝试移除队列任务 */
  async cancelRun(runId: string): Promise<WorkflowRunEntity> {
    const run = await this.getRun(runId);
    if (run.status === 'success' || run.status === 'failed') {
      throw new BadRequestException(`运行已结束（${run.status}），无法取消`);
    }
    const now = new Date().toISOString();
    const started = run.startedAt ? new Date(run.startedAt).getTime() : Date.now();
    const updated = await this.runStore.updateRun(runId, {
      status: 'cancelled',
      finishedAt: now,
      durationMs: Math.max(Date.now() - started, 0),
    });
    // 队列中 waiting/delayed 的任务直接移除；running 任务由 worker 检查 DB 中止
    try {
      await this.queue.remove(runId);
    } catch {
      // 队列不可用时忽略：DB 状态已标记，worker 每步检查会中止
    }
    return updated ?? run;
  }

  /** 运行历史（按工作流） */
  async listRuns(workflowId: string, opts: { limit?: number; offset?: number }) {
    await this.workflowStore.findById(workflowId); // 404 校验
    return this.runStore.listRuns(workflowId, {
      limit: Math.min(Math.max(opts.limit ?? 50, 1), 200),
      offset: Math.max(opts.offset ?? 0, 0),
    });
  }

  /** 运行日志（分页） */
  async getLogs(runId: string, opts: { limit?: number; offset?: number }) {
    const run = await this.getRun(runId);
    const limit = Math.min(Math.max(opts.limit ?? 200, 1), RUN_LIMITS.MAX_RUN_LOGS);
    const offset = Math.max(opts.offset ?? 0, 0);
    const logs = run.logs.slice(offset, offset + limit);
    return { items: logs, total: run.logs.length };
  }

  /* ---------- 内部 ---------- */

  /** 节点模板 / 表达式中的变量静态可达性检查（仅警告） */
  private collectVariableWarnings(
    workflow: { nodes: Array<{ id: string; data: { prompt?: string; template?: string; message?: string; expr?: string; transformTemplate?: string } }> },
    variables: Record<string, unknown>,
    nodeIds: Set<string>,
  ): string[] {
    const allTexts = workflow.nodes
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
}
