import type { XYPosition } from '@vue-flow/core';
import type { Component } from 'vue';
import {
  Bell,
  CalendarClock,
  Code2,
  FileOutput,
  GitBranch,
  GitMerge,
  Globe,
  MessageSquareText,
  Sparkles,
  Split,
  Timer,
  UserCheck,
  Workflow as WorkflowIcon,
  Braces,
  Zap,
} from '@lucide/vue';

/** 工作流节点类型 */
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
  | 'subworkflow';

/** 节点分组（节点库展示分区） */
export type NodeGroup = 'trigger' | 'control' | 'data' | 'integration' | 'human' | 'output';

/** switch 分支用例 */
export interface WorkflowSwitchCase {
  label: string;
  expr: string;
}

/** 子流程输入/输出映射：本工作流变量路径 → 子流程端口名 */
export type SubflowPortMap = Record<string, string>;

/** 模拟运行状态（不持久化） */
export type NodeStatus = 'idle' | 'running' | 'success' | 'error';

/** 节点数据：kind + 通用字段 + 各类型专属配置 */
export interface WorkflowNodeData {
  kind: WorkflowNodeKind;
  label: string;
  status: NodeStatus;
  cron?: string;
  /** 提示词节点模板 */
  template?: string;
  model?: string;
  prompt?: string;
  /** AI 生成：温度（0-2） */
  temperature?: number;
  /** AI 生成：输出格式 */
  outputFormat?: string;
  /** AI 生成：最大输出长度 */
  maxTokens?: number;
  lang?: string;
  code?: string;
  expr?: string;
  /** 条件分支标签（默认「通过 / 不通过」） */
  trueLabel?: string;
  falseLabel?: string;
  /** 延迟：规范化秒数（兼容旧数据），单位换算见 delayValue/delayUnit */
  seconds?: number;
  /** 延迟：输入数值（配合 delayUnit 换算为 seconds） */
  delayValue?: number;
  /** 延迟：输入单位 ms / s / min */
  delayUnit?: 'ms' | 's' | 'min';
  channel?: string;
  /** 通知标题 */
  title?: string;
  /** 通知级别 */
  level?: 'info' | 'warn' | 'error';
  message?: string;
  /** 输出节点格式 */
  format?: string;
  /** 输出节点名称 */
  outputName?: string;
  /* ---------- transform ---------- */
  /** 转换操作：模板 / JSON 路径 / 大小写 / trim / 拼接 / 截取 */
  transformOp?: 'template' | 'jsonpath' | 'upper' | 'lower' | 'trim' | 'concat' | 'slice';
  /** transform：模板转换时的模板文本 */
  transformTemplate?: string;
  /** transform：JSON 路径提取（点路径） */
  jsonPath?: string;
  /** transform：拼接分隔符 */
  separator?: string;
  /** transform：截取区间 */
  sliceStart?: number;
  sliceEnd?: number;
  /* ---------- switch ---------- */
  cases?: WorkflowSwitchCase[];
  /** switch：默认分支标签 */
  defaultLabel?: string;
  /* ---------- merge ---------- */
  mergeMode?: 'concat' | 'object' | 'first' | 'last';
  /* ---------- manual-approval ---------- */
  approvalPrompt?: string;
  /* ---------- http-request（仅 mock，绝不发起真实网络） ---------- */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url?: string;
  /** 请求头（JSON 文本，仅配置展示，导出时脱敏） */
  headersText?: string;
  /** 请求体（JSON 文本） */
  bodyText?: string;
  /** mock 响应状态码 */
  mockStatus?: number;
  /** mock 响应体 */
  mockBody?: string;
  /* ---------- schedule（仅配置与预览，绝不注册真实定时任务） ---------- */
  scheduleType?: 'cron' | 'interval';
  intervalValue?: number;
  intervalUnit?: 'ms' | 's' | 'min' | 'hour';
  /* ---------- subworkflow ---------- */
  /** 被调用的工作流 id */
  workflowRef?: string;
  /** 本工作流变量 → 子流程输入端口 */
  inputMap?: SubflowPortMap;
  /** 子流程输出端口 → 本工作流输出名 */
  outputMap?: SubflowPortMap;
  /** 模拟失败注入（仅用于演示/测试：非空时该节点运行后置为失败） */
  simulateError?: string;
}

/* ---------- 工作流输入输出契约与运行配置 ---------- */

export type WorkflowInputType = 'text' | 'number' | 'boolean' | 'json' | 'select';

export interface WorkflowInputDef {
  /** 唯一名称（变量引用名） */
  name: string;
  label: string;
  type: WorkflowInputType;
  required: boolean;
  defaultValue?: unknown;
  description?: string;
  /** select 选项 */
  options?: string[];
}

export interface WorkflowOutputDef {
  /** 唯一名称 */
  name: string;
  /** 输出类型（text/number/boolean/json/any） */
  type: string;
  /** 来源：节点 id 或节点输出点路径（如 n-2 或 n-2.text） */
  source: string;
  description?: string;
}

export type FailStrategy = 'stop' | 'continue';

export interface WorkflowRunConfig {
  /** 最大执行步数（预估超过时阻止运行） */
  maxSteps: number;
  /** 默认超时（ms） */
  timeoutMs: number;
  /** 失败策略：停止 / 继续 */
  failStrategy: FailStrategy;
  /** 是否允许手动运行（false 时列表运行按钮禁用） */
  allowManualRun: boolean;
}

/** 模块化子图端口 */
export interface ModulePort {
  name: string;
  label?: string;
  /** 端口语义（in=入口节点，out=出口节点） */
  kind: 'in' | 'out';
}

/** 工作流内的可复用模块（模块化子图） */
export interface WorkflowModule {
  id: string;
  name: string;
  description?: string;
  version: number;
  nodes: WorkflowNodeModel[];
  edges: WorkflowEdgeModel[];
  ports: ModulePort[];
  createdAt: number;
  updatedAt: number;
  /** 版本更新时是否同步画布实例（仅更新定义时为新版本） */
  syncExisting?: boolean;
}

/** 运行历史条目 */
export type RunHistoryStatus = 'success' | 'failed' | 'cancelled';

export interface RunNodeResult {
  nodeId: string;
  label: string;
  kind: WorkflowNodeKind;
  status: NodeStatus;
  output?: unknown;
  error?: string;
}

export interface RunHistoryEntry {
  id: string;
  workflowId: string;
  workflowName: string;
  /** 运行时的结构签名（workflowVersion 语义） */
  workflowVersion: string;
  mode: RunMode;
  status: RunHistoryStatus;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  /** 运行输入摘要（脱敏） */
  inputSummary: Record<string, unknown>;
  /** 工作流输出（按 outputs 定义汇总，脱敏） */
  outputSummary: Record<string, unknown>;
  /** 节点执行结果（供回放着色） */
  nodeResults: RunNodeResult[];
  /** 日志（截断上限） */
  logs: RunLogEntry[];
  failedNodeId?: string;
  error?: string;
  pinned?: boolean;
}

/** 回放态节点状态映射（id → 历史状态） */
export type ReplayState = Map<string, NodeStatus>;

/** 画布节点模型：与 Vue Flow 解耦的轻量结构。
 * 注意：不直接用 Vue Flow 的 Node/Edge 类型——项目同时安装 motion 与
 * motion-v，两者都增强了 vue 的 HTMLAttributes，导致 vue-tsc 对
 * Node.domAttributes 的 Omit<HTMLAttributes> 解析自相矛盾（对自身赋值都失败）。
 * 画布组件在边界用 as unknown as 转换，Store 内保持此模型。
 */
export interface WorkflowNodeModel {
  id: string;
  position: XYPosition;
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
  class?: string;
  selected?: boolean;
  [key: string]: unknown;
}

/** 延迟单位 */
export type DelayUnit = 'ms' | 's' | 'min';

/** 通知级别 */
export type NotifyLevel = 'info' | 'warn' | 'error';

/** 工作流版本快照（持久化，上限截断） */
export interface WorkflowVersion {
  id: string;
  summary: string;
  createdAt: number;
  /** 版本时刻的结构快照（不含运行时状态） */
  nodes: WorkflowNodeModel[];
  edges: WorkflowEdgeModel[];
  seq: number;
}

/** 模拟运行日志级别 */
export type RunLogLevel = 'run' | 'info' | 'success' | 'warn' | 'error';

/** 模拟运行日志条目（带节点关联，支持点击定位） */
export interface RunLogEntry {
  id: number;
  level: RunLogLevel;
  text: string;
  nodeId?: string;
  /** 产生时间戳（ms，供时间过滤与导出） */
  ts?: number;
}

/** 运行参数（用户输入，模拟执行上下文） */
export interface RunParams {
  /** 初始文本 */
  initialText?: string;
  /** 变量对象（{{name}} 插值源） */
  variables?: Record<string, unknown>;
  /** 模拟上下文 */
  context?: Record<string, unknown>;
}

/** 运行模式：完整 / 从选中节点继续 / 仅选中节点 */
export type RunMode = 'full' | 'from' | 'single';

/** 断言节点 data（模型内保证存在） */
export function nodeData(n: WorkflowNodeModel): WorkflowNodeData {
  return n.data;
}

/** 节点类型元数据：面板展示 + 默认配置 */
export interface NodeDef {
  kind: WorkflowNodeKind;
  label: string;
  description: string;
  icon: Component;
  /** 图标底色（语义色，不随主题变化） */
  chip: string;
  defaults: Partial<WorkflowNodeData>;
}

export const NODE_DEFS: NodeDef[] = [
  {
    kind: 'trigger',
    label: '定时触发',
    description: '按 Cron 表达式定时启动工作流',
    icon: Zap,
    chip: 'bg-brand-500/10 text-brand-600',
    defaults: { cron: '0 9 * * *', label: '每日 09:00 触发' },
  },
  {
    kind: 'prompt',
    label: '提示词',
    description: '定义可复用的提示词模板',
    icon: MessageSquareText,
    chip: 'bg-cyan-500/10 text-cyan-600',
    defaults: { template: '', label: '提示词' },
  },
  {
    kind: 'ai',
    label: 'AI 生成',
    description: '调用大模型执行生成 / 分析 / 总结',
    icon: Sparkles,
    chip: 'bg-violet-500/10 text-violet-600',
    defaults: { model: 'deepseek-v3', prompt: '', label: 'AI 生成' },
  },
  {
    kind: 'code',
    label: '代码执行',
    description: '运行一段脚本并产出结果',
    icon: Code2,
    chip: 'bg-emerald-500/10 text-emerald-600',
    defaults: { lang: 'python', code: '', label: '代码执行' },
  },
  {
    kind: 'condition',
    label: '条件判断',
    description: '根据表达式结果走不同分支（右=通过 / 下=不通过）',
    icon: GitBranch,
    chip: 'bg-amber-500/10 text-amber-600',
    defaults: { expr: 'result == "ok"', label: '条件判断' },
  },
  {
    kind: 'delay',
    label: '延迟等待',
    description: '暂停指定秒数后再继续',
    icon: Timer,
    chip: 'bg-sky-500/10 text-sky-600',
    defaults: { seconds: 60, label: '延迟 60s' },
  },
  {
    kind: 'notify',
    label: '发送通知',
    description: '通过邮件 / 钉钉 / 飞书等渠道推送消息',
    icon: Bell,
    chip: 'bg-rose-500/10 text-rose-600',
    defaults: { channel: '邮件', message: '', label: '发送通知' },
  },
  {
    kind: 'output',
    label: '输出',
    description: '将执行结果输出为文本 / Markdown / JSON',
    icon: FileOutput,
    chip: 'bg-fuchsia-500/10 text-fuchsia-600',
    defaults: { format: 'text', label: '输出' },
  },
  /* ---------- 控制 / 数据 / 集成 / 人工交互 ---------- */
  {
    kind: 'transform',
    label: '数据转换',
    description: '模板 / JSON 路径 / 大小写 / trim / 拼接 / 截取等确定性转换',
    icon: Braces,
    chip: 'bg-teal-500/10 text-teal-600',
    defaults: { transformOp: 'template', transformTemplate: '{{input}}', label: '数据转换' },
  },
  {
    kind: 'switch',
    label: '多分支路由',
    description: '按多个条件用例路由到不同分支（右=各用例 / 下=默认）',
    icon: Split,
    chip: 'bg-orange-500/10 text-orange-600',
    defaults: { cases: [{ label: 'case-1', expr: 'value == 1' }], label: '多分支路由' },
  },
  {
    kind: 'merge',
    label: '聚合合并',
    description: '将多个输入合并为数组 / 对象 / 首值 / 末值',
    icon: GitMerge,
    chip: 'bg-indigo-500/10 text-indigo-600',
    defaults: { mergeMode: 'concat', label: '聚合合并' },
  },
  {
    kind: 'manual-approval',
    label: '人工确认',
    description: '暂停等待本地用户确认 / 拒绝，模拟人工闸门',
    icon: UserCheck,
    chip: 'bg-pink-500/10 text-pink-600',
    defaults: { approvalPrompt: '是否继续执行？', label: '人工确认' },
  },
  {
    kind: 'http-request',
    label: 'HTTP 请求',
    description: '配置请求并返回确定性 mock 响应（绝不发起真实网络请求）',
    icon: Globe,
    chip: 'bg-blue-500/10 text-blue-600',
    defaults: {
      method: 'GET',
      url: 'https://api.example.com/data',
      mockStatus: 200,
      mockBody: '{"ok":true}',
      label: 'HTTP 请求',
    },
  },
  {
    kind: 'schedule',
    label: '定时计划',
    description: '配置 cron / 间隔表达式并本地预览（绝不注册真实定时任务）',
    icon: CalendarClock,
    chip: 'bg-lime-500/10 text-lime-600',
    defaults: { scheduleType: 'cron', cron: '0 9 * * *', label: '定时计划' },
  },
  {
    kind: 'subworkflow',
    label: '子流程',
    description: '调用当前本地其他工作流作为子流程（禁止自引用与循环）',
    icon: WorkflowIcon,
    chip: 'bg-slate-500/10 text-slate-600',
    defaults: { label: '子流程' },
  },
];

export function getNodeDef(kind: WorkflowNodeKind): NodeDef {
  return NODE_DEFS.find((d) => d.kind === kind) ?? NODE_DEFS[0]!;
}

/** 合法节点类型集合（校验 / 拖放白名单） */
export const NODE_KINDS: ReadonlySet<string> = new Set(NODE_DEFS.map((d) => d.kind));

/** 节点摘要（画布节点副标题，按类型展示主参数） */
export function nodeSummary(data: WorkflowNodeData): string {
  switch (data.kind) {
    case 'trigger':
      return data.cron ? `Cron · ${data.cron}` : 'Cron 未配置';
    case 'prompt':
      return data.template ? `模板 · ${data.template}` : '模板为空';
    case 'ai':
      return data.model ?? '模型未配置';
    case 'code':
      return data.lang ?? '语言未配置';
    case 'condition':
      return data.expr || '表达式为空';
    case 'delay':
      return `${data.seconds ?? 0}s 后继续`;
    case 'notify':
      return data.channel ?? '渠道未配置';
    case 'output':
      return `${data.format ?? 'text'} 输出`;
    case 'transform':
      return data.transformOp === 'jsonpath'
        ? `提取 ${data.jsonPath ?? '?'}`
        : data.transformOp === 'concat'
          ? `拼接 · ${data.separator ?? ','}`
          : (data.transformOp ?? '模板转换');
    case 'switch':
      return `${data.cases?.length ?? 0} 个分支`;
    case 'merge':
      return `合并 · ${data.mergeMode ?? 'concat'}`;
    case 'manual-approval':
      return data.approvalPrompt || '等待确认';
    case 'http-request':
      return `${data.method ?? 'GET'} ${data.url ?? '未配置 URL'}`;
    case 'schedule':
      return data.scheduleType === 'interval'
        ? `每 ${data.intervalValue ?? 1}${data.intervalUnit ?? 'min'}`
        : `Cron · ${data.cron ?? '未配置'}`;
    case 'subworkflow':
      return data.workflowRef ? `调用子流程` : '未选择子流程';
    default:
      return '';
  }
}

/** 生成节点 id（画布内自增，持久化防冲突） */
export function nextNodeId(seq: number): string {
  return `n-${seq}`;
}

export function nextEdgeId(
  source: string,
  sourceHandle: string | null | undefined,
  target: string,
): string {
  return `e-${source}-${sourceHandle ?? 'out'}-${target}`;
}

export type { XYPosition };
