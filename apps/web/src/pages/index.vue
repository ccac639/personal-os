<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  DashboardActivityFeed,
  DashboardHeroCarousel,
  DashboardPagePet,
  DashboardQuickActions,
  DashboardStatsCards,
  DashboardSystemStatus,
  loadTheme,
  saveTheme,
  type ThemeSettings,
} from '@/features/dashboard';

const theme = ref<ThemeSettings>(loadTheme());

watch(theme, (value) => saveTheme(value), { deep: true });

const pageStyle = computed(() => ({
  backgroundColor: theme.value.background,
  fontFamily: theme.value.font,
}));
</script>

<template>
  <div class="min-h-screen p-6 transition-colors duration-300" :style="pageStyle">
    <!-- 主内容区：左 2/3 + 右 1/3 -->
    <div class="grid gap-6 lg:grid-cols-3">
      <!-- 左侧区域 -->
      <div class="space-y-6 lg:col-span-2">
        <!-- 顶部轮播：统计卡片 + 开发中项目 -->
        <DashboardHeroCarousel />

        <!-- 底部三列：最近活动 + 两个占位卡片 -->
        <div class="grid gap-6 md:grid-cols-3">
          <DashboardActivityFeed />
          <section class="rounded-lg border border-neutral-200 bg-white p-6">
            <h2 class="mb-4 text-lg font-semibold text-neutral-900">待办事项</h2>
            <div class="flex h-40 items-center justify-center text-sm text-neutral-400">
              暂无待办
            </div>
          </section>
          <section class="rounded-lg border border-neutral-200 bg-white p-6">
            <h2 class="mb-4 text-lg font-semibold text-neutral-900">工作流</h2>
            <div class="flex h-40 items-center justify-center text-sm text-neutral-400">
              暂无运行中
            </div>
          </section>
        </div>
      </div>

      <!-- 右侧区域 -->
      <div class="space-y-6">
        <!-- 统计卡片：活跃服务 1 张 -->
        <DashboardStatsCards variant="right" />

        <!-- 快速操作 -->
        <DashboardQuickActions />

        <!-- 系统状态 -->
        <DashboardSystemStatus />
      </div>
    </div>

    <!-- 悬浮页面宠物（点击换背景色 + 字体） -->
    <DashboardPagePet v-model:theme="theme" />
  </div>
</template>
