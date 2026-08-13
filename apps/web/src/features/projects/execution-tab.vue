<script setup lang="ts">
import { BarChart3, Clock, Flag } from '@lucide/vue';
import { computed } from 'vue';

import { useProjectStore } from './store';
import { useTaskStore } from '@/features/tasks/store';
import { buildThroughput, milestoneRiskSummary } from './execution';
import WeeklyGoalForm from './weekly-goal-form.vue';

const props = defineProps<{ projectId: string }>();

const projectStore = useProjectStore();
const taskStore = useTaskStore();

const today = (() => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();

const tasks = computed(() => taskStore.tasksByProject(props.projectId));
const sessions = computed(() =>
  taskStore.focusSessions.filter((s) => tasks.value.some((t) => t.id === s.taskId)),
);
const throughput = computed(() => buildThroughput(tasks.value, sessions.value, today));
const msRisk = computed(() =>
  milestoneRiskSummary(projectStore.milestonesOf(props.projectId), today),
);
const streak = computed(() => taskStore.focusStreakDays);

const cells = computed(() => [
  {
    label: '近 7 天完成',
    value: throughput.value.done7d,
    sub: `创建 ${throughput.value.created7d}`,
  },
  { label: '近 7 天延期', value: throughput.value.delayed7d, warn: throughput.value.delayed7d > 0 },
  {
    label: '近 7 天专注',
    value: `${throughput.value.focusMinutes7d} 分`,
    sub: `连续 ${streak.value} 天`,
  },
  {
    label: '近 30 天完成',
    value: throughput.value.done30d,
    sub: `创建 ${throughput.value.created30d}`,
  },
  {
    label: '近 30 天延期',
    value: throughput.value.delayed30d,
    warn: throughput.value.delayed30d > 0,
  },
  { label: '近 30 天专注', value: `${throughput.value.focusMinutes30d} 分`, sub: '累计' },
]);

const msRows = computed(() => [
  { label: '里程碑总数', value: msRisk.value.total },
  { label: '已完成', value: msRisk.value.done },
  { label: '7 天内到期', value: msRisk.value.atRisk, warn: msRisk.value.atRisk > 0 },
  { label: '已逾期', value: msRisk.value.overdue, warn: msRisk.value.overdue > 0 },
]);
</script>

<template>
  <div class="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
    <!-- 吞吐 -->
    <section
      class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-5 lg:col-span-2"
    >
      <h2 class="text-surface-900 mb-4 flex items-center gap-2 text-sm font-semibold">
        <BarChart3 class="text-brand-600 size-4" />
        任务吞吐
      </h2>
      <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <li
          v-for="c in cells"
          :key="c.label"
          class="border-surface-100 bg-surface-50 rounded-lg border p-3"
        >
          <p class="text-surface-800/50 text-xs">{{ c.label }}</p>
          <p
            class="text-surface-900 mt-1 text-xl font-semibold"
            :class="c.warn ? 'text-amber-700' : ''"
          >
            {{ c.value }}
          </p>
          <p v-if="c.sub" class="text-surface-800/40 text-xs">{{ c.sub }}</p>
        </li>
      </ul>

      <h3 class="text-surface-800/60 mt-5 mb-2 flex items-center gap-1.5 text-xs font-medium">
        <Flag class="size-3.5" />
        里程碑风险
      </h3>
      <ul class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <li
          v-for="m in msRows"
          :key="m.label"
          class="border-surface-100 bg-surface-50 rounded-lg border p-3"
        >
          <p class="text-surface-800/50 text-xs">{{ m.label }}</p>
          <p
            class="text-surface-900 mt-1 text-xl font-semibold"
            :class="m.warn ? 'text-amber-700' : ''"
          >
            {{ m.value }}
          </p>
        </li>
      </ul>

      <p class="text-surface-800/50 mt-4 flex items-center gap-1.5 text-xs">
        <Clock class="size-3.5" />
        今日计划完成率见「今日计划」面板；专注统计按完成记录日期计入窗口。
      </p>
    </section>

    <!-- 周目标 -->
    <WeeklyGoalForm :project-id="projectId" />
  </div>
</template>
