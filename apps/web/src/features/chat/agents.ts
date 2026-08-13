/**
 * Chat 功能域 —— 智能体目录（内置清单 + 纯逻辑）
 *
 * - BUILTIN_AGENTS 为代码常量，六个类别各一个内置智能体，不落盘
 * - 纯函数负责：筛选 / 排序 / 输入上下文构建 / 表单校验 / 变体派生
 * - 内置智能体命名中性，不包含任何第三方品牌
 */
import { PenLine, Code2, ListTodo, Library, Image, Zap } from '@lucide/vue';
import type { Component } from 'vue';

import type {
  AgentCategory,
  AgentCategoryMeta,
  AgentFilters,
  AgentInputField,
  AgentLaunchInputs,
  AgentSortKey,
  ChatAgent,
} from './agent-types';
import { uid } from './utils';

export const AGENT_CATEGORIES: AgentCategoryMeta[] = [
  { key: 'writing', label: '写作创作', color: 'var(--chat-rose)' },
  { key: 'code', label: '代码协作', color: 'var(--chat-teal)' },
  { key: 'planning', label: '项目规划', color: 'var(--chat-cyan)' },
  { key: 'research', label: '研究整理', color: 'var(--chat-mono)' },
  { key: 'vision', label: '视觉提示词', color: 'var(--chat-orange)' },
  { key: 'efficiency', label: '个人效率', color: 'var(--chat-cyan)' },
];

export function agentCategoryLabel(key: AgentCategory): string {
  return AGENT_CATEGORIES.find((c) => c.key === key)?.label ?? '其他';
}

/** 图标 key → @lucide/vue 组件（智能体卡片 / 详情 / 表单共用） */
const ICON_MAP: Record<string, Component> = {
  'pen-line': PenLine,
  'code-2': Code2,
  'list-todo': ListTodo,
  library: Library,
  image: Image,
  zap: Zap,
};

export function agentIcon(key: string): Component {
  return ICON_MAP[key] ?? Zap;
}

export const AGENT_ICON_KEYS = Object.keys(ICON_MAP);

/** 内置智能体（六类各一，中性命名） */
export const BUILTIN_AGENTS: ChatAgent[] = [
  {
    id: 'builtin-polish',
    name: '文章润色',
    description: '把草稿打磨成结构清晰、语气专业的成稿',
    category: 'writing',
    icon: 'pen-line',
    color: 'var(--chat-rose)',
    tags: ['润色', '写作', '结构化'],
    systemPrompt:
      '你是一位资深文字编辑。帮助用户润色与组织内容：结构清晰、语言平实、逻辑连贯；保留原意，标注关键修改点与理由。',
    recommendedModelId: 'long-form-writing',
    recommendedMode: 'writing',
    starterPrompts: ['帮我润色这段周报', '把这篇方案改得更专业'],
    inputFields: [
      { key: 'draft', label: '待润色内容', type: 'textarea', required: true, placeholder: '粘贴草稿或描述写作目标' },
      { key: 'tone', label: '语气', type: 'select', options: [{ label: '正式', value: 'formal' }, { label: '平实', value: 'plain' }, { label: '轻松', value: 'casual' }], defaultValue: 'formal' },
    ],
    builtin: true,
    favorite: true,
    hidden: false,
    lastUsedAt: null,
    usageCount: 0,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-code-review',
    name: '代码审阅',
    description: '以审阅者视角检查正确性、类型安全与可维护性',
    category: 'code',
    icon: 'code-2',
    color: 'var(--chat-teal)',
    tags: ['代码', '审查', '重构'],
    systemPrompt:
      '你是一位严谨的代码审阅者。按正确性、类型安全、性能、可维护性、安全性依次检查；每个问题给出严重级别、原因与修改建议。',
    recommendedModelId: 'code-collab',
    recommendedMode: 'code',
    starterPrompts: ['审查这段 TypeScript 代码', '帮我找出这段逻辑的隐患'],
    inputFields: [
      { key: 'code', label: '代码片段', type: 'textarea', required: true, placeholder: '粘贴待审查代码' },
      { key: 'focus', label: '审查重点', type: 'tags', placeholder: '如：类型安全、性能', defaultValue: ['类型安全'] },
    ],
    builtin: true,
    favorite: true,
    hidden: false,
    lastUsedAt: null,
    usageCount: 0,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-task-breakdown',
    name: '任务拆解',
    description: '把目标拆成可执行、可验收的子任务',
    category: 'planning',
    icon: 'list-todo',
    color: 'var(--chat-cyan)',
    tags: ['规划', '拆解', '验收'],
    systemPrompt:
      '你是一位任务规划师。把目标拆解为可执行、可验收的子任务：每项包含目的、步骤、产出与验收标准；先优先级排序，再给依赖关系。',
    recommendedModelId: 'general-reasoning',
    recommendedMode: 'chat',
    starterPrompts: ['拆解「上线个人工作台」', '把月度目标拆成两周计划'],
    inputFields: [
      { key: 'goal', label: '目标', type: 'textarea', required: true, placeholder: '描述要拆解的目标' },
      { key: 'granularity', label: '粒度', type: 'select', options: [{ label: '粗略', value: 'coarse' }, { label: '标准', value: 'standard' }, { label: '细致', value: 'fine' }], defaultValue: 'standard' },
    ],
    builtin: true,
    favorite: false,
    hidden: false,
    lastUsedAt: null,
    usageCount: 0,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-research',
    name: '资料整理',
    description: '把零散资料归纳成结构化知识卡片',
    category: 'research',
    icon: 'library',
    color: 'var(--chat-mono)',
    tags: ['整理', '归纳', '知识库'],
    systemPrompt:
      '你是一位研究助理。把零散资料按主题归纳：提取关键观点、来源、结论与待验证项；输出结构化笔记，保留可追溯的信息来源。',
    recommendedModelId: 'general-reasoning',
    recommendedMode: 'chat',
    starterPrompts: ['把这段访谈整理成要点', '归纳这批文章的核心观点'],
    inputFields: [
      { key: 'material', label: '素材', type: 'textarea', required: true, placeholder: '粘贴待整理的资料' },
      { key: 'format', label: '输出格式', type: 'select', options: [{ label: '要点列表', value: 'bullets' }, { label: '知识卡片', value: 'cards' }, { label: '对比表格', value: 'table' }], defaultValue: 'bullets' },
    ],
    builtin: true,
    favorite: false,
    hidden: false,
    lastUsedAt: null,
    usageCount: 0,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-visual-prompt',
    name: '视觉提示词',
    description: '把想法打磨成结构化的图像生成提示词',
    category: 'vision',
    icon: 'image',
    color: 'var(--chat-orange)',
    tags: ['提示词', '图像', '构图'],
    systemPrompt:
      '你是一位图像提示词工程师。把用户描述打磨为结构化的提示词：主体、场景、光线、构图、风格、色彩、镜头与负面约束；给出可替换的选项。',
    recommendedModelId: 'visual-prompt',
    recommendedMode: 'image',
    starterPrompts: ['把「深夜书房」写成提示词', '设计一张产品海报的提示词模板'],
    inputFields: [
      { key: 'idea', label: '想法描述', type: 'textarea', required: true, placeholder: '描述你想生成的画面' },
      { key: 'style', label: '风格', type: 'select', options: [{ label: '写实', value: 'realistic' }, { label: '插画', value: 'illustration' }, { label: '极简', value: 'minimal' }, { label: '科幻', value: 'scifi' }], defaultValue: 'realistic' },
      { key: 'ratio', label: '画幅', type: 'select', options: [{ label: '1:1 方图', value: '1:1' }, { label: '4:3 横图', value: '4:3' }, { label: '3:4 竖图', value: '3:4' }], defaultValue: '1:1' },
    ],
    builtin: true,
    favorite: true,
    hidden: false,
    lastUsedAt: null,
    usageCount: 0,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-focus',
    name: '专注计划',
    description: '把待办整理成可执行的今日专注清单',
    category: 'efficiency',
    icon: 'zap',
    color: 'var(--chat-cyan)',
    tags: ['效率', '专注', '日程'],
    systemPrompt:
      '你是一位效率教练。把待办整理成今日专注清单：按重要度与精力分配排序，每项给出预估时长与完成标准；识别可删除或委托的事项。',
    recommendedModelId: 'light-chat',
    recommendedMode: 'chat',
    starterPrompts: ['帮我规划今天的专注清单', '把本周待办排个优先级'],
    inputFields: [
      { key: 'todos', label: '待办事项', type: 'textarea', required: true, placeholder: '列出今天要做的事' },
      { key: 'focusHours', label: '可用专注时长', type: 'text', defaultValue: '4 小时' },
      { key: 'includeBreaks', label: '包含休息提醒', type: 'switch', defaultValue: true },
    ],
    builtin: true,
    favorite: false,
    hidden: false,
    lastUsedAt: null,
    usageCount: 0,
    createdAt: 0,
    updatedAt: 0,
  },
];

/* ---------- 纯函数：筛选 / 排序 ---------- */

export function filterAgents(
  agents: ChatAgent[],
  filters: AgentFilters,
): ChatAgent[] {
  const kw = filters.keyword.trim().toLowerCase();
  return agents.filter((a) => {
    if (a.hidden) return false;
    if (filters.category !== 'all' && a.category !== filters.category) return false;
    if (filters.favoritesOnly && !a.favorite) return false;
    if (!kw) return true;
    return (
      a.name.toLowerCase().includes(kw) ||
      a.description.toLowerCase().includes(kw) ||
      a.tags.some((t) => t.toLowerCase().includes(kw))
    );
  });
}

export function sortAgents(
  agents: ChatAgent[],
  by: AgentSortKey,
): ChatAgent[] {
  const list = [...agents];
  switch (by) {
    case 'recent':
      return list.sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0));
    case 'usage':
      return list.sort((a, b) => b.usageCount - a.usageCount);
    case 'name':
      return list.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    case 'default':
    default:
      return list.sort(
        (a, b) =>
          Number(b.favorite) - Number(a.favorite) ||
          a.createdAt - b.createdAt,
      );
  }
}

/* ---------- 纯函数：启动输入构建 ---------- */

/** 字段值是否视为已填写（必填校验用） */
function fieldFilled(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value === true;
}

/** 字段值 → 启动请求中的可读文本 */
function fieldToText(field: AgentInputField, value: unknown): string {
  if (field.type === 'switch') {
    return value === true ? field.label : '';
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? `${field.label}：${value.join('、')}` : '';
  }
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  return field.type === 'select'
    ? `${field.label}：${field.options?.find((o) => o.value === text)?.label ?? text}`
    : `${field.label}：${text}`;
}

/**
 * 构建启动请求文本：必填缺失返回 null；否则拼接字段内容，
 * 未配置输入字段时回退到首个示例任务。
 */
export function buildAgentLaunchPrompt(
  agent: ChatAgent,
  inputs: AgentLaunchInputs,
): string | null {
  const missing = agent.inputFields.some(
    (f) => f.required && !fieldFilled(inputs[f.key]),
  );
  if (missing) return null;
  const parts = agent.inputFields
    .map((f) => fieldToText(f, inputs[f.key]))
    .filter(Boolean);
  if (parts.length === 0) {
    return agent.starterPrompts[0] ?? `请按照系统提示词开始：${agent.name}`;
  }
  return parts.join('\n');
}

/** 智能体输入字段初始值（表单默认值） */
export function initialAgentInputs(agent: ChatAgent): AgentLaunchInputs {
  const values: AgentLaunchInputs = {};
  for (const f of agent.inputFields) {
    if (f.defaultValue !== undefined) values[f.key] = f.defaultValue;
  }
  return values;
}

/* ---------- 纯函数：表单校验 / 变体派生 ---------- */

export interface AgentFormErrors {
  name?: string;
  description?: string;
  systemPrompt?: string;
  recommendedModelId?: string;
}

export function validateAgentForm(data: {
  name: string;
  description: string;
  systemPrompt: string;
  recommendedModelId: string;
}): AgentFormErrors {
  const errors: AgentFormErrors = {};
  if (!data.name.trim()) errors.name = '名称不能为空';
  if (!data.description.trim()) errors.description = '简介不能为空';
  if (!data.systemPrompt.trim()) errors.systemPrompt = '系统提示词不能为空';
  if (!data.recommendedModelId.trim()) errors.recommendedModelId = '请选择推荐模型';
  return errors;
}

/** 从来源智能体派生个人变体（新 id、builtin=false、计数清零） */
export function deriveAgentVariant(
  source: ChatAgent,
  overrides: Partial<ChatAgent> = {},
): ChatAgent {
  const now = Date.now();
  return {
    ...source,
    id: uid(),
    name: overrides.name?.trim() ? overrides.name.trim() : `${source.name}（变体）`,
    description: overrides.description ?? source.description,
    category: overrides.category ?? source.category,
    icon: overrides.icon ?? source.icon,
    color: overrides.color ?? source.color,
    tags: overrides.tags ?? [...source.tags],
    systemPrompt: overrides.systemPrompt ?? source.systemPrompt,
    recommendedModelId: overrides.recommendedModelId ?? source.recommendedModelId,
    recommendedMode: overrides.recommendedMode ?? source.recommendedMode,
    starterPrompts: overrides.starterPrompts ?? [...source.starterPrompts],
    inputFields: overrides.inputFields
      ? overrides.inputFields.map((f) => ({ ...f }))
      : source.inputFields.map((f) => ({ ...f })),
    builtin: false,
    favorite: overrides.favorite ?? false,
    hidden: false,
    lastUsedAt: null,
    usageCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/** 默认变体表单草稿（新建空智能体） */
export function emptyAgentForm(): {
  name: string;
  description: string;
  category: AgentCategory;
  icon: string;
  color: string;
  tags: string[];
  systemPrompt: string;
  recommendedModelId: string;
  recommendedMode: ChatAgent['recommendedMode'];
  starterPrompts: string[];
  inputFields: AgentInputField[];
} {
  return {
    name: '',
    description: '',
    category: 'writing',
    icon: 'pen-line',
    color: 'var(--chat-rose)',
    tags: [],
    systemPrompt: '',
    recommendedModelId: 'general-reasoning',
    recommendedMode: 'chat',
    starterPrompts: [],
    inputFields: [],
  };
}
