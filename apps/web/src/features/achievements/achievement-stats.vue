<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import type { EChartsCoreOption } from 'echarts/core';
import VChart from 'vue-echarts';
import { CalendarDays, Flame, Pin, Tags, Trophy, BarChart3 } from '@lucide/vue';
import {
  DEFAULT_CHART_PALETTE,
  buildAnnualOption,
  buildMonthlyOption,
  resolveChartPalette,
} from './chart';
import { TYPE_META } from './constants';
import { monthlySeries, overviewStats, typeDistribution } from './stats';
import { annualReview, annualSummary } from './annual';
import { yearOptions } from './filters';
import type { ChartPalette } from './chart';
import type { Achievement } from './types';

use([CanvasRenderer, BarChart, GridComponent, TooltipComponent]);

// active 为布尔 prop：缺省时 Vue 会转为 false，用 withDefaults 显式默认 true，
// 保证直接挂载（未传 active）时图表默认启用，仅在显式 false 时懒初始化。
const props = withDefaults(
  defineProps<{
    items: Achievement[];
    /** 概览视图激活时才初始化图表；隐藏时 dispose（配合父级 v-show） */
    active?: boolean;
  }>(),
  { active: true },
);

/** 图表渲染开关：非激活时不创建 ECharts 实例 */
const enabled = computed(() => props.active);

/* ---------- 概览统计（纯函数 + computed 记忆化） ---------- */
const overview = computed(() => overviewStats(props.items));
const dist = computed(() => typeDistribution(props.items));

const STAT_CARDS = computed(() => [
  {
    label: '成果总数',
    value: overview.value.total,
    icon: Trophy,
    cls: 'text-brand-600 bg-brand-500/10',
  },
  {
    label: '今年完成',
    value: overview.value.thisYear,
    icon: CalendarDays,
    cls: 'text-emerald-600 bg-emerald-500/10',
  },
  {
    label: '置顶中',
    value: overview.value.pinned,
    icon: Pin,
    cls: 'text-amber-600 bg-amber-500/10',
  },
  {
    label: '独立标签',
    value: overview.value.tagCount,
    icon: Tags,
    cls: 'text-violet-600 bg-violet-500/10',
  },
]);

/* ---------- ECharts 主题同步 ----------
 * 颜色从 CSS 变量解析：主题切换（documentElement.style 变化）时
 * 通过 MutationObserver 触发重算，卸载时断开观察并交由 VChart 销毁实例。
 * 仅在概览视图激活时挂载观察器：非激活不初始化图表，隐藏时 dispose。
 */
const palette = ref<ChartPalette>(DEFAULT_CHART_PALETTE);
let observer: MutationObserver | null = null;

function syncPalette() {
  const cs = getComputedStyle(document.documentElement);
  palette.value = resolveChartPalette({
    '--color-brand-500': cs.getPropertyValue('--color-brand-500'),
    '--color-surface-100': cs.getPropertyValue('--color-surface-100'),
    '--color-surface-800': cs.getPropertyValue('--color-surface-800'),
  });
}

watch(
  enabled,
  (on) => {
    if (!on) {
      observer?.disconnect();
      observer = null;
      return;
    }
    syncPalette();
    observer = new MutationObserver(syncPalette);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});

/* ---------- 月度趋势 ---------- */
const series = computed(() => monthlySeries(props.items, 24));
const chartOption = computed<EChartsCoreOption>(() =>
  buildMonthlyOption(series.value, palette.value),
);

/** 可访问文本摘要（不依赖图形表达数据） */
const chartSummary = computed(() => {
  const parts = series.value.map((p) => `${p.label}${p.count}项`).join('，');
  return `近 ${series.value.length} 个月每月完成成果数：${parts || '暂无数据'}。`;
});

const distSummary = computed(() =>
  dist.value.map((d) => `${d.label} ${d.count} 项（${d.ratio}%）`).join('，'),
);

/* ---------- 年度回顾 ---------- */
const years = computed(() => yearOptions(props.items));
/** 默认选中最近有数据的年份 */
const reviewYear = ref<number | null>(null);
watch(
  years,
  (ys) => {
    if (ys.length === 0) return;
    if (!reviewYear.value || !ys.includes(reviewYear.value)) reviewYear.value = ys[0]!;
  },
  { immediate: true },
);
function setReviewYear(value: string) {
  const y = Number(value);
  if (Number.isFinite(y)) reviewYear.value = y;
}

const review = computed(() =>
  reviewYear.value != null ? annualReview(props.items, reviewYear.value) : null,
);
const annualOption = computed<EChartsCoreOption | null>(() =>
  review.value ? buildAnnualOption(review.value.monthly, palette.value) : null,
);
const reviewSummary = computed(() => (review.value ? annualSummary(review.value) : ''));

/** 年内「连续产出」提示文本 */
const streakText = computed(() => {
  const r = review.value;
  if (!r) return '';
  if (r.bestStreak.length === 0) return '该年度没有连续产出月份。';
  const tail =
    r.currentStreak.length > 1 && r.currentStreak.end === r.bestStreak.end
      ? `（截至年末的连续段 ${r.currentStreak.length} 个月）`
      : '';
  return `最长连续产出 ${r.bestStreak.length} 个月（${r.bestStreak.start} 至 ${r.bestStreak.end}）${tail}。`;
});
</script>

<template>
  <section class="space-y-4" aria-label="成果统计概览">
    <!-- 概览统计卡 -->
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div
        v-for="card in STAT_CARDS"
        :key="card.label"
        class="border-surface-100/70 bg-surface-0/70 shadow-card flex items-center gap-3 rounded-xl border px-4 py-3 backdrop-blur-xl"
      >
        <span class="flex size-9 shrink-0 items-center justify-center rounded-lg" :class="card.cls">
          <component :is="card.icon" class="size-4" />
        </span>
        <div class="min-w-0">
          <p class="text-surface-900 text-lg leading-tight font-semibold tabular-nums">
            {{ card.value }}
          </p>
          <p class="text-surface-800/50 truncate text-xs">{{ card.label }}</p>
        </div>
      </div>
    </div>

    <!-- 月度趋势 + 类型分布 -->
    <div class="grid gap-3 lg:grid-cols-3">
      <div
        class="border-surface-100/70 bg-surface-0/70 shadow-card rounded-xl border p-4 backdrop-blur-xl lg:col-span-2"
      >
        <div class="mb-2 flex items-center justify-between">
          <h3 class="text-surface-900 text-sm font-semibold">月度成果趋势</h3>
          <span class="text-surface-800/50 text-[10px]">最近 {{ series.length }} 个月</span>
        </div>
        <div v-if="!enabled" class="flex h-44 items-center justify-center">
          <p class="text-surface-800/40 text-xs">概览未激活</p>
        </div>
        <div
          v-else-if="series.length === 0"
          class="flex h-44 flex-col items-center justify-center gap-2"
        >
          <BarChart3 class="text-surface-800/30 size-7" />
          <p class="text-surface-800/50 text-xs">暂无月度数据</p>
        </div>
        <div v-else role="img" :aria-label="chartSummary">
          <VChart class="h-44 w-full" :option="chartOption" autoresize />
        </div>
        <p class="sr-only">{{ chartSummary }}</p>
      </div>

      <div
        class="border-surface-100/70 bg-surface-0/70 shadow-card rounded-xl border p-4 backdrop-blur-xl"
      >
        <h3 class="text-surface-900 mb-3 text-sm font-semibold">类型分布</h3>
        <div v-if="dist.length === 0" class="flex h-44 flex-col items-center justify-center gap-2">
          <Trophy class="text-surface-800/30 size-7" />
          <p class="text-surface-800/50 text-xs">暂无类型分布数据</p>
        </div>
        <ul v-else class="space-y-2.5">
          <li v-for="d in dist" :key="d.type" class="flex items-center gap-2.5">
            <span
              class="flex size-6 shrink-0 items-center justify-center rounded-md"
              :class="TYPE_META[d.type].chip"
            >
              <component :is="TYPE_META[d.type].icon" class="size-3.5" />
            </span>
            <span class="text-surface-800/80 w-16 shrink-0 truncate text-xs">{{ d.label }}</span>
            <div
              class="bg-surface-100/80 h-1.5 min-w-0 flex-1 overflow-hidden rounded-full"
              role="presentation"
            >
              <div
                class="h-full rounded-full transition-[width] duration-500"
                :class="TYPE_META[d.type].dot"
                :style="{ width: `${d.ratio}%` }"
              />
            </div>
            <span class="text-surface-800/50 w-8 shrink-0 text-right text-[10px] tabular-nums">
              {{ d.count }}
            </span>
          </li>
        </ul>
        <p class="sr-only">{{ distSummary }}</p>
      </div>
    </div>

    <!-- 年度回顾 -->
    <div
      class="border-surface-100/70 bg-surface-0/70 shadow-card rounded-xl border p-4 backdrop-blur-xl"
    >
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
          <Flame class="text-brand-600 size-4" />
          年度回顾
        </h3>
        <select
          v-if="years.length > 0"
          class="text-surface-800/80 hover:border-surface-800/30 border-surface-100 bg-surface-0/70 rounded-lg border px-2 py-1.5 text-xs transition outline-none"
          :value="reviewYear ?? ''"
          aria-label="选择回顾年份"
          @change="setReviewYear(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="y in years" :key="y" :value="y">{{ y }} 年</option>
        </select>
      </div>

      <div v-if="review" class="grid gap-3 lg:grid-cols-3">
        <!-- 完成趋势（当年逐月） -->
        <div class="lg:col-span-2">
          <p class="text-surface-800/70 mb-2 text-xs">
            {{ review.year }} 年完成趋势：共
            <span class="text-surface-900 font-semibold tabular-nums">{{ review.total }}</span>
            项
          </p>
          <div v-if="enabled && annualOption" role="img" :aria-label="reviewSummary">
            <VChart class="h-40 w-full" :option="annualOption" autoresize />
          </div>
          <p class="sr-only">{{ reviewSummary }}</p>
        </div>

        <!-- 类型构成 + 连续产出 -->
        <div class="space-y-3">
          <div>
            <p class="text-surface-800/70 mb-2 text-xs">当年类型构成</p>
            <ul v-if="review.total > 0" class="space-y-1.5">
              <li
                v-for="t in review.types"
                :key="t.type"
                class="flex items-center gap-2 text-[11px]"
              >
                <span class="text-surface-800/70 w-14 shrink-0 truncate">{{ t.label }}</span>
                <div
                  class="bg-surface-100/80 h-1 min-w-0 flex-1 overflow-hidden rounded-full"
                  role="presentation"
                >
                  <div
                    class="h-full rounded-full"
                    :class="TYPE_META[t.type].dot"
                    :style="{ width: `${t.ratio}%` }"
                  />
                </div>
                <span class="text-surface-800/50 w-6 shrink-0 text-right tabular-nums">{{
                  t.count
                }}</span>
              </li>
            </ul>
            <p v-else class="text-surface-800/40 text-xs">当年暂无成果</p>
          </div>

          <div>
            <p class="text-surface-800/70 mb-1.5 flex items-center gap-1.5 text-xs">
              <Pin class="size-3.5 text-amber-500" />
              收藏与归档
            </p>
            <div class="space-y-1 text-[11px] leading-relaxed">
              <p v-if="review.total > 0" class="text-surface-800/80">
                当年完成成果中置顶
                <span class="text-surface-900 font-semibold tabular-nums">{{
                  review.pinnedCount
                }}</span>
                项（{{ review.pinnedRatio }}%）、已归档
                <span class="text-surface-900 font-semibold tabular-nums">{{
                  review.archivedCount
                }}</span>
                项（{{ review.archivedRatio }}%）。
              </p>
              <p v-else class="text-surface-800/40">当年暂无成果。</p>
              <p
                v-if="
                  review.total > 0 &&
                  (review.vsPreviousYear.pinned !== 0 || review.vsPreviousYear.archived !== 0)
                "
                class="text-surface-800/60"
              >
                与上一年相比：置顶
                <span
                  class="font-semibold tabular-nums"
                  :class="review.vsPreviousYear.pinned >= 0 ? 'text-emerald-600' : 'text-red-600'"
                >
                  {{ review.vsPreviousYear.pinned > 0 ? '+' : ''
                  }}{{ review.vsPreviousYear.pinned }}
                </span>
                项、归档
                <span
                  class="font-semibold tabular-nums"
                  :class="review.vsPreviousYear.archived >= 0 ? 'text-emerald-600' : 'text-red-600'"
                >
                  {{ review.vsPreviousYear.archived > 0 ? '+' : ''
                  }}{{ review.vsPreviousYear.archived }}
                </span>
                项。
              </p>
            </div>
          </div>

          <div>
            <p class="text-surface-800/70 mb-1.5 flex items-center gap-1.5 text-xs">
              <Flame class="size-3.5 text-amber-500" />
              连续产出
            </p>
            <p
              v-if="review.bestStreak.length > 0"
              class="text-surface-800/80 text-[11px] leading-relaxed"
            >
              {{ streakText }}
            </p>
            <p v-else class="text-surface-800/40 text-xs">该年度没有连续产出月份。</p>
          </div>
        </div>
      </div>

      <!-- 重点成果 -->
      <div
        v-if="review && review.highlights.length > 0"
        class="border-surface-100/70 mt-3 border-t pt-3"
      >
        <p class="text-surface-800/70 mb-2 text-xs">重点成果</p>
        <ul class="flex flex-wrap gap-1.5">
          <li
            v-for="h in review.highlights"
            :key="h.id"
            class="border-surface-100 bg-surface-50/70 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]"
          >
            <span
              class="flex size-4 items-center justify-center rounded"
              :class="TYPE_META[h.type].chip"
            >
              <component :is="TYPE_META[h.type].icon" class="size-2.5" />
            </span>
            <span class="text-surface-800/80 max-w-56 truncate">{{ h.title }}</span>
            <span class="text-surface-800/40 shrink-0 tabular-nums">{{ h.completedAt }}</span>
          </li>
        </ul>
      </div>

      <div v-if="years.length === 0" class="flex h-24 flex-col items-center justify-center gap-2">
        <BarChart3 class="text-surface-800/30 size-7" />
        <p class="text-surface-800/50 text-xs">暂无年度数据</p>
      </div>
    </div>
  </section>
</template>
