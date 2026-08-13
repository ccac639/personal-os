/**
 * 运行时限制（与 api 端 RUN_LIMITS 保持一致）
 *
 * - 最大节点数：导入时校验；执行时防御（坏数据兜底）
 * - 最大步数：runConfig.maxSteps（1..MAX_STEPS）
 * - 最大嵌套子流程深度：递归执行时限制
 * - 最大日志数：engine 内截断（丢最旧）
 * - 超时：runConfig.timeoutMs（MIN..MAX）
 */
export const RUN_LIMITS = {
  MAX_NODES: 200,
  MAX_STEPS: 10_000,
  MIN_STEPS: 1,
  MAX_TIMEOUT_MS: 3_600_000,
  MIN_TIMEOUT_MS: 1_000,
  MAX_SUBFLOW_DEPTH: 5,
  MAX_RUN_LOGS: 500,
  /** 单节点 delay 上限（秒），防误配导致长时间挂起 */
  MAX_DELAY_SECONDS: 300,
} as const;

export interface NormalizedRunConfig {
  maxSteps: number;
  timeoutMs: number;
  failStrategy: 'stop' | 'continue';
}

/** 规范化运行配置（非法值回落默认并抛错） */
export function normalizeRunConfig(cfg: Partial<NormalizedRunConfig> | undefined): NormalizedRunConfig {
  const maxSteps =
    cfg?.maxSteps !== undefined && Number.isInteger(cfg.maxSteps)
      ? Math.min(Math.max(cfg.maxSteps, RUN_LIMITS.MIN_STEPS), RUN_LIMITS.MAX_STEPS)
      : 1000;
  const timeoutMs =
    cfg?.timeoutMs !== undefined && Number.isInteger(cfg.timeoutMs)
      ? Math.min(Math.max(cfg.timeoutMs, RUN_LIMITS.MIN_TIMEOUT_MS), RUN_LIMITS.MAX_TIMEOUT_MS)
      : 60_000;
  const failStrategy: 'stop' | 'continue' =
    cfg?.failStrategy === 'continue' ? 'continue' : 'stop';
  return { maxSteps, timeoutMs, failStrategy };
}

/** 执行前防御校验：节点数 / 配置合法 */
export function assertRuntimeLimits(nodesCount: number, config: NormalizedRunConfig): void {
  if (nodesCount > RUN_LIMITS.MAX_NODES) {
    throw new Error(`节点数超过上限 ${RUN_LIMITS.MAX_NODES}`);
  }
  if (config.maxSteps < RUN_LIMITS.MIN_STEPS || config.maxSteps > RUN_LIMITS.MAX_STEPS) {
    throw new Error(`maxSteps 必须在 ${RUN_LIMITS.MIN_STEPS}..${RUN_LIMITS.MAX_STEPS} 之间`);
  }
  if (config.timeoutMs < RUN_LIMITS.MIN_TIMEOUT_MS || config.timeoutMs > RUN_LIMITS.MAX_TIMEOUT_MS) {
    throw new Error(
      `timeoutMs 必须在 ${RUN_LIMITS.MIN_TIMEOUT_MS}..${RUN_LIMITS.MAX_TIMEOUT_MS} 之间`,
    );
  }
}
