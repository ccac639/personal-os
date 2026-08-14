<script setup lang="ts">
/**
 * Agents 管理页 —— 真实后端契约（apps/api/src/modules/agents）
 *
 * 功能：
 * - 列表（服务端分页 + q 模糊匹配，关键字输入 250ms 防抖）；
 * - 状态筛选（已启用 / 已停用）与只看收藏（客户端过滤）；
 * - 加载中 / 加载失败（含 requestId + 重试）/ 空状态；
 * - 创建 / 查看 / 编辑 / 删除（删除二次确认）；
 * - 表单与行级 pending 防重复提交；API 失败转用户可读提示并保留 requestId。
 *
 * 设计遵循工作台风格：surface/brand 语义令牌 + Lucide 图标；
 * 移动端：操作按钮常显、flex-wrap 头部、无横向溢出。
 */
import { Loader2, Plus, RefreshCw, Search, SearchX, X } from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { confirm, toast } from '@/app/ui';

import AgentCard from '@/features/agents/agent-card.vue';
import AgentDetailDrawer from '@/features/agents/agent-detail-drawer.vue';
import AgentFormDialog from '@/features/agents/agent-form-dialog.vue';
import { requestIdSuffix } from '@/features/agents/errors';
import { AGENT_STATUS_OPTIONS } from '@/features/agents/meta';
import { useAgentAdminStore } from '@/features/agents/store';
import type { AgentRecord } from '@/features/agents/types';

const store = useAgentAdminStore();

const detailOpen = ref(false);
const detailId = ref<string | null>(null);
const formOpen = ref(false);
const formEditId = ref<string | null>(null);

const detailAgent = computed<AgentRecord | null>(() =>
  detailId.value ? (store.agentById(detailId.value) ?? null) : null,
);
const formAgent = computed<AgentRecord | null>(() =>
  formEditId.value ? (store.agentById(formEditId.value) ?? null) : null,
);

onMounted(() => {
  void store.fetchList();
});

/* ---------- 搜索（服务端 q 模糊匹配，防抖） ---------- */
const SEARCH_DEBOUNCE_MS = 250;
let searchTimer: number | undefined;

function onSearchInput(event: Event): void {
  const q = (event.target as HTMLInputElement).value;
  store.setKeyword(q);
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    void store.fetchList();
  }, SEARCH_DEBOUNCE_MS);
}

function clearSearch(): void {
  window.clearTimeout(searchTimer);
  store.setKeyword('');
  void store.fetchList();
}

onBeforeUnmount(() => {
  window.clearTimeout(searchTimer);
});

/* ---------- 抽屉与表单 ---------- */
function openDetail(id: string): void {
  detailId.value = id;
  detailOpen.value = true;
}

function openEdit(id: string): void {
  formEditId.value = id;
  formOpen.value = true;
}

function openNew(): void {
  formEditId.value = null;
  formOpen.value = true;
}

function onSaved(): void {
  formOpen.value = false;
  formEditId.value = null;
}

/* ---------- 行级操作 ---------- */
async function handleDelete(id: string): Promise<void> {
  const agent = store.agentById(id);
  if (!agent || store.deletingIds.includes(id)) return;
  const ok = await confirm({
    title: '删除智能体',
    message: `确定删除「${agent.name}」吗？删除后不可恢复。`,
    confirmText: '删除',
    tone: 'danger',
  });
  if (!ok) return;
  const done = await store.removeAgent(id);
  if (done) {
    toast.success(`已删除「${agent.name}」`);
    if (detailId.value === id) {
      detailOpen.value = false;
      detailId.value = null;
    }
  } else {
    toast.error(store.actionError?.message ?? '删除失败');
  }
}

async function handleToggleFavorite(id: string): Promise<void> {
  const agent = store.agentById(id);
  if (!agent || store.togglingIds.includes(id)) return;
  const next = !agent.favorite;
  const ok = await store.toggleFavorite(id);
  if (ok) toast.success(next ? `已收藏「${agent.name}」` : `已取消收藏「${agent.name}」`);
  else toast.error(store.actionError?.message ?? '操作失败');
}
</script>

<template>
  <div class="bg-page flex h-full min-h-0 flex-col">
    <!-- 顶栏 -->
    <header
      class="border-surface-100 bg-surface-0/70 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3"
    >
      <div class="min-w-0 flex-1">
        <h1 class="text-surface-900 truncate text-sm font-semibold">Agents 管理</h1>
        <p class="text-surface-800/40 truncate text-[11px]">
          共 {{ store.total }} 个 · 显示 {{ store.visibleAgents.length }} 个
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <button
          class="hover:bg-surface-100 text-surface-800/70 hover:text-surface-900 focus-visible:ring-brand-500/40 border-surface-100 flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
          :disabled="store.listLoading"
          aria-label="刷新列表"
          data-testid="agents-refresh"
          @click="store.fetchList"
        >
          <RefreshCw class="size-3.5" :class="store.listLoading ? 'animate-spin' : ''" />
          刷新
        </button>
        <button
          class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
          aria-label="新建智能体"
          data-testid="agents-new"
          @click="openNew"
        >
          <Plus class="size-3.5" />
          新建智能体
        </button>
      </div>
    </header>

    <!-- 搜索 + 筛选 -->
    <div class="border-surface-100 flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2">
      <div
        class="border-surface-100 focus-within:border-brand-500 bg-surface-50 flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-lg border px-2 transition-colors sm:max-w-xs"
      >
        <Search class="text-surface-800/40 size-3.5 shrink-0" />
        <input
          :value="store.keyword"
          class="w-full min-w-0 bg-transparent text-xs outline-none"
          placeholder="搜索名称 / 描述 / 提示词"
          aria-label="搜索智能体"
          data-testid="agents-search"
          @input="onSearchInput"
        />
        <button
          v-if="store.keyword"
          class="text-surface-800/40 hover:text-surface-900 flex size-4 shrink-0 items-center justify-center rounded transition-colors"
          aria-label="清空搜索"
          @click="clearSearch"
        >
          <X class="size-3" />
        </button>
      </div>

      <div class="flex items-center gap-1" role="group" aria-label="状态筛选">
        <button
          v-for="opt in AGENT_STATUS_OPTIONS"
          :key="opt.key"
          class="focus-visible:ring-brand-500/40 rounded-md px-2 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
          :class="
            store.statusFilter === opt.key
              ? 'bg-surface-100 text-surface-900 font-medium'
              : 'text-surface-800/60 hover:text-surface-900'
          "
          :aria-pressed="store.statusFilter === opt.key"
          :data-testid="`agents-status-${opt.key}`"
          @click="store.setStatusFilter(opt.key)"
        >
          {{ opt.label }}
        </button>
      </div>

      <label
        class="hover:bg-surface-100 flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs"
      >
        <input
          type="checkbox"
          class="accent-brand-500 size-3.5"
          :checked="store.favoritesOnly"
          data-testid="agents-favorites-only"
          @change="store.toggleFavoritesOnly"
        />
        只看收藏
      </label>

      <button
        v-if="store.activeFilterCount > 0"
        class="text-surface-800/60 hover:text-surface-900 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors"
        data-testid="agents-clear-filters"
        @click="store.clearFilters"
      >
        <X class="size-3" />
        清空筛选
      </button>
    </div>

    <!-- 列表区 -->
    <div class="min-h-0 flex-1 overflow-y-auto p-4">
      <!-- 首次加载中 -->
      <div
        v-if="store.listLoading && !store.loaded"
        class="flex h-full flex-col items-center justify-center gap-3"
        role="status"
        data-testid="agents-loading"
      >
        <Loader2 class="text-brand-500 size-5 animate-spin" />
        <p class="text-surface-800/60 text-xs">正在加载智能体…</p>
      </div>

      <!-- 加载失败（首次） -->
      <div
        v-else-if="store.listError && !store.loaded"
        class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
        role="alert"
        data-testid="agents-error"
      >
        <SearchX class="size-8 text-red-500" />
        <div class="flex flex-col gap-1">
          <p class="text-surface-900 text-sm font-medium">加载失败</p>
          <p class="text-surface-800/60 text-xs">
            {{ store.listError.message }}{{ requestIdSuffix(store.listError) }}
          </p>
        </div>
        <button
          class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
          data-testid="agents-retry"
          @click="store.fetchList"
        >
          <RefreshCw class="size-3.5" />
          重试
        </button>
      </div>

      <!-- 空状态 -->
      <div
        v-else-if="store.loaded && store.visibleAgents.length === 0"
        class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
        data-testid="agents-empty"
      >
        <SearchX class="text-surface-800/30 size-8" />
        <div class="flex flex-col gap-1">
          <p class="text-surface-900 text-sm font-medium">
            {{ store.total === 0 ? '还没有智能体' : '没有匹配的智能体' }}
          </p>
          <p class="text-surface-800/40 text-xs">
            {{
              store.total === 0
                ? '创建第一个个人智能体，开始配置你的 AI 助手'
                : '试试调整搜索关键词或清空筛选'
            }}
          </p>
        </div>
        <button
          v-if="store.total === 0"
          class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
          aria-label="新建智能体"
          @click="openNew"
        >
          <Plus class="size-3.5" />
          新建智能体
        </button>
        <button
          v-else
          class="hover:bg-surface-100 text-surface-800/70 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
          @click="store.clearFilters"
        >
          <X class="size-3.5" />
          清空筛选
        </button>
      </div>

      <!-- 卡片网格 -->
      <template v-else>
        <div
          v-if="store.visibleAgents.length > 0"
          class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
        >
          <AgentCard
            v-for="agent in store.visibleAgents"
            :key="agent.id"
            :agent="agent"
            :deleting="store.deletingIds.includes(agent.id)"
            :toggling="store.togglingIds.includes(agent.id)"
            @open="openDetail"
            @edit="openEdit"
            @delete="handleDelete"
            @toggle-favorite="handleToggleFavorite"
          />
        </div>

        <!-- 刷新失败（已加载过，横幅提示 + 重试） -->
        <div
          v-if="store.listError"
          class="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-xs text-red-600"
          role="alert"
          data-testid="agents-refresh-error"
        >
          <span class="min-w-0 flex-1">
            {{ store.listError.message }}{{ requestIdSuffix(store.listError) }}
          </span>
          <button
            class="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-500/10"
            @click="store.fetchList"
          >
            <RefreshCw class="size-3" />
            重试
          </button>
        </div>
      </template>
    </div>

    <!-- 详情抽屉 -->
    <AgentDetailDrawer
      :open="detailOpen"
      :agent="detailAgent"
      @close="detailOpen = false"
      @edit="
        (id) => {
          detailOpen = false;
          openEdit(id);
        }
      "
      @delete="handleDelete"
    />

    <!-- 创建 / 编辑表单 -->
    <AgentFormDialog
      :open="formOpen"
      :agent="formAgent"
      @close="formOpen = false"
      @saved="onSaved"
    />
  </div>
</template>
