import { Global, Module } from '@nestjs/common';

import { RedisModule } from '../../common/redis/redis.module.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { AiSettingsService } from './ai-settings.service.js';
import { SiliconFlowClient, SILICONFLOW_FETCH } from './siliconflow.client.js';

/**
 * AI 模块（全局，自包含）：
 * - 自行引入 RedisModule（REDIS_CLIENT 不依赖宿主 AppModule 是否注册平台基座）；
 * - AiSettingsService 供 Chat 模块投递前校验 key（BullChatJobQueue 注入）；
 * - SiliconFlowClient 直接调用官方 REST（生图/视频/TTS/对话），fetch 可注入便于测试。
 */
@Global()
@Module({
  imports: [RedisModule],
  controllers: [AiController],
  providers: [
    AiService,
    AiSettingsService,
    SiliconFlowClient,
    { provide: SILICONFLOW_FETCH, useValue: (...args: Parameters<typeof fetch>) => fetch(...args) },
  ],
  exports: [AiSettingsService, SiliconFlowClient],
})
export class AiModule {}
