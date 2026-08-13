import { type INestApplication, type Type, ValidationPipe } from '@nestjs/common';
import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';

import { standaloneMockConnection } from './mock-model.js';

export interface TestAppOptions {
  /** model name → mock model 实例 */
  models?: Record<string, unknown>;
  /** 连接 mock（默认 standalone：走补偿路径） */
  connection?: unknown;
}

/**
 * 构建 HTTP 层测试应用：
 * - import MongooseModule.forRootAsync：MongooseCoreModule 是 @Global，
 *   DatabaseConnection token 必须由它提供，forFeature 的 factory 才能解析；
 * - 随后 override DatabaseConnection 与各 model token 为内存 mock
 *   （override 后真实 createConnection 不会执行，不触达真实 Mongo）；
 * - 复刻 main.ts 的全局前缀与 ValidationPipe（transform + whitelist + forbidNonWhitelisted）。
 */
export async function createTestApp(
  imports: Type<unknown>[],
  options: TestAppOptions = {},
): Promise<INestApplication> {
  let builder = Test.createTestingModule({
    imports: [
      MongooseModule.forRootAsync({
        useFactory: () => ({ uri: 'mongodb://localhost:27017/test' }),
      }),
      ...imports,
    ],
  });
  builder = builder
    .overrideProvider(getConnectionToken())
    .useValue(options.connection ?? standaloneMockConnection);
  for (const [name, value] of Object.entries(options.models ?? {})) {
    builder = builder.overrideProvider(getModelToken(name)).useValue(value);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication(new FastifyAdapter());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      validationError: { target: false },
    }),
  );
  await app.init();
  // Nest + Fastify：supertest 直接打 getHttpServer()，必须先 ready()（等待路由注册完成）
  await (app.getHttpAdapter().getInstance() as { ready(): Promise<void> }).ready();
  return app;
}
