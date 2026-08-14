import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { REDIS_CLIENT } from '../../common/redis/redis.module.js';
import { SILICONFLOW_API_KEY_REDIS_KEY, SILICONFLOW_KEY_TTL_SECONDS } from './ai.constants.js';
import { errKeyNotConfigured } from './ai.errors.js';

/**
 * SiliconFlow API Key 管理：
 * - Web 设置页输入 → 写入 Redis（TTL 30 天），不落 .env / 数据库明文；
 * - 前端仅能查询「是否已配置」，key 本身永不回显；
 * - 所有 AI 生成端点先 assertConfigured()，未配置直接 400。
 */
@Injectable()
export class AiSettingsService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async getKey(): Promise<string | null> {
    return this.redis.get(SILICONFLOW_API_KEY_REDIS_KEY);
  }

  async isConfigured(): Promise<boolean> {
    return (await this.getKey()) !== null;
  }

  async saveKey(apiKey: string): Promise<void> {
    await this.redis.set(SILICONFLOW_API_KEY_REDIS_KEY, apiKey, 'EX', SILICONFLOW_KEY_TTL_SECONDS);
  }

  async clearKey(): Promise<void> {
    await this.redis.del(SILICONFLOW_API_KEY_REDIS_KEY);
  }

  /** 校验已配置并返回 key；未配置抛 400 AI_KEY_NOT_CONFIGURED */
  async assertConfigured(): Promise<string> {
    const key = await this.getKey();
    if (!key) throw errKeyNotConfigured();
    return key;
  }
}
