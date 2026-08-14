import type { ModuleManifest } from '../../platform/module-manifest.js';

import { ProjectsModule } from './projects.module.js';

/** Projects 模块注册描述（项目 + 级联删除编排） */
export const projectsManifest: ModuleManifest = {
  id: 'projects',
  module: ProjectsModule,
  dependsOn: ['tasks', 'focus', 'releases', 'knowledge'], // 级联删除跨四类实体
};
