<script setup lang="ts">
/**
 * Chat 工作台 —— 智能体中心
 *
 * 个人智能体目录：搜索 / 分类 / 收藏 / 排序 / 详情抽屉 / 启动面板 / 变体表单。
 * 从消息或灵感预填变体表单时自动打开表单并跳转到本视图。
 */
import { Copy, Loader2, Plus, RefreshCw, Search, Trash2, X } from '@lucide/vue';
import { computed, ref, watch } from 'vue';

import AgentCard from '@/features/chat/components/agent-card.vue';
import AgentDetailDrawer from '@/features/chat/components/agent-detail-drawer.vue';
import AgentFormDialog from '@/features/chat/components/agent-form-dialog.vue';
import AgentLaunchPanel from '@/features/chat/components/agent-launch-panel.vue';
import { AGENT_CATEGORIES } from '@/features/chat/agents';
import { useAgentsStore } from '@/features/chat/agent-store';
import { useChatStore } from '@/features/chat/store';
import { pushToast } from '@/features/chat/toast';
import { requestIdSuffix } from '@/features/agents/errors';
import { useRouter } from 'vue-router';

const store = useAgentsStore();
const chatStore = useChatStore();
const router = useRouter();

const detailId = ref<string | null>(null);
const detailOpen = ref(false);
const launchId = ref<string | null>(null);
const launchOpen = ref(false);
const formOpen = ref(false);
const formEditId = ref<string | null>(null);
const formCopyFromId = ref<string | null>(null);
/** 表单预填（来自消息 / 灵感） */
const formPrefill = ref<{
  title: string;
  prompt: string;
  source: 'message' | 'inspiration';
} | null>(null);

const sortOptions = [
  { key: 'default', label: '默认排序' },
  { key: 'recent', label: '最近使用' },
  { key: 'usage', label: '使用次数' },
  { key: 'name', label: '名称' },
] as const;

const visibleCount = computed(() => store.visibleAgents.length);
const totalCount = computed(() => store.agents.filter((a) => !a.hidden).length);

function openDetail(id: string) {
  detailId.value = id;
  detailOpen.value = true;
}

function openNewForm() {
  formEditId.value = null;
  formCopyFromId.value = null;
  formPrefill.value = null;
  formOpen.value = true;
}

function openEdit(id: string) {
  formEditId.value = id;
  formCopyFromId.value = null;
  formPrefill.value = null;
  formOpen.value = true;
}

function openCopy(id: string) {
  formEditId.value = null;
  formCopyFromId.value = id;
  formPrefill.value = null;
  formOpen.value = true;
}

function handleLaunch(id: string) {
  launchId.value = id;
  launchOpen.value = true;
}

function onLaunched(sessionId: string) {
  launchOpen.value = false;
  launchId.value = null;
  void router.push('/chat');
  void chatStore.selectSession(sessionId);
}

async function handleDelete(id: string) {
  const ok = await store.deleteAgent(id);
  if (ok) {
    pushToast('已删除个人智能体', 'info');
  } else if (store.actionError) {
    pushToast(store.actionError.message + requestIdSuffix(store.actionError), 'error');
  } else {
    pushToast('内置智能体不可删除，可隐藏', 'warning');
  }
}

async function handleToggleHidden(id: string) {
  const ok = await store.toggleHidden(id);
  if (!ok && store.actionError) {
    pushToast(store.actionError.message + requestIdSuffix(store.actionError), 'error');
  }
}

/** 预填（消息 / 灵感 → 创建变体）到达时打开表单 */
watch(
  () => store.pendingPrefill,
  (p) => {
    if (!p) return;
    formEditId.value = null;
    formCopyFromId.value = null;
    formPrefill.value = {
      title: p.title,
      prompt: p.prompt,
      source: p.source,
    };
    formOpen.value = true;
    store.clearPrefill();
  },
);
</script>

<template>
  <div class="bg-page absolute inset-0 flex overflow-hidden">
    <!-- 左侧筛选栏（桌面固定 / 窄屏隐藏，由顶栏按钮唤起） -->
    <aside
      class="border-surface-100 bg-surface-0/50 hidden w-52 shrink-0 flex-col border-r md:flex"
    >
      <div class="flex flex-col gap-3 p-3">
        <div
          class="border-surface-100 focus-within:border-brand-500 bg-surface-50 flex items-center gap-1.5 rounded-lg border px-2 transition-colors"
        >
          <Search class="text-surface-800/40 size-3.5 shrink-0" />
          <input
            v-model="store.filters.keyword"
            class="h-8 w-full min-w-0 bg-transparent text-xs outline-none"
            placeholder="搜索智能体"
            aria-label="搜索智能体"
          />
        </div>

        <div class="flex flex-col gap-0.5" role="list" aria-label="智能体类别">
          <button
            v-for="c in AGENT_CATEGORIES"
            :key="c.key"
            class="hover:bg-surface-100 text-surface-800/70 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
            :class="store.filters.category === c.key ? 'bg-surface-100 text-surface-900' : ''"
            :aria-pressed="store.filters.category === c.key"
            @click="store.setCategory(store.filters.category === c.key ? 'all' : c.key)"
          >
            <span class="size-1.5 shrink-0 rounded-full" :style="{ background: c.color }" />
            {{ c.label }}
          </button>
        </div>

        <label
          class="hover:bg-surface-100 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs"
        >
          <input
            type="checkbox"
            class="accent-brand-500 size-3.5"
            :checked="store.filters.favoritesOnly"
            @change="store.toggleFavoritesOnly"
          />
          只看收藏
        </label>

        <div class="flex flex-col gap-1">
          <label class="text-surface-800/40 px-2 text-[10px]">排序</label>
          <select
            class="border-surface-100 bg-surface-50 rounded-lg border px-2 py-1.5 text-xs outline-none"
            :value="store.sortBy"
            aria-label="排序方式"
            @change="
              store.setSortBy(($event.target as HTMLSelectElement).value as typeof store.sortBy)
            "
          >
            <option v-for="o in sortOptions" :key="o.key" :value="o.key">{{ o.label }}</option>
          </select>
        </div>

        <button
          v-if="store.activeFilterCount > 0"
          class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors"
          @click="store.clearFilters"
        >
          <X class="size-3" />
          清空筛选（{{ store.activeFilterCount }}）
        </button>
      </div>
    </aside>

    <!-- 主区 -->
    <main class="flex min-w-0 flex-1 flex-col">
      <!-- 顶栏 -->
      <header class="border-surface-100 flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <div class="min-w-0 flex-1">
          <p class="text-surface-900 truncate text-sm font-medium">智能体中心</p>
          <p class="text-surface-800/40 truncate text-[10px]">
            共 {{ totalCount }} 个 · 显示 {{ visibleCount }} 个
          </p>
        </div>
        <button
          class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
          aria-label="新建智能体"
          @click="openNewForm"
        >
          <Plus class="size-3.5" />
          新建智能体
        </button>
      </header>

      <!-- 卡片区域：加载中 / 失败重试 / 网格 / 空目录 / 无匹配 -->
      <div class="min-h-0 flex-1 overflow-y-auto p-3">
        <!-- 加载中 -->
        <div
          v-if="store.listLoading"
          class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center"
        >
          <Loader2 class="text-brand-500 size-5 animate-spin" />
          <p class="text-surface-800/60 text-sm">正在加载智能体…</p>
        </div>

        <!-- 加载失败（保留 requestId） -->
        <div
          v-else-if="store.listError"
          class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
          role="alert"
        >
          <p class="text-surface-800/70 text-sm">{{ store.listError.message }}</p>
          <p v-if="store.listError.requestId" class="text-surface-800/40 text-[10px]">
            requestId: {{ store.listError.requestId }}
          </p>
          <button
            class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
            aria-label="重试加载"
            @click="store.retry()"
          >
            <RefreshCw class="size-3.5" />
            重试
          </button>
        </div>

        <!-- 卡片网格 -->
        <div
          v-else-if="store.visibleAgents.length > 0"
          class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
        >
          <div v-for="agent in store.visibleAgents" :key="agent.id" class="group relative">
            <AgentCard :agent="agent" @open="openDetail" @launch="handleLaunch" />
            <div
              class="absolute top-2 right-9 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
            >
              <button
                class="bg-surface-0/90 hover:text-brand-600 focus-visible:ring-brand-500/40 flex size-6 items-center justify-center rounded-md shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
                :aria-label="`复制为变体 ${agent.name}`"
                :title="'复制为变体'"
                @click="openCopy(agent.id)"
              >
                <Copy class="size-3" />
              </button>
              <button
                v-if="!agent.builtin"
                class="bg-surface-0/90 focus-visible:ring-brand-500/40 flex size-6 items-center justify-center rounded-md shadow-sm transition-colors hover:text-red-500 focus-visible:ring-2 focus-visible:outline-none"
                :aria-label="`删除 ${agent.name}`"
                :title="'删除'"
                @click="handleDelete(agent.id)"
              >
                <Trash2 class="size-3" />
              </button>
              <button
                v-else
                class="bg-surface-0/90 hover:text-surface-900 focus-visible:ring-brand-500/40 flex h-6 items-center justify-center rounded-md px-1.5 text-[10px] shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
                :aria-label="`隐藏 ${agent.name}`"
                :title="'隐藏'"
                @click="handleToggleHidden(agent.id)"
              >
                隐藏
              </button>
            </div>
          </div>
        </div>

        <!-- 空目录（后端无数据） -->
        <div
          v-else-if="store.agents.length === 0"
          class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
        >
          <p class="text-surface-800/60 text-sm">还没有智能体</p>
          <p class="text-surface-800/40 text-xs">创建一个个人智能体，或稍后由后端补充内置模板</p>
          <button
            class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
            aria-label="新建智能体"
            @click="openNewForm"
          >
            <Plus class="size-3.5" />
            新建智能体
          </button>
        </div>

        <!-- 无匹配（筛选后为空） -->
        <div v-else class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <p class="text-surface-800/60 text-sm">没有匹配的智能体</p>
          <p class="text-surface-800/40 text-xs">试试清空筛选，或新建一个个人智能体</p>
          <button
            class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
            aria-label="新建智能体"
            @click="openNewForm"
          >
            <Plus class="size-3.5" />
            新建智能体
          </button>
        </div>
      </div>
    </main>

    <!-- 详情抽屉 -->
    <AgentDetailDrawer
      :open="detailOpen"
      :agent-id="detailId"
      @close="detailOpen = false"
      @launch="handleLaunch"
      @edit="openEdit"
    />

    <!-- 启动面板 -->
    <AgentLaunchPanel
      :open="launchOpen"
      :agent-id="launchId"
      @close="launchOpen = false"
      @launched="onLaunched"
    />

    <!-- 创建 / 编辑变体表单 -->
    <AgentFormDialog
      :open="formOpen"
      :edit-id="formEditId"
      :copy-from-id="formCopyFromId"
      :prefill="formPrefill"
      @close="formOpen = false"
    />
  </div>
</template>
