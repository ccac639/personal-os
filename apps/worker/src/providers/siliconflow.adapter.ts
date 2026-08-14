import OpenAI from 'openai';

import { GENERATION_LIMITS } from './ai-completion.js';
import type {
  AICompletionAdapter,
  CompletionMessage,
  CompletionResult,
  CompletionSegment,
} from './ai-completion.js';
import { classifyProviderError } from './errors.js';
import { WorkerError } from '../errors/worker-errors.js';

/** SiliconFlow OpenAI 兼容端点（官方文档 docs.siliconflow.cn） */
export const SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1';
export const SILICONFLOW_DEFAULT_MODEL = 'Qwen/Qwen2.5-72B-Instruct';

export interface SiliconFlowAdapterOptions {
  /**
   * 读取 API Key 的注入点（worker 侧从 Redis 读取，测试注入 fake）。
   * 返回 null 表示未配置——complete() 将抛出明确错误（config，不重试）。
   */
  getApiKey: () => Promise<string | null>;
  /** 对话模型（默认 Qwen2.5-72B-Instruct） */
  model?: string;
  /** 每段最大字符（按句子边界切分，模拟流式写回） */
  segmentMaxChars?: number;
  /** 最大分段数（与 GENERATION_LIMITS.MAX_SEGMENTS 对齐） */
  maxSegments?: number;
  /** 单次请求超时 ms（默认 60_000，超时按 retryable 抛出） */
  timeoutMs?: number;
  /** 测试注入 fake OpenAI 客户端 */
  client?: OpenAI;
}

/**
 * SiliconFlow 对话补全适配器（OpenAI 兼容协议）。
 *
 * 设计约定（与 ai-completion.ts 一致）：
 * - Job 输入仅含文本快照，**绝不携带 API Key**；key 通过 getApiKey 注入读取；
 * - 输出按句子边界切成 ≤ maxSegments 段，由 ChatCompletionService 逐段写回；
 * - 错误分类：未配置 key / 4xx → config（不重试）；429 → rate-limit；
 *   5xx / 网络 / 超时 → retryable（BullMQ 指数退避重试）。
 */
export class SiliconFlowCompletionAdapter implements AICompletionAdapter {
  readonly id = 'siliconflow';

  private readonly model: string;
  private readonly segmentMaxChars: number;
  private readonly maxSegments: number;
  private readonly timeoutMs: number;

  constructor(private readonly options: SiliconFlowAdapterOptions) {
    this.model = options.model ?? SILICONFLOW_DEFAULT_MODEL;
    this.segmentMaxChars = options.segmentMaxChars ?? 200;
    this.maxSegments = Math.min(
      GENERATION_LIMITS.MAX_SEGMENTS,
      Math.max(1, options.maxSegments ?? GENERATION_LIMITS.MIN_SEGMENTS),
    );
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  /** 惰性创建 OpenAI 兼容客户端：构造期不校验 key，complete() 时注入真实 key */
  private getClient(apiKey: string): OpenAI {
    if (this.options.client) return this.options.client;
    return new OpenAI({ apiKey, baseURL: SILICONFLOW_BASE_URL, timeout: this.timeoutMs });
  }

  async complete(
    input: {
      systemPrompt: string;
      history: CompletionMessage[];
      options: { maxChars: number; temperature: number };
    },
    signal?: AbortSignal,
  ): Promise<CompletionResult> {
    const apiKey = await this.options.getApiKey();
    if (!apiKey) {
      throw WorkerError.config('SiliconFlow API Key 未配置：请先在 Web「设置」页输入后重试');
    }

    const maxChars = Math.min(
      Math.max(1, input.options.maxChars),
      GENERATION_LIMITS.MAX_OUTPUT_CHARS,
    );

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      ...(input.systemPrompt.trim()
        ? ([
            { role: 'system' as const, content: input.systemPrompt },
          ] satisfies OpenAI.Chat.Completions.ChatCompletionMessageParam[])
        : []),
      ...input.history.map((m) => ({
        role:
          m.role === 'system'
            ? ('system' as const)
            : m.role === 'assistant'
              ? ('assistant' as const)
              : ('user' as const),
        content: m.content,
      })),
    ];

    // 超时（timeoutMs）与外部 abort（BullMQ 关闭/任务超时）合并为单一 signal：
    // 任一触发都会中断底层 HTTP 请求，保证超时后不再有后台执行。
    const merged = mergeSignals(signal, AbortSignal.timeout(this.timeoutMs));

    let response: OpenAI.Chat.Completions.ChatCompletion;
    try {
      // 竞速：abort（超时/关闭）立即 reject；底层 promise 由 SDK 响应 signal
      // 真正取消，或由调用方丢弃（无后台副作用，见任务 2 验收）。
      response = await raceAbort(
        this.getClient(apiKey).chat.completions.create(
          {
            model: this.model,
            messages,
            max_tokens: maxChars,
            temperature: input.options.temperature,
            stream: false,
          },
          { signal: merged },
        ),
        merged,
        `SiliconFlow 请求超时或已中止（超过 ${this.timeoutMs}ms）`,
      );
    } catch (err) {
      if (isTimeoutError(err) || merged.aborted) {
        throw WorkerError.retryable(`SiliconFlow 请求超时或已中止（超过 ${this.timeoutMs}ms）`, {
          cause: err,
        });
      }
      throw classifyProviderError(err, { provider: this.id, model: this.model });
    }

    const text = response.choices[0]?.message?.content ?? '';
    const trimmed = text.length > maxChars ? text.slice(0, maxChars) : text;

    const segments = this.splitIntoSegments(trimmed);
    return {
      segments,
      totalTokens: response.usage?.total_tokens ?? Math.ceil(trimmed.length / 4),
      model: this.model,
      provider: this.id,
    };
  }

  /** 按句子边界切段（。！？!?；;\n），超长单句按字符硬切；合并保证段数 ≤ maxSegments */
  private splitIntoSegments(text: string): CompletionSegment[] {
    if (!text) return [{ index: 0, text: '', tokenCount: 0 }];

    const parts = text.split(/(?<=[。！？!?；;\n])/).filter((p) => p.length > 0);
    const raw: string[] = [];
    let current = '';
    for (const part of parts) {
      if (current && current.length + part.length > this.segmentMaxChars) {
        raw.push(current);
        current = part;
      } else {
        current += part;
      }
    }
    if (current) raw.push(current);

    // 段数钳制：超限时从尾部合并到最后一个可容纳的段
    const segments: CompletionSegment[] = [];
    const remaining = raw.length > 0 ? [...raw] : [text];
    while (remaining.length > this.maxSegments) {
      const last = remaining.pop() ?? '';
      const prev = remaining[remaining.length - 1] ?? '';
      remaining[remaining.length - 1] = prev + last;
    }
    remaining.forEach((chunk, index) => {
      segments.push({ index, text: chunk, tokenCount: Math.ceil(chunk.length / 4) });
    });
    return segments;
  }
}

/** 超时/中止错误识别（AbortSignal.timeout 抛 DOMException TimeoutError，SDK 超时同名） */
function isTimeoutError(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const name = (err as { name?: unknown }).name;
    return (
      name === 'APITimeoutError' ||
      name === 'APIConnectionTimeoutError' ||
      name === 'TimeoutError' ||
      name === 'AbortError'
    );
  }
  return false;
}

/**
 * 合并外部 signal 与内部超时 signal：
 * - 返回的 signal 在任一来源 abort 时触发；
 * - 若外部 signal 已 aborted，立即返回已中止的合并 signal。
 */
function mergeSignals(...signals: Array<AbortSignal | undefined>): AbortSignal {
  const active = signals.filter((s): s is AbortSignal => Boolean(s));
  if (active.length === 0) return new AbortController().signal;
  if (active.some((s) => s.aborted)) return AbortSignal.abort();
  if (active.length === 1) return active[0]!;
  return AbortSignal.any(active);
}

/**
 * abort 竞速兜底：signal 中止时立即 reject（底层 promise 结果被丢弃）。
 * 真实 SDK 响应 signal 会真正取消请求；对不响应 signal 的执行器，
 * 本竞速保证调用方（ChatCompletionService）不会在超时后继续写回，
 * 从而满足「超时后无后台写入」——不能可靠中止的执行器由上层策略
 * （registration.withJobTimeout）决定不自动重试。
 */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal, message: string): Promise<T> {
  if (!signal || signal.aborted) return Promise.reject(new DOMException(message, 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException(message, 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}
