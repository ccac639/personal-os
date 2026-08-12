<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  Download,
  Focus,
  History,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  TriangleAlert,
  Undo2,
  Redo2,
  Upload,
  X,
} from '@lucide/vue';
import { useWorkflowStore } from './store';
import type { ImportPreview } from './store';
import VersionPanel from './version-panel.vue';

const store = useWorkflowStore();
const fileInput = ref<HTMLInputElement>();
const versionOpen = ref(false);

/* ---------- 导入预览确认 ---------- */

const importPreview = ref<{ text: string; preview: ImportPreview } | null>(null);

function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result ?? '');
    const preview = store.inspectJson(text);
    if (!preview) {
      alert('导入失败：文件不是有效的工作流 JSON');
    } else if (preview.errors.length > 0) {
      alert(`导入失败：\n${preview.errors.join('\n')}`);
    } else {
      importPreview.value = { text, preview };
    }
  };
  reader.readAsText(file);
  input.value = '';
}

function confirmImport() {
  const target = importPreview.value;
  if (!target) return;
  store.importJson(target.text);
  importPreview.value = null;
}

function cancelImport() {
  importPreview.value = null;
}

/* ---------- 导出 ---------- */

function exportFile() {
  const blob = new Blob([store.exportJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${store.name || 'workflow'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- 清空 ---------- */

function confirmClear() {
  if (store.nodes.length === 0) return;
  if (confirm('确定清空当前画布？未保存的内容将丢失（可撤销）。')) store.clear();
}

/* ---------- 状态 ---------- */

const savedCls = computed(() =>
  store.dirty ? 'bg-amber-500/10 text-amber-600' : 'bg-green-500/10 text-green-600',
);
const savedLabel = computed(() => (store.dirty ? '未保存' : '已保存'));
</script>

<template>
  <div class="relative">
    <div
      class="border-surface-100 bg-surface-0 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 shadow-sm"
    >
      <!-- 工作流名称 + 保存状态 -->
      <div class="flex min-w-0 items-center gap-2">
        <input
          :value="store.name"
          class="text-surface-900 hover:border-surface-800/30 focus:border-brand-500 w-36 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-semibold transition outline-none sm:w-44"
          title="工作流名称"
          aria-label="工作流名称"
          @input="store.name = ($event.target as HTMLInputElement).value"
        />
        <span
          class="text-surface-800/50 shrink-0 rounded-full px-2 py-0.5 text-[10px]"
          :class="savedCls"
        >
          {{ savedLabel }}
        </span>
      </div>

      <div class="bg-surface-100 mx-1 hidden h-5 w-px shrink-0 sm:block" />

      <!-- 撤销 / 重做 -->
      <div class="flex items-center gap-0.5">
        <button
          type="button"
          class="text-surface-800/70 hover:bg-surface-100 hover:text-surface-900 rounded-lg p-1.5 transition disabled:opacity-30"
          title="撤销（Ctrl/⌘ Z）"
          aria-label="撤销"
          :disabled="!store.canUndo || store.running"
          @click="store.undo()"
        >
          <Undo2 class="size-3.5" />
        </button>
        <button
          type="button"
          class="text-surface-800/70 hover:bg-surface-100 hover:text-surface-900 rounded-lg p-1.5 transition disabled:opacity-30"
          title="重做（Ctrl/⌘ Shift Z）"
          aria-label="重做"
          :disabled="!store.canRedo || store.running"
          @click="store.redo()"
        >
          <Redo2 class="size-3.5" />
        </button>
      </div>

      <div class="bg-surface-100 mx-1 hidden h-5 w-px shrink-0 sm:block" />

      <!-- 操作按钮 -->
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          class="text-surface-800/70 hover:bg-surface-100 hover:text-surface-900 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition"
          title="保存（生成版本快照）"
          @click="store.save()"
        >
          <Save class="size-3.5" />
          保存
        </button>
        <button
          type="button"
          class="text-surface-800/70 hover:bg-surface-100 hover:text-surface-900 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition"
          title="版本与模板"
          @click="versionOpen = true"
        >
          <History class="size-3.5" />
          版本
        </button>
        <button
          type="button"
          class="text-surface-800/70 hover:bg-surface-100 hover:text-surface-900 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition"
          title="载入示例工作流（覆盖当前画布，可撤销）"
          @click="store.loadDemo()"
        >
          <Sparkles class="size-3.5" />
          示例
        </button>
        <button
          type="button"
          class="text-surface-800/70 hover:bg-surface-100 hover:text-surface-900 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition"
          title="导出为 JSON（已脱敏）"
          :disabled="store.nodes.length === 0"
          @click="exportFile"
        >
          <Download class="size-3.5" />
          导出
        </button>
        <button
          type="button"
          class="text-surface-800/70 hover:bg-surface-100 hover:text-surface-900 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition"
          title="从 JSON 导入（预览确认后写入为新工作流）"
          @click="fileInput?.click()"
        >
          <Upload class="size-3.5" />
          导入
        </button>
        <button
          type="button"
          class="text-surface-800/70 hover:bg-surface-100 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition hover:text-red-600"
          title="清空画布（可撤销）"
          @click="confirmClear"
        >
          <Trash2 class="size-3.5" />
          清空
        </button>
        <button
          type="button"
          class="text-surface-800/70 hover:bg-surface-100 hover:text-surface-900 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition"
          title="聚焦选中节点"
          aria-label="聚焦选中节点"
          :disabled="store.selectedIds.length === 0"
          @click="store.focusSelected()"
        >
          <Focus class="size-3.5" />
          聚焦
        </button>
        <button
          type="button"
          class="text-surface-800/40 hover:bg-surface-100 hover:text-surface-900 rounded-lg p-1.5 transition"
          title="适配视图"
          aria-label="适配视图"
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

    <!-- 保存失败非阻塞警告 -->
    <div
      v-if="store.persistError"
      class="mt-1.5 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700"
      role="status"
    >
      <TriangleAlert class="size-3.5 shrink-0" />
      <span class="min-w-0 flex-1">{{ store.persistError }}</span>
    </div>

    <!-- 导入预览确认 -->
    <Teleport to="body">
      <div
        v-if="importPreview"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
        @click.self="cancelImport"
      >
        <div
          class="border-surface-100/70 bg-surface-0/90 shadow-float w-full max-w-md rounded-xl border p-5 backdrop-blur-xl"
        >
          <div class="mb-3 flex items-center justify-between">
            <h3 class="text-surface-900 text-sm font-semibold">确认导入工作流</h3>
            <button
              type="button"
              class="hover:bg-surface-50 text-surface-800/50 hover:text-surface-900 rounded-md p-1 transition"
              title="关闭"
              aria-label="关闭"
              @click="cancelImport"
            >
              <X class="size-4" />
            </button>
          </div>

          <dl class="space-y-2 text-sm">
            <div class="flex justify-between gap-4">
              <dt class="text-surface-800/50 shrink-0">名称</dt>
              <dd class="text-surface-900 truncate font-medium">
                {{ importPreview.preview.name }}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-surface-800/50">节点</dt>
              <dd class="text-surface-900 tabular-nums">{{ importPreview.preview.nodeCount }}</dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-surface-800/50">连线</dt>
              <dd class="text-surface-900 tabular-nums">{{ importPreview.preview.edgeCount }}</dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-surface-800/50">数据格式</dt>
              <dd class="text-surface-900 tabular-nums">
                {{
                  importPreview.preview.version > 0
                    ? `信封 v${importPreview.preview.version}`
                    : '工作流快照'
                }}
              </dd>
            </div>
          </dl>

          <div
            v-if="importPreview.preview.warnings.length > 0"
            class="mt-3 space-y-0.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-700"
          >
            <p v-for="(w, i) in importPreview.preview.warnings" :key="i">⚠ {{ w }}</p>
          </div>

          <p class="text-surface-800/50 mt-3 text-xs">
            导入将创建为独立的新工作流，不影响现有数据。
          </p>

          <div class="mt-4 flex justify-end gap-2">
            <button
              type="button"
              class="text-surface-800/60 hover:bg-surface-100 rounded-lg px-3 py-1.5 text-xs transition"
              @click="cancelImport"
            >
              取消
            </button>
            <button
              type="button"
              class="bg-brand-600 hover:bg-brand-700 text-surface-0 rounded-lg px-3 py-1.5 text-xs font-medium transition"
              @click="confirmImport"
            >
              确认导入
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 版本与模板 -->
    <VersionPanel v-if="versionOpen" @close="versionOpen = false" />
  </div>
</template>
