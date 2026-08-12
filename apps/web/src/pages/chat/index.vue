<script setup lang="ts">
import { Menu, PanelRight } from '@lucide/vue';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

import {
  ChatComposer,
  ChatMessageList,
  ChatPanel,
  ChatSidebar,
  ChatToast,
  useChatStore,
} from '@/features/chat';
import { pushToast } from '@/features/chat/toast';

const store = useChatStore();

/** 移动端抽屉开关（透传给侧边栏 v-model） */
const mobileSidebarOpen = ref(false);
/** 右侧信息面板开关（默认收起，保持内容区宽阔） */
const panelOpen = ref(false);

/** 偏好数据损坏回退时，非阻塞提示一次 */
onMounted(() => {
  if (store.prefsRecovered) {
    pushToast('本地偏好设置已重置为默认值', 'warning');
  }
});

/** 移动端：打开会话后自动收起抽屉 */
watch(
  () => store.activeId,
  () => {
    mobileSidebarOpen.value = false;
  },
);

/** 离开页面时停止流式输出，避免后台空转 */
onBeforeUnmount(() => {
  store.stopStreaming();
});
</script>

<template>
  <div class="bg-page chat-workspace absolute inset-0 flex overflow-hidden">
    <!-- 左侧：模型与会话工作区（桌面固定 / 移动端抽屉） -->
    <ChatSidebar v-model:mobile-open="mobileSidebarOpen" />

    <!-- 主区 -->
    <main class="page-content-section flex min-w-0 flex-1 flex-col">
      <!-- 顶栏：移动端菜单 + 当前模型摘要 + 面板开关 -->
      <header class="flex h-11 shrink-0 items-center gap-2 border-b border-surface-100 px-3">
        <button
          class="text-surface-800/60 hover:bg-surface-100 hover:text-surface-900 flex size-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 md:hidden"
          aria-label="打开会话列表"
          title="打开会话列表"
          @click="mobileSidebarOpen = true"
        >
          <Menu class="size-4.5" />
        </button>

        <div class="min-w-0 flex-1">
          <p class="text-surface-900 truncate text-sm font-medium">
            {{ store.activeSession?.title ?? '新对话' }}
          </p>
          <p class="text-surface-800/40 truncate text-[10px]">
            {{ store.currentModelInfo?.label ?? '个人 AI 工作区' }}
            <template v-if="store.currentModelInfo">
              · {{ store.currentModelInfo.context }}
            </template>
          </p>
        </div>

        <button
          class="text-surface-800/60 hover:bg-surface-100 hover:text-surface-900 hidden size-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 lg:flex"
          :class="{ 'bg-surface-100 text-surface-900': panelOpen }"
          aria-label="切换会话信息面板"
          title="切换会话信息面板"
          @click="panelOpen = !panelOpen"
        >
          <PanelRight class="size-4" />
        </button>
      </header>

      <!-- 消息流 / 空态 -->
      <ChatMessageList />

      <!-- 底部创作控制台 -->
      <ChatComposer />
    </main>

    <!-- 右侧：会话信息面板（lg+ 可见） -->
    <ChatPanel v-if="panelOpen" @close="panelOpen = false" />

    <!-- 本地 toast -->
    <ChatToast />
  </div>
</template>

<style>
/* Chat 工作区语义色（模型类别）：亮/暗主题下均清晰，非营销渐变 */
.chat-workspace {
  --chat-cyan: #0891b2;
  --chat-teal: #0d9488;
  --chat-orange: #ea580c;
  --chat-rose: #e11d48;
  --chat-mono: #64748b;
}
</style>
