import type { ModuleManifest } from '../../platform/module-manifest.js';

import { ThreeDModule } from './three-d.module.js';

/** ThreeD 模块注册描述（3D 项目：资产树/角色/区域/分镜/简报，自包含） */
export const threeDManifest: ModuleManifest = {
  id: 'three-d',
  module: ThreeDModule,
};
