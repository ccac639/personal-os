<script setup lang="ts">
import { Copy, CopyCheck, Pencil, Play, Star } from '@lucide/vue';
import { computed, ref } from 'vue';

import ChatDrawer from './chat-drawer.vue';
import { agentCategoryLabel, agentIcon } from '../agents';
import { useAgentsStore } from '../agent-store';
import { modelLabel } from '../models';
import { promptPresetName } from '../presets';
import { pushToast } from '../toast';
import { requestIdSuffix } from '@/features/agents/errors';

const props = defineProps<{ open: boolean; agentId: string | null }>();

const emit = defineEmits<{
  close: [];
  launch: [id: string];
  edit: [id: string];
}>();

const store = useAgentsStore();

const resolved = computed(() => store.agentById(props.agentId ?? ''));

const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

const modeLabel = computed(() => {
  const mode = resolved.value?.recommendedMode ?? 'chat';
  return mode === 'chat'
    ? '对话'
    : mode === 'writing'
      ? '写作'
      : mode === 'code'
        ? '代码'
        : '图像提示词';
});

async function copyPrompt() {
  if (!resolved.value) return;
  try {
    await navigator.clipboard.writeText(resolved.value.systemPrompt);
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

async function toggleFavorite() {
  if (!resolved.value) return;
  const ok = await store.toggleFavorite(resolved.value.id);
  if (!ok && store.actionError) {
    pushToast(store.actionError.message + requestIdSuffix(store.actionError), 'error');
  }
}

function handleLaunch() {
  if (resolved.value) emit('launch', resolved.value.id);
}
</script>

<template>
  <ChatDrawer
    :open="open"
    :title="resolved?.name ?? '智能体详情'"
    aria-label="智能体详情"
    @close="emit('close')"
  >
    <template v-if="resolved">
      <div class="flex flex-col gap-4 p-4">
        <!-- 头部 -->
        <div class="flex items-center gap-3">
          <div
            class="flex size-11 shrink-0 items-center justify-center rounded-xl text-white"
            :style="{ background: resolved.color }"
            aria-hidden="true"
          >
            <component :is="agentIcon(resolved.icon)" class="size-5" />
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <h3 class="text-surface-900 truncate text-sm font-semibold">{{ resolved.name }}</h3>
              <span
                v-if="!resolved.builtin"
                class="bg-brand-500/10 text-brand-600 rounded px-1.5 py-px text-[10px] font-medium"
                >个人</span
              >
            </div>
            <p class="text-surface-800/50 text-[11px]">
              {{ agentCategoryLabel(resolved.category) }}
            </p>
          </div>
          <button
            class="text-surface-800/40 focus-visible:ring-brand-500/40 ml-auto flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:text-amber-500 focus-visible:ring-2 focus-visible:outline-none"
            :class="resolved.favorite ? 'text-amber-500' : ''"
            :aria-pressed="resolved.favorite"
            :aria-label="resolved.favorite ? '取消收藏' : '收藏'"
            :title="resolved.favorite ? '取消收藏' : '收藏'"
            @click="toggleFavorite"
          >
            <Star class="size-4" :class="resolved.favorite ? 'fill-current' : ''" />
          </button>
        </div>

        <!-- 简介 -->
        <p class="text-surface-800/80 text-xs leading-relaxed">{{ resolved.description }}</p>

        <!-- 标签 -->
        <div class="flex flex-wrap gap-1">
          <span
            v-for="t in resolved.tags"
            :key="t"
            class="border-surface-100 bg-surface-50 text-surface-800/60 rounded border px-1.5 py-px text-[10px]"
            >{{ t }}</span
          >
        </div>

        <!-- 推荐配置 -->
        <div
          class="border-surface-100 bg-surface-50/60 grid grid-cols-2 gap-2 rounded-lg border p-3"
        >
          <div>
            <p class="text-surface-800/40 text-[10px]">推荐模型</p>
            <p class="text-surface-900 mt-0.5 text-xs font-medium">
              {{ modelLabel(resolved.recommendedModelId) }}
            </p>
          </div>
          <div>
            <p class="text-surface-800/40 text-[10px]">输出模式</p>
            <p class="text-surface-900 mt-0.5 text-xs font-medium">{{ modeLabel }}</p>
          </div>
          <div>
            <p class="text-surface-800/40 text-[10px]">使用次数</p>
            <p class="text-surface-900 mt-0.5 text-xs font-medium">{{ resolved.usageCount }} 次</p>
          </div>
          <div>
            <p class="text-surface-800/40 text-[10px]">最近使用</p>
            <p class="text-surface-900 mt-0.5 text-xs font-medium">
              {{
                resolved.lastUsedAt
                  ? new Date(resolved.lastUsedAt).toLocaleDateString('zh-CN')
                  : '从未'
              }}
            </p>
          </div>
        </div>

        <!-- 示例任务 -->
        <div v-if="resolved.starterPrompts.length > 0">
          <p class="text-surface-900 mb-1.5 text-xs font-semibold">示例任务</p>
          <ul class="flex flex-col gap-1">
            <li
              v-for="(s, i) in resolved.starterPrompts"
              :key="i"
              class="border-surface-100 bg-surface-0 text-surface-800/75 rounded-lg border px-2.5 py-1.5 text-[11px]"
            >
              {{ s }}
            </li>
          </ul>
        </div>

        <!-- 系统提示词摘要 -->
        <div>
          <div class="mb-1.5 flex items-center justify-between">
            <p class="text-surface-900 text-xs font-semibold">系统提示词</p>
            <button
              class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] transition-colors focus-visible:ring-2 focus-visible:outline-none"
              :aria-label="copied ? '已复制' : '复制系统提示词'"
              @click="copyPrompt"
            >
              <CopyCheck v-if="copied" class="size-3 text-green-600" />
              <Copy v-else class="size-3" />
              {{ copied ? '已复制' : '复制' }}
            </button>
          </div>
          <pre
            class="border-surface-100 bg-surface-50/60 text-surface-800/80 max-h-40 overflow-y-auto rounded-lg border p-2.5 text-[11px] leading-relaxed whitespace-pre-wrap"
            >{{ resolved.systemPrompt }}</pre>
          <p class="text-surface-800/35 mt-1 text-[10px]">
            启动后作为会话级提示词生效（{{ promptPresetName('agent:' + resolved.id) }}）
          </p>
        </div>
      </div>
    </template>

    <template #footer>
      <button
        v-if="!resolved?.builtin"
        class="hover:bg-surface-100 text-surface-800/70 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
        :aria-label="`编辑 ${resolved?.name ?? ''}`"
        @click="resolved && emit('edit', resolved.id)"
      >
        <Pencil class="size-3.5" />
        编辑
      </button>
      <button
        class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-4 py-1.5 text-xs font-medium text-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
        aria-label="开始使用"
        @click="handleLaunch"
      >
        <Play class="size-3.5" />
        开始使用
      </button>
    </template>
  </ChatDrawer>
</template>
