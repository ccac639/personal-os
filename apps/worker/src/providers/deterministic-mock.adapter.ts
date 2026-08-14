import { GENERATION_LIMITS } from './ai-completion.js';
import type { AICompletionAdapter, CompletionResult, CompletionSegment } from './ai-completion.js';

/** 确定性 mock 回复模板：镜像输入结构，便于端到端断言 */
function buildMockReply(
  systemPrompt: string,
  history: Array<{ role: string; content: string }>,
  maxChars: number,
): string {
  const lines: string[] = [];
  lines.push('[mock] 这是 deterministic 模拟回复（未调用任何真实 AI 服务）。');
  lines.push(
    `收到系统提示词：${systemPrompt.trim() ? `“${systemPrompt.trim().slice(0, 40)}”` : '（空）'}`,
  );
  lines.push(`收到历史消息 ${history.length} 条：`);
  history.forEach((m, i) => {
    const preview = m.content.replace(/\s+/g, ' ').slice(0, 30);
    lines.push(`${i + 1}. ${m.role}: ${preview}`);
  });
  lines.push('结论：本回复由 DeterministicMockAdapter 生成，可按分片写入以模拟流式输出。');
  const joined = lines.join('\n');
  return joined.length > maxChars ? joined.slice(0, maxChars) : joined;
}

/**
 * 默认补全适配器：确定性 mock。
 * - 同一输入永远产生相同输出（无随机）；
 * - 输出按固定分片数切分（3-5 段），模拟流式；
 * - 纯本地计算，不发起任何网络请求。
 */
export class DeterministicMockAdapter implements AICompletionAdapter {
  readonly id = 'deterministic-mock';

  constructor(private readonly options: { segments?: number; seed?: string } = {}) {}

  async complete(
    input: {
      systemPrompt: string;
      history: Array<{ role: string; content: string }>;
      options: { maxChars: number; temperature: number };
    },
    signal?: AbortSignal,
  ): Promise<CompletionResult> {
    // 协作式中止：任务超时/关闭时不再产出结果（测试「超时后无后台写入」依赖此检查）
    if (signal?.aborted) {
      throw new DOMException('deterministic-mock aborted', 'AbortError');
    }
    const maxChars = Math.min(
      Math.max(1, input.options.maxChars),
      GENERATION_LIMITS.MAX_OUTPUT_CHARS,
    );
    const text = buildMockReply(input.systemPrompt, input.history, maxChars);
    const requested = this.options.segments ?? GENERATION_LIMITS.MIN_SEGMENTS;
    const segmentCount = Math.min(
      GENERATION_LIMITS.MAX_SEGMENTS,
      Math.max(GENERATION_LIMITS.MIN_SEGMENTS, requested),
    );
    const segments: CompletionSegment[] = this.splitInto(text, segmentCount);
    const totalTokens = Math.ceil(text.length / 4);
    const result: CompletionResult = {
      segments,
      totalTokens,
      model: 'deterministic-mock',
      provider: 'mock',
    };
    // 模拟异步 I/O 边界（保持接口契约真实）；abort 期间同样立即停止
    await Promise.resolve();
    if (signal?.aborted) {
      throw new DOMException('deterministic-mock aborted', 'AbortError');
    }
    return result;
  }

  private splitInto(text: string, count: number): CompletionSegment[] {
    const size = Math.max(1, Math.ceil(text.length / count));
    const segments: CompletionSegment[] = [];
    for (let i = 0; i < count; i += 1) {
      const chunk = text.slice(i * size, (i + 1) * size);
      if (!chunk) break;
      segments.push({ index: i, text: chunk, tokenCount: Math.ceil(chunk.length / 4) });
    }
    return segments;
  }
}
