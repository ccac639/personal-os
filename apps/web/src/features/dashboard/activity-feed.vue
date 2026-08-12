<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { CheckCircle, Clock, GitCommit, Workflow } from '@lucide/vue';
import type { ActivityItem } from './types';

const activities: ActivityItem[] = [
  {
    id: '1',
    type: 'commit',
    title: '完成 Dashboard 组件开发',
    description: '新增统计卡片、快速操作、最近项目等核心组件',
    timestamp: '2 分钟前',
    icon: GitCommit,
  },
  {
    id: '2',
    type: 'project',
    title: 'Personal OS 项目进度更新',
    description: '前端框架搭建完成，进入功能开发阶段',
    timestamp: '1 小时前',
    icon: CheckCircle,
  },
  {
    id: '3',
    type: 'workflow',
    title: '创建新的工作流模板',
    description: 'AI Agent 任务编排工作流已就绪',
    timestamp: '3 小时前',
    icon: Workflow,
  },
  {
    id: '4',
    type: 'system',
    title: '开发环境状态检查',
    description: '所有服务运行正常：Web、Blog、API、Worker',
    timestamp: '5 小时前',
    icon: CheckCircle,
  },
];

function getActivityColor(type: string) {
  const colors = {
    commit: 'text-blue-600 bg-blue-500/10',
    project: 'text-green-600 bg-green-500/10',
    workflow: 'text-purple-600 bg-purple-500/10',
    system: 'text-surface-800/60 bg-surface-100',
  };
  return colors[type as keyof typeof colors] || 'text-surface-800/60 bg-surface-100';
}

/** 每个 slide 使用不同的切换动画，按索引循环分配 */
const ANIMS = ['fade', 'slide-up', 'zoom', 'flip'] as const;

const SLIDE_COUNT = activities.length;
const AUTOPLAY_MS = 4000;

const current = ref(0);
const paused = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

const animName = computed(() => ANIMS[current.value % ANIMS.length] ?? 'fade');
const currentActivity = computed(() => activities[current.value]!);

function next() {
  current.value = (current.value + 1) % SLIDE_COUNT;
}

function goTo(index: number) {
  current.value = index;
}

onMounted(() => {
  timer = setInterval(() => {
    if (!paused.value) next();
  }, AUTOPLAY_MS);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <section
    class="border-surface-100 bg-surface-0 rounded-lg border p-6"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
  >
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-surface-900 text-lg font-semibold">最近活动</h2>
      <span class="text-surface-800/50 text-xs tabular-nums">
        {{ current + 1 }} / {{ SLIDE_COUNT }}
      </span>
    </div>

    <!-- 轮播区：每次显示一条活动 -->
    <div class="relative overflow-hidden rounded-lg">
      <Transition :name="animName" mode="out-in">
        <div :key="current" class="flex h-40 items-center px-1">
          <div class="flex w-full items-start gap-3">
            <div
              class="flex size-10 shrink-0 items-center justify-center rounded-lg"
              :class="getActivityColor(currentActivity.type)"
            >
              <component :is="currentActivity.icon" class="size-5" />
            </div>
            <div class="min-w-0 flex-1">
              <h3 class="text-surface-900 text-sm font-medium">
                {{ currentActivity.title }}
              </h3>
              <p class="text-surface-800/70 mt-0.5 line-clamp-2 text-xs">
                {{ currentActivity.description }}
              </p>
              <div class="text-surface-800/60 mt-1.5 flex items-center gap-1 text-xs">
                <Clock class="size-3" />
                {{ currentActivity.timestamp }}
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </div>

    <!-- 圆点指示器 -->
    <div class="mt-3 flex items-center justify-center gap-1.5">
      <button
        v-for="(activity, index) in activities"
        :key="activity.id"
        type="button"
        :aria-label="`切换到第 ${index + 1} 条活动`"
        class="h-1.5 rounded-full transition-all duration-300"
        :class="
          index === current
            ? 'bg-surface-900 w-5'
            : 'bg-surface-800/25 hover:bg-surface-800/40 w-1.5'
        "
        @click="goTo(index)"
      />
    </div>
  </section>
</template>

<style scoped>
/* 动画 1：fade 淡入淡出 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 动画 2：slide-up 上滑进入 */
.slide-up-enter-active,
.slide-up-leave-active {
  transition:
    opacity 0.45s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
}
.slide-up-enter-from {
  opacity: 0;
  transform: translateY(24px);
}
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(-24px);
}

/* 动画 3：zoom 缩放进入 */
.zoom-enter-active,
.zoom-leave-active {
  transition:
    opacity 0.45s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
}
.zoom-enter-from {
  opacity: 0;
  transform: scale(0.85);
}
.zoom-leave-to {
  opacity: 0;
  transform: scale(1.08);
}

/* 动画 4：flip 3D 翻转 */
.flip-enter-active,
.flip-leave-active {
  transition:
    opacity 0.5s ease,
    transform 0.5s ease;
  transform-style: preserve-3d;
}
.flip-enter-from {
  opacity: 0;
  transform: rotateY(90deg);
}
.flip-leave-to {
  opacity: 0;
  transform: rotateY(-90deg);
}
</style>
