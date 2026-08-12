<script setup lang="ts">
import { Info, SlidersHorizontal } from '@lucide/vue';
import { computed } from 'vue';

import { useTaskStore } from '@/features/tasks/store';
import { effectiveProgress } from './progress';
import { useProjectStore } from './store';
import type { ProjectDetail, ProjectProgressMode } from './types';

const props = defineProps<{ project: ProjectDetail }>();

const store = useProjectStore();
const taskStore = useTaskStore();

const stats = computed(() => taskStore.projectStats(props.project.id));
const progress = computed(() => effectiveProgress(props.project, stats.value.progress));

function setMode(mode: ProjectProgressMode) {
  store.setProgressMode(props.project.id, mode, stats.value.progress);
}

function setManual(value: number) {
  store.setManualProgress(props.project.id, value);
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-1.5">
      <SlidersHorizontal class="text-surface-800/40 size-3.5" />
      <h3 class="text-surface-800/70 text-xs font-medium">进度设置</h3>
    </div>

    <!-- 模式切换 -->
    <div
      class="border-surface-100 bg-surface-0 inline-flex items-center gap-0.5 rounded-lg border p-0.5"
    >
      <button
        type="button"
        class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
        :class="
          project.progressMode === 'auto'
            ? 'bg-brand-600 text-surface-0'
            : 'text-surface-800/60 hover:text-surface-900'
        "
        :aria-pressed="project.progressMode === 'auto'"
        @click="setMode('auto')"
      >
        自动
      </button>
      <button
        type="button"
        class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
        :class="
          project.progressMode === 'manual'
            ? 'bg-brand-600 text-surface-0'
            : 'text-surface-800/60 hover:text-surface-900'
        "
        :aria-pressed="project.progressMode === 'manual'"
        @click="setMode('manual')"
      >
        手动
      </button>
    </div>

    <!-- 说明 -->
    <p class="text-surface-800/50 text-xs leading-5">
      <Info class="mr-1 inline size-3 -translate-y-px" />
      自动：按任务完成比例计算；手动：以滑块为准。切换时会以当前值接续，不会互相覆盖。
    </p>

    <!-- 当前有效进度 -->
    <div class="flex items-center gap-3">
      <div class="bg-surface-100 h-1.5 min-w-0 flex-1 overflow-hidden rounded-full">
        <div
          class="h-full rounded-full transition-all"
          :class="progress >= 100 ? 'bg-green-500' : 'bg-brand-500'"
          :style="{ width: `${progress}%` }"
        />
      </div>
      <span class="text-surface-900 w-10 text-right text-sm font-semibold">{{ progress }}%</span>
    </div>

    <!-- 手动滑块 -->
    <div v-if="project.progressMode === 'manual'" class="flex items-center gap-3">
      <input
        :value="project.manualProgress ?? 0"
        type="range"
        min="0"
        max="100"
        step="5"
        class="h-1.5 min-w-0 flex-1 cursor-pointer accent-indigo-600"
        aria-label="手动进度"
        @input="setManual(Number(($event.target as HTMLInputElement).value))"
      />
      <input
        :value="project.manualProgress ?? 0"
        type="number"
        min="0"
        max="100"
        class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 w-16 rounded-lg border px-2 py-1 text-right text-xs transition outline-none focus:ring-4"
        aria-label="手动进度数值"
        @change="setManual(Number(($event.target as HTMLInputElement).value))"
      />
    </div>
  </div>
</template>
