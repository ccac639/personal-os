<script setup lang="ts">
import {
  ArrowDownUp,
  Ellipsis,
  FolderPlus,
  Gauge,
  LayoutList,
  Layers,
  Plus,
  RotateCcw,
  Search,
  SearchX,
  Star,
  Upload,
} from '@lucide/vue';
import { computed, ref } from 'vue';

import { useTaskStore } from '@/features/tasks/store';
import { TaskForm } from '@/features/tasks';
import type { TaskForm as TaskFormData, TaskItem } from '@/features/tasks/types';
import {
  ArchiveDialog,
  ConfirmDialog,
  ExecutionPanel,
  ProjectCard,
  ProjectDeleteDialog,
  ProjectForm,
  StorageWarningBanner,
  TechTree,
  buildProjectCardMetrics,
  sortProjects,
  useProjectStore,
} from '@/features/projects';
import type { ProjectCardMetrics } from '@/features/projects/health';
import { useKnowledgeStore } from '@/features/projects/knowledge-store';
import { useReleaseStore } from '@/features/projects/release-store';
import { useWeeklyGoalStore } from '@/features/projects/weekly-goals-store';
import {
  archivePreview,
  archiveProjectWithTasks,
  deleteProjectWithTasks,
  undoArchiveWithTasks,
} from '@/features/projects/archive';
import { parseProjectBundle } from '@/features/projects/transfer';
import type { ProjectImportResult } from '@/features/projects/transfer';
import SyncStatusBanner from '@/features/projects/sync-status-banner.vue';
import { bumpSyncState, createSyncState } from '@/features/projects/sync-core';
import { PROJECT_FILTERS, PROJECT_SORT_OPTIONS, PROJECT_VIEWS } from '@/features/projects/types';
import type {
  Milestone,
  ProjectActivity,
  ProjectDetail,
  ProjectForm as ProjectFormType,
} from '@/features/projects/types';

const store = useProjectStore();
const taskStore = useTaskStore();

/** 同步状态（本轮只读接线：数据源未切换，状态保持 idle；切换后由 sync 引擎状态替换） */
const syncState = createSyncState();
function retrySync(): void {
  // 数据源切换后在此接入 createProjectSync().retry()
}
function dismissSync(): void {
  if (syncState.lastError) bumpSyncState(syncState, { lastError: null });
}

/** 工作台视图：项目列表 / 执行工作区 */
const workspace = ref<'projects' | 'execution'>('projects');

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
/** 更多菜单 */
const moreOpen = ref(false);

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 每项目聚合指标（一次性计算，逐卡传入；大量任务下避免每卡重复统计依赖 / 日期 / 健康状态）。
 * 任务 / 里程碑 / 活动先按项目分桶，再逐项目计算。
 */
const metricsMap = computed(() => {
  const taskBuckets = new Map<string, TaskItem[]>();
  for (const t of taskStore.tasks) {
    if (!t.projectId) continue;
    const arr = taskBuckets.get(t.projectId) ?? [];
    arr.push(t);
    taskBuckets.set(t.projectId, arr);
  }
  const milestoneBuckets = new Map<string, Milestone[]>();
  for (const p of store.projects) {
    milestoneBuckets.set(p.id, store.milestonesOf(p.id));
  }
  const activityBuckets = new Map<string, ProjectActivity[]>();
  for (const p of store.projects) {
    activityBuckets.set(p.id, store.projectActivities(p.id));
  }
  const today = todayStr();
  const map = new Map<string, ProjectCardMetrics>();
  for (const p of store.projects) {
    map.set(
      p.id,
      buildProjectCardMetrics({
        project: p,
        tasks: taskBuckets.get(p.id) ?? [],
        milestones: milestoneBuckets.get(p.id) ?? [],
        activities: activityBuckets.get(p.id) ?? [],
        focusSessions: taskStore.focusSessions,
        today,
      }),
    );
  }
  return map;
});

/** 排序度量（复用聚合指标，不再二次统计） */
const sortMetrics = computed(() => {
  const progress = new Map<string, number>();
  const unfinished = new Map<string, number>();
  for (const [id, m] of metricsMap.value) {
    progress.set(id, m.progress);
    unfinished.set(id, m.unfinished);
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

/** 归档预检对话框（预检摘要 + 直接归档 / 转入收件箱再归档 / 取消） */
const releaseStore = useReleaseStore();
const knowledgeStore = useKnowledgeStore();
const weeklyGoalStore = useWeeklyGoalStore();

const archivePreviewData = computed(() =>
  archiving.value
    ? archivePreview(store, taskStore, releaseStore, knowledgeStore, archiving.value.id, todayStr())
    : null,
);

function confirmArchive() {
  if (archiving.value) {
    archiveProjectWithTasks(
      store,
      taskStore,
      releaseStore,
      knowledgeStore,
      weeklyGoalStore,
      archiving.value.id,
    );
  }
  archiving.value = null;
}

function confirmArchiveToInbox() {
  if (archiving.value) {
    archiveProjectWithTasks(
      store,
      taskStore,
      releaseStore,
      knowledgeStore,
      weeklyGoalStore,
      archiving.value.id,
      {
        moveToInbox: true,
      },
    );
  }
  archiving.value = null;
}

/** 删除策略一：归档并保留任务（走预检对话框） */
function onArchiveFromDelete(project: ProjectDetail) {
  deleting.value = null;
  archiving.value = project;
}

/** 删除策略二：永久删除（进入二次确认） */
function onRequestPermanentDelete(project: ProjectDetail) {
  deleting.value = null;
  permanentDeleting.value = project;
}

function confirmPermanentDelete() {
  if (permanentDeleting.value) {
    deleteProjectWithTasks(
      store,
      taskStore,
      knowledgeStore,
      weeklyGoalStore,
      permanentDeleting.value.id,
      'cascade',
    );
  }
  permanentDeleting.value = null;
}

function confirmPermanentDeleteToInbox() {
  if (permanentDeleting.value) {
    deleteProjectWithTasks(
      store,
      taskStore,
      knowledgeStore,
      weeklyGoalStore,
      permanentDeleting.value.id,
      'to-inbox',
    );
  }
  permanentDeleting.value = null;
}

function undoArchive() {
  undoArchiveWithTasks(store, taskStore);
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
    moreOpen.value = false;
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
          个人研发工作台：项目、任务、执行与知识（本地 mock 持久化）
        </p>
      </div>
    </header>

    <!-- 存储提示（损坏恢复 / 写入失败，非阻塞）+ 迁移提示 + 同步状态 -->
    <div class="mb-4 space-y-2">
      <SyncStatusBanner :states="[syncState]" @retry="retrySync" @dismiss="dismissSync" />
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

    <!-- 工作台视图切换：项目 / 执行 -->
    <div class="mb-4 flex items-center gap-1">
      <div
        class="border-surface-100 bg-surface-0 flex items-center gap-0.5 rounded-xl border p-0.5"
        role="tablist"
        aria-label="工作台视图"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="workspace === 'projects'"
          class="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          :class="
            workspace === 'projects'
              ? 'bg-brand-600 text-surface-0'
              : 'text-surface-800/60 hover:text-surface-900'
          "
          @click="workspace = 'projects'"
        >
          <LayoutList class="size-4" />
          项目
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="workspace === 'execution'"
          class="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          :class="
            workspace === 'execution'
              ? 'bg-brand-600 text-surface-0'
              : 'text-surface-800/60 hover:text-surface-900'
          "
          @click="workspace = 'execution'"
        >
          <Gauge class="size-4" />
          执行
        </button>
      </div>
    </div>

    <!-- 执行工作区：今日计划 / 受阻任务 / 收件箱 / 周目标 / 历史 -->
    <ExecutionPanel v-if="workspace === 'execution'" />

    <!-- 项目列表工作区 -->
    <template v-else>
      <!-- 归档撤销提示 -->
      <div
        v-if="store.canUndoArchive()"
        class="page-content-section mb-5 flex flex-wrap items-center justify-between gap-3"
      >
        <p class="text-surface-800/70 text-sm">已归档项目，可撤销一次恢复原状态与数据。</p>
        <button
          type="button"
          class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors"
          @click="undoArchive"
        >
          <RotateCcw class="size-4" />
          撤销归档
        </button>
      </div>

      <!-- 统一工具栏：搜索 + 状态 / 收藏筛选 + 排序 + 新建 + 更多 -->
      <div class="mb-5 flex flex-wrap items-center gap-2">
        <div class="relative min-w-0 flex-1 sm:max-w-xs">
          <Search class="text-surface-800/40 absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <input
            v-model="store.searchQuery"
            type="search"
            class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-lg border py-2 pr-3 pl-9 text-sm transition outline-none focus:ring-4"
            placeholder="搜索项目名称、描述、标签、技术栈"
          />
        </div>

        <select
          v-model="store.statusFilter"
          class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 rounded-lg border px-2.5 py-2 text-sm transition outline-none focus:ring-4"
          aria-label="项目状态筛选"
          @change="selectStatus(store.statusFilter)"
        >
          <option v-for="opt in PROJECT_FILTERS" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>

        <div class="flex items-center gap-0.5">
          <button
            v-for="view in PROJECT_VIEWS"
            :key="view.value"
            type="button"
            class="flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors"
            :class="
              store.viewFilter === view.value
                ? 'bg-brand-600 text-surface-0'
                : 'border-surface-100 bg-surface-0 text-surface-800/60 hover:bg-surface-50 hover:text-surface-900 border'
            "
            :aria-label="`视图：${view.label}`"
            @click="selectView(view.value)"
          >
            <Star
              v-if="view.value === 'favorites'"
              class="size-3"
              :fill="store.viewFilter === 'favorites' ? 'currentColor' : 'none'"
            />
            {{ view.label }}
          </button>
        </div>

        <div class="flex items-center gap-1.5">
          <select
            v-model="store.sortBy"
            class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 rounded-lg border px-2.5 py-2 text-sm transition outline-none focus:ring-4"
            aria-label="项目排序方式"
          >
            <option v-for="opt in PROJECT_SORT_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
          <button
            type="button"
            class="border-surface-100 bg-surface-0 text-surface-800/60 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1 rounded-lg border px-2.5 py-2 text-xs transition-colors"
            :title="store.sortDir === 'asc' ? '升序，点击切换' : '降序，点击切换'"
            @click="store.sortDir = store.sortDir === 'asc' ? 'desc' : 'asc'"
          >
            <ArrowDownUp class="size-3" />
            {{ store.sortDir === 'asc' ? '升序' : '降序' }}
          </button>
        </div>

        <button
          type="button"
          class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors"
          @click="openCreate"
        >
          <Plus class="size-4" />
          新建项目
        </button>

        <!-- 更多菜单：导入 / 技术栈总览 -->
        <div class="relative">
          <button
            type="button"
            class="border-surface-100 bg-surface-0 text-surface-800/60 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1 rounded-lg border px-2.5 py-2 text-sm font-medium transition-colors"
            aria-label="更多操作"
            title="更多操作"
            @click="moreOpen = !moreOpen"
          >
            <Ellipsis class="size-4" />
          </button>
          <div
            v-if="moreOpen"
            class="border-surface-100 bg-surface-0 shadow-float absolute top-11 right-0 z-20 w-44 overflow-hidden rounded-xl border py-1"
            role="menu"
            aria-label="更多操作"
          >
            <label
              class="text-surface-800/80 hover:bg-surface-50 flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs transition-colors"
              role="menuitem"
            >
              <Upload class="size-3.5" />
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
              role="menuitem"
              class="text-surface-800/80 hover:bg-surface-50 flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors"
              @click="
                techTreeOpen = !techTreeOpen;
                moreOpen = false;
              "
            >
              <Layers class="size-3.5" />
              {{ techTreeOpen ? '收起技术栈总览' : '技术栈总览' }}
            </button>
          </div>
        </div>
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
          :metrics="metricsMap.get(project.id)!"
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

      <!-- 技术栈总览（更多菜单触发，折叠展示） -->
      <section v-if="techTreeOpen" class="mt-8">
        <TechTree />
      </section>
    </template>

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

    <!-- 归档预检对话框 -->
    <ArchiveDialog
      :open="!!archiving"
      :project="archiving"
      :preview="archivePreviewData"
      @archive="confirmArchive"
      @archive-to-inbox="confirmArchiveToInbox"
      @cancel="archiving = null"
    />

    <!-- 删除策略选择（归档保留 / 永久删除含任务） -->
    <ProjectDeleteDialog
      :open="!!deleting"
      :project="deleting"
      :task-count="deleting ? taskStore.tasksByProject(deleting.id).length : 0"
      @archive="onArchiveFromDelete"
      @permanent-delete="onRequestPermanentDelete"
      @permanent-delete-to-inbox="confirmPermanentDeleteToInbox"
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
