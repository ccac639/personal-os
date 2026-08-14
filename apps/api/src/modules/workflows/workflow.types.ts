/**
 * Workflow 领域类型（与 web 端 features/workflows/types.ts 契约对齐）
 *
 * 注意：apps/api 与 apps/worker 各自维护一份（packages/** 禁止修改），
 * 字段语义以本文件与 worker/src/jobs/workflows/types.ts 保持一致。
 */

/* ---------- 节点 ---------- */

/** 工作流节点类型（annotation 为画布注释块，不参与拓扑与执行） */
export type WorkflowNodeKind =
  | 'trigger'
  | 'prompt'
  | 'ai'
  | 'code'
  | 'condition'
  | 'delay'
  | 'notify'
  | 'output'
  | 'transform'
  | 'switch'
  | 'merge'
  | 'manual-approval'
  | 'http-request'
  | 'schedule'
  | 'subworkflow'
  | 'annotation';

/** 合法节点类型集合（导入校验白名单） */
export const NODE_KINDS: ReadonlySet<string> = new Set<string>([
  'trigger',
  'prompt',
  'ai',
  'code',
  'condition',
  'delay',
  'notify',
  'output',
  'transform',
  'switch',
  'merge',
  'manual-approval',
  'http-request',
  'schedule',
  'subworkflow',
  'annotation',
]);

/** 注释块判定（拓扑 / 执行 / 校验统一跳过） */
export function isAnnotationKind(kind: WorkflowNodeKind | string | undefined): boolean {
  return kind === 'annotation';
}

/** switch 分支用例 */
export interface WorkflowSwitchCase {
  label: string;
  expr: string;
}

/** 子流程输入/输出映射：本工作流变量路径 → 子流程端口名 */
export type SubflowPortMap = Record<string, string>;

/** 节点失败策略 */
export type NodeFailStrategy = 'stop' | 'skip' | 'default' | 'retry';

/** 节点级错误处理配置 */
export interface NodeErrorPolicy {
  strategy: NodeFailStrategy;
  /** strategy=default 时的兜底输出（JSON 文本，解析失败回退为字符串） */
  defaultOutput?: string;
  /** strategy=retry 时的模拟重试次数（1-5） */
  retryCount?: number;
  /** strategy=retry 时的模拟重试间隔（ms） */
  retryDelayMs?: number;
}

/** 节点数据：kind + 通用字段 + 各类型专属配置（与 web 契约一致） */
export interface WorkflowNodeData {
  kind: WorkflowNodeKind;
  label: string;
  status?: string;
  note?: string;
  errorPolicy?: NodeErrorPolicy;
  cron?: string;
  text?: string;
  template?: string;
  model?: string;
  prompt?: string;
  temperature?: number;
  outputFormat?: string;
  maxTokens?: number;
  lang?: string;
  code?: string;
  expr?: string;
  trueLabel?: string;
  falseLabel?: string;
  seconds?: number;
  delayValue?: number;
  delayUnit?: 'ms' | 's' | 'min';
  channel?: string;
  title?: string;
  level?: 'info' | 'warn' | 'error';
  message?: string;
  format?: string;
  outputName?: string;
  transformOp?: 'template' | 'jsonpath' | 'upper' | 'lower' | 'trim' | 'concat' | 'slice';
  transformTemplate?: string;
  jsonPath?: string;
  separator?: string;
  sliceStart?: number;
  sliceEnd?: number;
  cases?: WorkflowSwitchCase[];
  defaultLabel?: string;
  mergeMode?: 'concat' | 'object' | 'first' | 'last';
  approvalPrompt?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url?: string;
  headersText?: string;
  bodyText?: string;
  mockStatus?: number;
  mockBody?: string;
  scheduleType?: 'cron' | 'interval';
  intervalValue?: number;
  intervalUnit?: 'ms' | 's' | 'min' | 'hour';
  workflowRef?: string;
  inputMap?: SubflowPortMap;
  outputMap?: SubflowPortMap;
  simulateError?: string;
  [key: string]: unknown;
}

/** 画布节点模型（与 Vue Flow 解耦，导入导出保留 position） */
export interface WorkflowNodeModel {
  id: string;
  position?: { x: number; y: number };
  data: WorkflowNodeData;
  type?: string;
  selected?: boolean;
  [key: string]: unknown;
}

export interface WorkflowEdgeModel {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
  [key: string]: unknown;
}

/* ---------- 输入输出契约与运行配置 ---------- */

export type WorkflowInputType = 'text' | 'number' | 'boolean' | 'json' | 'select';

export interface WorkflowInputDef {
  name: string;
  label: string;
  type: WorkflowInputType;
  required: boolean;
  defaultValue?: unknown;
  description?: string;
  options?: string[];
}

export interface WorkflowOutputDef {
  name: string;
  type: string;
  /** 来源：节点 id 或节点输出点路径（如 n-2 或 n-2.text） */
  source: string;
  description?: string;
}

export type FailStrategy = 'stop' | 'continue';

export interface WorkflowRunConfig {
  maxSteps: number;
  timeoutMs: number;
  failStrategy: FailStrategy;
  allowManualRun: boolean;
}

/** 默认运行配置 */
export const DEFAULT_RUN_CONFIG: WorkflowRunConfig = {
  maxSteps: 1000,
  timeoutMs: 60_000,
  failStrategy: 'stop',
  allowManualRun: true,
};

/** 运行时限制（与 worker/src/jobs/workflows/limits.ts 保持一致） */
export const RUN_LIMITS = {
  MAX_NODES: 200,
  MAX_STEPS: 10_000,
  MAX_TIMEOUT_MS: 3_600_000,
  MIN_TIMEOUT_MS: 1_000,
  MAX_SUBFLOW_DEPTH: 5,
  MAX_RUN_LOGS: 500,
  MAX_VERSIONS: 20,
  MAX_TAGS: 20,
  MAX_NAME_LENGTH: 120,
  MAX_DESCRIPTION_LENGTH: 2_000,
} as const;

/* ---------- 版本 / 诊断 ---------- */

export interface WorkflowVersionEntry {
  id: string;
  summary: string;
  createdAt: number;
  nodes: WorkflowNodeModel[];
  edges: WorkflowEdgeModel[];
  seq: number;
}

export interface WorkflowDiagnostic {
  ok: boolean;
  nodeCount: number;
  rawNodeCount: number;
  annotationCount: number;
  edgeCount: number;
  inputCount: number;
  outputCount: number;
  triggerCount: number;
  hasCycle: boolean;
  errors: string[];
  warnings: string[];
  updatedAt: number;
}

/** 工作流存储实体（Mongo 文档的领域形态） */
export interface WorkflowEntity {
  id: string;
  name: string;
  description: string;
  tags: string[];
  favorite: boolean;
  archived: boolean;
  nodes: WorkflowNodeModel[];
  edges: WorkflowEdgeModel[];
  inputs: WorkflowInputDef[];
  outputs: WorkflowOutputDef[];
  runConfig: WorkflowRunConfig;
  versions: WorkflowVersionEntry[];
  isTemplate: boolean;
  diagnostic: WorkflowDiagnostic;
  /** 当前结构版本 seq（创建/更新/恢复时递增） */
  version: number;
  createdAt: string;
  updatedAt: string;
}

/* ---------- 运行 ---------- */

export type RunStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
export type RunMode = 'full' | 'from' | 'single';
export type RunLogLevel = 'run' | 'info' | 'success' | 'warn' | 'error';
export type RunHistoryStatus = 'success' | 'failed' | 'cancelled';

export interface RunLogEntry {
  id: number;
  level: RunLogLevel;
  text: string;
  nodeId?: string;
  ts?: number;
}

export interface RunNodeResult {
  nodeId: string;
  label: string;
  kind: WorkflowNodeKind | string;
  status: 'idle' | 'running' | 'success' | 'error';
  output?: unknown;
  error?: string;
  handling?: 'skip' | 'default' | 'retry' | 'none';
}

export interface RunParams {
  initialText?: string;
  variables?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

/** 错误处理路径记录 */
export interface HandledNode {
  nodeId: string;
  handling: 'skip' | 'default' | 'retry' | 'none';
  error?: string;
}

/** 运行记录实体 */
export interface WorkflowRunEntity {
  id: string;
  workflowId: string;
  workflowName: string;
  workflowVersion: number;
  mode: RunMode;
  status: RunStatus;
  /** 触发来源：manual=手动 / api=接口 */
  trigger: 'manual' | 'api';
  inputSummary: Record<string, unknown>;
  outputSummary: Record<string, unknown>;
  nodeResults: RunNodeResult[];
  logs: RunLogEntry[];
  handledNodes: HandledNode[];
  failedNodeId?: string;
  error?: string;
  attempts: number;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  createdAt: string;
  updatedAt: string;
}

/* ---------- 导出 / 导入 ---------- */

/** 导出文件结构（导入时按此结构严格校验） */
export interface WorkflowExportPayload {
  format: 'personal-os-workflow';
  version: 1;
  name: string;
  description?: string;
  tags?: string[];
  nodes: WorkflowNodeModel[];
  edges: WorkflowEdgeModel[];
  inputs?: WorkflowInputDef[];
  outputs?: WorkflowOutputDef[];
  runConfig?: Partial<WorkflowRunConfig>;
  exportedAt?: number;
}
