<script setup lang="ts">
import { ArrowDownToLine } from '@lucide/vue';
import { computed, nextTick, ref, watch } from 'vue';

import ChatMessage from './chat-message.vue';
import ChatWelcome from './chat-welcome.vue';
import { useChatStore } from '../store';

const store = useChatStore();

const scrollRef = ref<HTMLElement | null>(null);

const messages = computed(() => store.activeSession?.messages ?? []);
const lastMessage = computed(() => messages.value[messages.value.length - 1] ?? null);

/** 是否钉在底部（自动跟随滚动）；用户上翻历史时置 false */
const pinToBottom = ref(true);
/** 用户上翻期间新增的消息条数 */
const unreadCount = ref(0);
/** 上次“已看到”的消息条数 */
const lastSeenCount = ref(messages.value.length);

/** 滚动源：消息条数 / 流式内容变化（打字机逐字推进时跟随） */
const scrollKey = computed(
  () =>
    `${messages.value.length}-${lastMessage.value?.id ?? ''}-${
      lastMessage.value?.content.length ?? 0
    }-${lastMessage.value?.streaming ?? false}`,
);

function isNearBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 96;
}

function scrollToBottom() {
  const el = scrollRef.value;
  if (!el) return;
  // 流式逐字推进时用 auto，避免 smooth 动画堆积卡顿
  void nextTick().then(() => {
    el.scrollTo({ top: el.scrollHeight, behavior: lastMessage.value?.streaming ? 'auto' : 'smooth' });
  });
}

/** 手动滚动：接近底部恢复跟随，否则视为上翻历史 */
function handleScroll() {
  const el = scrollRef.value;
  if (!el) return;
  if (isNearBottom(el)) {
    pinToBottom.value = true;
    lastSeenCount.value = messages.value.length;
    unreadCount.value = 0;
  } else {
    pinToBottom.value = false;
  }
}

/** 回到底部：恢复跟随并清空未读 */
function jumpToBottom() {
  pinToBottom.value = true;
  unreadCount.value = 0;
  lastSeenCount.value = messages.value.length;
  scrollToBottom();
}

watch(scrollKey, () => {
  if (pinToBottom.value) {
    scrollToBottom();
    lastSeenCount.value = messages.value.length;
    unreadCount.value = 0;
  } else if (messages.value.length > lastSeenCount.value) {
    // 上翻浏览历史时，新消息只计数不打扰
    unreadCount.value += messages.value.length - lastSeenCount.value;
    lastSeenCount.value = messages.value.length;
  }
});

// 切换会话：重置滚动状态并回到底部
watch(
  () => store.activeId,
  () => {
    pinToBottom.value = true;
    unreadCount.value = 0;
    lastSeenCount.value = messages.value.length;
    scrollToBottom();
  },
);
</script>

<template>
  <div class="relative min-h-0 flex-1">
    <div
      ref="scrollRef"
      class="scrollbar-thin h-full overflow-y-auto"
      @scroll.passive="handleScroll"
    >
      <!-- 空态：无会话或会话无消息 -->
      <ChatWelcome v-if="messages.length === 0" />

      <!-- 消息流 -->
      <div v-else class="mx-auto w-full max-w-3xl px-4 py-6">
        <div class="space-y-6">
          <ChatMessage
            v-for="(msg, i) in messages"
            :key="msg.id"
            :message="msg"
            :is-last="i === messages.length - 1"
          />
        </div>
        <div class="h-6" aria-hidden="true" />
      </div>
    </div>

    <!-- 回到底部：上翻历史时出现，带未读新增计数 -->
    <transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-2"
    >
      <button
        v-if="!pinToBottom && messages.length > 0"
        class="bg-surface-0 shadow-float border-surface-100 hover:border-brand-300 text-surface-800/70 hover:text-surface-900 focus-visible:ring-brand-500/40 absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
        aria-label="回到底部"
        title="回到底部"
        @click="jumpToBottom"
      >
        <ArrowDownToLine class="size-3.5" />
        <span v-if="unreadCount > 0" class="text-brand-600 font-semibold">
          {{ unreadCount }} 条新消息
        </span>
        <span v-else>回到底部</span>
      </button>
    </transition>
  </div>
</template>

<style scoped>
.scrollbar-thin::-webkit-scrollbar {
  width: 6px;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  border-radius: 9999px;
  background: rgb(15 23 42 / 0.12);
}
.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background: rgb(15 23 42 / 0.24);
}
.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}
</style>
