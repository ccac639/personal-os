<script setup lang="ts">
import DefaultLayout from '@/layouts/default-layout.vue';
import TransitionManager from '@/features/page-transition/transition-manager.vue';
import AppToastHost from '@/components/AppToastHost.vue';
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue';
import PerfBadge from '@/components/PerfBadge.vue';

/** 性能标记徽标仅开发态渲染（生产构建不包含） */
const isDev = import.meta.env.DEV;
</script>

<template>
  <!-- 路由视图在 default-layout 内部（RouterView），持久 UI（顶部导航）不参与动画 -->
  <DefaultLayout />
  <!-- 全局页面过渡层：loading / 错误恢复（Teleport 到 body，独立于布局） -->
  <TransitionManager />
  <!-- 全局轻量反馈：toast / confirm（Teleport 到 body） -->
  <AppToastHost />
  <ConfirmDialogHost />
  <!-- 开发态性能标记（仅 DEV；无网络 / 无持久化） -->
  <PerfBadge v-if="isDev" />
</template>
