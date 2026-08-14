import { randomUUID } from 'node:crypto';

/** Chat 内容域的业务限制（个人使用规模） */
export const CHAT_LIMITS = {
  /** 会话标题最大长度 */
  TITLE_MAX: 200,
  /** 会话系统提示词最大长度 */
  SYSTEM_PROMPT_MAX: 4_000,
  /** 单条消息最大长度 */
  MESSAGE_CONTENT_MAX: 20_000,
  /** 单个会话最大消息数 */
  MESSAGES_PER_CONVERSATION: 500,
  /** 引用摘录最大长度 */
  QUOTE_EXCERPT_MAX: 200,
  /** 生成任务携带的历史消息条数上限 */
  HISTORY_MAX_MESSAGES: 20,
  /** 生成任务携带的历史文本总长上限 */
  HISTORY_MAX_CHARS: 8_000,
  /** 运行失败错误信息最大长度（先脱敏再截断） */
  RUN_ERROR_MAX: 500,
} as const;

/** 生成任务限制（与 worker 侧保持一致） */
export const GENERATION_LIMITS = {
  /** 生成输出最大字符数（硬上限） */
  MAX_OUTPUT_CHARS: 2_000,
  /** 默认 maxTokens（mock 下按字符预算使用） */
  DEFAULT_MAX_TOKENS: 500,
  /** mock 分段数量范围 */
  MIN_SEGMENTS: 3,
  MAX_SEGMENTS: 5,
} as const;

export const AGENT_PROVIDERS = [
  'openai',
  'anthropic',
  'google',
  'openrouter',
  'siliconflow',
] as const;
export type AgentProviderName = (typeof AGENT_PROVIDERS)[number];

/** 默认对话模型：硅基流动（Web 设置页输入 key 后可用） */
export const DEFAULT_MODEL = 'Qwen/Qwen2.5-72B-Instruct';
/** 单用户部署：所有数据默认归属该 owner */
export const DEFAULT_OWNER_ID = 'me';

export const CHAT_MESSAGE_STATUSES = [
  'pending',
  'streaming',
  'completed',
  'failed',
  'cancelled',
] as const;
export type ChatMessageStatus = (typeof CHAT_MESSAGE_STATUSES)[number];

export const CHAT_RUN_STATES = [
  'queued',
  'running',
  'cancelling',
  'completed',
  'failed',
  'cancelled',
] as const;
export type ChatRunState = (typeof CHAT_RUN_STATES)[number];

export type IdPrefix =
  | 'conv'
  | 'msg'
  | 'run'
  | 'agt'
  | 'ins'
  | 'd3p'
  | 'ast'
  | 'chr'
  | 'reg'
  | 'shot'
  | 'tpl'
  | 'brf'
  | 'bmk';

/** 生成可排序的自定义字符串 ID（base36 时间前缀保证创建顺序字典序递增） */
export function newId(prefix: IdPrefix): string {
  const rand = randomUUID().replace(/-/g, '').slice(0, 12);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

/** Date → ISO 字符串（null 保留），用于响应 DTO 序列化 */
export function toIso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}
