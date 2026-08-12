<script setup lang="ts">
import { ArrowDownUp, FolderPlus, Layers, Plus, Search, SearchX, Star, Upload } from '@lucide/vue';
import { computed, ref } from 'vue';

import { useTaskStore } from '@/features/tasks/store';
import { TaskForm } from '@/features/tasks';
import type { TaskForm as TaskFormData } from '@/features/tasks/types';
import {
  ConfirmDialog,
  ProjectCard,
  ProjectDeleteDialog,
  ProjectForm,
  StorageWarningBanner,
  TechTree,
  useProjectStore,
} from '@/features/projects';
import { effectiveProgress, sortProjects } from '@/features/projects';
import { parseProjectBundle } from '@/features/projects/transfer';
import type { ProjectImportResult } from '@/features/projects/transfer';
import { PROJECT_FILTERS, PROJECT_SORT_OPTIONS, PROJECT_VIEWS } from '@/features/projects/types';
import type { ProjectDetail, ProjectForm as ProjectFormType } from '@/features/projects/types';

const store = useProjectStore();
const taskStore = useTaskStore();

const formOpen = ref(false);
const editing = ref<ProjectDetail | null>(null);
const archiving = ref<ProjectDetail | null>(null);
/** 删除策略对话框 */
const deleting = ref<ProjectDetail | null>(null);
/** 永久删除二次确认 */
const permanentDeleting = ref<ProjectDetail | null>(null);
const techTreeOpen = ref(false);
/** 快速创建任务的目标项目 */
const quickTaskProject = ref<ProjectDetail | null>(null);

/** 总览统计：任务完成率（全局） */
const completion = computed(() => taskStore.summary.completion);
const summary = computed(() => store.summary);

/** 排序度量：每个项目的有效进度与未完成任务数 */
const sortMetrics = computed(() => {
  const progress = new Map<string, number>();
  const unfinished = new Map<string, number>();
  for (const p of store.projects) {
    const stats = taskStore.projectStats(p.id);
    progress.set(p.id, effectiveProgress(p, stats.progress));
    unfinished.set(p.id, stats.total - stats.done);
  }
  return { progress, unfinished };
});

/** 搜索 + 状态 / 视图筛选 + 排序后的项目列表 */
const visibleProjects = computed(() =>
  sortProjects(store.filteredProjects, store.sortBy, store.sortDir, sortMetrics.value),
);

function openCreate() {
  editing.value = null;
  formOpen.value = true;
}

function openEdit(project: ProjectDetail) {
  editing.value = project;
  formOpen.value = true;
}

function onFormSubmit(form: ProjectFormType) {
  if (editing.value) store.updateProject(editing.value.id, form);
  else store.createProject(form);
  formOpen.value = false;
}

function onQuickTaskSubmit(form: TaskFormData) {
  taskStore.createTask(form, form.subtasks);
  quickTaskProject.value = null;
}

function confirmArchive() {
  if (archiving.value) store.archiveProject(archiving.value.id);
  archiving.value = null;
}

/** 删除策略一：归档并保留任务 */
function onArchiveFromDelete(project: ProjectDetail) {
  deleting.value = null;
  store.archiveProject(project.id);
}

/** 删除策略二：永久删除（进入二次确认） */
function onRequestPermanentDelete(project: ProjectDetail) {
  deleting.value = null;
  permanentDeleting.value = project;
}

function confirmPermanentDelete() {
  if (permanentDeleting.value) {
    taskStore.removeByProject(permanentDeleting.value.id);
    store.deleteProject(permanentDeleting.value.id);
  }
  permanentDeleting.value = null;
}

/** 快捷视图与状态筛选互斥 */
function selectView(view: (typeof PROJECT_VIEWS)[number]['value']) {
  store.viewFilter = view;
  if (view !== 'all') store.statusFilter = 'all';
}

function selectStatus(status: (typeof PROJECT_FILTERS)[number]['value']) {
  store.statusFilter = status;
  if (status !== 'all') store.viewFilter = 'all';
}

function clearFilters() {
  store.searchQuery = '';
  store.statusFilter = 'all';
  store.viewFilter = 'all';
}

/** 项目导入：文件 → 解析（校验 / 清理 / 新 id）→ 预览 → 确认作为新项目导入 */
const importResult = ref<ProjectImportResult | null>(null);
const importing = ref(false);

function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    importResult.value = parseProjectBundle(String(reader.result ?? ''));
    importing.value = true;
  };
  reader.readAsText(file);
  input.value = '';
}

function confirmImport() {
  if (importResult.value?.ok) {
    const bundle = importResult.value.bundle;
    store.importProjectBundle({
      project: bundle.data.project,
      milestones: bundle.data.milestones,
      activities: bundle.data.activities,
      retrospective: bundle.data.retrospective,
    });
    taskStore.importTasks(bundle.data.tasks);
    store.searchQuery = '';
    store.statusFilter = 'all';
    store.viewFilter = 'all';
    store.statusFilter = bundle.data.project.status;
  }
  importing.value = false;
  importResult.value = null;
}
</script>

<template>
  <div class="p-6">
    <!-- 头部 -->
    <header class="page-content-section mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-surface-900 text-xl font-semibold">开发中</h1>
        <p class="text-surface-800/60 mt-1 text-sm">
          个人项目与任务管理：总览、看板与活动记录（本地 mock 持久化）
        </p>
      </div>
      <div class="flex items-center gap-2">
        <label
          class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex cursor-pointer items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors"
        >
          <Upload class="size-4" />
          导入项目
          <input
            type="file"
            accept=".json,application/json"
            class="hidden"
            @change="onImportFile"
          />
        </label>
        <button
          type="button"
          class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors"
          @click="openCreate"
        >
          <Plus class="size-4" />
          新建项目
        </button>
      </div>
    </header>

    <!-- 存储提示（损坏恢复 / 写入失败，非阻塞）+ 迁移提示 -->
    <div class="space-y-2">
      <StorageWarningBanner
        :message="store.storageWarning || taskStore.storageWarning"
        @dismiss="
          () => {
            store.dismissStorageWarning();
            taskStore.dismissStorageWarning();
          }
        "
      />
      <StorageWarningBanner
        :message="store.migrationNotice || taskStore.migrationNotice"
        @dismiss="
          () => {
            store.dismissMigrationNotice();
            taskStore.dismissMigrationNotice();
          }
        "
      />
    </div>

    <!-- 统计条 -->
    <div class="page-content-section mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-4">
        <p class="text-surface-800/50 text-xs">总项目</p>
        <p class="text-surface-900 mt-1 text-2xl font-semibold">{{ summary.total }}</p>
      </div>
      <div class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-4">
        <p class="text-surface-800/50 text-xs">进行中</p>
        <p class="mt-1 text-2xl font-semibold text-green-600">{{ summary.active }}</p>
      </div>
      <div class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-4">
        <p class="text-surface-800/50 text-xs">已完成</p>
        <p class="mt-1 text-2xl font-semibold text-indigo-600">{{ summary.completed }}</p>
      </div>
      <div class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-4">
        <p class="text-surface-800/50 text-xs">任务完成率</p>
        <p class="text-brand-600 mt-1 text-2xl font-semibold">{{ completion }}%</p>
      </div>
    </div>

    <!-- 搜索 + 快捷视图 + 排序 -->
    <div class="mb-3 flex flex-wrap items-center gap-3">
      <div class="relative min-w-0 flex-1 sm:max-w-xs">
        <Search class="text-surface-800/40 absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <input
          v-model="store.searchQuery"
          type="search"
          class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-lg border py-2 pr-3 pl-9 text-sm transition outline-none focus:ring-4"
          placeholder="搜索项目名称、描述、标签、技术栈"
        />
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          v-for="view in PROJECT_VIEWS"
          :key="view.value"
          type="button"
          class="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
          :class="
            store.viewFilter === view.value
              ? 'bg-brand-600 text-surface-0'
              : 'border-surface-100 bg-surface-0 text-surface-800/60 hover:bg-surface-50 hover:text-surface-900 border'
          "
          @click="selectView(view.value)"
        >
          <Star v-if="view.value === 'favorites'" class="size-3" />
          {{ view.label }}
        </button>
      </div>
      <div class="ml-auto flex items-center gap-1.5">
        <select
          v-model="store.sortBy"
          class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 rounded-lg border px-2.5 py-1.5 text-xs transition outline-none focus:ring-4"
          aria-label="项目排序方式"
        >
          <option v-for="opt in PROJECT_SORT_OPTIONS" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <button
          type="button"
          class="border-surface-100 bg-surface-0 text-surface-800/60 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs transition-colors"
          :title="store.sortDir === 'asc' ? '升序，点击切换' : '降序，点击切换'"
          @click="store.sortDir = store.sortDir === 'asc' ? 'desc' : 'asc'"
        >
          <ArrowDownUp class="size-3" />
          {{ store.sortDir === 'asc' ? '升序' : '降序' }}
        </button>
      </div>
    </div>

    <!-- 状态筛选 -->
    <div class="mb-5 flex flex-wrap items-center gap-1.5">
      <button
        v-for="opt in PROJECT_FILTERS"
        :key="opt.value"
        type="button"
        class="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
        :class="
          store.statusFilter === opt.value
            ? 'bg-brand-600 text-surface-0'
            : 'border-surface-100 bg-surface-0 text-surface-800/60 hover:bg-surface-50 hover:text-surface-900 border'
        "
        @click="selectStatus(opt.value)"
      >
        {{ opt.label }}
      </button>
    </div>

    <!-- 项目卡片（长列表整体进入，不给每张卡片单独加动画） -->
    <div
      v-if="visibleProjects.length"
      class="page-content-section grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
    >
      <ProjectCard
        v-for="project in visibleProjects"
        :key="project.id"
        :project="project"
        @edit="openEdit"
        @archive="(p) => (archiving = p)"
        @restore="(p) => store.restoreProject(p.id)"
        @delete="(p) => (deleting = p)"
        @favorite="(p) => store.toggleFavorite(p.id)"
        @quick-task="(p) => (quickTaskProject = p)"
      />
    </div>

    <!-- 空状态：无任何项目 -->
    <div
      v-else-if="!store.projects.length"
      class="border-surface-100 bg-surface-0 shadow-card rounded-card flex flex-col items-center border px-6 py-16 text-center"
    >
      <span
        class="bg-brand-500/10 text-brand-600 flex size-14 items-center justify-center rounded-2xl"
      >
        <FolderPlus class="size-7" />
      </span>
      <h3 class="text-surface-900 mt-4 text-base font-semibold">还没有项目</h3>
      <p class="text-surface-800/60 mt-1 max-w-sm text-sm">
        创建第一个项目，开始管理你的个人开发计划。
      </p>
      <button
        type="button"
        class="bg-brand-600 hover:bg-brand-700 text-surface-0 mt-5 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        @click="openCreate"
      >
        创建项目
      </button>
    </div>

    <!-- 空状态：筛选无结果 -->
    <div
      v-else
      class="border-surface-100 bg-surface-0 shadow-card rounded-card flex flex-col items-center border px-6 py-16 text-center"
    >
      <span
        class="bg-surface-100 text-surface-800/50 flex size-14 items-center justify-center rounded-2xl"
      >
        <SearchX class="size-7" />
      </span>
      <h3 class="text-surface-900 mt-4 text-base font-semibold">没有匹配的项目</h3>
      <p class="text-surface-800/60 mt-1 max-w-sm text-sm">换个关键词、状态或视图试试。</p>
      <button
        type="button"
        class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 mt-5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
        @click="clearFilters"
      >
        清除筛选
      </button>
    </div>

    <!-- 技术栈总览（保留原占位内容，折叠展示） -->
    <section class="mt-8">
      <button
        type="button"
        class="text-surface-800/60 hover:text-surface-900 flex items-center gap-2 text-sm font-medium transition-colors"
        @click="techTreeOpen = !techTreeOpen"
      >
        <Layers class="size-4" />
        仓库技术栈总览
        <span class="text-surface-800/40 text-xs">{{ techTreeOpen ? '收起' : '展开' }}</span>
      </button>
      <div v-if="techTreeOpen" class="mt-4">
        <TechTree />
      </div>
    </section>

    <!-- 新建 / 编辑项目弹窗 -->
    <ProjectForm
      :open="formOpen"
      :project="editing"
      @submit="onFormSubmit"
      @close="formOpen = false"
    />

    <!-- 快速创建任务（关联当前项目） -->
    <TaskForm
      :open="!!quickTaskProject"
      :task="null"
      :project-id="quickTaskProject?.id"
      @submit="onQuickTaskSubmit"
      @close="quickTaskProject = null"
    />

    <!-- 归档确认 -->
    <ConfirmDialog
      :open="!!archiving"
      title="归档项目"
      :message="`确定归档项目「${archiving?.name ?? ''}」吗？归档后任务保留，可在「归档」视图中恢复。`"
      confirm-text="归档"
      @confirm="confirmArchive"
      @cancel="archiving = null"
    />

    <!-- 删除策略选择（归档保留 / 永久删除含任务） -->
    <ProjectDeleteDialog
      :open="!!deleting"
      :project="deleting"
      :task-count="deleting ? taskStore.tasksByProject(deleting.id).length : 0"
      @archive="onArchiveFromDelete"
      @permanent-delete="onRequestPermanentDelete"
      @cancel="deleting = null"
    />

    <!-- 永久删除二次确认 -->
    <ConfirmDialog
      :open="!!permanentDeleting"
      title="永久删除项目"
      :message="`确定永久删除「${permanentDeleting?.name ?? ''}」及其 ${permanentDeleting ? taskStore.tasksByProject(permanentDeleting.id).length : 0} 个任务吗？此操作不可恢复。`"
      confirm-text="永久删除"
      danger
      @confirm="confirmPermanentDelete"
      @cancel="permanentDeleting = null"
    />

    <!-- 项目导入预览 -->
    <div
      v-if="importing && importResult !== null"
      class="fixed inset-0 z-40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="导入项目预览"
    >
      <div
        class="bg-surface-900/30 absolute inset-0"
        @click="
          importing = false;
          importResult = null;
        "
      />
      <div
        class="border-surface-100 bg-surface-0 shadow-float relative w-full max-w-md rounded-xl border p-5"
      >
        <template v-if="importResult.ok">
          <h3 class="text-surface-900 text-base font-semibold">导入项目预览</h3>
          <p class="text-surface-800/60 mt-1 text-sm">
            将作为<strong class="text-surface-900">新项目</strong>导入（重新生成
            id，不覆盖现有数据）：
          </p>
          <dl class="mt-4 space-y-2 text-sm">
            <div class="flex justify-between">
              <dt class="text-surface-800/50">项目名称</dt>
              <dd class="text-surface-900 max-w-[60%] truncate">
                {{ importResult.bundle.data.project.name }}
              </dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-surface-800/50">状态</dt>
              <dd class="text-surface-900">{{ importResult.bundle.data.project.status }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-surface-800/50">内容</dt>
              <dd class="text-surface-900">
                {{ importResult.bundle.data.tasks.length }} 任务 ·
                {{ importResult.bundle.data.milestones.length }} 里程碑 ·
                {{ importResult.bundle.data.activities.length }} 活动
              </dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-surface-800/50">安全处理</dt>
              <dd class="text-surface-900 text-right">
                跳过 {{ importResult.report.skippedInvalid }} · 清依赖
                {{ importResult.report.cleanedDeps }} · 去循环
                {{ importResult.report.removedCycles }}
              </dd>
            </div>
          </dl>
          <div class="mt-5 flex justify-end gap-2">
            <button
              type="button"
              class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors"
              @click="
                importing = false;
                importResult = null;
              "
            >
              取消
            </button>
            <button
              type="button"
              class="bg-brand-600 hover:bg-brand-700 text-surface-0 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors"
              @click="confirmImport"
            >
              确认导入
            </button>
          </div>
        </template>
        <template v-else>
          <h3 class="text-surface-900 text-base font-semibold">导入失败</h3>
          <p class="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">
            {{ importResult.ok === false ? importResult.reason : '未知错误' }}
          </p>
          <div class="mt-5 flex justify-end">
            <button
              type="button"
              class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors"
              @click="
                importing = false;
                importResult = null;
              "
            >
              关闭
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
