<script setup lang="ts">
import {
  Archive,
  ArchiveRestore,
  Bookmark,
  CalendarDays,
  Download,
  Eraser,
  FileJson,
  MessagesSquare,
  PanelRightClose,
  Pin,
  PinOff,
  Trash2,
} from '@lucide/vue';
import { motion } from 'motion-v';
import { computed } from 'vue';

import { modelLabel } from '../models';
import { promptPresetName } from '../presets';
import { useChatStore } from '../store';
import { pushToast } from '../toast';

const emit = defineEmits<{ close: [] }>();

const store = useChatStore();

const session = computed(() => store.activeSession);

const meta = computed(() => {
  if (!session.value) return null;
  const d = new Date(session.value.createdAt);
  return {
    created: `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`,
    model: modelLabel(session.value.model),
  };
});

const stats = computed(() => store.sessionStats(session.value));

const budget = computed(() => store.sessionBudget(session.value, session.value?.model));

const budgetRatio = computed(() => Math.round((budget.value?.ratio ?? 0) * 100));

function handlePin() {
  if (session.value) store.togglePin(session.value.id);
}

function handleArchive() {
  if (session.value) store.toggleArchive(session.value.id);
}

function handleExportMarkdown() {
  if (session.value && session.value.messages.length > 0) {
    store.exportActiveSessionMarkdown();
  } else {
    pushToast('当前会话没有可导出的消息', 'warning');
  }
}

function handleExportJson() {
  if (session.value && session.value.messages.length > 0) {
    store.exportActiveSessionJson();
  } else {
    pushToast('当前会话没有可导出的消息', 'warning');
  }
}

function handleClear() {
  if (session.value && session.value.messages.length > 0) {
    store.clearSession(session.value.id);
  }
}

function handleDelete() {
  if (session.value) store.deleteSession(session.value.id);
}
</script>

<template>
  <motion.aside
    class="border-surface-100 bg-surface-0/60 hidden w-64 shrink-0 flex-col border-l p-4 backdrop-blur lg:flex"
    :initial="{ opacity: 0, x: 16 }"
    :animate="{ opacity: 1, x: 0 }"
    :exit="{ opacity: 0, x: 16 }"
    :transition="{ type: 'spring', stiffness: 300, damping: 28 }"
  >
    <!-- 面板标题 -->
    <div class="flex items-center justify-between">
      <h3 class="text-surface-900 text-sm font-semibold">会话信息</h3>
      <button
        class="text-surface-800/40 hover:bg-surface-100 hover:text-surface-900 flex size-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
        aria-label="收起面板"
        @click="emit('close')"
      >
        <PanelRightClose class="size-4" />
      </button>
    </div>

    <template v-if="session">
      <!-- 会话标题 -->
      <p class="text-surface-800/80 mt-4 text-sm leading-snug font-medium break-words">
        {{ session.title }}
      </p>

      <!-- 状态徽标：固定 / 归档 -->
      <div class="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          v-if="session.pinned"
          class="text-brand-600 border-brand-200 bg-brand-50 flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium"
        >
          <Pin class="size-2.5 fill-current" /> 已固定
        </span>
        <span
          v-if="session.archived"
          class="text-surface-800/60 border-surface-100 bg-surface-50 flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium"
        >
          <Archive class="size-2.5" /> 已归档
        </span>
      </div>

      <!-- 元信息 -->
      <dl class="text-surface-800/60 mt-4 space-y-2.5 text-xs">
        <div class="flex items-center gap-2">
          <MessagesSquare class="size-3.5 shrink-0" />
          <dd>{{ stats?.userMessages ?? 0 }} 轮对话 · {{ stats?.total ?? 0 }} 条消息</dd>
        </div>
        <div class="flex items-center gap-2">
          <Bookmark class="size-3.5 shrink-0" />
          <dd>{{ stats?.bookmarks ?? 0 }} 条书签</dd>
        </div>
        <div class="flex items-center gap-2">
          <CalendarDays class="size-3.5 shrink-0" />
          <dd>创建于 {{ meta?.created }}</dd>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-surface-800/45 w-3.5 text-center text-[10px]" aria-hidden="true">≈</span>
          <dd>{{ (stats?.chars ?? 0).toLocaleString() }} 字符 · 约 {{ (stats?.estTokens ?? 0).toLocaleString() }} tokens</dd>
        </div>
      </dl>

      <!-- 上下文预算条 -->
      <div class="mt-4">
        <div class="text-surface-800/55 mb-1 flex items-center justify-between text-[10px]">
          <span>上下文预算</span>
          <span :class="budget.level === 'danger' ? 'text-red-500' : budget.level === 'warn' ? 'text-amber-600' : ''">
            {{ budgetRatio }}%
          </span>
        </div>
        <div class="bg-surface-100 h-1.5 overflow-hidden rounded-full">
          <div
            class="h-full rounded-full transition-all"
            :class="budget.level === 'danger' ? 'bg-red-500' : budget.level === 'warn' ? 'bg-amber-500' : 'bg-emerald-500'"
            :style="{ width: `${Math.min(100, budgetRatio)}%` }"
          />
        </div>
        <p
          v-if="budget.level !== 'ok'"
          class="mt-1 text-[10px] leading-relaxed"
          :class="budget.level === 'danger' ? 'text-red-500' : 'text-amber-600'"
          role="status"
        >
          {{ budget.level === 'danger' ? '接近上下文上限，建议精简历史或新建会话' : '上下文较长，注意控制输入长度' }}
        </p>
      </div>

      <!-- 系统提示词摘要 -->
      <div v-if="session.systemPrompt" class="bg-brand-50 text-brand-600 mt-4 rounded-lg px-3 py-2 text-xs">
        <p class="font-medium">提示词（{{ promptPresetName(session.systemPrompt.presetId) }}）</p>
        <p class="text-brand-600/70 mt-0.5 line-clamp-2 text-[11px] leading-relaxed">
          {{ session.systemPrompt.text }}
        </p>
      </div>

      <div class="bg-brand-50 text-brand-600 mt-3 rounded-lg px-3 py-2 text-xs">
        模型：{{ meta?.model }}
      </div>

      <!-- 操作 -->
      <div class="mt-auto space-y-1 pt-4">
        <button
          class="text-surface-800/60 hover:bg-surface-100 hover:text-surface-900 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          :aria-label="session.pinned ? '取消固定会话' : '固定会话'"
          @click="handlePin"
        >
          <Pin v-if="!session.pinned" class="size-3.5" />
          <PinOff v-else class="size-3.5" />
          {{ session.pinned ? '取消固定' : '固定会话' }}
        </button>
        <button
          class="text-surface-800/60 hover:bg-surface-100 hover:text-surface-900 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          :aria-label="session.archived ? '恢复会话' : '归档会话'"
          @click="handleArchive"
        >
          <Archive v-if="!session.archived" class="size-3.5" />
          <ArchiveRestore v-else class="size-3.5" />
          {{ session.archived ? '移出归档' : '归档会话' }}
        </button>
        <button
          class="text-surface-800/60 hover:bg-surface-100 hover:text-surface-900 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          :disabled="session.messages.length === 0"
          @click="handleExportMarkdown"
        >
          <Download class="size-3.5" />
          导出 Markdown
        </button>
        <button
          class="text-surface-800/60 hover:bg-surface-100 hover:text-surface-900 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          :disabled="session.messages.length === 0"
          @click="handleExportJson"
        >
          <FileJson class="size-3.5" />
          导出 JSON
        </button>
        <button
          class="text-surface-800/60 hover:bg-surface-100 hover:text-surface-900 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          :disabled="session.messages.length === 0"
          @click="handleClear"
        >
          <Eraser class="size-3.5" />
          清空当前会话
        </button>
        <button
          class="text-surface-800/60 hover:bg-red-50 hover:text-red-600 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          @click="handleDelete"
        >
          <Trash2 class="size-3.5" />
          删除当前会话
        </button>
      </div>
    </template>

    <p v-else class="text-surface-800/40 mt-6 text-center text-xs">
      选择一个会话查看详情
    </p>
  </motion.aside>
</template>
