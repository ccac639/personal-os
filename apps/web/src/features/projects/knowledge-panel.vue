<script setup lang="ts">
import {
  BookOpen,
  Download,
  Ellipsis,
  FileText,
  Lightbulb,
  Plus,
  Save,
  Search,
  Trash2,
} from '@lucide/vue';
import { computed, ref, watch } from 'vue';

import { useProjectStore } from './store';
import { useTaskStore } from '@/features/tasks/store';
import { useKnowledgeStore } from './knowledge-store';
import {
  DECISION_STATUS_META,
  ISSUE_STATUS_META,
  KNOWLEDGE_TYPE_META,
  buildKnowledgeMarkdown,
  filterKnowledge,
  knowledgeTags,
} from './knowledge';
import type { DecisionStatus, IssueStatus, KnowledgeEntry, KnowledgeType } from './knowledge';

const props = defineProps<{
  projectId: string;
  /** 从任务详情 / 复盘快速创建时传入的上下文（自动关联） */
  contextTaskId?: string;
  contextMilestoneId?: string;
  /** 只读模式（归档项目）：禁止新建 / 编辑 / 删除 */
  readonly?: boolean;
}>();

const projectStore = useProjectStore();
const taskStore = useTaskStore();
const knowledgeStore = useKnowledgeStore();

const project = computed(() => projectStore.projectById(props.projectId));

// ── 筛选 ──
const q = ref('');
const typeFilter = ref<KnowledgeType | 'all'>('all');
const tagFilter = ref('');
const statusFilter = ref('all');

const entries = computed(() =>
  filterKnowledge(knowledgeStore.entriesOf(props.projectId), {
    q: q.value,
    type: typeFilter.value,
    tag: tagFilter.value || undefined,
    status: statusFilter.value,
  }),
);
const allTags = computed(() => knowledgeTags(knowledgeStore.entriesOf(props.projectId)));
const statusOptions = computed(() => {
  if (typeFilter.value === 'decision')
    return Object.entries(DECISION_STATUS_META).map(([v, m]) => ({ value: v, label: m.label }));
  if (typeFilter.value === 'issue')
    return Object.entries(ISSUE_STATUS_META).map(([v, m]) => ({ value: v, label: m.label }));
  return [];
});

// ── 表单 ──
const formOpen = ref(false);
const editingId = ref<string | null>(null);
const form = ref({
  type: 'issue' as KnowledgeType,
  title: '',
  body: '',
  tagsText: '',
  taskIds: [] as string[],
  milestoneIds: [] as string[],
  decisionStatus: 'pending' as DecisionStatus,
  issueStatus: 'open' as IssueStatus,
});
const error = ref('');

function openNew(type?: KnowledgeType, context?: { taskId?: string; milestoneId?: string }) {
  const ctx = context ?? {
    taskId: props.contextTaskId,
    milestoneId: props.contextMilestoneId,
  };
  form.value = {
    type: type ?? 'issue',
    title: '',
    body: '',
    tagsText: '',
    taskIds: ctx.taskId ? [ctx.taskId] : [],
    milestoneIds: ctx.milestoneId ? [ctx.milestoneId] : [],
    decisionStatus: 'pending',
    issueStatus: 'open',
  };
  editingId.value = null;
  formOpen.value = true;
  error.value = '';
}

function openEdit(e: KnowledgeEntry) {
  editingId.value = e.id;
  form.value = {
    type: e.type,
    title: e.title,
    body: e.body,
    tagsText: e.tags.join('，'),
    taskIds: e.taskIds,
    milestoneIds: e.milestoneIds,
    decisionStatus: e.decisionStatus ?? 'pending',
    issueStatus: e.issueStatus ?? 'open',
  };
  formOpen.value = true;
  error.value = '';
}

function splitTags(text: string): string[] {
  return text
    .split(/[,，\s]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function save() {
  if (!form.value.title.trim()) {
    error.value = '请填写标题';
    return;
  }
  if (editingId.value) {
    knowledgeStore.updateEntry(editingId.value, {
      type: form.value.type,
      title: form.value.title,
      body: form.value.body,
      tags: splitTags(form.value.tagsText),
      taskIds: form.value.taskIds,
      milestoneIds: form.value.milestoneIds,
      decisionStatus: form.value.type === 'decision' ? form.value.decisionStatus : undefined,
      issueStatus: form.value.type === 'issue' ? form.value.issueStatus : undefined,
    });
  } else {
    knowledgeStore.createEntry({
      projectId: props.projectId,
      type: form.value.type,
      title: form.value.title,
      body: form.value.body,
      tags: splitTags(form.value.tagsText),
      taskIds: form.value.taskIds,
      milestoneIds: form.value.milestoneIds,
      decisionStatus: form.value.type === 'decision' ? form.value.decisionStatus : undefined,
      issueStatus: form.value.type === 'issue' ? form.value.issueStatus : undefined,
    });
  }
  formOpen.value = false;
}

function toggleTask(id: string) {
  const s = new Set(form.value.taskIds);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  form.value.taskIds = [...s];
}

function toggleMilestone(id: string) {
  const s = new Set(form.value.milestoneIds);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  form.value.milestoneIds = [...s];
}

const taskById = (id: string) => taskStore.taskById(id);
const milestoneById = (id: string) => projectStore.milestoneById(id);

function exportMd() {
  if (!project.value) return;
  const md = buildKnowledgeMarkdown(
    knowledgeStore.entriesOf(props.projectId),
    project.value,
    taskStore.tasks,
    projectStore.milestonesOf(props.projectId),
  );
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `knowledge-${project.value.name}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

const opened = ref<Set<string>>(new Set());
function toggleOpen(id: string) {
  const s = new Set(opened.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  opened.value = s;
}

/** 更多菜单（导出等低频操作收纳） */
const moreOpen = ref(false);

const typeBtnMeta = {
  decision: { label: '决策', cls: 'bg-violet-500/10 text-violet-600' },
  issue: { label: '问题', cls: 'bg-amber-500/10 text-amber-700' },
  reference: { label: '参考', cls: 'bg-sky-500/10 text-sky-600' },
} as const;

function statusLabel(e: KnowledgeEntry): string {
  if (e.type === 'decision' && e.decisionStatus)
    return DECISION_STATUS_META[e.decisionStatus].label;
  if (e.type === 'issue' && e.issueStatus) return ISSUE_STATUS_META[e.issueStatus].label;
  return '';
}

// 上下文创建（从任务详情 / 复盘触发）
watch(
  () => props.contextTaskId,
  (v) => {
    if (v) openNew('issue', { taskId: v });
  },
);
</script>

<template>
  <div class="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
    <!-- 列表 -->
    <section
      class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-5 lg:col-span-2"
    >
      <header class="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
          <BookOpen class="text-brand-600 size-4" />
          知识记录
          <span class="text-surface-800/50 text-xs font-normal">
            {{ entries.length }} / {{ knowledgeStore.entriesOf(projectId).length }}
          </span>
        </h2>
        <div class="flex items-center gap-2">
          <button
            v-if="!props.readonly"
            type="button"
            class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            @click="openNew()"
          >
            <Plus class="size-3.5" />
            新建
          </button>
          <div class="relative">
            <button
              type="button"
              class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors"
              aria-label="知识更多操作"
              title="更多操作"
              @click="moreOpen = !moreOpen"
            >
              <Ellipsis class="size-4" />
            </button>
            <div
              v-if="moreOpen"
              class="border-surface-100 bg-surface-0 shadow-float absolute top-10 right-0 z-20 w-40 overflow-hidden rounded-xl border py-1"
              role="menu"
              aria-label="知识更多操作"
            >
              <button
                v-if="!props.readonly"
                type="button"
                role="menuitem"
                class="text-surface-800/80 hover:bg-surface-50 flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors"
                :disabled="knowledgeStore.entriesOf(projectId).length === 0"
                @click="
                  exportMd();
                  moreOpen = false;
                "
              >
                <Download class="size-3.5" />
                导出 Markdown
              </button>
            </div>
          </div>
        </div>
      </header>

      <!-- 筛选 -->
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <div class="relative min-w-0 flex-1">
          <Search class="text-surface-800/30 absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <input
            v-model="q"
            type="search"
            placeholder="全文关键词搜索…"
            class="border-surface-200 bg-surface-0 text-surface-900 focus:border-brand-500 placeholder:text-surface-800/30 w-full rounded-lg border py-1.5 pr-3 pl-8 text-sm outline-none"
          />
        </div>
        <select
          v-model="typeFilter"
          class="border-surface-200 bg-surface-0 text-surface-900 focus:border-brand-500 rounded-lg border px-2 py-1.5 text-sm outline-none"
          aria-label="按类型筛选"
        >
          <option value="all">全部类型</option>
          <option v-for="(m, k) in KNOWLEDGE_TYPE_META" :key="k" :value="k">{{ m.label }}</option>
        </select>
        <select
          v-if="allTags.length"
          v-model="tagFilter"
          class="border-surface-200 bg-surface-0 text-surface-900 focus:border-brand-500 max-w-36 rounded-lg border px-2 py-1.5 text-sm outline-none"
          aria-label="按标签筛选"
        >
          <option value="">全部标签</option>
          <option v-for="t in allTags" :key="t" :value="t">#{{ t }}</option>
        </select>
        <select
          v-if="statusOptions.length"
          v-model="statusFilter"
          class="border-surface-200 bg-surface-0 text-surface-900 focus:border-brand-500 rounded-lg border px-2 py-1.5 text-sm outline-none"
          aria-label="按状态筛选"
        >
          <option value="all">全部状态</option>
          <option v-for="o in statusOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </div>

      <ul class="space-y-2">
        <li
          v-for="e in entries"
          :key="e.id"
          class="border-surface-100 bg-surface-50 rounded-lg border p-3"
        >
          <button
            type="button"
            class="flex w-full items-start justify-between gap-2 text-left"
            :aria-label="`展开 ${e.title}`"
            @click="toggleOpen(e.id)"
          >
            <span class="min-w-0">
              <span
                class="mr-2 inline-block rounded px-1.5 py-0.5 text-xs font-medium"
                :class="typeBtnMeta[e.type].cls"
              >
                {{ KNOWLEDGE_TYPE_META[e.type].label }}
              </span>
              <span class="text-surface-900 text-sm font-medium">{{ e.title }}</span>
              <span v-if="statusLabel(e)" class="text-surface-800/50 ml-1 text-xs">
                （{{ statusLabel(e) }}）
              </span>
            </span>
          </button>
          <div v-if="opened.has(e.id)" class="mt-2 space-y-2">
            <p class="text-surface-800/80 text-sm leading-6 whitespace-pre-wrap">
              {{ e.body || '（无正文）' }}
            </p>
            <div class="flex flex-wrap gap-2 text-xs">
              <span v-for="t in e.tags" :key="t" class="bg-surface-100 rounded px-1.5 py-0.5">
                #{{ t }}
              </span>
              <span
                v-for="id in e.taskIds"
                :key="`t-${id}`"
                class="bg-brand-500/10 text-brand-600 rounded px-1.5 py-0.5"
              >
                任务：{{ taskById(id)?.title ?? '已删除' }}
              </span>
              <span
                v-for="id in e.milestoneIds"
                :key="`m-${id}`"
                class="rounded bg-violet-500/10 px-1.5 py-0.5 text-violet-600"
              >
                里程碑：{{ milestoneById(id)?.title ?? '已删除' }}
              </span>
            </div>
            <div class="flex items-center gap-1">
              <button
                v-if="!props.readonly"
                type="button"
                aria-label="编辑知识条目"
                class="text-surface-800/50 hover:text-surface-900 rounded p-1"
                @click="openEdit(e)"
              >
                <Save class="size-3.5" />
              </button>
              <button
                v-if="!props.readonly"
                type="button"
                aria-label="删除知识条目"
                class="text-surface-800/50 rounded p-1 hover:text-red-600"
                @click="knowledgeStore.deleteEntry(e.id)"
              >
                <Trash2 class="size-3.5" />
              </button>
              <span class="text-surface-800/30 text-xs">
                更新于 {{ e.updatedAt.slice(0, 10) }}
              </span>
            </div>
          </div>
        </li>
        <li v-if="entries.length === 0" class="text-surface-800/30 py-6 text-center text-sm">
          暂无知识记录，点击「新建」记录决策、问题或参考
        </li>
      </ul>
    </section>

    <!-- 快捷入口 -->
    <section
      v-if="!props.readonly"
      class="border-surface-100 bg-surface-0 shadow-card rounded-card h-fit border p-5"
    >
      <h2 class="text-surface-900 mb-3 flex items-center gap-2 text-sm font-semibold">
        <Lightbulb class="text-brand-600 size-4" />
        快速记录
      </h2>
      <div class="space-y-2">
        <button
          type="button"
          class="border-surface-100 bg-surface-0 flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors hover:border-violet-500/40"
          @click="openNew('decision')"
        >
          <FileText class="size-4 text-violet-600" />
          记录决策
        </button>
        <button
          type="button"
          class="border-surface-100 bg-surface-0 flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors hover:border-amber-500/40"
          @click="openNew('issue')"
        >
          <Lightbulb class="size-4 text-amber-600" />
          记录问题
        </button>
        <button
          type="button"
          class="border-surface-100 bg-surface-0 flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors hover:border-sky-500/40"
          @click="openNew('reference')"
        >
          <BookOpen class="size-4 text-sky-600" />
          记录参考
        </button>
      </div>
      <p class="text-surface-800/40 mt-3 text-xs leading-5">
        支持从任务详情或复盘页一键创建并自动关联上下文（任务 / 里程碑）。
      </p>
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
          {{ editingId ? '编辑知识条目' : '新建知识条目' }}
        </h2>
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-surface-800/60 mb-1 block text-xs">类型</label>
              <select
                v-model="form.type"
                class="border-surface-200 bg-surface-0 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
              >
                <option v-for="(m, k) in KNOWLEDGE_TYPE_META" :key="k" :value="k">
                  {{ m.label }}
                </option>
              </select>
            </div>
            <div>
              <label class="text-surface-800/60 mb-1 block text-xs">
                {{
                  form.type === 'decision'
                    ? '决策状态'
                    : form.type === 'issue'
                      ? '问题状态'
                      : '标签'
                }}
              </label>
              <select
                v-if="form.type === 'decision'"
                v-model="form.decisionStatus"
                class="border-surface-200 bg-surface-0 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
              >
                <option v-for="(m, k) in DECISION_STATUS_META" :key="k" :value="k">
                  {{ m.label }}
                </option>
              </select>
              <select
                v-else-if="form.type === 'issue'"
                v-model="form.issueStatus"
                class="border-surface-200 bg-surface-0 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
              >
                <option v-for="(m, k) in ISSUE_STATUS_META" :key="k" :value="k">
                  {{ m.label }}
                </option>
              </select>
              <input
                v-else
                v-model="form.tagsText"
                type="text"
                placeholder="逗号分隔"
                class="border-surface-200 bg-surface-0 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
              />
            </div>
          </div>
          <div>
            <label class="text-surface-800/60 mb-1 block text-xs">标题</label>
            <input
              v-model="form.title"
              type="text"
              class="border-surface-200 bg-surface-0 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
            />
          </div>
          <div>
            <label class="text-surface-800/60 mb-1 block text-xs">正文</label>
            <textarea
              v-model="form.body"
              rows="4"
              class="border-surface-200 bg-surface-0 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
            />
          </div>
          <div v-if="form.type !== 'reference'">
            <label class="text-surface-800/60 mb-1 block text-xs">标签（逗号分隔）</label>
            <input
              v-model="form.tagsText"
              type="text"
              class="border-surface-200 bg-surface-0 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
            />
          </div>
          <div>
            <label class="text-surface-800/60 mb-1 block text-xs">关联任务</label>
            <ul class="max-h-28 space-y-1 overflow-y-auto">
              <li
                v-for="t in taskStore.tasksByProject(projectId)"
                :key="t.id"
                class="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  :checked="form.taskIds.includes(t.id)"
                  class="accent-brand-600 size-3.5"
                  :aria-label="`关联任务 ${t.title}`"
                  @change="toggleTask(t.id)"
                />
                <span class="text-surface-800/70 truncate">{{ t.title }}</span>
              </li>
              <li
                v-if="taskStore.tasksByProject(projectId).length === 0"
                class="text-surface-800/30 text-xs"
              >
                暂无任务
              </li>
            </ul>
          </div>
          <div>
            <label class="text-surface-800/60 mb-1 block text-xs">关联里程碑</label>
            <ul class="max-h-24 space-y-1 overflow-y-auto">
              <li
                v-for="m in projectStore.milestonesOf(projectId)"
                :key="m.id"
                class="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  :checked="form.milestoneIds.includes(m.id)"
                  class="accent-brand-600 size-3.5"
                  :aria-label="`关联里程碑 ${m.title}`"
                  @change="toggleMilestone(m.id)"
                />
                <span class="text-surface-800/70 truncate">{{ m.title }}</span>
              </li>
              <li
                v-if="projectStore.milestonesOf(projectId).length === 0"
                class="text-surface-800/30 text-xs"
              >
                暂无里程碑
              </li>
            </ul>
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
              @click="save"
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
