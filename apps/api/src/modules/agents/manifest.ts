import type { ModuleManifest } from '../../platform/module-manifest.js';

import { AgentsModule } from './agents.module.js';

/** Agents 模块注册描述（内置模板 + 个人变体；启动会话依赖 Chat） */
export const agentsManifest: ModuleManifest = {
  id: 'agents',
  module: AgentsModule,
  dependsOn: ['chat'],
};
