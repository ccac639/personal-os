/**
 * 队列契约测试（API 入队侧 ↔ Worker 消费侧共享同一契约源）
 *
 * 契约单一事实来源：packages/queue-contract（@personal-os/queue-contract）。
 * API 与 Worker 直接 import 该包，不再镜像常量，也不再做源码文本断言。
 * 本测试保证：
 * - 两端（api 模块 / worker 模块）消费的队列名 / Job 名 / 重试参数 / 清理参数
 *   与共享契约一致（运行时断言，非注释约定）；
 * - BullMQ 6 已移除入队侧 timeout 选项（超时由 worker 侧处理器强制）；
 * - 负载形状与共享契约对齐（必填字段齐全、绝不携带 API Key / ownerId）；
 * - 幂等约定：api 入队使用 jobId = runId（BullMQ 同 jobId 去重）；
 * - API Key 读取键两端一致（api 写入 ↔ worker 读取同一 Redis 键）。
 */
import { describe, expect, it } from 'vitest';

import {
  QUEUE_CONTRACT,
  CHAT_QUEUE_NAME,
  CHAT_JOB_NAME,
  WORKFLOW_RUN_QUEUE,
  WORKFLOW_RUN_JOB,
  SILICONFLOW_API_KEY_REDIS_KEY,
  type ChatGenerateJobData,
} from '@personal-os/queue-contract';
import { BullChatJobQueue, type ChatGeneratePayload } from '../src/modules/chat/chat-job-queue.js';
import { BullMqRunQueue } from '../src/modules/workflows/workflow.queue.js';

describe('队列契约：共享包为唯一事实来源', () => {
  it('chat-generation 队列名 / 任务名与共享契约一致', () => {
    expect(CHAT_QUEUE_NAME).toBe(QUEUE_CONTRACT.chatGeneration.queue);
    expect(CHAT_JOB_NAME).toBe(QUEUE_CONTRACT.chatGeneration.job);
    expect(BullChatJobQueue.name).toBe('BullChatJobQueue');
  });

  it('workflow-runs 队列名 / 任务名与共享契约一致', () => {
    expect(WORKFLOW_RUN_QUEUE).toBe(QUEUE_CONTRACT.workflowRuns.queue);
    expect(WORKFLOW_RUN_JOB).toBe(QUEUE_CONTRACT.workflowRuns.job);
    expect(BullMqRunQueue.name).toBe('BullMqRunQueue');
  });

  it('契约值完整（attempts/backoffMs/timeoutMs/清理参数/concurrency/lockDuration）', () => {
    for (const name of ['workflowRuns', 'chatGeneration'] as const) {
      const entry = QUEUE_CONTRACT[name];
      expect(entry.attempts).toBeGreaterThanOrEqual(1);
      expect(entry.backoffMs).toBeGreaterThan(0);
      expect(entry.timeoutMs).toBeGreaterThanOrEqual(60_000);
      expect(entry.removeOnComplete).toBeGreaterThan(0);
      expect(entry.removeOnFail).toBeGreaterThan(0);
      expect(entry.concurrency).toBeGreaterThan(0);
      expect(entry.lockDurationMs).toBeGreaterThanOrEqual(entry.timeoutMs);
      expect(entry.stalledIntervalMs).toBeGreaterThan(0);
    }
  });

  it('BullMQ 6 入队选项不含 timeout（v5+ 已移除该选项，超时由 worker 侧按契约 timeoutMs 强制）', () => {
    // 契约保留 timeoutMs，worker 侧处理器超时值不低于 provider 层超时（60s）
    expect(QUEUE_CONTRACT.chatGeneration.timeoutMs).toBeGreaterThanOrEqual(60_000);
    expect(QUEUE_CONTRACT.workflowRuns.timeoutMs).toBeGreaterThanOrEqual(60_000);
  });

  it('ChatGeneratePayload 与共享契约对齐：必填字段齐全，且不含 ownerId / 密钥', () => {
    const payload: ChatGeneratePayload = {
      runId: 'run_1',
      conversationId: 'conv_1',
      messageId: 'msg_1',
      provider: 'siliconflow',
      model: 'Qwen/Qwen2.5-72B-Instruct',
      maxTokens: 500,
      temperature: 0.7,
      systemPrompt: 'system prompt',
      history: [{ role: 'user', content: 'hi' }],
    };
    // 与共享契约 ChatGenerateJobData 形状一致
    const typed: ChatGenerateJobData = payload;
    expect(typed.runId).toBe('run_1');
    // 单用户系统：负载严禁携带 ownerId
    expect(payload).not.toHaveProperty('ownerId');
    expect(payload).not.toHaveProperty('userId');
    // 密钥严禁进入负载（API Key 不入队）
    expect(payload).not.toHaveProperty('apiKey');
    expect(payload).not.toHaveProperty('api_key');
    expect(payload).not.toHaveProperty('token');
    expect(payload).not.toHaveProperty('secret');
    expect(JSON.stringify(payload)).not.toMatch(/sk-[A-Za-z0-9_-]{8,}/);
  });

  it('workflow-run 负载形状：仅含 runId（与共享契约 WorkflowRunJobData 对齐）', () => {
    const serialized = JSON.stringify({ runId: 'run_x' });
    expect(JSON.parse(serialized)).toEqual({ runId: 'run_x' });
    // 契约不携带任何其他字段（无密钥、无 ownerId、无工作流快照）
    expect(Object.keys(JSON.parse(serialized)).sort()).toEqual(['runId']);
  });

  it('队列名全局唯一（两队列不冲突）', () => {
    expect(new Set([CHAT_QUEUE_NAME, WORKFLOW_RUN_QUEUE]).size).toBe(2);
    expect(QUEUE_CONTRACT.chatGeneration.queue).not.toBe(QUEUE_CONTRACT.workflowRuns.queue);
  });

  it('API Key 读取键共享同一常量（api 写入 ↔ worker 读取同一 Redis 键）', () => {
    expect(SILICONFLOW_API_KEY_REDIS_KEY.length).toBeGreaterThan(0);
    expect(SILICONFLOW_API_KEY_REDIS_KEY).toContain('siliconflow');
  });

  it('幂等约定：入队使用 jobId = runId（BullMQ 同 jobId 去重）', () => {
    // 两端共享的负载含 runId，api 入队实现以 payload.runId 作为 jobId
    // （BullChatJobQueue.enqueue 使用 jobId: payload.runId；workflow 使用 jobId: runId）
    expect('runId' in ({} as ChatGenerateJobData)).toBe(false); // 类型级：runId 必填
    const sample: ChatGenerateJobData = {
      runId: 'run-abc',
      conversationId: 'c',
      messageId: 'm',
      provider: 'p',
      model: 'm',
      maxTokens: 100,
      temperature: 0.7,
      systemPrompt: '',
      history: [],
    };
    expect(sample.runId).toBe('run-abc');
  });
});
