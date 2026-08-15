import { ConfigService } from '@nestjs/config';
import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { buildCorsOptions } from './common/cors.js';
import { buildHelmetOptions } from './common/security/helmet.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }), // 请求日志统一走 nestjs-pino
    { bufferLogs: true },
  );

  const config = app.get(ConfigService);

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api');

  // API 版本化：URI 策略，不设 defaultVersion（ADR-0015）
  // - 现有 controller 未标 @Version → 路由保持 /api/... 不变（Sub2API 31 端点零破坏）
  // - 未来新版本模块显式 @Version('2') → /api/v2/...
  app.enableVersioning({ type: VersioningType.URI });

  // 安全响应头：CSP 基础策略 + helmet 默认头（与下方 CORS 白名单协调，见 buildHelmetOptions）
  await app.register(helmet, buildHelmetOptions());

  // CORS：仅允许配置的 Web Origin（不允许 origin=* 与 credentials 混用）
  app.enableCors(buildCorsOptions(config.get<string>('cors.origin') as string));

  // Swagger：development 默认可用，production 可通过 SWAGGER_ENABLED 显式开启
  if (config.get<boolean>('swagger.enabled')) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Personal OS API')
      .setDescription('Personal OS 后端 REST / WebSocket API')
      .setVersion(config.get<string>('version') as string)
      .addApiKey({ type: 'apiKey', in: 'header', name: 'X-API-Key' }, 'X-API-Key')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api', app, document);
  }

  const host = config.get<string>('apiHost') as string;
  const port = config.get<number>('port') as number;
  await app.listen(port, host);
  app
    .get(Logger)
    .log(
      `Personal OS API listening on http://${host}:${port} (env=${config.get<string>('nodeEnv')})`,
      'Bootstrap',
    );
}

void bootstrap().catch((error: unknown) => {
  // 配置校验失败等启动期错误：fail-fast，输出到 stderr 并以非零码退出

  console.error('[bootstrap] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
