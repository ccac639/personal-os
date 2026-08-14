/**
 * Worker 侧运行 / 工作流读写（Mongo 实现 + 接口）
 *
 * processor 依赖接口而非 Model，测试可注入内存实现。
 * 读取运行记录时仅取执行所需字段（脱敏后的 inputSummary 即执行输入）。
 */
import type { RunStatus, WorkflowSnapshot } from './types.js';
import { getWorkflowModel, getWorkflowRunModel } from './schema.js';
import type { HandledNode, RunLogEntry, RunNodeResult } from './types.js';

export interface RunRecord {
  id: string;
  workflowId: string;
  workflowName: string;
  workflowVersion: number;
  status: RunStatus;
  inputSummary: Record<string, unknown>;
  attempts: number;
  logs?: RunLogEntry[];
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  error?: string;
}

export interface CompleteRunPatch {
  status: 'success' | 'failed' | 'cancelled';
  outputSummary: Record<string, unknown>;
  nodeResults: RunNodeResult[];
  logs: RunLogEntry[];
  handledNodes: HandledNode[];
  failedNodeId?: string;
  error?: string;
  durationMs: number;
  finishedAt: string;
}

export interface WorkerRunStore {
  getRunById(id: string): Promise<RunRecord | null>;
  getWorkflowById(id: string): Promise<WorkflowSnapshot | null>;
  markRunning(id: string, startedAt: string): Promise<void>;
  markAttempts(id: string, attempts: number): Promise<void>;
  completeRun(id: string, patch: CompleteRunPatch): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
}

type RawObjectId = { toHexString(): string };

export class MongoWorkerRunStore implements WorkerRunStore {
  async getRunById(id: string): Promise<RunRecord | null> {
    const doc = await getWorkflowRunModel().findById(id).lean().exec();
    if (!doc) return null;
    const raw = doc as unknown as {
      _id: RawObjectId;
      workflowId: RawObjectId | string;
      workflowName: string;
      workflowVersion: number;
      status: string;
      inputSummary: unknown;
      attempts: number;
      startedAt?: Date;
      finishedAt?: Date;
      error?: string;
    };
    return {
      id: raw._id.toHexString(),
      workflowId:
        typeof raw.workflowId === 'string' ? raw.workflowId : raw.workflowId.toHexString(),
      workflowName: raw.workflowName ?? '',
      workflowVersion: raw.workflowVersion ?? 1,
      status: (raw.status ?? 'queued') as RunStatus,
      inputSummary: (raw.inputSummary ?? {}) as Record<string, unknown>,
      attempts: raw.attempts ?? 0,
      startedAt: raw.startedAt?.toISOString(),
      finishedAt: raw.finishedAt?.toISOString(),
      error: raw.error,
    };
  }

  async getWorkflowById(id: string): Promise<WorkflowSnapshot | null> {
    const doc = await getWorkflowModel().findById(id).lean().exec();
    if (!doc) return null;
    const raw = doc as unknown as {
      _id: RawObjectId;
      name: string;
      version: number;
      nodes: unknown[];
      edges: unknown[];
      inputs: unknown[];
      outputs: unknown[];
      runConfig: unknown;
    };
    return {
      id: raw._id.toHexString(),
      name: raw.name ?? '',
      version: raw.version ?? 1,
      nodes: (raw.nodes ?? []) as WorkflowSnapshot['nodes'],
      edges: (raw.edges ?? []) as WorkflowSnapshot['edges'],
      inputs: (raw.inputs ?? []) as WorkflowSnapshot['inputs'],
      outputs: (raw.outputs ?? []) as WorkflowSnapshot['outputs'],
      runConfig: raw.runConfig as WorkflowSnapshot['runConfig'],
    };
  }

  async markRunning(id: string, startedAt: string): Promise<void> {
    await getWorkflowRunModel()
      .updateOne({ _id: id }, { $set: { status: 'running', startedAt: new Date(startedAt) } })
      .exec();
  }

  async markAttempts(id: string, attempts: number): Promise<void> {
    await getWorkflowRunModel().updateOne({ _id: id }, { $set: { attempts } }).exec();
  }

  async completeRun(id: string, patch: CompleteRunPatch): Promise<void> {
    await getWorkflowRunModel()
      .updateOne(
        { _id: id },
        {
          $set: {
            status: patch.status,
            outputSummary: patch.outputSummary,
            nodeResults: patch.nodeResults,
            logs: patch.logs,
            handledNodes: patch.handledNodes,
            failedNodeId: patch.failedNodeId ?? null,
            error: patch.error ?? null,
            durationMs: patch.durationMs,
            finishedAt: new Date(patch.finishedAt),
          },
        },
      )
      .exec();
  }

  async markFailed(id: string, error: string): Promise<void> {
    await getWorkflowRunModel()
      .updateOne({ _id: id }, { $set: { status: 'failed', error, finishedAt: new Date() } })
      .exec();
  }
}
