/**
 * Sub2API Vue Query hooks（服务端状态唯一入口）。
 *
 * 原则：
 * - 查询：useQuery + sub2apiKeys，loading / empty / error / retry 齐全；
 * - 变更：useMutation，isPending 天然防重复提交；
 * - 状态类切换（启用/禁用/路由 enabled）使用乐观更新，失败自动回滚；
 * - 创建/删除等需要服务端确认的操作不做乐观更新（等待真实结果）。
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/vue-query';
import { computed, type Ref } from 'vue';

import { sub2apiApi, type Sub2ApiListQuery } from '@/services/sub2api';
import type {
  AccountInput,
  ApiKeyCreateInput,
  ApiKeyUpdateInput,
  ChannelInput,
  CompositeRouteInput,
  GroupInput,
  SaveSub2ApiSettingsInput,
  Sub2ApiAccount,
  Sub2ApiChannel,
  Sub2ApiGroup,
  Sub2ApiPage,
  Sub2ApiSettingsSnapshot,
} from '@/services/sub2api';

import { sub2apiKeys } from './query-keys';

/* ---------- 查询 ---------- */

export function useSub2ApiSettings() {
  return useQuery({
    queryKey: sub2apiKeys.settings(),
    queryFn: () => sub2apiApi.getSettings(),
    retry: false,
  });
}

export function useSub2ApiOverview() {
  return useQuery({
    queryKey: sub2apiKeys.overview(),
    queryFn: () => sub2apiApi.getOverview(),
    retry: false,
  });
}

export function useSub2ApiChannels(query: Ref<Sub2ApiListQuery> | Sub2ApiListQuery) {
  const q = computed(() => (isRef(query) ? query.value : query));
  return useQuery({
    queryKey: computed(() => sub2apiKeys.channels(q.value)),
    queryFn: () => sub2apiApi.listChannels(q.value),
    retry: false,
  });
}

export function useSub2ApiAccounts(query: Ref<Sub2ApiListQuery> | Sub2ApiListQuery) {
  const q = computed(() => (isRef(query) ? query.value : query));
  return useQuery({
    queryKey: computed(() => sub2apiKeys.accounts(q.value)),
    queryFn: () => sub2apiApi.listAccounts(q.value),
    retry: false,
  });
}

export function useSub2ApiSubscriptions(query: Ref<Sub2ApiListQuery> | Sub2ApiListQuery) {
  const q = computed(() => (isRef(query) ? query.value : query));
  return useQuery({
    queryKey: computed(() => sub2apiKeys.subscriptions(q.value)),
    queryFn: () => sub2apiApi.listSubscriptions(q.value),
    retry: false,
  });
}

export function useSub2ApiGroups(query: Ref<Sub2ApiListQuery> | Sub2ApiListQuery) {
  const q = computed(() => (isRef(query) ? query.value : query));
  return useQuery({
    queryKey: computed(() => sub2apiKeys.groups(q.value)),
    queryFn: () => sub2apiApi.listGroups(q.value),
    retry: false,
  });
}

export function useSub2ApiAllGroups() {
  return useQuery({
    queryKey: sub2apiKeys.allGroups(),
    queryFn: () => sub2apiApi.listAllGroups(),
    retry: false,
  });
}

export function useSub2ApiRoutes(groupId: Ref<number | null>) {
  return useQuery({
    queryKey: computed(() => sub2apiKeys.routes(groupId.value ?? 0)),
    queryFn: () => sub2apiApi.listRoutes(groupId.value as number),
    enabled: computed(() => groupId.value !== null),
    retry: false,
  });
}

export function useSub2ApiKeys(query: Ref<Sub2ApiListQuery> | Sub2ApiListQuery) {
  const q = computed(() => (isRef(query) ? query.value : query));
  return useQuery({
    queryKey: computed(() => sub2apiKeys.keys(q.value)),
    queryFn: () => sub2apiApi.listKeys(q.value),
    retry: false,
  });
}

export function useSub2ApiUsage(query: Ref<Sub2ApiListQuery> | Sub2ApiListQuery) {
  const q = computed(() => (isRef(query) ? query.value : query));
  return useQuery({
    queryKey: computed(() => sub2apiKeys.usage(q.value)),
    queryFn: () => sub2apiApi.listUsage(q.value),
    retry: false,
  });
}

export function useSub2ApiUsageStats(query: Ref<Sub2ApiListQuery> | Sub2ApiListQuery) {
  const q = computed(() => (isRef(query) ? query.value : query));
  return useQuery({
    queryKey: computed(() => sub2apiKeys.usageStats(q.value)),
    queryFn: () => sub2apiApi.getUsageStats(q.value),
    retry: false,
  });
}

function isRef<T>(value: Ref<T> | T): value is Ref<T> {
  return typeof value === 'object' && value !== null && 'value' in value;
}

/* ---------- 设置 / 连接测试 ---------- */

export function useSub2ApiSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveSub2ApiSettingsInput) => sub2apiApi.saveSettings(input),
    onSuccess: (data) => {
      queryClient.setQueryData(sub2apiKeys.settings(), data);
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.overview() });
    },
  });
}

export function useSub2ApiClearSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => sub2apiApi.clearSettings(),
    onSuccess: () => {
      queryClient.setQueryData<Sub2ApiSettingsSnapshot>(sub2apiKeys.settings(), {
        configured: false,
        baseUrlMasked: null,
        timeoutMs: 15_000,
        autoRefresh: false,
        refreshIntervalSec: 60,
        upstreamVersion: null,
      });
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.all });
    },
  });
}

export function useSub2ApiTestConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => sub2apiApi.testConnection(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.overview() });
    },
  });
}

/* ---------- 渠道 ---------- */

export function useSub2ApiCreateChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ChannelInput) => sub2apiApi.createChannel(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.channels({}) });
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.overview() });
    },
  });
}

export function useSub2ApiUpdateChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<ChannelInput> }) =>
      sub2apiApi.updateChannel(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.channels({}) });
    },
  });
}

/** 启用/禁用渠道：乐观更新，失败回滚 */
export function useSub2ApiToggleChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'active' | 'disabled' }) =>
      sub2apiApi.updateChannel(id, { status }),
    onMutate: async ({ id, status }) => {
      return optimisticPatchPage<Sub2ApiChannel>(
        queryClient,
        sub2apiKeys.all,
        (item) => item.id === id,
        (item) => ({ ...item, status }),
      );
    },
    onError: (_err, _vars, context) => rollbackOptimistic(context, queryClient),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.channels({}) });
    },
  });
}

export function useSub2ApiDeleteChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => sub2apiApi.deleteChannel(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.channels({}) });
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.overview() });
    },
  });
}

/* ---------- 账号 ---------- */

export function useSub2ApiCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AccountInput) => sub2apiApi.createAccount(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.accounts({}) });
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.overview() });
    },
  });
}

export function useSub2ApiUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<AccountInput> }) =>
      sub2apiApi.updateAccount(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.accounts({}) });
    },
  });
}

/** 启用/禁用账号：乐观更新，失败回滚 */
export function useSub2ApiToggleAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'active' | 'inactive' }) =>
      sub2apiApi.updateAccount(id, { status }),
    onMutate: async ({ id, status }) => {
      return optimisticPatchPage<Sub2ApiAccount>(
        queryClient,
        sub2apiKeys.all,
        (item) => item.id === id,
        (item) => ({ ...item, status }),
      );
    },
    onError: (_err, _vars, context) => rollbackOptimistic(context, queryClient),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.accounts({}) });
    },
  });
}

export function useSub2ApiDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => sub2apiApi.deleteAccount(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.accounts({}) });
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.overview() });
    },
  });
}

export function useSub2ApiTestAccount() {
  return useMutation({
    mutationFn: (id: number) => sub2apiApi.testAccount(id),
  });
}

/* ---------- 订阅 ---------- */

export function useSub2ApiRevokeSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => sub2apiApi.revokeSubscription(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.subscriptions({}) });
    },
  });
}

/* ---------- 模型分组 / 路由 ---------- */

export function useSub2ApiCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GroupInput) => sub2apiApi.createGroup(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.groups({}) });
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.allGroups() });
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.overview() });
    },
  });
}

export function useSub2ApiUpdateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<GroupInput> }) =>
      sub2apiApi.updateGroup(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.groups({}) });
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.allGroups() });
    },
  });
}

/** 启用/禁用分组：乐观更新，失败回滚 */
export function useSub2ApiToggleGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'active' | 'inactive' }) =>
      sub2apiApi.updateGroup(id, { status }),
    onMutate: async ({ id, status }) => {
      return optimisticPatchPage<Sub2ApiGroup>(
        queryClient,
        sub2apiKeys.all,
        (item) => item.id === id,
        (item) => ({ ...item, status }),
      );
    },
    onError: (_err, _vars, context) => rollbackOptimistic(context, queryClient),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.groups({}) });
    },
  });
}

export function useSub2ApiDeleteGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => sub2apiApi.deleteGroup(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.groups({}) });
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.allGroups() });
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.overview() });
    },
  });
}

export function useSub2ApiCreateRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, input }: { groupId: number; input: CompositeRouteInput }) =>
      sub2apiApi.createRoute(groupId, input),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.routes(vars.groupId) });
    },
  });
}

export function useSub2ApiUpdateRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      groupId,
      routeId,
      input,
    }: {
      groupId: number;
      routeId: number;
      input: Partial<CompositeRouteInput>;
    }) => sub2apiApi.updateRoute(groupId, routeId, input),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.routes(vars.groupId) });
    },
  });
}

/** 路由启用/禁用：乐观更新（路由列表为数组缓存），失败回滚 */
export function useSub2ApiToggleRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      groupId,
      routeId,
      enabled,
    }: {
      groupId: number;
      routeId: number;
      enabled: boolean;
    }) => sub2apiApi.updateRoute(groupId, routeId, { enabled }),
    onMutate: async ({ groupId, routeId, enabled }) => {
      await queryClient.cancelQueries({ queryKey: sub2apiKeys.routes(groupId) });
      const previous = queryClient.getQueryData<Sub2ApiRouteItem[]>(sub2apiKeys.routes(groupId));
      queryClient.setQueryData<Sub2ApiRouteItem[]>(sub2apiKeys.routes(groupId), (old) =>
        (old ?? []).map((route) => (route.id === routeId ? { ...route, enabled } : route)),
      );
      return { previous };
    },
    onError: (_err, vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(sub2apiKeys.routes(vars.groupId), context.previous);
      }
    },
    onSettled: (_data, _error, vars) => {
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.routes(vars.groupId) });
    },
  });
}

export function useSub2ApiDeleteRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, routeId }: { groupId: number; routeId: number }) =>
      sub2apiApi.deleteRoute(groupId, routeId),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.routes(vars.groupId) });
    },
  });
}

/* ---------- API 凭据 ---------- */

export function useSub2ApiCreateKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ApiKeyCreateInput) => sub2apiApi.createKey(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.keys({}) });
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.overview() });
    },
  });
}

export function useSub2ApiUpdateKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: ApiKeyUpdateInput }) =>
      sub2apiApi.updateKey(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.keys({}) });
    },
  });
}

/** 启用/禁用 API 凭据：乐观更新，失败回滚 */
export function useSub2ApiToggleKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'active' | 'inactive' }) =>
      sub2apiApi.updateKey(id, { status }),
    onMutate: async ({ id, status }) => {
      return optimisticPatchPage<Sub2ApiApiKeyItem>(
        queryClient,
        sub2apiKeys.all,
        (item) => item.id === id,
        (item) => ({ ...item, status }),
      );
    },
    onError: (_err, _vars, context) => rollbackOptimistic(context, queryClient),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.keys({}) });
    },
  });
}

export function useSub2ApiDeleteKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => sub2apiApi.deleteKey(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.keys({}) });
      void queryClient.invalidateQueries({ queryKey: sub2apiKeys.overview() });
    },
  });
}

/* ---------- 乐观更新辅助（分页缓存补丁 + 回滚） ---------- */

interface OptimisticSnapshot {
  queryKey: unknown[];
  data: unknown;
}

interface OptimisticContext {
  snapshots: OptimisticSnapshot[];
}

/**
 * 对 sub2api 分页查询缓存做乐观补丁：
 * 遍历当前缓存的全部分页查询条目（queryKey 前缀匹配），命中 id 的条目打补丁，
 * 并保存「旧值快照」用于失败回滚。
 */
async function optimisticPatchPage<T extends { id: number }>(
  queryClient: QueryClient,
  keysPrefix: readonly string[],
  match: (item: T) => boolean,
  patch: (item: T) => T,
): Promise<OptimisticContext> {
  await queryClient.cancelQueries({ queryKey: [...keysPrefix] });
  const snapshots: OptimisticSnapshot[] = [];
  for (const entry of queryClient.getQueryCache().findAll({ queryKey: keysPrefix })) {
    const data = queryClient.getQueryData(entry.queryKey) as Sub2ApiPage<T> | T[] | undefined;
    if (data === undefined) continue;
    snapshots.push({ queryKey: [...entry.queryKey], data });
    if (isPage<T>(data)) {
      queryClient.setQueryData(entry.queryKey, {
        ...data,
        items: data.items.map((item) => (match(item) ? patch(item) : item)),
      });
    } else if (Array.isArray(data)) {
      queryClient.setQueryData(
        entry.queryKey,
        data.map((item) => (match(item) ? patch(item) : item)),
      );
    }
  }
  return { snapshots };
}

function isPage<T>(data: unknown): data is Sub2ApiPage<T> {
  return (
    typeof data === 'object' &&
    data !== null &&
    'items' in data &&
    Array.isArray((data as { items: unknown }).items)
  );
}

/** 失败回滚：恢复 onMutate 保存的旧值，再失效刷新兜底 */
function rollbackOptimistic(
  context: OptimisticContext | undefined,
  queryClient: QueryClient,
): void {
  if (!context) return;
  for (const snapshot of context.snapshots) {
    queryClient.setQueryData(snapshot.queryKey, snapshot.data);
  }
  void queryClient.invalidateQueries({ queryKey: sub2apiKeys.all });
}

/* 路由类型透出（供 toggle 缓存使用） */
export type Sub2ApiRouteItem = import('@/services/sub2api').Sub2ApiCompositeRoute;
export type Sub2ApiApiKeyItem = import('@/services/sub2api').Sub2ApiApiKey;
