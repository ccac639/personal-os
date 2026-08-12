<script setup lang="ts">
import { FolderPlus, Layers, Plus, Search, SearchX } from '@lucide/vue';
import { computed, ref } from 'vue';

import {
  ConfirmDialog,
  ProjectCard,
  ProjectForm,
  TechTree,
  useProjectStore,
} from '@/features/projects';
import { PROJECT_FILTERS } from '@/features/projects/types';
import type { ProjectDetail, ProjectForm as ProjectFormType } from '@/features/projects/types';
import { useTaskStore } from '@/features/tasks/store';

const store = useProjectStore();
const taskStore = useTaskStore();

const formOpen = ref(false);
const editing = ref<ProjectDetail | null>(null);
const deleting = ref<ProjectDetail | null>(null);
const archiving = ref<ProjectDetail | null>(null);
const techTreeOpen = ref(false);

/** 总览统计：任务完成率（全局） */
const completion = computed(() => taskStore.summary.completion);
const summary = computed(() => store.summary);

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

function confirmDelete() {
  if (deleting.value) {
    // 级联清理该项目的任务
    taskStore.removeByProject(deleting.value.id);
    store.deleteProject(deleting.value.id);
  }
  deleting.value = null;
}

function confirmArchive() {
  if (archiving.value) store.archiveProject(archiving.value.id);
  archiving.value = null;
}

function clearFilters() {
  store.searchQuery = '';
  store.statusFilter = 'all';
}
</script>

<template>
  <div class="p-6">
    <!-- 头部 -->
    <header class="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-surface-900 text-xl font-semibold">开发中</h1>
        <p class="text-surface-800/60 mt-1 text-sm">
          个人项目与任务管理：总览、看板与活动记录（本地 mock 持久化）
        </p>
      </div>
      <button
        type="button"
        class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors"
        @click="openCreate"
      >
        <Plus class="size-4" />
        新建项目
      </button>
    </header>

    <!-- 统计条 -->
    <div class="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
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

    <!-- 搜索 + 状态筛选 -->
    <div class="mb-5 flex flex-wrap items-center gap-3">
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
          v-for="opt in PROJECT_FILTERS"
          :key="opt.value"
          type="button"
          class="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
          :class="
            store.statusFilter === opt.value
              ? 'bg-brand-600 text-surface-0'
              : 'border-surface-100 bg-surface-0 text-surface-800/60 hover:bg-surface-50 hover:text-surface-900 border'
          "
          @click="store.statusFilter = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <!-- 项目卡片 -->
    <div
      v-if="store.filteredProjects.length"
      class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
    >
      <ProjectCard
        v-for="project in store.filteredProjects"
        :key="project.id"
        :project="project"
        @edit="openEdit"
        @archive="(p) => (archiving = p)"
        @restore="(p) => store.restoreProject(p.id)"
        @delete="(p) => (deleting = p)"
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
      <p class="text-surface-800/60 mt-1 max-w-sm text-sm">换个关键词或状态试试。</p>
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

    <!-- 新建 / 编辑弹窗 -->
    <ProjectForm
      :open="formOpen"
      :project="editing"
      @submit="onFormSubmit"
      @close="formOpen = false"
    />

    <!-- 删除确认 -->
    <ConfirmDialog
      :open="!!deleting"
      title="删除项目"
      :message="`确定删除项目「${deleting?.name ?? ''}」吗？其全部任务也会一并删除，此操作不可撤销。`"
      confirm-text="删除"
      danger
      @confirm="confirmDelete"
      @cancel="deleting = null"
    />

    <!-- 归档确认 -->
    <ConfirmDialog
      :open="!!archiving"
      title="归档项目"
      :message="`确定归档项目「${archiving?.name ?? ''}」吗？归档后可在「已归档」筛选中找回并恢复。`"
      confirm-text="归档"
      @confirm="confirmArchive"
      @cancel="archiving = null"
    />
  </div>
</template>
