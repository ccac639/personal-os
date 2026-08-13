/**
 * 平台测试夹具（PlatformTestModule 等）。
 *
 * 为什么放在 src 而非 test/：
 * 本仓库 Vite 8 依据 tsconfig `include`（仅 `src/**`）决定是否启用 legacy 装饰器解析；
 * test/ 下的文件含装饰器会转换失败。夹具仅被 test/platform-*.spec.ts 引用，
 * 不进入任何业务模块。
 */
import { Controller, Get, Module, Post, Body } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

import { configuration } from '../../config/configuration.js';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter.js';
import { ApiKeyGuard } from '../guards/api-key.guard.js';
import { HealthModule } from '../health/health.module.js';
import { RequestIdInterceptor } from '../interceptors/request-id.interceptor.js';
import { TransformInterceptor } from '../interceptors/transform.interceptor.js';
import { createValidationPipe } from '../validation.js';

export class EchoDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsInt()
  @Min(1)
  age!: number;
}

@Controller('echo')
export class EchoTestController {
  @Get('ping')
  ping(): { pong: boolean } {
    return { pong: true };
  }

  @Post()
  echo(@Body() dto: EchoDto): EchoDto {
    return dto;
  }

  @Get('boom')
  boom(): never {
    throw new Error('internal-secret-detail');
  }
}

@Controller('ping')
export class PingTestController {
  @Get()
  ping(): { pong: boolean } {
    return { pong: true };
  }
}

/** 装配与真实 AppModule 相同的平台管道（不含 Mongo/Redis/Pino），供集成测试使用 */
@Module({
  imports: [
    // 不加载 .env：仅取 process.env（测试内显式设置），保证可复现
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    HealthModule,
  ],
  controllers: [PingTestController, EchoTestController],
  providers: [
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_PIPE, useFactory: () => createValidationPipe() },
  ],
})
export class PlatformTestModule {}
