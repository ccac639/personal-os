<script setup lang="ts">
import { ref, watch } from 'vue';
import type { TaskPriority, TaskStatus } from '@personal-os/types';

import ModalShell from '@/features/projects/modal-shell.vue';
import { TASK_PRIORITY_META, TASK_STATUS_META } from './types';
import type { TaskForm, TaskItem } from './types';

const props = defineProps<{
  open: boolean;
  /** 传入则编辑，否则新建 */
  task: TaskItem | null;
  /** 新建时的默认项目 */
  projectId?: string;
}>();

const emit = defineEmits<{
  submit: [form: TaskForm];
  close: [];
}>();

const title = ref('');
const description = ref('');
const priority = ref<TaskPriority>('medium');
const status = ref<TaskStatus>('todo');
const dueDate = ref('');
const tagsText = ref('');
const error = ref('');

const STATUS_OPTIONS: TaskStatus[] = ['todo', 'in-progress', 'done'];
const PRIORITY_OPTIONS = Object.keys(TASK_PRIORITY_META) as TaskPriority[];

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    const t = props.task;
    title.value = t?.title ?? '';
    description.value = t?.description ?? '';
    priority.value = t?.priority ?? 'medium';
    status.value = t?.status ?? 'todo';
    dueDate.value = t?.dueDate ?? '';
    tagsText.value = t?.tags.join('，') ?? '';
    error.value = '';
  },
  { immediate: true },
);

function splitTags(text: string): string[] {
  return text
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function submit() {
  if (!title.value.trim()) {
    error.value = '请输入任务标题';
    return;
  }
  emit('submit', {
    projectId: props.projectId ?? props.task?.projectId,
    title: title.value,
    description: description.value.trim() || undefined,
    priority: priority.value,
    status: status.value,
    dueDate: dueDate.value || undefined,
    tags: splitTags(tagsText.value),
  });
}
</script>

<template>
  <ModalShell :open="open" :title="task ? '编辑任务' : '新建任务'" @close="emit('close')">
    <form class="space-y-4" @submit.prevent="submit">
      <div>
        <label class="text-surface-800/70 mb-1.5 block text-xs font-medium" for="tf-title">
          任务标题 <span class="text-red-500">*</span>
        </label>
        <input
          id="tf-title"
          v-model="title"
          type="text"
          class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-lg border px-3 py-2 text-sm transition outline-none focus:ring-4"
          placeholder="例如：实现任务看板拖拽"
          autocomplete="off"
        />
        <p v-if="error" class="mt-1 text-xs text-red-500">{{ error }}</p>
      </div>

      <div>
        <label class="text-surface-800/70 mb-1.5 block text-xs font-medium" for="tf-desc">
          描述
        </label>
        <textarea
          id="tf-desc"
          v-model="description"
          rows="3"
          class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 w-full resize-none rounded-lg border px-3 py-2 text-sm transition outline-none focus:ring-4"
          placeholder="补充任务细节、验收标准等"
        />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-surface-800/70 mb-1.5 block text-xs font-medium" for="tf-priority">
            优先级
          </label>
          <select
            id="tf-priority"
            v-model="priority"
            class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-lg border px-3 py-2 text-sm transition outline-none focus:ring-4"
          >
            <option v-for="p in PRIORITY_OPTIONS" :key="p" :value="p">
              {{ TASK_PRIORITY_META[p].label }}
            </option>
          </select>
        </div>
        <div>
          <label class="text-surface-800/70 mb-1.5 block text-xs font-medium" for="tf-status">
            状态
          </label>
          <select
            id="tf-status"
            v-model="status"
            class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-lg border px-3 py-2 text-sm transition outline-none focus:ring-4"
          >
            <option v-for="s in STATUS_OPTIONS" :key="s" :value="s">
              {{ TASK_STATUS_META[s].label }}
            </option>
          </select>
        </div>
      </div>

      <div>
        <label class="text-surface-800/70 mb-1.5 block text-xs font-medium" for="tf-due">
          截止日期
        </label>
        <input
          id="tf-due"
          v-model="dueDate"
          type="date"
          class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-lg border px-3 py-2 text-sm transition outline-none focus:ring-4"
        />
      </div>

      <div>
        <label class="text-surface-800/70 mb-1.5 block text-xs font-medium" for="tf-tags">
          标签（逗号分隔）
        </label>
        <input
          id="tf-tags"
          v-model="tagsText"
          type="text"
          class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-lg border px-3 py-2 text-sm transition outline-none focus:ring-4"
          placeholder="例如：前端，UI"
          autocomplete="off"
        />
      </div>

      <div class="flex justify-end gap-2 pt-1">
        <button
          type="button"
          class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors"
          @click="emit('close')"
        >
          取消
        </button>
        <button
          type="submit"
          class="bg-brand-600 hover:bg-brand-700 text-surface-0 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors"
        >
          {{ task ? '保存修改' : '创建任务' }}
        </button>
      </div>
    </form>
  </ModalShell>
</template>
