<script setup lang="ts">
import {
  DashboardActivityFeed,
  DashboardHeroCarousel,
  DashboardQuickActions,
  DashboardStatsCards,
  DashboardSystemStatus,
} from '@/features/dashboard';
</script>

<template>
  <div class="min-h-screen p-6">
    <!-- 主内容区：左 2/3 + 右 1/3 -->
    <div class="grid gap-6 lg:grid-cols-3">
      <!-- 左侧区域 -->
      <div class="space-y-6 lg:col-span-2">
        <!-- 顶部轮播：统计卡片 + 开发中项目 -->
        <DashboardHeroCarousel />

        <!-- 底部三列：最近活动 + 两个占位卡片 -->
        <div class="grid gap-6 md:grid-cols-3">
          <DashboardActivityFeed />
          <section class="border-surface-100 bg-surface-0 rounded-lg border p-6">
            <h2 class="text-surface-900 mb-4 text-lg font-semibold">待办事项</h2>
            <div class="text-surface-800/50 flex h-40 items-center justify-center text-sm">
              暂无待办
            </div>
          </section>
          <section class="border-surface-100 bg-surface-0 rounded-lg border p-6">
            <h2 class="text-surface-900 mb-4 text-lg font-semibold">工作流</h2>
            <div class="text-surface-800/50 flex h-40 items-center justify-center text-sm">
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
  </div>
</template>
