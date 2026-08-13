import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { LoggerModule } from 'nestjs-pino';

import { configuration } from './config/configuration.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { ApiKeyGuard } from './common/guards/api-key.guard.js';
import { HealthModule } from './common/health/health.module.js';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor.js';
import { TransformInterceptor } from './common/interceptors/transform.interceptor.js';
import { RedisModule } from './common/redis/redis.module.js';
import { createValidationPipe } from './common/validation.js';

/**
 * 平台基座装配：
 * - 配置：zod 严格校验（缺失/非法值 fail-fast），pnpm workspace 下回退读取仓库根 .env
 * - 日志：nestjs-pino（level 来自 LOG_LEVEL；development 用 pino-pretty）
 * - Mongo：lazyConnection（启动不阻塞，依赖不可用后台重连）+ 短 serverSelectionTimeout
 * - Redis：ioredis 全局提供者（后台连接，不阻塞启动）
 * - 全局：API Key 守卫、统一异常过滤器、requestId + 统一响应拦截器、DTO 校验管道
 * - 业务模块由各功能分支自行注册（本文件保持平台基座自包含）
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      // pnpm workspace：dev 时 cwd 为 apps/api，需显式回退到仓库根 .env
      envFilePath: ['.env', '../../.env'],
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get<string>('logLevel'),
          ...(config.get<string>('nodeEnv') === 'production'
            ? {}
            : {
                transport: {
                  target: 'pino-pretty',
                  options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' },
                },
              }),
        },
      }),
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('mongodb.uri'),
        // 启动不等待连接成功；依赖不可用时 /health 显示 down，进程仍可启动
        lazyConnection: true,
        serverSelectionTimeoutMS: 3000,
        retryAttempts: 1,
      }),
    }),
    RedisModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // 顺序敏感：RequestId 在外层先生成 requestId，Transform 再读取包装
    { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    {
      provide: APP_PIPE,
      useFactory: (): ValidationPipe => createValidationPipe(),
    },
  ],
})
export class AppModule {}
