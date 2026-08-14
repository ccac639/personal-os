/**
 * Sub2API 连接设置存储（Redis，TTL 30 天）：
 * - Base URL / 管理端凭据（Bearer token）/ 请求超时 / 自动刷新偏好；
 * - 凭据绝不写入 Mongo 明文、.env、日志或前端 localStorage；
 * - 前端只能查询「是否已配置」与掩码值，token 永不回显；
 * - 未配置时抛稳定错误码 SUB2API_NOT_CONFIGURED。
 */
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { REDIS_CLIENT } from '../../common/redis/redis.module.js';
import { errNotConfigured } from './errors/sub2api.errors.js';

export const SUB2API_SETTINGS_TTL_SECONDS = 60 * 60 * 24 * 30;

/** Redis 键名（与 ai 模块同约定：小写冒号分隔） */
export const SUB2API_REDIS_KEYS = {
  baseUrl: 'sub2api:base_url',
  apiToken: 'sub2api:api_token',
  timeoutMs: 'sub2api:timeout_ms',
  autoRefresh: 'sub2api:auto_refresh',
  refreshIntervalSec: 'sub2api:refresh_interval_sec',
  upstreamVersion: 'sub2api:upstream_version',
} as const;

export const SUB2API_DEFAULTS = {
  timeoutMs: 15_000,
  autoRefresh: false,
  refreshIntervalSec: 60,
} as const;

export interface Sub2ApiConnectionConfig {
  baseUrl: string;
  apiToken: string;
  timeoutMs: number;
}

export interface Sub2ApiSettingsSnapshot {
  configured: boolean;
  /** 掩码后的 Base URL（sk-*** 风格），token 永不出现 */
  baseUrlMasked: string | null;
  timeoutMs: number;
  autoRefresh: boolean;
  refreshIntervalSec: number;
  /** 最近一次成功连接测试缓存的上游版本（可选） */
  upstreamVersion: string | null;
}

export interface Sub2ApiSettingsInput {
  baseUrl?: string;
  apiToken?: string;
  timeoutMs?: number;
  autoRefresh?: boolean;
  refreshIntervalSec?: number;
}

@Injectable()
export class Sub2ApiSettingsService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async isConfigured(): Promise<boolean> {
    return (await this.redis.get(SUB2API_REDIS_KEYS.baseUrl)) !== null;
  }

  /** 读取连接配置；未配置抛 SUB2API_NOT_CONFIGURED */
  async assertConfig(): Promise<Sub2ApiConnectionConfig> {
    const [baseUrl, apiToken] = await Promise.all([
      this.redis.get(SUB2API_REDIS_KEYS.baseUrl),
      this.redis.get(SUB2API_REDIS_KEYS.apiToken),
    ]);
    if (!baseUrl || !apiToken) throw errNotConfigured();
    const rawTimeout = await this.redis.get(SUB2API_REDIS_KEYS.timeoutMs);
    const timeoutMs = parsePositiveInt(rawTimeout, SUB2API_DEFAULTS.timeoutMs);
    return { baseUrl, apiToken, timeoutMs };
  }

  /** 读取掩码快照（供设置页 / 概览展示，token 不回显） */
  async getSnapshot(): Promise<Sub2ApiSettingsSnapshot> {
    const [baseUrl, autoRefresh, rawInterval, version] = await Promise.all([
      this.redis.get(SUB2API_REDIS_KEYS.baseUrl),
      this.redis.get(SUB2API_REDIS_KEYS.autoRefresh),
      this.redis.get(SUB2API_REDIS_KEYS.refreshIntervalSec),
      this.redis.get(SUB2API_REDIS_KEYS.upstreamVersion),
    ]);
    return {
      configured: baseUrl !== null,
      baseUrlMasked: baseUrl ? maskBaseUrl(baseUrl) : null,
      timeoutMs: parsePositiveInt(
        await this.redis.get(SUB2API_REDIS_KEYS.timeoutMs),
        SUB2API_DEFAULTS.timeoutMs,
      ),
      autoRefresh: autoRefresh === '1',
      refreshIntervalSec: parsePositiveInt(rawInterval, SUB2API_DEFAULTS.refreshIntervalSec),
      upstreamVersion: version ?? null,
    };
  }

  /** 保存设置（部分更新；token 传空串视为不修改） */
  async save(input: Sub2ApiSettingsInput): Promise<void> {
    const ttl = SUB2API_SETTINGS_TTL_SECONDS;
    if (input.baseUrl !== undefined) {
      await this.redis.set(SUB2API_REDIS_KEYS.baseUrl, input.baseUrl, 'EX', ttl);
    }
    if (input.apiToken !== undefined && input.apiToken !== '') {
      await this.redis.set(SUB2API_REDIS_KEYS.apiToken, input.apiToken, 'EX', ttl);
    }
    if (input.timeoutMs !== undefined) {
      await this.redis.set(SUB2API_REDIS_KEYS.timeoutMs, String(input.timeoutMs), 'EX', ttl);
    }
    if (input.autoRefresh !== undefined) {
      await this.redis.set(
        SUB2API_REDIS_KEYS.autoRefresh,
        input.autoRefresh ? '1' : '0',
        'EX',
        ttl,
      );
    }
    if (input.refreshIntervalSec !== undefined) {
      await this.redis.set(
        SUB2API_REDIS_KEYS.refreshIntervalSec,
        String(input.refreshIntervalSec),
        'EX',
        ttl,
      );
    }
  }

  /** 缓存最近一次连接测试拿到的上游版本（仅做展示，不阻塞） */
  async cacheUpstreamVersion(version: string): Promise<void> {
    await this.redis.set(
      SUB2API_REDIS_KEYS.upstreamVersion,
      version,
      'EX',
      SUB2API_SETTINGS_TTL_SECONDS,
    );
  }

  /** 危险区：清除全部连接配置 */
  async clearAll(): Promise<void> {
    await this.redis.del(
      SUB2API_REDIS_KEYS.baseUrl,
      SUB2API_REDIS_KEYS.apiToken,
      SUB2API_REDIS_KEYS.timeoutMs,
      SUB2API_REDIS_KEYS.autoRefresh,
      SUB2API_REDIS_KEYS.refreshIntervalSec,
      SUB2API_REDIS_KEYS.upstreamVersion,
    );
  }
}

function parsePositiveInt(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

/** Base URL 掩码：保留协议与主机，路径打码 */
function maskBaseUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    const host = url.host;
    return `${url.protocol}//${host}${url.pathname.length > 1 ? '/***' : ''}`;
  } catch {
    return '***';
  }
}
