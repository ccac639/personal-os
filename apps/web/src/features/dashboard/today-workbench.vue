<script setup lang="ts">
import { computed } from 'vue';
import { CheckCircle2, Circle, Clock, ListTodo, Loader2, MessageSquare, Workflow } from '@lucide/vue';
import { TODAY_WORKBENCH } from './mock';
import type { TodayWorkbench, WorkbenchItem } from './types';

interface Props {
  /** 外部数据覆盖（测试注入；未传则用统一 mock 源） */
  data?: TodayWorkbench;
}

const props = withDefaults(defineProps<Props>(), {
  data: undefined,
});

const data = computed(() => props.data ?? TODAY_WORKBENCH);

/** 条目图标（按 kind） */
const KIND_ICONS: Record<WorkbenchItem['kind'], typeof Circle> = {
  task: CheckCircle2,
  todo: ListTodo,
  workflow: Workflow,
  ai: MessageSquare,
};

/** 状态展示配置 */
const STATUS_CONFIG: Record<WorkbenchItem['status'], { label: string; cls: string; icon?: typeof Circle; spin?: boolean }> = {
  pending: { label: '待处理', cls: 'text-surface-800/50' },
  running: { label: '进行中', cls: 'text-brand-600', icon: Loader2, spin: true },
  done: { label: '已完成', cls: 'text-green-600' },
};
</script>

<template>
  <section
    class="border-surface-100 bg-surface-0 flex flex-col rounded-lg border p-5"
    aria-label="今日工作台"
  >
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-surface-900 text-base font-semibold">今日工作台</h2>
      <div class="text-surface-800/60 flex items-center gap-3 text-xs tabular-nums">
        <span class="flex items-center gap-1">
          <Clock class="size-3.5" />
          专注 {{ data.focusMinutes }}m
        </span>
        <span class="flex items-center gap-1">
          <CheckCircle2 class="size-3.5 text-green-600" />
          完成 {{ data.completedToday }} 项
        </span>
      </div>
    </div>

    <!-- 空态 -->
    <div
      v-if="data.items.length === 0"
      class="flex h-32 flex-col items-center justify-center gap-2 text-sm text-surface-800/50"
    >
      <ListTodo class="size-6" />
      <p>今日暂无工作项，去开始第一件事吧</p>
      <router-link to="/projects" class="text-brand-600 hover:text-brand-700 text-xs">
        打开项目
      </router-link>
    </div>

    <!-- 条目列表 -->
    <ul v-else class="flex-1 space-y-2">
      <li
        v-for="item in data.items"
        :key="item.id"
        class="border-surface-100 hover:border-surface-800/30 group flex items-center gap-2.5 rounded-lg border p-2.5 transition"
      >
        <span
          class="flex size-7 shrink-0 items-center justify-center rounded-md"
          :class="STATUS_CONFIG[item.status].cls"
        >
          <component
            :is="KIND_ICONS[item.kind]"
            class="size-4"
            :class="STATUS_CONFIG[item.status].spin ? 'animate-spin' : ''"
            :aria-hidden="true"
          />
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-surface-900 truncate text-sm font-medium">
            {{ item.title }}
          </p>
          <p class="text-surface-800/50 truncate text-xs">
            {{ item.source }}<span v-if="item.meta"> · {{ item.meta }}</span>
          </p>
        </div>
        <span class="text-surface-800/50 shrink-0 text-[11px]">{{ STATUS_CONFIG[item.status].label }}</span>
        <router-link
          :to="item.href"
          class="text-brand-600 hover:text-brand-700 rounded p-0.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          :aria-label="`继续：${item.title}`"
        >
          继续
        </router-link>
      </li>
    </ul>
  </section>
</template>
