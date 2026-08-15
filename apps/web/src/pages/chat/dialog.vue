<script setup lang="ts">
/**
 * Chat 工作台 —— 对话视图（原 Chat 工作区）
 *
 * 保持既有会话 / 模型 / 消息 / Composer 行为，并接入：
 * - 结果操作注入：保存为灵感（弹窗）/ 创建智能体变体（跳转智能体中心）
 * - 智能体 / 灵感创建的会话草稿在 Composer 消费（store.composerDraft）
 */
import { Menu, PanelRight } from '@lucide/vue';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import {
  ChatComposer,
  ChatMessageList,
  ChatPanel,
  ChatSidebar,
  ChatToast,
  useChatStore,
} from '@/features/chat';
import InspirationSaveDialog from '@/features/chat/components/inspiration-save-dialog.vue';
import { defaultActionFeedback, setChatActionHandler } from '@/features/chat/actions';
import { useAgentsStore } from '@/features/chat/agent-store';
import { useInspirationStore } from '@/features/chat/inspiration-store';
import { useThreeDWorkspaceStore } from '@/features/chat/three-d';
import { pushToast } from '@/features/chat/toast';

const store = useChatStore();
const inspirationStore = useInspirationStore();
const agentsStore = useAgentsStore();
const threeDStore = useThreeDWorkspaceStore();
const router = useRouter();

/** 移动端抽屉开关（透传给侧边栏 v-model） */
const mobileSidebarOpen = ref(false);
/** 右侧信息面板开关（默认收起，保持内容区宽阔） */
const panelOpen = ref(false);

onMounted(() => {
  if (store.prefsRecovered) {
    pushToast('本地偏好设置已重置为默认值', 'warning');
  }
  // 结果操作注入：消息菜单 → 灵感 / 智能体 / 3D 联动
  setChatActionHandler((action) => {
    if (action.kind === 'save-inspiration') {
      inspirationStore.saveFromMessage(action.messageId);
      return;
    }
    if (action.kind === 'create-agent-variant') {
      const chat = useChatStore();
      const msg = chat.findMessage(action.messageId);
      const sessionId = chat.activeSession?.id;
      agentsStore.prefillFromMessage(
        action.messageId,
        msg?.content ?? action.content,
        sessionId ?? '',
      );
      void router.push('/chat/agents');
      return;
    }
    if (action.kind === 'create-3d-draft') {
      // 仅传入结构化文本草稿：不自动执行、不含附件
      const ok = threeDStore.saveFromMessage(action.messageId);
      if (ok) void router.push('/chat/3d');
      return;
    }
    pushToast(defaultActionFeedback(action.kind));
  });
});

onBeforeUnmount(() => {
  setChatActionHandler(null);
  store.stopStreaming();
});

/** 移动端：打开会话后自动收起抽屉 */
watch(
  () => store.activeId,
  () => {
    mobileSidebarOpen.value = false;
  },
);
</script>

<template>
  <div class="bg-page chat-workspace absolute inset-0 flex overflow-hidden">
    <!-- 左侧：模型与会话工作区（桌面固定 / 移动端抽屉） -->
    <ChatSidebar v-model:mobile-open="mobileSidebarOpen" />

    <!-- 主区 -->
    <main class="page-content-section flex min-w-0 flex-1 flex-col">
      <!-- 顶栏：移动端菜单 + 当前模型摘要 + 面板开关 -->
      <header class="border-surface-100 flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <button
          class="text-surface-800/60 hover:bg-surface-100 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-8 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none md:hidden"
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
          class="text-surface-800/60 hover:bg-surface-100 hover:text-surface-900 focus-visible:ring-brand-500/40 hidden size-8 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none lg:flex"
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

    <!-- 保存为灵感弹窗 -->
    <InspirationSaveDialog
      @close="mobileSidebarOpen = false"
      @navigate-inspiration="router.push('/chat/inspiration')"
    />

    <!-- 本地 toast -->
    <ChatToast />
  </div>
</template>

<style>
/* Chat 工作区语义色（模型类别）：亮/暗主题下均清晰，非营销渐变 */
.chat-workspace {
  --chat-cyan: var(--color-info-600);
  --chat-teal: var(--color-success-700);
  --chat-orange: #ea580c;
  --chat-rose: var(--color-danger-800);
  --chat-mono: var(--color-surface-500);
}
</style>
