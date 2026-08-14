import type { ModuleManifest } from './module-manifest.js';

import { aiManifest } from '../modules/ai/manifest.js';
import { agentsManifest } from '../modules/agents/manifest.js';
import { chatManifest } from '../modules/chat/manifest.js';
import { dataImportManifest } from '../modules/data-import/manifest.js';
import { focusManifest } from '../modules/focus/manifest.js';
import { inspirationManifest } from '../modules/inspiration/manifest.js';
import { knowledgeManifest } from '../modules/knowledge/manifest.js';
import { projectsManifest } from '../modules/projects/manifest.js';
import { releasesManifest } from '../modules/releases/manifest.js';
import { sub2ApiManifest } from '../modules/sub2api/manifest.js';
import { tasksManifest } from '../modules/tasks/manifest.js';
import { threeDManifest } from '../modules/three-d/manifest.js';
import { workflowsManifest } from '../modules/workflows/manifest.js';

/**
 * 业务模块 manifest 汇总（平台唯一的共享编辑接入点）。
 *
 * 注册规则（详见 platform/README.md）：
 * - id 全局唯一；module 必须 DI 完整
 * - dependsOn 只描述真实注册级依赖（拓扑排序保证先装配依赖）
 * - 数组顺序仅可读性，不承载依赖语义
 *
 * 拓扑装配顺序（由 ModuleRegistry 计算）：
 * ai → chat → agents / inspiration → focus → tasks → projects →
 * releases / knowledge / data-import / three-d / workflows
 */
export const businessManifests: ModuleManifest[] = [
  aiManifest,
  chatManifest,
  agentsManifest,
  inspirationManifest,
  focusManifest,
  tasksManifest,
  projectsManifest,
  releasesManifest,
  knowledgeManifest,
  dataImportManifest,
  threeDManifest,
  workflowsManifest,
  sub2ApiManifest,
];
