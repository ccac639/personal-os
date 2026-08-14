/**
 * Worker 端 Workflow 执行类型（与 apps/api/src/modules/workflows/workflow.types.ts
 * 字段语义保持一致；packages/** 禁止修改，故各自维护一份）
 */

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

export interface WorkflowSwitchCase {
  label: string;
  expr: string;
}

export type SubflowPortMap = Record<string, string>;

export type NodeFailStrategy = 'stop' | 'skip' | 'default' | 'retry';

export interface NodeErrorPolicy {
  strategy: NodeFailStrategy;
  defaultOutput?: string;
  retryCount?: number;
  retryDelayMs?: number;
}

/** 节点数据（执行所需字段；其余字段容忍保留） */
export interface WorkflowNodeData {
  kind: WorkflowNodeKind;
  label: string;
  errorPolicy?: NodeErrorPolicy;
  cron?: string;
  text?: string;
  template?: string;
  model?: string;
  prompt?: string;
  outputFormat?: string;
  lang?: string;
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
  method?: string;
  url?: string;
  mockStatus?: number;
  mockBody?: string;
  scheduleType?: 'cron' | 'interval';
  intervalValue?: number;
  intervalUnit?: string;
  workflowRef?: string;
  inputMap?: SubflowPortMap;
  outputMap?: SubflowPortMap;
  simulateError?: string;
  [key: string]: unknown;
}

export interface WorkflowNodeModel {
  id: string;
  data: WorkflowNodeData;
  [key: string]: unknown;
}

export interface WorkflowEdgeModel {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  [key: string]: unknown;
}

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

export const DEFAULT_RUN_CONFIG: WorkflowRunConfig = {
  maxSteps: 1000,
  timeoutMs: 60_000,
  failStrategy: 'stop',
  allowManualRun: true,
};

/* ---------- 运行 ---------- */

export type RunStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
export type RunMode = 'full' | 'from' | 'single';
export type RunLogLevel = 'run' | 'info' | 'success' | 'warn' | 'error';

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

export interface HandledNode {
  nodeId: string;
  handling: 'skip' | 'default' | 'retry' | 'none';
  error?: string;
}

/** 执行所需的工作流快照 */
export interface WorkflowSnapshot {
  id: string;
  name: string;
  version: number;
  nodes: WorkflowNodeModel[];
  edges: WorkflowEdgeModel[];
  inputs: WorkflowInputDef[];
  outputs: WorkflowOutputDef[];
  runConfig: WorkflowRunConfig;
}
