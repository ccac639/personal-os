<script setup lang="ts">
/**
 * 应用壳层默认布局。
 *
 * 职责：
 * - 统一页面容器：<main> 同时是过渡动画目标（features/page-transition）与
 *   焦点管理目标，业务页面经 RouterView 渲染；
 * - 顶部区域：品牌 + 桌面导航（md+）+ 设置入口 + 移动端抽屉按钮；
 * - 移动端导航：AppDrawer（<768px），含焦点圈定 / Escape / 焦点归还；
 * - 按需预取：hover / focus 导航项时预取目标路由模块（不一次加载全部页面）；
 * - 无障碍：跳转链接、aria-current、键盘焦点统一；
 * - 性能：无 backdrop-filter / 无常驻动画 / 无营销式入场动效，
 *   页面转场完全交给 features/page-transition 状态机。
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Menu, ServerCog } from '@lucide/vue';
import type { Component } from 'vue';

import AppDrawer from '@/components/AppDrawer.vue';
import AppErrorBoundary from '@/components/AppErrorBoundary.vue';
import PagePet from '@/components/PagePet.vue';
import { useMediaQuery } from '@/app/use-media-query';
import { notifyPageMounted, prefetchRoute, registerContentEl } from '@/features/page-transition';

const route = useRoute();
const router = useRouter();

/** 页面过渡动画目标：<main> 容器（离场/入场动画与焦点管理共用） */
const mainEl = ref<HTMLElement | null>(null);
const menuBtnEl = ref<HTMLElement | null>(null);

onMounted(() => registerContentEl(mainEl.value));
onBeforeUnmount(() => registerContentEl(null));

/** 桌面断点（md = 768px）；jsdom / 不支持 matchMedia 时视为桌面，避免误开抽屉 */
const isDesktop = useMediaQuery('(min-width: 768px)', { defaultValue: true });

const drawerOpen = ref(false);
/** 路由级错误边界重试：key bump 重建 RouterView 子树 */
const routeBoundaryKey = ref(0);
function bumpRouteBoundary(): void {
  routeBoundaryKey.value += 1;
}

function openDrawer(): void {
  drawerOpen.value = true;
}

/** 关闭抽屉（Escape / 遮罩 / 关闭按钮）：焦点归还汉堡按钮 */
function closeDrawer(): void {
  drawerOpen.value = false;
  void nextTick(() => menuBtnEl.value?.focus());
}

// 抽屉内导航触发路由变化：关闭抽屉，焦点交给过渡状态机（不抢焦点）
watch(
  () => route.fullPath,
  () => {
    if (drawerOpen.value) drawerOpen.value = false;
  },
);

// 视口回到桌面：关闭抽屉（监听随组件卸载清理）
watch(isDesktop, (desktop) => {
  if (desktop) drawerOpen.value = false;
});

function focusMain(): void {
  mainEl.value?.focus({ preventScroll: true });
}

interface NavItem {
  label: string;
  to: string;
  /** 可选图标（@lucide/vue 组件） */
  icon?: Component;
}

const navItems: NavItem[] = [
  { label: '首页', to: '/' },
  { label: 'Chat', to: '/chat' },
  { label: '工作流', to: '/workflows' },
  { label: '开发中', to: '/projects' },
  { label: 'AI 工作台', to: '/ai' },
  { label: '已完成', to: '/achievements' },
  { label: 'Sub2API', to: '/sub2api', icon: ServerCog },
  { label: '管理系统', to: '/admin' },
];

/** 激活判定：/ 精确匹配；其余前缀匹配（子路由仍高亮父级） */
function isActive(to: string): boolean {
  if (to === '/') return route.path === '/';
  return route.path === to || route.path.startsWith(`${to}/`);
}

/** hover / focus 导航项时按需预取目标页面模块（不预加载所有大页面） */
function prefetch(to: string): void {
  prefetchRoute(router, to);
}

/**
 * 注：本项目刻意不使用 KeepAlive 缓存路由页面（见旧模板注释）。
 * 页面切换由 features/page-transition 状态机驱动（离场 → 就绪等待 → 入场）。
 */
</script>

<template>
  <div class="bg-page text-surface-900 flex h-screen flex-col overflow-hidden">
    <!-- 无障碍：跳转主内容（键盘用户首个 Tab 目标） -->
    <a href="#main-content" class="app-skip-link" @click.prevent="focusMain">跳到主内容</a>

    <header class="border-surface-100 bg-surface-0 z-40 shrink-0 border-b">
      <div class="mx-auto grid h-14 max-w-7xl grid-cols-[auto_1fr_auto] items-center px-4">
        <!-- 品牌区：纯文本，不参与动画 -->
        <RouterLink
          to="/"
          class="text-surface-900 shrink-0 text-lg font-bold tracking-tight"
          aria-label="Personal OS"
        >
          Personal OS
        </RouterLink>

        <!-- 桌面主导航（md+；移动端由抽屉接管） -->
        <nav class="hidden h-full items-center justify-center gap-1 md:flex" aria-label="主导航">
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="focus-visible:ring-brand-500/40 relative flex h-full items-center rounded-md px-2.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
            :class="
              isActive(item.to)
                ? 'text-surface-900 font-medium'
                : 'text-surface-800/70 hover:text-surface-900'
            "
            :aria-current="isActive(item.to) ? 'page' : undefined"
            @mouseenter="prefetch(item.to)"
            @focusin="prefetch(item.to)"
          >
            <span v-if="item.icon" class="mr-1.5 inline-flex -translate-y-px">
              <component :is="item.icon" class="size-4" aria-hidden="true" />
            </span>
            {{ item.label }}
            <span
              class="bg-surface-900 absolute inset-x-2 bottom-1 h-0.5 rounded-full transition-opacity"
              :class="isActive(item.to) ? 'opacity-100' : 'opacity-0'"
              aria-hidden="true"
            />
          </RouterLink>
        </nav>

        <!-- 右侧：设置（md+）+ 移动端抽屉按钮 -->
        <div class="flex items-center gap-1 justify-self-end">
          <RouterLink v-slot="{ href, navigate }" to="/settings" custom>
            <a
              :href="href"
              class="border-surface-100 text-surface-800/70 focus-visible:ring-brand-500/40 hidden rounded-md border px-3 py-1 text-[13px] focus-visible:ring-2 focus-visible:outline-none md:inline-flex"
              :class="{
                'border-surface-800/40 text-surface-900': route.path === '/settings',
              }"
              @click="navigate"
            >
              设置
            </a>
          </RouterLink>
          <button
            v-if="!isDesktop"
            ref="menuBtnEl"
            type="button"
            class="app-menu-btn"
            aria-label="打开导航菜单"
            aria-haspopup="dialog"
            :aria-expanded="drawerOpen"
            @click="openDrawer"
          >
            <Menu class="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>

    <!-- 页面容器：RouterView 直接渲染（key=fullPath 同步切换），离场/入场
         动画由 features/page-transition 状态机驱动；overflow-x-hidden 兜底
         业务页横向溢出，保证 390 / 768 / 1440 视口无横向滚动。 -->
    <main
      id="main-content"
      ref="mainEl"
      tabindex="-1"
      class="relative flex-1 overflow-x-hidden overflow-y-auto focus:outline-none"
    >
      <!-- 路由级错误边界：单个页面渲染失败仅降级该页，导航与全局 UI 不受影响 -->
      <AppErrorBoundary :key="routeBoundaryKey" name="route" @retry="bumpRouteBoundary">
        <RouterView v-slot="{ Component: ViewComponent, route: viewRoute }">
          <component
            :is="ViewComponent"
            :key="viewRoute.fullPath"
            @vue:mounted="notifyPageMounted"
          />
        </RouterView>
      </AppErrorBoundary>
    </main>

    <!-- 移动端导航抽屉（<768px；惰性渲染，关闭时 DOM 无残留） -->
    <AppDrawer :open="drawerOpen" title="导航" @close="closeDrawer">
      <nav class="app-drawer-nav" aria-label="移动端导航">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="app-drawer-nav__link"
          :class="{ 'app-drawer-nav__link--active': isActive(item.to) }"
          :aria-current="isActive(item.to) ? 'page' : undefined"
          @click="closeDrawer"
          @mouseenter="prefetch(item.to)"
          @focusin="prefetch(item.to)"
        >
          <span v-if="item.icon" class="mr-2 inline-flex">
            <component :is="item.icon" class="size-4" aria-hidden="true" />
          </span>
          {{ item.label }}
        </RouterLink>
        <RouterLink to="/settings" class="app-drawer-nav__link" @click="closeDrawer">
          设置
        </RouterLink>
      </nav>
    </AppDrawer>

    <!-- 全局页面宠物：所有页面可见，点击换肤 -->
    <PagePet />
  </div>
</template>

<style scoped>
/* 跳转主内容：默认移出视口，键盘聚焦时显示（transform 动画零布局开销） */
.app-skip-link {
  position: fixed;
  top: 0.5rem;
  left: 0.5rem;
  z-index: 80;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  background: var(--app-accent-strong, var(--color-brand-600));
  color: var(--color-surface-0);
  font-size: 0.875rem;
  text-decoration: none;
  transform: translateY(-220%);
  transition: transform var(--app-duration-fast, 120ms) var(--app-ease-out, ease);
}

.app-skip-link:focus-visible {
  transform: translateY(0);
}

/* 移动端菜单按钮（统一图标按钮形态） */
.app-menu-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.5rem;
  color: var(--app-text-secondary, var(--color-surface-800));
  background: transparent;
  cursor: pointer;
  transition:
    background-color var(--app-duration-fast, 120ms) var(--app-ease-out, ease),
    color var(--app-duration-fast, 120ms) var(--app-ease-out, ease);
}

.app-menu-btn:hover {
  background: var(--app-surface-subtle, var(--color-page));
  color: var(--app-text, var(--color-surface-900));
}

.app-menu-btn:focus-visible {
  outline: 2px solid var(--app-accent, var(--color-brand-500));
  outline-offset: 2px;
}

/* 抽屉导航链接 */
.app-drawer-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.app-drawer-nav__link {
  display: flex;
  align-items: center;
  min-height: 2.5rem;
  padding: 0.5rem 0.875rem;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  color: var(--app-text-secondary, var(--color-surface-800));
  text-decoration: none;
  transition:
    background-color var(--app-duration-fast, 120ms) var(--app-ease-out, ease),
    color var(--app-duration-fast, 120ms) var(--app-ease-out, ease);
}

.app-drawer-nav__link:hover {
  background: var(--app-surface-subtle, var(--color-page));
  color: var(--app-text, var(--color-surface-900));
}

.app-drawer-nav__link:focus-visible {
  outline: 2px solid var(--app-accent, var(--color-brand-500));
  outline-offset: -2px;
}

.app-drawer-nav__link--active {
  background: var(--app-surface-subtle, var(--color-page));
  color: var(--app-text, var(--color-surface-900));
  font-weight: 600;
}

@media (prefers-reduced-motion: reduce) {
  .app-skip-link,
  .app-menu-btn,
  .app-drawer-nav__link {
    transition: none;
  }
}
</style>
