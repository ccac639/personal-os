<script setup lang="ts">
import { Bot, FolderKanban, House, MessagesSquare, Settings, Trophy, Workflow } from '@lucide/vue';
import type { Component } from 'vue';

interface NavItem {
  label: string;
  to: string;
  icon: Component;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: House },
  { label: 'Chat', to: '/chat', icon: MessagesSquare },
  { label: 'Agents', to: '/agents', icon: Bot },
  { label: 'Workflows', to: '/workflows', icon: Workflow },
  { label: 'Projects', to: '/projects', icon: FolderKanban },
  { label: 'Achievements', to: '/achievements', icon: Trophy },
  { label: 'Settings', to: '/settings', icon: Settings },
];
</script>

<template>
  <div class="flex min-h-screen">
    <aside class="border-surface-100 bg-surface-0 w-56 shrink-0 border-r">
      <div class="flex h-14 items-center gap-2 px-4 font-semibold">
        <span class="bg-brand-500 inline-block size-2 rounded-full" />
        Personal OS
      </div>
      <nav class="flex flex-col gap-1 px-2 py-2">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition"
        >
          <component :is="item.icon" class="size-4" />
          {{ item.label }}
        </RouterLink>
      </nav>
    </aside>
    <main class="flex-1">
      <slot />
    </main>
  </div>
</template>
