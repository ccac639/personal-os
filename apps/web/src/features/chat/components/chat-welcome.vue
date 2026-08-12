<script setup lang="ts">
import { computed } from 'vue';
import { motion } from 'motion-v';

import { suggestionsForDisplay } from '../models';
import { useChatStore } from '../store';

const store = useChatStore();

/** 建议任务：输出模式优先，对话模式回退到当前模型类别 */
const suggestions = computed(() =>
  suggestionsForDisplay(
    store.prefs.outputMode,
    store.currentModelInfo?.category ?? 'chat',
  ),
);

function ask(prompt: string) {
  store.sendMessage(prompt);
}
</script>

<template>
  <div class="relative flex h-full flex-col items-center justify-center overflow-hidden px-6">
    <!-- 氛围光斑（克制） -->
    <div class="pointer-events-none absolute inset-0" aria-hidden="true">
      <div class="bg-brand-500/5 absolute -top-20 left-1/4 size-80 rounded-full blur-3xl" />
    </div>

    <div class="relative w-full max-w-2xl">
      <!-- 当前模型标识与能力说明 -->
      <motion.div
        class="flex flex-col items-center text-center"
        :initial="{ opacity: 0, y: 12 }"
        :animate="{ opacity: 1, y: 0 }"
        :transition="{ type: 'spring', stiffness: 260, damping: 22 }"
      >
        <div
          class="flex size-12 items-center justify-center rounded-xl text-lg font-bold text-white shadow-sm"
          :style="{ background: store.currentModelInfo?.color ?? 'var(--chat-mono)' }"
        >
          {{ store.currentModelInfo?.label.slice(0, 1) ?? 'AI' }}
        </div>
        <h1 class="mt-4 flex items-center gap-2 text-xl font-semibold tracking-tight">
          {{ store.currentModelInfo?.label ?? '个人 AI 工作区' }}
          <span
            v-if="store.currentModelInfo"
            class="rounded px-1.5 py-0.5 text-[10px] font-medium"
            :style="{ color: store.currentModelInfo.color, background: 'color-mix(in srgb, ' + store.currentModelInfo.color + ' 12%, transparent)' }"
          >
            {{ store.currentModelInfo.provider }}
          </span>
        </h1>
        <p class="text-surface-800/55 mt-1.5 max-w-md text-sm">
          {{ store.currentModelInfo?.description ?? '本地 AI 工作区：模型库、会话与创作控制台。' }}
        </p>
        <div class="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
          <span
            v-for="tag in store.currentModelInfo?.tags ?? []"
            :key="tag"
            class="border-surface-100 text-surface-800/55 rounded-full border px-2 py-0.5 text-[11px]"
          >
            {{ tag }}
          </span>
          <span
            v-if="store.currentModelInfo"
            class="text-surface-800/35 text-[11px]"
          >
            {{ store.currentModelInfo.context }}
          </span>
        </div>
      </motion.div>

      <!-- 基于当前模型类别的建议任务 -->
      <div class="mt-7 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <motion.button
          v-for="(item, i) in suggestions"
          :key="item.id"
          class="border-surface-100 hover:border-brand-300 bg-surface-0 group flex items-center gap-3 rounded-card border p-3.5 text-left shadow-card transition-all duration-200 hover:-translate-y-0.5"
          :initial="{ opacity: 0, y: 12 }"
          :animate="{ opacity: 1, y: 0 }"
          :transition="{
            type: 'spring',
            stiffness: 300,
            damping: 24,
            delay: 0.06 + i * 0.05,
          }"
          :while-tap="{ scale: 0.98 }"
          @click="ask(item.prompt)"
        >
          <span class="min-w-0">
            <span class="text-surface-900 block text-sm font-medium">{{ item.title }}</span>
            <span class="text-surface-800/50 mt-0.5 block truncate text-xs">
              {{ item.description }}
            </span>
          </span>
        </motion.button>
      </div>

      <p class="text-surface-800/35 mt-5 text-center text-[11px]">
        Enter 发送 · Shift + Enter 换行 · Ctrl/⌘ + K 聚焦输入 · 回复支持 Markdown
      </p>
    </div>
  </div>
</template>
