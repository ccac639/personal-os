import type { ModuleManifest } from '../../platform/module-manifest.js';

import { InspirationsModule } from './inspiration.module.js';

/** Inspiration 模块注册描述（灵感库；从 Chat 消息保存依赖 MessagesService） */
export const inspirationManifest: ModuleManifest = {
  id: 'inspiration',
  module: InspirationsModule,
  dependsOn: ['chat'],
};
