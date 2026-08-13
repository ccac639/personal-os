<script setup lang="ts">
import DefaultLayout from '@/layouts/default-layout.vue';
import TransitionManager from '@/features/page-transition/transition-manager.vue';
</script>

<template>
  <!-- 路由视图在 default-layout 内部（RouterView），持久 UI（顶部导航）不参与动画 -->
  <DefaultLayout />
  <!-- 全局页面过渡层：loading / 错误恢复（Teleport 到 body，独立于布局） -->
  <TransitionManager />
</template>
