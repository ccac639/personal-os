<script setup lang="ts">
/**
 * Chat 功能域 —— 3D 工作台导入对话框
 *
 * 粘贴 JSON 或选择本地 .json 文件 → 严格校验预览（名称 / 类型 / 资产数 / 版本）
 * → 确认导入。重复 id 一律复制为新项目，绝不覆盖已有项目；
 * 拒绝未知资产类型、非法数值、二进制内容。
 */
import { FileUp, X } from '@lucide/vue';
import { computed, ref, watch } from 'vue';

import { PROJECT_TYPE_LABELS } from '../constants';
import { useThreeDWorkspaceStore } from '../store';

const store = useThreeDWorkspaceStore();

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const text = ref('');
const error = ref('');
const fileInput = ref<HTMLInputElement | null>(null);

const preview = computed(() => store.pendingImport?.preview ?? null);

watch(
  () => props.open,
  (open) => {
    if (open) {
      text.value = '';
      error.value = '';
      store.cancelImport();
    }
  },
);

function analyze() {
  error.value = '';
  const result = store.previewImport(text.value);
  if (!result.ok) error.value = result.error ?? '导入失败';
}

async function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    error.value = '文件过大（超过 2MB）';
    return;
  }
  if (!/\.json$/i.test(file.name)) {
    error.value = '仅支持 .json 文本文件';
    return;
  }
  try {
    text.value = await file.text();
    error.value = '';
  } catch {
    error.value = '读取文件失败';
  }
  input.value = '';
}

function confirm() {
  store.commitImport();
  emit('close');
}

function close() {
  store.cancelImport();
  emit('close');
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    role="dialog"
    aria-modal="true"
    aria-label="导入 3D 项目"
    @click.self="close"
  >
    <div
      class="bg-surface-0 shadow-float border-surface-100 flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border p-4"
    >
      <div class="mb-3 flex items-center gap-2">
        <h2 class="text-surface-900 flex-1 text-sm font-semibold">导入 3D 项目</h2>
        <button
          class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-7 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none"
          aria-label="关闭"
          @click="close"
        >
          <X class="size-4" />
        </button>
      </div>

      <textarea
        v-model="text"
        class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 h-32 w-full resize-none rounded-lg border px-2.5 py-2 font-mono text-[11px] outline-none"
        aria-label="粘贴 3D 项目 JSON"
        placeholder='粘贴 Personal OS 3D 工作台导出 JSON（{"app":"personal-os-3d", ...}）'
        spellcheck="false"
      />

      <div class="mt-2 flex items-center gap-2">
        <input
          ref="fileInput"
          type="file"
          accept=".json,application/json"
          class="hidden"
          aria-hidden="true"
          @change="onFileSelected"
        />
        <button
          class="hover:bg-surface-100 text-surface-800/70 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
          aria-label="选择 JSON 文件"
          @click="fileInput?.click()"
        >
          <FileUp class="size-3.5" />
          选择 .json 文件
        </button>
        <button
          class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
          aria-label="校验并预览导入内容"
          @click="analyze"
        >
          校验预览
        </button>
      </div>

      <p v-if="error" class="mt-2 text-[11px] text-red-500" role="alert">{{ error }}</p>

      <div v-if="preview" class="mt-3 min-h-0 flex-1 overflow-y-auto">
        <p class="text-surface-800/50 mb-1.5 text-[11px]">
          共 {{ preview.total }} 个项目 · 有效 {{ preview.validCount }} · 无效
          {{ preview.invalidCount }} · 文件版本 v{{ preview.version }}
        </p>
        <table class="w-full text-left text-[11px]">
          <thead>
            <tr class="text-surface-800/40 text-[10px]">
              <th class="pb-1 font-medium">名称</th>
              <th class="pb-1 font-medium">类型</th>
              <th class="pb-1 font-medium">资产</th>
              <th class="pb-1 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in preview.projects" :key="p.index" class="border-surface-100 border-t">
              <td class="py-1 pr-2">{{ p.name }}</td>
              <td class="py-1 pr-2">{{ PROJECT_TYPE_LABELS[p.type] }}</td>
              <td class="py-1 pr-2 tabular-nums">{{ p.assetCount }}</td>
              <td class="py-1">
                <span v-if="p.valid" class="text-green-600">可导入</span>
                <span v-else class="text-red-500" :title="p.reason">无效</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p class="text-surface-800/40 mt-2 text-[10px]">
          重复 id 的项目会以「（导入）」后缀复制为新项目，不会覆盖已有项目。
        </p>
      </div>

      <div class="mt-3 flex justify-end gap-2">
        <button
          class="hover:bg-surface-100 text-surface-800/70 hover:text-surface-900 focus-visible:ring-brand-500/40 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
          aria-label="取消导入"
          @click="close"
        >
          取消
        </button>
        <button
          class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
          :disabled="!preview"
          aria-label="确认导入"
          @click="confirm"
        >
          导入 {{ preview ? preview.validCount : 0 }} 个项目
        </button>
      </div>
    </div>
  </div>
</template>
