<script setup lang="ts">
/**
 * 模型与路由视图：分组列表 + 模型路由（对外模型 → 上游平台/模型）。
 * - 展示映射、优先级、可用状态；API 支持修改（创建/编辑/删除/启用禁用）；
 * - 无可用渠道（分组下无正常账号）与配置冲突（同模型多条同优先级启用路由）清晰提示。
 */
import { computed, reactive, ref } from 'vue';
import { AlertTriangle, Pencil, Plus, Power, Trash2 } from '@lucide/vue';

import { confirm } from '@/app/confirm';
import type {
  CompositeRouteInput,
  GroupInput,
  Sub2ApiCompositeRoute,
  Sub2ApiGroup,
  Sub2ApiListQuery,
} from '@/services/sub2api';
import {
  useSub2ApiCreateGroup,
  useSub2ApiCreateRoute,
  useSub2ApiDeleteGroup,
  useSub2ApiDeleteRoute,
  useSub2ApiGroups,
  useSub2ApiRoutes,
  useSub2ApiToggleGroup,
  useSub2ApiToggleRoute,
  useSub2ApiUpdateGroup,
  useSub2ApiUpdateRoute,
} from '../hooks';
import { platformLabel } from '../format';
import ErrorBanner from './error-banner.vue';
import GroupFormDialog from './group-form-dialog.vue';
import PaginationBar from './pagination-bar.vue';
import RouteFormDialog from './route-form-dialog.vue';
import StatusBadge from './status-badge.vue';

const PAGE_SIZE = 10;

const query = reactive<Sub2ApiListQuery>({ page: 1, pageSize: PAGE_SIZE });
const searchInput = ref('');

const { data, isLoading, isError, error, refetch } = useSub2ApiGroups(query);

const createGroup = useSub2ApiCreateGroup();
const updateGroup = useSub2ApiUpdateGroup();
const toggleGroup = useSub2ApiToggleGroup();
const deleteGroup = useSub2ApiDeleteGroup();
const createRoute = useSub2ApiCreateRoute();
const updateRoute = useSub2ApiUpdateRoute();
const toggleRoute = useSub2ApiToggleRoute();
const deleteRoute = useSub2ApiDeleteRoute();

const selectedGroupId = ref<number | null>(null);
const {
  data: routes,
  isError: routesError,
  error: routesErrorObj,
  refetch: refetchRoutes,
} = useSub2ApiRoutes(selectedGroupId);

const groupFormVisible = ref(false);
const editingGroup = ref<Sub2ApiGroup | null>(null);
const routeFormVisible = ref(false);
const editingRoute = ref<Sub2ApiCompositeRoute | null>(null);

const rows = computed<Sub2ApiGroup[]>(() => data.value?.items ?? []);
const selectedGroup = computed<Sub2ApiGroup | null>(
  () => rows.value.find((g) => g.id === selectedGroupId.value) ?? null,
);
const routeRows = computed<Sub2ApiCompositeRoute[]>(() => routes.value ?? []);

/** 配置冲突：同一对外模型存在多条启用路由且优先级相同（上游按优先级选择，冲突会不稳定） */
const conflicts = computed(() => {
  const map = new Map<string, { priority: number; count: number }>();
  for (const route of routeRows.value) {
    if (!route.enabled) continue;
    const key = `${route.public_model}@${route.endpoint}`;
    const existing = map.get(key);
    if (existing) {
      if (existing.priority === route.priority) existing.count += 1;
    } else {
      map.set(key, { priority: route.priority, count: 1 });
    }
  }
  return [...map.entries()].filter(([, v]) => v.count > 1);
});

function applySearch(): void {
  query.search = searchInput.value.trim() || undefined;
  query.page = 1;
}

function goPage(page: number): void {
  query.page = page;
}

function selectGroup(group: Sub2ApiGroup): void {
  selectedGroupId.value = group.id;
}

function startCreateGroup(): void {
  editingGroup.value = null;
  groupFormVisible.value = true;
}

function startEditGroup(group: Sub2ApiGroup): void {
  editingGroup.value = group;
  groupFormVisible.value = true;
}

async function submitGroup(input: GroupInput): Promise<void> {
  if (editingGroup.value) {
    await updateGroup.mutateAsync({ id: editingGroup.value.id, input });
  } else {
    await createGroup.mutateAsync(input);
  }
  groupFormVisible.value = false;
}

async function onToggleGroup(group: Sub2ApiGroup): Promise<void> {
  await toggleGroup.mutateAsync({
    id: group.id,
    status: group.status === 'active' ? 'inactive' : 'active',
  });
}

async function onDeleteGroup(group: Sub2ApiGroup): Promise<void> {
  const ok = await confirm({
    title: '删除分组',
    message: `确定删除分组「${group.name}」？分组下的模型路由将一并删除。`,
    confirmText: '删除',
    tone: 'danger',
  });
  if (!ok) return;
  await deleteGroup.mutateAsync(group.id);
  if (selectedGroupId.value === group.id) selectedGroupId.value = null;
}

function startCreateRoute(): void {
  if (!selectedGroupId.value) return;
  editingRoute.value = null;
  routeFormVisible.value = true;
}

function startEditRoute(route: Sub2ApiCompositeRoute): void {
  editingRoute.value = route;
  routeFormVisible.value = true;
}

async function submitRoute(input: CompositeRouteInput): Promise<void> {
  if (!selectedGroupId.value) return;
  if (editingRoute.value) {
    await updateRoute.mutateAsync({
      groupId: selectedGroupId.value,
      routeId: editingRoute.value.id,
      input,
    });
  } else {
    await createRoute.mutateAsync({ groupId: selectedGroupId.value, input });
  }
  routeFormVisible.value = false;
}

async function onToggleRoute(route: Sub2ApiCompositeRoute): Promise<void> {
  if (!selectedGroupId.value) return;
  await toggleRoute.mutateAsync({
    groupId: selectedGroupId.value,
    routeId: route.id,
    enabled: !route.enabled,
  });
}

async function onDeleteRoute(route: Sub2ApiCompositeRoute): Promise<void> {
  if (!selectedGroupId.value) return;
  const ok = await confirm({
    title: '删除路由',
    message: `确定删除路由「${route.public_model} → ${route.upstream_model || '（未指定）'}」？`,
    confirmText: '删除',
    tone: 'danger',
  });
  if (!ok) return;
  await deleteRoute.mutateAsync({ groupId: selectedGroupId.value, routeId: route.id });
}

const pendingGroupBusy = computed(
  () => createGroup.isPending.value || updateGroup.isPending.value || deleteGroup.isPending.value,
);
const pendingRouteBusy = computed(
  () => createRoute.isPending.value || updateRoute.isPending.value || deleteRoute.isPending.value,
);
</script>

<template>
  <div class="grid gap-2.5 lg:grid-cols-[260px_1fr]">
    <!-- 分组列表 -->
    <section class="border-surface-100 bg-surface-0/60 rounded border">
      <div class="border-surface-100 border-b px-3 py-2">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-surface-900 text-xs font-medium">模型分组</h3>
          <button
            type="button"
            class="text-brand-600 hover:bg-brand-500/10 flex items-center gap-0.5 rounded px-1.5 py-1 text-[11px]"
            :disabled="pendingGroupBusy"
            @click="startCreateGroup"
          >
            <Plus class="size-3" aria-hidden="true" />
            新建
          </button>
        </div>
        <form class="mt-1.5" @submit.prevent="applySearch">
          <input
            v-model="searchInput"
            type="search"
            placeholder="搜索分组…"
            class="border-surface-100 bg-surface-0 focus:border-brand-500 w-full rounded border px-2 py-1 text-[11px] focus:outline-none"
          />
        </form>
      </div>

      <ErrorBanner v-if="isError" :error="error" :compact="true" @retry="refetch()" />
      <div v-if="isLoading" class="text-surface-800/50 py-6 text-center text-[11px]" role="status">
        加载分组…
      </div>
      <div
        v-else-if="rows.length === 0"
        class="text-surface-800/50 px-3 py-6 text-center text-[11px]"
      >
        暂无分组{{ query.search ? '（当前搜索条件下）' : '' }}
      </div>

      <ul v-else class="divide-surface-100/60 max-h-[32rem] divide-y overflow-y-auto">
        <li
          v-for="group in rows"
          :key="group.id"
          class="flex cursor-pointer items-center gap-2 px-3 py-1.5"
          :class="selectedGroupId === group.id ? 'bg-brand-500/5' : 'hover:bg-surface-50'"
          @click="selectGroup(group)"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <p class="text-surface-900 truncate text-[11px] font-medium">{{ group.name }}</p>
              <StatusBadge :status="group.status" />
            </div>
            <p class="text-surface-800/50 mt-0.5 text-[10px]">
              {{ platformLabel(group.platform) }} · 账号 {{ group.active_account_count ?? '—' }}/{{
                group.account_count ?? '—'
              }}
            </p>
          </div>
          <button
            type="button"
            class="text-surface-800/50 hover:bg-surface-100 rounded p-1"
            :title="group.status === 'active' ? '停用' : '启用'"
            aria-label="切换分组状态"
            @click.stop="onToggleGroup(group)"
          >
            <Power class="size-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="text-surface-800/50 hover:bg-surface-100 rounded p-1"
            title="编辑分组"
            aria-label="编辑分组"
            @click.stop="startEditGroup(group)"
          >
            <Pencil class="size-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="rounded p-1 text-red-600/60 hover:bg-red-500/10"
            title="删除分组"
            aria-label="删除分组"
            @click.stop="onDeleteGroup(group)"
          >
            <Trash2 class="size-3" aria-hidden="true" />
          </button>
        </li>
      </ul>
      <PaginationBar
        :page="query.page ?? 1"
        :page-size="PAGE_SIZE"
        :total="data?.total ?? 0"
        :pages="data?.pages ?? 1"
        :loading="isLoading"
        @change="goPage"
      />
    </section>

    <!-- 路由表 -->
    <section class="border-surface-100 bg-surface-0/60 rounded border">
      <div class="border-surface-100 border-b px-3 py-2">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-surface-900 text-xs font-medium">
            模型路由
            <span v-if="selectedGroup" class="text-surface-800/50 font-normal"
              >（{{ selectedGroup.name }}）</span
            >
          </h3>
          <button
            v-if="selectedGroupId !== null"
            type="button"
            class="bg-brand-500 hover:bg-brand-600 flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-white"
            :disabled="pendingRouteBusy"
            @click="startCreateRoute"
          >
            <Plus class="size-3" aria-hidden="true" />
            新建路由
          </button>
        </div>
      </div>

      <!-- 无可用渠道提示 -->
      <div
        v-if="selectedGroup && (selectedGroup.active_account_count ?? 0) === 0"
        class="flex items-center gap-1.5 border-b border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-amber-700"
        role="note"
      >
        <AlertTriangle class="size-3.5 shrink-0" aria-hidden="true" />
        <p class="text-[11px]">该分组下没有可用账号（渠道），路由将无法命中上游。</p>
      </div>

      <!-- 配置冲突提示 -->
      <div
        v-for="[key, info] in conflicts"
        :key="key"
        class="flex items-center gap-1.5 border-b border-red-500/20 bg-red-500/5 px-3 py-1.5 text-red-700"
        role="note"
      >
        <AlertTriangle class="size-3.5 shrink-0" aria-hidden="true" />
        <p class="text-[11px]">
          配置冲突：「{{ key }}」存在 {{ info.count }} 条启用路由且优先级相同（{{
            info.priority
          }}）。
        </p>
      </div>

      <div v-if="!selectedGroup" class="text-surface-800/50 px-3 py-10 text-center text-[11px]">
        选择左侧分组查看模型路由
      </div>

      <ErrorBanner
        v-else-if="routesError"
        :error="routesErrorObj"
        :compact="true"
        @retry="refetchRoutes()"
      />

      <div
        v-else-if="routeRows.length === 0"
        class="text-surface-800/50 px-3 py-10 text-center text-[11px]"
      >
        该分组暂无路由，点击「新建路由」配置对外模型映射
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-left text-[11px]">
          <thead>
            <tr class="text-surface-800/50 border-surface-100 border-b">
              <th class="px-3 py-1.5 font-medium">对外模型</th>
              <th class="px-3 py-1.5 font-medium">匹配</th>
              <th class="px-3 py-1.5 font-medium">上游平台</th>
              <th class="px-3 py-1.5 font-medium">上游模型</th>
              <th class="px-3 py-1.5 font-medium">端点</th>
              <th class="px-3 py-1.5 text-right font-medium">优先级</th>
              <th class="px-3 py-1.5 font-medium">状态</th>
              <th class="px-3 py-1.5 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody class="text-surface-900">
            <tr
              v-for="route in routeRows"
              :key="route.id"
              class="border-surface-100/60 border-b last:border-0"
            >
              <td class="px-3 py-1.5 font-mono">{{ route.public_model }}</td>
              <td class="px-3 py-1.5 text-[10px]">{{ route.match_type }}</td>
              <td class="px-3 py-1.5">{{ platformLabel(route.target_platform) }}</td>
              <td class="px-3 py-1.5 font-mono text-[10px]">{{ route.upstream_model || '—' }}</td>
              <td class="px-3 py-1.5 font-mono text-[10px]">{{ route.endpoint }}</td>
              <td class="px-3 py-1.5 text-right tabular-nums">{{ route.priority }}</td>
              <td class="px-3 py-1.5">
                <StatusBadge
                  :status="route.enabled ? 'active' : 'disabled'"
                  :label="route.enabled ? '启用' : '停用'"
                />
              </td>
              <td class="px-3 py-1.5">
                <div class="flex items-center justify-end gap-0.5">
                  <button
                    type="button"
                    class="text-surface-800/60 hover:bg-surface-100 rounded p-1"
                    :title="route.enabled ? '停用' : '启用'"
                    aria-label="切换路由状态"
                    @click="onToggleRoute(route)"
                  >
                    <Power class="size-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class="text-surface-800/60 hover:bg-surface-100 rounded p-1"
                    title="编辑路由"
                    aria-label="编辑路由"
                    @click="startEditRoute(route)"
                  >
                    <Pencil class="size-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class="rounded p-1 text-red-600/70 hover:bg-red-500/10"
                    title="删除路由"
                    aria-label="删除路由"
                    @click="onDeleteRoute(route)"
                  >
                    <Trash2 class="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <GroupFormDialog
      :visible="groupFormVisible"
      :item="editingGroup"
      :busy="pendingGroupBusy"
      @close="groupFormVisible = false"
      @submit="submitGroup"
    />
    <RouteFormDialog
      :visible="routeFormVisible"
      :item="editingRoute"
      :busy="pendingRouteBusy"
      @close="routeFormVisible = false"
      @submit="submitRoute"
    />
  </div>
</template>
