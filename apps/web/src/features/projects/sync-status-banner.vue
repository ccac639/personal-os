<script setup lang="ts">
/**
 * 同步状态横幅 —— 加载 / 保存 / 冲突 / 离线 / 后端不可用状态可见性
 *
 * 仅在任何子状态需要用户注意时渲染：
 * - loading：正在从服务端同步数据；
 * - saving：正在保存到服务端（轻提示）；
 * - offline / conflict / error / dirty>0：错误提示 + 重试按钮。
 */
import { AlertTriangle, CloudOff, RefreshCw, X } from '@lucide/vue';
import { computed } from 'vue';

import { mergeSyncStates, type SyncState } from './sync-core';

const props = defineProps<{
  states: SyncState[];
}>();

const emit = defineEmits<{ retry: []; dismiss: [] }>();

const merged = computed(() => mergeSyncStates(props.states));

const visible = computed(() => {
  const s = merged.value;
  if (s.dirty > 0) return true;
  return (
    s.status === 'offline' ||
    s.status === 'error' ||
    s.status === 'conflict' ||
    s.status === 'loading' ||
    s.status === 'saving'
  );
});

const tone = computed(() => {
  const s = merged.value;
  if (s.status === 'offline' || s.status === 'error' || s.status === 'conflict') return 'error';
  if (s.status === 'saving' || s.status === 'loading') return 'info';
  return 'warn'; // dirty > 0
});

const text = computed(() => {
  const s = merged.value;
  if (s.status === 'loading') return '正在从服务端同步数据…';
  if (s.status === 'saving') return '正在保存到服务端…';
  if (s.status === 'offline') {
    return `无法连接服务端，当前使用本地数据${s.dirty > 0 ? `（${s.dirty} 条变更待同步）` : ''}`;
  }
  if (s.status === 'conflict') return `数据冲突：${s.lastError ?? '服务端拒绝本次变更'}`;
  if (s.status === 'error') return `同步失败：${s.lastError ?? '未知错误'}`;
  return `${s.dirty} 条本地变更待同步到服务端`;
});

const showRetry = computed(() => {
  const s = merged.value;
  return s.status === 'offline' || s.status === 'error' || s.status === 'conflict' || s.dirty > 0;
});
</script>

<template>
  <div
    v-if="visible"
    :class="
      tone === 'error'
        ? 'border-red-200 bg-red-50 text-red-800'
        : tone === 'info'
          ? 'border-sky-200 bg-sky-50 text-sky-800'
          : 'border-amber-200 bg-amber-50 text-amber-800'
    "
    class="mb-4 flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs"
    role="alert"
  >
    <CloudOff v-if="tone === 'error'" class="size-4 shrink-0" />
    <RefreshCw v-else-if="tone === 'info'" class="size-4 shrink-0 animate-spin" />
    <AlertTriangle v-else class="size-4 shrink-0" />
    <span class="min-w-0 flex-1 leading-5">{{ text }}</span>
    <button
      v-if="showRetry"
      type="button"
      class="shrink-0 rounded px-2 py-1 font-medium transition-colors"
      :class="
        tone === 'error'
          ? 'bg-red-100 text-red-700 hover:bg-red-200'
          : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
      "
      @click="emit('retry')"
    >
      重试
    </button>
    <button
      v-if="merged.lastError"
      type="button"
      class="shrink-0 rounded p-0.5 transition-colors"
      :class="
        tone === 'error'
          ? 'text-red-700/60 hover:text-red-900'
          : 'text-amber-700/60 hover:text-amber-900'
      "
      aria-label="关闭提示"
      title="关闭"
      @click="emit('dismiss')"
    >
      <X class="size-3.5" />
    </button>
  </div>
</template>
