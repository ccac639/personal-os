/**
 * Chat 功能域 —— 智能体数据模型
 *
 * 智能体是可复用的提示词与工作流入口（本地个人目录），不是独立后端服务。
 * 内置智能体为代码常量；个人变体持久化于 agent-storage.ts。
 */
import type { ChatOutputMode } from './types';

/** 智能体类别（六类） */
export type AgentCategory =
  | 'writing'
  | 'code'
  | 'planning'
  | 'research'
  | 'vision'
  | 'efficiency';

/** 启动输入字段类型 */
export type AgentInputType = 'text' | 'textarea' | 'select' | 'tags' | 'switch';

/** 启动面板输入字段定义 */
export interface AgentInputField {
  key: string;
  label: string;
  type: AgentInputType;
  /** 是否必填 */
  required?: boolean;
  placeholder?: string;
  help?: string;
  /** select 选项 */
  options?: { label: string; value: string }[];
  defaultValue?: string | boolean | string[];
}

/** 智能体目录条目 */
export interface ChatAgent {
  id: string;
  name: string;
  /** 一句简介 */
  description: string;
  category: AgentCategory;
  /** 图标 key（组件层映射到 @lucide/vue） */
  icon: string;
  /** 语义色（映射到 --chat-* 变量） */
  color: string;
  /** 能力标签 */
  tags: string[];
  /** 系统提示词 */
  systemPrompt: string;
  /** 推荐模型 id（来自 CHAT_MODELS） */
  recommendedModelId: string;
  /** 推荐输出模式 */
  recommendedMode: ChatOutputMode;
  /** 示例任务（欢迎态 / 详情展示） */
  starterPrompts: string[];
  /** 启动面板输入字段 */
  inputFields: AgentInputField[];
  /** 内置智能体（代码常量，不可删除） */
  builtin: boolean;
  favorite: boolean;
  /** 隐藏（内置可隐藏；个人变体删除） */
  hidden: boolean;
  /** 最近使用时间戳（未使用为 null） */
  lastUsedAt: number | null;
  /** 使用次数 */
  usageCount: number;
  createdAt: number;
  updatedAt: number;
}

/** 智能体启动表单值（key → 值） */
export type AgentLaunchInputs = Record<string, string | boolean | string[]>;

/** 智能体筛选器（UI 状态，不持久化） */
export interface AgentFilters {
  keyword: string;
  category: AgentCategory | 'all';
  favoritesOnly: boolean;
}

/** 智能体排序键 */
export type AgentSortKey = 'default' | 'recent' | 'usage' | 'name';

/** 类别元信息 */
export interface AgentCategoryMeta {
  key: AgentCategory;
  label: string;
  color: string;
}
