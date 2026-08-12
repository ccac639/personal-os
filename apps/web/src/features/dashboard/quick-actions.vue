<script setup lang="ts">
import { QUICK_ACTIONS } from './mock';
import type { QuickAction } from './types';

interface Props {
  /** 外部数据覆盖（测试注入） */
  actions?: QuickAction[];
}

const props = withDefaults(defineProps<Props>(), {
  actions: undefined,
});

const actions = props.actions ?? QUICK_ACTIONS;
</script>

<template>
  <section class="border-surface-100 bg-surface-0 rounded-lg border p-5">
    <h2 class="text-surface-900 mb-4 text-lg font-semibold">快速操作</h2>
    <!-- 2 行 2 列按钮网格：窄屏自动 1 列 -->
    <div class="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
      <router-link
        v-for="action in actions"
        :key="action.id"
        :to="action.href"
        class="group relative flex flex-col items-start justify-between overflow-hidden rounded-lg bg-slate-900/85 p-4 text-white shadow-sm transition duration-200 hover:bg-gradient-to-br hover:shadow-md focus-visible:ring-brand-500/40 focus-visible:ring-2 focus-visible:outline-none active:scale-[0.97]"
        :class="action.color"
      >
        <component :is="action.icon" class="size-5 transition duration-200 group-hover:scale-110" />
        <span class="mt-3 min-w-0 truncate text-sm font-medium">{{ action.label }}</span>
      </router-link>
    </div>
  </section>
</template>
