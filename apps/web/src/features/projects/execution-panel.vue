<script setup lang="ts">
import { Activity, Gauge, History, Inbox, TrendingUp, WalletCards } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useProjectStore } from './store';
import { useWeeklyGoalStore } from './weekly-goals-store';
import { useTaskStore } from '@/features/tasks/store';
import type { FocusSession, TaskItem } from '@/features/tasks/types';
import { buildPriorities, buildThroughput, weekProgress } from './execution';
import type { PriorityKind, PriorityRow } from './execution';

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
const goalStore = useWeeklyGoalStore();
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

/** 分区展开状态：默认突出今日计划与受阻任务，其余分区收纳 */
const sections = ref<Record<'inbox' | 'weekly' | 'history', boolean>>({
  inbox: false,
  weekly: false,
  history: false,
});
function toggleSection(key: keyof typeof sections.value) {
  sections.value = { ...sections.value, [key]: !sections.value[key] };
}

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
/** 收件箱分区：最近 5 条（按创建时间倒序） */
const inboxPreview = computed(() =>
  [...taskStore.inboxTasks].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 5),
);

/** 周目标分区：活动项目的本周目标进度（一次分桶，避免逐项目重复过滤） */
const weeklyRows = computed(() => {
  const taskProject = new Map<string, string>();
  for (const t of taskStore.tasks) {
    if (t.projectId) taskProject.set(t.id, t.projectId);
  }
  const sessionsByProject = new Map<string, FocusSession[]>();
  for (const s of taskStore.focusSessions) {
    const pid = taskProject.get(s.taskId);
    if (!pid) continue;
    const arr = sessionsByProject.get(pid) ?? [];
    arr.push(s);
    sessionsByProject.set(pid, arr);
  }
  const tasksByProject = new Map<string, TaskItem[]>();
  for (const t of taskStore.tasks) {
    if (!t.projectId) continue;
    const arr = tasksByProject.get(t.projectId) ?? [];
    arr.push(t);
    tasksByProject.set(t.projectId, arr);
  }
  const rows: {
    projectName: string;
    projectId: string;
    description: string;
    overall: number;
    taskProgress: number;
    focusMinutes: number;
  }[] = [];
  for (const p of projectStore.projects) {
    if (p.status !== 'active') continue;
    const goal = goalStore.currentGoalOf(p.id, today);
    if (!goal) continue;
    const prog = weekProgress(
      goal,
      tasksByProject.get(p.id) ?? [],
      sessionsByProject.get(p.id) ?? [],
      today,
    );
    rows.push({
      projectName: p.name,
      projectId: p.id,
      description: goal.description || '本周目标',
      overall: prog.overall,
      taskProgress: prog.taskProgress,
      focusMinutes: prog.focusMinutes,
    });
  }
  return rows.sort((a, b) => b.overall - a.overall);
});

/** 历史分区：已归档的每日计划 */
const focusHistoryRows = computed(() => {
  const days = taskStore.focusHistory.slice(0, 7);
  return days.map((d) => ({
    date: d.date,
    done: d.doneIds.length,
    total: d.items.length,
  }));
});
</script>

<template>
  <section class="page-content-section mb-5">
    <!-- 头部：个人执行优先级 -->
    <div class="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
      <h2 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
        <Gauge class="text-brand-600 size-4" />
        执行工作台
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

    <!-- 今日计划 / 受阻 等优先级（默认突出） -->
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
        今日无待处理事项
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

    <!-- 收件箱分区 -->
    <div class="mx-5 mt-4 border-t pt-3">
      <button
        type="button"
        class="flex w-full items-center justify-between gap-2 text-left"
        :aria-expanded="sections.inbox"
        @click="toggleSection('inbox')"
      >
        <span class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
          <Inbox class="text-brand-600 size-4" />
          收件箱
          <span class="bg-surface-50 text-surface-800/60 rounded-full px-2 py-0.5 text-xs">
            {{ inboxCount }}
          </span>
        </span>
        <span class="text-surface-800/40 text-xs">{{ sections.inbox ? '收起' : '展开' }}</span>
      </button>
      <div v-if="sections.inbox" class="mt-2 space-y-1">
        <button
          v-for="t in inboxPreview"
          :key="t.id"
          type="button"
          class="text-surface-800/80 hover:bg-surface-100 flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors"
          :aria-label="`打开收件箱任务 ${t.title}`"
          @click="router.push({ path: '/projects/inbox', query: { task: t.id } })"
        >
          <span class="min-w-0 truncate">{{ t.title }}</span>
          <span class="text-surface-800/40 shrink-0 text-xs">{{ t.priority }}</span>
        </button>
        <p v-if="inboxPreview.length === 0" class="text-surface-800/40 py-1 text-xs">
          收件箱为空，去收件箱快速捕获想法。
        </p>
        <button
          type="button"
          class="text-brand-600 hover:bg-brand-500/10 mt-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors"
          @click="router.push({ path: '/projects/inbox' })"
        >
          打开收件箱 →
        </button>
      </div>
    </div>

    <!-- 周目标分区 -->
    <div class="mx-5 mt-3 border-t pt-3">
      <button
        type="button"
        class="flex w-full items-center justify-between gap-2 text-left"
        :aria-expanded="sections.weekly"
        @click="toggleSection('weekly')"
      >
        <span class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
          <WalletCards class="text-brand-600 size-4" />
          周目标
          <span class="bg-surface-50 text-surface-800/60 rounded-full px-2 py-0.5 text-xs">
            {{ weeklyRows.length }}
          </span>
        </span>
        <span class="text-surface-800/40 text-xs">{{ sections.weekly ? '收起' : '展开' }}</span>
      </button>
      <div v-if="sections.weekly" class="mt-2 space-y-2">
        <div
          v-for="row in weeklyRows"
          :key="row.projectId"
          class="border-surface-100 bg-surface-50 rounded-lg border p-2.5"
        >
          <div class="flex items-center justify-between gap-2 text-xs">
            <span class="text-surface-900 min-w-0 truncate font-medium">{{ row.projectName }}</span>
            <span class="text-surface-800/50 shrink-0">{{ row.overall }}%</span>
          </div>
          <p class="text-surface-800/50 mt-0.5 truncate text-xs">{{ row.description }}</p>
          <div class="bg-surface-100 mt-1.5 h-1 overflow-hidden rounded-full">
            <div
              class="bg-brand-500 h-full rounded-full transition-all"
              :style="{ width: `${row.taskProgress}%` }"
            />
          </div>
          <p class="text-surface-800/40 mt-1 text-[10px]">
            任务进度 {{ row.taskProgress }}% · 专注 {{ row.focusMinutes }} 分
          </p>
        </div>
        <p v-if="weeklyRows.length === 0" class="text-surface-800/40 py-1 text-xs">
          本周暂无已设定的项目周目标。
        </p>
      </div>
    </div>

    <!-- 历史分区（不常用，默认收起） -->
    <div class="mx-5 mt-3 border-t pt-3">
      <button
        type="button"
        class="flex w-full items-center justify-between gap-2 text-left"
        :aria-expanded="sections.history"
        @click="toggleSection('history')"
      >
        <span class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
          <History class="text-brand-600 size-4" />
          历史
        </span>
        <span class="text-surface-800/40 text-xs">{{ sections.history ? '收起' : '展开' }}</span>
      </button>
      <div v-if="sections.history" class="mt-2 space-y-1">
        <div
          v-for="d in focusHistoryRows"
          :key="d.date"
          class="text-surface-800/70 flex items-center justify-between rounded-lg px-2 py-1.5 text-xs"
        >
          <span>{{ d.date }}</span>
          <span class="text-surface-800/50">{{ d.done }}/{{ d.total }} 完成</span>
        </div>
        <p v-if="focusHistoryRows.length === 0" class="text-surface-800/40 py-1 text-xs">
          暂无归档的每日计划历史。
        </p>
      </div>
    </div>

    <!-- 吞吐与筛选 -->
    <div class="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
      <h3 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
        <TrendingUp class="text-brand-600 size-4" />
        任务吞吐
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
      点击优先级指标可查看明细并跳转；收件箱 / 周目标 / 历史分区默认收起，按需展开。
    </p>
  </section>
</template>
