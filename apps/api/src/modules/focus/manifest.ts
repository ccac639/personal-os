import type { ModuleManifest } from '../../platform/module-manifest.js';

import { FocusModule } from './focus.module.js';

/** Focus 模块注册描述（计划/专注记录/周目标） */
export const focusManifest: ModuleManifest = {
  id: 'focus',
  module: FocusModule,
};
