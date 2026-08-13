/**
 * WorkflowExecutionAdapter 接口与本地确定性实现
 *
 * 未来真实 AI / HTTP / 定时器执行通过替换 Adapter 接入：
 * 实现 WorkflowExecutionAdapter 并注入 processor 即可，执行契约不变。
 */
import type {
  HandledNode,
  RunLogEntry,
  RunNodeResult,
  RunParams,
  WorkflowSnapshot,
} from './types.js';
import { executeWorkflow } from './engine.js';

export interface AdapterExecuteRequest {
  runId: string;
  snapshot: WorkflowSnapshot;
  params: RunParams;
  runConfig?: Partial<{
    maxSteps: number;
    timeoutMs: number;
    failStrategy: 'stop' | 'continue';
  }>;
}

export interface AdapterExecuteResult {
  status: 'success' | 'failed' | 'cancelled';
  outputSummary: Record<string, unknown>;
  nodeResults: RunNodeResult[];
  logs: RunLogEntry[];
  handledNodes: HandledNode[];
  failedNodeId?: string;
  error?: string;
  durationMs: number;
}

/** 执行适配器契约（未来真实执行线替换点） */
export interface WorkflowExecutionAdapter {
  readonly name: string;
  execute(request: AdapterExecuteRequest): Promise<AdapterExecuteResult>;
}

/** LocalDeterministicAdapter 依赖（由运行层注入，便于测试） */
export interface LocalAdapterDeps {
  /** 加载子流程 / 被调用工作流 */
  loadWorkflow: (id: string) => Promise<WorkflowSnapshot | null>;
  /** 检查运行是否已被取消（每节点轮询） */
  isRunCancelled: (runId: string) => Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/**
 * 本地确定性执行适配器：
 * 所有节点走 mock 语义（见 nodes.ts），绝不发起真实网络 / 模型调用。
 */
export class LocalDeterministicAdapter implements WorkflowExecutionAdapter {
  readonly name = 'local-deterministic';

  constructor(private readonly deps: LocalAdapterDeps) {}

  async execute(request: AdapterExecuteRequest): Promise<AdapterExecuteResult> {
    const result = await executeWorkflow(
      request.snapshot,
      request.params,
      {
        mode: 'full',
        approvalMode: 'auto-approve',
        runConfig: request.runConfig,
      },
      {
        sleep: this.deps.sleep,
        now: this.deps.now,
        isCancelled: () => this.deps.isRunCancelled(request.runId),
        loadSubflow: this.deps.loadWorkflow,
      },
    );
    return {
      status: result.status,
      outputSummary: result.outputSummary,
      nodeResults: result.nodeResults,
      logs: result.logs,
      handledNodes: result.handledNodes,
      failedNodeId: result.failedNodeId,
      error: result.error,
      durationMs: result.durationMs,
    };
  }
}
