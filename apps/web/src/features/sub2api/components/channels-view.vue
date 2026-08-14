<script setup lang="ts">
/** 渠道视图：搜索 / 状态筛选 / 分页 / 创建 / 编辑 / 启用禁用 / 删除（二次确认） */
import { computed, reactive, ref } from 'vue';
import { Pencil, Plus, Power, Trash2 } from '@lucide/vue';

import { confirm } from '@/app/confirm';
import type { ChannelInput, Sub2ApiChannel, Sub2ApiListQuery } from '@/services/sub2api';
import {
  useSub2ApiAllGroups,
  useSub2ApiChannels,
  useSub2ApiCreateChannel,
  useSub2ApiDeleteChannel,
  useSub2ApiToggleChannel,
  useSub2ApiUpdateChannel,
} from '../hooks';
import { formatDateTime, nextChannelStatus } from '../format';
import ChannelFormDialog from './channel-form-dialog.vue';
import ErrorBanner from './error-banner.vue';
import PaginationBar from './pagination-bar.vue';
import StatusBadge from './status-badge.vue';

const PAGE_SIZE = 10;

const query = reactive<Sub2ApiListQuery>({ page: 1, pageSize: PAGE_SIZE });
const searchInput = ref('');

const { data, isLoading, isError, error, refetch } = useSub2ApiChannels(query);
const { data: allGroups } = useSub2ApiAllGroups();

const createChannel = useSub2ApiCreateChannel();
const updateChannel = useSub2ApiUpdateChannel();
const toggleChannel = useSub2ApiToggleChannel();
const deleteChannel = useSub2ApiDeleteChannel();

const formVisible = ref(false);
const editing = ref<Sub2ApiChannel | null>(null);

function applySearch(): void {
  query.search = searchInput.value.trim() || undefined;
  query.page = 1;
}

function setStatusFilter(status: string): void {
  query.status = status === 'all' ? undefined : status;
  query.page = 1;
}

function goPage(page: number): void {
  query.page = page;
}

function startCreate(): void {
  editing.value = null;
  formVisible.value = true;
}

function startEdit(channel: Sub2ApiChannel): void {
  editing.value = channel;
  formVisible.value = true;
}

async function submitForm(input: ChannelInput): Promise<void> {
  if (editing.value) {
    await updateChannel.mutateAsync({ id: editing.value.id, input });
  } else {
    await createChannel.mutateAsync(input);
  }
  formVisible.value = false;
}

async function onToggle(channel: Sub2ApiChannel): Promise<void> {
  const next = nextChannelStatus(channel);
  const ok = await confirm({
    title: next === 'active' ? '启用渠道' : '禁用渠道',
    message:
      next === 'active'
        ? `确定启用渠道「${channel.name}」？`
        : `禁用后渠道「${channel.name}」将停止参与路由，确定继续？`,
    confirmText: next === 'active' ? '启用' : '禁用',
    tone: next === 'active' ? 'default' : 'danger',
  });
  if (!ok) return;
  await toggleChannel.mutateAsync({ id: channel.id, status: next });
}

async function onDelete(channel: Sub2ApiChannel): Promise<void> {
  const ok = await confirm({
    title: '删除渠道',
    message: `确定删除渠道「${channel.name}」？此操作不可恢复。`,
    confirmText: '删除',
    tone: 'danger',
  });
  if (!ok) return;
  await deleteChannel.mutateAsync(channel.id);
}

const rows = computed<Sub2ApiChannel[]>(() => data.value?.items ?? []);
const pendingBusy = computed(
  () =>
    createChannel.isPending.value || updateChannel.isPending.value || deleteChannel.isPending.value,
);
</script>

<template>
  <div class="space-y-2.5">
    <!-- 工具条 -->
    <div class="flex flex-wrap items-center gap-2">
      <form class="flex min-w-0 flex-1 items-center gap-1.5" @submit.prevent="applySearch">
        <input
          v-model="searchInput"
          type="search"
          placeholder="搜索渠道名称…"
          class="border-surface-100 bg-surface-0 focus:border-brand-500 min-w-0 flex-1 rounded border px-2 py-1.5 text-xs focus:outline-none"
          @keydown.enter="applySearch"
        />
        <button
          type="submit"
          class="border-surface-100 text-surface-800/70 hover:bg-surface-100 rounded border px-2.5 py-1.5 text-[11px]"
        >
          搜索
        </button>
      </form>
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="rounded px-2 py-1.5 text-[11px]"
          :class="
            query.status === undefined
              ? 'bg-surface-100 text-surface-900'
              : 'text-surface-800/60 hover:bg-surface-100'
          "
          @click="setStatusFilter('all')"
        >
          全部
        </button>
        <button
          type="button"
          class="rounded px-2 py-1.5 text-[11px]"
          :class="
            query.status === 'active'
              ? 'bg-surface-100 text-surface-900'
              : 'text-surface-800/60 hover:bg-surface-100'
          "
          @click="setStatusFilter('active')"
        >
          启用
        </button>
        <button
          type="button"
          class="rounded px-2 py-1.5 text-[11px]"
          :class="
            query.status === 'disabled'
              ? 'bg-surface-100 text-surface-900'
              : 'text-surface-800/60 hover:bg-surface-100'
          "
          @click="setStatusFilter('disabled')"
        >
          禁用
        </button>
      </div>
      <button
        type="button"
        class="bg-brand-500 hover:bg-brand-600 flex items-center gap-1 rounded px-2.5 py-1.5 text-[11px] font-medium text-white"
        :disabled="pendingBusy"
        @click="startCreate"
      >
        <Plus class="size-3.5" aria-hidden="true" />
        新建渠道
      </button>
    </div>

    <ErrorBanner v-if="isError" :error="error" @retry="refetch()" />

    <div v-if="isLoading" class="text-surface-800/50 py-10 text-center text-xs" role="status">
      加载渠道…
    </div>

    <div
      v-else-if="rows.length === 0"
      class="text-surface-800/50 border-surface-100 rounded border border-dashed py-10 text-center text-xs"
    >
      暂无渠道{{ query.search || query.status ? '（当前筛选条件下）' : '，点击「新建渠道」创建' }}
    </div>

    <section v-else class="border-surface-100 bg-surface-0/60 overflow-hidden rounded border">
      <table class="w-full text-left text-[11px]">
        <thead>
          <tr class="text-surface-800/50 border-surface-100 border-b">
            <th class="px-3 py-1.5 font-medium">名称</th>
            <th class="px-3 py-1.5 font-medium">状态</th>
            <th class="px-3 py-1.5 font-medium">计费来源</th>
            <th class="px-3 py-1.5 font-medium">分组</th>
            <th class="px-3 py-1.5 font-medium">更新时间</th>
            <th class="px-3 py-1.5 text-right font-medium">操作</th>
          </tr>
        </thead>
        <tbody class="text-surface-900">
          <tr
            v-for="channel in rows"
            :key="channel.id"
            class="border-surface-100/60 border-b last:border-0"
          >
            <td class="px-3 py-1.5">
              <p class="font-medium">{{ channel.name }}</p>
              <p
                v-if="channel.description"
                class="text-surface-800/50 max-w-[16rem] truncate text-[10px]"
              >
                {{ channel.description }}
              </p>
            </td>
            <td class="px-3 py-1.5"><StatusBadge :status="channel.status" /></td>
            <td class="px-3 py-1.5 font-mono text-[10px]">{{ channel.billing_model_source }}</td>
            <td class="px-3 py-1.5 text-[10px]">
              {{ channel.group_ids.length > 0 ? `#${channel.group_ids.join(', #')}` : '—' }}
            </td>
            <td class="px-3 py-1.5 whitespace-nowrap tabular-nums">
              {{ formatDateTime(channel.updated_at) }}
            </td>
            <td class="px-3 py-1.5">
              <div class="flex items-center justify-end gap-0.5">
                <button
                  type="button"
                  class="text-surface-800/60 hover:bg-surface-100 rounded p-1"
                  :title="channel.status === 'active' ? '禁用' : '启用'"
                  :aria-label="channel.status === 'active' ? '禁用渠道' : '启用渠道'"
                  :disabled="toggleChannel.isPending.value"
                  @click="onToggle(channel)"
                >
                  <Power class="size-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="text-surface-800/60 hover:bg-surface-100 rounded p-1"
                  title="编辑"
                  aria-label="编辑渠道"
                  @click="startEdit(channel)"
                >
                  <Pencil class="size-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="rounded p-1 text-red-600/70 hover:bg-red-500/10"
                  title="删除"
                  aria-label="删除渠道"
                  :disabled="deleteChannel.isPending.value"
                  @click="onDelete(channel)"
                >
                  <Trash2 class="size-3.5" aria-hidden="true" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <PaginationBar
        :page="query.page ?? 1"
        :page-size="PAGE_SIZE"
        :total="data?.total ?? 0"
        :pages="data?.pages ?? 1"
        :loading="isLoading"
        @change="goPage"
      />
    </section>

    <ChannelFormDialog
      :visible="formVisible"
      :item="editing"
      :groups="allGroups ?? []"
      :busy="pendingBusy"
      @close="formVisible = false"
      @submit="submitForm"
    />
  </div>
</template>
