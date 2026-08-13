<script setup lang="ts">
/**
 * Admin 布局骨架：二级导航 + 内容区
 *
 * - 桌面：左侧固定导航；窄屏：导航横向滚动
 * - 导航项均带图标与文字，不依赖颜色表达状态
 */
import {
  AlertTriangle,
  Bell,
  Database,
  Gauge,
  ServerCog,
  SlidersHorizontal,
  UserRound,
} from '@lucide/vue';
import { computed } from 'vue';
import type { AdminSection } from '../types';
import { APP_VERSION } from '../backup';

const props = defineProps<{
  active: AdminSection;
}>();

const emit = defineEmits<{
  'update:active': [section: AdminSection];
}>();

const NAV_ITEMS: {
  id: AdminSection;
  label: string;
  description: string;
  icon: unknown;
  danger?: boolean;
}[] = [
  { id: 'overview', label: '概览', description: '系统状态一览与快捷入口', icon: Gauge },
  { id: 'preferences', label: '个人偏好', description: '资料、外观与默认行为', icon: UserRound },
  { id: 'ai-providers', label: 'AI 配置', description: 'Provider 与模型目录', icon: ServerCog },
  { id: 'data', label: '数据与备份', description: '备份、导入与清理', icon: Database },
  { id: 'automation', label: '自动化与通知', description: '工作流运行与提醒偏好', icon: Bell },
  {
    id: 'diagnostics',
    label: '系统诊断',
    description: '本地状态诊断报告',
    icon: SlidersHorizontal,
  },
  {
    id: 'danger',
    label: '危险操作',
    description: '不可撤销操作区',
    icon: AlertTriangle,
    danger: true,
  },
];

const activeItem = computed(() => NAV_ITEMS.find((n) => n.id === props.active));

function select(section: AdminSection): void {
  if (section === props.active) return;
  emit('update:active', section);
}
</script>

<template>
  <div class="mx-auto flex h-full w-full max-w-7xl flex-col px-4 py-4 md:flex-row md:gap-6">
    <!-- 二级导航：窄屏横向滚动，桌面纵向固定 -->
    <nav
      class="border-surface-100 bg-surface-0/70 md:bg-surface-0/40 mb-4 shrink-0 rounded-xl border p-1.5 md:mb-0 md:flex md:w-52 md:flex-col md:self-start md:rounded-xl"
      aria-label="管理系统导航"
    >
      <div class="hidden items-baseline justify-between px-3 pt-1 pb-2 md:flex">
        <span class="text-surface-900 text-sm font-semibold">管理系统</span>
        <span class="text-surface-800/50 text-xs">v{{ APP_VERSION }}</span>
      </div>
      <div class="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
        <button
          v-for="item in NAV_ITEMS"
          :key="item.id"
          type="button"
          class="focus-visible:ring-brand-500/40 flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
          :class="
            item.id === active
              ? 'bg-surface-100 text-surface-900 font-medium'
              : 'text-surface-800/70 hover:bg-surface-100/70 hover:text-surface-900'
          "
          :aria-current="item.id === active ? 'page' : undefined"
          :title="item.description"
          @click="select(item.id)"
        >
          <component :is="item.icon" class="size-4 shrink-0" aria-hidden="true" />
          <span class="whitespace-nowrap">{{ item.label }}</span>
        </button>
      </div>
    </nav>

    <!-- 内容区 -->
    <section class="min-w-0 flex-1" :aria-label="`${activeItem?.label ?? ''}内容`">
      <header class="mb-4 flex items-baseline justify-between gap-3 md:hidden">
        <h1 class="text-surface-900 text-lg font-semibold">{{ activeItem?.label }}</h1>
        <span class="text-surface-800/50 text-xs">管理系统 v{{ APP_VERSION }}</span>
      </header>
      <slot />
    </section>
  </div>
</template>
