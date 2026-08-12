<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ExternalLink, RefreshCw, Star, TrendingUp } from '@lucide/vue';
import { GITHUB_TREND, TREND_SNAPSHOT_DATE } from './mock';
import type { GithubTrendItem } from './types';

interface Props {
  /** 外部数据覆盖（测试注入） */
  items?: GithubTrendItem[];
  /** 初始加载状态（测试注入；默认 loading 后自动 ready） */
  initialState?: LoadState;
}

const props = withDefaults(defineProps<Props>(), {
  items: undefined,
  initialState: 'loading',
});

type LoadState = 'loading' | 'ready' | 'error';

const state = ref<LoadState>(props.initialState);
const items = ref<GithubTrendItem[]>(props.items ?? []);
let timer: ReturnType<typeof setTimeout> | null = null;
/** 首帧是否已应用 initialState（error 只在首帧生效，重试总是走成功路径） */
let appliedInitial = false;

/** 模拟异步加载（本地 mock；后续接 API 时替换为真实请求） */
function load() {
  state.value = 'loading';
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    items.value = props.items ?? GITHUB_TREND;
    state.value = 'ready';
  }, 500);
}

function retry() {
  load();
}

onMounted(() => {
  if (props.initialState === 'error' && !appliedInitial) {
    appliedInitial = true;
    state.value = 'error';
    return;
  }
  appliedInitial = true;
  load();
});

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});

const rankColors = [
  'bg-amber-500 text-white', // 1
  'bg-slate-400 text-white', // 2
  'bg-orange-400 text-white', // 3
  'bg-surface-800/50 text-surface-900', // 4+
];

function rankClass(rank: number) {
  return rankColors[rank - 1] ?? rankColors[3];
}

const isEmpty = computed(() => state.value === 'ready' && items.value.length === 0);
</script>

<template>
  <section class="border-surface-100 bg-surface-0 flex flex-col rounded-lg border p-5">
    <!-- 头部 -->
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-surface-900 flex items-center gap-1.5 text-sm font-semibold">
        <TrendingUp class="text-brand-600 size-4" />
        GitHub 本周趋势
      </h2>
      <span
        class="bg-brand-500/10 text-brand-600 rounded-full px-2 py-0.5 text-[10px] font-medium"
        title="数据由 AI 于 2026-08-12 搜索抓取 github.com/trending?since=weekly"
      >
        AI 搜索 · {{ TREND_SNAPSHOT_DATE }}
      </span>
    </div>

    <!-- loading：skeleton -->
    <div v-if="state === 'loading'" class="flex-1 space-y-1.5" aria-busy="true" role="status">
      <div
        v-for="i in 6"
        :key="i"
        class="animate-pulse space-y-1.5 rounded-md px-1.5 py-[5px]"
      >
        <div class="bg-surface-100 h-3 w-2/3 rounded" />
        <div class="bg-surface-100/70 h-2.5 w-5/6 rounded" />
      </div>
    </div>

    <!-- error：可重试 -->
    <div v-else-if="state === 'error'" class="flex flex-1 flex-col items-center justify-center gap-2 py-8">
      <p class="text-surface-800/60 text-xs">趋势数据加载失败</p>
      <button
        type="button"
        class="border-surface-100 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition focus-visible:ring-2 focus-visible:outline-none"
        @click="retry"
      >
        <RefreshCw class="size-3.5" />
        重试
      </button>
    </div>

    <!-- 空态 -->
    <div v-else-if="isEmpty" class="flex flex-1 flex-col items-center justify-center gap-2 py-8">
      <Star class="text-surface-800/30 size-6" />
      <p class="text-surface-800/50 text-xs">本周暂无趋势数据</p>
    </div>

    <!-- ready：Top 10 列表 -->
    <ol v-else class="flex-1 space-y-1">
      <li v-for="repo in items" :key="repo.name">
        <a
          :href="repo.url"
          target="_blank"
          rel="noopener noreferrer"
          class="hover:bg-surface-50 group flex items-center gap-2 rounded-md px-1.5 py-[5px] transition"
          :title="`${repo.description}\n总 Star: ${repo.stars}`"
        >
          <!-- 排名：窄屏不挤压 -->
          <span
            class="flex size-4.5 shrink-0 items-center justify-center rounded text-[10px] font-bold tabular-nums"
            :class="rankClass(repo.rank)"
          >
            {{ repo.rank }}
          </span>

          <!-- 仓库信息 -->
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-1">
              <span class="text-surface-900 truncate text-xs font-medium">{{ repo.name }}</span>
              <ExternalLink
                class="text-surface-800/30 group-hover:text-surface-800/70 size-3 shrink-0 opacity-0 transition group-hover:opacity-100"
              />
            </span>
            <span class="text-surface-800/50 line-clamp-2 block text-[10px] leading-4">
              {{ repo.description }}
            </span>
          </span>

          <!-- star：增长绿色强调 -->
          <span class="shrink-0 text-right">
            <span
              class="flex items-center justify-end gap-0.5 text-xs font-semibold text-green-600 tabular-nums"
            >
              <Star class="size-3 fill-current" />
              {{ repo.deltaStars }}
            </span>
            <span class="text-surface-800/40 block text-[10px] tabular-nums">
              {{ repo.stars }} ★
            </span>
          </span>
        </a>
      </li>
    </ol>

    <!-- 底部 -->
    <a
      href="https://github.com/trending?since=weekly"
      target="_blank"
      rel="noopener noreferrer"
      class="text-brand-600 hover:text-brand-700 border-surface-100 mt-3 flex items-center justify-center gap-1 border-t pt-2.5 text-xs font-medium transition"
    >
      在 GitHub 查看完整趋势
      <ExternalLink class="size-3" />
    </a>
  </section>
</template>
