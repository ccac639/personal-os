<script setup lang="ts">
import {
  DashboardActivityFeed,
  DashboardHeroCarousel,
  DashboardQuickActions,
  DashboardRepoStatus,
  DashboardStatsCards,
  DashboardSystemStatus,
  DashboardWorkflowStatus,
} from '@/features/dashboard';
</script>

<template>
  <div class="relative min-h-screen p-6">
    <!-- 氛围光斑装饰（跟随主题 brand 色，pointer-events 穿透） -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div class="bg-brand-500/10 absolute -top-24 -left-24 size-96 rounded-full blur-3xl" />
      <div class="absolute top-1/3 -right-32 size-80 rounded-full bg-purple-500/10 blur-3xl" />
    </div>

    <!-- 主内容区：左 2/3 + 右 1/3 -->
    <div class="relative grid gap-6 lg:grid-cols-3">
      <!-- 左侧区域 -->
      <div class="space-y-6 lg:col-span-2">
        <!-- 顶部轮播：统计卡片 + 开发中项目 + 技术栈 -->
        <DashboardHeroCarousel />

        <!-- 底部三列：最近活动 + Git 仓库 + 工作流状态 -->
        <div class="grid gap-6 md:grid-cols-3">
          <DashboardActivityFeed />
          <DashboardRepoStatus />
          <DashboardWorkflowStatus />
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
