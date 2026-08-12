<script setup lang="ts">
import { Clock, ExternalLink, Inbox } from '@lucide/vue';
import { ACTIVITY_STATUS_CONFIG, RECENT_ACTIVITIES } from './mock';
import type { ActivityItem } from './types';

interface Props {
  /** 外部数据覆盖（测试 / 后续接 API） */
  activities?: ActivityItem[];
}

const props = withDefaults(defineProps<Props>(), {
  activities: undefined,
});

const items = props.activities ?? RECENT_ACTIVITIES;

function getActivityColor(type: ActivityItem['type']) {
  const colors: Record<ActivityItem['type'], string> = {
    commit: 'text-blue-600 bg-blue-500/10',
    project: 'text-indigo-600 bg-indigo-500/10',
    workflow: 'text-purple-600 bg-purple-500/10',
    system: 'text-surface-800/60 bg-surface-100',
  };
  return colors[type];
}

/** 进行中进度条宽度（0-100 安全钳制） */
function progressWidth(activity: ActivityItem) {
  if (activity.status !== 'running' || activity.progress === undefined) return 0;
  return Math.min(100, Math.max(0, activity.progress));
}
</script>

<template>
  <section class="border-surface-100 bg-surface-0 flex flex-col rounded-lg border p-5">
    <!-- 头部：标题 + 查看全部（只跳已有链接 /projects） -->
    <div class="mb-3 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <h2 class="text-surface-900 text-base font-semibold">最近活动</h2>
        <span class="bg-surface-100 text-surface-800/50 rounded-full px-1.5 py-px text-[10px]">
          {{ items.length }} 条
        </span>
      </div>
      <router-link
        to="/projects"
        class="text-brand-600 hover:text-brand-700 flex items-center gap-0.5 text-xs font-medium transition"
      >
        查看全部
        <ExternalLink class="size-3" />
      </router-link>
    </div>

    <!-- 空态：无活动时显示可执行操作 -->
    <div
      v-if="items.length === 0"
      class="flex flex-1 flex-col items-center justify-center gap-3 py-10"
    >
      <Inbox class="text-surface-800/30 size-8" />
      <p class="text-surface-800/50 text-xs">暂无最近活动</p>
      <router-link
        to="/projects"
        class="bg-brand-600 hover:bg-brand-700 text-surface-0 rounded-md px-3 py-1.5 text-xs font-medium transition"
      >
        去新建项目
      </router-link>
    </div>

    <!-- 活动列表：高度受控，超出内部滚动 -->
    <ul v-else class="max-h-[320px] flex-1 space-y-1 overflow-y-auto pr-0.5">
      <li
        v-for="activity in items"
        :key="activity.id"
        class="hover:bg-surface-50 rounded-lg p-2 transition-colors duration-200"
      >
        <div class="flex items-start gap-2.5">
          <div
            class="flex size-8 shrink-0 items-center justify-center rounded-lg"
            :class="getActivityColor(activity.type)"
          >
            <component :is="activity.icon" class="size-4" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-start gap-1.5">
              <h3 class="text-surface-900 line-clamp-2 flex-1 text-[13px] font-medium leading-5">
                {{ activity.title }}
              </h3>
              <span
                class="shrink-0 rounded-full border px-1.5 py-px text-[10px] leading-4"
                :class="ACTIVITY_STATUS_CONFIG[activity.status].cls"
              >
                {{ ACTIVITY_STATUS_CONFIG[activity.status].label }}
              </span>
            </div>
            <p class="text-surface-800/70 mt-0.5 line-clamp-2 text-xs leading-5">
              {{ activity.description }}
            </p>

            <!-- 进行中：轻量进度条 -->
            <div
              v-if="activity.status === 'running' && activity.progress !== undefined"
              class="mt-1.5"
            >
              <div class="bg-surface-100 h-1 overflow-hidden rounded-full">
                <div
                  class="bg-brand-600 h-full rounded-full transition-[width] duration-300"
                  :style="{ width: `${progressWidth(activity)}%` }"
                />
              </div>
            </div>

            <!-- 失败：原因摘要（红色，不撑破布局） -->
            <p
              v-if="activity.status === 'failed' && activity.failureReason"
              class="text-red-600/80 mt-1 line-clamp-1 text-[11px]"
            >
              {{ activity.failureReason }}
            </p>

            <div class="text-surface-800/50 mt-0.5 flex items-center gap-1 text-[11px]">
              <Clock class="size-3" />
              {{ activity.timestamp }}
            </div>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>
