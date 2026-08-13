<script setup lang="ts">
import { Activity, Gauge, Inbox, TrendingUp } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useProjectStore } from './store';
import { useTaskStore } from '@/features/tasks/store';
import { buildPriorities, buildThroughput } from './execution';
import type { PriorityKind, PriorityRow } from './execution';
import { weekStartOf } from './execution';

/** 筛选偏好（本地持久化：时间窗口 + 状态 + 项目） */
interface ExecPrefs {
  range: '7d' | '30d';
  status: 'all' | 'overdue' | 'blocked' | 'stale' | 'week-due' | 'today';
  projectId: string;
}
const PREF_KEY = 'personal-os.exec.ui.v1';

function loadPrefs(): ExecPrefs {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return { range: '7d', status: 'all', projectId: '' };
    const p = JSON.parse(raw) as Partial<ExecPrefs>;
    return {
      range: p.range === '30d' ? '30d' : '7d',
      status: p.status ?? 'all',
      projectId: typeof p.projectId === 'string' ? p.projectId : '',
    };
  } catch {
    return { range: '7d', status: 'all', projectId: '' };
  }
}

const projectStore = useProjectStore();
const taskStore = useTaskStore();
const route = useRoute();
const router = useRouter();

const prefs = ref<ExecPrefs>(loadPrefs());
watch(prefs, (v) => {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(v));
  } catch {
    /* 非阻塞：偏好写入失败不影响使用 */
  }
});

const today = (() => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();

const latestActivityAt = computed(() => {
  const map = new Map<string, string>();
  for (const p of projectStore.projects) {
    const last = projectStore.latestActivity(p.id);
    map.set(p.id, last?.createdAt ?? p.updatedAt);
  }
  return map;
});

const priorities = computed<PriorityRow[]>(() =>
  buildPriorities({
    tasks: taskStore.tasks,
    projects: projectStore.projects,
    focus: taskStore.focus,
    focusDone: taskStore.focusDone,
    today,
    latestActivityAt: latestActivityAt.value,
  }),
);

const allTasks = computed(() => taskStore.tasks);
const allSessions = computed(() => taskStore.focusSessions);
const throughput = computed(() => buildThroughput(allTasks.value, allSessions.value, today));
const tp = computed(() =>
  prefs.value.range === '7d'
    ? [
        { label: '完成', value: throughput.value.done7d },
        { label: '创建', value: throughput.value.created7d },
        { label: '延期', value: throughput.value.delayed7d },
        { label: '专注(分)', value: throughput.value.focusMinutes7d },
      ]
    : [
        { label: '完成', value: throughput.value.done30d },
        { label: '创建', value: throughput.value.created30d },
        { label: '延期', value: throughput.value.delayed30d },
        { label: '专注(分)', value: throughput.value.focusMinutes30d },
      ],
);

const KIND_META: Record<PriorityKind, { label: string; cls: string }> = {
  today: { label: '今日计划', cls: 'text-brand-600 bg-brand-500/10' },
  'week-due': { label: '本周截止', cls: 'text-violet-600 bg-violet-500/10' },
  overdue: { label: '逾期', cls: 'text-red-600 bg-red-500/10' },
  blocked: { label: '受阻', cls: 'text-amber-700 bg-amber-500/10' },
  stale: { label: '长期未活动', cls: 'text-surface-800/70 bg-surface-500/10' },
};

const activeKind = ref<PriorityKind | null>(null);

/** 点击指标：跳转到已过滤视图（query.filter），同时高亮本区块 */
function jumpTo(kind: PriorityKind | null) {
  activeKind.value = kind;
  void router.push({ query: { ...route.query, filter: kind ?? undefined } });
}

const activeRow = computed(() =>
  activeKind.value ? (priorities.value.find((r) => r.kind === activeKind.value) ?? null) : null,
);
const activeProjects = computed(() =>
  activeRow.value
    ? projectStore.projects.filter((p) => activeRow.value!.projectIds.includes(p.id))
    : [],
);
const activeTasks = computed(() =>
  activeRow.value ? taskStore.tasks.filter((t) => activeRow.value!.taskIds.includes(t.id)) : [],
);

const inboxCount = computed(() => taskStore.inboxTasks.length);
const weekGoalCount = computed(() => {
  const ws = weekStartOf(today);
  return projectStore.projects
    .filter((p) => p.status === 'active')
    .filter((p) => taskStore.tasksByProject(p.id).some((t) => t.dueDate && t.dueDate >= ws)).length;
});
</script>

<template>
  <section class="page-content-section mb-5">
    <!-- 头部：个人执行优先级 -->
    <div class="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
      <h2 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
        <Gauge class="text-brand-600 size-4" />
        个人执行优先级
      </h2>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
          @click="router.push({ path: '/projects/inbox' })"
        >
          <Inbox class="size-3.5" />
          收件箱
          <span
            v-if="inboxCount > 0"
            class="bg-brand-500/10 text-brand-600 rounded-full px-1.5 text-xs"
          >
            {{ inboxCount }}
          </span>
        </button>
      </div>
    </div>

    <div class="flex flex-wrap gap-2 px-5 pt-3">
      <button
        v-for="row in priorities"
        :key="row.kind"
        type="button"
        class="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors"
        :class="[
          KIND_META[row.kind].cls,
          activeKind === row.kind
            ? 'border-brand-500 ring-brand-500/30 ring-2'
            : 'border-transparent',
        ]"
        :aria-label="`${KIND_META[row.kind].label}：${row.count} 项`"
        @click="jumpTo(activeKind === row.kind ? null : row.kind)"
      >
        {{ KIND_META[row.kind].label }}
        <span class="rounded-full bg-black/10 px-1.5 text-xs">{{ row.count }}</span>
      </button>
      <button
        v-if="priorities.length === 0"
        type="button"
        class="text-surface-800/50 cursor-default rounded-full px-3 py-1.5 text-sm"
      >
        无待处理事项
      </button>
    </div>

    <!-- 选中优先级详情 -->
    <div v-if="activeRow" class="mx-5 mt-4 rounded-xl border border-dashed p-4">
      <p class="text-surface-800/60 mb-2 text-xs">
        {{ activeRow.label }} · {{ activeRow.count }} 项{{
          activeRow.hint ? ` · ${activeRow.hint}` : ''
        }}
      </p>
      <div v-if="activeRow.taskIds.length > 0" class="space-y-1">
        <button
          v-for="t in activeTasks"
          :key="t.id"
          type="button"
          class="text-surface-800/80 hover:bg-surface-100 flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors"
          :aria-label="`打开任务 ${t.title}`"
          @click="
            t.projectId
              ? router.push({ path: `/projects/${t.projectId}`, query: { task: t.id } })
              : router.push({ path: '/projects/inbox', query: { task: t.id } })
          "
        >
          <span class="min-w-0 truncate">{{ t.title }}</span>
          <span class="text-surface-800/40 shrink-0 text-xs">
            {{ t.projectId ? (projectStore.projectById(t.projectId)?.name ?? '') : '收件箱' }}
          </span>
        </button>
      </div>
      <div v-else-if="activeRow.projectIds.length > 0" class="space-y-1">
        <button
          v-for="p in activeProjects"
          :key="p.id"
          type="button"
          class="text-surface-800/80 hover:bg-surface-100 flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm transition-colors"
          @click="router.push({ path: `/projects/${p.id}` })"
        >
          <span class="min-w-0 truncate">{{ p.name }}</span>
          <span class="text-surface-800/40 shrink-0 text-xs">{{ p.status }}</span>
        </button>
      </div>
    </div>

    <!-- 吞吐与筛选 -->
    <div class="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
      <h3 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
        <TrendingUp class="text-brand-600 size-4" />
        任务吞吐
        <span class="text-surface-800/50 text-xs font-normal">
          {{ weekGoalCount }} 个活动项目本周有截止任务
        </span>
      </h3>
      <div class="flex items-center gap-2">
        <select
          v-model="prefs.range"
          class="border-surface-200 bg-surface-0 text-surface-900 focus:border-brand-500 rounded-lg border px-2 py-1.5 text-sm outline-none"
          aria-label="吞吐时间窗口"
        >
          <option value="7d">近 7 天</option>
          <option value="30d">近 30 天</option>
        </select>
        <select
          v-model="prefs.projectId"
          class="border-surface-200 bg-surface-0 text-surface-900 focus:border-brand-500 max-w-44 rounded-lg border px-2 py-1.5 text-sm outline-none"
          aria-label="按项目筛选吞吐"
        >
          <option value="">全部项目</option>
          <option v-for="p in projectStore.projects" :key="p.id" :value="p.id">
            {{ p.name }}
          </option>
        </select>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3 px-5 py-4 sm:grid-cols-4">
      <div
        v-for="c in tp"
        :key="c.label"
        class="border-surface-100 bg-surface-50 rounded-lg border p-3"
      >
        <p class="text-surface-800/50 text-xs">{{ c.label }}</p>
        <p class="text-surface-900 mt-1 text-xl font-semibold">{{ c.value }}</p>
      </div>
    </div>

    <p class="text-surface-800/40 flex items-center gap-1.5 px-5 pb-4 text-xs">
      <Activity class="size-3.5" />
      点击优先级指标可查看明细并跳转；筛选偏好保存在本地。
    </p>
  </section>
</template>
