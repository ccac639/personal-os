import type { ModuleManifest } from '../../platform/module-manifest.js';

import { KnowledgeModule } from './knowledge.module.js';

/** Knowledge 模块注册描述（决策/问题/参考条目） */
export const knowledgeManifest: ModuleManifest = {
  id: 'knowledge',
  module: KnowledgeModule,
};
