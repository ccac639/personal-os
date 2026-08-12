import type { XYPosition } from '@vue-flow/core';
import type { Component } from 'vue';
import { Bell, Code2, GitBranch, Sparkles, Timer, Zap } from '@lucide/vue';

/** 工作流节点类型 */
export type WorkflowNodeKind = 'trigger' | 'ai' | 'code' | 'condition' | 'notify' | 'delay';

/** 模拟运行状态（不持久化） */
export type NodeStatus = 'idle' | 'running' | 'success' | 'error';

/** 节点数据：kind + 通用字段 + 各类型专属配置 */
export interface WorkflowNodeData {
  kind: WorkflowNodeKind;
  label: string;
  status: NodeStatus;
  cron?: string;
  model?: string;
  prompt?: string;
  lang?: string;
  code?: string;
  expr?: string;
  channel?: string;
  message?: string;
  seconds?: number;
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
    kind: 'ai',
    label: 'AI 任务',
    description: '调用大模型执行生成 / 分析 / 总结',
    icon: Sparkles,
    chip: 'bg-violet-500/10 text-violet-600',
    defaults: { model: 'deepseek-v3', prompt: '', label: 'AI 任务' },
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
    kind: 'notify',
    label: '发送通知',
    description: '通过邮件 / 钉钉 / 飞书等渠道推送消息',
    icon: Bell,
    chip: 'bg-rose-500/10 text-rose-600',
    defaults: { channel: '邮件', message: '', label: '发送通知' },
  },
  {
    kind: 'delay',
    label: '延迟等待',
    description: '暂停指定秒数后再继续',
    icon: Timer,
    chip: 'bg-sky-500/10 text-sky-600',
    defaults: { seconds: 60, label: '延迟 60s' },
  },
];

export function getNodeDef(kind: WorkflowNodeKind): NodeDef {
  return NODE_DEFS.find((d) => d.kind === kind) ?? NODE_DEFS[0]!;
}

/** 节点摘要（画布节点副标题，按类型展示主参数） */
export function nodeSummary(data: WorkflowNodeData): string {
  switch (data.kind) {
    case 'trigger':
      return data.cron ? `Cron · ${data.cron}` : 'Cron 未配置';
    case 'ai':
      return data.model ?? '模型未配置';
    case 'code':
      return data.lang ?? '语言未配置';
    case 'condition':
      return data.expr || '表达式为空';
    case 'notify':
      return data.channel ?? '渠道未配置';
    case 'delay':
      return `${data.seconds ?? 0}s 后继续`;
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
