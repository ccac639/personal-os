import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { HealthService, type HealthResponse } from './health.service.js';

/**
 * GET /api/health — API 存活探针
 * 返回 API 状态、版本、时间与依赖服务状态；
 * 依赖不可用时仅显示 up/down，不泄露 URI、密钥或诊断细节。
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  check(): HealthResponse {
    return this.health.check(this.config.get<string>('version') as string);
  }
}
