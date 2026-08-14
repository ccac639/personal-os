<script setup lang="ts">
/** 概览视图：连接状态 / 版本 / 指标 / 趋势 / 最近错误（分块降级，null 块显示不可用） */
import { computed } from 'vue';
import { RefreshCw } from '@lucide/vue';

import type { Sub2ApiOverview } from '@/services/sub2api';
import { useSub2ApiOverview } from '../hooks';
import { formatCost, formatDateTime, formatDuration, formatNumber, formatUptime } from '../format';
import ErrorBanner from './error-banner.vue';
import StatusBadge from './status-badge.vue';

const { data, isLoading, isError, error, refetch, isFetching } = useSub2ApiOverview();

const overview = computed<Sub2ApiOverview | undefined>(() => data.value);

/** 指标卡：label / value / hint */
interface MetricItem {
  label: string;
  value: string;
  hint?: string;
}

const metrics = computed<MetricItem[]>(() => {
  const stats = overview.value?.blocks.stats;
  const realtime = overview.value?.blocks.realtime;
  const successRate =
    realtime && realtime.error_rate !== undefined
      ? `${Math.max(0, 100 - realtime.error_rate).toFixed(2)}%`
      : '—';
  return [
    { label: '今日请求', value: formatNumber(stats?.today_requests) },
    { label: '今日成功率', value: successRate, hint: realtime ? '近实时错误率口径' : undefined },
    { label: '今日 Token', value: formatNumber(stats?.today_tokens) },
    { label: '今日费用', value: formatCost(stats?.today_cost) },
    {
      label: '平均延迟',
      value: formatDuration(realtime?.average_response_time ?? stats?.average_duration_ms),
    },
    {
      label: 'RPM / TPM',
      value: `${formatNumber(realtime?.requests_per_minute)} / ${formatNumber(stats?.tpm)}`,
    },
    { label: '累计请求', value: formatNumber(stats?.total_requests), hint: '全部历史' },
    {
      label: '累计费用',
      value: formatCost(stats?.total_cost),
      hint: '实际 ' + formatCost(stats?.total_actual_cost),
    },
  ];
});

const counts = computed(() => overview.value?.blocks.counts);

const trendRows = computed(() => overview.value?.blocks.trend?.trend ?? []);

const recentErrors = computed(() => overview.value?.blocks.recentErrors?.items ?? []);
</script>

<template>
  <div class="space-y-3">
    <!-- 连接状态 -->
    <section class="border-surface-100 bg-surface-0/60 rounded border px-3 py-2.5">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <div class="flex items-center gap-2">
          <span class="text-surface-800/50 text-[11px]">连接状态</span>
          <StatusBadge
            :status="overview?.configured ? 'active' : 'inactive'"
            :label="overview?.configured ? '已配置' : '未配置'"
          />
        </div>
        <div class="flex items-center gap-2">
          <span class="text-surface-800/50 text-[11px]">Sub2API 版本</span>
          <span class="text-surface-900 font-mono text-[11px]">
            {{ overview?.blocks.version?.version ?? '—' }}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-surface-800/50 text-[11px]">Base URL</span>
          <span class="text-surface-900 font-mono text-[11px]">{{
            overview?.snapshot.baseUrlMasked ?? '—'
          }}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-surface-800/50 text-[11px]">超时</span>
          <span class="text-surface-900 text-[11px]"
            >{{ overview?.snapshot.timeoutMs ?? '—' }} ms</span
          >
        </div>
        <div class="ml-auto">
          <button
            type="button"
            class="text-surface-800/70 hover:bg-surface-100 flex items-center gap-1 rounded px-2 py-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="isFetching"
            @click="refetch()"
          >
            <RefreshCw class="size-3" :class="{ 'animate-spin': isFetching }" aria-hidden="true" />
            刷新
          </button>
        </div>
      </div>
    </section>

    <ErrorBanner v-if="isError" :error="error" @retry="refetch()" />

    <!-- 加载 / 空态 -->
    <div v-if="isLoading" class="text-surface-800/50 py-10 text-center text-xs" role="status">
      加载概览数据…
    </div>
    <div v-else-if="!overview" class="text-surface-800/50 py-10 text-center text-xs">暂无数据</div>

    <template v-else>
      <!-- 指标网格（2 列移动端，4 列桌面） -->
      <section
        class="border-surface-100 bg-surface-100 grid grid-cols-2 gap-px overflow-hidden rounded border md:grid-cols-4"
      >
        <div v-for="metric in metrics" :key="metric.label" class="bg-surface-0/60 px-3 py-2.5">
          <p class="text-surface-800/50 text-[10px]">{{ metric.label }}</p>
          <p class="text-surface-900 mt-0.5 text-base leading-6 font-semibold tabular-nums">
            {{ metric.value }}
          </p>
          <p v-if="metric.hint" class="text-surface-800/40 mt-0.5 text-[10px]">{{ metric.hint }}</p>
        </div>
      </section>

      <!-- 模型与资源计数 -->
      <section
        class="border-surface-100 bg-surface-100 grid grid-cols-2 gap-px overflow-hidden rounded border md:grid-cols-4"
      >
        <div class="bg-surface-0/60 px-3 py-2.5">
          <p class="text-surface-800/50 text-[10px]">可用模型数</p>
          <p class="text-surface-900 mt-0.5 text-base leading-6 font-semibold tabular-nums">
            {{
              overview.blocks.models !== null
                ? formatNumber(overview.blocks.models.length)
                : '不可用'
            }}
          </p>
        </div>
        <div class="bg-surface-0/60 px-3 py-2.5">
          <p class="text-surface-800/50 text-[10px]">渠道数</p>
          <p class="text-surface-900 mt-0.5 text-base leading-6 font-semibold tabular-nums">
            {{
              counts?.channels !== null && counts?.channels !== undefined
                ? formatNumber(counts.channels)
                : '不可用'
            }}
          </p>
        </div>
        <div class="bg-surface-0/60 px-3 py-2.5">
          <p class="text-surface-800/50 text-[10px]">账号数</p>
          <p class="text-surface-900 mt-0.5 text-base leading-6 font-semibold tabular-nums">
            {{
              counts?.accounts !== null && counts?.accounts !== undefined
                ? formatNumber(counts.accounts)
                : '不可用'
            }}
          </p>
        </div>
        <div class="bg-surface-0/60 px-3 py-2.5">
          <p class="text-surface-800/50 text-[10px]">分组数</p>
          <p class="text-surface-900 mt-0.5 text-base leading-6 font-semibold tabular-nums">
            {{
              counts?.groups !== null && counts?.groups !== undefined
                ? formatNumber(counts.groups)
                : '不可用'
            }}
          </p>
        </div>
      </section>

      <!-- 7 天趋势 -->
      <section class="border-surface-100 bg-surface-0/60 rounded border">
        <div class="border-surface-100 border-b px-3 py-2">
          <h3 class="text-surface-900 text-xs font-medium">近 7 天趋势</h3>
        </div>
        <div
          v-if="trendRows.length === 0"
          class="text-surface-800/50 px-3 py-6 text-center text-[11px]"
        >
          趋势数据不可用
        </div>
        <table v-else class="w-full text-left text-[11px]">
          <thead>
            <tr class="text-surface-800/50 border-surface-100 border-b">
              <th class="px-3 py-1.5 font-medium">日期</th>
              <th class="px-3 py-1.5 text-right font-medium">请求数</th>
              <th class="px-3 py-1.5 text-right font-medium">Token</th>
              <th class="px-3 py-1.5 text-right font-medium">费用</th>
              <th class="px-3 py-1.5 text-right font-medium">实际费用</th>
            </tr>
          </thead>
          <tbody class="text-surface-900">
            <tr
              v-for="row in trendRows"
              :key="row.date"
              class="border-surface-100/60 border-b last:border-0"
            >
              <td class="px-3 py-1.5 tabular-nums">{{ row.date }}</td>
              <td class="px-3 py-1.5 text-right tabular-nums">{{ formatNumber(row.requests) }}</td>
              <td class="px-3 py-1.5 text-right tabular-nums">
                {{ formatNumber(row.total_tokens) }}
              </td>
              <td class="px-3 py-1.5 text-right tabular-nums">{{ formatCost(row.cost) }}</td>
              <td class="px-3 py-1.5 text-right tabular-nums">{{ formatCost(row.actual_cost) }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- 最近错误 -->
      <section class="border-surface-100 bg-surface-0/60 rounded border">
        <div class="border-surface-100 border-b px-3 py-2">
          <h3 class="text-surface-900 text-xs font-medium">最近错误</h3>
        </div>
        <div
          v-if="recentErrors.length === 0"
          class="text-surface-800/50 px-3 py-6 text-center text-[11px]"
        >
          暂无错误记录
        </div>
        <table v-else class="w-full text-left text-[11px]">
          <thead>
            <tr class="text-surface-800/50 border-surface-100 border-b">
              <th class="px-3 py-1.5 font-medium">时间</th>
              <th class="px-3 py-1.5 font-medium">模型</th>
              <th class="px-3 py-1.5 font-medium">阶段</th>
              <th class="px-3 py-1.5 font-medium">状态码</th>
              <th class="px-3 py-1.5 font-medium">信息</th>
            </tr>
          </thead>
          <tbody class="text-surface-900">
            <tr
              v-for="err in recentErrors"
              :key="err.id"
              class="border-surface-100/60 border-b last:border-0"
            >
              <td class="px-3 py-1.5 whitespace-nowrap tabular-nums">
                {{ formatDateTime(err.created_at) }}
              </td>
              <td class="px-3 py-1.5 font-mono">{{ err.model || '—' }}</td>
              <td class="px-3 py-1.5">{{ err.phase || '—' }}</td>
              <td class="px-3 py-1.5">
                <StatusBadge
                  :status="
                    err.status_code >= 500 ? 'error' : err.status_code >= 400 ? 'warn' : 'muted'
                  "
                  :label="String(err.status_code)"
                />
              </td>
              <td class="text-surface-800/70 max-w-[24rem] truncate px-3 py-1.5">
                {{ err.message || '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- 底部说明 -->
      <p class="text-surface-800/40 px-1 text-[10px] leading-4">
        {{
          overview.snapshot.autoRefresh
            ? `自动刷新已开启（每 ${overview.snapshot.refreshIntervalSec} 秒）`
            : '自动刷新未开启'
        }}
        · 统计更新于
        {{ overview.blocks.stats ? formatDateTime(overview.blocks.stats.stats_updated_at) : '—' }} ·
        运行 {{ overview.blocks.stats ? formatUptime(overview.blocks.stats.uptime) : '—' }}
      </p>
    </template>
  </div>
</template>
