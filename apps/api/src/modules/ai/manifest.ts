import type { ModuleManifest } from '../../platform/module-manifest.js';

import { AiModule } from './ai.module.js';

/** AI 模块注册描述（全局自包含：Settings/Client，Chat 投递前校验 key） */
export const aiManifest: ModuleManifest = {
  id: 'ai',
  module: AiModule,
};
