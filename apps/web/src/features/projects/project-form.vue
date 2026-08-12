<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ProjectStatus } from '@personal-os/types';

import { techTree } from './tech-stack';
import ModalShell from './modal-shell.vue';
import { PROJECT_STATUS_META } from './types';
import type { ProjectDetail, ProjectForm } from './types';

const props = defineProps<{
  open: boolean;
  /** 传入则编辑，否则新建 */
  project: ProjectDetail | null;
}>();

const emit = defineEmits<{
  submit: [form: ProjectForm];
  close: [];
}>();

/** 技术栈输入建议（复用仓库技术树名称，去重） */
const TECH_SUGGESTIONS = computed(() => {
  const names = new Set<string>();
  for (const group of techTree) {
    if (group.subGroups) {
      for (const sub of group.subGroups) {
        for (const item of sub.items) names.add(item.name);
      }
    } else {
      for (const item of group.items ?? []) names.add(item.name);
    }
  }
  return [...names].sort();
});

const name = ref('');
const description = ref('');
const status = ref<ProjectStatus>('active');
const tagsText = ref('');
const techText = ref('');
const error = ref('');

const STATUS_OPTIONS = (Object.keys(PROJECT_STATUS_META) as ProjectStatus[]).filter(
  (s) => s !== 'archived',
);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    const p = props.project;
    name.value = p?.name ?? '';
    description.value = p?.description ?? '';
    status.value = p?.status === 'archived' ? 'active' : (p?.status ?? 'active');
    tagsText.value = p?.tags.join('，') ?? '';
    techText.value = p?.techStack.join('，') ?? '';
    error.value = '';
  },
  { immediate: true },
);

function splitList(text: string): string[] {
  return text
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function submit() {
  if (!name.value.trim()) {
    error.value = '请输入项目名称';
    return;
  }
  emit('submit', {
    name: name.value,
    description: description.value.trim() || undefined,
    status: status.value,
    tags: splitList(tagsText.value),
    techStack: splitList(techText.value),
  });
}
</script>

<template>
  <ModalShell :open="open" :title="project ? '编辑项目' : '新建项目'" @close="emit('close')">
    <form class="space-y-4" @submit.prevent="submit">
      <div>
        <label class="text-surface-800/70 mb-1.5 block text-xs font-medium" for="pf-name">
          项目名称 <span class="text-red-500">*</span>
        </label>
        <input
          id="pf-name"
          v-model="name"
          type="text"
          class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-lg border px-3 py-2 text-sm transition outline-none focus:ring-4"
          placeholder="例如：Personal OS 一体化系统"
          autocomplete="off"
        />
        <p v-if="error" class="mt-1 text-xs text-red-500">{{ error }}</p>
      </div>

      <div>
        <label class="text-surface-800/70 mb-1.5 block text-xs font-medium" for="pf-desc">
          项目描述
        </label>
        <textarea
          id="pf-desc"
          v-model="description"
          rows="3"
          class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 w-full resize-none rounded-lg border px-3 py-2 text-sm transition outline-none focus:ring-4"
          placeholder="一句话说明项目定位与目标"
        />
      </div>

      <div>
        <label class="text-surface-800/70 mb-1.5 block text-xs font-medium" for="pf-status">
          状态
        </label>
        <select
          id="pf-status"
          v-model="status"
          class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-lg border px-3 py-2 text-sm transition outline-none focus:ring-4"
        >
          <option v-for="s in STATUS_OPTIONS" :key="s" :value="s">
            {{ PROJECT_STATUS_META[s].label }}
          </option>
        </select>
      </div>

      <div>
        <label class="text-surface-800/70 mb-1.5 block text-xs font-medium" for="pf-tags">
          标签（逗号分隔）
        </label>
        <input
          id="pf-tags"
          v-model="tagsText"
          type="text"
          class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-lg border px-3 py-2 text-sm transition outline-none focus:ring-4"
          placeholder="例如：AI，效率工具"
          autocomplete="off"
        />
      </div>

      <div>
        <label class="text-surface-800/70 mb-1.5 block text-xs font-medium" for="pf-tech">
          技术栈（逗号分隔）
        </label>
        <input
          id="pf-tech"
          v-model="techText"
          type="text"
          list="pf-tech-suggestions"
          class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-lg border px-3 py-2 text-sm transition outline-none focus:ring-4"
          placeholder="例如：Vue 3，TypeScript"
          autocomplete="off"
        />
        <datalist id="pf-tech-suggestions">
          <option v-for="t in TECH_SUGGESTIONS" :key="t" :value="t" />
        </datalist>
        <p class="text-surface-800/40 mt-1 text-xs">可从仓库技术栈中选择，多个用逗号分隔</p>
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
          {{ project ? '保存修改' : '创建项目' }}
        </button>
      </div>
    </form>
  </ModalShell>
</template>
