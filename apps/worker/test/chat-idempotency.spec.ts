/**
 * Chat 生成任务幂等 / 重复消费保护测试
 *
 * 消费侧保护（service 层）：
 * - run 已 completed / cancelled → 直接跳过，不重复写回
 * - run 为 failed（上次尝试失败）→ 先清空消息已写内容再重新执行
 * 入队侧保护（jobId = runId）由 BullMQ 去重，见 api 侧 queue-contract.spec。
 */
import { describe, expect, it } from 'vitest';

import { DeterministicMockAdapter } from '../src/providers/deterministic-mock.adapter.js';
import type { ChatGenerateJobData } from '../src/providers/ai-completion.js';
import { MemoryChatStore } from '../src/jobs/chat/chat-store.js';
import { ChatCompletionService } from '../src/jobs/chat/chat-completion.service.js';

const job: ChatGenerateJobData = {
  runId: 'run_1',
  conversationId: 'conv_1',
  messageId: 'msg_1',
  provider: 'openai',
  model: 'gpt-4o-mini',
  maxTokens: 500,
  temperature: 0.7,
  systemPrompt: '你是测试助手',
  history: [{ role: 'user', content: '你好' }],
};

describe('chat 生成幂等保护', () => {
  it('重复消费：run 已 completed → 跳过，消息内容不重复追加', async () => {
    const store = new MemoryChatStore();
    store.seed({ id: 'run_1', state: 'queued' }, { id: 'msg_1' });
    const service = new ChatCompletionService(store, new DeterministicMockAdapter({ segments: 3 }));

    await service.run(job);
    const afterFirst = store.messages.get('msg_1')!.content;
    expect((await store.getRun('run_1'))!.state).toBe('completed');

    // 同一 job 再次投递（模拟 BullMQ 重复消费）：不执行
    await service.run(job);
    expect(store.messages.get('msg_1')!.content).toBe(afterFirst);
  });

  it('重复消费：run 已 cancelled → 跳过', async () => {
    const store = new MemoryChatStore();
    store.seed({ id: 'run_1', state: 'cancelled' }, { id: 'msg_1', content: '已有内容' });
    const service = new ChatCompletionService(store, new DeterministicMockAdapter({ segments: 3 }));

    await service.run(job);

    expect(store.messages.get('msg_1')!.content).toBe('已有内容');
    expect((await store.getRun('run_1'))!.state).toBe('cancelled');
  });

  it('失败重试：run 为 failed → 清空消息内容后重新执行，不产生重复文本', async () => {
    const store = new MemoryChatStore();
    store.seed({ id: 'run_1', state: 'queued' }, { id: 'msg_1' });

    // 第一次：adapter 抛可重试错误 → run failed
    const failingAdapter = {
      id: 'failing',
      complete: async () => {
        throw new Error('upstream 503');
      },
    };
    const service = new ChatCompletionService(store, failingAdapter);
    await expect(service.run(job)).rejects.toThrow();
    expect((await store.getRun('run_1'))!.state).toBe('failed');

    // 手工模拟上次尝试已写回部分内容（失败在写回中途）
    await store.appendMessageContent('msg_1', '部分残留内容');

    // 第二次（重试）：run 从 failed 恢复，先清空再执行
    const retryService = new ChatCompletionService(
      store,
      new DeterministicMockAdapter({ segments: 3 }),
    );
    await retryService.run(job);

    const run = await store.getRun('run_1');
    expect(run!.state).toBe('completed');
    const finalContent = store.messages.get('msg_1')!.content;
    expect(finalContent).toContain('[mock]');
    expect(finalContent).not.toContain('部分残留内容');
  });

  it('run 记录不存在：异常按可重试错误上抛（不静默）', async () => {
    const store = new MemoryChatStore();
    store.seed({ id: 'run_1', state: 'queued' }, { id: 'msg_1' });
    const service = new ChatCompletionService(store, new DeterministicMockAdapter({ segments: 3 }));

    await expect(service.run({ ...job, runId: 'ghost' })).rejects.toThrow();
  });
});
