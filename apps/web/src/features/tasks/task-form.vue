<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { BookmarkPlus, Sparkles } from '@lucide/vue';
import type { TaskPriority, TaskStatus } from '@personal-os/types';

import ModalShell from '@/features/projects/modal-shell.vue';
import { useTaskStore } from './store';
import { applyTemplate, allTemplates } from './templates';
import type { TaskTemplate } from './types';
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

const taskStore = useTaskStore();

const title = ref('');
const description = ref('');
const priority = ref<TaskPriority>('medium');
const status = ref<TaskStatus>('todo');
const dueDate = ref('');
const tagsText = ref('');
const estimatedMinutes = ref<number | null>(null);
const dod = ref('');
const blockedReason = ref('');
const error = ref('');

/** 模板相关（仅新建时） */
const selectedTpl = ref<TaskTemplate | null>(null);
const templates = computed(() => allTemplates(taskStore.customTemplates));
const savingTpl = ref(false);
const tplName = ref('');

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
    estimatedMinutes.value = t?.estimatedMinutes ?? null;
    dod.value = t?.dod ?? '';
    blockedReason.value = t?.blockedReason ?? '';
    selectedTpl.value = null;
    savingTpl.value = false;
    tplName.value = '';
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

/** 应用模板：填充表单（新建时） */
function applyTpl(tpl: TaskTemplate) {
  selectedTpl.value = tpl;
  const applied = applyTemplate(tpl, props.projectId);
  title.value = applied.title;
  description.value = applied.description ?? '';
  priority.value = applied.priority;
  dueDate.value = applied.dueDate ?? '';
  tagsText.value = applied.tags.join('，');
  estimatedMinutes.value = applied.estimatedMinutes ?? null;
  dod.value = applied.dod ?? '';
  error.value = '';
}

/** 存为个人模板（新建时） */
function confirmSaveTemplate() {
  const name = tplName.value.trim();
  if (!name) {
    error.value = '请输入模板名称';
    return;
  }
  const result = taskStore.saveCustomTemplate({
    name,
    title: title.value,
    taskDescription: description.value || undefined,
    priority: priority.value,
    tags: splitTags(tagsText.value),
    subtasks: [],
    dod: dod.value || undefined,
    estimatedMinutes: estimatedMinutes.value ?? undefined,
  });
  if (!result.ok) error.value = result.reason ?? '保存失败';
  else {
    savingTpl.value = false;
    tplName.value = '';
  }
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
    estimatedMinutes: estimatedMinutes.value ?? undefined,
    dod: dod.value.trim() || undefined,
    blockedReason: blockedReason.value.trim() || undefined,
    subtasks: selectedTpl.value?.subtasks ?? undefined,
  });
}
</script>

<template>
  <ModalShell :open="open" :title="task ? '编辑任务' : '新建任务'" @close="emit('close')">
    <form class="space-y-4" @submit.prevent="submit">
      <!-- 从模板创建（仅新建） -->
      <div v-if="!task">
        <label class="text-surface-800/70 mb-1.5 block text-xs font-medium"> 从模板创建 </label>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="tpl in templates"
            :key="tpl.id"
            type="button"
            class="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors"
            :class="
              selectedTpl?.id === tpl.id
                ? 'border-brand-500 bg-brand-500/10 text-brand-600'
                : 'border-surface-100 bg-surface-0 text-surface-800/60 hover:border-brand-500/40 hover:text-surface-900'
            "
            :title="tpl.description"
            @click="applyTpl(tpl)"
          >
            <Sparkles v-if="tpl.builtin" class="mr-1 inline size-3" />
            {{ tpl.name }}
          </button>
        </div>
        <p v-if="selectedTpl" class="text-surface-800/40 mt-1.5 text-xs">
          已应用「{{ selectedTpl.name }}」：{{ selectedTpl.description }}
        </p>
      </div>

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

      <div class="grid grid-cols-2 gap-3">
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
          <label class="text-surface-800/70 mb-1.5 block text-xs font-medium" for="tf-estimate">
            估时（分钟）
          </label>
          <input
            id="tf-estimate"
            v-model.number="estimatedMinutes"
            type="number"
            min="0"
            step="5"
            class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-lg border px-3 py-2 text-sm transition outline-none focus:ring-4"
            placeholder="如 120"
          />
        </div>
      </div>

      <div>
        <label class="text-surface-800/70 mb-1.5 block text-xs font-medium" for="tf-dod">
          完成定义（DoD）
        </label>
        <input
          id="tf-dod"
          v-model="dod"
          type="text"
          class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-lg border px-3 py-2 text-sm transition outline-none focus:ring-4"
          placeholder="例如：回归测试通过，无新增缺陷"
          autocomplete="off"
        />
      </div>

      <div v-if="task">
        <label class="text-surface-800/70 mb-1.5 block text-xs font-medium" for="tf-blocked">
          阻塞原因
        </label>
        <textarea
          id="tf-blocked"
          v-model="blockedReason"
          rows="2"
          class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 w-full resize-none rounded-lg border px-3 py-2 text-sm transition outline-none focus:ring-4"
          placeholder="任务受阻时说明原因（如：等待依赖任务完成）"
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

      <!-- 存为个人模板（仅新建） -->
      <div v-if="!task && savingTpl" class="bg-surface-50 flex items-center gap-2 rounded-lg p-2.5">
        <input
          v-model="tplName"
          type="text"
          class="border-surface-100 bg-surface-0 focus:border-brand-500 min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-xs transition outline-none"
          placeholder="模板名称，如：数据迁移"
          autocomplete="off"
        />
        <button
          type="button"
          class="bg-brand-600 hover:bg-brand-700 text-surface-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
          @click="confirmSaveTemplate"
        >
          保存
        </button>
        <button
          type="button"
          class="text-surface-800/50 hover:text-surface-900 rounded-lg px-2 py-1.5 text-xs transition-colors"
          @click="savingTpl = false"
        >
          取消
        </button>
      </div>

      <div class="flex items-center justify-between gap-2 pt-1">
        <button
          v-if="!task"
          type="button"
          class="border-surface-100 bg-surface-0 text-surface-800/60 hover:border-brand-500/40 hover:text-surface-900 flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors"
          @click="savingTpl = true"
        >
          <BookmarkPlus class="size-3.5" />
          存为模板
        </button>
        <span v-else />
        <div class="flex gap-2">
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
      </div>
    </form>
  </ModalShell>
</template>
