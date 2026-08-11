<script setup lang="ts">
import {
  DashboardActivityFeed,
  DashboardQuickActions,
  DashboardRecentProjects,
  DashboardStatsCards,
  DashboardSystemStatus,
  DashboardTechOverview,
} from '@/features/dashboard';
</script>

<template>
  <div class="min-h-screen bg-neutral-50 p-6">
    <!-- 页面标题 -->
    <header class="mb-6">
      <h1 class="text-2xl font-bold text-neutral-900">Dashboard</h1>
      <p class="mt-1 text-sm text-neutral-600">个人工作台概览</p>
    </header>

    <!-- 统计卡片 -->
    <DashboardStatsCards class="mb-6" />

    <!-- 主内容区：左 2/3 + 右 1/3 -->
    <div class="mb-6 grid gap-6 lg:grid-cols-3">
      <!-- 左侧：项目 + 活动流 -->
      <div class="space-y-6 lg:col-span-2">
        <DashboardRecentProjects />
        <DashboardActivityFeed />
      </div>

      <!-- 右侧：快速操作 + 系统状态 -->
      <div class="space-y-6">
        <DashboardQuickActions />
        <DashboardSystemStatus />
      </div>
    </div>

    <!-- 技术栈概览 -->
    <DashboardTechOverview />
  </div>
</template>
