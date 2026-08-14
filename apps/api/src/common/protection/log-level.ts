/**
 * 访问日志级别策略（纯函数，便于单测）：
 * - 5xx → error
 * - 4xx → warn
 * - 非 production 且耗时超过慢请求阈值 → warn（慢请求告警，仅日志、无侵入式 UI）
 * - 其余 → info
 */

export const SLOW_REQUEST_THRESHOLD_MS = 1000;

export function resolveAccessLogLevel(
  statusCode: number,
  durationMs: number,
  nodeEnv: string,
): 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent' {
  if (statusCode >= 500) {
    return 'error';
  }
  if (statusCode >= 400) {
    return 'warn';
  }
  if (nodeEnv !== 'production' && durationMs > SLOW_REQUEST_THRESHOLD_MS) {
    return 'warn';
  }
  return 'info';
}
