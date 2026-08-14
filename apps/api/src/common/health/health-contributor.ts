/**
 * 就绪检查依赖贡献者协议：
 * 业务模块可通过 manifest.healthContributor 提供自有检查，
 * 由平台装配进 /api/ready（带超时、脱敏、not_configured 语义）。
 *
 * 实现约束：
 * - check() 必须自身快速返回；平台侧会叠加超时保护（HEALTH_CHECK_TIMEOUT_MS）
 * - 返回结构不得包含连接串、主机、密码、堆栈
 */
export type HealthStatus = 'up' | 'down' | 'not_configured';

export interface HealthCheckResult {
  id: string;
  status: HealthStatus;
  durationMs: number;
  /** 简短错误类别（如 ECONNREFUSED / TIMEOUT / NOT_CONFIGURED），不携带明细 */
  errorCategory?: string;
}

export interface HealthContributor {
  readonly id: string;
  check(): Promise<HealthCheckResult> | HealthCheckResult;
}

export interface ReadyResponse {
  status: 'ready' | 'not_ready';
  version: string;
  time: string;
  checks: HealthCheckResult[];
}

/** 带超时包装：超时视为 down（errorCategory=TIMEOUT），不抛出、不卡住请求 */
export async function runContributorWithTimeout(
  contributor: HealthContributor,
  timeoutMs: number,
): Promise<HealthCheckResult> {
  const startedAt = Date.now();
  try {
    const result = await Promise.race([
      Promise.resolve(contributor.check()),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error('timeout')), timeoutMs);
      }),
    ]);
    return {
      ...result,
      id: contributor.id,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      id: contributor.id,
      status: 'down',
      durationMs: Date.now() - startedAt,
      errorCategory: error instanceof Error && error.message === 'timeout' ? 'TIMEOUT' : 'ERROR',
    };
  }
}

/** 多值 provider token：业务模块 / 测试通过 multi:true 注入额外 contributor */
export const HEALTH_CONTRIBUTORS = Symbol('HEALTH_CONTRIBUTORS');
