import type {
  AICompletionAdapter,
  CompletionResult,
  CompletionSegment,
} from '../../providers/ai-completion.js';
import type { ChatGenerateJobData } from '@personal-os/queue-contract';
import { classifyProviderError } from '../../providers/errors.js';
import { WorkerError } from '../../errors/worker-errors.js';
import type { ChatStore, RunPatch } from './chat-store.js';
import { redactSensitive } from './chat-security.js';

const RUN_ERROR_MAX = 500;

/** 协作式取消：处理器每段写回前检查 run 状态与 AbortSignal */
export interface ChatCompletionServiceOptions {
  /** 段间延迟（模拟流式节奏；默认 0 便于测试） */
  segmentDelayMs?: number;
  now?: () => Date;
}

/**
 * 生成任务执行器：adapter 产出分段 → 逐段写回 run/message →
 * 取消/中止检查 → 成功/失败/取消三种终态落库。
 *
 * 幂等与重试语义：
 * - 重复消费保护：run 已 completed/cancelled → 直接返回（不重复写回）；
 * - 失败重试：run 为 failed → 先清空消息已写内容再重新执行，避免追加重复；
 * - 错误上抛：adapter / 写回失败 → 落库 failed（脱敏）后抛出分类后的
 *   WorkerError，由处理器决定是否触发 BullMQ 重试。
 *
 * AbortSignal（任务 2：超时后无后台执行）：
 * - signal 传给 adapter.complete（底层请求被中断）；
 * - 每段写回前检查 signal.aborted → 立即停止（不再追加消息内容），
 *   落库 failed 终态后抛可重试超时错误；
 * - 无法可靠中止的执行器不允许自动重试（见 registration.withJobTimeout）。
 */
export class ChatCompletionService {
  constructor(
    private readonly store: ChatStore,
    private readonly adapter: AICompletionAdapter,
    private readonly options: ChatCompletionServiceOptions = {},
  ) {}

  async run(data: ChatGenerateJobData, signal?: AbortSignal): Promise<void> {
    // 幂等/重复消费保护
    const current = await this.store.getRun(data.runId);
    if (current) {
      if (current.state === 'completed' || current.state === 'cancelled') return;
      if (current.state === 'cancelling') {
        // 消费前已被取消：不再启动生成，直接落 cancelled 终态
        await this.finishCancelled(data, [], '', this.options.now?.() ?? new Date());
        return;
      }
      if (current.state === 'failed') {
        // 上次尝试失败（可重试错误）：清空已写内容，防止重试重复追加
        await this.store.resetMessageContent(data.messageId);
      }
    }

    // 消费前已中止（任务超时/关闭）：不再启动生成
    if (signal?.aborted) {
      await this.fail(data, new Error('生成任务已超时或中止（消费前）'));
      throw WorkerError.retryable('chat-generate 已超时或中止（消费前）');
    }

    const started = this.options.now?.() ?? new Date();
    await this.store.updateRun(data.runId, { state: 'running' });

    try {
      const result: CompletionResult = await this.adapter.complete(
        {
          systemPrompt: data.systemPrompt,
          history: data.history,
          options: { maxChars: data.maxTokens, temperature: data.temperature },
        },
        signal,
      );

      const segments: CompletionSegment[] = [];
      let content = '';
      const totalSegments = result.segments.length;

      for (const segment of result.segments) {
        // 取消检查（DB 状态）
        if (await this.isCancelled(data.runId)) {
          await this.finishCancelled(data, segments, content, started);
          return;
        }
        // 中止检查（任务超时/关闭）：立即停止，不再写回任何内容
        if (signal?.aborted) {
          throw WorkerError.retryable('chat-generate 已超时或中止（写回前检测）');
        }
        if (this.options.segmentDelayMs && this.options.segmentDelayMs > 0) {
          await sleep(this.options.segmentDelayMs);
        }
        segments.push(segment);
        content += segment.text;
        await this.store.updateRun(data.runId, {
          meta: {
            segments: [...segments],
            totalSegments,
            model: result.model,
            provider: result.provider,
          },
        });
        await this.store.appendMessageContent(data.messageId, segment.text);
      }

      if (await this.isCancelled(data.runId)) {
        await this.finishCancelled(data, segments, content, started);
        return;
      }

      const durationMs = elapsed(started, this.options.now?.());
      await this.store.updateRun(data.runId, {
        state: 'completed',
        meta: {
          segments,
          totalSegments,
          totalTokens: result.totalTokens,
          model: result.model,
          provider: result.provider,
          durationMs,
        },
      });
      await this.store.setMessageStatus(data.messageId, 'completed');
    } catch (err) {
      // 失败恢复：落库 failed（先脱敏再截断），错误上抛由处理器决定重试
      await this.fail(data, err);
      throw classifyProviderError(err, { provider: data.provider, model: data.model });
    }
  }

  private async finishCancelled(
    data: ChatGenerateJobData,
    segments: CompletionSegment[],
    content: string,
    started: Date,
  ): Promise<void> {
    // 已写回的部分保留在消息中，run 置为 cancelled
    const durationMs = elapsed(started, this.options.now?.());
    await this.store.updateRun(data.runId, {
      state: 'cancelled',
      meta: { segments, totalSegments: segments.length, cancelled: true, durationMs },
    });
    await this.store.setMessageStatus(data.messageId, 'cancelled');
    void content;
  }

  private async fail(data: ChatGenerateJobData, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : '未知错误';
    const patch: RunPatch = {
      state: 'failed',
      meta: { error: redactSensitive(message).slice(0, RUN_ERROR_MAX) },
    };
    try {
      await this.store.updateRun(data.runId, patch);
      await this.store.setMessageStatus(data.messageId, 'failed');
    } catch {
      // 终态写回失败时静默（避免处理器重试风暴）
    }
  }

  private async isCancelled(runId: string): Promise<boolean> {
    const run = await this.store.getRun(runId);
    return run?.state === 'cancelling' || run?.state === 'cancelled';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function elapsed(started: Date, now?: Date): number {
  const end = now ?? new Date();
  return Math.max(0, end.getTime() - started.getTime());
}
