<script setup lang="ts">
import { motion, AnimatePresence, LayoutGroup } from 'motion-v';
import { useRoute } from 'vue-router';
import { onBeforeUnmount, ref, watch } from 'vue';
import PagePet from '@/components/PagePet.vue';
import {
  PAGE_TRANSITION,
  forceHideTransitionOverlay,
  getRouteTransition,
  hideTransitionOverlay,
  showTransitionOverlay,
  usePageTransition,
} from '@/composables/use-page-transition';

const route = useRoute();

interface Ripple {
  id: number;
  x: number;
  y: number;
}

/** 点击涟漪：每个导航项独立维护自己的涟漪列表，元素挂载时自动播放扩散动画 */
const ripplesByNav = ref<Record<string, Ripple[]>>({});
let rippleSeq = 0;

function addRipple(to: string, e: MouseEvent) {
  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  const id = ++rippleSeq;
  const list = ripplesByNav.value[to] ?? [];
  ripplesByNav.value = {
    ...ripplesByNav.value,
    [to]: [...list, { id, x: e.clientX - rect.left, y: e.clientY - rect.top }],
  };
  window.setTimeout(() => {
    ripplesByNav.value = {
      ...ripplesByNav.value,
      [to]: (ripplesByNav.value[to] ?? []).filter((r) => r.id !== id),
    };
  }, 700);
}

interface NavItem {
  label: string;
  to: string;
}

const navItems: NavItem[] = [
  { label: '首页', to: '/' },
  { label: 'Chat', to: '/chat' },
  { label: '工作流', to: '/workflows' },
  { label: '开发中', to: '/projects' },
  { label: '已完成', to: '/achievements' },
  { label: '管理系统', to: '/admin' },
];

/** 激活判定：/ 精确匹配；其余前缀匹配（子路由仍高亮父级） */
function isActive(to: string): boolean {
  if (to === '/') return route.path === '/';
  return route.path === to || route.path.startsWith(`${to}/`);
}

const brandLetters = 'Personal OS'.split('');

/** 页面过渡层状态（模块级单例，路由失败时也能被 router.onError 清理） */
const { isTransitioning, transitionMeta } = usePageTransition();

/**
 * KeepAlive 白名单：需要跨路由保留状态 / 滚动位置的页面组件名。
 * 启用方式：页面内 defineOptions({ name: 'xxx' }) + 把 'xxx' 加入此数组。
 * 默认空数组 = 不缓存任何页面，行为与不加 KeepAlive 完全一致（不改变页面业务逻辑）。
 */
const keepAlivePages: string[] = [];

/** 记录来源页标题：路由确认时把「上一路由」的标题暂存，供过渡遮罩状态文本使用 */
const prevRouteTitle = ref<string | undefined>(undefined);
watch(
  () => route.meta.title,
  (to, from) => {
    prevRouteTitle.value = typeof from === 'string' ? from : undefined;
  },
);

/** 旧页面离场完成：显示系统切换遮罩（携带来源/目标页标题） */
function onTransitionAfterLeave() {
  showTransitionOverlay({
    fromTitle: prevRouteTitle.value,
    toTitle: typeof route.meta.title === 'string' ? route.meta.title : undefined,
  });
}

/** 新页面入场完成：延迟隐藏遮罩，让扫描线动画完整收尾 */
function onTransitionAfterEnter() {
  hideTransitionOverlay(PAGE_TRANSITION.HIDE_DELAY_MS);
}

/** 布局卸载（应用退出）时兜底清理过渡层定时器 */
onBeforeUnmount(() => {
  forceHideTransitionOverlay();
});
</script>

<template>
  <div class="bg-page text-surface-900 flex h-screen flex-col overflow-hidden">
    <motion.header
      :initial="{ opacity: 0, y: -18 }"
      :animate="{ opacity: 1, y: 0 }"
      :transition="{ type: 'spring', stiffness: 180, damping: 20 }"
      class="border-surface-100 bg-surface-0/85 z-40 shrink-0 border-b backdrop-blur"
    >
      <div class="mx-auto grid h-14 max-w-7xl grid-cols-[auto_1fr_auto] items-center px-4">
        <!-- 品牌区：字母逐字弹性入场（仅首屏，transform 动画零布局开销） -->
        <RouterLink
          to="/"
          class="text-surface-900 shrink-0 text-lg font-bold tracking-tight"
          aria-label="Personal OS"
        >
          <span class="inline-flex overflow-hidden">
            <motion.span
              v-for="(letter, i) in brandLetters"
              :key="i"
              :initial="{ opacity: 0, y: -18, rotate: -12 }"
              :animate="{ opacity: 1, y: 0, rotate: 0 }"
              :transition="{
                type: 'spring',
                stiffness: 280,
                damping: 16,
                delay: 0.05 + i * 0.04,
              }"
              :style="{
                display: 'inline-block',
                minWidth: letter === ' ' ? '0.35em' : undefined,
              }"
              :while-hover="{ y: -3, rotate: -6 }"
              class="cursor-pointer"
            >
              {{ letter === ' ' ? '\u00A0' : letter }}
            </motion.span>
          </span>
        </RouterLink>

        <!-- 主导航：layoutId 共享下划线（FLIP 算法，仅 transform，跨元素丝滑滑动） -->
        <LayoutGroup>
          <nav class="flex h-full items-center justify-center gap-5">
            <RouterLink
              v-for="(item, i) in navItems"
              :key="item.to"
              v-slot="{ href, navigate }"
              :to="item.to"
              custom
            >
              <motion.a
                :href="href"
                class="focus-visible:ring-brand-500/40 relative flex h-full items-center rounded-md px-1 text-sm focus-visible:ring-2 focus-visible:outline-none"
                :class="
                  isActive(item.to)
                    ? 'text-surface-900 font-medium'
                    : 'text-surface-800/70 hover:text-surface-900'
                "
                :initial="{ opacity: 0, y: -8 }"
                :animate="{ opacity: 1, y: 0 }"
                :transition="{
                  default: { type: 'spring', stiffness: 420, damping: 22 },
                  opacity: { duration: 0.35, ease: 'easeOut', delay: 0.16 + i * 0.05 },
                  y: { type: 'spring', stiffness: 260, damping: 22, delay: 0.16 + i * 0.05 },
                }"
                :while-hover="{
                  scale: 1.08,
                  y: -1,
                  transition: { type: 'spring', stiffness: 420, damping: 22, delay: 0 },
                }"
                :while-tap="{
                  scale: 0.88,
                  y: 2,
                  transition: { type: 'spring', stiffness: 520, damping: 18, delay: 0 },
                }"
                @click="
                  (e: MouseEvent) => {
                    addRipple(item.to, e);
                    navigate(e);
                  }
                "
              >
                <!-- hover 光晕 pill：仅 transform/opacity，GPU 合成零布局开销 -->
                <motion.span
                  class="bg-surface-100/90 absolute inset-x-0 h-[68%] rounded-full"
                  :style="{ top: '50%' }"
                  :initial="{ opacity: 0, scale: 0.7, y: '-50%' }"
                  :while-hover="{ opacity: 1, scale: 1, y: '-50%' }"
                  :transition="{ type: 'spring', stiffness: 380, damping: 24 }"
                />
                <span class="relative z-10">{{ item.label }}</span>
                <AnimatePresence>
                  <motion.span
                    v-if="isActive(item.to)"
                    :key="'underline-' + item.to"
                    layout-id="nav-underline"
                    class="bg-surface-900 absolute inset-x-0 bottom-2 z-10 h-0.5"
                    :transition="{ type: 'spring', stiffness: 380, damping: 30 }"
                  />
                </AnimatePresence>
                <!-- 点击涟漪：从鼠标位置扩散，一次性，transform/opacity 零布局开销 -->
                <motion.span
                  v-for="r in ripplesByNav[item.to] ?? []"
                  :key="r.id"
                  class="bg-surface-900/15 pointer-events-none absolute h-10 w-10 rounded-full"
                  :style="{ left: r.x - 20 + 'px', top: r.y - 20 + 'px' }"
                  :initial="{ opacity: 0.55, scale: 0 }"
                  :animate="{ opacity: 0, scale: 2.4 }"
                  :transition="{ duration: 0.55, ease: 'easeOut' }"
                />
              </motion.a>
            </RouterLink>
          </nav>
        </LayoutGroup>

        <!-- 设置幽灵按钮：hover 弹性放大，按压回弹 -->
        <div class="flex items-center justify-self-end">
          <RouterLink v-slot="{ href, navigate }" to="/settings" custom>
            <motion.a
              :href="href"
              class="border-surface-100 text-surface-800/70 focus-visible:ring-brand-500/40 rounded-md border px-3 py-1 text-[13px] focus-visible:ring-2 focus-visible:outline-none"
              :class="{
                'border-surface-800/40 text-surface-900': route.path === '/settings',
              }"
              :initial="{ opacity: 0, x: 8 }"
              :animate="{ opacity: 1, x: 0 }"
              :transition="{
                default: { type: 'spring', stiffness: 500, damping: 18 },
                opacity: { duration: 0.35, ease: 'easeOut', delay: 0.52 },
                x: { duration: 0.35, ease: 'easeOut', delay: 0.52 },
              }"
              :while-hover="{ scale: 1.08 }"
              :while-tap="{ scale: 0.88 }"
              @click="navigate"
            >
              设置
            </motion.a>
          </RouterLink>
        </div>
      </div>
    </motion.header>

    <!-- 页面切换：统一路由过渡系统（旧页淡出缩小 → 扫描线 → 新页从中心展开） -->
    <main class="relative flex-1 overflow-x-hidden overflow-y-clip">
      <RouterView v-slot="{ Component, route: viewRoute }">
        <Transition
          :name="getRouteTransition(viewRoute)"
          mode="out-in"
          appear
          @after-leave="onTransitionAfterLeave"
          @after-enter="onTransitionAfterEnter"
        >
          <KeepAlive :include="keepAlivePages">
            <component :is="Component" :key="viewRoute.fullPath" />
          </KeepAlive>
        </Transition>
      </RouterView>
    </main>

    <!-- 全局页面过渡层：仅路由切换期间出现；fixed 全视口 + pointer-events 穿透，
         z-index 低于项目弹窗层，不遮挡任何可操作 UI；新页面入场后由 v-if 彻底销毁 -->
    <div v-if="isTransitioning" class="page-transition-overlay" aria-hidden="true">
      <div class="page-transition-grid"></div>
      <div class="page-transition-scanline"></div>
      <div class="page-transition-beam"></div>
      <div class="page-transition-rings"><span></span><span></span></div>
      <div class="page-transition-hex page-transition-hex--left"></div>
      <div class="page-transition-hex page-transition-hex--right"></div>
      <div v-if="transitionMeta.toTitle" class="page-transition-status">
        切换至 {{ transitionMeta.toTitle }}
      </div>
      <div class="page-transition-progress">
        <div class="page-transition-progress-bar"></div>
      </div>
      <div class="page-transition-noise"></div>
    </div>

    <!-- 全局页面宠物：所有页面可见，点击换肤 -->
    <PagePet />
  </div>
</template>
