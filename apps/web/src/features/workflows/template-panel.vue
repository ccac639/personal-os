<script setup lang="ts">
import { computed, ref } from 'vue';
import { Copy, Download, LayoutTemplate, Plus, Save, Trash2, Upload, X } from '@lucide/vue';
import { useWorkflowStore } from './store';

const store = useWorkflowStore();
const emit = defineEmits<{ close: [] }>();

/* ---------- 保存选中子图为模板 ---------- */

const nameDraft = ref('');
const descDraft = ref('');
const savedTip = ref('');

function saveSelection() {
  const tpl = store.saveSelectionAsTemplate(nameDraft.value, descDraft.value);
  if (!tpl) {
    savedTip.value = '请先在画布中选中要保存的节点';
    return;
  }
  savedTip.value = `已保存模板「${tpl.name}」（${tpl.nodes.length} 节点 / ${tpl.edges.length} 连线）`;
  nameDraft.value = '';
  descDraft.value = '';
  setTimeout(() => (savedTip.value = ''), 2500);
}

/* ---------- 插入 / 删除 ---------- */

const insertTip = ref('');
function insert(id: string) {
  if (store.insertTemplate(id)) {
    insertTip.value = '已插入模板到画布（可撤销）';
    emit('close');
  }
}
function remove(id: string, name: string) {
  if (confirm(`确定删除模板「${name}」？`)) store.deleteTemplate(id);
}

/* ---------- 导入 / 导出 ---------- */

const fileInput = ref<HTMLInputElement>();
const importError = ref('');

function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const result = store.importTemplatesJson(String(reader.result ?? ''));
    if (!result.ok) {
      importError.value = `导入失败：${result.errors.slice(0, 3).join('；')}`;
    } else {
      importError.value = `已导入 ${result.added} 个模板`;
      setTimeout(() => (importError.value = ''), 2500);
    }
  };
  reader.readAsText(file);
  input.value = '';
}

function exportFile() {
  const blob = new Blob([store.exportTemplatesJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'workflow-templates.json';
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- 展示 ---------- */

const templates = computed(() => store.ensureTemplates());

function fmtTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${new Date(ts).getMonth() + 1}月${new Date(ts).getDate()}日`;
}

const selCount = computed(() => store.selectedIds.length);
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div
      class="border-surface-100/70 bg-surface-0/90 shadow-float flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border backdrop-blur-xl"
    >
      <header class="border-surface-100 flex items-center justify-between border-b px-4 py-3">
        <h3 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
          <LayoutTemplate class="text-brand-600 size-4" />
          节点模板
          <span class="text-surface-800/40 text-[11px] font-normal">
            复用选中子图 · 共 {{ templates.length }} 个
          </span>
        </h3>
        <button
          type="button"
          class="text-surface-800/50 hover:bg-surface-50 hover:text-surface-900 rounded-md p-1 transition"
          title="关闭"
          aria-label="关闭"
          @click="emit('close')"
        >
          <X class="size-4" />
        </button>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto p-3">
        <!-- 保存当前选中子图 -->
        <div class="border-surface-100 bg-surface-50/50 rounded-lg border p-3">
          <p class="text-surface-800/70 text-xs font-medium">
            保存选中子图为模板
            <span class="text-surface-800/40 font-normal">（当前选中 {{ selCount }} 个节点）</span>
          </p>
          <div class="mt-2 flex flex-wrap items-center gap-1.5">
            <input
              v-model="nameDraft"
              type="text"
              placeholder="模板名称，例如：审查子流程"
              class="border-surface-100 bg-surface-50 text-surface-900 focus:border-brand-500 w-44 rounded-lg border px-2.5 py-1.5 text-xs outline-none"
              @keyup.enter="saveSelection"
            />
            <input
              v-model="descDraft"
              type="text"
              placeholder="描述（可选）"
              class="border-surface-100 bg-surface-50 text-surface-900 focus:border-brand-500 w-40 rounded-lg border px-2.5 py-1.5 text-xs outline-none"
              @keyup.enter="saveSelection"
            />
            <button
              type="button"
              class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-50"
              :disabled="selCount === 0"
              @click="saveSelection"
            >
              <Save class="size-3.5" />
              保存
            </button>
            <button
              type="button"
              class="text-surface-800/60 hover:bg-surface-100 flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs transition"
              @click="fileInput?.click()"
            >
              <Upload class="size-3.5" />
              导入
            </button>
            <button
              type="button"
              class="text-surface-800/60 hover:bg-surface-100 flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs transition disabled:opacity-40"
              :disabled="templates.length === 0"
              @click="exportFile"
            >
              <Download class="size-3.5" />
              导出
            </button>
          </div>
          <p v-if="savedTip" class="text-brand-600 mt-1.5 text-[11px]">{{ savedTip }}</p>
          <p
            v-if="importError"
            class="mt-1.5 text-[11px]"
            :class="importError.includes('失败') ? 'text-red-600' : 'text-green-600'"
          >
            {{ importError }}
          </p>
          <input
            ref="fileInput"
            type="file"
            accept="application/json,.json"
            class="hidden"
            @change="onImportFile"
          />
        </div>

        <p class="text-surface-800/40 mt-3 mb-1.5 text-[11px]">
          模板列表（插入后生成全新节点 ID，可撤销）
        </p>

        <ul v-if="templates.length > 0" class="space-y-1.5">
          <li
            v-for="t in templates"
            :key="t.id"
            class="border-surface-100 bg-surface-50/50 flex items-start gap-2 rounded-lg border p-2.5"
          >
            <LayoutTemplate class="text-surface-800/40 mt-0.5 size-3.5 shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="text-surface-900 truncate text-xs font-medium">{{ t.name }}</p>
              <p v-if="t.description" class="text-surface-800/50 mt-0.5 truncate text-[11px]">
                {{ t.description }}
              </p>
              <p class="text-surface-800/50 mt-0.5 text-[11px]">
                {{ t.nodes.length }} 节点 · {{ t.edges.length }} 连线 · {{ fmtTime(t.createdAt) }}
              </p>
            </div>
            <button
              type="button"
              class="text-brand-600 hover:bg-brand-500/10 flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition"
              :title="'插入模板到画布'"
              @click="insert(t.id)"
            >
              <Plus class="size-3" />
              插入
            </button>
            <button
              type="button"
              class="text-surface-800/50 hover:bg-surface-100 shrink-0 rounded-md p-1 text-[11px] transition hover:text-red-600"
              :title="'删除模板'"
              @click="remove(t.id, t.name)"
            >
              <Trash2 class="size-3" />
            </button>
          </li>
        </ul>
        <p v-else class="text-surface-800/40 py-4 text-center text-xs">
          暂无模板。选中画布中的节点子图后，在上方保存即可复用。
        </p>

        <div class="border-surface-100 mt-3 flex items-center gap-2 border-t px-1 pt-2.5">
          <Copy class="text-surface-800/40 size-3.5 shrink-0" />
          <p class="text-surface-800/60 text-[11px]">
            模板保存后与画布完全解耦：插入时生成全新节点 ID 与内部边，支持导入导出与跨设备迁移。
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
