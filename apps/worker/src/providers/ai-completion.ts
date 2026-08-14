/**
 * AI 补全适配器契约（Chat 内容域 Worker 侧）。
 *
 * 设计约定：
 * - 输入仅含文本快照（systemPrompt + history），绝不携带任何密钥或二进制；
 * - 输出为分段文本，由处理器按段写回 message/run，模拟流式；
 * - 未来 OpenAI / Anthropic / Google / OpenRouter 适配器实现同一接口，
 *   通过工厂按环境变量选择，不修改处理器代码；
 * - complete 接受 AbortSignal：超时/关闭时由 withJobTimeout 触发 abort，
 *   适配器必须尽快停止底层请求（无法可靠中止的执行器不允许自动重试）。
 */
import { CHAT_QUEUE_NAME, CHAT_JOB_NAME } from '@personal-os/queue-contract';

export type { ChatGenerateJobData } from '@personal-os/queue-contract';

export interface CompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  /** 输出字符预算（由调用方按 maxTokens 折算并钳制） */
  maxChars: number;
  temperature: number;
}

export interface CompletionSegment {
  index: number;
  text: string;
  tokenCount?: number;
}

export interface CompletionResult {
  segments: CompletionSegment[];
  totalTokens: number;
  model: string;
  provider: string;
}

export interface AICompletionAdapter {
  readonly id: string;
  complete(
    input: {
      systemPrompt: string;
      history: CompletionMessage[];
      options: CompletionOptions;
    },
    signal?: AbortSignal,
  ): Promise<CompletionResult>;
}

/** 生成任务硬限制（与 API 侧 GENERATION_LIMITS 保持一致） */
export const GENERATION_LIMITS = {
  MAX_OUTPUT_CHARS: 2_000,
  MIN_SEGMENTS: 3,
  MAX_SEGMENTS: 5,
} as const;

/** 队列常量（单一事实来源见 @personal-os/queue-contract） */
export { CHAT_QUEUE_NAME, CHAT_JOB_NAME };
