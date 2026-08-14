import type { ModuleManifest } from '../../platform/module-manifest.js';

import { ReleasesModule } from './releases.module.js';

/** Releases 模块注册描述（发布记录 + 里程碑） */
export const releasesManifest: ModuleManifest = {
  id: 'releases',
  module: ReleasesModule,
};
