<script setup lang="ts">
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Circle,
  Flame,
  History,
  Pause,
  Play,
  Plus,
  Timer,
  X,
} from '@lucide/vue';
import { computed, onBeforeUnmount, ref } from 'vue';

import { useTaskStore } from './store';
import { formatTimer, settleMs } from './focus';
import { FOCUS_MAX } from './types';
import { relativeTime } from '@/features/projects/utils';

const props = defineProps<{ projectId: string }>();

const store = useTaskStore();
const adding = ref(false);
const candidateId = ref('');
const plannedMinutes = ref(25);
const showHistory = ref(false);

/** 本项目的今日计划任务 */
const projectFocus = computed(() =>
  store.focusTasks.filter((t) => t.projectId === props.projectId),
);
const otherFocusCount = computed(() => store.focus.length - projectFocus.value.length);

/** 今日已完成（计划勾选，独立于看板） */
const projectPlanDone = computed(() =>
  store.planDoneTasks.filter((t) => t.projectId === props.projectId),
);

/** 计时器显示（每秒刷新） */
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;
timer = setInterval(() => {
  now.value = Date.now();
}, 1000);
onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});

const running = computed(() => store.runningFocus);
const displayMs = computed(() => (running.value ? settleMs(running.value, now.value) : 0));

const candidates = computed(() => {
  const inFocus = new Set(store.focus.map((f) => f.taskId));
  return store.tasksByProject(props.projectId).filter((t) => !inFocus.has(t.id));
});

function addCandidate() {
  if (!candidateId.value) return;
  if (store.addToFocus(candidateId.value, plannedMinutes.value)) {
    adding.value = false;
    candidateId.value = '';
    plannedMinutes.value = 25;
  }
}

function moveItem(index: number, dir: -1 | 1) {
  const list = projectFocus.value;
  const from = store.focus.findIndex((f) => f.taskId === list[index]?.id);
  if (from < 0) return;
  store.reorderFocus(from, from + dir);
}
</script>

<template>
  <section class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-4">
    <header class="mb-3 flex items-center justify-between">
      <h2 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
        <Timer class="text-brand-600 size-4" />
        每日计划
        <span class="bg-surface-50 text-surface-800/60 rounded-full px-2 py-0.5 text-xs">
          {{ store.focus.length }}/{{ FOCUS_MAX }}
        </span>
      </h2>
      <div class="flex items-center gap-2">
        <span
          v-if="store.focusStreakDays > 0"
          class="flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-600"
          :title="'连续专注天数'"
        >
          <Flame class="size-3" />
          {{ store.focusStreakDays }} 天
        </span>
        <button
          v-if="store.focus.length + store.focusDone.length > 0"
          type="button"
          class="text-surface-800/50 hover:bg-surface-100 hover:text-surface-900 flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors"
          :title="'归档今天：把今日计划（含完成状态）存入历史'"
          @click="store.archiveToday()"
        >
          <History class="size-3" />
          归档今天
        </button>
        <button
          v-if="store.focus.length < FOCUS_MAX && !adding"
          type="button"
          class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors"
          @click="adding = true"
        >
          <Plus class="size-3" />
          添加任务
        </button>
      </div>
    </header>

    <!-- 昨日未完成 → 迁移提示 -->
    <div
      v-if="store.pendingRollover.length"
      class="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-500/5 px-3 py-2 text-xs"
    >
      <span class="text-amber-700"> 昨日计划还有 {{ store.pendingRollover.length }} 项未完成 </span>
      <button
        type="button"
        class="rounded-md bg-amber-500/15 px-2 py-1 font-medium text-amber-700 transition-colors hover:bg-amber-500/25"
        @click="store.rolloverPending()"
      >
        迁移到今天
      </button>
    </div>

    <!-- 添加表单 -->
    <div
      v-if="adding"
      class="bg-surface-50 mb-3 flex flex-wrap items-center gap-2 rounded-lg p-2.5"
    >
      <select
        v-model="candidateId"
        class="border-surface-100 bg-surface-0 focus:border-brand-500 min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-xs transition outline-none"
        aria-label="选择今日任务"
      >
        <option value="" disabled>选择任务…</option>
        <option v-for="t in candidates" :key="t.id" :value="t.id">{{ t.title }}</option>
      </select>
      <input
        v-model.number="plannedMinutes"
        type="number"
        min="5"
        max="240"
        step="5"
        class="border-surface-100 bg-surface-0 focus:border-brand-500 w-20 rounded-lg border px-2 py-1.5 text-xs transition outline-none"
        aria-label="预计专注分钟"
        title="预计专注分钟"
      />
      <button
        type="button"
        class="bg-brand-600 hover:bg-brand-700 text-surface-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
        :disabled="!candidateId"
        @click="addCandidate"
      >
        加入
      </button>
      <button
        type="button"
        class="text-surface-800/50 hover:text-surface-900 rounded-lg px-2 py-1.5 text-xs transition-colors"
        aria-label="取消添加"
        @click="adding = false"
      >
        取消
      </button>
    </div>

    <!-- 当前计时器 -->
    <div
      v-if="running && running.taskId"
      class="mb-3 flex items-center gap-3 rounded-lg border px-3 py-2.5"
      :class="
        running.status === 'running'
          ? 'border-brand-200 bg-brand-500/5'
          : 'border-surface-100 bg-surface-50'
      "
    >
      <Timer class="text-brand-600 size-4 shrink-0" />
      <div class="min-w-0 flex-1">
        <p class="text-surface-900 truncate text-sm font-medium">
          {{ store.taskById(running.taskId)?.title ?? '未知任务' }}
        </p>
        <p class="text-surface-800/50 mt-0.5 font-mono text-sm">{{ formatTimer(displayMs) }}</p>
      </div>
      <template v-if="running.status === 'running'">
        <button
          type="button"
          class="text-surface-800/60 hover:bg-surface-100 hover:text-surface-900 flex size-8 items-center justify-center rounded-lg transition-colors"
          aria-label="暂停专注"
          title="暂停"
          @click="store.pauseFocus()"
        >
          <Pause class="size-4" />
        </button>
        <button
          type="button"
          class="text-surface-0 flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-green-700"
          @click="store.completeFocus()"
        >
          <Check class="size-3.5" />
          完成
        </button>
      </template>
      <template v-else>
        <button
          type="button"
          class="text-surface-800/60 hover:bg-surface-100 hover:text-surface-900 flex size-8 items-center justify-center rounded-lg transition-colors"
          aria-label="继续专注"
          title="继续"
          @click="store.resumeFocus()"
        >
          <Play class="size-4" />
        </button>
        <button
          type="button"
          class="text-surface-800/60 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-red-50 hover:text-red-600"
          @click="store.abandonFocus()"
        >
          <X class="size-3.5" />
          放弃
        </button>
      </template>
    </div>

    <!-- 今日计划列表 -->
    <div v-if="projectFocus.length" class="space-y-1.5">
      <div
        v-for="(item, index) in projectFocus"
        :key="item.id"
        class="border-surface-100 hover:border-brand-500/40 flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors"
        :class="store.isPlanDone(item.id) ? 'opacity-60' : ''"
      >
        <button
          type="button"
          class="text-surface-800/40 shrink-0 transition-colors hover:text-green-600"
          :aria-label="`${store.isPlanDone(item.id) ? '取消' : '标记'}完成计划：${item.title}`"
          :title="'计划完成（不改变看板列）'"
          @click="store.togglePlanDone(item.id)"
        >
          <CheckCircle2 v-if="store.isPlanDone(item.id)" class="size-4 text-green-600" />
          <Circle v-else class="size-4" />
        </button>
        <div class="min-w-0 flex-1">
          <p
            class="truncate text-sm font-medium"
            :class="
              store.isPlanDone(item.id) ? 'text-surface-800/40 line-through' : 'text-surface-900'
            "
          >
            {{ item.title }}
          </p>
          <p class="text-surface-800/40 mt-0.5 text-xs">
            预计 {{ store.focus.find((f) => f.taskId === item.id)?.plannedMinutes ?? 25 }} 分钟
            <template v-if="store.taskFocusMinutes(item.id) > 0">
              · 已专注 {{ store.taskFocusMinutes(item.id) }} 分钟
            </template>
            <template v-if="store.lastFocusAt(item.id)">
              · 最近 {{ relativeTime(store.lastFocusAt(item.id)!) }}
            </template>
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            class="text-surface-800/40 hover:bg-surface-100 hover:text-surface-900 flex size-6 items-center justify-center rounded-md transition-colors"
            :aria-label="`上移：${item.title}`"
            title="上移"
            :disabled="index === 0"
            @click="moveItem(index, -1)"
          >
            <ArrowUp class="size-3" />
          </button>
          <button
            type="button"
            class="text-surface-800/40 hover:bg-surface-100 hover:text-surface-900 flex size-6 items-center justify-center rounded-md transition-colors"
            :aria-label="`下移：${item.title}`"
            title="下移"
            :disabled="index === projectFocus.length - 1"
            @click="moveItem(index, 1)"
          >
            <ArrowDown class="size-3" />
          </button>
          <button
            v-if="!running"
            type="button"
            class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors"
            @click="store.startFocus(item.id)"
          >
            <Play class="size-3" />
            专注
          </button>
          <button
            type="button"
            class="text-surface-800/40 shrink-0 rounded p-1 transition-colors hover:text-red-600"
            :aria-label="`移出今日计划：${item.title}`"
            title="移出今日计划"
            @click="store.removeFromFocus(item.id)"
          >
            <X class="size-3.5" />
          </button>
        </div>
      </div>
    </div>
    <p v-else class="text-surface-800/40 py-2 text-center text-xs">
      {{
        otherFocusCount > 0
          ? '每日计划在其他项目中已选满'
          : '今天还没有计划任务，从看板或此处挑选 1-5 个'
      }}
    </p>

    <!-- 今日已完成回顾 -->
    <div v-if="projectPlanDone.length" class="mt-3 border-t pt-2.5">
      <p class="text-surface-800/50 mb-1.5 text-xs font-medium">
        今日完成（{{ projectPlanDone.length }}）
      </p>
      <div class="space-y-1">
        <p
          v-for="t in projectPlanDone"
          :key="t.id"
          class="text-surface-800/50 flex items-center gap-1.5 truncate text-xs"
        >
          <Check class="size-3 text-green-600" />
          {{ t.title }}
        </p>
      </div>
    </div>

    <!-- 历史日计划 -->
    <div v-if="store.focusHistory.length" class="mt-3 border-t pt-2.5">
      <button
        type="button"
        class="text-surface-800/50 hover:text-surface-900 flex items-center gap-1 text-xs font-medium transition-colors"
        @click="showHistory = !showHistory"
      >
        <History class="size-3.5" />
        历史计划（{{ store.focusHistory.length }} 天）
        <span class="text-surface-800/40">{{ showHistory ? '收起' : '展开' }}</span>
      </button>
      <div v-if="showHistory" class="mt-2 space-y-2">
        <div
          v-for="day in store.focusHistory.slice(0, 7)"
          :key="day.date"
          class="border-surface-100 rounded-lg border px-3 py-2"
        >
          <p class="text-surface-800/60 text-xs font-medium">
            {{ day.date }}
            <span class="text-surface-800/40 font-normal">
              （{{ day.items.length }} 项 / 完成 {{ day.doneIds.length }}）
            </span>
          </p>
          <p v-if="day.items.length" class="text-surface-800/50 mt-1 space-y-0.5 text-xs">
            <span
              v-for="item in day.items.slice(0, 5)"
              :key="item.taskId"
              class="block truncate"
              :class="day.doneIds.includes(item.taskId) ? 'line-through opacity-50' : ''"
            >
              {{ store.taskById(item.taskId)?.title ?? '（任务已删除）' }}
            </span>
            <span v-if="day.items.length > 5" class="text-surface-800/40"
              >…共 {{ day.items.length }} 项</span
            >
          </p>
          <p v-else class="text-surface-800/40 mt-1 text-xs">（空计划）</p>
        </div>
      </div>
    </div>
  </section>
</template>
