<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Bell, BellOff, CheckCheck, ChevronRight } from '@lucide/vue';
import { NOTIFICATIONS } from './mock';
import type { DashboardNotification, NotificationType } from './types';

interface Props {
  /** 外部数据覆盖（测试注入；未传则用统一 mock 源） */
  notifications?: DashboardNotification[];
}

const props = withDefaults(defineProps<Props>(), {
  notifications: undefined,
});

/** 通知状态只在 Dashboard 内存中管理，不写入 localStorage */
const items = ref<DashboardNotification[]>([...(props.notifications ?? NOTIFICATIONS)]);

/** 外部数据变化时同步（测试注入） */
watch(
  () => props.notifications,
  (next) => {
    if (next) items.value = [...next];
  },
);

const unreadCount = computed(() => items.value.filter((n) => !n.read).length);

function markRead(id: string) {
  const item = items.value.find((n) => n.id === id);
  if (item) item.read = true;
}

function markAllRead() {
  items.value.forEach((n) => {
    n.read = true;
  });
}

/** 类型徽标配置（文字 + 颜色，不只靠颜色） */
const TYPE_CONFIG: Record<NotificationType, { label: string; cls: string }> = {
  info: { label: '信息', cls: 'bg-brand-500/10 text-brand-600' },
  success: { label: '成功', cls: 'bg-green-500/10 text-green-600' },
  warning: { label: '提醒', cls: 'bg-orange-500/10 text-orange-600' },
  error: { label: '错误', cls: 'bg-red-500/10 text-red-600' },
};
</script>

<template>
  <section class="border-surface-100 bg-surface-0 flex flex-col rounded-lg border p-5" aria-label="通知中心">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-surface-900 flex items-center gap-1.5 text-base font-semibold">
        <Bell class="size-4" />
        通知
        <span
          v-if="unreadCount > 0"
          class="bg-brand-600 text-surface-0 ml-1 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums"
          data-testid="unread-badge"
          aria-label="未读通知数"
        >
          {{ unreadCount }}
        </span>
      </h2>
      <button
        type="button"
        class="text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded px-1.5 py-1 text-xs transition focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="unreadCount === 0"
        @click="markAllRead"
      >
        <CheckCheck class="size-3.5" />
        全部已读
      </button>
    </div>

    <!-- 空态 -->
    <div v-if="items.length === 0" class="flex h-24 flex-col items-center justify-center gap-2 text-sm text-surface-800/50">
      <BellOff class="size-6" />
      <p>暂无通知</p>
    </div>

    <!-- 列表：内部滚动 -->
    <ul v-else class="max-h-64 space-y-2 overflow-y-auto pr-1" role="list">
      <li
        v-for="n in items"
        :key="n.id"
        class="border-surface-100 flex items-start gap-2.5 rounded-lg border p-2.5"
        :class="n.read ? 'opacity-70' : ''"
      >
        <span
          class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-[10px] font-medium"
          :class="TYPE_CONFIG[n.type].cls"
        >
          {{ TYPE_CONFIG[n.type].label }}
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-2">
            <p class="text-surface-900 truncate text-sm font-medium">
              {{ n.title }}
              <span v-if="!n.read" class="bg-brand-500 ml-1 inline-block size-1.5 rounded-full align-middle" aria-label="未读" />
            </p>
            <span class="text-surface-800/40 shrink-0 text-[11px]">{{ n.createdAt }}</span>
          </div>
          <p class="text-surface-800/60 line-clamp-2 text-xs">{{ n.summary }}</p>
          <div class="mt-1.5 flex items-center gap-2">
            <router-link
              v-if="n.actionLabel && n.actionPath"
              :to="n.actionPath"
              class="text-brand-600 hover:text-brand-700 focus-visible:ring-brand-500/40 flex items-center gap-0.5 rounded text-xs focus-visible:ring-2 focus-visible:outline-none"
            >
              {{ n.actionLabel }}
              <ChevronRight class="size-3" />
            </router-link>
            <button
              v-if="!n.read"
              type="button"
              class="text-surface-800/50 hover:text-surface-900 rounded px-1 text-[11px] focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none"
              @click="markRead(n.id)"
            >
              标记已读
            </button>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>
