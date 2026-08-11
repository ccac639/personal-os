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
    online: 'text-green-600 bg-green-50',
    offline: 'text-red-600 bg-red-50',
    warning: 'text-yellow-600 bg-yellow-50',
  };
  return colors[status as keyof typeof colors] || 'text-gray-600 bg-gray-50';
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
  <section class="rounded-lg border border-neutral-200 bg-white p-6">
    <h2 class="mb-4 text-lg font-semibold text-neutral-900">系统状态</h2>
    <div class="space-y-3">
      <div
        v-for="service in services"
        :key="service.name"
        class="flex items-center justify-between rounded-lg border border-neutral-100 p-3"
      >
        <div class="flex items-center gap-3">
          <div
            class="flex size-8 items-center justify-center rounded-lg"
            :class="getStatusColor(service.status)"
          >
            <component :is="getStatusIcon(service.status)" class="size-4" />
          </div>
          <div>
            <p class="text-sm font-medium text-neutral-900">{{ service.name }}</p>
            <p class="text-xs text-neutral-500">{{ getStatusText(service.status) }}</p>
          </div>
        </div>
        <div class="text-right">
          <p class="text-sm text-neutral-700">{{ service.latency }}ms</p>
          <p class="text-xs text-neutral-500">{{ service.lastCheck }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
