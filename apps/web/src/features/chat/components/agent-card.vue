<script setup lang="ts">
import { Bot, Star, StarOff } from '@lucide/vue';

import { agentCategoryLabel, agentIcon } from '../agents';
import { useAgentsStore } from '../agent-store';
import { pushToast } from '../toast';
import type { ChatAgent } from '../agent-types';
import { requestIdSuffix } from '@/features/agents/errors';

const props = defineProps<{ agent: ChatAgent }>();

const emit = defineEmits<{ open: [id: string]; launch: [id: string] }>();

const store = useAgentsStore();

async function toggleFavorite(e: MouseEvent) {
  e.stopPropagation();
  const ok = await store.toggleFavorite(props.agent.id);
  if (!ok && store.actionError) {
    pushToast(store.actionError.message + requestIdSuffix(store.actionError), 'error');
  }
}
</script>

<template>
  <div
    class="border-surface-100 bg-surface-0/70 hover:border-brand-500/40 hover:bg-surface-0 group relative flex cursor-pointer flex-col gap-2 rounded-xl border p-3.5 transition-colors"
    role="button"
    tabindex="0"
    :aria-label="`打开智能体 ${agent.name}`"
    @click="emit('open', agent.id)"
    @keydown.enter="emit('open', agent.id)"
    @keydown.space.prevent="emit('open', agent.id)"
  >
    <div class="flex items-start gap-2.5">
      <div
        class="flex size-9 shrink-0 items-center justify-center rounded-lg text-white"
        :style="{ background: agent.color }"
        aria-hidden="true"
      >
        <component :is="agentIcon(agent.icon)" class="size-4.5" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-surface-900 truncate text-sm font-medium">{{ agent.name }}</p>
        <p class="text-surface-800/50 truncate text-[11px]">
          {{ agentCategoryLabel(agent.category) }}
        </p>
      </div>
      <button
        class="text-surface-800/40 focus-visible:ring-brand-500/40 flex size-6 shrink-0 items-center justify-center rounded transition-colors hover:text-amber-500 focus-visible:ring-2 focus-visible:outline-none"
        :class="agent.favorite ? 'text-amber-500' : ''"
        :aria-pressed="agent.favorite"
        :aria-label="agent.favorite ? '取消收藏' : '收藏'"
        :title="agent.favorite ? '取消收藏' : '收藏'"
        @click="toggleFavorite"
      >
        <Star v-if="agent.favorite" class="size-3.5 fill-current" />
        <StarOff v-else class="size-3.5" />
      </button>
    </div>

    <p class="text-surface-800/70 line-clamp-2 min-h-[2.2em] text-xs leading-relaxed">
      {{ agent.description }}
    </p>

    <div class="flex min-w-0 flex-wrap items-center gap-1">
      <span
        v-for="t in agent.tags.slice(0, 3)"
        :key="t"
        class="border-surface-100 bg-surface-50 text-surface-800/60 rounded border px-1.5 py-px text-[10px]"
      >
        {{ t }}
      </span>
      <span
        v-if="!agent.builtin"
        class="bg-brand-500/10 text-brand-600 rounded px-1.5 py-px text-[10px] font-medium"
      >
        个人
      </span>
    </div>

    <div class="flex items-center justify-between">
      <span class="text-surface-800/35 text-[10px]"> 使用 {{ agent.usageCount }} 次 </span>
      <button
        class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium text-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
        aria-label="开始使用"
        title="开始使用"
        @click.stop="emit('launch', agent.id)"
      >
        <Bot class="size-3" />
        开始使用
      </button>
    </div>
  </div>
</template>
