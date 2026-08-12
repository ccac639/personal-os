<script setup lang="ts">
import { CheckCircle, XCircle } from '@lucide/vue';
import type { ServiceStatus } from './types';

const services: ServiceStatus[] = [
  {
    name: 'Web (Vue 3 + Vite)',
    status: 'online',
    latency: 12,
    lastCheck: '刚刚',
  },
  {
    name: 'Blog (Nuxt 4)',
    status: 'online',
    latency: 18,
    lastCheck: '刚刚',
  },
  {
    name: 'API (NestJS)',
    status: 'online',
    latency: 8,
    lastCheck: '刚刚',
  },
  {
    name: 'Worker',
    status: 'online',
    latency: 5,
    lastCheck: '刚刚',
  },
];

function getStatusIcon(status: string) {
  return status === 'online' ? CheckCircle : XCircle;
}

function getStatusColor(status: string) {
  const colors = {
    online: 'text-green-600 bg-green-500/10',
    offline: 'text-red-600 bg-red-500/10',
    warning: 'text-yellow-600 bg-yellow-500/10',
  };
  return colors[status as keyof typeof colors] || 'text-surface-800/60 bg-surface-100';
}

function getStatusText(status: string) {
  const texts = {
    online: '运行中',
    offline: '离线',
    warning: '警告',
  };
  return texts[status as keyof typeof texts] || '未知';
}
</script>

<template>
  <section class="border-surface-100 bg-surface-0 rounded-lg border p-6">
    <h2 class="text-surface-900 mb-4 text-lg font-semibold">系统状态</h2>
    <div class="space-y-3">
      <div
        v-for="service in services"
        :key="service.name"
        class="border-surface-100 flex items-center justify-between rounded-lg border p-3"
      >
        <div class="flex items-center gap-3">
          <div
            class="flex size-8 items-center justify-center rounded-lg"
            :class="getStatusColor(service.status)"
          >
            <component :is="getStatusIcon(service.status)" class="size-4" />
          </div>
          <div>
            <p class="text-surface-900 text-sm font-medium">{{ service.name }}</p>
            <p class="text-surface-800/60 text-xs">{{ getStatusText(service.status) }}</p>
          </div>
        </div>
        <div class="text-right">
          <p class="text-surface-800/80 text-sm">{{ service.latency }}ms</p>
          <p class="text-surface-800/60 text-xs">{{ service.lastCheck }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
