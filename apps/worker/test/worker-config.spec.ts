/**
 * Worker 环境配置校验测试
 */
import { describe, expect, it } from 'vitest';

import { loadWorkerConfig, WorkerConfigError, DEFAULT_WORKER_CONFIG } from '../src/config.js';

describe('loadWorkerConfig', () => {
  it('缺省值：合法默认配置，无问题', () => {
    const { config, issues } = loadWorkerConfig({});
    expect(issues).toEqual([]);
    expect(config.mongoUri).toBe('mongodb://localhost:27017/personal_os');
    expect(config.redisUrl).toBe('redis://localhost:6379');
    expect(config.logLevel).toBe('info');
    expect(config.chatAdapter).toBe('siliconflow');
    expect(config.failurePolicy).toBe('all');
    expect(config.workflowConcurrency).toBe(DEFAULT_WORKER_CONFIG.workflowConcurrency);
    expect(config.chatConcurrency).toBe(DEFAULT_WORKER_CONFIG.chatConcurrency);
    expect(config.shutdownGraceMs).toBe(DEFAULT_WORKER_CONFIG.shutdownGraceMs);
    expect(config.workerInitTimeoutMs).toBe(DEFAULT_WORKER_CONFIG.workerInitTimeoutMs);
  });

  it('合法覆盖值被解析', () => {
    const { config, issues } = loadWorkerConfig({
      MONGODB_URI: 'mongodb+srv://user:pass@cluster.example/personal_os',
      REDIS_URL: 'rediss://redis.example:6379',
      LOG_LEVEL: 'debug',
      CHAT_ADAPTER: 'deterministic-mock',
      WORKER_FAILURE_POLICY: 'partial',
      WORKER_CONCURRENCY: '8',
      CHAT_CONCURRENCY: '3',
      WORKER_SHUTDOWN_GRACE_MS: '15000',
      WORKER_INIT_TIMEOUT_MS: '5000',
      WORKER_REDIS_CONNECT_TIMEOUT_MS: '3000',
      WORKER_MONGO_CONNECT_TIMEOUT_MS: '2000',
    });
    expect(issues).toEqual([]);
    expect(config.mongoUri).toBe('mongodb+srv://user:pass@cluster.example/personal_os');
    expect(config.redisUrl).toBe('rediss://redis.example:6379');
    expect(config.logLevel).toBe('debug');
    expect(config.chatAdapter).toBe('deterministic-mock');
    expect(config.failurePolicy).toBe('partial');
    expect(config.workflowConcurrency).toBe(8);
    expect(config.chatConcurrency).toBe(3);
    expect(config.shutdownGraceMs).toBe(15000);
    expect(config.workerInitTimeoutMs).toBe(5000);
  });

  it('非法配置：列出全部问题并拒绝启动', () => {
    const { issues } = loadWorkerConfig({
      MONGODB_URI: 'mysql://localhost:3306/db',
      REDIS_URL: 'amqp://localhost:5672',
      LOG_LEVEL: 'verbose',
      CHAT_ADAPTER: 'openai',
      WORKER_FAILURE_POLICY: 'maybe',
      WORKER_CONCURRENCY: 'abc',
      CHAT_CONCURRENCY: '-1',
      WORKER_SHUTDOWN_GRACE_MS: '0',
    });
    const keys = issues.map((i) => i.key).sort();
    expect(keys).toEqual(
      [
        'CHAT_ADAPTER',
        'CHAT_CONCURRENCY',
        'LOG_LEVEL',
        'MONGODB_URI',
        'REDIS_URL',
        'WORKER_CONCURRENCY',
        'WORKER_FAILURE_POLICY',
        'WORKER_SHUTDOWN_GRACE_MS',
      ].sort(),
    );
  });

  it('WorkerConfigError 消息包含问题清单', () => {
    const { issues } = loadWorkerConfig({ REDIS_URL: 'amqp://x' });
    const error = new WorkerConfigError(issues);
    expect(error.message).toContain('REDIS_URL');
    expect(error.message).toContain('非法 Redis URI');
  });

  it('非法 MONGODB_URI / REDIS_URL 单独命中', () => {
    expect(loadWorkerConfig({ MONGODB_URI: 'not-a-uri' }).issues.map((i) => i.key)).toEqual([
      'MONGODB_URI',
    ]);
    expect(loadWorkerConfig({ REDIS_URL: '' }).issues.map((i) => i.key)).toEqual(['REDIS_URL']);
  });
});
