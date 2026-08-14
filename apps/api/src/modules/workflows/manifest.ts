import type { ModuleManifest } from '../../platform/module-manifest.js';

import { WorkflowsModule } from './workflow.module.js';

/** Workflows 模块注册描述（工作流定义/运行/队列，自包含） */
export const workflowsManifest: ModuleManifest = {
  id: 'workflows',
  module: WorkflowsModule,
};
