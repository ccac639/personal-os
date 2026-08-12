<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  GitCommit,
  Layers,
  Palette,
  Rocket,
  Workflow,
} from '@lucide/vue';
import type { ActivityItem } from './types';

/** 真实近期开发动态（对应 git log 2026-08-12，每页 3 条） */
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
  {
    id: '5',
    type: 'commit',
    title: '最近活动模块优化',
    description: '真实数据 + 进度条 + 手动切换',
    timestamp: '4 小时前',
    icon: Layers,
  },
  {
    id: '6',
    type: 'project',
    title: 'Dashboard 轮播布局',
    description: '统计卡/项目/技术栈三种动画切换',
    timestamp: '昨天',
    icon: Layers,
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

/** 每屏 3 条内容块 */
const PAGE_SIZE = 3;
const ANIMS = ['fade', 'slide-up', 'zoom', 'flip'] as const;

const pages = computed(() => {
  const result: ActivityItem[][] = [];
  for (let i = 0; i < activities.length; i += PAGE_SIZE) {
    result.push(activities.slice(i, i + PAGE_SIZE));
  }
  return result;
});

const PAGE_COUNT = computed(() => pages.value.length);
const AUTOPLAY_MS = 5000;
/** 进度更新 tick（单一时钟，消除 CSS 动画与定时器双时钟偏差） */
const TICK_MS = 50;

const current = ref(0);
const paused = ref(false);
/** 当前页进度 0-100（显式状态，由 JS 驱动） */
const progress = ref(0);
/** 当前页开始时刻（performance.now） */
let pageStartAt = 0;
/** hover 暂停时冻结的已过毫秒数 */
let elapsedAtPause = 0;
let ticker: ReturnType<typeof setInterval> | null = null;

const animName = computed(() => ANIMS[current.value % ANIMS.length] ?? 'fade');
const currentPage = computed(() => pages.value[current.value] ?? []);

/** 重置进度：换页/手动切换后从 0 开始（暂停中则同步冻结基点） */
function resetProgress() {
  pageStartAt = performance.now();
  progress.value = 0;
  if (paused.value) elapsedAtPause = 0;
}

function next() {
  current.value = (current.value + 1) % PAGE_COUNT.value;
  resetProgress();
}

function prev() {
  current.value = (current.value - 1 + PAGE_COUNT.value) % PAGE_COUNT.value;
  resetProgress();
}

function goTo(index: number) {
  current.value = index;
  resetProgress();
}

/** 悬停暂停：冻结当前进度位置 */
function onPause() {
  if (paused.value) return;
  paused.value = true;
  elapsedAtPause = Math.min(performance.now() - pageStartAt, AUTOPLAY_MS);
}

/** 离开恢复：从冻结位置继续（调整起点使剩余时长 = AUTOPLAY_MS - 已过时长） */
function onResume() {
  if (!paused.value) return;
  paused.value = false;
  pageStartAt = performance.now() - elapsedAtPause;
}

onMounted(() => {
  resetProgress();
  ticker = setInterval(() => {
    if (paused.value) return;
    const elapsed = performance.now() - pageStartAt;
    if (elapsed >= AUTOPLAY_MS) {
      // 到点立即换页并归零，进度条不会停在 100%
      next();
      return;
    }
    progress.value = (elapsed / AUTOPLAY_MS) * 100;
  }, TICK_MS);
});

onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker);
});
</script>

<template>
  <section
    class="border-surface-100 bg-surface-0 group flex flex-col rounded-lg border p-5"
    @mouseenter="onPause"
    @mouseleave="onResume"
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
        {{ current + 1 }} / {{ PAGE_COUNT }}
      </span>
    </div>

    <!-- 自动播放进度条（JS 驱动，暂停时冻结在真实位置） -->
    <div class="bg-surface-100 mb-3 h-0.5 overflow-hidden rounded-full">
      <div
        class="bg-brand-600 h-full rounded-full transition-[width] duration-75 ease-linear"
        :style="{ width: `${progress}%` }"
      />
    </div>

    <!-- 轮播区：每屏 3 条内容块 -->
    <div class="relative flex-1">
      <Transition :name="animName" mode="out-in">
        <div :key="current" class="space-y-1">
          <div
            v-for="activity in currentPage"
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
                <div class="flex items-center gap-1.5">
                  <h3 class="text-surface-900 truncate text-[13px] font-medium">
                    {{ activity.title }}
                  </h3>
                  <span
                    class="shrink-0 rounded-full border px-1.5 py-px text-[10px] leading-4"
                    :class="getBadgeColor(activity.type)"
                  >
                    {{ TYPE_LABELS[activity.type] ?? activity.type }}
                  </span>
                </div>
                <p class="text-surface-800/70 mt-0.5 line-clamp-1 text-xs leading-5">
                  {{ activity.description }}
                </p>
                <div class="text-surface-800/50 mt-0.5 flex items-center gap-1 text-[11px]">
                  <Clock class="size-3" />
                  {{ activity.timestamp }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </div>

    <!-- 底部：箭头 + 圆点 -->
    <div class="mt-2 flex items-center justify-between">
      <div class="flex items-center gap-1">
        <button
          type="button"
          aria-label="上一页"
          class="text-surface-800/50 hover:bg-surface-100 hover:text-surface-900 rounded-md p-1 transition"
          @click="prev"
        >
          <ChevronLeft class="size-4" />
        </button>
        <button
          type="button"
          aria-label="下一页"
          class="text-surface-800/50 hover:bg-surface-100 hover:text-surface-900 rounded-md p-1 transition"
          @click="next"
        >
          <ChevronRight class="size-4" />
        </button>
      </div>

      <div class="flex items-center gap-1.5">
        <button
          v-for="(_, index) in PAGE_COUNT"
          :key="index"
          type="button"
          :aria-label="`切换到第 ${index + 1} 页`"
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
