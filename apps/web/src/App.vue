<script setup lang="ts">
import DefaultLayout from '@/layouts/default-layout.vue';
</script>

<template>
  <!-- 路由视图已下沉到 default-layout 内部（RouterView + Transition + KeepAlive），
       保证过渡只作用于页面内容，顶部导航等持久 UI 不参与动画 -->
  <DefaultLayout />
</template>
