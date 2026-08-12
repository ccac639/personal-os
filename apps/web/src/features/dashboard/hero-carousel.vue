<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ChevronLeft, ChevronRight } from '@lucide/vue';
import DashboardStatsCards from './stats-cards.vue';
import DashboardRecentProjects from './recent-projects.vue';
import DashboardTechOverview from './tech-overview.vue';
import type { HomeMetric, ProjectItem } from './types';

/** 每张 slide 对应的切换动画类型（按顺序循环，可扩展） */
const SLIDE_ANIMS = ['fade', 'slide', 'zoom'] as const;
const SLIDE_COUNT = SLIDE_ANIMS.length;
const AUTOPLAY_MS = 5000;

interface Props {
  /** 指标数据覆盖（透传给统计卡片；未传则用统一 mock 源） */
  metrics?: HomeMetric[];
  /** 项目数据覆盖（透传开发中项目 slide） */
  projects?: ProjectItem[];
}

const props = withDefaults(defineProps<Props>(), {
  metrics: undefined,
  projects: undefined,
});

const current = ref(0);
const paused = ref(false);
const anim = ref<string>(SLIDE_ANIMS[0]);
const direction = ref(1); // 1 = 前进, -1 = 后退
let timer: ReturnType<typeof setInterval> | null = null;
let mq: MediaQueryList | null = null;
/** 统一引用，保证 add/removeEventListener 使用同一函数 */
function onMotionChange(e: MediaQueryListEvent) {
  applyMotionPreference(e.matches);
}

/** 无障碍：prefers-reduced-motion 时禁用自动轮播 */
const reduceMotion = ref(false);

function applyMotionPreference(matches: boolean) {
  reduceMotion.value = matches;
  if (matches && timer) {
    clearInterval(timer);
    timer = null;
  }
}

const wrap = (index: number) => (index + SLIDE_COUNT) % SLIDE_COUNT;

/** 数据数量变化后自动修正当前索引（防止索引越界） */
watch(
  () => [props.metrics?.length ?? 0, props.projects?.length ?? 0],
  () => {
    if (current.value >= SLIDE_COUNT) current.value = SLIDE_COUNT - 1;
    if (current.value < 0) current.value = 0;
  },
);

function setCurrent(index: number) {
  current.value = index;
  anim.value = SLIDE_ANIMS[index % SLIDE_ANIMS.length] ?? 'fade';
}

function next() {
  direction.value = 1;
  setCurrent(wrap(current.value + 1));
}

function prev() {
  direction.value = -1;
  setCurrent(wrap(current.value - 1));
}

function goTo(index: number) {
  if (index === current.value) return;
  direction.value = index > current.value ? 1 : -1;
  setCurrent(index);
}

/** 键盘操作：方向键切换（可聚焦时生效） */
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    next();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    prev();
  }
}

/** slide 动画按方向提供不同的进入/离开位移类 */
const enterFromCls = computed(() =>
  anim.value === 'slide' ? (direction.value > 0 ? 'slide-in-right' : 'slide-in-left') : undefined,
);

const leaveToCls = computed(() =>
  anim.value === 'slide' ? (direction.value > 0 ? 'slide-out-left' : 'slide-out-right') : undefined,
);

onMounted(() => {
  mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  applyMotionPreference(mq.matches);
  mq.addEventListener('change', onMotionChange);
  if (!reduceMotion.value) {
    timer = setInterval(() => {
      if (!paused.value) next();
    }, AUTOPLAY_MS);
  }
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  mq?.removeEventListener('change', onMotionChange);
});
</script>

<template>
  <section
    class="border-surface-100 bg-surface-0 relative overflow-hidden rounded-lg border"
    tabindex="0"
    role="region"
    aria-roledescription="轮播"
    aria-label="首页指标轮播"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
    @keydown="onKeydown"
  >
    <!-- Slides：每张 slide 使用各自的切换动画 -->
    <div class="relative h-64">
      <Transition
        mode="out-in"
        :name="anim"
        :enter-from-class="enterFromCls"
        :leave-to-class="leaveToCls"
      >
        <div :key="current" class="absolute inset-0 flex items-center p-6">
          <!-- Slide 1：统计卡片（fade 淡入淡出） -->
          <DashboardStatsCards v-if="current === 0" variant="left" />
          <!-- Slide 2：开发中项目（slide 水平滑动） -->
          <DashboardRecentProjects v-else-if="current === 1" :projects="projects" />
          <!-- Slide 3：核心技术栈（zoom 缩放） -->
          <DashboardTechOverview v-else />
        </div>
      </Transition>
    </div>

    <!-- 左右箭头：hover/focus/disabled 状态 -->
    <button
      type="button"
      aria-label="上一张"
      class="bg-surface-0/80 text-surface-800/70 ring-surface-100 hover:bg-surface-0 hover:text-surface-900 focus-visible:ring-brand-500/40 absolute top-1/2 left-3 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full shadow-sm ring-1 transition focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
      :disabled="current === 0"
      @click="prev"
    >
      <ChevronLeft class="size-5" />
    </button>
    <button
      type="button"
      aria-label="下一张"
      class="bg-surface-0/80 text-surface-800/70 ring-surface-100 hover:bg-surface-0 hover:text-surface-900 focus-visible:ring-brand-500/40 absolute top-1/2 right-3 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full shadow-sm ring-1 transition focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
      :disabled="current === SLIDE_COUNT - 1"
      @click="next"
    >
      <ChevronRight class="size-5" />
    </button>

    <!-- 圆点指示器：可点击切换 -->
    <div class="absolute inset-x-0 bottom-3 z-10 flex items-center justify-center gap-2">
      <button
        v-for="index in SLIDE_COUNT"
        :key="index"
        type="button"
        :aria-label="`切换到第 ${index} 张`"
        :aria-current="current === index - 1 ? 'true' : undefined"
        class="h-2 rounded-full transition-all focus-visible:ring-brand-500/40 focus-visible:ring-2 focus-visible:outline-none"
        :class="
          current === index - 1
            ? 'bg-brand-600 w-6'
            : 'bg-surface-800/25 hover:bg-surface-800/40 w-2'
        "
        @click="goTo(index - 1)"
      />
    </div>
  </section>
</template>

<style scoped>
/* ---------- 动画 1：fade 淡入淡出 ---------- */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ---------- 动画 2：slide 水平滑动（方向感知） ---------- */
.slide-enter-active,
.slide-leave-active {
  transition:
    transform 0.55s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.55s ease;
}
.slide-in-right {
  transform: translateX(100%);
  opacity: 0;
}
.slide-in-left {
  transform: translateX(-100%);
  opacity: 0;
}
.slide-out-left {
  transform: translateX(-100%);
  opacity: 0;
}
.slide-out-right {
  transform: translateX(100%);
  opacity: 0;
}

/* ---------- 动画 3：zoom 缩放 ---------- */
.zoom-enter-active,
.zoom-leave-active {
  transition:
    transform 0.55s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.55s ease;
}
.zoom-enter-from {
  transform: scale(0.8);
  opacity: 0;
}
.zoom-leave-to {
  transform: scale(1.1);
  opacity: 0;
}
</style>
