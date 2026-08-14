import { Module } from '@nestjs/common';

import { RedisModule } from '../../common/redis/redis.module.js';
import { SUB2API_ADAPTER } from './client/adapter.js';
import { SUB2API_FETCH, Sub2ApiClient } from './client/sub2api.client.js';
import { Sub2ApiController } from './sub2api.controller.js';
import { Sub2ApiService } from './sub2api.service.js';
import { Sub2ApiSettingsService } from './sub2api.settings.service.js';

/**
 * Sub2API 管理模块（自包含）：
 * - 设置（Base URL / 凭据）存 Redis，凭据不回显；
 * - Sub2ApiClient 实现 Sub2ApiAdapter（fetch 可注入，测试替换为 fake）；
 * - 对外只暴露 Personal OS 路由，前端永不直连 Sub2API。
 */
@Module({
  imports: [RedisModule],
  controllers: [Sub2ApiController],
  providers: [
    Sub2ApiService,
    Sub2ApiSettingsService,
    Sub2ApiClient,
    { provide: SUB2API_ADAPTER, useExisting: Sub2ApiClient },
    { provide: SUB2API_FETCH, useValue: (...args: Parameters<typeof fetch>) => fetch(...args) },
  ],
  exports: [Sub2ApiSettingsService],
})
export class Sub2ApiModule {}
