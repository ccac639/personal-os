<script setup lang="ts">
import { ref } from 'vue';
import DefaultLayout from '@/layouts/default-layout.vue';
import TransitionManager from '@/features/page-transition/transition-manager.vue';
import AppErrorBoundary from '@/components/AppErrorBoundary.vue';
import AppToastHost from '@/components/AppToastHost.vue';
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue';
import PerfBadge from '@/components/PerfBadge.vue';

/** 性能标记徽标仅开发态渲染（生产构建不包含） */
const isDev = import.meta.env.DEV;

/** 应用级错误边界重试：key bump 重建子树（错误状态随边界重置） */
const appKey = ref(0);
function bumpAppKey(): void {
  appKey.value += 1;
}
</script>

<template>
  <!-- 应用级错误边界：路由区单点故障不白屏（Toast/Confirm 全局反馈不参与） -->
  <AppErrorBoundary :key="appKey" name="app" @retry="bumpAppKey">
    <!-- 路由视图在 default-layout 内部（RouterView），持久 UI（顶部导航）不参与动画 -->
    <DefaultLayout />
  </AppErrorBoundary>
  <!-- 全局页面过渡层：loading / 错误恢复（Teleport 到 body，独立于布局） -->
  <TransitionManager />
  <!-- 全局轻量反馈：toast / confirm（Teleport 到 body） -->
  <AppToastHost />
  <ConfirmDialogHost />
  <!-- 开发态性能标记（仅 DEV；无网络 / 无持久化） -->
  <PerfBadge v-if="isDev" />
</template>
