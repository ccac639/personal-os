<script setup lang="ts">
import { Archive, CalendarClock, CheckCircle2, FolderInput, Inbox, Trash2 } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useTaskStore } from './store';
import { useProjectStore } from '@/features/projects/store';
import { TASK_STATUS_META } from './types';
import type { KanbanStatus, TaskItem } from './types';
import QuickCaptureInput from './quick-capture-input.vue';
import type { QuickCaptureParse } from './quick-capture';

const store = useTaskStore();
const projectStore = useProjectStore();
const router = useRouter();

const selected = ref<Set<string>>(new Set());
const assignProjectId = ref('');
const filterTag = ref('');

const grouped = computed<Record<KanbanStatus, TaskItem[]>>(() => {
  const list = store.inboxTasks.filter((t) =>
    filterTag.value ? t.tags.includes(filterTag.value) : true,
  );
  const out: Record<KanbanStatus, TaskItem[]> = { todo: [], 'in-progress': [], done: [] };
  for (const t of list) {
    if (t.status === 'cancelled') continue;
    out[t.status as KanbanStatus].push(t);
  }
  return out;
});

const tags = computed(() => {
  const set = new Set<string>();
  for (const t of store.inboxTasks) for (const tag of t.tags) set.add(tag);
  return [...set];
});

const STATUS_META = TASK_STATUS_META;
const statuses: KanbanStatus[] = ['todo', 'in-progress', 'done'];

function onCreate(p: QuickCaptureParse) {
  store.createTask({
    projectId: undefined,
    title: p.title,
    priority: p.priority,
    status: 'todo',
    dueDate: p.dueDate,
    tags: p.tags,
  });
}

function toggle(id: string) {
  const s = new Set(selected.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  selected.value = s;
}

function toggleAll(list: TaskItem[]) {
  const all = list.every((t) => selected.value.has(t.id));
  const s = new Set(selected.value);
  for (const t of list) {
    if (all) s.delete(t.id);
    else s.add(t.id);
  }
  selected.value = s;
}

function assignSelected() {
  if (!assignProjectId.value || selected.value.size === 0) return;
  store.assignToProject([...selected.value], assignProjectId.value);
  selected.value = new Set();
  assignProjectId.value = '';
}

function toFocus() {
  store.addInboxToFocus([...selected.value]);
  selected.value = new Set();
}

function markLater() {
  const ids = [...selected.value];
  for (const id of ids) {
    const t = store.taskById(id);
    if (t && !t.tags.includes('稍后')) {
      store.updateTask(id, {
        projectId: undefined,
        title: t.title,
        priority: t.priority,
        status: t.status,
        dueDate: t.dueDate,
        tags: [...t.tags, '稍后'],
      });
    }
  }
  selected.value = new Set();
}

function archiveSelected() {
  const ids = [...selected.value];
  for (const id of ids) {
    const t = store.taskById(id);
    if (t && t.status !== 'done') {
      store.updateTask(id, {
        projectId: undefined,
        title: t.title,
        priority: t.priority,
        status: 'done',
        dueDate: t.dueDate,
        tags: t.tags,
      });
    }
  }
  selected.value = new Set();
}

function deleteSelected() {
  for (const id of [...selected.value]) store.deleteTask(id);
  selected.value = new Set();
}

/** 拖拽任务到项目行 → 分配 */
const draggingIds = ref<string[]>([]);

function onDragStart(t: TaskItem) {
  draggingIds.value = [t.id];
}

function onDrop(projectId: string) {
  const ids = [...new Set([...draggingIds.value, ...selected.value])];
  if (ids.length) store.assignToProject(ids, projectId);
  draggingIds.value = [];
  selected.value = new Set();
}
</script>

<template>
  <section class="page-content-section">
    <header class="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
      <div>
        <h1 class="text-surface-900 flex items-center gap-2 text-xl font-semibold">
          <Inbox class="text-brand-600 size-5" />
          任务收件箱
        </h1>
        <p class="text-surface-800/60 mt-1 text-sm">
          未归属项目的任务集中在此，支持快速捕获、批量分配与转入今日计划。
        </p>
      </div>
      <div class="flex items-center gap-2">
        <select
          v-if="tags.length"
          v-model="filterTag"
          class="border-surface-200 bg-surface-0 text-surface-900 focus:border-brand-500 rounded-lg border px-2 py-1.5 text-sm outline-none"
          aria-label="按标签筛选收件箱"
        >
          <option value="">全部标签</option>
          <option v-for="t in tags" :key="t" :value="t">#{{ t }}</option>
        </select>
      </div>
    </header>

    <!-- 快速捕获 -->
    <div class="border-surface-100 bg-surface-50 mx-5 mt-4 rounded-xl border p-3">
      <QuickCaptureInput
        placeholder="快速输入：标题 #标签 !高 本周五（回车创建）"
        @submit="onCreate"
      />
    </div>

    <!-- 批量操作条 -->
    <div
      v-if="selected.size > 0"
      class="border-brand-500/30 bg-brand-500/5 mx-5 mt-4 flex flex-wrap items-center gap-2 rounded-xl border p-3"
    >
      <span class="text-brand-700 text-sm font-medium">已选 {{ selected.size }} 项</span>
      <select
        v-model="assignProjectId"
        class="border-surface-200 bg-surface-0 text-surface-900 focus:border-brand-500 rounded-lg border px-2 py-1.5 text-sm outline-none"
        aria-label="选择目标项目"
      >
        <option value="">分配到项目…</option>
        <option
          v-for="p in projectStore.projects.filter((x) => x.status !== 'archived')"
          :key="p.id"
          :value="p.id"
        >
          {{ p.name }}
        </option>
      </select>
      <button
        type="button"
        class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40"
        :disabled="!assignProjectId"
        @click="assignSelected"
      >
        <FolderInput class="size-3.5" />
        分配
      </button>
      <button
        type="button"
        class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
        @click="toFocus"
      >
        <CalendarClock class="size-3.5" />
        转今日计划
      </button>
      <button
        type="button"
        class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
        @click="markLater"
      >
        稍后处理
      </button>
      <button
        type="button"
        class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
        @click="archiveSelected"
      >
        <Archive class="size-3.5" />
        归档
      </button>
      <button
        type="button"
        class="bg-surface-0 flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
        @click="deleteSelected"
      >
        <Trash2 class="size-3.5" />
        删除
      </button>
    </div>

    <!-- 分组看板 -->
    <div class="grid grid-cols-1 gap-4 p-5 md:grid-cols-3">
      <div
        v-for="s in statuses"
        :key="s"
        class="border-surface-100 bg-surface-0 shadow-card rounded-card border"
      >
        <header class="flex items-center justify-between px-4 py-3">
          <h2 class="text-surface-800/80 text-sm font-medium">
            {{ STATUS_META[s].label }}
            <span class="text-surface-800/40 ml-1 text-xs">{{ grouped[s].length }}</span>
          </h2>
          <input
            v-if="grouped[s].length > 0"
            type="checkbox"
            :checked="grouped[s].every((t) => selected.has(t.id))"
            class="accent-brand-600 size-3.5"
            aria-label="全选本组"
            @change="toggleAll(grouped[s])"
          />
        </header>
        <ul class="space-y-2 px-3 pb-3">
          <li
            v-for="t in grouped[s]"
            :key="t.id"
            class="border-surface-100 hover:border-brand-500/40 group flex items-start gap-2 rounded-lg border p-2.5 transition-colors"
            draggable="true"
            @dragstart="onDragStart(t)"
          >
            <input
              type="checkbox"
              :checked="selected.has(t.id)"
              class="accent-brand-600 mt-1 size-3.5"
              :aria-label="`选择任务 ${t.title}`"
              @change="toggle(t.id)"
            />
            <div class="min-w-0 flex-1">
              <button
                type="button"
                class="text-surface-900 text-left text-sm leading-5 font-medium hover:underline"
                @click="router.push({ query: { task: t.id } })"
              >
                {{ t.title }}
              </button>
              <p class="text-surface-800/50 mt-1 flex flex-wrap items-center gap-2 text-xs">
                <span v-if="t.dueDate" class="flex items-center gap-0.5">
                  <CalendarClock class="size-3" />
                  {{ t.dueDate }}
                </span>
                <span v-for="tag in t.tags" :key="tag" class="bg-surface-100 rounded px-1 py-0.5">
                  #{{ tag }}
                </span>
                <span v-if="t.estimatedMinutes" class="text-surface-800/40">
                  估 {{ Math.round((t.estimatedMinutes / 60) * 10) / 10 }}h
                </span>
              </p>
            </div>
            <span
              v-if="store.isBlockedTask(t.id)"
              class="shrink-0 self-start rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-700"
            >
              受阻
            </span>
          </li>
          <li v-if="grouped[s].length === 0" class="text-surface-800/30 py-4 text-center text-xs">
            暂无任务
          </li>
        </ul>
      </div>
    </div>

    <!-- 拖拽目标：项目列表 -->
    <div class="border-t px-5 py-4">
      <p class="text-surface-800/50 mb-2 text-xs">
        将任务拖到下方项目即可分配（也可先勾选再选择项目批量分配）。
      </p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="p in projectStore.projects.filter((x) => x.status !== 'archived')"
          :key="p.id"
          type="button"
          class="border-surface-100 bg-surface-0 text-surface-800/70 hover:border-brand-500/40 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
          @dragover.prevent
          @drop.prevent="onDrop(p.id)"
          @click="router.push({ path: `/projects/${p.id}` })"
        >
          <CheckCircle2 class="text-brand-600 size-3.5" />
          {{ p.name }}
        </button>
        <p
          v-if="projectStore.projects.filter((x) => x.status !== 'archived').length === 0"
          class="text-surface-800/30 text-sm"
        >
          暂无活动项目，先创建项目再分配任务。
        </p>
      </div>
    </div>
  </section>
</template>
