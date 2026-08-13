<script setup lang="ts">
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  CalendarClock,
  ClipboardList,
  Download,
  Ellipsis,
  Flag,
  Pencil,
  Plus,
  Rocket,
  RotateCcw,
  Tag,
  Trash2,
  Upload,
  User,
} from '@lucide/vue';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { Component } from 'vue';

import {
  ArchiveDialog,
  ConfirmDialog,
  ExecutionTab,
  KnowledgePanel,
  ProjectContextBar,
  ProjectDeleteDialog,
  ProjectForm,
  ProjectPlanView,
  ProgressEditor,
  ReleasePanel,
  RetroView,
  StorageWarningBanner,
  useProjectStore,
} from '@/features/projects';
import { useKnowledgeStore } from '@/features/projects/knowledge-store';
import { useReleaseStore } from '@/features/projects/release-store';
import { useWeeklyGoalStore } from '@/features/projects/weekly-goals-store';
import { buildRiskRules } from '@/features/projects/health';
import {
  archivePreview,
  archiveProjectWithTasks,
  deleteProjectWithTasks,
  undoArchiveWithTasks,
} from '@/features/projects/archive';
import { effectiveProgress } from '@/features/projects/progress';
import { PROJECT_STATUS_META } from '@/features/projects/types';
import type {
  ProjectActivityType,
  ProjectForm as ProjectFormType,
} from '@/features/projects/types';
import { formatDateTime, formatDate, relativeTime } from '@/features/projects/utils';
import { TaskForm, TaskKanban, useTaskStore } from '@/features/tasks';
import { parseTasksJson, serializeTasks } from '@/features/tasks/transfer';
import type { TasksImportResult } from '@/features/tasks/transfer';
import type { TaskForm as TaskFormData, TaskItem } from '@/features/tasks/types';

type TabKey = 'overview' | 'tasks' | 'plan' | 'execution' | 'release' | 'knowledge' | 'retro';

const route = useRoute();
const router = useRouter();
const store = useProjectStore();
const taskStore = useTaskStore();
const releaseStore = useReleaseStore();
const knowledgeStore = useKnowledgeStore();
const weeklyGoalStore = useWeeklyGoalStore();

const projectId = computed(() => String(route.params.id ?? ''));
const project = computed(() => store.projectById(projectId.value));
const stats = computed(() => taskStore.projectStats(projectId.value));
const activities = computed(() => store.projectActivities(projectId.value));
const latest = computed(() => store.latestActivity(projectId.value));

const tab = ref<TabKey>('overview');
const formOpen = ref(false);
const archiving = ref(false);
/** 删除策略对话框 */
const deleting = ref(false);
/** 永久删除二次确认 */
const permanentDeleting = ref(false);
/** 快速创建任务 */
const quickTaskOpen = ref(false);
/** 任务导入 / 导出更多菜单 */
const taskMenuOpen = ref(false);
/** 归档项目只读模式（任务 / 计划 / 路线图 / 知识禁止编辑） */
const readonly = computed(() => project.value?.status === 'archived');

/** 统一二级导航（活动记录并入概览「近期活动」） */
const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: '概览' },
  { key: 'tasks', label: '任务' },
  { key: 'plan', label: '计划' },
  { key: 'execution', label: '执行' },
  { key: 'release', label: '发布' },
  { key: 'knowledge', label: '知识' },
  { key: 'retro', label: '复盘' },
];

const ACTIVITY_META: Record<ProjectActivityType, { label: string; icon: Component; cls: string }> =
  {
    created: { label: '创建', icon: ClipboardList, cls: 'bg-brand-500/10 text-brand-600' },
    updated: { label: '更新', icon: Pencil, cls: 'bg-sky-500/10 text-sky-600' },
    archived: { label: '归档', icon: Archive, cls: 'bg-surface-100 text-surface-800/60' },
    restored: { label: '恢复', icon: RotateCcw, cls: 'bg-green-500/10 text-green-600' },
    deleted: { label: '删除', icon: Trash2, cls: 'bg-red-500/10 text-red-600' },
    task: { label: '任务', icon: ClipboardList, cls: 'bg-amber-500/10 text-amber-600' },
    milestone: { label: '里程碑', icon: Flag, cls: 'bg-indigo-500/10 text-indigo-600' },
    snapshot: { label: '快照', icon: Archive, cls: 'bg-surface-100 text-surface-800/60' },
    release: { label: '发布', icon: Rocket, cls: 'bg-green-500/10 text-green-600' },
  };

/** 有效进度（概览上下文展示） */
const effective = computed(() =>
  project.value ? effectiveProgress(project.value, stats.value.progress) : 0,
);

/** 风险摘要：规则化输出（进度落后 / 临近截止 / 长期无活动 / 阻塞 / 专注偏差） */
const riskSummary = computed<{ label: string; value: string; tone: 'danger' | 'warn' | 'ok' }[]>(
  () => {
    if (!project.value) return [];
    const today = formatDate(new Date().toISOString()) || '';
    return buildRiskRules({
      project: project.value,
      tasks: taskStore.tasksByProject(projectId.value),
      milestones: store.milestonesOf(projectId.value),
      activities: activities.value,
      focusSessions: taskStore.focusSessions,
      today,
      latestActivityAt: latest.value?.createdAt ?? null,
    }).map((r) => ({ label: r.label, value: r.detail, tone: r.level }));
  },
);

/** 下一步行动：逾期 / 今日到期 / 受阻 的未完成任务（最多 6 条） */
const nextActions = computed<TaskItem[]>(() => {
  const today = formatDate(new Date().toISOString()) || '';
  return taskStore
    .tasksByProject(projectId.value)
    .filter((t) => t.status !== 'done' && t.status !== 'cancelled')
    .filter((t) => (!!t.dueDate && t.dueDate <= today) || taskStore.isBlockedTask(t.id))
    .sort((a, b) => {
      const aOverdue = a.dueDate && a.dueDate < today ? 0 : 1;
      const bOverdue = b.dueDate && b.dueDate < today ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      return (a.dueDate ?? '9999') < (b.dueDate ?? '9999') ? -1 : 1;
    })
    .slice(0, 6);
});

/** 近期活动：默认 5 条，可展开全部 */
const activityLimit = ref(5);
const shownActivities = computed(() => activities.value.slice(0, activityLimit.value));

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 任务导入 / 导出（JSON，预览后确认） */
const importingTasks = ref(false);
const tasksImportResult = ref<TasksImportResult | null>(null);

function exportTasksJson() {
  const text = serializeTasks(taskStore.tasksByProject(projectId.value));
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tasks-${project.value!.name}-${formatDate(new Date().toISOString()) ?? ''}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function onTasksImportFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    tasksImportResult.value = parseTasksJson(String(reader.result ?? ''), projectId.value);
    importingTasks.value = true;
    taskMenuOpen.value = false;
  };
  reader.readAsText(file);
  input.value = '';
}

function confirmTasksImport() {
  if (tasksImportResult.value?.ok) {
    taskStore.importTasks(tasksImportResult.value.tasks);
  }
  importingTasks.value = false;
  tasksImportResult.value = null;
}

function goBack() {
  router.push('/projects');
}

function onFormSubmit(form: ProjectFormType) {
  store.updateProject(projectId.value, form);
  formOpen.value = false;
}

/** 删除策略一：归档并保留任务（走预检对话框） */
function onArchiveFromDelete() {
  deleting.value = false;
  archiving.value = true;
}

/** 删除策略二：永久删除（二次确认后级联清理任务 / 今日聚焦 / 专注记录 / 里程碑 / 复盘 / 快照） */
function confirmPermanentDelete() {
  deleteProjectWithTasks(
    store,
    taskStore,
    knowledgeStore,
    weeklyGoalStore,
    projectId.value,
    'cascade',
  );
  permanentDeleting.value = false;
  router.push('/projects');
}

/** 删除策略三：永久删除，任务转入收件箱 */
function confirmPermanentDeleteToInbox() {
  deleteProjectWithTasks(
    store,
    taskStore,
    knowledgeStore,
    weeklyGoalStore,
    projectId.value,
    'to-inbox',
  );
  permanentDeleting.value = false;
  router.push('/projects');
}

/** 归档预检摘要 */
const archivePreviewData = computed(() =>
  archiving.value && project.value
    ? archivePreview(store, taskStore, releaseStore, knowledgeStore, projectId.value, todayStr())
    : null,
);

function confirmArchive() {
  if (project.value) {
    archiveProjectWithTasks(
      store,
      taskStore,
      releaseStore,
      knowledgeStore,
      weeklyGoalStore,
      projectId.value,
    );
  }
  archiving.value = false;
}

function confirmArchiveToInbox() {
  if (project.value) {
    archiveProjectWithTasks(
      store,
      taskStore,
      releaseStore,
      knowledgeStore,
      weeklyGoalStore,
      projectId.value,
      { moveToInbox: true },
    );
  }
  archiving.value = false;
}

function undoArchive() {
  undoArchiveWithTasks(store, taskStore);
}

function onQuickTaskSubmit(form: TaskFormData) {
  taskStore.createTask(form, form.subtasks);
  quickTaskOpen.value = false;
  tab.value = 'tasks';
}
</script>

<template>
  <div class="p-6">
    <!-- 项目不存在 -->
    <div
      v-if="!project"
      class="border-surface-100 bg-surface-0 shadow-card rounded-card flex flex-col items-center border px-6 py-16 text-center"
    >
      <h3 class="text-surface-900 text-base font-semibold">项目不存在或已被删除</h3>
      <p class="text-surface-800/60 mt-1 text-sm">返回项目列表查看其他项目。</p>
      <button
        type="button"
        class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 mt-5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
        @click="goBack"
      >
        返回项目列表
      </button>
    </div>

    <template v-else>
      <!-- 头部 -->
      <button
        type="button"
        class="text-surface-800/60 hover:bg-surface-100 hover:text-surface-900 mb-4 flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors"
        @click="goBack"
      >
        <ArrowLeft class="size-4" />
        返回项目列表
      </button>

      <header class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2.5">
              <h1 class="text-surface-900 text-xl font-semibold">{{ project.name }}</h1>
              <span
                class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                :class="PROJECT_STATUS_META[project.status].badge"
              >
                {{ PROJECT_STATUS_META[project.status].label }}
              </span>
            </div>
            <p
              v-if="project.description"
              class="text-surface-800/60 mt-2 max-w-2xl text-sm leading-6"
            >
              {{ project.description }}
            </p>
            <div
              class="text-surface-800/50 mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs"
            >
              <span class="flex items-center gap-1">
                <CalendarClock class="size-3.5" />
                创建于 {{ formatDate(project.createdAt) }}
              </span>
              <span class="flex items-center gap-1">
                <CalendarClock class="size-3.5" />
                更新于 {{ relativeTime(project.updatedAt) }}
              </span>
              <span class="flex items-center gap-1">
                <User class="size-3.5" />
                {{ project.ownerId }}
              </span>
            </div>
            <div v-if="project.tags.length" class="mt-3 flex flex-wrap items-center gap-1.5">
              <Tag class="text-surface-800/40 size-3.5" />
              <span
                v-for="tag in project.tags"
                :key="tag"
                class="border-surface-100 bg-surface-50 text-surface-800/70 rounded-md border px-2 py-0.5 text-xs"
              >
                {{ tag }}
              </span>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button
              type="button"
              class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              title="快速创建任务（自动关联本项目）"
              aria-label="快速创建任务"
              @click="quickTaskOpen = true"
            >
              <Plus class="size-3.5" />
              新建任务
            </button>
            <button
              type="button"
              class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
              @click="formOpen = true"
            >
              <Pencil class="size-3.5" />
              编辑
            </button>
            <button
              v-if="project.status !== 'archived'"
              type="button"
              class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
              @click="archiving = true"
            >
              <Archive class="size-3.5" />
              归档
            </button>
            <button
              v-else
              type="button"
              class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
              @click="store.restoreProject(project.id)"
            >
              <RotateCcw class="size-3.5" />
              恢复
            </button>
            <button
              type="button"
              class="bg-surface-0 flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
              @click="deleting = true"
            >
              <Trash2 class="size-3.5" />
              删除
            </button>
          </div>
        </div>
      </header>

      <!-- 存储提示 + 迁移提示 -->
      <div class="mt-4 space-y-2">
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

      <!-- 项目上下文栏：状态 / 进度 / 未完成任务 / 最近活动 / 归档入口 -->
      <div class="mt-4">
        <ProjectContextBar
          :project="project"
          :latest-activity="latest"
          @archive="archiving = true"
          @restore="store.restoreProject(project.id)"
        />
      </div>

      <!-- 视图切换（移动端横向滚动） -->
      <nav
        class="border-surface-100 mt-5 flex items-center gap-1 overflow-x-auto border-b"
        aria-label="项目视图"
      >
        <button
          v-for="t in TABS"
          :key="t.key"
          type="button"
          class="-mb-px shrink-0 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors"
          :class="
            tab === t.key
              ? 'border-brand-600 text-brand-600'
              : 'text-surface-800/60 hover:text-surface-900 border-transparent'
          "
          @click="tab = t.key"
        >
          {{ t.label }}
        </button>
      </nav>

      <!-- 概览：项目上下文 + 下一步行动 + 风险 + 近期活动（按需初始化，切换即卸载清理） -->
      <div v-if="tab === 'overview'" class="mt-5 space-y-4">
        <section class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-5">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              <h2 class="text-surface-900 mb-3 flex items-center gap-2 text-sm font-semibold">
                <ClipboardList class="text-brand-600 size-4" />
                项目上下文
              </h2>
              <dl class="space-y-2.5 text-sm">
                <div class="flex items-start gap-3">
                  <dt class="text-surface-800/50 w-16 shrink-0">目标</dt>
                  <dd class="text-surface-800/80 min-w-0 leading-6 break-words">
                    {{ project.goal ?? '—' }}
                  </dd>
                </div>
                <div class="flex items-start gap-3">
                  <dt class="text-surface-800/50 w-16 shrink-0">技术栈</dt>
                  <dd class="flex flex-wrap gap-1.5">
                    <span
                      v-for="tech in project.techStack"
                      :key="tech"
                      class="border-surface-100 bg-surface-50 text-surface-800/70 rounded-md border px-2 py-0.5 text-xs"
                    >
                      {{ tech }}
                    </span>
                    <span v-if="!project.techStack.length" class="text-surface-800/40">—</span>
                  </dd>
                </div>
                <div class="flex items-start gap-3">
                  <dt class="text-surface-800/50 w-16 shrink-0">日期</dt>
                  <dd class="text-surface-800/80 min-w-0 text-xs">
                    开始 {{ project.startDate ?? '—' }} · 目标完成 {{ project.targetDate ?? '—' }} ·
                    预计
                    {{ project.estimatedHours != null ? `${project.estimatedHours} 小时` : '—' }}
                  </dd>
                </div>
              </dl>
            </div>
            <div class="w-full shrink-0 sm:w-56">
              <div class="mb-1 flex items-baseline justify-between text-xs">
                <span class="text-surface-800/50">总进度</span>
                <span class="text-surface-900 font-semibold">{{ effective }}%</span>
              </div>
              <div class="bg-surface-100 h-2 overflow-hidden rounded-full">
                <div
                  class="h-full rounded-full transition-all"
                  :class="effective >= 100 ? 'bg-green-500' : 'bg-brand-500'"
                  :style="{ width: `${effective}%` }"
                />
              </div>
              <div class="mt-3">
                <ProgressEditor :project="project" />
              </div>
            </div>
          </div>
        </section>

        <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <!-- 下一步行动 -->
          <section
            class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-5 lg:col-span-2"
          >
            <div class="mb-3 flex items-center justify-between">
              <h2 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle class="text-brand-600 size-4" />
                下一步行动
              </h2>
              <button
                type="button"
                class="text-brand-600 hover:bg-brand-500/10 rounded-lg px-2 py-1 text-xs font-medium transition-colors"
                @click="tab = 'tasks'"
              >
                查看任务 →
              </button>
            </div>
            <div v-if="nextActions.length" class="space-y-1.5">
              <button
                v-for="t in nextActions"
                :key="t.id"
                type="button"
                class="hover:bg-surface-50 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors"
                :aria-label="`打开任务 ${t.title}`"
                @click="tab = 'tasks'"
              >
                <span
                  class="size-2 shrink-0 rounded-full"
                  :class="t.status === 'in-progress' ? 'bg-amber-500' : 'bg-sky-500'"
                />
                <span class="min-w-0 flex-1 truncate">{{ t.title }}</span>
                <span
                  v-if="taskStore.isBlockedTask(t.id)"
                  class="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-600"
                >
                  受阻
                </span>
                <span
                  v-if="t.dueDate"
                  class="shrink-0 text-xs"
                  :class="
                    t.dueDate < (formatDate(new Date().toISOString()) || '')
                      ? 'font-medium text-red-500'
                      : 'text-surface-800/50'
                  "
                >
                  {{ t.dueDate }}
                </span>
              </button>
            </div>
            <p v-else class="text-surface-800/40 py-4 text-center text-sm">
              没有需要立即处理的任务 🎉
            </p>
          </section>

          <!-- 风险 -->
          <section class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-5">
            <h2 class="text-surface-900 mb-3 flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle class="size-4 text-amber-500" />
              风险
            </h2>
            <div v-if="riskSummary.length" class="space-y-1.5">
              <span
                v-for="r in riskSummary"
                :key="r.label"
                class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                :class="
                  r.tone === 'danger'
                    ? 'bg-red-500/10 text-red-600'
                    : r.tone === 'warn'
                      ? 'bg-amber-500/10 text-amber-600'
                      : 'bg-green-500/10 text-green-600'
                "
              >
                <AlertTriangle v-if="r.tone !== 'ok'" class="size-3 shrink-0" />
                <span class="min-w-0">
                  <span class="font-semibold">{{ r.label }}：</span>{{ r.value }}
                </span>
              </span>
            </div>
            <p v-else class="text-surface-800/40 py-4 text-center text-sm">
              {{
                stats.total === 0 && store.milestonesOf(project.id).length === 0
                  ? '暂无任务与里程碑数据，无法评估风险。'
                  : '暂无异常，项目按计划推进。'
              }}
            </p>
          </section>
        </div>

        <!-- 近期活动（默认 5 条，可展开全部） -->
        <section class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-5">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
              <ClipboardList class="text-brand-600 size-4" />
              近期活动
            </h2>
            <button
              v-if="activities.length > activityLimit"
              type="button"
              class="text-brand-600 hover:bg-brand-500/10 rounded-lg px-2 py-1 text-xs font-medium transition-colors"
              @click="activityLimit = activityLimit === 5 ? activities.length : 5"
            >
              {{ activityLimit === 5 ? '查看全部' : '收起' }}
            </button>
          </div>
          <div v-if="shownActivities.length" class="relative space-y-5 pl-1">
            <div class="bg-surface-100 absolute top-1 bottom-1 left-[17px] w-px" />
            <div v-for="act in shownActivities" :key="act.id" class="relative flex gap-4">
              <span
                class="z-10 flex size-9 shrink-0 items-center justify-center rounded-full"
                :class="ACTIVITY_META[act.type].cls"
              >
                <component :is="ACTIVITY_META[act.type].icon" class="size-4" />
              </span>
              <div class="min-w-0 pt-0.5">
                <p class="text-surface-900 text-sm font-medium">{{ act.title }}</p>
                <p v-if="act.description" class="text-surface-800/60 mt-0.5 text-sm">
                  {{ act.description }}
                </p>
                <p class="text-surface-800/40 mt-1 text-xs">{{ formatDateTime(act.createdAt) }}</p>
              </div>
            </div>
          </div>
          <div v-else class="py-8 text-center">
            <ClipboardList class="text-surface-800/30 mx-auto size-8" />
            <p class="text-surface-800/50 mt-2 text-sm">暂无活动记录</p>
          </div>
        </section>
      </div>

      <!-- 任务看板（统一筛选工具栏 / 高密度默认 / 移动端降级） -->
      <div v-else-if="tab === 'tasks'" class="mt-5">
        <div
          v-if="readonly"
          class="bg-surface-100 text-surface-800/70 mb-3 flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs"
        >
          <Archive class="size-3.5" />
          项目已归档（只读）：任务、计划、路线图与知识记录禁止编辑，可查看或恢复项目后继续操作。
        </div>
        <div class="mb-3 flex items-center justify-between gap-2">
          <p class="text-surface-800/50 text-xs">
            导入时自动校验、清理无效依赖与循环依赖，预览后确认。
          </p>
          <div class="relative">
            <button
              type="button"
              class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors"
              aria-label="任务更多操作"
              title="更多操作"
              @click="taskMenuOpen = !taskMenuOpen"
            >
              <Ellipsis class="size-4" />
            </button>
            <div
              v-if="taskMenuOpen"
              class="border-surface-100 bg-surface-0 shadow-float absolute top-10 right-0 z-20 w-40 overflow-hidden rounded-xl border py-1"
              role="menu"
              aria-label="任务更多操作"
            >
              <button
                type="button"
                role="menuitem"
                class="text-surface-800/80 hover:bg-surface-50 flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors"
                :disabled="taskStore.tasksByProject(project.id).length === 0"
                @click="
                  exportTasksJson();
                  taskMenuOpen = false;
                "
              >
                <Download class="size-3.5" />
                导出任务
              </button>
              <label
                v-if="!readonly"
                class="text-surface-800/80 hover:bg-surface-50 flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs transition-colors"
                role="menuitem"
              >
                <Upload class="size-3.5" />
                导入任务
                <input
                  type="file"
                  accept=".json,application/json"
                  class="hidden"
                  @change="onTasksImportFile"
                />
              </label>
            </div>
          </div>
        </div>
        <TaskKanban :project-id="project.id" :readonly="readonly" />
      </div>

      <!-- 执行：今日计划 / 受阻 / 周目标 / 吞吐 -->
      <ExecutionTab v-else-if="tab === 'execution'" :project-id="project.id" />

      <!-- 发布：检查单 / 记录（列表 + 详情） -->
      <ReleasePanel v-else-if="tab === 'release'" :project-id="project.id" :readonly="readonly" />

      <!-- 知识：决策 / 问题 / 参考（列表 + 详情） -->
      <KnowledgePanel
        v-else-if="tab === 'knowledge'"
        :project-id="project.id"
        :readonly="readonly"
      />

      <!-- 计划视图：目标 / 里程碑 / 时间轴 -->
      <div v-else-if="tab === 'plan'" class="mt-5">
        <ProjectPlanView :project="project" :readonly="readonly" />
      </div>

      <!-- 复盘视图：健康统计 / 趋势 / 复盘笔记 / 归档快照 -->
      <div v-else class="mt-5">
        <RetroView :project="project" />
      </div>

      <!-- 编辑弹窗 -->
      <ProjectForm
        :open="formOpen"
        :project="project"
        @submit="onFormSubmit"
        @close="formOpen = false"
      />

      <!-- 快速创建任务 -->
      <TaskForm
        :open="quickTaskOpen"
        :task="null"
        :project-id="project.id"
        @submit="onQuickTaskSubmit"
        @close="quickTaskOpen = false"
      />

      <!-- 删除策略选择 -->
      <ProjectDeleteDialog
        :open="deleting"
        :project="project"
        :task-count="stats.total"
        @archive="onArchiveFromDelete"
        @permanent-delete="
          () => {
            deleting = false;
            permanentDeleting = true;
          }
        "
        @permanent-delete-to-inbox="
          () => {
            deleting = false;
            permanentDeleting = true;
            confirmPermanentDeleteToInbox();
          }
        "
        @cancel="deleting = false"
      />

      <!-- 永久删除二次确认 -->
      <ConfirmDialog
        :open="permanentDeleting"
        title="永久删除项目"
        :message="`确定永久删除「${project.name}」及其 ${stats.total} 个任务吗？此操作不可恢复。`"
        confirm-text="永久删除"
        danger
        @confirm="confirmPermanentDelete"
        @cancel="permanentDeleting = false"
      />

      <!-- 归档预检对话框 -->
      <ArchiveDialog
        :open="archiving"
        :project="project"
        :preview="archivePreviewData"
        @archive="confirmArchive"
        @archive-to-inbox="confirmArchiveToInbox"
        @cancel="archiving = false"
      />

      <!-- 撤销归档 -->
      <div
        v-if="store.canUndoArchive()"
        class="border-brand-500/30 bg-brand-500/5 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
      >
        <p class="text-brand-700 text-sm">已归档项目，可撤销一次恢复原状态与数据。</p>
        <button
          type="button"
          class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
          @click="undoArchive"
        >
          <RotateCcw class="size-3.5" />
          撤销归档
        </button>
      </div>

      <!-- 任务导入预览 -->
      <div
        v-if="importingTasks && tasksImportResult !== null"
        class="fixed inset-0 z-40 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label="导入任务预览"
      >
        <div
          class="bg-surface-900/30 absolute inset-0"
          @click="
            importingTasks = false;
            tasksImportResult = null;
          "
        />
        <div
          class="border-surface-100 bg-surface-0 shadow-float relative w-full max-w-md rounded-xl border p-5"
        >
          <template v-if="tasksImportResult.ok">
            <h3 class="text-surface-900 text-base font-semibold">导入任务预览</h3>
            <p class="text-surface-800/60 mt-1 text-sm">
              将导入 {{ tasksImportResult.tasks.length }} 个任务到「{{ project.name }}」：
            </p>
            <div class="mt-4 space-y-1.5 text-sm">
              <p class="text-surface-800/70 flex justify-between">
                <span class="text-surface-800/50">有效任务</span>
                <span>{{ tasksImportResult.tasks.length }} 个</span>
              </p>
              <p class="text-surface-800/70 flex justify-between">
                <span class="text-surface-800/50">跳过非法条目</span>
                <span>{{ tasksImportResult.report.skippedInvalid }} 个</span>
              </p>
              <p class="text-surface-800/70 flex justify-between">
                <span class="text-surface-800/50">清理无效依赖</span>
                <span>{{ tasksImportResult.report.cleanedDeps }} 条</span>
              </p>
              <p class="text-surface-800/70 flex justify-between">
                <span class="text-surface-800/50">移除循环依赖</span>
                <span>{{ tasksImportResult.report.removedCycles }} 条</span>
              </p>
            </div>
            <div class="bg-surface-50 mt-4 max-h-40 space-y-1 overflow-y-auto rounded-lg p-2.5">
              <p
                v-for="t in tasksImportResult.tasks.slice(0, 20)"
                :key="t.id"
                class="text-surface-800/70 truncate text-xs"
              >
                {{ t.title }}
              </p>
              <p v-if="tasksImportResult.tasks.length > 20" class="text-surface-800/40 text-xs">
                …共 {{ tasksImportResult.tasks.length }} 个
              </p>
            </div>
            <div class="mt-5 flex justify-end gap-2">
              <button
                type="button"
                class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors"
                @click="
                  importingTasks = false;
                  tasksImportResult = null;
                "
              >
                取消
              </button>
              <button
                type="button"
                class="bg-brand-600 hover:bg-brand-700 text-surface-0 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors"
                @click="confirmTasksImport"
              >
                确认导入
              </button>
            </div>
          </template>
          <template v-else>
            <h3 class="text-surface-900 text-base font-semibold">导入失败</h3>
            <p class="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">
              {{ tasksImportResult.ok === false ? tasksImportResult.reason : '未知错误' }}
            </p>
            <div class="mt-5 flex justify-end">
              <button
                type="button"
                class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors"
                @click="
                  importingTasks = false;
                  tasksImportResult = null;
                "
              >
                关闭
              </button>
            </div>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>
