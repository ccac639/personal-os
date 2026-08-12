<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ChevronLeft, ChevronRight } from '@lucide/vue';
import DashboardStatsCards from './stats-cards.vue';
import DashboardRecentProjects from './recent-projects.vue';
import DashboardTechOverview from './tech-overview.vue';

/** 每张 slide 对应的切换动画类型（按顺序循环，可扩展） */
const SLIDE_ANIMS = ['fade', 'slide', 'zoom'] as const;
const SLIDE_COUNT = SLIDE_ANIMS.length;
const AUTOPLAY_MS = 5000;

const current = ref(0);
const paused = ref(false);
const anim = ref<string>(SLIDE_ANIMS[0]);
const direction = ref(1); // 1 = 前进, -1 = 后退
let timer: ReturnType<typeof setInterval> | null = null;

const wrap = (index: number) => (index + SLIDE_COUNT) % SLIDE_COUNT;

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

/** slide 动画按方向提供不同的进入/离开位移类 */
const enterFromCls = computed(() =>
  anim.value === 'slide' ? (direction.value > 0 ? 'slide-in-right' : 'slide-in-left') : undefined,
);

const leaveToCls = computed(() =>
  anim.value === 'slide' ? (direction.value > 0 ? 'slide-out-left' : 'slide-out-right') : undefined,
);

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
    class="border-surface-100 bg-surface-0 relative overflow-hidden rounded-lg border"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
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
          <DashboardRecentProjects v-else-if="current === 1" />
          <!-- Slide 3：核心技术栈（zoom 缩放） -->
          <DashboardTechOverview v-else />
        </div>
      </Transition>
    </div>

    <!-- 左右箭头 -->
    <button
      type="button"
      aria-label="上一张"
      class="bg-surface-0/80 text-surface-800/70 ring-surface-100 hover:bg-surface-0 hover:text-surface-900 absolute top-1/2 left-3 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full shadow-sm ring-1 transition"
      @click="prev"
    >
      <ChevronLeft class="size-5" />
    </button>
    <button
      type="button"
      aria-label="下一张"
      class="bg-surface-0/80 text-surface-800/70 ring-surface-100 hover:bg-surface-0 hover:text-surface-900 absolute top-1/2 right-3 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full shadow-sm ring-1 transition"
      @click="next"
    >
      <ChevronRight class="size-5" />
    </button>

    <!-- 圆点指示器 -->
    <div class="absolute inset-x-0 bottom-3 z-10 flex items-center justify-center gap-2">
      <button
        v-for="index in SLIDE_COUNT"
        :key="index"
        type="button"
        :aria-label="`切换到第 ${index} 张`"
        class="h-2 rounded-full transition-all"
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
