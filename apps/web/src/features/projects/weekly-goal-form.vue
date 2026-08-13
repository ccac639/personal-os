<script setup lang="ts">
import { CalendarRange, Check, Pencil, Plus, Trash2 } from '@lucide/vue';
import { computed, ref } from 'vue';

import { useTaskStore } from '@/features/tasks/store';
import { useWeeklyGoalStore } from './weekly-goals-store';
import { weekLabel, weekProgress, weekStartOf } from './execution';
import type { WeeklyGoal } from './execution';

const props = defineProps<{ projectId: string }>();

const taskStore = useTaskStore();
const goalStore = useWeeklyGoalStore();

const today = (() => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();

const weekStart = computed(() => weekStartOf(today));
const current = computed(() => goalStore.currentGoalOf(props.projectId, today));
const history = computed(() => goalStore.historyOf(props.projectId, today));

const editing = ref(false);
const draft = ref({ description: '', targetTasks: 0, targetFocusMinutes: 0 });

function startEdit() {
  const g = current.value;
  draft.value = {
    description: g?.description ?? '',
    targetTasks: g?.targetTasks ?? 0,
    targetFocusMinutes: g?.targetFocusMinutes ?? 0,
  };
  editing.value = true;
}

function save() {
  goalStore.setGoal({
    projectId: props.projectId,
    weekStart: weekStart.value,
    description: draft.value.description,
    targetTasks: draft.value.targetTasks,
    targetFocusMinutes: draft.value.targetFocusMinutes,
  });
  editing.value = false;
}

function progressOf(g: WeeklyGoal) {
  return weekProgress(g, taskStore.tasksByProject(props.projectId), taskStore.focusSessions, today);
}

const riskMeta = {
  none: { label: '正常', cls: 'text-green-600 bg-green-500/10' },
  behind: { label: '进度落后', cls: 'text-amber-700 bg-amber-500/10' },
  critical: { label: '风险较高', cls: 'text-red-600 bg-red-500/10' },
} as const;

function removeGoal(g: WeeklyGoal) {
  goalStore.deleteGoal(g.id);
}
</script>

<template>
  <section class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-5">
    <header class="mb-3 flex items-center justify-between">
      <h2 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
        <CalendarRange class="text-brand-600 size-4" />
        本周目标
        <span class="text-surface-800/50 text-xs font-normal">{{ weekLabel(weekStart) }}</span>
      </h2>
      <button
        v-if="!editing"
        type="button"
        class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
        @click="startEdit"
      >
        <Pencil class="size-3.5" />
        {{ current ? '编辑目标' : '设定目标' }}
      </button>
    </header>

    <!-- 编辑表单 -->
    <form v-if="editing" class="space-y-3" @submit.prevent="save">
      <div>
        <label class="text-surface-800/60 mb-1 block text-xs">目标描述</label>
        <input
          v-model="draft.description"
          type="text"
          placeholder="例如：完成任务看板重构并修复全部阻塞问题"
          class="border-surface-200 bg-surface-0 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
        />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-surface-800/60 mb-1 block text-xs">目标完成任务数</label>
          <input
            v-model.number="draft.targetTasks"
            type="number"
            min="0"
            class="border-surface-200 bg-surface-0 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
          />
        </div>
        <div>
          <label class="text-surface-800/60 mb-1 block text-xs">目标专注时长（分钟）</label>
          <input
            v-model.number="draft.targetFocusMinutes"
            type="number"
            min="0"
            step="5"
            class="border-surface-200 bg-surface-0 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
          />
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="submit"
          class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors"
        >
          <Check class="size-4" />
          保存
        </button>
        <button
          type="button"
          class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors"
          @click="editing = false"
        >
          取消
        </button>
      </div>
    </form>

    <!-- 当前进度 -->
    <div v-else-if="current" class="space-y-3">
      <p class="text-surface-800/80 text-sm leading-6">{{ current.description }}</p>
      <div class="space-y-2">
        <div>
          <div class="mb-1 flex items-center justify-between text-xs">
            <span class="text-surface-800/60">任务完成</span>
            <span class="text-surface-800/80">
              {{ progressOf(current).doneTasks }} / {{ current.targetTasks }}
            </span>
          </div>
          <div class="bg-surface-100 h-2 overflow-hidden rounded-full">
            <div
              class="bg-brand-600 h-full rounded-full transition-all"
              :style="{ width: `${progressOf(current).taskProgress}%` }"
            />
          </div>
        </div>
        <div>
          <div class="mb-1 flex items-center justify-between text-xs">
            <span class="text-surface-800/60">专注时长</span>
            <span class="text-surface-800/80">
              {{ progressOf(current).focusMinutes }} / {{ current.targetFocusMinutes }} 分钟
            </span>
          </div>
          <div class="bg-surface-100 h-2 overflow-hidden rounded-full">
            <div
              class="bg-brand-600 h-full rounded-full transition-all"
              :style="{ width: `${progressOf(current).focusProgress}%` }"
            />
          </div>
        </div>
      </div>
      <p class="text-xs">
        <span
          class="rounded-full px-2 py-0.5 font-medium"
          :class="riskMeta[progressOf(current).risk].cls"
        >
          {{ riskMeta[progressOf(current).risk].label }}
        </span>
        <span class="text-surface-800/50 ml-2">
          综合进度 {{ progressOf(current).overall }}%（任务 + 专注平均）
        </span>
      </p>
    </div>

    <p v-else class="text-surface-800/40 py-2 text-center text-sm">
      本周尚未设定目标，点击「设定目标」规划本周产出。
    </p>

    <!-- 历史 -->
    <div v-if="history.length > 0" class="mt-5 border-t pt-4">
      <h3 class="text-surface-800/60 mb-2 flex items-center gap-1.5 text-xs font-medium">
        <Plus class="size-3.5" />
        历史周目标（保留最近 {{ history.length }} 周）
      </h3>
      <ul class="space-y-1.5">
        <li
          v-for="g in history"
          :key="g.id"
          class="border-surface-100 bg-surface-50 flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
        >
          <div class="min-w-0">
            <p class="text-surface-800/80 truncate text-xs font-medium">
              {{ g.description || '（无描述）' }}
            </p>
            <p class="text-surface-800/50 text-xs">
              {{ weekLabel(g.weekStart) }} · 完成 {{ progressOf(g).doneTasks }}/{{
                g.targetTasks
              }}
              · 专注 {{ progressOf(g).focusMinutes }}/{{ g.targetFocusMinutes }}
            </p>
          </div>
          <button
            type="button"
            aria-label="删除历史周目标"
            class="text-surface-800/40 shrink-0 rounded p-1 transition-colors hover:text-red-600"
            @click="removeGoal(g)"
          >
            <Trash2 class="size-3.5" />
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>
