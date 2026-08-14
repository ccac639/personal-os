<script setup lang="ts">
const route = useRoute();

/** 主导航：match 回调决定当前页高亮（路由前缀匹配，避免子路径漏判）。 */
const nav = [
  { to: '/', label: '首页', match: (path: string) => path === '/' },
  { to: '/tags', label: '标签', match: (path: string) => path.startsWith('/tags') },
  { to: '/about', label: '关于', match: (path: string) => path.startsWith('/about') },
];

const year = new Date().getFullYear();
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
