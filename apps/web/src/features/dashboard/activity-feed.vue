<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  GitCommit,
  Palette,
  Rocket,
  Workflow,
} from '@lucide/vue';
import type { ActivityItem } from './types';

/** 真实近期开发动态（对应 git log 2026-08-12） */
const activities: ActivityItem[] = [
  {
    id: '1',
    type: 'commit',
    title: '同步 GitHub 每周趋势卡片',
    description: 'AI 搜索抓取 Trending Top10，替换 Git 仓库卡片',
    timestamp: '25 分钟前',
    icon: GitCommit,
  },
  {
    id: '2',
    type: 'workflow',
    title: '首页深度优化完成',
    description: '统计卡趋势图、工作流状态卡、氛围光斑',
    timestamp: '1 小时前',
    icon: Rocket,
  },
  {
    id: '3',
    type: 'project',
    title: '主题全局化换肤',
    description: '8 套背景独立配色，所有页面联动',
    timestamp: '2 小时前',
    icon: Palette,
  },
  {
    id: '4',
    type: 'system',
    title: '页面宠物升级',
    description: '支持拖拽 + 位置持久化 + 左右分栏面板',
    timestamp: '3 小时前',
    icon: Workflow,
  },
];

const TYPE_LABELS: Record<string, string> = {
  commit: '提交',
  project: '项目',
  workflow: '工作流',
  system: '系统',
};

function getActivityColor(type: string) {
  const colors = {
    commit: 'text-blue-600 bg-blue-500/10',
    project: 'text-green-600 bg-green-500/10',
    workflow: 'text-purple-600 bg-purple-500/10',
    system: 'text-surface-800/60 bg-surface-100',
  };
  return colors[type as keyof typeof colors] || 'text-surface-800/60 bg-surface-100';
}

function getBadgeColor(type: string) {
  const colors = {
    commit: 'text-blue-600 bg-blue-500/10 border-blue-500/20',
    project: 'text-green-600 bg-green-500/10 border-green-500/20',
    workflow: 'text-purple-600 bg-purple-500/10 border-purple-500/20',
    system: 'text-surface-800/60 bg-surface-100 border-surface-800/10',
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
const currentType = computed(() => currentActivity.value.type);

function next() {
  current.value = (current.value + 1) % SLIDE_COUNT;
}

function prev() {
  current.value = (current.value - 1 + SLIDE_COUNT) % SLIDE_COUNT;
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
    class="border-surface-100 bg-surface-0 group flex flex-col rounded-lg border p-5"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
  >
    <!-- 头部：标题 + 实时状态 -->
    <div class="mb-3 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <h2 class="text-surface-900 text-base font-semibold">最近活动</h2>
        <span class="flex items-center gap-1 text-[10px] text-green-600">
          <span class="relative flex size-1.5">
            <span
              class="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60"
            />
            <span class="relative inline-flex size-1.5 rounded-full bg-green-500" />
          </span>
          实时
        </span>
      </div>
      <span class="text-surface-800/50 text-xs tabular-nums">
        {{ current + 1 }} / {{ SLIDE_COUNT }}
      </span>
    </div>

    <!-- 自动播放进度条 -->
    <div class="bg-surface-100 mb-4 h-0.5 overflow-hidden rounded-full">
      <div
        :key="`progress-${current}`"
        class="bg-brand-600 h-full rounded-full"
        :class="paused ? 'progress-paused' : 'progress-running'"
      />
    </div>

    <!-- 轮播区：每次显示一条活动 -->
    <div class="relative min-h-[7.5rem] flex-1">
      <Transition :name="animName" mode="out-in">
        <div :key="current" class="flex items-center px-1">
          <div class="flex w-full items-start gap-3">
            <div
              class="flex size-10 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-105"
              :class="getActivityColor(currentActivity.type)"
            >
              <component :is="currentActivity.icon" class="size-5" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <h3 class="text-surface-900 truncate text-sm font-medium">
                  {{ currentActivity.title }}
                </h3>
                <span
                  class="shrink-0 rounded-full border px-1.5 py-px text-[10px] leading-4"
                  :class="getBadgeColor(currentType)"
                >
                  {{ TYPE_LABELS[currentType] ?? currentType }}
                </span>
              </div>
              <p class="text-surface-800/70 mt-1 line-clamp-2 text-xs leading-5">
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

    <!-- 底部：箭头 + 圆点 -->
    <div class="mt-3 flex items-center justify-between">
      <div class="flex items-center gap-1">
        <button
          type="button"
          aria-label="上一条"
          class="text-surface-800/50 hover:bg-surface-100 hover:text-surface-900 rounded-md p-1 transition"
          @click="prev"
        >
          <ChevronLeft class="size-4" />
        </button>
        <button
          type="button"
          aria-label="下一条"
          class="text-surface-800/50 hover:bg-surface-100 hover:text-surface-900 rounded-md p-1 transition"
          @click="next"
        >
          <ChevronRight class="size-4" />
        </button>
      </div>

      <div class="flex items-center gap-1.5">
        <button
          v-for="(activity, index) in activities"
          :key="activity.id"
          type="button"
          :aria-label="`切换到第 ${index + 1} 条活动`"
          class="h-1.5 rounded-full transition-all duration-300"
          :class="
            index === current
              ? 'bg-brand-600 w-5'
              : 'bg-surface-800/25 hover:bg-surface-800/40 w-1.5'
          "
          @click="goTo(index)"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 自动播放进度条 */
.progress-running {
  animation: progress-fill 4s linear forwards;
}
.progress-paused {
  animation-play-state: paused;
}
@keyframes progress-fill {
  from {
    width: 0%;
  }
  to {
    width: 100%;
  }
}

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
