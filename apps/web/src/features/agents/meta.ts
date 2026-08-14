/**
 * Agents 管理功能域 —— 展示元信息（标签 / 时间格式化）
 */
import type { AgentKind, AgentProviderName, AgentStatusFilter } from './types';

export const AGENT_KIND_LABELS: Record<AgentKind, string> = {
  builtin: '内置',
  personal: '个人',
};

export const AGENT_PROVIDER_LABELS: Record<AgentProviderName, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  openrouter: 'OpenRouter',
  siliconflow: '硅基流动',
};

/** 状态筛选选项（客户端过滤 enabled 字段） */
export const AGENT_STATUS_OPTIONS: ReadonlyArray<{ key: AgentStatusFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'enabled', label: '已启用' },
  { key: 'disabled', label: '已停用' },
] as const;

/** ISO 时间 → 本地 'yyyy-MM-dd HH:mm' */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** ISO 时间 → 相对时间（'刚刚' / 'N 分钟前' / ... / 绝对时间） */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '从未使用';
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return '—';
  const diffMinutes = Math.floor((Date.now() - time) / 60_000);
  if (diffMinutes < 1) return '刚刚';
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return formatDateTime(iso);
}
