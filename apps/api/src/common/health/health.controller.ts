import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { HealthService, type HealthResponse } from './health.service.js';
import type { ReadyResponse } from './health-contributor.js';

/**
 * 健康检查控制器：
 * - GET /api/health — API 存活探针（公开豁免，不校验 API Key）
 * - GET /api/ready — 就绪检查（含业务 contributor；受 API Key 保护）
 * 依赖不可用时仅显示 up/down/not_configured，不泄露 URI、密钥或诊断细节。
 */
@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthService,
    private readonly config: ConfigService,
  ) {}

  @Get('health')
  check(): HealthResponse {
    return this.health.check(this.config.get<string>('version') as string);
  }

  @Get('ready')
  ready(): Promise<ReadyResponse> {
    const timeoutMs = this.config.get<number>('health.checkTimeoutMs') ?? 2_000;
    return this.health.ready(this.config.get<string>('version') as string, timeoutMs);
  }
}
