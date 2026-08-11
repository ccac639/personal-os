<script setup lang="ts">
import { motion, AnimatePresence, LayoutGroup } from 'motion-v';
import { useRoute } from 'vue-router';

const route = useRoute();

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
</script>

<template>
  <div class="flex h-screen flex-col overflow-hidden">
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
          class="shrink-0 text-lg font-bold tracking-tight text-neutral-900"
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
              v-for="item in navItems"
              :key="item.to"
              v-slot="{ href, navigate }"
              :to="item.to"
              custom
            >
              <motion.a
                :href="href"
                class="relative flex h-full items-center px-1 text-sm"
                :class="
                  isActive(item.to) ? 'font-medium text-black' : 'text-[#666666] hover:text-black'
                "
                :initial="{ opacity: 0, y: -8 }"
                :animate="{ opacity: 1, y: 0 }"
                :transition="{
                  default: { type: 'spring', stiffness: 420, damping: 22 },
                  opacity: { duration: 0.35, ease: 'easeOut', delay: 0.16 + i * 0.05 },
                  y: { type: 'spring', stiffness: 260, damping: 22, delay: 0.16 + i * 0.05 },
                }"
                :while-hover="{ scale: 1.08, y: -1 }"
                :while-tap="{ scale: 0.9 }"
                @click="navigate"
              >
                <!-- hover 光晕 pill：仅 transform/opacity，GPU 合成零布局开销 -->
                <motion.span
                  class="absolute inset-x-0 h-[68%] rounded-full bg-neutral-100/90"
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
                    class="absolute inset-x-0 bottom-2 z-10 h-0.5 bg-black"
                    :transition="{ type: 'spring', stiffness: 380, damping: 30 }"
                  />
                </AnimatePresence>
              </motion.a>
            </RouterLink>
          </nav>
        </LayoutGroup>

        <!-- 设置幽灵按钮：hover 弹性放大，按压回弹 -->
        <div class="flex items-center justify-self-end">
          <RouterLink v-slot="{ href, navigate }" to="/settings" custom>
            <motion.a
              :href="href"
              class="rounded-md border border-neutral-200 px-3 py-1 text-[13px] text-neutral-600"
              :class="{
                'border-neutral-300 text-black': route.path === '/settings',
              }"
              :initial="{ opacity: 0, x: 8 }"
              :animate="{ opacity: 1, x: 0 }"
              :transition="{
                default: { type: 'spring', stiffness: 500, damping: 18 },
                opacity: { duration: 0.35, ease: 'easeOut', delay: 0.52 },
                x: { duration: 0.35, ease: 'easeOut', delay: 0.52 },
              }"
              :while-hover="{ scale: 1.08, borderColor: '#000' }"
              :while-tap="{ scale: 0.88 }"
              @click="navigate"
            >
              设置
            </motion.a>
          </RouterLink>
        </div>
      </div>
    </motion.header>

    <!-- 页面切换：sync 模式 + 退出元素绝对定位，彻底隔离布局流 -->
    <main class="relative flex-1 overflow-x-hidden overflow-y-clip">
      <AnimatePresence mode="sync">
        <motion.div
          :key="route.path"
          class="min-h-full will-change-transform"
          :style="{ position: 'absolute', inset: 0 }"
          :initial="{ opacity: 0, y: 8 }"
          :animate="{ opacity: 1, y: 0, position: 'relative' }"
          :exit="{ opacity: 0, y: -8, position: 'absolute' }"
          :transition="{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }"
        >
          <slot />
        </motion.div>
      </AnimatePresence>
    </main>
  </div>
</template>
