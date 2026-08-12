<script setup lang="ts">
import { AlertTriangle, Archive, Trash2 } from '@lucide/vue';

import ModalShell from './modal-shell.vue';
import type { ProjectDetail } from './types';

defineProps<{
  open: boolean;
  project: ProjectDetail | null;
  /** 该项目的任务数量（永久删除需明确展示） */
  taskCount: number;
}>();

const emit = defineEmits<{
  archive: [project: ProjectDetail];
  'permanent-delete': [project: ProjectDetail];
  cancel: [];
}>();
</script>

<template>
  <ModalShell :open="open" title="删除项目" width-class="max-w-md" @close="emit('cancel')">
    <div v-if="project" class="space-y-4">
      <div class="flex items-start gap-3">
        <span
          class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-600"
        >
          <AlertTriangle class="size-4.5" />
        </span>
        <p class="text-surface-800/80 mt-1 text-sm leading-relaxed">
          选择如何处理项目「<span class="text-surface-900 font-medium">{{ project.name }}</span
          >」？ 当前关联 <span class="text-surface-900 font-medium">{{ taskCount }}</span> 个任务。
        </p>
      </div>

      <div class="space-y-2">
        <!-- 策略一：归档并保留任务 -->
        <button
          type="button"
          class="border-surface-100 bg-surface-0 hover:border-brand-500/40 flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors"
          @click="emit('archive', project)"
        >
          <span
            class="bg-brand-500/10 text-brand-600 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg"
          >
            <Archive class="size-4" />
          </span>
          <span>
            <span class="text-surface-900 block text-sm font-medium">归档项目（保留任务）</span>
            <span class="text-surface-800/60 mt-0.5 block text-xs leading-5">
              项目移入「已归档」，{{ taskCount }} 个任务继续保留，可在归档筛选中恢复。
            </span>
          </span>
        </button>

        <!-- 策略二：永久删除 -->
        <button
          type="button"
          class="flex w-full items-start gap-3 rounded-xl border border-red-200 bg-red-500/5 p-3.5 text-left transition-colors hover:bg-red-50"
          @click="emit('permanent-delete', project)"
        >
          <span
            class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-600"
          >
            <Trash2 class="size-4" />
          </span>
          <span>
            <span class="block text-sm font-medium text-red-600"
              >永久删除（含 {{ taskCount }} 个任务）</span
            >
            <span class="text-surface-800/60 mt-0.5 block text-xs leading-5">
              项目与全部关联任务、活动记录一并删除，不可恢复。
            </span>
          </span>
        </button>
      </div>

      <div class="flex justify-end">
        <button
          type="button"
          class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors"
          @click="emit('cancel')"
        >
          取消
        </button>
      </div>
    </div>
  </ModalShell>
</template>
