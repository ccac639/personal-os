<script setup lang="ts">
import { onMounted, ref } from 'vue';

const route = useRoute();

/** 主导航：match 回调决定当前页高亮（路由前缀匹配，避免子路径漏判）。 */
const nav = [
  { to: '/', label: '首页', match: (path: string) => path === '/' },
  { to: '/tags', label: '标签', match: (path: string) => path.startsWith('/tags') },
  { to: '/about', label: '关于', match: (path: string) => path.startsWith('/about') },
];

const year = new Date().getFullYear();

/**
 * 主题切换（零依赖）：
 * - 默认跟随系统（prefers-color-scheme）；
 * - 用户手动选择后写入 <html data-theme="light|dark"> + localStorage 记忆；
 * - 'auto' 清除覆盖，回退系统偏好。
 */
type ThemeChoice = 'auto' | 'light' | 'dark';
const STORAGE_KEY = 'blog:theme';

const choice = ref<ThemeChoice>('auto');

function apply(theme: ThemeChoice) {
  const root = document.documentElement;
  if (theme === 'auto') {
    root.removeAttribute('data-theme');
    root.classList.remove('dark');
  } else {
    root.setAttribute('data-theme', theme);
    root.classList.toggle('dark', theme === 'dark');
  }
}

function pick(next: ThemeChoice) {
  choice.value = next;
  apply(next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* 隐私模式等场景忽略持久化失败 */
  }
}

onMounted(() => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      choice.value = saved;
      apply(saved);
    }
  } catch {
    /* 忽略读取失败 */
  }
});
</script>

<template>
  <div class="bg-surface-50 text-surface-900 flex min-h-screen flex-col">
    <header class="border-surface-100 bg-surface-0 sticky top-0 z-10 border-b">
      <div class="mx-auto flex h-14 max-w-4xl items-center gap-4 px-4">
        <NuxtLink to="/" class="flex items-center gap-2 font-semibold">
          <span class="bg-brand-500 inline-block size-2 rounded-full" />
          <span class="truncate">Personal OS Blog</span>
        </NuxtLink>
        <nav class="ml-auto flex items-center gap-1 text-sm">
          <NuxtLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="rounded-md px-2.5 py-1.5 transition-colors"
            :class="
              item.match(route.path)
                ? 'bg-surface-100 text-surface-900 font-medium'
                : 'text-surface-800/70 hover:text-surface-900'
            "
          >
            {{ item.label }}
          </NuxtLink>
          <button
            type="button"
            class="hover:text-surface-900 text-surface-800/70 ml-1 cursor-pointer rounded-md px-2 py-1 text-xs"
            :title="
              choice === 'auto'
                ? '当前跟随系统，点击切换为深色'
                : choice === 'dark'
                  ? '点击切换为浅色'
                  : '点击跟随系统'
            "
            @click="pick(choice === 'auto' ? 'dark' : choice === 'dark' ? 'light' : 'auto')"
          >
            <span v-if="choice === 'auto'" aria-hidden="true">🌓</span>
            <span v-else-if="choice === 'dark'" aria-hidden="true">🌙</span>
            <span v-else aria-hidden="true">☀️</span>
            <span class="sr-only">切换主题</span>
          </button>
        </nav>
      </div>
    </header>
    <main class="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <slot />
    </main>
    <footer class="text-surface-800/50 mx-auto w-full max-w-4xl px-4 py-6 text-center text-xs">
      <NuxtLink
        to="/rss.xml"
        class="hover:text-surface-800/80 underline decoration-dotted underline-offset-4"
      >
        RSS
      </NuxtLink>
      <span class="mx-2">·</span>
      © {{ year }} Personal OS
    </footer>
  </div>
</template>
