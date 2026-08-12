<script setup lang="ts">
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock,
  Flag,
  GripVertical,
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
import { milestoneProgress, milestoneRisk, milestoneState } from './milestones';
import type { MilestoneDerived } from './milestones';
import {
  buildTimelineCells,
  isValidDateStr,
  milestoneBar,
  planMissingInfo,
  timelinePosition,
  timelineWindow,
} from './plan';
import type { TimelineScale } from './plan';
import MilestoneForm from './milestone-form.vue';
import ConfirmDialog from './confirm-dialog.vue';

const props = defineProps<{ project: ProjectDetail }>();

const store = useProjectStore();
const taskStore = useTaskStore();

const formOpen = ref(false);
const editing = ref<Milestone | null>(null);
const deleting = ref<Milestone | null>(null);
const scale = ref<TimelineScale>('week');

const today = (() => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();

const taskDone = (taskId: string): boolean => taskStore.taskById(taskId)?.status === 'done';

const milestones = computed<MilestoneDerived[]>(() =>
  store.milestonesOf(props.project.id).map((m) => {
    const p = milestoneProgress(m, taskDone);
    const risk = milestoneRisk(m.status, m.dueDate, today);
    return {
      ...m,
      ...p,
      risk,
      overdue: risk === 'overdue',
      state: milestoneState(m, today),
    };
  }),
);

const RISK_META = {
  done: { label: '已完成', cls: 'text-green-600 bg-green-500/10' },
  'on-track': { label: '正常', cls: 'text-sky-600 bg-sky-500/10' },
  'at-risk': { label: '有风险', cls: 'text-amber-600 bg-amber-500/10' },
  overdue: { label: '已逾期', cls: 'text-red-600 bg-red-500/10' },
};

// ── 路线图：时间轴窗口 / 网格 / 条 ──

const window = computed(() => timelineWindow(props.project, store.milestonesOf(props.project.id)));
const missing = computed(() =>
  planMissingInfo(props.project, store.milestonesOf(props.project.id)),
);

const cells = computed(() =>
  window.value ? buildTimelineCells(window.value.start, window.value.end, scale.value, today) : [],
);

/** 里程碑时间轴条（无日期的不绘制，列表模式已说明） */
const msBars = computed(() => {
  if (!window.value) return [];
  return milestones.value
    .map((m) => ({ m, pos: milestoneBar(m, window.value!) }))
    .filter(
      (x): x is { m: MilestoneDerived; pos: NonNullable<ReturnType<typeof milestoneBar>> } =>
        x.pos !== null,
    );
});

/** 任务时间轴条：按 dueDate 定位（无 dueDate 不绘制） */
const taskBars = computed(() => {
  if (!window.value) return [];
  return taskStore
    .tasksByProject(props.project.id)
    .filter((t) => isValidDateStr(t.dueDate))
    .map((t) => ({ t, pos: timelinePosition(t.dueDate!, window.value!) }))
    .sort((a, b) => (a.t.dueDate! < b.t.dueDate! ? -1 : 1));
});

/** 里程碑条颜色（按状态 / 风险） */
function msBarClass(m: MilestoneDerived): string {
  if (m.status === 'done') return 'border-green-200 bg-green-500/40';
  if (m.risk === 'overdue') return 'border-red-200 bg-red-500/50';
  if (m.risk === 'at-risk') return 'border-amber-200 bg-amber-500/40';
  return 'border-brand-200 bg-brand-500/40';
}

/** 任务条颜色（按状态） */
function taskBarClass(status: string): string {
  if (status === 'done') return 'bg-green-500/50';
  if (status === 'in-progress') return 'bg-amber-500/50';
  return 'bg-sky-500/40';
}

// ── 拖拽：里程碑排序（列表） + 日期调整（时间轴） ──

const dragMsId = ref<string | null>(null);
const dropTargetId = ref<string | null>(null);

function onMsDragStart(m: Milestone): void {
  dragMsId.value = m.id;
}

function onMsDragOver(m: Milestone): void {
  dropTargetId.value = m.id;
}

function onMsDrop(target: Milestone): void {
  const fromId = dragMsId.value;
  dragMsId.value = null;
  dropTargetId.value = null;
  if (!fromId || fromId === target.id) return;
  const ordered = store.milestonesOf(props.project.id).map((m) => m.id);
  const from = ordered.indexOf(fromId);
  const to = ordered.indexOf(target.id);
  if (from < 0 || to < 0) return;
  ordered.splice(from, 1);
  ordered.splice(to, 0, fromId);
  store.reorderMilestones(props.project.id, ordered);
}

/** 里程碑条拖到时间轴某网格日期 → 调整目标日期 */
function onDropToCell(m: Milestone | null, date: string): void {
  dragMsId.value = null;
  dropTargetId.value = null;
  if (!m || !isValidDateStr(date)) return;
  store.updateMilestoneDates(m.id, { dueDate: date });
}

/** 时间轴 cell 放置入口：从当前拖拽 id 解析里程碑 */
function onCellDrop(date: string): void {
  const id = dragMsId.value;
  if (!id) return;
  onDropToCell(store.milestoneById(id), date);
}

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

    <!-- 路线图：按里程碑 / 任务 / 日期展示计划 -->
    <section class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-5">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
          <CalendarDays class="text-brand-600 size-4" />
          路线图
          <span v-if="window" class="text-surface-800/50 text-xs font-normal">
            {{ window.start }} ~ {{ window.end }}（{{ window.spanDays }} 天）
          </span>
        </h2>
        <div class="bg-surface-50 flex items-center rounded-lg p-0.5 text-xs">
          <button
            v-for="s in ['day', 'week', 'month'] as TimelineScale[]"
            :key="s"
            type="button"
            class="rounded-md px-2.5 py-1 font-medium transition-colors"
            :class="
              scale === s
                ? 'bg-surface-0 text-brand-600 shadow-sm'
                : 'text-surface-800/60 hover:text-surface-900'
            "
            @click="scale = s"
          >
            {{ s === 'day' ? '日' : s === 'week' ? '周' : '月' }}
          </button>
        </div>
      </div>

      <!-- 有可用窗口：渲染时间轴 -->
      <template v-if="window">
        <div class="rounded-lg border">
          <!-- 刻度标签 -->
          <div class="bg-surface-50 relative flex h-7 rounded-t-lg border-b">
            <div
              v-for="c in cells"
              :key="c.date"
              class="border-surface-100/80 flex items-center justify-center border-r text-[10px] last:border-r-0"
              :class="c.isToday ? 'text-brand-600 font-semibold' : 'text-surface-800/50'"
              :style="{ width: `${100 / cells.length}%` }"
              :title="c.date"
            >
              {{ c.label }}
            </div>
          </div>

          <!-- 里程碑轨道（可拖拽条：拖到目标日期调整截止） -->
          <div class="relative h-9 border-b">
            <div
              v-for="c in cells"
              :key="`g-${c.date}`"
              class="absolute top-0 h-full border-r border-dashed"
              :class="c.isToday ? 'bg-brand-500/10' : ''"
              :style="{
                left: `${(cells.indexOf(c) / cells.length) * 100}%`,
                width: `${100 / cells.length}%`,
              }"
              @dragover.prevent
              @drop.prevent="onCellDrop(c.date)"
            />
            <div
              v-for="b in msBars"
              :key="b.m.id"
              class="absolute top-1/2 flex h-5 -translate-y-1/2 cursor-grab items-center rounded-md border px-1 text-[10px] font-medium shadow-sm active:cursor-grabbing"
              :class="msBarClass(b.m)"
              draggable="true"
              :title="`${b.m.title}（${b.m.dueDate ?? '未定截止'}）— 拖到目标日期调整截止`"
              :style="{ left: b.pos.left, width: b.pos.width }"
              @dragstart="onMsDragStart(b.m)"
              @dragend="dragMsId = null"
            >
              <span class="truncate">{{ b.m.title }}</span>
            </div>
            <div
              v-if="!msBars.length"
              class="text-surface-800/40 absolute inset-0 flex items-center justify-center text-xs"
            >
              无有效日期里程碑，无法绘制
            </div>
          </div>

          <!-- 任务轨道（按截止日期定位，只读展示） -->
          <div class="relative h-8 rounded-b-lg">
            <div
              v-for="c in cells"
              :key="`t-${c.date}`"
              class="absolute top-0 h-full border-r border-dashed"
              :class="c.isToday ? 'bg-brand-500/10' : ''"
              :style="{
                left: `${(cells.indexOf(c) / cells.length) * 100}%`,
                width: `${100 / cells.length}%`,
              }"
            />
            <div
              v-for="b in taskBars"
              :key="b.t.id"
              class="absolute top-1/2 h-3.5 -translate-y-1/2 rounded-sm"
              :class="taskBarClass(b.t.status)"
              :style="{ left: b.pos.left, width: b.pos.width }"
              :title="`${b.t.title}（${b.t.dueDate}，${b.t.status}）`"
            />
            <div
              v-if="!taskBars.length"
              class="text-surface-800/40 absolute inset-0 flex items-center justify-center text-xs"
            >
              暂无带截止日期的任务
            </div>
          </div>
        </div>

        <div class="text-surface-800/50 mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span class="flex items-center gap-1"
            ><span class="bg-brand-500/40 inline-block h-2.5 w-3 rounded-sm" />里程碑</span
          >
          <span class="flex items-center gap-1"
            ><span
              class="inline-block h-2.5 w-3 rounded-sm bg-sky-500/40"
            />任务（按截止日期）</span
          >
          <span v-if="missing.missing.length" class="text-amber-600">
            提示：{{ missing.missing.join('；') }}
          </span>
        </div>
      </template>

      <!-- 无可用窗口：降级提示 -->
      <div v-else class="border-surface-100 rounded-lg border border-dashed py-8 text-center">
        <CalendarDays class="text-surface-800/30 mx-auto size-8" />
        <p class="text-surface-800/50 mt-2 text-sm">缺少足够日期，无法绘制路线图</p>
        <p v-for="m in missing.missing" :key="m" class="text-surface-800/40 mt-0.5 text-xs">
          {{ m }}
        </p>
      </div>
    </section>

    <!-- 里程碑列表（可拖拽排序） -->
    <section class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-5">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
          <Flag class="text-brand-600 size-4" />
          里程碑
          <span class="bg-surface-50 text-surface-800/60 rounded-full px-2 py-0.5 text-xs">
            {{ milestones.length }}
          </span>
        </h2>
        <div class="flex items-center gap-2">
          <span v-if="milestones.length > 1" class="text-surface-800/40 hidden text-xs sm:inline">
            拖动左侧手柄排序
          </span>
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
      </div>

      <!-- 空态 -->
      <div
        v-if="!milestones.length"
        class="border-surface-100 flex flex-col items-center rounded-lg border border-dashed py-10 text-center"
      >
        <Flag class="text-surface-800/30 size-8" />
        <p class="text-surface-800/50 mt-2 text-sm">暂无里程碑，点击右上角创建</p>
      </div>

      <div v-else class="mt-2 space-y-2.5">
        <div
          v-for="m in milestones"
          :key="m.id"
          class="border-surface-100 hover:border-brand-500/40 group rounded-lg border p-3.5 transition-colors"
          :class="dropTargetId === m.id ? 'border-brand-500 ring-brand-500/20 ring-2' : ''"
          draggable="true"
          @dragstart="onMsDragStart(m)"
          @dragover.prevent="onMsDragOver(m)"
          @dragleave="dropTargetId = null"
          @drop.prevent="onMsDrop(m)"
          @dragend="
            dragMsId = null;
            dropTargetId = null;
          "
        >
          <div class="flex flex-wrap items-center gap-2">
            <GripVertical class="text-surface-800/30 size-4 shrink-0 cursor-grab" />
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
              :class="m.status === 'done' ? 'text-surface-800/40 line-through' : 'text-surface-900'"
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
