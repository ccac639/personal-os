<script setup lang="ts">
import { CheckCircle, Clock, GitCommit, Workflow } from '@lucide/vue';
import type { ActivityItem } from './types';

const activities: ActivityItem[] = [
  {
    id: '1',
    type: 'commit',
    title: '完成 Dashboard 组件开发',
    description: '新增统计卡片、快速操作、最近项目等核心组件',
    timestamp: '2 分钟前',
    icon: GitCommit,
  },
  {
    id: '2',
    type: 'project',
    title: 'Personal OS 项目进度更新',
    description: '前端框架搭建完成，进入功能开发阶段',
    timestamp: '1 小时前',
    icon: CheckCircle,
  },
  {
    id: '3',
    type: 'workflow',
    title: '创建新的工作流模板',
    description: 'AI Agent 任务编排工作流已就绪',
    timestamp: '3 小时前',
    icon: Workflow,
  },
  {
    id: '4',
    type: 'system',
    title: '开发环境状态检查',
    description: '所有服务运行正常：Web、Blog、API、Worker',
    timestamp: '5 小时前',
    icon: CheckCircle,
  },
];

function getActivityColor(type: string) {
  const colors = {
    commit: 'text-blue-600 bg-blue-50',
    project: 'text-green-600 bg-green-50',
    workflow: 'text-purple-600 bg-purple-50',
    system: 'text-gray-600 bg-gray-50',
  };
  return colors[type as keyof typeof colors] || 'text-gray-600 bg-gray-50';
}
</script>

<template>
  <section class="rounded-lg border border-neutral-200 bg-white p-6">
    <h2 class="mb-4 text-lg font-semibold text-neutral-900">最近活动</h2>
    <div class="space-y-4">
      <div v-for="activity in activities" :key="activity.id" class="flex gap-3">
        <div
          class="flex size-10 shrink-0 items-center justify-center rounded-lg"
          :class="getActivityColor(activity.type)"
        >
          <component :is="activity.icon" class="size-5" />
        </div>
        <div class="flex-1">
          <h3 class="text-sm font-medium text-neutral-900">{{ activity.title }}</h3>
          <p class="mt-0.5 text-sm text-neutral-600">{{ activity.description }}</p>
          <div class="mt-1 flex items-center gap-1 text-xs text-neutral-500">
            <Clock class="size-3" />
            {{ activity.timestamp }}
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
