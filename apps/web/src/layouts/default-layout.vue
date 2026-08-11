<script setup lang="ts">
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
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <header class="border-surface-100 bg-surface-0/85 sticky top-0 z-40 border-b backdrop-blur">
      <div class="mx-auto flex h-14 max-w-7xl items-center gap-8 px-4">
        <!-- 品牌区：纯文字（视觉锚点） -->
        <RouterLink to="/" class="shrink-0 text-lg font-bold tracking-tight text-neutral-900">
          Personal OS
        </RouterLink>

        <!-- 主导航 -->
        <nav class="flex h-full items-center gap-5">
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="relative flex h-full items-center px-1 text-sm transition-colors"
            :class="
              isActive(item.to) ? 'font-medium text-black' : 'text-[#666666] hover:text-black'
            "
          >
            {{ item.label }}
            <span v-if="isActive(item.to)" class="absolute inset-x-0 bottom-0 h-0.5 bg-black" />
          </RouterLink>
        </nav>

        <!-- 右侧操作区：设置（幽灵按钮） -->
        <div class="ml-auto flex items-center">
          <RouterLink
            to="/settings"
            class="rounded-md border border-neutral-200 px-3 py-1 text-[13px] text-neutral-600 transition hover:border-neutral-300 hover:text-black"
            :class="{
              'border-neutral-300 text-black': route.path === '/settings',
            }"
          >
            设置
          </RouterLink>
        </div>
      </div>
    </header>

    <main class="flex-1">
      <slot />
    </main>
  </div>
</template>
