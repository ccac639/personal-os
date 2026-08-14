import { Inject, Injectable, Optional } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import type { Redis } from 'ioredis';

import { REDIS_CLIENT } from '../redis/redis.module.js';
import { MetricsService, type MetricsSnapshot } from '../metrics/metrics.service.js';
import {
  HEALTH_CONTRIBUTORS,
  type HealthCheckResult,
  type HealthContributor,
  type ReadyResponse,
  runContributorWithTimeout,
} from './health-contributor.js';

export interface HealthResponse {
  status: 'ok';
  version: string;
  time: string;
  services: {
    api: 'up';
    mongo: 'up' | 'down';
    redis: 'up' | 'down';
  };
  /** 轻量请求指标快照（MetricsService 注入时提供；未装配时省略） */
  metrics?: MetricsSnapshot;
}

/** 内置依赖检查：mongo（mongoose readyState）与 redis（ioredis status） */
function dependencyContributors(connection?: Connection, redis?: Redis): HealthContributor[] {
  return [
    {
      id: 'mongo',
      check: () => ({
        id: 'mongo',
        status: connection
          ? connection.readyState === 1
            ? ('up' as const)
            : ('down' as const)
          : ('not_configured' as const),
        durationMs: 0,
        ...(connection ? {} : { errorCategory: 'NOT_CONFIGURED' as const }),
      }),
    },
    {
      id: 'redis',
      check: () => ({
        id: 'redis',
        status: redis
          ? redis.status === 'ready'
            ? ('up' as const)
            : ('down' as const)
          : ('not_configured' as const),
        durationMs: 0,
        ...(redis ? {} : { errorCategory: 'NOT_CONFIGURED' as const }),
      }),
    },
  ];
}

/**
 * 健康检查服务：
 * - check()：存活探针（/api/health），仅暴露状态，不返回 URI / 密钥 / 诊断信息
 * - ready()：就绪检查（/api/ready），内置 mongo/redis 检查 + 业务 contributor
 *   （带超时保护，超时记 TIMEOUT；未注入依赖记 not_configured，不误报故障）
 */
@Injectable()
export class HealthService {
  private readonly builtinContributors: HealthContributor[];

  constructor(
    @Optional() @Inject(getConnectionToken()) private readonly connection?: Connection,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
    @Optional()
    @Inject(HEALTH_CONTRIBUTORS)
    private readonly contributors: HealthContributor[] = [],
    @Optional() private readonly metrics?: MetricsService,
  ) {
    this.builtinContributors = dependencyContributors(this.connection, this.redis);
  }

  check(version: string): HealthResponse {
    const response: HealthResponse = {
      status: 'ok',
      version,
      time: new Date().toISOString(),
      services: {
        api: 'up',
        mongo: this.connection?.readyState === 1 ? 'up' : 'down',
        redis: this.redis?.status === 'ready' ? 'up' : 'down',
      },
    };
    if (this.metrics) {
      response.metrics = this.metrics.snapshot();
    }
    return response;
  }

  /** 就绪检查：所有检查项 up → ready，否则 not_ready（每项带超时保护） */
  async ready(version: string, timeoutMs: number): Promise<ReadyResponse> {
    const checks: HealthCheckResult[] = [];
    for (const contributor of [...this.builtinContributors, ...this.contributors]) {
      checks.push(await runContributorWithTimeout(contributor, timeoutMs));
    }
    return {
      status: checks.every((check) => check.status === 'up') ? 'ready' : 'not_ready',
      version,
      time: new Date().toISOString(),
      checks,
    };
  }
}
