/**
 * Worker 侧队列契约测试（与 apps/api/test/queue-contract.spec.ts 对称）。
 *
 * 契约单一事实来源：packages/queue-contract（@personal-os/queue-contract）。
 * 本测试保证：
 * - Worker 消费的队列名/任务名常量与 QUEUE_CONTRACT 一致（禁止硬编码漂移）；
 * - 契约条目字段完整（attempts/backoffMs/timeoutMs/清理参数/并发/锁），
 *   供 api 入队侧与 worker 消费侧共享同一来源；
 * - 队列名/任务名满足 kebab-case 约定（Redis key 与日志可读性）。
 */
import { describe, expect, it } from 'vitest';

import {
  QUEUE_CONTRACT,
  WORKFLOW_RUN_QUEUE,
  WORKFLOW_RUN_JOB,
  CHAT_QUEUE_NAME,
  CHAT_JOB_NAME,
  SILICONFLOW_API_KEY_REDIS_KEY,
  RETRY_AFTER_MIN_MS,
  RETRY_AFTER_MAX_MS,
} from '@personal-os/queue-contract';

const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe('队列契约：worker 侧常量与共享契约一致', () => {
  it('workflow-runs 队列名/任务名常量 = QUEUE_CONTRACT 值', () => {
    expect(WORKFLOW_RUN_QUEUE).toBe(QUEUE_CONTRACT.workflowRuns.queue);
    expect(WORKFLOW_RUN_JOB).toBe(QUEUE_CONTRACT.workflowRuns.job);
  });

  it('chat-generation 队列名/任务名常量 = QUEUE_CONTRACT 值', () => {
    expect(CHAT_QUEUE_NAME).toBe(QUEUE_CONTRACT.chatGeneration.queue);
    expect(CHAT_JOB_NAME).toBe(QUEUE_CONTRACT.chatGeneration.job);
  });

  it('两端共享的 API Key Redis 键非空字符串', () => {
    expect(typeof SILICONFLOW_API_KEY_REDIS_KEY).toBe('string');
    expect(SILICONFLOW_API_KEY_REDIS_KEY.length).toBeGreaterThan(0);
  });

  it('retry-after 上下限为正数且 min < max', () => {
    expect(RETRY_AFTER_MIN_MS).toBeGreaterThan(0);
    expect(RETRY_AFTER_MAX_MS).toBeGreaterThan(RETRY_AFTER_MIN_MS);
  });
});

describe('队列契约：条目字段完整（api 入队侧与 worker 消费侧共享）', () => {
  it('workflowRuns 条目字段齐全且合法', () => {
    const entry = QUEUE_CONTRACT.workflowRuns;
    expect(KEBAB_RE.test(entry.queue)).toBe(true);
    expect(KEBAB_RE.test(entry.job)).toBe(true);
    expect(entry.attempts).toBeGreaterThanOrEqual(1);
    expect(entry.backoffMs).toBeGreaterThan(0);
    expect(entry.timeoutMs).toBeGreaterThan(0);
    expect(entry.removeOnComplete).toBeDefined();
    expect(entry.removeOnFail).toBeDefined();
    expect(entry.concurrency).toBeGreaterThanOrEqual(1);
    expect(entry.lockDurationMs).toBeGreaterThan(0);
    expect(entry.stalledIntervalMs).toBeGreaterThan(0);
  });

  it('chatGeneration 条目字段齐全且合法', () => {
    const entry = QUEUE_CONTRACT.chatGeneration;
    expect(KEBAB_RE.test(entry.queue)).toBe(true);
    expect(KEBAB_RE.test(entry.job)).toBe(true);
    expect(entry.attempts).toBeGreaterThanOrEqual(1);
    expect(entry.backoffMs).toBeGreaterThan(0);
    expect(entry.timeoutMs).toBeGreaterThan(0);
    expect(entry.removeOnComplete).toBeDefined();
    expect(entry.removeOnFail).toBeDefined();
    expect(entry.concurrency).toBeGreaterThanOrEqual(1);
    expect(entry.lockDurationMs).toBeGreaterThan(0);
    expect(entry.stalledIntervalMs).toBeGreaterThan(0);
  });
});

describe('队列契约：禁止硬编码（队列名唯一来源）', () => {
  it('worker 与 api 不得硬编码队列名（契约包为唯一来源）', async () => {
    // 扫描 worker 与 api 源码：队列名字符串字面量不得出现
    // （queue 名必须来自 @personal-os/queue-contract）
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = process.cwd();
    const dirs = [path.join(root, 'src'), path.resolve(root, '../api/src')];
    const hardcoded: string[] = [];
    const RE = /['"`](workflow-runs|chat-generation)['"`]/g;

    for (const dir of dirs) {
      const walk = (d: string): void => {
        for (const name of fs.readdirSync(d)) {
          const full = path.join(d, name);
          const stat = fs.statSync(full);
          if (stat.isDirectory()) {
            walk(full);
          } else if (name.endsWith('.ts')) {
            // 剥离注释（块注释 + 行注释）：注释中引用队列名是可读性说明，
            // 只有代码中的字面量才算硬编码
            const raw = fs.readFileSync(full, 'utf8');
            const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
            for (const m of code.matchAll(RE)) {
              hardcoded.push(`${path.relative(root, full)}: "${m[1]}"`);
            }
          }
        }
      };
      walk(dir);
    }

    expect(hardcoded).toEqual([]);
  });
});
