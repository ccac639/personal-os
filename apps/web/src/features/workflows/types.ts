import type { XYPosition } from '@vue-flow/core';
import type { Component } from 'vue';
import {
  Bell,
  Code2,
  FileOutput,
  GitBranch,
  MessageSquareText,
  Sparkles,
  Timer,
  Zap,
} from '@lucide/vue';

/** 工作流节点类型 */
export type WorkflowNodeKind =
  'trigger' | 'prompt' | 'ai' | 'code' | 'condition' | 'delay' | 'notify' | 'output';

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
  /** 模拟失败注入（仅用于演示/测试：非空时该节点运行后置为失败） */
  simulateError?: string;
}

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
