<script setup lang="ts">
import { ref } from 'vue';
import { Download, Loader2, Play, RotateCcw, Save, Sparkles, Trash2, Upload } from '@lucide/vue';
import { useWorkflowStore } from '@/stores/workflow';

const store = useWorkflowStore();
const fileInput = ref<HTMLInputElement>();

function exportFile() {
  const blob = new Blob([store.exportJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${store.name || 'workflow'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const ok = store.importJson(String(reader.result ?? ''));
    if (!ok) alert('导入失败：文件不是有效的工作流 JSON');
  };
  reader.readAsText(file);
  input.value = '';
}

function confirmClear() {
  if (store.nodes.length === 0) return;
  if (confirm('确定清空当前画布？未保存的内容将丢失。')) store.clear();
}
</script>

<template>
  <div
    class="border-surface-100 bg-surface-0 flex items-center gap-2 rounded-xl border px-3 py-2 shadow-sm"
  >
    <!-- 工作流名称 -->
    <div class="flex min-w-0 items-center gap-2">
      <input
        :value="store.name"
        class="text-surface-900 hover:border-surface-800/30 focus:border-brand-500 w-44 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-semibold transition outline-none"
        title="工作流名称"
        @input="store.name = ($event.target as HTMLInputElement).value"
      />
      <span
        class="text-surface-800/50 shrink-0 rounded-full px-2 py-0.5 text-[10px]"
        :class="store.dirty ? 'bg-amber-500/10 text-amber-600' : 'bg-green-500/10 text-green-600'"
      >
        {{ store.dirty ? '未保存' : '已保存' }}
      </span>
    </div>

    <div class="bg-surface-100 mx-1 h-5 w-px shrink-0" />

    <!-- 操作按钮 -->
    <div class="flex items-center gap-1.5">
      <button
        type="button"
        class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50"
        :disabled="store.running || store.nodes.length === 0"
        @click="store.simulateRun()"
      >
        <Loader2 v-if="store.running" class="size-3.5 animate-spin" />
        <Play v-else class="size-3.5" />
        {{ store.running ? '运行中…' : '运行' }}
      </button>
      <button
        type="button"
        class="text-surface-800/70 hover:bg-surface-100 hover:text-surface-900 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition"
        @click="store.save()"
      >
        <Save class="size-3.5" />
        保存
      </button>
      <button
        type="button"
        class="text-surface-800/70 hover:bg-surface-100 hover:text-surface-900 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition"
        title="载入示例工作流（覆盖当前画布）"
        @click="store.loadDemo()"
      >
        <Sparkles class="size-3.5" />
        示例
      </button>
      <button
        type="button"
        class="text-surface-800/70 hover:bg-surface-100 hover:text-surface-900 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition"
        title="导出为 JSON"
        :disabled="store.nodes.length === 0"
        @click="exportFile"
      >
        <Download class="size-3.5" />
        导出
      </button>
      <button
        type="button"
        class="text-surface-800/70 hover:bg-surface-100 hover:text-surface-900 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition"
        title="从 JSON 导入"
        @click="fileInput?.click()"
      >
        <Upload class="size-3.5" />
        导入
      </button>
      <button
        type="button"
        class="text-surface-800/70 hover:bg-surface-100 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition hover:text-red-600"
        title="清空画布"
        @click="confirmClear"
      >
        <Trash2 class="size-3.5" />
        清空
      </button>
      <button
        type="button"
        class="text-surface-800/40 hover:bg-surface-100 hover:text-surface-900 rounded-lg p-1.5 transition"
        title="恢复默认布局（重新适配视口）"
        @click="store.layoutBump++"
      >
        <RotateCcw class="size-3.5" />
      </button>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept="application/json,.json"
      class="hidden"
      @change="onImportFile"
    />
  </div>
</template>
