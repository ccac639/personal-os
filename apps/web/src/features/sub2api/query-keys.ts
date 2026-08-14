/**
 * Sub2API Vue Query keys（服务端状态缓存键）。
 *
 * 约定：服务端资源一律走 Vue Query（不复制进 Pinia / localStorage），
 * 瞬时 UI 状态（弹窗开关、表单草稿）放组合式函数局部 ref。
 */
import type { Sub2ApiListQuery } from '@/services/sub2api';

export const sub2apiKeys = {
  all: ['sub2api'] as const,
  settings: () => [...sub2apiKeys.all, 'settings'] as const,
  overview: () => [...sub2apiKeys.all, 'overview'] as const,
  channels: (query: Sub2ApiListQuery) =>
    [...sub2apiKeys.all, 'channels', normalize(query)] as const,
  accounts: (query: Sub2ApiListQuery) =>
    [...sub2apiKeys.all, 'accounts', normalize(query)] as const,
  subscriptions: (query: Sub2ApiListQuery) =>
    [...sub2apiKeys.all, 'subscriptions', normalize(query)] as const,
  groups: (query: Sub2ApiListQuery) => [...sub2apiKeys.all, 'groups', normalize(query)] as const,
  allGroups: () => [...sub2apiKeys.all, 'all-groups'] as const,
  routes: (groupId: number) => [...sub2apiKeys.all, 'groups', groupId, 'routes'] as const,
  keys: (query: Sub2ApiListQuery) => [...sub2apiKeys.all, 'keys', normalize(query)] as const,
  usage: (query: Sub2ApiListQuery) => [...sub2apiKeys.all, 'usage', normalize(query)] as const,
  usageStats: (query: Sub2ApiListQuery) =>
    [...sub2apiKeys.all, 'usage-stats', normalize(query)] as const,
} as const;

/** 查询参数规范化：稳定序列化，避免对象字面量导致缓存键抖动 */
function normalize(query: Sub2ApiListQuery): string {
  const parts: string[] = [];
  for (const key of [
    'page',
    'pageSize',
    'search',
    'status',
    'platform',
    'model',
    'startDate',
    'endDate',
    'sortBy',
    'sortOrder',
  ] as const) {
    const value = query[key];
    if (value !== undefined && value !== '') parts.push(`${key}=${String(value)}`);
  }
  return parts.join('&') || 'all';
}
