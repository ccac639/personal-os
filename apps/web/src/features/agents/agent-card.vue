<script setup lang="ts">
/**
 * Agents 管理 —— 智能体卡片
 *
 * 展示后端契约字段（名称 / 类型 / 提供方 / 模型 / 描述 / 启用状态 / 使用次数），
 * 行级操作：查看（整卡）、收藏、编辑（个人）、删除（个人，带 pending）。
 * 操作按钮常显（不依赖 hover），保证移动端可发现、无横向溢出。
 */
import { Bot, Eye, Loader2, Pencil, Star, StarOff, Trash2 } from '@lucide/vue';
import { computed } from 'vue';

import { AGENT_KIND_LABELS, AGENT_PROVIDER_LABELS } from './meta';
import type { AgentRecord } from './types';

const props = defineProps<{
  agent: AgentRecord;
  /** 删除请求进行中（行级禁用） */
  deleting?: boolean;
  /** 收藏切换进行中 */
  toggling?: boolean;
}>();

const emit = defineEmits<{
  open: [id: string];
  edit: [id: string];
  delete: [id: string];
  'toggle-favorite': [id: string];
}>();

const kindLabel = computed(() => AGENT_KIND_LABELS[props.agent.kind]);
const providerLabel = computed(() => AGENT_PROVIDER_LABELS[props.agent.provider]);
const isPersonal = computed(() => props.agent.kind === 'personal');
</script>

<template>
  <div
    class="border-surface-100 bg-surface-0/70 hover:border-brand-500/40 hover:bg-surface-0 group relative flex cursor-pointer flex-col gap-2 rounded-xl border p-3.5 transition-colors"
    :class="agent.enabled ? '' : 'opacity-75'"
    role="button"
    tabindex="0"
    :aria-label="`查看智能体 ${agent.name}`"
    @click="emit('open', agent.id)"
    @keydown.enter="emit('open', agent.id)"
    @keydown.space.prevent="emit('open', agent.id)"
  >
    <div class="flex items-start gap-2.5">
      <div
        class="bg-brand-500/10 text-brand-600 flex size-9 shrink-0 items-center justify-center rounded-lg"
        aria-hidden="true"
      >
        <Bot class="size-4.5" />
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-1.5">
          <p class="text-surface-900 truncate text-sm font-medium">{{ agent.name }}</p>
          <span
            class="shrink-0 rounded px-1.5 py-px text-[10px] font-medium"
            :class="
              agent.kind === 'builtin'
                ? 'bg-surface-100 text-surface-800/60'
                : 'bg-brand-500/10 text-brand-600'
            "
          >
            {{ kindLabel }}
          </span>
        </div>
        <p class="text-surface-800/50 truncate text-[11px]">
          {{ providerLabel }} · {{ agent.model }}
        </p>
      </div>

      <button
        class="text-surface-800/40 focus-visible:ring-brand-500/40 flex size-6 shrink-0 items-center justify-center rounded transition-colors hover:text-amber-500 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
        :class="agent.favorite ? 'text-amber-500' : ''"
        :disabled="toggling || deleting"
        :aria-pressed="agent.favorite"
        :aria-label="agent.favorite ? `取消收藏 ${agent.name}` : `收藏 ${agent.name}`"
        :title="agent.favorite ? '取消收藏' : '收藏'"
        data-testid="agent-card-favorite"
        @click.stop="emit('toggle-favorite', agent.id)"
      >
        <Star v-if="agent.favorite" class="size-3.5 fill-current" />
        <StarOff v-else class="size-3.5" />
      </button>
    </div>

    <p class="text-surface-800/70 line-clamp-2 min-h-[2.2em] text-xs leading-relaxed">
      {{ agent.description || '暂无简介' }}
    </p>

    <div class="flex items-center justify-between gap-2">
      <div class="flex min-w-0 items-center gap-1.5">
        <span
          class="size-1.5 shrink-0 rounded-full"
          :class="agent.enabled ? 'bg-emerald-500' : 'bg-surface-800/30'"
          aria-hidden="true"
        />
        <span class="text-surface-800/50 truncate text-[11px]">{{
          agent.enabled ? '已启用' : '已停用'
        }}</span>
        <span class="text-surface-800/35 hidden shrink-0 text-[10px] sm:inline">
          使用 {{ agent.usageCount }} 次
        </span>
      </div>

      <div class="flex shrink-0 items-center gap-0.5">
        <button
          class="hover:bg-surface-100 hover:text-brand-600 focus-visible:ring-brand-500/40 flex size-6 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
          :aria-label="`查看 ${agent.name}`"
          :title="'查看'"
          @click.stop="emit('open', agent.id)"
        >
          <Eye class="size-3" />
        </button>
        <button
          v-if="isPersonal"
          class="hover:bg-surface-100 hover:text-brand-600 focus-visible:ring-brand-500/40 flex size-6 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
          :aria-label="`编辑 ${agent.name}`"
          :title="'编辑'"
          data-testid="agent-card-edit"
          @click.stop="emit('edit', agent.id)"
        >
          <Pencil class="size-3" />
        </button>
        <button
          v-if="isPersonal"
          class="focus-visible:ring-brand-500/40 flex size-6 items-center justify-center rounded-md transition-colors hover:bg-red-500/10 hover:text-red-500 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
          :disabled="deleting"
          :aria-label="`删除 ${agent.name}`"
          :title="'删除'"
          data-testid="agent-card-delete"
          @click.stop="emit('delete', agent.id)"
        >
          <Loader2 v-if="deleting" class="size-3 animate-spin" />
          <Trash2 v-else class="size-3" />
        </button>
      </div>
    </div>
  </div>
</template>
