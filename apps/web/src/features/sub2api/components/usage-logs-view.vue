<script setup lang="ts">
/** 请求日志视图：分页 / 筛选 / 详情抽屉（敏感信息默认不展示） */
import { computed, ref } from 'vue';
import { FileText, SearchX, X } from '@lucide/vue';

import { formatCost, formatDateTime, formatDuration, formatNumber } from '../format';
import { useSub2ApiUsage, useSub2ApiUsageStats } from '../hooks';
import type { Sub2ApiListQuery, Sub2ApiUsageLog } from '@/services/sub2api';
import ErrorBanner from './error-banner.vue';
import PaginationBar from './pagination-bar.vue';
import StatusBadge from './status-badge.vue';

/* ---------- 列表 ---------- */
const query = ref<Sub2ApiListQuery>({ page: 1, pageSize: 20 });
const searchInput = ref('');

const { data, isPending, isError, error, refetch } = useSub2ApiUsage(query);
const statsQuery = useSub2ApiUsageStats(query);

const pageData = computed(() => data.value);
const items = computed(() => pageData.value?.items ?? []);
const total = computed(() => pageData.value?.total ?? 0);
const pages = computed(() => pageData.value?.pages ?? 1);

const stats = computed(() => statsQuery.data.value);

/** 状态筛选：success / error / all */
const statusFilter = computed({
  get: () => query.value.status ?? '',
  set: (value: string) => {
    query.value = { ...query.value, status: value || undefined, page: 1 };
  },
});

function applySearch(): void {
  query.value = { ...query.value, search: searchInput.value.trim() || undefined, page: 1 };
}

function changePage(page: number): void {
  query.value = { ...query.value, page };
}

/* ---------- 详情抽屉 ---------- */
const detail = ref<Sub2ApiUsageLog | null>(null);

function openDetail(log: Sub2ApiUsageLog): void {
  detail.value = log;
}

function closeDetail(): void {
  detail.value = null;
}

/** 行内状态（由 duration_ms 推断：null = 失败） */
function rowStatus(log: Sub2ApiUsageLog): string {
  return log.duration_ms === null ? 'error' : 'success';
}

function requestTypeLabel(log: Sub2ApiUsageLog): string {
  if (log.request_type === 'chat' || log.request_type === 'chat_completions') return '对话';
  if (log.request_type === 'embeddings') return '向量';
  if (log.request_type === 'images') return '图像';
  if (log.request_type === 'gemini') return 'Gemini';
  return log.request_type ?? '—';
}
</script>

<template>
  <section class="sub2api-panel">
    <!-- 汇总条 -->
    <div v-if="stats" class="sub2api-stat-row sub2api-stat-row--compact">
      <div class="sub2api-stat">
        <span class="sub2api-stat__label">请求数</span>
        <span class="sub2api-stat__value">{{ formatNumber(stats.total_requests) }}</span>
      </div>
      <div class="sub2api-stat">
        <span class="sub2api-stat__label">Token</span>
        <span class="sub2api-stat__value">{{ formatNumber(stats.total_tokens) }}</span>
      </div>
      <div class="sub2api-stat">
        <span class="sub2api-stat__label">费用</span>
        <span class="sub2api-stat__value">{{ formatCost(stats.total_cost) }}</span>
      </div>
      <div class="sub2api-stat">
        <span class="sub2api-stat__label">平均耗时</span>
        <span class="sub2api-stat__value">{{ formatDuration(stats.average_duration_ms) }}</span>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="sub2api-toolbar">
      <input
        v-model="searchInput"
        type="search"
        class="sub2api-input w-56"
        placeholder="搜索 requestId / 模型…"
        @keyup.enter="applySearch"
      />
      <select v-model="statusFilter" class="sub2api-input w-32">
        <option value="">全部状态</option>
        <option value="success">成功</option>
        <option value="error">失败</option>
      </select>
      <button type="button" class="sub2api-btn" @click="applySearch">搜索</button>
    </div>

    <ErrorBanner v-if="isError" :error="error" @retry="refetch" />

    <div v-else-if="isPending" class="sub2api-empty">
      <span class="sub2api-spinner" aria-hidden="true" />
      加载中…
    </div>

    <div v-else-if="items.length === 0" class="sub2api-empty">
      <SearchX class="text-surface-800/40 size-5" aria-hidden="true" />
      <span>没有符合条件的请求日志</span>
    </div>

    <!-- 表格 -->
    <div v-else class="sub2api-table-wrap">
      <table class="sub2api-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>模型</th>
            <th>类型</th>
            <th>状态</th>
            <th>延迟</th>
            <th>Token</th>
            <th>费用</th>
            <th>requestId</th>
            <th class="w-16">详情</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in items" :key="log.id">
            <td class="text-surface-800/70 whitespace-nowrap">
              {{ formatDateTime(log.created_at) }}
            </td>
            <td class="max-w-40 truncate font-medium" :title="log.model">{{ log.model }}</td>
            <td class="text-surface-800/60">{{ requestTypeLabel(log) }}</td>
            <td><StatusBadge :status="rowStatus(log)" /></td>
            <td class="text-surface-800/70">{{ formatDuration(log.duration_ms) }}</td>
            <td class="text-surface-800/70">
              {{ formatNumber(log.input_tokens + log.output_tokens) }}
            </td>
            <td class="text-surface-800/70">{{ formatCost(log.total_cost) }}</td>
            <td>
              <code class="sub2api-mono block max-w-28 truncate" :title="log.request_id">{{
                log.request_id
              }}</code>
            </td>
            <td>
              <button type="button" class="sub2api-btn sub2api-btn--ghost" @click="openDetail(log)">
                <FileText class="size-3.5" aria-hidden="true" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <PaginationBar
      v-if="items.length > 0"
      :page="pageData?.page ?? 1"
      :page-size="pageData?.page_size ?? 20"
      :total="total"
      :pages="pages"
      :loading="isPending"
      @change="changePage"
    />

    <!-- 详情抽屉：默认不展示 Prompt / 密钥 / 敏感 Header -->
    <Teleport to="body">
      <div v-if="detail" class="sub2api-drawer-mask" @click.self="closeDetail">
        <aside class="sub2api-drawer" role="dialog" aria-modal="true" aria-label="请求详情">
          <div class="sub2api-drawer__head">
            <h3 class="sub2api-modal-title">请求详情</h3>
            <button type="button" class="sub2api-btn sub2api-btn--ghost" @click="closeDetail">
              <X class="size-4" aria-hidden="true" />
            </button>
          </div>
          <dl class="sub2api-dl">
            <dt>requestId</dt>
            <dd>
              <code class="sub2api-mono">{{ detail.request_id }}</code>
            </dd>
            <dt>时间</dt>
            <dd>{{ formatDateTime(detail.created_at) }}</dd>
            <dt>模型</dt>
            <dd>{{ detail.model }}</dd>
            <dt v-if="detail.upstream_model">上游模型</dt>
            <dd v-if="detail.upstream_model">{{ detail.upstream_model }}</dd>
            <dt>状态</dt>
            <dd><StatusBadge :status="rowStatus(detail)" /></dd>
            <dt>延迟</dt>
            <dd>{{ formatDuration(detail.duration_ms) }}</dd>
            <dt>Token（输入 / 输出 / 缓存）</dt>
            <dd>
              {{ formatNumber(detail.input_tokens) }} / {{ formatNumber(detail.output_tokens) }} /
              {{ formatNumber(detail.cache_creation_tokens + detail.cache_read_tokens) }}
            </dd>
            <dt>费用（实际）</dt>
            <dd>{{ formatCost(detail.total_cost) }}（{{ formatCost(detail.actual_cost) }}）</dd>
            <dt>流式</dt>
            <dd>{{ detail.stream ? '是' : '否' }}</dd>
          </dl>
          <div class="sub2api-drawer__foot">
            <p class="sub2api-hint">Prompt、密钥与敏感 Header 默认不展示，防止凭据外泄。</p>
          </div>
        </aside>
      </div>
    </Teleport>
  </section>
</template>
