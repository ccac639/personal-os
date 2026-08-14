import { Module } from '@nestjs/common';

import { HEALTH_CONTRIBUTORS } from './health-contributor.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    // 业务模块追加就绪检查 contributor 时替换/扩展此数组（见 manifest.healthContributor 约定）
    { provide: HEALTH_CONTRIBUTORS, useValue: [] },
  ],
  exports: [HealthService],
})
export class HealthModule {}
