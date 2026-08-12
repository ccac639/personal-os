<script setup lang="ts">
import { computed } from 'vue';
import { Bot, MessageSquare, Play, Sparkles, Wand2 } from '@lucide/vue';
import { AI_WORKBENCH } from './mock';
import type { AiWorkbenchInfo } from './types';

interface Props {
  /** 外部数据覆盖（测试注入；未传则用统一 mock 源） */
  data?: AiWorkbenchInfo | null;
}

const props = withDefaults(defineProps<Props>(), {
  data: undefined,
});

const info = computed<AiWorkbenchInfo | null>(() =>
  props.data === undefined ? AI_WORKBENCH : props.data,
);

/** 安全空态：Chat 数据不可用时不渲染敏感内容 */
const unavailable = computed(() => !info.value);
</script>

<template>
  <section
    class="border-surface-100 bg-surface-0 rounded-lg border p-5"
    aria-label="AI 工作台"
  >
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-surface-900 flex items-center gap-1.5 text-base font-semibold">
        <Sparkles class="size-4 text-brand-600" />
        AI 工作台
      </h2>
      <span v-if="info" class="text-surface-800/50 max-w-[9rem] truncate text-xs" :title="info.model">
        {{ info.model }}
      </span>
    </div>

    <!-- 安全空态：不展示任何未确认数据 -->
    <div
      v-if="unavailable || !info"
      class="flex h-24 flex-col items-center justify-center gap-2 text-sm text-surface-800/50"
    >
      <Bot class="size-6" />
      <p>暂无可用 AI 会话</p>
    </div>

    <div v-else class="space-y-3">
      <!-- 最近一次对话摘要 -->
      <div
        v-if="info.lastConversation"
        class="border-surface-100 bg-surface-50 rounded-lg border p-3"
      >
        <p class="text-surface-800/60 mb-1 flex items-center gap-1 text-xs">
          <MessageSquare class="size-3.5" />
          最近对话
        </p>
        <p class="text-surface-900 line-clamp-2 text-sm">{{ info.lastConversation }}</p>
      </div>

      <!-- 待处理 AI 任务 -->
      <div v-if="info.pendingTasks.length > 0">
        <p class="text-surface-800/60 mb-1 text-xs">待处理 AI 任务</p>
        <ul class="space-y-1">
          <li
            v-for="task in info.pendingTasks"
            :key="task"
            class="text-surface-900 flex items-center gap-1.5 truncate text-sm"
          >
            <span class="bg-brand-500 size-1.5 shrink-0 rounded-full" />
            {{ task }}
          </li>
        </ul>
      </div>

      <!-- 快速开始 / 继续上次 -->
      <div class="grid grid-cols-2 gap-2">
        <router-link
          to="/chat"
          class="bg-brand-600 hover:bg-brand-700 text-surface-0 focus-visible:ring-brand-500/40 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition focus-visible:ring-2 focus-visible:outline-none active:scale-[0.98]"
        >
          <Play class="size-3.5" />
          开始对话
        </router-link>
        <router-link
          to="/chat"
          class="border-surface-100 text-surface-800/70 hover:border-surface-800/30 hover:bg-surface-50 focus-visible:ring-brand-500/40 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition focus-visible:ring-2 focus-visible:outline-none active:scale-[0.98]"
        >
          <MessageSquare class="size-3.5" />
          继续上次
        </router-link>
      </div>

      <!-- 提示词模板 -->
      <div v-if="info.templates.length > 0">
        <p class="text-surface-800/60 mb-1.5 text-xs">提示词模板</p>
        <div class="flex flex-wrap gap-1.5">
          <router-link
            v-for="tpl in info.templates"
            :key="tpl"
            to="/chat"
            class="border-surface-100 hover:border-brand-500/40 text-surface-800/70 hover:text-brand-600 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition focus-visible:ring-2 focus-visible:outline-none"
          >
            <Wand2 class="size-3" />
            {{ tpl }}
          </router-link>
        </div>
      </div>
    </div>
  </section>
</template>
