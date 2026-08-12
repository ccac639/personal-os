<script setup lang="ts">
import type { ServiceStatus } from './types';

const services: ServiceStatus[] = [
  { name: 'Web', stack: 'Vue 3 · Vite', status: 'online', latency: 12, lastCheck: '刚刚' },
  { name: 'Blog', stack: 'Nuxt 4', status: 'online', latency: 18, lastCheck: '刚刚' },
  { name: 'API', stack: 'NestJS · Fastify', status: 'online', latency: 8, lastCheck: '刚刚' },
  { name: 'Worker', stack: 'Node.js', status: 'online', latency: 5, lastCheck: '刚刚' },
];

function dotColor(status: string) {
  const map: Record<string, string> = {
    online: 'bg-green-500',
    offline: 'bg-red-500',
    warning: 'bg-yellow-500',
  };
  return map[status] || 'bg-surface-800/40';
}

function pingColor(status: string) {
  const map: Record<string, string> = {
    online: 'bg-green-400',
    offline: 'bg-red-400',
    warning: 'bg-yellow-400',
  };
  return map[status] || 'bg-surface-800/30';
}

function statusText(status: string) {
  const map: Record<string, string> = {
    online: '运行中',
    offline: '离线',
    warning: '警告',
  };
  return map[status] || '未知';
}
</script>

<template>
  <section class="border-surface-100 bg-surface-0 rounded-lg border p-5">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-surface-900 text-lg font-semibold">系统状态</h2>
      <span class="text-surface-800/50 text-xs">{{ services.length }} 项服务</span>
    </div>
    <!-- 4 行服务状态项 -->
    <div class="space-y-2.5">
      <div
        v-for="service in services"
        :key="service.name"
        class="border-surface-100 flex items-center gap-3 rounded-lg border px-3 py-2.5"
      >
        <!-- 左侧脉冲状态指示灯 -->
        <span class="relative flex size-2.5 shrink-0">
          <span
            class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
            :class="pingColor(service.status)"
          />
          <span
            class="relative inline-flex size-2.5 rounded-full"
            :class="dotColor(service.status)"
          />
        </span>

        <!-- 中间：服务名称 + 技术栈 -->
        <div class="min-w-0 flex-1">
          <p class="text-surface-900 truncate text-sm font-medium">
            {{ service.name }}
            <span class="text-surface-800/40 text-xs font-normal">
              · {{ statusText(service.status) }}
            </span>
          </p>
          <p class="text-surface-800/50 truncate text-xs">{{ service.stack }}</p>
        </div>

        <!-- 右侧：延迟数字（加粗）+ 时间小字，右对齐 -->
        <div class="shrink-0 text-right">
          <p class="text-surface-900 text-sm font-bold tabular-nums">{{ service.latency }}ms</p>
          <p class="text-surface-800/50 text-xs">{{ service.lastCheck }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
