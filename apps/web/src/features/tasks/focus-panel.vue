<script setup lang="ts">
import { Check, Circle, Pause, Play, Plus, Timer, X } from '@lucide/vue';
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

/** 本项目的今日任务 */
const projectFocus = computed(() =>
  store.focusTasks.filter((t) => t.projectId === props.projectId),
);
const otherFocusCount = computed(() => store.focus.length - projectFocus.value.length);

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
</script>

<template>
  <section class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-4">
    <header class="mb-3 flex items-center justify-between">
      <h2 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
        <Timer class="text-brand-600 size-4" />
        今日聚焦
        <span class="bg-surface-50 text-surface-800/60 rounded-full px-2 py-0.5 text-xs">
          {{ store.focus.length }}/{{ FOCUS_MAX }}
        </span>
      </h2>
      <button
        v-if="store.focus.length < FOCUS_MAX && !adding"
        type="button"
        class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors"
        @click="adding = true"
      >
        <Plus class="size-3" />
        添加任务
      </button>
    </header>

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

    <!-- 今日任务列表 -->
    <div v-if="projectFocus.length" class="space-y-1.5">
      <div
        v-for="item in projectFocus"
        :key="item.id"
        class="border-surface-100 hover:border-brand-500/40 flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors"
      >
        <button
          type="button"
          class="text-surface-800/40 shrink-0 transition-colors hover:text-green-600"
          :aria-label="`标记完成：${item.title}`"
          :title="'标记完成（不改变看板列）'"
          @click="store.moveTask(item.id, 'done')"
        >
          <Circle class="size-4" />
        </button>
        <div class="min-w-0 flex-1">
          <p class="text-surface-900 truncate text-sm font-medium">{{ item.title }}</p>
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
          :aria-label="`移出今日聚焦：${item.title}`"
          title="移出今日聚焦"
          @click="store.removeFromFocus(item.id)"
        >
          <X class="size-3.5" />
        </button>
      </div>
    </div>
    <p v-else class="text-surface-800/40 py-2 text-center text-xs">
      {{
        otherFocusCount > 0
          ? '今日聚焦在其他项目中已选满'
          : '今日还没有聚焦任务，从看板或此处挑选 1-5 个'
      }}
    </p>
  </section>
</template>
