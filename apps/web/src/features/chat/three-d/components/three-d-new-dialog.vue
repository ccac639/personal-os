<script setup lang="ts">
/**
 * Chat 功能域 —— 3D 工作台新建项目对话框
 * 支持手动新建与「从 Chat 消息创建草稿」（仅结构化文本，无附件）。
 */
import { X } from '@lucide/vue';
import { computed, ref, watch } from 'vue';

import { PROJECT_TYPE_LABELS } from '../constants';
import { useThreeDWorkspaceStore } from '../store';
import type { ThreeDProjectType } from '../types';

const store = useThreeDWorkspaceStore();

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const name = ref('');
const type = ref<ThreeDProjectType>('character');
const description = ref('');
const tags = ref('');

const fromMessage = computed(() => store.pendingFromMessage !== null);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    const draft = store.pendingFromMessage;
    name.value = draft?.name ?? '';
    type.value = draft ? 'character' : 'character';
    description.value = draft?.description ?? '';
    tags.value = draft ? '来自对话' : '';
  },
);

function close() {
  store.cancelFromMessage();
  emit('close');
}

function confirm() {
  if (!name.value.trim()) {
    name.value = '未命名 3D 项目';
  }
  const tagList = tags.value
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const project = store.commitFromMessage({
    name: name.value,
    type: type.value,
    description: description.value,
  });
  if (!project) {
    // 非消息来源：直接新建
    store.addProject({
      name: name.value,
      type: type.value,
      description: description.value,
      tags: tagList,
    });
  }
  emit('close');
}

const typeOptions = [
  { key: 'character', label: '角色', hint: '体型 / 配色 / 装备占位' },
  { key: 'world', label: '世界', hint: '地面 / 区域 / 建筑占位' },
  { key: 'prop', label: '道具', hint: '组合 primitive 可编辑物件' },
] as const;
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    role="dialog"
    aria-modal="true"
    aria-label="新建 3D 项目"
    @click.self="close"
  >
    <div class="bg-surface-0 shadow-float border-surface-100 w-full max-w-md rounded-xl border p-4">
      <div class="mb-3 flex items-center gap-2">
        <h2 class="text-surface-900 flex-1 text-sm font-semibold">
          {{ fromMessage ? '从对话创建 3D 项目草稿' : '新建 3D 项目' }}
        </h2>
        <button
          class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-7 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none"
          aria-label="关闭"
          @click="close"
        >
          <X class="size-4" />
        </button>
      </div>

      <p
        v-if="fromMessage"
        class="text-surface-800/50 mb-3 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] dark:bg-amber-500/10"
      >
        仅传入结构化文本草稿：不会自动执行任何生成，也不包含附件。
      </p>

      <label class="text-surface-800/60 mb-1 block text-[11px]">项目名称</label>
      <input
        v-model="name"
        class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 mb-3 w-full rounded-lg border px-2.5 py-1.5 text-xs outline-none"
        aria-label="项目名称"
        placeholder="例如：赛博武士角色"
      />

      <label class="text-surface-800/60 mb-1 block text-[11px]">创作模式</label>
      <div class="mb-3 grid grid-cols-3 gap-1.5">
        <button
          v-for="opt in typeOptions"
          :key="opt.key"
          class="focus-visible:ring-brand-500/40 rounded-lg border px-2 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
          :class="
            type === opt.key
              ? 'border-brand-500 bg-brand-500/5 text-surface-900'
              : 'border-surface-100 hover:bg-surface-100 text-surface-800/60'
          "
          :aria-pressed="type === opt.key"
          @click="type = opt.key"
        >
          <span class="block text-[11px] font-medium">{{ opt.label }}</span>
          <span class="text-surface-800/40 mt-0.5 block text-[9px]">{{ opt.hint }}</span>
        </button>
      </div>

      <label class="text-surface-800/60 mb-1 block text-[11px]">描述</label>
      <textarea
        v-model="description"
        class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 mb-3 h-16 w-full resize-none rounded-lg border px-2.5 py-1.5 text-xs outline-none"
        aria-label="项目描述"
        placeholder="一句话描述这个项目"
      />

      <label class="text-surface-800/60 mb-1 block text-[11px]">标签（逗号分隔）</label>
      <input
        v-model="tags"
        class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 mb-4 w-full rounded-lg border px-2.5 py-1.5 text-xs outline-none"
        aria-label="项目标签"
        placeholder="角色，概念"
      />

      <div class="flex justify-end gap-2">
        <button
          class="hover:bg-surface-100 text-surface-800/70 hover:text-surface-900 focus-visible:ring-brand-500/40 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
          aria-label="取消"
          @click="close"
        >
          取消
        </button>
        <button
          class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
          aria-label="创建项目"
          @click="confirm"
        >
          {{ fromMessage ? '创建草稿项目' : '创建' }}
        </button>
      </div>
      <p v-if="fromMessage" class="text-surface-800/35 mt-2 text-right text-[10px]">
        模式：{{ PROJECT_TYPE_LABELS[type] }}
      </p>
    </div>
  </div>
</template>
