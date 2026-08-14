import type { ModuleManifest } from '../../platform/module-manifest.js';

import { TasksModule } from './tasks.module.js';

/** Tasks 模块注册描述（任务/收件箱/依赖约束） */
export const tasksManifest: ModuleManifest = {
  id: 'tasks',
  module: TasksModule,
  dependsOn: ['focus'], // TasksService 依赖 FocusService（删除任务时清理 focus 引用）
};
