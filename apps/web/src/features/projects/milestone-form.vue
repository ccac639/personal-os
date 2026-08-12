<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import ModalShell from '@/features/projects/modal-shell.vue';
import { useTaskStore } from '@/features/tasks/store';
import { MILESTONE_STATUS_META } from '@/features/projects/types';
import type {
  Milestone,
  MilestoneForm as MilestoneFormData,
  MilestoneStatus,
} from '@/features/projects/types';

const props = defineProps<{
  open: boolean;
  /** 传入则编辑，否则新建 */
  milestone: Milestone | null;
  /** 项目 id（新建时用于筛选可关联任务） */
  projectId: string;
}>();

const emit = defineEmits<{
  submit: [form: MilestoneFormData];
  close: [];
}>();

const taskStore = useTaskStore();

const title = ref('');
const description = ref('');
const startDate = ref('');
const dueDate = ref('');
const status = ref<MilestoneStatus>('planned');
const taskIds = ref<string[]>([]);
const error = ref('');

const STATUS_OPTIONS = Object.keys(MILESTONE_STATUS_META) as MilestoneStatus[];

/** 本项目可选任务（未完成在前） */
const availableTasks = computed(() => {
  const list = taskStore.tasksByProject(props.projectId);
  const rank = (s: string) => (s === 'done' ? 1 : s === 'in-progress' ? 0 : -1);
  return [...list].sort((a, b) => rank(a.status) - rank(b.status) || a.order - b.order);
});

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    const m = props.milestone;
    title.value = m?.title ?? '';
    description.value = m?.description ?? '';
    startDate.value = m?.startDate ?? '';
    dueDate.value = m?.dueDate ?? '';
    status.value = m?.status ?? 'planned';
    taskIds.value = m ? [...m.taskIds] : [];
    error.value = '';
  },
  { immediate: true },
);

function toggleTask(id: string) {
  taskIds.value = taskIds.value.includes(id)
    ? taskIds.value.filter((x) => x !== id)
    : [...taskIds.value, id];
}

function submit() {
  if (!title.value.trim()) {
    error.value = '请输入里程碑标题';
    return;
  }
  if (startDate.value && dueDate.value && dueDate.value < startDate.value) {
    error.value = '截止日期不能早于开始日期';
    return;
  }
  emit('submit', {
    title: title.value,
    description: description.value.trim() || undefined,
    startDate: startDate.value || undefined,
    dueDate: dueDate.value || undefined,
    status: status.value,
    taskIds: taskIds.value,
  });
}
</script>

<template>
  <ModalShell :open="open" :title="milestone ? '编辑里程碑' : '新建里程碑'" @close="emit('close')">
    <div class="space-y-4">
      <div>
        <label class="text-surface-800/60 mb-1 block text-xs font-medium">标题 *</label>
        <input
          v-model="title"
          type="text"
          class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-lg border px-3 py-2 text-sm transition outline-none focus:ring-4"
          placeholder="例如：完成数据层迁移"
          autocomplete="off"
        />
      </div>
      <div>
        <label class="text-surface-800/60 mb-1 block text-xs font-medium">描述</label>
        <textarea
          v-model="description"
          rows="2"
          class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 w-full resize-none rounded-lg border px-3 py-2 text-sm transition outline-none focus:ring-4"
          placeholder="可选"
        />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-surface-800/60 mb-1 block text-xs font-medium">开始日期</label>
          <input
            v-model="startDate"
            type="date"
            class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-lg border px-3 py-2 text-sm transition outline-none focus:ring-4"
          />
        </div>
        <div>
          <label class="text-surface-800/60 mb-1 block text-xs font-medium">目标完成日期</label>
          <input
            v-model="dueDate"
            type="date"
            class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-lg border px-3 py-2 text-sm transition outline-none focus:ring-4"
          />
        </div>
      </div>
      <div>
        <label class="text-surface-800/60 mb-1 block text-xs font-medium">状态</label>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="s in STATUS_OPTIONS"
            :key="s"
            type="button"
            class="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
            :class="
              status === s
                ? 'border-brand-500 bg-brand-500/10 text-brand-600'
                : 'border-surface-100 bg-surface-0 text-surface-800/60 hover:bg-surface-50'
            "
            @click="status = s"
          >
            {{ MILESTONE_STATUS_META[s].label }}
          </button>
        </div>
      </div>
      <div>
        <label class="text-surface-800/60 mb-1.5 block text-xs font-medium">
          关联任务（{{ taskIds.length }} 个，进度按完成比例计算）
        </label>
        <div
          v-if="availableTasks.length"
          class="border-surface-100 max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2"
        >
          <label
            v-for="t in availableTasks"
            :key="t.id"
            class="hover:bg-surface-50 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
          >
            <input
              type="checkbox"
              class="accent-brand-600 size-3.5"
              :checked="taskIds.includes(t.id)"
              @change="toggleTask(t.id)"
            />
            <span
              class="min-w-0 flex-1 truncate"
              :class="
                t.status === 'done' ? 'text-surface-800/40 line-through' : 'text-surface-800/80'
              "
            >
              {{ t.title }}
            </span>
            <span class="text-surface-800/40 shrink-0 text-xs">{{
              t.status === 'done' ? '已完成' : '未完成'
            }}</span>
          </label>
        </div>
        <p v-else class="text-surface-800/40 text-xs">本项目暂无任务，可先在看板中创建任务。</p>
      </div>
      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors"
          @click="emit('close')"
        >
          取消
        </button>
        <button
          type="button"
          class="bg-brand-600 hover:bg-brand-700 text-surface-0 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors"
          @click="submit"
        >
          保存
        </button>
      </div>
    </div>
  </ModalShell>
</template>
