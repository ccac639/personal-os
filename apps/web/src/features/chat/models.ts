/**
 * Chat 功能域 —— 前端 mock 模型目录
 *
 * 纯本地数据，不调用 API。所有名称/提供方均为中性描述，
 * 不包含任何第三方品牌或专有视觉资产。
 * 未来接入真实模型时，将本目录替换为服务端模型清单即可。
 */
import type {
  ChatModelCategory,
  ChatModelOption,
  ChatOutputMode,
  ChatSuggestion,
} from './types';

export interface ModelCategoryMeta {
  key: ChatModelCategory | 'all';
  label: string;
  /** 语义色变量名（组件样式内定义 --chat-* 变量） */
  color: string;
}

export const MODEL_CATEGORIES: ModelCategoryMeta[] = [
  { key: 'all', label: '全部', color: 'var(--chat-mono)' },
  { key: 'chat', label: '对话', color: 'var(--chat-cyan)' },
  { key: 'code', label: '代码', color: 'var(--chat-teal)' },
  { key: 'image', label: '图像', color: 'var(--chat-orange)' },
  { key: 'creative', label: '创作', color: 'var(--chat-rose)' },
];

export const CHAT_MODELS: ChatModelOption[] = [
  {
    id: 'general-reasoning',
    label: '通用推理',
    provider: '本地路由',
    category: 'chat',
    description: '适合日常问答、分析、头脑风暴的通用模型',
    tags: ['推理', '问答', '分析'],
    context: '128K 上下文',
    color: 'var(--chat-cyan)',
    favorite: true,
    available: true,
    hint: '通用 · 日常首选',
  },
  {
    id: 'light-chat',
    label: '轻量对话',
    provider: '本地路由',
    category: 'chat',
    description: '低延迟闲聊与快速回复，适合高频轻任务',
    tags: ['快速', '轻量'],
    context: '64K 上下文',
    color: 'var(--chat-cyan)',
    favorite: false,
    available: true,
    hint: '低延迟 · 轻任务',
  },
  {
    id: 'code-collab',
    label: '代码协作',
    provider: '本地路由',
    category: 'code',
    description: '代码生成、重构与调试协作，擅长 TypeScript 生态',
    tags: ['代码', '重构', '调试'],
    context: '128K 上下文',
    color: 'var(--chat-teal)',
    favorite: true,
    available: true,
    hint: '代码 · 工程助手',
  },
  {
    id: 'arch-analysis',
    label: '架构分析',
    provider: '本地路由',
    category: 'code',
    description: '系统架构评审、依赖分析与演进规划',
    tags: ['架构', '评审', '规划'],
    context: '200K 上下文',
    color: 'var(--chat-teal)',
    favorite: false,
    available: true,
    hint: '架构 · 深度评审',
  },
  {
    id: 'visual-prompt',
    label: '视觉提示',
    provider: '本地路由',
    category: 'image',
    description: '把想法打磨成结构化的图像生成提示词',
    tags: ['提示词', '图像'],
    context: '64K 上下文',
    color: 'var(--chat-orange)',
    favorite: true,
    available: true,
    hint: '图像 · 提示词工程',
  },
  {
    id: 'image-critique',
    label: '图像评审',
    provider: '本地路由',
    category: 'image',
    description: '分析画面构图、风格与光影，给出改进建议',
    tags: ['构图', '风格', '反馈'],
    context: '64K 上下文',
    color: 'var(--chat-orange)',
    favorite: false,
    available: true,
    hint: '图像 · 审美反馈',
  },
  {
    id: 'long-form-writing',
    label: '长文创作',
    provider: '本地路由',
    category: 'creative',
    description: '文章、周报、方案的长篇写作与润色',
    tags: ['写作', '润色', '长文'],
    context: '128K 上下文',
    color: 'var(--chat-rose)',
    favorite: true,
    available: true,
    hint: '创作 · 长文输出',
  },
  {
    id: 'copywriting',
    label: '文案助手',
    provider: '本地路由',
    category: 'creative',
    description: '标题、文案、口播脚本的短平快创作',
    tags: ['文案', '创意'],
    context: '64K 上下文',
    color: 'var(--chat-rose)',
    favorite: false,
    available: true,
    hint: '创作 · 短文案',
  },
  {
    id: 'workflow-coach',
    label: '工作流教练',
    provider: '本地路由',
    category: 'chat',
    description: '把零散步骤编排成可复用工作流（即将接入）',
    tags: ['工作流', '编排'],
    context: '128K 上下文',
    color: 'var(--chat-cyan)',
    favorite: false,
    available: false,
    hint: '即将接入 · 编排',
  },
];

/** 类别 → 建议任务（欢迎态使用，随当前模型类别变化） */
const SUGGESTIONS_BY_CATEGORY: Record<ChatModelCategory, ChatSuggestion[]> = {
  chat: [
    {
      id: 'chat-1',
      title: '梳理项目现状',
      description: '让助手帮你总结仓库结构',
      prompt: '帮我梳理当前 personal-os 仓库的整体结构与模块职责',
    },
    {
      id: 'chat-2',
      title: '讨论技术方案',
      description: '对比几个候选实现',
      prompt: '对比一下本地模型接入的几种方案，给出推荐',
    },
    {
      id: 'chat-3',
      title: '制定学习计划',
      description: '按当前技术栈拆解目标',
      prompt: '帮我制定一个 TypeScript 进阶学习计划',
    },
    {
      id: 'chat-4',
      title: '头脑风暴',
      description: '围绕一个主题发散想法',
      prompt: '围绕「个人 AI 工作区」头脑风暴 10 个实用功能点',
    },
  ],
  code: [
    {
      id: 'code-1',
      title: '写一段代码',
      description: 'Vue 3 + TypeScript 组件示例',
      prompt: '帮我写一个 Vue 3 + TypeScript 的组合式组件示例',
    },
    {
      id: 'code-2',
      title: '代码审查',
      description: '检查一段代码的隐患',
      prompt: '帮我审查一段代码，指出类型与性能问题',
    },
    {
      id: 'code-3',
      title: '设计接口',
      description: '类型优先的 API 设计',
      prompt: '设计一个类型安全的 API 层，给出关键接口定义',
    },
    {
      id: 'code-4',
      title: '调试思路',
      description: '给出定位 bug 的步骤',
      prompt: '前端偶发白屏，帮我梳理排查步骤与可能原因',
    },
  ],
  image: [
    {
      id: 'image-1',
      title: '生成视觉提示词',
      description: '把想法写成提示词',
      prompt: '帮我把「深夜书房的程序员」写成结构化的图像生成提示词',
    },
    {
      id: 'image-2',
      title: '风格细化',
      description: '统一画面风格关键词',
      prompt: '为一组产品截图设计统一风格的关键词模板',
    },
    {
      id: 'image-3',
      title: '构图建议',
      description: '分析画面的布局节奏',
      prompt: '给出海报构图的几种经典布局与适用场景',
    },
    {
      id: 'image-4',
      title: '提示词模板',
      description: '沉淀可复用模板',
      prompt: '设计一个可复用的「角色 + 场景 + 光线 + 风格」提示词模板',
    },
  ],
  creative: [
    {
      id: 'creative-1',
      title: '写一篇周报',
      description: '从要点生成正式周报',
      prompt: '帮我写一份本周个人开发周报，突出 Chat 模块进展',
    },
    {
      id: 'creative-2',
      title: '方案润色',
      description: '让文字更有条理',
      prompt: '帮我润色一段技术方案，让结构更清晰、语气更专业',
    },
    {
      id: 'creative-3',
      title: '起个标题',
      description: '多方案备选',
      prompt: '为「本地 AI 工作区上线」这篇更新日志想 5 个标题',
    },
    {
      id: 'creative-4',
      title: '长文拆解',
      description: '把长文拆成大纲',
      prompt: '把一篇技术长文拆解成带要点的写作大纲',
    },
  ],
};

export function modelById(id: string): ChatModelOption | undefined {
  return CHAT_MODELS.find((m) => m.id === id);
}

export function modelLabel(id: string): string {
  return modelById(id)?.label ?? id;
}

export function categoryOf(id: string): ChatModelCategory {
  return modelById(id)?.category ?? 'chat';
}

export function categoryLabel(id: string): string {
  const cat = categoryOf(id);
  return MODEL_CATEGORIES.find((c) => c.key === cat)?.label ?? '对话';
}

export function suggestionsForCategory(
  category: ChatModelCategory,
): ChatSuggestion[] {
  return SUGGESTIONS_BY_CATEGORY[category] ?? SUGGESTIONS_BY_CATEGORY.chat;
}

/** 输出模式 → 模型类别映射（模型能力与创作控制台联动） */
export const MODE_CATEGORY: Record<ChatOutputMode, ChatModelCategory> = {
  chat: 'chat',
  writing: 'creative',
  code: 'code',
  image: 'image',
};

/** 输出模式推荐模型：同类别可用模型中默认收藏优先 */
export function recommendedModelForMode(
  mode: ChatOutputMode,
): ChatModelOption | undefined {
  const cat = MODE_CATEGORY[mode];
  const pool = CHAT_MODELS.filter((m) => m.category === cat && m.available);
  return pool.find((m) => m.favorite) ?? pool[0];
}

/**
 * 欢迎态建议任务：输出模式优先；对话模式回退到模型类别
 * （保证「切换输出模式 → 建议任务联动」，同时保留按模型类别的既有行为）
 */
export function suggestionsForDisplay(
  mode: ChatOutputMode,
  category: ChatModelCategory,
): ChatSuggestion[] {
  const source = mode === 'chat' ? category : MODE_CATEGORY[mode];
  return SUGGESTIONS_BY_CATEGORY[source] ?? SUGGESTIONS_BY_CATEGORY.chat;
}

/** 输出模式所属模型类别 */
export function modeCategory(mode: ChatOutputMode): ChatModelCategory {
  return MODE_CATEGORY[mode];
}
