import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * Redis 连接提供者：
 * - ioredis 构造即后台建立连接，不阻塞应用启动；断线自动重连
 * - maxRetriesPerRequest: null：兼容后续 BullMQ 队列使用
 * - 应用关闭时优雅 quit()
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (config: ConfigService): Redis =>
        new Redis(config.get<string>('redis.url') as string, {
          maxRetriesPerRequest: null,
        }),
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.quit();
  }
}
