<script setup lang="ts">
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  Flag,
  Pencil,
  Plus,
  Target,
  Trash2,
} from '@lucide/vue';
import { computed, ref } from 'vue';

import { useProjectStore } from './store';
import { useTaskStore } from '@/features/tasks/store';
import { MILESTONE_STATUS_META } from './types';
import type { Milestone, MilestoneForm as MilestoneFormData, ProjectDetail } from './types';
import { milestoneProgress, milestoneRisk } from './milestones';
import type { MilestoneDerived } from './milestones';
import MilestoneForm from './milestone-form.vue';
import ConfirmDialog from './confirm-dialog.vue';

const props = defineProps<{ project: ProjectDetail }>();

const store = useProjectStore();
const taskStore = useTaskStore();

const formOpen = ref(false);
const editing = ref<Milestone | null>(null);
const deleting = ref<Milestone | null>(null);

const today = (() => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();

const taskDone = (taskId: string): boolean => taskStore.taskById(taskId)?.status === 'done';

const milestones = computed<MilestoneDerived[]>(() =>
  store
    .milestonesOf(props.project.id)
    .map((m) => {
      const p = milestoneProgress(m, taskDone);
      return {
        ...m,
        ...p,
        risk: milestoneRisk(m.status, m.dueDate, today),
        overdue: milestoneRisk(m.status, m.dueDate, today) === 'overdue',
      };
    })
    .sort((a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0)),
);

const RISK_META = {
  done: { label: '已完成', cls: 'text-green-600 bg-green-500/10' },
  'on-track': { label: '正常', cls: 'text-sky-600 bg-sky-500/10' },
  'at-risk': { label: '有风险', cls: 'text-amber-600 bg-amber-500/10' },
  overdue: { label: '已逾期', cls: 'text-red-600 bg-red-500/10' },
};

/** 时间轴计算：以项目开始 ~ 目标完成日期为跨度（缺失时用里程碑日期推算） */
const timeline = computed(() => {
  const start = props.project.startDate;
  const end = props.project.targetDate;
  const ms = store.milestonesOf(props.project.id);
  const dates = [
    start,
    end,
    ...ms.flatMap((m) => [m.startDate, m.dueDate]).filter((d): d is string => !!d),
  ].sort();
  const min = dates[0];
  const max = dates[dates.length - 1];
  if (!min || !max || min === max) return null;
  const span = new Date(`${max}T00:00:00`).getTime() - new Date(`${min}T00:00:00`).getTime();
  const pos = (d?: string): { left: string; width: string } => {
    if (!d) return { left: '0%', width: '0%' };
    const t = new Date(`${d}T00:00:00`).getTime();
    const left = Math.max(
      0,
      Math.min(100, ((t - new Date(`${min}T00:00:00`).getTime()) / span) * 100),
    );
    const endT =
      d === max ? span : Math.min(span, Math.max(0, t - new Date(`${min}T00:00:00`).getTime()));
    const width = Math.max(4, (endT / span) * 100 - left);
    return { left: `${left}%`, width: `${width}%` };
  };
  return { min, max, pos };
});

function openCreate() {
  editing.value = null;
  formOpen.value = true;
}

function openEdit(m: Milestone) {
  editing.value = m;
  formOpen.value = true;
}

function onFormSubmit(form: MilestoneFormData) {
  if (editing.value) store.updateMilestone(editing.value.id, form);
  else store.createMilestone(props.project.id, form);
  formOpen.value = false;
}

function confirmDelete() {
  if (deleting.value) store.deleteMilestone(deleting.value.id);
  deleting.value = null;
}
</script>

<template>
  <div class="space-y-5">
    <!-- 项目计划信息 -->
    <section class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-5">
      <div class="flex items-center justify-between">
        <h2 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
          <Target class="text-brand-600 size-4" />
          项目计划
        </h2>
        <span v-if="project.status !== 'archived'" class="text-surface-800/50 text-xs">
          编辑项目时维护以下信息
        </span>
      </div>
      <dl class="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt class="text-surface-800/50 text-xs">目标</dt>
          <dd class="text-surface-800/80 mt-1 leading-5">{{ project.goal ?? '—' }}</dd>
        </div>
        <div>
          <dt class="text-surface-800/50 text-xs">开始日期</dt>
          <dd class="text-surface-800/80 mt-1">{{ project.startDate ?? '—' }}</dd>
        </div>
        <div>
          <dt class="text-surface-800/50 text-xs">目标完成日期</dt>
          <dd class="text-surface-800/80 mt-1">{{ project.targetDate ?? '—' }}</dd>
        </div>
        <div>
          <dt class="text-surface-800/50 text-xs">预计投入</dt>
          <dd class="text-surface-800/80 mt-1">
            {{ project.estimatedHours != null ? `${project.estimatedHours} 小时` : '—' }}
          </dd>
        </div>
      </dl>
    </section>

    <!-- 里程碑 + 时间轴 -->
    <section class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-5">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
          <Flag class="text-brand-600 size-4" />
          里程碑
          <span class="bg-surface-50 text-surface-800/60 rounded-full px-2 py-0.5 text-xs">
            {{ milestones.length }}
          </span>
        </h2>
        <button
          v-if="project.status !== 'archived'"
          type="button"
          class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
          @click="openCreate"
        >
          <Plus class="size-3.5" />
          新建里程碑
        </button>
      </div>

      <!-- 空态 -->
      <div
        v-if="!milestones.length"
        class="border-surface-100 flex flex-col items-center rounded-lg border border-dashed py-10 text-center"
      >
        <Flag class="text-surface-800/30 size-8" />
        <p class="text-surface-800/50 mt-2 text-sm">暂无里程碑，点击右上角创建</p>
      </div>

      <template v-else>
        <!-- 时间轴（桌面，原生 CSS） -->
        <div v-if="timeline" class="hidden lg:block">
          <div class="text-surface-800/40 mb-2 flex items-center justify-between text-xs">
            <span>{{ timeline.min }}</span>
            <span>{{ timeline.max }}</span>
          </div>
          <div class="bg-surface-100 relative h-10 rounded-lg">
            <div
              v-for="m in milestones"
              :key="m.id"
              class="absolute top-1/2 h-4 -translate-y-1/2 rounded-md border"
              :class="
                m.status === 'done'
                  ? 'border-green-200 bg-green-500/40'
                  : m.risk === 'overdue'
                    ? 'border-red-200 bg-red-500/50'
                    : m.risk === 'at-risk'
                      ? 'border-amber-200 bg-amber-500/40'
                      : 'border-brand-200 bg-brand-500/40'
              "
              :style="{
                left: timeline.pos(m.startDate).left,
                width: timeline.pos(m.startDate ?? m.dueDate).width,
              }"
              :title="`${m.title}（${m.dueDate ?? '未定截止'}）`"
            />
          </div>
        </div>

        <!-- 里程碑列表（桌面列表 + 移动端按日期分组降级） -->
        <div class="mt-4 space-y-2.5">
          <div
            v-for="m in milestones"
            :key="m.id"
            class="border-surface-100 hover:border-brand-500/40 group rounded-lg border p-3.5 transition-colors"
          >
            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                class="text-surface-800/50 shrink-0 transition-colors hover:text-green-600"
                :aria-label="
                  m.status === 'done' ? `重新打开里程碑：${m.title}` : `完成里程碑：${m.title}`
                "
                :title="m.status === 'done' ? '重新打开' : '标记完成'"
                @click="store.setMilestoneDone(m.id, m.status !== 'done')"
              >
                <CheckCircle2 v-if="m.status === 'done'" class="size-4 text-green-600" />
                <Circle v-else class="size-4" />
              </button>
              <h3
                class="min-w-0 flex-1 truncate text-sm font-medium"
                :class="
                  m.status === 'done' ? 'text-surface-800/40 line-through' : 'text-surface-900'
                "
              >
                {{ m.title }}
              </h3>
              <span
                class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                :class="MILESTONE_STATUS_META[m.status].badge"
              >
                {{ MILESTONE_STATUS_META[m.status].label }}
              </span>
              <span
                class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                :class="RISK_META[m.risk].cls"
              >
                <AlertTriangle
                  v-if="m.risk === 'at-risk' || m.risk === 'overdue'"
                  class="mr-1 size-3"
                />
                {{ RISK_META[m.risk].label }}
              </span>
              <div
                v-if="project.status !== 'archived'"
                class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <button
                  type="button"
                  class="text-surface-800/50 hover:bg-surface-100 hover:text-surface-900 flex size-6 items-center justify-center rounded-md transition-colors"
                  aria-label="上移里程碑"
                  title="上移"
                  @click="store.moveMilestone(m.id, -1)"
                >
                  <ArrowUp class="size-3" />
                </button>
                <button
                  type="button"
                  class="text-surface-800/50 hover:bg-surface-100 hover:text-surface-900 flex size-6 items-center justify-center rounded-md transition-colors"
                  aria-label="下移里程碑"
                  title="下移"
                  @click="store.moveMilestone(m.id, 1)"
                >
                  <ArrowDown class="size-3" />
                </button>
                <button
                  type="button"
                  class="text-surface-800/50 hover:bg-surface-100 hover:text-surface-900 flex size-6 items-center justify-center rounded-md transition-colors"
                  aria-label="编辑里程碑"
                  title="编辑"
                  @click="openEdit(m)"
                >
                  <Pencil class="size-3" />
                </button>
                <button
                  type="button"
                  class="text-surface-800/50 flex size-6 items-center justify-center rounded-md transition-colors hover:bg-red-50 hover:text-red-600"
                  aria-label="删除里程碑"
                  title="删除"
                  @click="deleting = m"
                >
                  <Trash2 class="size-3" />
                </button>
              </div>
            </div>

            <p v-if="m.description" class="text-surface-800/60 mt-1.5 text-sm">
              {{ m.description }}
            </p>

            <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
              <span class="text-surface-800/50 flex items-center gap-1">
                <CalendarClock class="size-3.5" />
                {{ m.startDate ?? '未定' }} → {{ m.dueDate ?? '未定' }}
              </span>
              <span class="text-surface-800/50 flex items-center gap-1">
                <Clock class="size-3.5" />
                进度 {{ m.progress }}%（{{ m.done }}/{{ m.total }}）
              </span>
              <span v-if="m.remaining > 0" class="text-surface-800/50"
                >剩余 {{ m.remaining }} 个任务</span
              >
              <span v-if="m.remaining === 0 && m.status !== 'done'" class="text-surface-800/50">
                未关联任务，进度按任务完成比例计算
              </span>
              <span
                v-if="m.overdue"
                class="flex items-center gap-1 rounded bg-red-500/10 px-1.5 py-0.5 font-medium text-red-600"
              >
                <AlertTriangle class="size-3" />
                已逾期
              </span>
            </div>

            <!-- 进度条 -->
            <div class="bg-surface-100 mt-2 h-1.5 overflow-hidden rounded-full">
              <div
                class="h-full rounded-full transition-all"
                :class="
                  m.progress >= 100 ? 'bg-green-500' : m.overdue ? 'bg-red-500' : 'bg-brand-500'
                "
                :style="{ width: `${m.progress}%` }"
              />
            </div>
          </div>
        </div>
      </template>
    </section>

    <!-- 编辑 / 新建弹窗 -->
    <MilestoneForm
      :open="formOpen"
      :milestone="editing"
      :project-id="project.id"
      @submit="onFormSubmit"
      @close="formOpen = false"
    />

    <!-- 删除确认 -->
    <ConfirmDialog
      :open="deleting !== null"
      title="删除里程碑"
      :message="`确定删除里程碑「${deleting?.title ?? ''}」吗？关联任务不会被删除。`"
      confirm-text="删除"
      danger
      @confirm="confirmDelete"
      @cancel="deleting = null"
    />
  </div>
</template>
