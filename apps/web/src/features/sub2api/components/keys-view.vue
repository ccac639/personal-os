<script setup lang="ts">
/** API 凭据视图：创建 / 禁用 / 删除；完整密钥只在创建成功时显示一次 */
import { computed, ref } from 'vue';
import { KeyRound, Plus, SearchX, ShieldCheck } from '@lucide/vue';

import { nextKeyStatus, formatDate, formatDateTime, formatNumber } from '../format';
import {
  useSub2ApiCreateKey,
  useSub2ApiDeleteKey,
  useSub2ApiKeys,
  useSub2ApiToggleKey,
} from '../hooks';
import { confirm } from '@/app/confirm';
import type { Sub2ApiApiKey, Sub2ApiListQuery } from '@/services/sub2api';
import ErrorBanner from './error-banner.vue';
import KeyRevealPanel from './key-reveal-panel.vue';
import PaginationBar from './pagination-bar.vue';
import StatusBadge from './status-badge.vue';

defineProps<{
  /** 分组选项（页面级查询注入，避免重复请求） */
  groups: Array<{ id: number; name: string }>;
}>();

/* ---------- 列表状态 ---------- */
const query = ref<Sub2ApiListQuery>({ page: 1, pageSize: 20, status: 'active' });
const searchInput = ref('');

const { data, isPending, isError, error, refetch } = useSub2ApiKeys(query);

const pageData = computed(() => data.value);
const items = computed(() => pageData.value?.items ?? []);

const total = computed(() => pageData.value?.total ?? 0);
const pages = computed(() => pageData.value?.pages ?? 1);

/** 状态筛选：'' = 全部 / active / inactive */
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

/* ---------- 创建（含密钥一次性展示） ---------- */
const createOpen = ref(false);
const createName = ref('');
const createGroupId = ref<string>('');
const createError = ref<string | null>(null);
const justCreatedKey = ref<Sub2ApiApiKey | null>(null);

const createMutation = useSub2ApiCreateKey();

function openCreate(): void {
  createOpen.value = true;
  createName.value = '';
  createGroupId.value = '';
  createError.value = null;
}

function closeCreate(): void {
  createOpen.value = false;
  createError.value = null;
}

async function submitCreate(): Promise<void> {
  if (createMutation.isPending.value) return Promise.resolve(); // 防重复提交
  const name = createName.value.trim();
  if (!name) {
    createError.value = '请输入名称';
    return;
  }
  createError.value = null;
  try {
    const created = await createMutation.mutateAsync({
      name,
      group_id: createGroupId.value ? Number(createGroupId.value) : null,
    });
    justCreatedKey.value = created;
    createOpen.value = false;
  } catch (err) {
    createError.value = err instanceof Error ? err.message : '创建失败';
  }
}

function dismissReveal(): void {
  justCreatedKey.value = null;
}

/* ---------- 启用/禁用（二次确认 + 乐观更新回滚） ---------- */
const toggleMutation = useSub2ApiToggleKey();
const togglingId = ref<number | null>(null);

async function toggleStatus(key: Sub2ApiApiKey): Promise<void> {
  const next = nextKeyStatus(key);
  const ok = await confirm({
    title: next === 'active' ? '启用凭据' : '禁用凭据',
    message:
      next === 'active'
        ? `确定启用凭据「${key.name}」吗？`
        : `禁用后「${key.name}」将无法调用，确定继续吗？`,
    confirmText: next === 'active' ? '启用' : '禁用',
    tone: next === 'active' ? 'default' : 'danger',
  });
  if (!ok) return;
  togglingId.value = key.id;
  try {
    await toggleMutation.mutateAsync({ id: key.id, status: next });
  } finally {
    togglingId.value = null;
  }
}

/* ---------- 删除（撤销，二次确认） ---------- */
const deleteMutation = useSub2ApiDeleteKey();
const deletingId = ref<number | null>(null);

async function deleteKey(key: Sub2ApiApiKey): Promise<void> {
  const ok = await confirm({
    title: '撤销凭据',
    message: `撤销后「${key.name}」立即失效且无法恢复，确定撤销吗？`,
    confirmText: '撤销',
    tone: 'danger',
  });
  if (!ok) return;
  deletingId.value = key.id;
  try {
    await deleteMutation.mutateAsync(key.id);
  } finally {
    deletingId.value = null;
  }
}
</script>

<template>
  <section class="sub2api-panel">
    <!-- 工具栏：搜索 + 状态筛选 + 新建 -->
    <div class="sub2api-toolbar">
      <input
        v-model="searchInput"
        type="search"
        class="sub2api-input w-56"
        placeholder="搜索名称 / 掩码密钥…"
        @keyup.enter="applySearch"
      />
      <select v-model="statusFilter" class="sub2api-input w-32">
        <option value="">全部状态</option>
        <option value="active">启用</option>
        <option value="inactive">停用</option>
      </select>
      <button type="button" class="sub2api-btn" @click="applySearch">搜索</button>
      <button
        type="button"
        class="sub2api-btn sub2api-btn--primary ml-auto"
        :disabled="createMutation.isPending.value"
        @click="openCreate"
      >
        <Plus class="size-3.5" aria-hidden="true" />
        新建凭据
      </button>
    </div>

    <ErrorBanner v-if="isError" :error="error" @retry="refetch" />

    <!-- 加载 -->
    <div v-else-if="isPending" class="sub2api-empty">
      <span class="sub2api-spinner" aria-hidden="true" />
      加载中…
    </div>

    <!-- 空状态 -->
    <div v-else-if="items.length === 0" class="sub2api-empty">
      <SearchX class="text-surface-800/40 size-5" aria-hidden="true" />
      <span>没有符合条件的凭据</span>
    </div>

    <!-- 表格 -->
    <div v-else class="sub2api-table-wrap">
      <table class="sub2api-table">
        <thead>
          <tr>
            <th>名称</th>
            <th>密钥</th>
            <th>状态</th>
            <th>用量 / 配额</th>
            <th>过期时间</th>
            <th>最近使用</th>
            <th class="w-40">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="key in items" :key="key.id">
            <td>
              <div class="flex items-center gap-1.5 font-medium">
                <KeyRound class="text-surface-800/40 size-3.5" aria-hidden="true" />
                {{ key.name }}
              </div>
              <div v-if="key.group" class="text-surface-800/50 text-[11px]">
                {{ key.group.name }}
              </div>
            </td>
            <td>
              <code class="sub2api-mono">{{ key.key }}</code>
            </td>
            <td><StatusBadge :status="key.status" /></td>
            <td class="text-surface-800/70">
              {{ formatNumber(key.quota_used) }} / {{ formatNumber(key.quota) }}
            </td>
            <td class="text-surface-800/70">{{ formatDate(key.expires_at) }}</td>
            <td class="text-surface-800/50">{{ formatDateTime(key.last_used_at) }}</td>
            <td>
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  class="sub2api-btn sub2api-btn--ghost"
                  :disabled="togglingId === key.id"
                  @click="toggleStatus(key)"
                >
                  {{ nextKeyStatus(key) === 'active' ? '启用' : '禁用' }}
                </button>
                <button
                  type="button"
                  class="sub2api-btn sub2api-btn--danger"
                  :disabled="deletingId === key.id"
                  @click="deleteKey(key)"
                >
                  撤销
                </button>
              </div>
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

    <!-- 创建弹窗 -->
    <div v-if="createOpen" class="sub2api-modal-mask" @click.self="closeCreate">
      <div class="sub2api-modal" role="dialog" aria-modal="true" aria-label="新建凭据">
        <h3 class="sub2api-modal-title">新建 API 凭据</h3>
        <form @submit.prevent="submitCreate">
          <label class="sub2api-field">
            <span>名称 *</span>
            <input
              v-model="createName"
              type="text"
              class="sub2api-input"
              placeholder="例如：本机开发"
            />
          </label>
          <label class="sub2api-field">
            <span>所属分组</span>
            <select v-model="createGroupId" class="sub2api-input">
              <option value="">不绑定分组</option>
              <option v-for="g in groups" :key="g.id" :value="String(g.id)">{{ g.name }}</option>
            </select>
          </label>
          <p v-if="createError" class="sub2api-error-text">{{ createError }}</p>
          <div class="sub2api-modal-actions">
            <button type="button" class="sub2api-btn" @click="closeCreate">取消</button>
            <button
              type="submit"
              class="sub2api-btn sub2api-btn--primary"
              :disabled="createMutation.isPending.value"
            >
              {{ createMutation.isPending.value ? '创建中…' : '创建' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- 创建成功：完整密钥只显示这一次（不持久化） -->
    <KeyRevealPanel
      v-if="justCreatedKey"
      :key-value="justCreatedKey.key"
      :name="justCreatedKey.name"
      @done="dismissReveal"
    />

    <p class="sub2api-hint">
      <ShieldCheck class="size-3.5" aria-hidden="true" />
      完整密钥仅在创建成功后显示一次，不会写入浏览器存储或日志。
    </p>
  </section>
</template>
