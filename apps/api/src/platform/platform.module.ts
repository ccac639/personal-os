import { Global, Module } from '@nestjs/common';

import { ModuleRegistry } from './module-registry.js';

/**
 * 平台模块：向业务模块暴露 ModuleRegistry（查询装配状态 / 注册 contributor 等）。
 * 装配本身由 app.module.ts 顶层同步完成（fail-fast），不依赖 DI 时机。
 */
@Global()
@Module({
  providers: [ModuleRegistry],
  exports: [ModuleRegistry],
})
export class PlatformModule {}
