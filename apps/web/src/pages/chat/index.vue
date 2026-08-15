<script setup lang="ts">
/**
 * Chat 工作台壳页面：内部二级导航（对话 / 智能体 / 灵感广场）+ 子视图渲染。
 * 桌面紧凑三段式布局由各子视图内部实现（侧栏 + 主区 + 详情抽屉）。
 */
import { Bot, Boxes, Lightbulb, MessageSquare } from '@lucide/vue';
import { onBeforeUnmount } from 'vue';

import { useChatStore } from '@/features/chat';

const store = useChatStore();

/** 离开页面时停止流式输出，避免后台空转 */
onBeforeUnmount(() => {
  store.stopStreaming();
});

const tabs = [
  { to: '/chat', label: '对话', icon: MessageSquare, exact: true },
  { to: '/chat/agents', label: '智能体', icon: Bot, exact: false },
  { to: '/chat/inspiration', label: '灵感广场', icon: Lightbulb, exact: false },
  { to: '/chat/3d', label: '3D 工作台', icon: Boxes, exact: false },
];
</script>

<template>
  <div class="bg-page absolute inset-0 flex flex-col overflow-hidden">
    <!-- 二级导航 -->
    <nav
      class="border-surface-100 flex h-10 shrink-0 items-center gap-1 border-b px-2"
      aria-label="Chat 工作台视图"
    >
      <router-link
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        class="text-surface-800/60 hover:bg-surface-100 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
        :exact-active-class="tab.exact ? 'router-link-active-chat' : ''"
        :active-class="tab.exact ? '' : 'router-link-active-chat'"
      >
        <component :is="tab.icon" class="size-3.5" />
        {{ tab.label }}
      </router-link>

      <span class="text-surface-800/30 ml-auto pr-1 text-[10px]">个人 AI 创作工作台</span>
    </nav>

    <!-- 子视图 -->
    <div class="relative min-h-0 flex-1">
      <router-view v-slot="{ Component }">
        <component :is="Component" />
      </router-view>
    </div>
  </div>
</template>

<style>
.chat-workspace {
  --chat-cyan: var(--color-info-600);
  --chat-teal: var(--color-success-700);
  --chat-orange: #ea580c;
  --chat-rose: var(--color-danger-800);
  --chat-mono: var(--color-surface-500);
}
</style>
