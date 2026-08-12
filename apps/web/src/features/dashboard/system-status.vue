<script setup lang="ts">
import { SYSTEM_SERVICES } from './mock';
import type { ServiceStatus, ServiceStatusType } from './types';

interface Props {
  /** 外部数据覆盖（测试注入） */
  services?: ServiceStatus[];
}

const props = withDefaults(defineProps<Props>(), {
  services: undefined,
});

const services = props.services ?? SYSTEM_SERVICES;

const STATUS_CONFIG: Record<
  ServiceStatusType,
  { label: string; dot: string; text: string; ping?: boolean }
> = {
  online: { label: '运行中', dot: 'bg-green-500', text: 'text-green-600', ping: true },
  degraded: { label: '降级', dot: 'bg-orange-500', text: 'text-orange-600', ping: true },
  offline: { label: '离线', dot: 'bg-red-500', text: 'text-red-600' },
  unknown: { label: '未知', dot: 'bg-surface-800/40', text: 'text-surface-800/50' },
};

function dotColor(status: ServiceStatusType) {
  return STATUS_CONFIG[status].dot;
}

function statusText(status: ServiceStatusType) {
  return STATUS_CONFIG[status].label;
}

function statusTextColor(status: ServiceStatusType) {
  return STATUS_CONFIG[status].text;
}
</script>

<template>
  <section class="border-surface-100 bg-surface-0 rounded-lg border p-5">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-surface-900 text-lg font-semibold">系统状态</h2>
      <span class="text-surface-800/50 text-xs">{{ services.length }} 项服务</span>
    </div>
    <!-- 服务列表：高度受控，超出内部滚动，不撑破首页 -->
    <div class="max-h-[280px] space-y-2.5 overflow-y-auto pr-0.5">
      <div
        v-for="service in services"
        :key="service.name"
        class="border-surface-100 flex items-center gap-3 rounded-lg border px-3 py-2.5"
      >
        <!-- 左侧脉冲状态指示灯：unknown 不显示绿色 -->
        <span class="relative flex size-2.5 shrink-0">
          <span
            v-if="STATUS_CONFIG[service.status].ping"
            class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
            :class="dotColor(service.status)"
          />
          <span class="relative inline-flex size-2.5 rounded-full" :class="dotColor(service.status)" />
        </span>

        <!-- 中间：服务名称 + 技术栈 + 状态文字 -->
        <div class="min-w-0 flex-1">
          <p class="text-surface-900 truncate text-sm font-medium">
            {{ service.name }}
            <span class="text-xs font-normal" :class="statusTextColor(service.status)">
              · {{ statusText(service.status) }}
            </span>
          </p>
          <p class="text-surface-800/50 truncate text-xs">{{ service.stack }}</p>
        </div>

        <!-- 右侧：延迟数字（分级颜色）+ 检查时间 -->
        <div class="shrink-0 text-right">
          <p
            v-if="service.latency !== undefined"
            class="text-surface-900 text-sm font-bold tabular-nums"
            :class="{
              'text-green-600': service.status === 'online',
              'text-orange-600': service.status === 'degraded',
              'text-red-600': service.status === 'offline',
            }"
          >
            {{ service.latency }}ms
          </p>
          <p v-else class="text-surface-800/40 text-sm font-bold tabular-nums">--</p>
          <p class="text-surface-800/50 text-xs">{{ service.lastCheck }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
