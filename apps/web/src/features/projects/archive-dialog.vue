<script setup lang="ts">
import { AlertTriangle, Archive, Inbox, RotateCcw } from '@lucide/vue';

import ModalShell from './modal-shell.vue';
import type { ArchivePreview } from './archive';
import type { ProjectDetail } from './types';

const props = defineProps<{
  open: boolean;
  project: ProjectDetail | null;
  preview: ArchivePreview | null;
}>();

void props;

const emit = defineEmits<{
  /** 直接归档（保留关联数据只读） */
  archive: [project: ProjectDetail];
  /** 未完成任务转入收件箱后再归档 */
  'archive-to-inbox': [project: ProjectDetail];
  cancel: [];
}>();

const rows = (p: ArchivePreview | null) => [
  { label: '未完成任务', value: p?.unfinishedTasks ?? 0, warn: (p?.unfinishedTasks ?? 0) > 0 },
  { label: '受阻任务', value: p?.blockedTasks ?? 0, warn: (p?.blockedTasks ?? 0) > 0 },
  { label: '未完成里程碑', value: p?.openMilestones ?? 0, warn: (p?.openMilestones ?? 0) > 0 },
  { label: '今日计划（未勾选）', value: p?.planItems ?? 0, warn: (p?.planItems ?? 0) > 0 },
  { label: '未完成发布检查单', value: p?.openChecklists ?? 0, warn: (p?.openChecklists ?? 0) > 0 },
  { label: '发布记录', value: p?.records ?? 0, warn: false },
  { label: '知识条目', value: p?.knowledge ?? 0, warn: false },
];
</script>

<template>
  <ModalShell :open="open" title="归档项目" width-class="max-w-lg" @close="emit('cancel')">
    <div v-if="project && preview" class="space-y-4">
      <div class="flex items-start gap-3">
        <span
          class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600"
        >
          <AlertTriangle class="size-4.5" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-surface-900 text-sm font-medium">归档「{{ project.name }}」？</p>
          <p class="text-surface-800/60 mt-0.5 text-xs leading-5">
            归档前将自动创建轻量本地快照；归档后项目进入只读模式，可随时恢复（支持撤销一次）。
          </p>
        </div>
      </div>

      <!-- 预检摘要（状态不以颜色区分：数字 + 文字标注） -->
      <ul
        class="border-surface-100 bg-surface-50 grid grid-cols-2 gap-2 rounded-xl border p-3 sm:grid-cols-3"
      >
        <li
          v-for="r in rows(preview)"
          :key="r.label"
          class="flex flex-col gap-0.5 rounded-lg bg-white/60 px-2.5 py-2"
        >
          <span class="text-surface-800/60 text-xs">{{ r.label }}</span>
          <span
            class="text-surface-900 text-sm font-semibold"
            :class="r.warn ? 'text-amber-700' : ''"
          >
            {{ r.value }}
            <span v-if="r.warn" class="ml-1 text-xs font-normal text-amber-700/70">需关注</span>
          </span>
        </li>
      </ul>

      <div class="space-y-2">
        <button
          type="button"
          class="border-surface-100 bg-surface-0 hover:border-brand-500/40 flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors"
          @click="emit('archive-to-inbox', project)"
        >
          <span
            class="bg-brand-500/10 text-brand-600 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg"
          >
            <Inbox class="size-4" />
          </span>
          <span>
            <span class="text-surface-900 block text-sm font-medium"
              >未完成任务转入收件箱再归档</span
            >
            <span class="text-surface-800/60 mt-0.5 block text-xs leading-5">
              共
              {{
                preview.unfinishedTasks
              }}
              个未完成任务移入收件箱继续处理，项目本体只读归档（可撤销一次）。
            </span>
          </span>
        </button>

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
            <span class="text-surface-900 block text-sm font-medium"
              >直接归档（保留全部数据只读）</span
            >
            <span class="text-surface-800/60 mt-0.5 block text-xs leading-5">
              项目、任务、里程碑、发布与知识全部保留为只读，可在归档视图中显式恢复。
            </span>
          </span>
        </button>
      </div>

      <p class="text-surface-800/50 flex items-center gap-1.5 text-xs">
        <RotateCcw class="size-3.5" />
        归档操作写入活动流；归档后可通过「撤销归档」恢复原状态与数据。
      </p>

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
