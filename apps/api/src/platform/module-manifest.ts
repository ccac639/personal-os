import type { Type } from '@nestjs/common';

import type { HealthContributor } from '../common/health/health-contributor.js';

/** 启用条件：布尔值或按运行环境求值的函数 */
export type ModuleEnableCondition = boolean | ((ctx: { nodeEnv: string }) => boolean);

/**
 * 业务模块注册描述（manifest）。
 *
 * 业务 Agent 在自己的模块目录创建 manifest.ts 导出 ModuleManifest，
 * 然后在 `apps/api/src/platform/business-manifests.ts` 登记；
 * 平台启动时按拓扑顺序自动装配，无需编辑 app.module.ts。
 */
export interface ModuleManifest {
  /** 全局唯一模块 ID（kebab-case，如 'chat'、'projects'） */
  id: string;
  /** Nest 模块类 */
  module: Type<unknown>;
  /** 启用条件：默认 true；false 或返回 false 的函数 → 跳过装配 */
  enabledWhen?: ModuleEnableCondition;
  /** 依赖模块 ID 列表：装配顺序保证先依赖后本模块 */
  dependsOn?: string[];
  /** 就绪检查贡献者（可选）：随模块装配注册进 /api/ready */
  healthContributor?: HealthContributor;
}
