/**
 * Sub2API 格式化与展示工具（纯函数，便于单测）。
 */
import type {
  Sub2ApiAccount,
  Sub2ApiApiKey,
  Sub2ApiChannel,
  Sub2ApiGroup,
  Sub2ApiUsageLog,
} from '@/services/sub2api';

/** 时间戳 → 本地可读时间（YYYY-MM-DD HH:mm:ss） */
export function formatDateTime(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** 日期（YYYY-MM-DD），本地时区 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 金额：$0.0042 → $0.0042（保留 4 位，去尾零） */
export function formatCost(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '$0';
  const rounded = Math.round(value * 10_000) / 10_000;
  return `$${String(rounded)}`;
}

/** 数量：大数加千分位 */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US');
}

/** 延迟（ms）：<1000 显示 ms，否则显示 s */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** 运行时长（秒）→ 人类可读 */
export function formatUptime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  return `${minutes} 分`;
}

/** 状态 → 徽标语义（text/badge 颜色组） */
export type StatusTone = 'ok' | 'warn' | 'error' | 'muted';

const STATUS_TONES: Record<string, StatusTone> = {
  active: 'ok',
  normal: 'ok',
  ok: 'ok',
  success: 'ok',
  disabled: 'muted',
  inactive: 'muted',
  expired: 'muted',
  revoked: 'muted',
  suspended: 'warn',
  error: 'error',
  quota_exhausted: 'warn',
  ratelimited: 'warn',
  rate_limited: 'warn',
  overload: 'error',
};

export function statusTone(status: string | null | undefined): StatusTone {
  if (!status) return 'muted';
  return STATUS_TONES[status.toLowerCase()] ?? 'muted';
}

export function statusLabel(status: string | null | undefined): string {
  const map: Record<string, string> = {
    active: '启用',
    normal: '正常',
    inactive: '停用',
    disabled: '禁用',
    error: '异常',
    expired: '已过期',
    revoked: '已撤销',
    suspended: '已暂停',
    quota_exhausted: '配额耗尽',
    ratelimited: '限流中',
    rate_limited: '限流中',
    overload: '过载',
    ok: '正常',
    success: '成功',
  };
  if (!status) return '未知';
  return map[status.toLowerCase()] ?? status;
}

/** 平台中文名 */
export function platformLabel(platform: string | null | undefined): string {
  const map: Record<string, string> = {
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    gemini: 'Gemini',
    antigravity: 'Antigravity',
    grok: 'Grok',
    composite: '聚合',
  };
  if (!platform) return '—';
  return map[platform] ?? platform;
}

/** 掩码后的 Base URL（后端已掩码，兜底再处理） */
export function maskBaseUrl(baseUrl: string | null | undefined): string {
  if (!baseUrl) return '未配置';
  return baseUrl;
}

/** 渠道启用状态切换目标 */
export function nextChannelStatus(channel: Sub2ApiChannel): 'active' | 'disabled' {
  return channel.status === 'active' ? 'disabled' : 'active';
}

/** 账号启用状态切换目标 */
export function nextAccountStatus(account: Sub2ApiAccount): 'active' | 'inactive' {
  return account.status === 'active' ? 'inactive' : 'active';
}

/** 凭据启用状态切换目标 */
export function nextKeyStatus(key: Sub2ApiApiKey): 'active' | 'inactive' {
  return key.status === 'active' ? 'inactive' : 'active';
}

/** 分组启用状态切换目标 */
export function nextGroupStatus(group: Sub2ApiGroup): 'active' | 'inactive' {
  return group.status === 'active' ? 'inactive' : 'active';
}

/** 请求日志 → 状态语义（由 billing_type/request_type 推断，展示用） */
export function usageStatusText(log: Sub2ApiUsageLog): string {
  if (log.duration_ms === null) return '失败';
  return '成功';
}

/** 错误信息截断（请求日志详情等场景，防长错误刷屏） */
export function truncateMessage(message: string | null | undefined, max = 200): string {
  if (!message) return '—';
  const cleaned = message.trim().replace(/\s+/g, ' ');
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

/** 模型映射展示：platform → { 上游模型 → 对外模型 } 转扁平数组 */
export interface ModelMappingRow {
  platform: string;
  upstreamModel: string;
  publicModel: string;
}

export function flattenModelMapping(
  mapping: Record<string, Record<string, string>> | undefined,
): ModelMappingRow[] {
  if (!mapping) return [];
  const rows: ModelMappingRow[] = [];
  for (const [platform, inner] of Object.entries(mapping)) {
    for (const [upstreamModel, publicModel] of Object.entries(inner ?? {})) {
      rows.push({ platform, upstreamModel, publicModel });
    }
  }
  return rows;
}
