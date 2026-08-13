<script setup lang="ts">
import {
  CheckCircle2,
  Download,
  FileJson,
  ListChecks,
  Plus,
  Rocket,
  Save,
  Trash2,
} from '@lucide/vue';
import { computed, ref } from 'vue';

import { useProjectStore } from './store';
import { useTaskStore } from '@/features/tasks/store';
import { useReleaseStore } from './release-store';
import { buildChecklistDraft, buildReleaseMarkdown, isValidVersion } from './releases';
import type { ReleaseChecklist, ReleaseTemplate } from './releases';

const props = defineProps<{
  projectId: string;
  /** 只读模式（归档项目）：禁止新建 / 编辑 / 完成 / 模板管理 */
  readonly?: boolean;
}>();

const projectStore = useProjectStore();
const taskStore = useTaskStore();
const releaseStore = useReleaseStore();

const today = (() => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();

const project = computed(() => projectStore.projectById(props.projectId));
const checklists = computed(() => releaseStore.checklistsOf(props.projectId));
const records = computed(() => releaseStore.recordsOf(props.projectId));
const doneTasks = computed(() =>
  taskStore.tasksByProject(props.projectId).filter((t) => t.status === 'done'),
);
const milestones = computed(() => projectStore.milestonesOf(props.projectId));

// ── 草稿生成 ──
function generateDraft() {
  if (!project.value) return;
  const draft = buildChecklistDraft({
    project: project.value,
    doneTasks: doneTasks.value,
    milestones: milestones.value,
  });
  releaseStore.saveChecklist(draft);
}

// ── 表单 ──
const editing = ref<ReleaseChecklist | null>(null);
const formOpen = ref(false);
const draft = ref({
  version: 'v1.0.0',
  title: '',
  summary: '',
  releaseDate: '',
  risks: '',
  taskIds: [] as string[],
  templateId: '',
});
const error = ref('');

function openNew() {
  const p = project.value;
  draft.value = {
    version: 'v1.0.0',
    title: p ? `${p.name} 发布` : '发布',
    summary: '',
    releaseDate: '',
    risks: '',
    taskIds: [],
    templateId: 'rel-min',
  };
  editing.value = null;
  formOpen.value = true;
  error.value = '';
}

function openEdit(c: ReleaseChecklist) {
  editing.value = c;
  draft.value = {
    version: c.version,
    title: c.title,
    summary: c.summary ?? '',
    releaseDate: c.releaseDate ?? '',
    risks: c.risks ?? '',
    taskIds: c.taskIds,
    templateId: '',
  };
  formOpen.value = true;
  error.value = '';
}

function itemDrafts(): { label: string; done: boolean }[] {
  if (editing.value) return editing.value.items.map((i) => ({ label: i.label, done: i.done }));
  const tpl = releaseStore.allTemplates.find((t) => t.id === draft.value.templateId);
  return (tpl?.items ?? []).map((label) => ({ label, done: false }));
}

function toggleItemDraft(index: number) {
  const list = itemDrafts();
  if (editing.value) {
    releaseStore.toggleItem(editing.value.id, editing.value.items[index]!.id);
  }
  void list;
}

function saveDraft() {
  if (!project.value) return;
  if (!draft.value.version.trim()) {
    error.value = '请填写版本号';
    return;
  }
  if (!isValidVersion(draft.value.version)) {
    error.value = '版本号格式不合法（不能包含换行）';
    return;
  }
  if (!draft.value.title.trim()) {
    error.value = '请填写标题';
    return;
  }
  const items: ReleaseChecklist['items'] = editing.value
    ? editing.value.items.map((i) => ({ ...i }))
    : itemDrafts().map((d, i) => ({
        id: `ri-${Date.now()}-${i}`,
        label: d.label,
        done: false,
      }));
  releaseStore.saveChecklist({
    ...(editing.value ? { id: editing.value.id } : {}),
    projectId: props.projectId,
    version: draft.value.version.trim(),
    title: draft.value.title.trim(),
    summary: draft.value.summary.trim() || undefined,
    releaseDate: draft.value.releaseDate || undefined,
    status: 'draft',
    taskIds: draft.value.taskIds,
    items,
    risks: draft.value.risks.trim() || undefined,
  });
  formOpen.value = false;
}

function toggleTask(id: string) {
  const s = new Set(draft.value.taskIds);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  draft.value.taskIds = [...s];
}

// ── 完成 / 记录 ──
function complete(c: ReleaseChecklist) {
  const date = window.prompt('发布日期（YYYY-MM-DD）', today);
  if (!date) return;
  releaseStore.completeChecklist(c.id, date.trim());
}

function exportRecord(id: string) {
  const r = releaseStore.records.find((x) => x.id === id);
  if (!r || !project.value) return;
  const md = buildReleaseMarkdown(r, project.value, taskStore.tasks);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `release-${r.version}-${r.releaseDate}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── 模板管理 ──
const saveAsTemplateName = ref('');
const templateMsg = ref('');

function saveAsTemplate() {
  const items = itemDrafts().map((d) => d.label);
  if (!items.length) return;
  releaseStore.addTemplate({ name: saveAsTemplateName.value.trim() || '我的检查单', items });
  saveAsTemplateName.value = '';
  templateMsg.value = '已保存为个人模板';
  setTimeout(() => (templateMsg.value = ''), 2000);
}

function removeTemplate(t: ReleaseTemplate) {
  releaseStore.removeTemplate(t.id);
}

const allTemplates = computed(() => releaseStore.allTemplates);
</script>

<template>
  <div class="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
    <!-- 检查单与记录 -->
    <section
      class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-5 lg:col-span-2"
    >
      <header class="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
          <ListChecks class="text-brand-600 size-4" />
          发布检查单
        </h2>
        <div class="flex items-center gap-2">
          <button
            v-if="!props.readonly"
            type="button"
            class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
            :disabled="
              doneTasks.length === 0 && milestones.filter((m) => m.status === 'done').length === 0
            "
            @click="generateDraft"
          >
            <FileJson class="size-3.5" />
            从完成任务生成草稿
          </button>
          <button
            v-if="!props.readonly"
            type="button"
            class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            @click="openNew"
          >
            <Plus class="size-3.5" />
            新建检查单
          </button>
        </div>
      </header>

      <!-- 草稿列表 -->
      <ul class="space-y-2">
        <li
          v-for="c in checklists"
          :key="c.id"
          class="border-surface-100 bg-surface-50 rounded-lg border p-3"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="text-surface-900 truncate text-sm font-medium">
                {{ c.version }} · {{ c.title }}
              </p>
              <p class="text-surface-800/50 mt-0.5 text-xs">
                {{ c.summary || '（无摘要）' }} · 关联 {{ c.taskIds.length }} 个任务 ·
                {{ c.items.filter((i) => i.done).length }}/{{ c.items.length }} 项完成
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <button
                v-if="!props.readonly"
                type="button"
                aria-label="编辑检查单"
                class="text-surface-800/50 hover:text-surface-900 rounded p-1.5"
                @click="openEdit(c)"
              >
                <Save class="size-3.5" />
              </button>
              <button
                v-if="!props.readonly"
                type="button"
                aria-label="完成检查单并生成发布记录"
                class="text-brand-600 hover:bg-brand-500/10 rounded p-1.5"
                @click="complete(c)"
              >
                <Rocket class="size-3.5" />
              </button>
              <button
                v-if="!props.readonly"
                type="button"
                aria-label="删除检查单"
                class="text-surface-800/50 rounded p-1.5 hover:text-red-600"
                @click="releaseStore.deleteChecklist(c.id)"
              >
                <Trash2 class="size-3.5" />
              </button>
            </div>
          </div>
        </li>
        <li v-if="checklists.length === 0" class="text-surface-800/30 py-4 text-center text-sm">
          暂无检查单草稿
        </li>
      </ul>

      <!-- 发布记录 -->
      <h3 class="text-surface-800/60 mt-6 mb-2 flex items-center gap-1.5 text-xs font-medium">
        <Rocket class="size-3.5" />
        发布记录（{{ records.length }}）
      </h3>
      <ul class="space-y-2">
        <li
          v-for="r in records"
          :key="r.id"
          class="border-surface-100 bg-surface-50 rounded-lg border p-3"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="text-surface-900 truncate text-sm font-medium">
                <CheckCircle2 class="mr-1 inline size-3.5 text-green-600" />
                {{ r.version }} · {{ r.title }}
              </p>
              <p class="text-surface-800/50 mt-0.5 text-xs">
                发布于 {{ r.releaseDate }} · {{ r.taskIds.length }} 个任务 ·
                {{ r.items.filter((i) => i.done).length }}/{{ r.items.length }} 项通过
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label="导出发布说明 Markdown"
                class="text-surface-800/50 hover:text-brand-600 rounded p-1.5"
                @click="exportRecord(r.id)"
              >
                <Download class="size-3.5" />
              </button>
              <button
                v-if="!props.readonly"
                type="button"
                aria-label="删除发布记录"
                class="text-surface-800/50 rounded p-1.5 hover:text-red-600"
                @click="releaseStore.deleteRecord(r.id)"
              >
                <Trash2 class="size-3.5" />
              </button>
            </div>
          </div>
        </li>
        <li v-if="records.length === 0" class="text-surface-800/30 py-3 text-center text-sm">
          暂无发布记录，完成检查单后自动生成
        </li>
      </ul>
    </section>

    <!-- 模板 -->
    <section class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-5">
      <h2 class="text-surface-900 mb-3 flex items-center gap-2 text-sm font-semibold">
        <ListChecks class="text-brand-600 size-4" />
        检查单模板
      </h2>
      <ul class="space-y-1.5">
        <li
          v-for="t in allTemplates"
          :key="t.id"
          class="border-surface-100 bg-surface-50 flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
        >
          <div class="min-w-0">
            <p class="text-surface-800/80 text-xs font-medium">
              {{ t.name }}<span v-if="t.builtin" class="text-surface-800/40 ml-1">（内置）</span>
            </p>
            <p class="text-surface-800/40 truncate text-xs">{{ t.items.join(' / ') }}</p>
          </div>
          <button
            v-if="!t.builtin"
            type="button"
            aria-label="删除模板"
            class="text-surface-800/40 shrink-0 rounded p-1 hover:text-red-600"
            @click="removeTemplate(t)"
          >
            <Trash2 class="size-3.5" />
          </button>
        </li>
      </ul>
      <div v-if="!props.readonly" class="mt-3 flex items-center gap-2">
        <input
          v-model="saveAsTemplateName"
          type="text"
          placeholder="把当前检查项存为模板"
          class="border-surface-200 bg-surface-0 text-surface-900 focus:border-brand-500 min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-sm outline-none"
        />
        <button
          type="button"
          class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors"
          @click="saveAsTemplate"
        >
          保存
        </button>
      </div>
      <p v-if="templateMsg" class="mt-1 text-xs text-green-600">{{ templateMsg }}</p>
    </section>

    <!-- 表单对话框 -->
    <div
      v-if="formOpen"
      class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      @click.self="formOpen = false"
    >
      <div
        class="bg-surface-0 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl"
      >
        <h2 class="text-surface-900 mb-4 text-base font-semibold">
          {{ editing ? '编辑检查单' : '新建发布检查单' }}
        </h2>
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-surface-800/60 mb-1 block text-xs">版本号</label>
              <input
                v-model="draft.version"
                type="text"
                placeholder="v1.2.3"
                class="border-surface-200 bg-surface-0 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
              />
            </div>
            <div>
              <label class="text-surface-800/60 mb-1 block text-xs">发布日期（可选）</label>
              <input
                v-model="draft.releaseDate"
                type="date"
                class="border-surface-200 bg-surface-0 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
              />
            </div>
          </div>
          <div>
            <label class="text-surface-800/60 mb-1 block text-xs">标题</label>
            <input
              v-model="draft.title"
              type="text"
              class="border-surface-200 bg-surface-0 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
            />
          </div>
          <div>
            <label class="text-surface-800/60 mb-1 block text-xs">摘要</label>
            <textarea
              v-model="draft.summary"
              rows="2"
              class="border-surface-200 bg-surface-0 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
            />
          </div>
          <div v-if="!editing">
            <label class="text-surface-800/60 mb-1 block text-xs">使用模板</label>
            <select
              v-model="draft.templateId"
              class="border-surface-200 bg-surface-0 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
            >
              <option v-for="t in allTemplates" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </div>
          <div>
            <label class="text-surface-800/60 mb-1 block text-xs">检查项</label>
            <ul class="space-y-1.5">
              <li
                v-for="(it, idx) in itemDrafts()"
                :key="`${editing?.id ?? 'new'}-${idx}`"
                class="border-surface-100 bg-surface-50 flex items-center gap-2 rounded-lg border px-3 py-2"
              >
                <input
                  type="checkbox"
                  :checked="editing ? it.done : false"
                  class="accent-brand-600 size-3.5"
                  :aria-label="`勾选 ${it.label}`"
                  @change="toggleItemDraft(idx)"
                />
                <span class="text-surface-800/80 text-sm">{{ it.label }}</span>
              </li>
            </ul>
          </div>
          <div>
            <label class="text-surface-800/60 mb-1 block text-xs"
              >关联任务（已完成任务，可多选）</label
            >
            <ul class="max-h-36 space-y-1 overflow-y-auto">
              <li v-for="t in doneTasks" :key="t.id" class="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  :checked="draft.taskIds.includes(t.id)"
                  class="accent-brand-600 size-3.5"
                  :aria-label="`关联任务 ${t.title}`"
                  @change="toggleTask(t.id)"
                />
                <span class="text-surface-800/70 truncate">{{ t.title }}</span>
              </li>
              <li v-if="doneTasks.length === 0" class="text-surface-800/30 text-xs">
                暂无已完成任务
              </li>
            </ul>
          </div>
          <div>
            <label class="text-surface-800/60 mb-1 block text-xs">风险 / 已知问题</label>
            <textarea
              v-model="draft.risks"
              rows="2"
              class="border-surface-200 bg-surface-0 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
            />
          </div>
          <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
          <div class="flex items-center justify-end gap-2">
            <button
              type="button"
              class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors"
              @click="formOpen = false"
            >
              取消
            </button>
            <button
              type="button"
              class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors"
              @click="saveDraft"
            >
              <Save class="size-3.5" />
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
