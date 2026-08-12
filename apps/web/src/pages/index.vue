<script setup lang="ts">
import {
  DashboardActivityFeed,
  DashboardAiWorkbench,
  DashboardEfficiencySummary,
  DashboardHeroCarousel,
  DashboardNotificationCenter,
  DashboardQuickActions,
  DashboardSystemEvents,
  DashboardSystemOverview,
  DashboardSystemStatus,
  DashboardTodayWorkbench,
  DashboardTrendingAI,
  DashboardWorkflowStatus,
} from '@/features/dashboard';
</script>

<template>
  <div class="relative min-h-screen p-6">
    <!-- 氛围光斑装饰（跟随主题 brand 色，pointer-events 穿透） -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div class="bg-brand-500/10 absolute -top-24 -left-24 size-96 rounded-full blur-3xl" />
      <div class="bg-brand-600/10 absolute top-1/3 -right-32 size-80 rounded-full blur-3xl" />
    </div>

    <!-- 主内容区：左 2/3 + 右 1/3（中等宽度自动单列堆叠，窄屏不挤压） -->
    <div class="relative grid gap-6 lg:grid-cols-3">
      <!-- 左侧区域 -->
      <div class="space-y-6 lg:col-span-2">
        <!-- 顶部轮播：统计卡片 + 开发中项目 + 技术栈 -->
        <DashboardHeroCarousel />

        <!-- 今日工作台 -->
        <DashboardTodayWorkbench />

        <!-- 底部三列：最近活动 + GitHub 趋势 + 工作流状态（窄屏自动单列） -->
        <div class="grid gap-6 md:grid-cols-3">
          <DashboardActivityFeed />
          <DashboardTrendingAI />
          <DashboardWorkflowStatus />
        </div>

        <!-- 系统事件时间线 -->
        <DashboardSystemEvents />
      </div>

      <!-- 右侧区域（中等宽度下移到主内容下方） -->
      <div class="space-y-6">
        <!-- 系统监控总览：健康状态 + 延迟趋势 -->
        <DashboardSystemOverview />

        <!-- 效率摘要 -->
        <DashboardEfficiencySummary />

        <!-- AI 工作台入口 -->
        <DashboardAiWorkbench />

        <!-- 快速操作 -->
        <DashboardQuickActions />

        <!-- 系统状态列表 -->
        <DashboardSystemStatus />

        <!-- 通知中心 -->
        <DashboardNotificationCenter />
      </div>
    </div>
  </div>
</template>
