import type { ModuleManifest } from '../../platform/module-manifest.js';

import { Sub2ApiModule } from './sub2api.module.js';

/** Sub2API 管理模块注册描述（Web → Personal OS API → Sub2API） */
export const sub2ApiManifest: ModuleManifest = {
  id: 'sub2api',
  module: Sub2ApiModule,
};
