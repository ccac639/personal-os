/**
 * Worker 处理器测试：
 * - 成功路径：running → adapter 结果落库
 * - 业务失败（工作流不存在）：落库 failed，不抛错（不重试）
 * - 基础设施错误（adapter 抛错）：落库 failed + 抛错（BullMQ 重试）
 * - 已取消 / 已成功运行：跳过
 * - 非法 job：抛错
 * - Adapter 可替换性：自定义 Adapter 走同一契约
 */
import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';

import {
  createWorkflowRunProcessor,
  LocalDeterministicAdapter,
  type AdapterExecuteResult,
  type CompleteRunPatch,
  type RunRecord,
  type WorkflowExecutionAdapter,
  type WorkflowRunJobData,
  type WorkflowSnapshot,
  type WorkerRunStore,
} from '../src/jobs/workflows/index.js';
import { simpleChainSnapshot } from './helpers/workflow-fixtures.js';

/** 内存 WorkerRunStore（记录调用，便于断言） */
class MemoryRunStore implements WorkerRunStore {
  runs = new Map<string, RunRecord>();
  workflows = new Map<string, WorkflowSnapshot>();
  patches: Array<{ id: string; patch: CompleteRunPatch }> = [];
  failed: Array<{ id: string; error: string }> = [];
  running: string[] = [];
  runningAt = new Map<string, string>();
  attempts: Array<{ id: string; n: number }> = [];

  getRunById(id: string): Promise<RunRecord | null> {
    return Promise.resolve(this.runs.get(id) ?? null);
  }
  getWorkflowById(id: string): Promise<WorkflowSnapshot | null> {
    return Promise.resolve(this.workflows.get(id) ?? null);
  }
  markRunning(id: string, startedAt: string): Promise<void> {
    this.running.push(id);
    this.runningAt.set(id, startedAt);
    return Promise.resolve();
  }
  markAttempts(id: string, attempts: number): Promise<void> {
    this.attempts.push({ id, n: attempts });
    return Promise.resolve();
  }
  completeRun(id: string, patch: CompleteRunPatch): Promise<void> {
    this.patches.push({ id, patch });
    return Promise.resolve();
  }
  markFailed(id: string, error: string): Promise<void> {
    this.failed.push({ id, error });
    return Promise.resolve();
  }
}

function runRecord(
  id: string,
  workflowId: string,
  status: RunRecord['status'] = 'queued',
): RunRecord {
  return {
    id,
    workflowId,
    workflowName: '测试',
    workflowVersion: 1,
    status,
    inputSummary: { name: 'World' },
    attempts: 0,
  };
}

function job(
  data: WorkflowRunJobData,
  opts: { id?: string; attemptsMade?: number } = {},
): Job<WorkflowRunJobData> {
  return {
    id: opts.id ?? 'job-1',
    data,
    attemptsMade: opts.attemptsMade ?? 0,
  } as unknown as Job<WorkflowRunJobData>;
}

describe('workflow processor', () => {
  it('成功路径：running → adapter 结果完整落库', async () => {
    const store = new MemoryRunStore();
    store.runs.set('run-1', runRecord('run-1', 'wf-1'));
    store.workflows.set('wf-1', simpleChainSnapshot({ id: 'wf-1', name: '打招呼' }));

    const processor = createWorkflowRunProcessor({
      store,
      adapter: new LocalDeterministicAdapter({
        loadWorkflow: async () => null,
        isRunCancelled: async () => false,
        sleep: async () => undefined,
      }),
    });

    const result = await processor(job({ runId: 'run-1' }));

    expect(result).toEqual({ status: 'success', runId: 'run-1' });
    expect(store.running).toEqual(['run-1']);
    expect(store.attempts).toEqual([{ id: 'run-1', n: 1 }]);
    expect(store.failed).toEqual([]);

    const patch = store.patches[0]!.patch;
    expect(patch.status).toBe('success');
    expect(patch.outputSummary).toEqual({ greeting: '你好 World' });
    expect(patch.nodeResults.length).toBe(3);
    expect(patch.logs.length).toBeGreaterThan(0);
    expect(patch.durationMs).toBeGreaterThanOrEqual(0);
    expect(patch.finishedAt).toBeTruthy();
  });

  it('业务失败：工作流不存在 → 落库 failed，不抛错（不触发重试）', async () => {
    const store = new MemoryRunStore();
    store.runs.set('run-2', runRecord('run-2', 'ghost'));

    const processor = createWorkflowRunProcessor({
      store,
      adapter: new LocalDeterministicAdapter({
        loadWorkflow: async () => null,
        isRunCancelled: async () => false,
      }),
    });

    const result = await processor(job({ runId: 'run-2' }));
    expect(result.status).toBe('failed');
    expect(store.failed).toEqual([
      { id: 'run-2', error: expect.stringContaining('工作流不存在') as unknown as string },
    ]);
    expect(store.patches).toEqual([]);
  });

  it('基础设施错误：adapter 抛错 → 落库 failed + 抛错（触发 BullMQ 重试）', async () => {
    const store = new MemoryRunStore();
    store.runs.set('run-3', runRecord('run-3', 'wf-1'));
    store.workflows.set('wf-1', simpleChainSnapshot({ id: 'wf-1' }));

    const boom = new Error('redis down');
    const processor = createWorkflowRunProcessor({
      store,
      adapter: {
        name: 'broken',
        execute: async () => {
          throw boom;
        },
      },
    });

    await expect(processor(job({ runId: 'run-3' }))).rejects.toThrow('redis down');
    expect(store.failed).toEqual([
      { id: 'run-3', error: expect.stringContaining('执行异常') as unknown as string },
    ]);
  });

  it('已取消 / 已成功运行：跳过不执行', async () => {
    const store = new MemoryRunStore();
    store.runs.set('run-c', runRecord('run-c', 'wf-1', 'cancelled'));
    store.runs.set('run-s', runRecord('run-s', 'wf-1', 'success'));
    store.workflows.set('wf-1', simpleChainSnapshot({ id: 'wf-1' }));

    const processor = createWorkflowRunProcessor({
      store,
      adapter: new LocalDeterministicAdapter({
        loadWorkflow: async () => null,
        isRunCancelled: async () => false,
      }),
    });

    expect(await processor(job({ runId: 'run-c' }))).toEqual({ status: 'skipped', runId: 'run-c' });
    expect(await processor(job({ runId: 'run-s' }))).toEqual({ status: 'skipped', runId: 'run-s' });
    expect(store.running).toEqual([]);
    expect(store.patches).toEqual([]);
  });

  it('非法 job 数据：抛错', async () => {
    const store = new MemoryRunStore();
    const processor = createWorkflowRunProcessor({
      store,
      adapter: new LocalDeterministicAdapter({
        loadWorkflow: async () => null,
        isRunCancelled: async () => false,
      }),
    });
    await expect(processor(job({ runId: '' }))).rejects.toThrow('缺少 runId');
  });

  it('运行记录不存在：抛错（视为基础设施问题）', async () => {
    const store = new MemoryRunStore();
    const processor = createWorkflowRunProcessor({
      store,
      adapter: new LocalDeterministicAdapter({
        loadWorkflow: async () => null,
        isRunCancelled: async () => false,
      }),
    });
    await expect(processor(job({ runId: 'nope' }))).rejects.toThrow('运行记录不存在');
  });
});

describe('workflow adapter 可替换性', () => {
  it('自定义 Adapter 实现同一契约并可注入 processor', async () => {
    const store = new MemoryRunStore();
    store.runs.set('run-4', runRecord('run-4', 'wf-1'));
    store.workflows.set('wf-1', simpleChainSnapshot({ id: 'wf-1' }));

    const customAdapter: WorkflowExecutionAdapter = {
      name: 'custom-mock',
      execute: async (req): Promise<AdapterExecuteResult> => {
        expect(req.runId).toBe('run-4');
        expect(req.snapshot.id).toBe('wf-1');
        expect(req.params.variables).toEqual({ name: 'World' });
        return {
          status: 'failed',
          outputSummary: {},
          nodeResults: [],
          logs: [{ id: 1, level: 'error', text: '自定义失败', ts: 0 }],
          handledNodes: [],
          failedNodeId: 'x',
          error: 'custom error',
          durationMs: 1,
        };
      },
    };

    const processor = createWorkflowRunProcessor({ store, adapter: customAdapter });
    const result = await processor(job({ runId: 'run-4' }));

    expect(result.status).toBe('failed');
    expect(store.patches[0]!.patch.error).toBe('custom error');
    expect(store.patches[0]!.patch.logs[0]!.text).toBe('自定义失败');
  });

  it('LocalDeterministicAdapter 挂载取消检测（取消时返回 cancelled）', async () => {
    const store = new MemoryRunStore();
    store.runs.set('run-5', runRecord('run-5', 'wf-1'));
    store.workflows.set('wf-1', simpleChainSnapshot({ id: 'wf-1' }));

    const adapter = new LocalDeterministicAdapter({
      loadWorkflow: async () => null,
      isRunCancelled: async (runId) => runId === 'run-5',
      sleep: async () => undefined,
    });

    const processor = createWorkflowRunProcessor({ store, adapter });
    const result = await processor(job({ runId: 'run-5' }));
    expect(result.status).toBe('cancelled');
    expect(store.patches[0]!.patch.status).toBe('cancelled');
  });

  it('processor 使用结构化日志（logger 注入）', async () => {
    const store = new MemoryRunStore();
    store.runs.set('run-6', runRecord('run-6', 'wf-1'));
    store.workflows.set('wf-1', simpleChainSnapshot({ id: 'wf-1' }));

    const info = vi.fn();
    const warn = vi.fn();
    const error = vi.fn();
    const processor = createWorkflowRunProcessor({
      store,
      adapter: new LocalDeterministicAdapter({
        loadWorkflow: async () => null,
        isRunCancelled: async () => false,
        sleep: async () => undefined,
      }),
      logger: { info, warn, error },
    });

    await processor(job({ runId: 'run-6' }));
    expect(info).toHaveBeenCalled();
    // started / finished 各一次
    const started = info.mock.calls.filter((c) => String(c[1]).includes('started'));
    const finished = info.mock.calls.filter((c) => String(c[1]).includes('finished'));
    expect(started.length).toBeGreaterThanOrEqual(1);
    expect(finished.length).toBeGreaterThanOrEqual(1);
  });

  it('MongoWorkerRunStore 可实例化（schema 注册不依赖连接）', async () => {
    const { MongoWorkerRunStore, getWorkflowModel, getWorkflowRunModel } =
      await import('../src/jobs/workflows/index.js');
    expect(new MongoWorkerRunStore()).toBeInstanceOf(MongoWorkerRunStore);
    expect(getWorkflowModel().modelName).toBe('Workflow');
    expect(getWorkflowRunModel().modelName).toBe('WorkflowRun');
    // 不实际查询（无连接时会超时/报错，这里只验证类型与注册）
  });
});
