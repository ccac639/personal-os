<script setup lang="ts">
import {
  Archive,
  ArrowLeft,
  CalendarClock,
  ClipboardList,
  Pencil,
  RotateCcw,
  Tag,
  Trash2,
  User,
} from '@lucide/vue';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { Component } from 'vue';

import { ConfirmDialog, ProjectForm, useProjectStore } from '@/features/projects';
import { PROJECT_STATUS_META } from '@/features/projects/types';
import type {
  ProjectActivityType,
  ProjectForm as ProjectFormType,
} from '@/features/projects/types';
import { formatDateTime, formatDate, relativeTime } from '@/features/projects/utils';
import { TaskKanban, useTaskStore } from '@/features/tasks';

type TabKey = 'overview' | 'tasks' | 'activity';

const route = useRoute();
const router = useRouter();
const store = useProjectStore();
const taskStore = useTaskStore();

const projectId = computed(() => String(route.params.id ?? ''));
const project = computed(() => store.projectById(projectId.value));
const stats = computed(() => taskStore.projectStats(projectId.value));
const activities = computed(() => store.projectActivities(projectId.value));

const tab = ref<TabKey>('overview');
const formOpen = ref(false);
const deleting = ref(false);
const archiving = ref(false);

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: '概览' },
  { key: 'tasks', label: '任务' },
  { key: 'activity', label: '活动记录' },
];

const ACTIVITY_META: Record<ProjectActivityType, { label: string; icon: Component; cls: string }> =
  {
    created: { label: '创建', icon: ClipboardList, cls: 'bg-brand-500/10 text-brand-600' },
    updated: { label: '更新', icon: Pencil, cls: 'bg-sky-500/10 text-sky-600' },
    archived: { label: '归档', icon: Archive, cls: 'bg-surface-100 text-surface-800/60' },
    restored: { label: '恢复', icon: RotateCcw, cls: 'bg-green-500/10 text-green-600' },
    deleted: { label: '删除', icon: Trash2, cls: 'bg-red-500/10 text-red-600' },
    task: { label: '任务', icon: ClipboardList, cls: 'bg-amber-500/10 text-amber-600' },
  };

function goBack() {
  router.push('/projects');
}

function onFormSubmit(form: ProjectFormType) {
  store.updateProject(projectId.value, form);
  formOpen.value = false;
}

function confirmDelete() {
  taskStore.removeByProject(projectId.value);
  store.deleteProject(projectId.value);
  deleting.value = false;
  router.push('/projects');
}

function confirmArchive() {
  store.archiveProject(projectId.value);
  archiving.value = false;
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

      <!-- 视图切换 -->
      <nav class="border-surface-100 mt-5 flex items-center gap-1 border-b">
        <button
          v-for="t in TABS"
          :key="t.key"
          type="button"
          class="-mb-px rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition-colors"
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

      <!-- 概览 -->
      <div v-if="tab === 'overview'" class="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section
          class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-5 lg:col-span-2"
        >
          <h2 class="text-surface-900 mb-4 text-sm font-semibold">项目信息</h2>
          <dl class="space-y-3 text-sm">
            <div class="flex items-start gap-3">
              <dt class="text-surface-800/50 w-16 shrink-0">状态</dt>
              <dd class="text-surface-900">
                <span
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="PROJECT_STATUS_META[project.status].badge"
                >
                  {{ PROJECT_STATUS_META[project.status].label }}
                </span>
              </dd>
            </div>
            <div class="flex items-start gap-3">
              <dt class="text-surface-800/50 w-16 shrink-0">描述</dt>
              <dd class="text-surface-800/80 leading-6">{{ project.description ?? '—' }}</dd>
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
              <dt class="text-surface-800/50 w-16 shrink-0">标签</dt>
              <dd class="flex flex-wrap gap-1.5">
                <span
                  v-for="tag in project.tags"
                  :key="tag"
                  class="border-surface-100 bg-surface-50 text-surface-800/70 rounded-md border px-2 py-0.5 text-xs"
                >
                  {{ tag }}
                </span>
                <span v-if="!project.tags.length" class="text-surface-800/40">—</span>
              </dd>
            </div>
            <div class="flex items-start gap-3">
              <dt class="text-surface-800/50 w-16 shrink-0">创建时间</dt>
              <dd class="text-surface-800/80">{{ formatDateTime(project.createdAt) }}</dd>
            </div>
            <div class="flex items-start gap-3">
              <dt class="text-surface-800/50 w-16 shrink-0">更新时间</dt>
              <dd class="text-surface-800/80">{{ formatDateTime(project.updatedAt) }}</dd>
            </div>
          </dl>
        </section>

        <section class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-5">
          <h2 class="text-surface-900 mb-4 text-sm font-semibold">任务统计</h2>
          <div class="mb-4 flex items-end justify-between">
            <p class="text-surface-900 text-3xl font-semibold">
              {{ stats.progress }}<span class="text-surface-800/50 text-base">%</span>
            </p>
            <p class="text-surface-800/50 text-xs">完成率</p>
          </div>
          <div class="bg-surface-100 mb-5 h-2 overflow-hidden rounded-full">
            <div
              class="h-full rounded-full transition-all"
              :class="stats.progress >= 100 ? 'bg-green-500' : 'bg-brand-500'"
              :style="{ width: `${stats.progress}%` }"
            />
          </div>
          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="border-surface-100 bg-surface-50 rounded-lg border p-2.5">
              <p class="text-lg font-semibold text-sky-600">{{ stats.todo }}</p>
              <p class="text-surface-800/50 mt-0.5 text-xs">待办</p>
            </div>
            <div class="border-surface-100 bg-surface-50 rounded-lg border p-2.5">
              <p class="text-lg font-semibold text-amber-600">{{ stats.inProgress }}</p>
              <p class="text-surface-800/50 mt-0.5 text-xs">进行中</p>
            </div>
            <div class="border-surface-100 bg-surface-50 rounded-lg border p-2.5">
              <p class="text-lg font-semibold text-green-600">{{ stats.done }}</p>
              <p class="text-surface-800/50 mt-0.5 text-xs">已完成</p>
            </div>
          </div>
          <p
            v-if="stats.overdue > 0"
            class="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-center text-xs font-medium text-red-600"
          >
            {{ stats.overdue }} 个任务已逾期
          </p>
          <p v-else class="text-surface-800/40 mt-3 text-center text-xs">暂无逾期任务</p>
        </section>
      </div>

      <!-- 任务看板 -->
      <div v-else-if="tab === 'tasks'" class="mt-5">
        <TaskKanban :project-id="project.id" />
      </div>

      <!-- 活动记录 -->
      <div v-else class="mt-5">
        <section class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-6">
          <h2 class="text-surface-900 mb-5 text-sm font-semibold">活动记录</h2>
          <div v-if="activities.length" class="relative space-y-6 pl-1">
            <div class="bg-surface-100 absolute top-1 bottom-1 left-[17px] w-px" />
            <div v-for="act in activities" :key="act.id" class="relative flex gap-4">
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
                <p class="text-surface-800/40 mt-1 text-xs">
                  {{ formatDateTime(act.createdAt) }}
                </p>
              </div>
            </div>
          </div>
          <div v-else class="py-8 text-center">
            <ClipboardList class="text-surface-800/30 mx-auto size-8" />
            <p class="text-surface-800/50 mt-2 text-sm">暂无活动记录</p>
          </div>
        </section>
      </div>

      <!-- 编辑弹窗 -->
      <ProjectForm
        :open="formOpen"
        :project="project"
        @submit="onFormSubmit"
        @close="formOpen = false"
      />

      <!-- 删除确认 -->
      <ConfirmDialog
        :open="deleting"
        title="删除项目"
        :message="`确定删除项目「${project.name}」吗？其全部任务也会一并删除，此操作不可撤销。`"
        confirm-text="删除"
        danger
        @confirm="confirmDelete"
        @cancel="deleting = false"
      />

      <!-- 归档确认 -->
      <ConfirmDialog
        :open="archiving"
        title="归档项目"
        :message="`确定归档项目「${project.name}」吗？归档后可在「已归档」筛选中找回并恢复。`"
        confirm-text="归档"
        @confirm="confirmArchive"
        @cancel="archiving = false"
      />
    </template>
  </div>
</template>
