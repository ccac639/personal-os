<script setup lang="ts">
/**
 * Agents 管理 —— 智能体详情抽屉（查看 + 快捷操作）
 *
 * 展示后端契约全字段；行级 pending 由 store.togglingIds 驱动。
 * 个人智能体：编辑 / 删除；内置模板：隐藏（后端禁止删除内置，可隐藏）。
 */
import { Loader2, Pencil, Star, StarOff, Trash2 } from '@lucide/vue';
import { computed } from 'vue';

import AppDrawer from '@/components/AppDrawer.vue';
import { confirm, toast } from '@/app/ui';

import {
  AGENT_KIND_LABELS,
  AGENT_PROVIDER_LABELS,
  formatDateTime,
  formatRelativeTime,
} from './meta';
import { useAgentAdminStore } from './store';
import type { AgentRecord } from './types';

const props = defineProps<{
  open: boolean;
  agent: AgentRecord | null;
}>();

const emit = defineEmits<{ close: []; edit: [id: string]; delete: [id: string] }>();

const store = useAgentAdminStore();

const toggling = computed(() => (props.agent ? store.togglingIds.includes(props.agent.id) : false));
const deleting = computed(() => (props.agent ? store.deletingIds.includes(props.agent.id) : false));

const metaRows = computed(() => {
  const a = props.agent;
  if (!a) return [];
  return [
    { label: '类型', value: AGENT_KIND_LABELS[a.kind] },
    { label: '提供方', value: AGENT_PROVIDER_LABELS[a.provider] },
    { label: '模型', value: a.model },
    { label: '使用次数', value: String(a.usageCount) },
    { label: '最后使用', value: formatRelativeTime(a.lastUsedAt) },
    { label: '创建时间', value: formatDateTime(a.createdAt) },
    { label: '更新时间', value: formatDateTime(a.updatedAt) },
  ];
});

async function toggleFavorite(): Promise<void> {
  const a = props.agent;
  if (!a || toggling.value) return;
  const next = !a.favorite;
  const ok = await store.toggleFavorite(a.id);
  if (ok) toast.success(next ? `已收藏「${a.name}」` : `已取消收藏「${a.name}」`);
  else toast.error(store.actionError?.message ?? '操作失败');
}

async function toggleEnabled(): Promise<void> {
  const a = props.agent;
  if (!a || toggling.value) return;
  const next = !a.enabled;
  const ok = await store.setEnabled(a.id, next);
  if (ok) toast.success(next ? `已启用「${a.name}」` : `已停用「${a.name}」`);
  else toast.error(store.actionError?.message ?? '操作失败');
}

/** 内置模板：隐藏（二次确认），隐藏后从列表移除 */
async function hideAgent(): Promise<void> {
  const a = props.agent;
  if (!a || toggling.value) return;
  const ok = await confirm({
    title: '隐藏内置智能体',
    message: `隐藏「${a.name}」后将不再出现在列表中，确定隐藏吗？`,
    confirmText: '隐藏',
    tone: 'danger',
  });
  if (!ok) return;
  const updated = await store.updateAgent(a.id, { hidden: true }, 'toggle');
  if (updated) {
    toast.success(`已隐藏「${a.name}」`);
    void store.fetchList();
    emit('close');
  } else {
    toast.error(store.actionError?.message ?? '隐藏失败');
  }
}

function onClose(): void {
  if (toggling.value || deleting.value) return;
  emit('close');
}
</script>

<template>
  <AppDrawer :open="open" :title="agent ? agent.name : '智能体详情'" @close="onClose">
    <div v-if="agent" class="flex flex-col gap-4 p-4">
      <!-- 状态徽标与快捷操作 -->
      <div class="flex flex-wrap items-center gap-2">
        <span
          class="rounded-full px-2 py-0.5 text-[11px] font-medium"
          :class="
            agent.enabled
              ? 'bg-emerald-500/10 text-emerald-600'
              : 'bg-surface-100 text-surface-800/60'
          "
        >
          {{ agent.enabled ? '已启用' : '已停用' }}
        </span>
        <span
          class="rounded-full px-2 py-0.5 text-[11px] font-medium"
          :class="
            agent.kind === 'builtin'
              ? 'bg-surface-100 text-surface-800/60'
              : 'bg-brand-500/10 text-brand-600'
          "
        >
          {{ AGENT_KIND_LABELS[agent.kind] }}
        </span>
        <span
          v-if="agent.favorite"
          class="flex items-center gap-1 text-[11px] font-medium text-amber-500"
        >
          <Star class="size-3 fill-current" />
          已收藏
        </span>

        <div class="min-w-0 flex-1" />

        <button
          class="hover:bg-surface-100 text-surface-800/70 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors hover:text-amber-500 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
          :disabled="toggling"
          :aria-pressed="agent.favorite"
          data-testid="detail-toggle-favorite"
          @click="toggleFavorite"
        >
          <Loader2 v-if="toggling" class="size-3 animate-spin" />
          <Star v-else-if="agent.favorite" class="size-3 fill-current" />
          <StarOff v-else class="size-3" />
          {{ agent.favorite ? '取消收藏' : '收藏' }}
        </button>
        <button
          class="hover:bg-surface-100 text-surface-800/70 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
          :disabled="toggling"
          data-testid="detail-toggle-enabled"
          @click="toggleEnabled"
        >
          <Loader2 v-if="toggling" class="size-3 animate-spin" />
          {{ agent.enabled ? '停用' : '启用' }}
        </button>
      </div>

      <!-- 简介 -->
      <section v-if="agent.description" class="flex flex-col gap-1">
        <h3 class="text-surface-800/50 text-[11px] font-medium">简介</h3>
        <p class="text-surface-800/80 text-xs leading-relaxed whitespace-pre-wrap">
          {{ agent.description }}
        </p>
      </section>

      <!-- 基本信息 -->
      <section class="flex flex-col gap-1.5">
        <h3 class="text-surface-800/50 text-[11px] font-medium">基本信息</h3>
        <dl class="border-surface-100 divide-surface-100 divide-y rounded-lg border">
          <div
            v-for="row in metaRows"
            :key="row.label"
            class="flex items-center justify-between gap-3 px-3 py-1.5"
          >
            <dt class="text-surface-800/50 shrink-0 text-[11px]">{{ row.label }}</dt>
            <dd class="text-surface-900 min-w-0 truncate text-right text-xs">{{ row.value }}</dd>
          </div>
        </dl>
      </section>

      <!-- 系统提示词 -->
      <section class="flex flex-col gap-1">
        <h3 class="text-surface-800/50 text-[11px] font-medium">系统提示词</h3>
        <pre
          class="border-surface-100 bg-surface-50 text-surface-800/80 max-h-48 overflow-y-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap"
          >{{ agent.systemPrompt || '（未设置）' }}</pre>
      </section>

      <!-- 个人：编辑 / 删除；内置：隐藏 -->
      <section v-if="agent.kind === 'personal'" class="border-surface-100 flex gap-2 border-t pt-3">
        <button
          class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
          data-testid="detail-edit"
          @click="emit('edit', agent.id)"
        >
          <Pencil class="size-3" />
          编辑
        </button>
        <button
          class="focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/5 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
          :disabled="toggling || deleting"
          data-testid="detail-delete"
          @click="emit('delete', agent.id)"
        >
          <Loader2 v-if="deleting" class="size-3 animate-spin" />
          <Trash2 v-else class="size-3" />
          {{ deleting ? '删除中…' : '删除' }}
        </button>
      </section>
      <section v-else class="border-surface-100 flex gap-2 border-t pt-3">
        <button
          class="border-surface-100 hover:bg-surface-100 text-surface-800/70 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
          :disabled="toggling"
          data-testid="detail-hide"
          @click="hideAgent"
        >
          <Loader2 v-if="toggling" class="size-3 animate-spin" />
          隐藏
        </button>
      </section>
    </div>
  </AppDrawer>
</template>
