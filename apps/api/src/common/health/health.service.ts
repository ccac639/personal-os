import { Inject, Injectable, Optional } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import type { Redis } from 'ioredis';

import { REDIS_CLIENT } from '../redis/redis.module.js';

export interface HealthResponse {
  status: 'ok';
  version: string;
  time: string;
  services: {
    api: 'up';
    mongo: 'up' | 'down';
    redis: 'up' | 'down';
  };
}

/**
 * 健康检查服务：
 * - mongo：mongoose 连接 readyState === 1（已连接）视为 up
 * - redis：ioredis 连接状态 'ready' 视为 up
 * - 仅暴露状态，不返回 URI / 密钥 / 诊断信息
 */
@Injectable()
export class HealthService {
  constructor(
    @Optional() @Inject(getConnectionToken()) private readonly connection?: Connection,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  check(version: string): HealthResponse {
    return {
      status: 'ok',
      version,
      time: new Date().toISOString(),
      services: {
        api: 'up',
        mongo: this.connection?.readyState === 1 ? 'up' : 'down',
        redis: this.redis?.status === 'ready' ? 'up' : 'down',
      },
    };
  }
}
