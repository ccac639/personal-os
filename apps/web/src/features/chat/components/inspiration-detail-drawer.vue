<script setup lang="ts">
import {
  Archive,
  ArchiveRestore,
  Bot,
  Copy,
  CopyCheck,
  CopyPlus,
  Lightbulb,
  Pin,
  Star,
  Trash2,
} from '@lucide/vue';
import { computed, ref } from 'vue';

import ChatDrawer from './chat-drawer.vue';
import { inspirationCategoryLabel, inspirationSourceLabel } from '../inspiration';
import { useInspirationStore } from '../inspiration-store';
import { useAgentsStore } from '../agent-store';
import { modelLabel } from '../models';
import { pushToast } from '../toast';

const props = defineProps<{ open: boolean; itemId: string | null }>();

const emit = defineEmits<{
  close: [];
  created: [sessionId: string];
  agentVariant: [inspirationId: string];
}>();

const store = useInspirationStore();
const agentsStore = useAgentsStore();

const item = computed(() => store.itemById(props.itemId ?? ''));

const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

/** 删除二次确认 */
const confirmDelete = ref(false);

const relatedAgentName = computed(() => {
  if (!item.value?.relatedAgentId) return null;
  return agentsStore.agentById(item.value.relatedAgentId)?.name ?? null;
});

function fmt(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function copyPrompt() {
  if (!item.value) return;
  try {
    await navigator.clipboard.writeText(item.value.prompt);
    copied.value = true;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copied.value = false;
      copyTimer = null;
    }, 1500);
  } catch {
    pushToast('复制失败，请手动选择文本', 'warning');
  }
}

function handleCreate() {
  if (!item.value) return;
  const sessionId = store.createChatDraft(item.value.id);
  if (sessionId) emit('created', sessionId);
}

function handleDelete() {
  if (!item.value) return;
  if (!confirmDelete.value) {
    confirmDelete.value = true;
    return;
  }
  store.deleteInspiration(item.value.id);
  confirmDelete.value = false;
  pushToast('已删除灵感', 'info');
  emit('close');
}
</script>

<template>
  <ChatDrawer
    :open="open"
    :title="item?.title ?? '灵感详情'"
    aria-label="灵感详情"
    @close="emit('close')"
  >
    <template v-if="item">
      <div class="flex flex-col gap-4 p-4">
        <!-- 元信息 -->
        <div class="flex flex-wrap items-center gap-1.5">
          <span
            class="rounded px-1.5 py-px text-[10px] font-medium"
            :style="{
              color: 'var(--chat-cyan)',
              background: 'color-mix(in srgb, var(--chat-cyan) 10%, transparent)',
            }"
          >
            {{ inspirationCategoryLabel(item.category) }}
          </span>
          <span class="text-surface-800/45 text-[10px]">{{ inspirationSourceLabel(item.source) }}</span>
          <span
            v-for="t in item.tags"
            :key="t"
            class="border-surface-100 bg-surface-50 text-surface-800/55 rounded border px-1.5 py-px text-[10px]"
          >{{ t }}</span>
        </div>

        <!-- 摘要 -->
        <p class="text-surface-800/75 text-xs leading-relaxed">{{ item.summary }}</p>

        <!-- 创作目标 -->
        <div v-if="item.creativeGoal">
          <p class="text-surface-900 mb-1 text-xs font-semibold">创作目标</p>
          <p class="text-surface-800/75 text-xs leading-relaxed">{{ item.creativeGoal }}</p>
        </div>

        <!-- 关联 -->
        <div v-if="item.relatedModelId || item.relatedAgentId || item.relatedConversationId" class="border-surface-100 bg-surface-50/60 flex flex-col gap-1 rounded-lg border p-3 text-[11px]">
          <p v-if="item.relatedModelId" class="text-surface-800/70">关联模型：{{ modelLabel(item.relatedModelId) }}</p>
          <p v-if="item.relatedAgentId" class="text-surface-800/70">关联智能体：{{ relatedAgentName ?? item.relatedAgentId }}</p>
          <p v-if="item.relatedConversationId" class="text-surface-800/45 truncate">来源会话：{{ item.relatedConversationId.slice(0, 10) }}…</p>
        </div>

        <!-- 完整提示词 -->
        <div>
          <div class="mb-1.5 flex items-center justify-between">
            <p class="text-surface-900 text-xs font-semibold">提示词</p>
            <button
              class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2"
              :aria-label="copied ? '已复制' : '复制提示词'"
              @click="copyPrompt"
            >
              <CopyCheck v-if="copied" class="size-3 text-green-600" />
              <Copy v-else class="size-3" />
              {{ copied ? '已复制' : '复制' }}
            </button>
          </div>
          <pre class="border-surface-100 bg-surface-50/60 text-surface-800/85 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border p-3 font-mono text-[11px] leading-relaxed">{{ item.prompt }}</pre>
        </div>

        <!-- 时间 -->
        <p class="text-surface-800/35 text-[10px]">创建：{{ fmt(item.createdAt) }} · 更新：{{ fmt(item.updatedAt) }}</p>
      </div>
    </template>

    <template #footer>
      <div class="flex flex-wrap items-center gap-1">
        <button
          class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2"
          :class="item?.favorite ? 'text-amber-500' : ''"
          :aria-pressed="item?.favorite ?? false"
          :aria-label="item?.favorite ? '取消收藏' : '收藏'"
          :title="item?.favorite ? '取消收藏' : '收藏'"
          @click="item && store.toggleFavorite(item.id)"
        >
          <Star class="size-3.5" :class="item?.favorite ? 'fill-current' : ''" />
        </button>
        <button
          class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2"
          :class="item?.pinned ? 'text-amber-500' : ''"
          :aria-pressed="item?.pinned ?? false"
          :aria-label="item?.pinned ? '取消置顶' : '置顶'"
          :title="item?.pinned ? '取消置顶' : '置顶'"
          @click="item && store.togglePinned(item.id)"
        >
          <Pin class="size-3.5" :class="item?.pinned ? 'fill-current' : ''" />
        </button>
        <button
          class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2"
          :aria-label="item?.archived ? '恢复' : '归档'"
          :title="item?.archived ? '恢复' : '归档'"
          @click="item && store.toggleArchived(item.id)"
        >
          <ArchiveRestore v-if="item?.archived" class="size-3.5" />
          <Archive v-else class="size-3.5" />
        </button>
        <button
          class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2"
          :aria-label="`复制为灵感 ${item?.title ?? ''}`"
          :title="'复制为灵感'"
          @click="item && store.duplicateItem(item.id)"
        >
          <CopyPlus class="size-3.5" />
        </button>
        <button
          class="hover:bg-red-50 focus-visible:ring-red-500/40 ml-1 flex size-7 items-center justify-center rounded-md text-red-500 transition-colors focus-visible:outline-none focus-visible:ring-2"
          :class="confirmDelete ? 'bg-red-500 text-white hover:bg-red-600' : ''"
          :aria-label="confirmDelete ? '确认删除（再次点击）' : '删除'"
          :title="confirmDelete ? '再次点击确认删除' : '删除'"
          @click="handleDelete"
        >
          <Trash2 class="size-3.5" />
        </button>
        <span v-if="confirmDelete" class="text-red-500 text-[10px]" role="alert">再次点击确认</span>

        <button
          class="hover:bg-surface-100 text-surface-800/70 hover:text-surface-900 focus-visible:ring-brand-500/40 ml-auto flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
          :aria-label="`基于「${item?.title ?? ''}」创建智能体变体`"
          @click="item && emit('agentVariant', item.id)"
        >
          <Bot class="size-3.5" />
          变体
        </button>
        <button
          class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-3.5 py-1.5 text-xs font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2"
          aria-label="基于此创作"
          @click="handleCreate"
        >
          <Lightbulb class="size-3.5" />
          基于此创作
        </button>
      </div>
    </template>
  </ChatDrawer>
</template>
