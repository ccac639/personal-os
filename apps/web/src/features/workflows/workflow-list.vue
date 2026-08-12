<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  ArrowRight,
  CircleCheck,
  CircleX,
  Copy,
  FileText,
  Pencil,
  Plus,
  ScrollText,
  Sparkles,
  Star,
  Trash2,
  TriangleAlert,
  Workflow,
  X,
} from '@lucide/vue';
import type { Component } from 'vue';
import { useWorkflowStore, type WorkflowLastRun } from './store';

const store = useWorkflowStore();

/** 运行状态徽标（无记录 = 未运行） */
const STATUS_META: Record<
  WorkflowLastRun['status'] | 'never',
  { label: string; icon: Component; cls: string }
> = {
  success: { label: '成功', icon: CircleCheck, cls: 'text-green-600 bg-green-500/10' },
  failed: { label: '失败', icon: CircleX, cls: 'text-red-600 bg-red-500/10' },
  never: { label: '未运行', icon: CircleX, cls: 'text-surface-800/50 bg-surface-100' },
};

const emit = defineEmits<{ openCanvas: [id: string] }>();

/** 打开工作流并切换到画布视图 */
function openWorkflow(id: string) {
  emit('openCanvas', id);
}

/** 新建工作流并直接进入画布编辑 */
function createWorkflow() {
  const id = store.createWorkflow('未命名工作流');
  emit('openCanvas', id);
}

/* ---------- 重命名（内联编辑） ---------- */
const editingId = ref<string | null>(null);
const draft = ref('');

function startRename(id: string, current: string) {
  editingId.value = id;
  draft.value = current;
}
function commitRename() {
  if (editingId.value) store.renameWorkflow(editingId.value, draft.value);
  editingId.value = null;
}
function cancelRename() {
  editingId.value = null;
}

/* ---------- 复制 / 删除 / 收藏 / 模板 ---------- */
function duplicate(id: string) {
  store.duplicateWorkflow(id);
}
function remove(id: string, name: string) {
  if (confirm(`确定删除工作流「${name}」？此操作不可恢复。`)) {
    store.deleteWorkflow(id);
  }
}
function toggleFavorite(id: string) {
  store.toggleFavorite(id);
}
function toggleTemplate(id: string) {
  store.toggleTemplate(id);
}
function fromTemplate(id: string) {
  const copyId = store.createFromTemplate(id);
  if (copyId) emit('openCanvas', copyId);
}

/* ---------- 详情编辑（描述 / 标签） ---------- */
const detailTarget = ref<{ id: string; name: string; description: string; tags: string[] } | null>(
  null,
);
const detailDescription = ref('');
const detailTags = ref('');

function openDetail(id: string) {
  const wf = store.workflows.find((w) => w.id === id);
  if (!wf) return;
  detailTarget.value = { id, name: wf.name, description: wf.description, tags: wf.tags };
  detailDescription.value = wf.description;
  detailTags.value = wf.tags.join('，');
}
function saveDetail() {
  if (!detailTarget.value) return;
  const tags = detailTags.value
    .split(/[，,]/)
    .map((t) => t.trim())
    .filter(Boolean);
  store.updateMeta(detailTarget.value.id, {
    description: detailDescription.value,
    tags,
  });
  detailTarget.value = null;
}
function closeDetail() {
  detailTarget.value = null;
}

/* ---------- 筛选 / 排序 ---------- */

type StatusFilter = 'all' | 'success' | 'failed' | 'never' | 'template' | 'favorite';
const statusFilter = ref<StatusFilter>('all');
const keyword = ref('');
const sortKey = ref<'updated' | 'name' | 'lastRun'>('updated');

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'favorite', label: '收藏' },
  { value: 'template', label: '模板' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
  { value: 'never', label: '未运行' },
];

const SORT_LABELS: Record<typeof sortKey.value, string> = {
  updated: '最近编辑',
  name: '名称',
  lastRun: '最近运行',
};

const filteredWorkflows = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  let items = [...store.workflows];
  if (statusFilter.value === 'favorite') items = items.filter((w) => w.favorite);
  else if (statusFilter.value === 'template') items = items.filter((w) => w.isTemplate);
  else if (statusFilter.value !== 'all') {
    items = items.filter((w) => (w.lastRun?.status ?? 'never') === statusFilter.value);
  }
  if (kw) {
    items = items.filter(
      (w) =>
        w.name.toLowerCase().includes(kw) ||
        w.tags.some((t) => t.toLowerCase().includes(kw)) ||
        w.description.toLowerCase().includes(kw),
    );
  }
  if (sortKey.value === 'name') {
    items.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  } else if (sortKey.value === 'lastRun') {
    items.sort((a, b) => (b.lastRun?.at ?? 0) - (a.lastRun?.at ?? 0));
  } else {
    items.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  return items;
});

/* ---------- 日志 ---------- */
const logTarget = ref<{ name: string; lastRun: WorkflowLastRun } | null>(null);
const openLog = (id: string) => {
  const wf = store.workflows.find((w) => w.id === id);
  if (wf?.lastRun) logTarget.value = { name: wf.name, lastRun: wf.lastRun };
};
const closeLog = () => {
  logTarget.value = null;
};

/* ---------- 统计 ---------- */
const doneCount = computed(
  () => store.workflows.filter((w) => w.lastRun?.status === 'success').length,
);
const failedCount = computed(
  () => store.workflows.filter((w) => w.lastRun?.status === 'failed').length,
);

/** 成功率 = 成功运行数 / 有运行记录的工作流数（无记录显示 --） */
const successRate = computed(() => {
  const withRun = store.workflows.filter((w) => w.lastRun);
  if (withRun.length === 0) return null;
  return Math.round(
    (withRun.filter((w) => w.lastRun!.status === 'success').length / withRun.length) * 100,
  );
});

/** 环形进度：SVG stroke-dashoffset */
const RING_R = 20;
const RING_C = 2 * Math.PI * RING_R;
const ringOffset = computed(() =>
  successRate.value === null ? RING_C : RING_C * (1 - successRate.value / 100),
);

/** 相对时间描述 */
function fmtTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} 天前`;
  const date = new Date(ts);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 日志行着色：按前缀级别 */
function lineCls(line: string): string {
  if (line.startsWith('ERROR')) return 'text-red-600';
  if (line.startsWith('OK')) return 'text-green-600';
  if (line.startsWith('RUN')) return 'text-brand-600';
  if (line.startsWith('WARN')) return 'text-amber-600';
  return 'text-surface-800/60';
}

/* ---------- 迁移警告（可关闭） ---------- */
const warningsOpen = ref(true);
</script>

<template>
  <div class="space-y-4">
    <!-- 迁移警告 -->
    <div
      v-if="store.migrationWarnings.length > 0 && warningsOpen"
      class="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-700"
      role="status"
    >
      <TriangleAlert class="mt-0.5 size-3.5 shrink-0" />
      <div class="min-w-0 flex-1">
        <p class="font-medium">本地数据迁移说明</p>
        <ul class="mt-0.5 list-inside list-disc space-y-0.5 opacity-80">
          <li v-for="(w, i) in store.migrationWarnings" :key="i">{{ w }}</li>
        </ul>
      </div>
      <button
        type="button"
        class="rounded p-0.5 transition hover:bg-amber-500/20"
        title="关闭提示"
        aria-label="关闭提示"
        @click="warningsOpen = false"
      >
        <X class="size-3.5" />
      </button>
    </div>

    <!-- 顶部标题区：左标题 + 右环形成功率 + 新建按钮 -->
    <header
      class="border-surface-100/70 bg-surface-0/70 shadow-card flex flex-wrap items-center justify-between gap-3 rounded-xl border px-5 py-4 backdrop-blur-xl"
    >
      <div class="flex items-center gap-3">
        <span
          class="bg-brand-500/10 text-brand-600 flex size-10 items-center justify-center rounded-lg"
        >
          <Workflow class="size-5" />
        </span>
        <div>
          <h1 class="text-surface-900 text-lg leading-tight font-semibold">工作流</h1>
          <p class="text-surface-800/50 mt-0.5 text-xs">
            共 {{ store.workflows.length }} 条 · 成功 {{ doneCount }} · 失败 {{ failedCount }}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2.5">
        <div class="relative size-12">
          <svg class="size-12 -rotate-90" viewBox="0 0 48 48">
            <circle
              cx="24"
              cy="24"
              :r="RING_R"
              fill="none"
              stroke="var(--color-surface-100)"
              stroke-width="4"
            />
            <circle
              cx="24"
              cy="24"
              :r="RING_R"
              fill="none"
              stroke="var(--color-brand-500)"
              stroke-width="4"
              stroke-linecap="round"
              :stroke-dasharray="RING_C"
              :stroke-dashoffset="ringOffset"
              class="transition-[stroke-dashoffset] duration-500"
            />
          </svg>
          <span
            class="text-surface-900 absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums"
          >
            {{ successRate === null ? '--' : `${successRate}%` }}
          </span>
        </div>
        <span class="text-surface-800/50 text-xs">运行成功率</span>
        <button
          type="button"
          class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition"
          @click="createWorkflow"
        >
          <Plus class="size-3.5" />
          新建工作流
        </button>
      </div>
    </header>

    <!-- 工作流列表 -->
    <section
      class="border-surface-100/70 bg-surface-0/70 shadow-card rounded-xl border backdrop-blur-xl"
    >
      <div class="border-surface-100/70 flex flex-wrap items-center gap-2 border-b px-5 py-3">
        <h2 class="text-surface-900 text-sm font-semibold">全部工作流</h2>

        <!-- 搜索 -->
        <div class="relative ml-auto">
          <input
            v-model="keyword"
            type="search"
            placeholder="搜索名称 / 标签 / 描述…"
            class="border-surface-100 bg-surface-50 text-surface-900 focus:border-brand-500 w-44 rounded-lg border px-2.5 py-1 text-xs transition outline-none sm:w-56"
          />
        </div>

        <!-- 状态筛选 -->
        <div class="flex items-center gap-1" role="group" aria-label="状态筛选">
          <button
            v-for="f in STATUS_FILTERS"
            :key="f.value"
            type="button"
            class="rounded-md px-2 py-1 text-[11px] transition"
            :class="
              statusFilter === f.value
                ? 'bg-brand-500/10 text-brand-600'
                : 'text-surface-800/50 hover:bg-surface-100'
            "
            @click="statusFilter = f.value"
          >
            {{ f.label }}
          </button>
        </div>

        <!-- 排序 -->
        <select
          v-model="sortKey"
          class="border-surface-100 bg-surface-50 text-surface-900 rounded-lg border px-2 py-1 text-[11px] outline-none"
          title="排序方式"
          aria-label="排序方式"
        >
          <option v-for="(label, key) in SORT_LABELS" :key="key" :value="key">按{{ label }}</option>
        </select>
      </div>

      <!-- 空状态 -->
      <div
        v-if="filteredWorkflows.length === 0"
        class="flex flex-col items-center gap-3 p-10 text-center"
      >
        <span class="text-5xl">🧩</span>
        <p class="text-surface-800/60 text-sm">
          {{
            store.workflows.length === 0
              ? '还没有工作流，创建一个开始编排自动化流程'
              : '没有符合筛选条件的工作流'
          }}
        </p>
        <button
          v-if="store.workflows.length === 0"
          type="button"
          class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition"
          @click="createWorkflow"
        >
          <Plus class="size-3.5" />
          新建工作流
        </button>
      </div>

      <ul v-else class="space-y-1 p-3">
        <li
          v-for="item in filteredWorkflows"
          :key="item.id"
          class="group hover:border-surface-100 hover:bg-surface-50/70 flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-all duration-200 hover:-translate-y-px"
        >
          <!-- 左侧状态图标 -->
          <span
            class="flex size-8 shrink-0 items-center justify-center rounded-lg"
            :class="STATUS_META[item.lastRun?.status ?? 'never'].cls"
          >
            <component :is="STATUS_META[item.lastRun?.status ?? 'never'].icon" class="size-4" />
          </span>

          <!-- 中间：名称 + 状态标签 + 元信息 -->
          <div class="min-w-0 flex-1">
            <!-- 重命名编辑态 -->
            <div v-if="editingId === item.id" class="flex items-center gap-1.5">
              <input
                v-model="draft"
                class="border-brand-500 text-surface-900 w-48 rounded-lg border bg-transparent px-2 py-1 text-sm font-medium outline-none"
                @keyup.enter="commitRename"
                @keyup.esc="cancelRename"
                @blur="commitRename"
              />
              <button
                type="button"
                class="text-surface-800/50 hover:text-brand-600 text-xs"
                @mousedown.prevent="commitRename"
              >
                确定
              </button>
            </div>
            <div v-else class="flex items-center gap-1.5">
              <p class="text-surface-900 truncate text-sm font-medium">{{ item.name }}</p>
              <Star
                v-if="item.favorite"
                class="size-3.5 shrink-0 fill-current text-amber-500"
                title="已收藏"
              />
              <Sparkles
                v-if="item.isTemplate"
                class="size-3.5 shrink-0 text-violet-500"
                title="模板"
              />
              <span
                class="rounded-full px-2 py-0.5 text-[10px] leading-none font-medium"
                :class="STATUS_META[item.lastRun?.status ?? 'never'].cls"
              >
                {{ STATUS_META[item.lastRun?.status ?? 'never'].label }}
              </span>
            </div>

            <!-- 描述 -->
            <p v-if="item.description" class="text-surface-800/50 mt-0.5 truncate text-xs">
              {{ item.description }}
            </p>

            <p class="text-surface-800/50 mt-0.5 text-xs">
              {{ item.nodeCount }} 节点 · {{ item.edgeCount }} 连线 · {{ item.versionCount }} 版本 ·
              更新于 {{ fmtTime(item.updatedAt) }}
              <span v-if="item.lastRun">
                · 最近运行 {{ fmtTime(item.lastRun.at) }} · 耗时
                {{ (item.lastRun.durationMs / 1000).toFixed(1) }}s
              </span>
            </p>

            <!-- 标签 -->
            <div v-if="item.tags.length > 0" class="mt-1 flex flex-wrap gap-1">
              <span
                v-for="tag in item.tags"
                :key="tag"
                class="bg-brand-500/10 text-brand-600 rounded-full px-1.5 py-0.5 text-[10px] leading-none"
              >
                #{{ tag }}
              </span>
            </div>
          </div>

          <!-- 右侧 hover 操作 -->
          <div
            class="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100"
          >
            <button
              type="button"
              title="打开"
              aria-label="打开"
              class="hover:bg-brand-500/10 hover:text-brand-600 text-surface-800/50 rounded-md p-1.5 transition"
              @click="openWorkflow(item.id)"
            >
              <ArrowRight class="size-3.5" />
            </button>
            <button
              type="button"
              title="编辑详情（描述 / 标签）"
              aria-label="编辑详情"
              class="hover:bg-brand-500/10 hover:text-brand-600 text-surface-800/50 rounded-md p-1.5 transition"
              @click="openDetail(item.id)"
            >
              <ScrollText class="size-3.5" />
            </button>
            <button
              type="button"
              title="重命名"
              aria-label="重命名"
              class="hover:bg-brand-500/10 hover:text-brand-600 text-surface-800/50 rounded-md p-1.5 transition"
              @click="startRename(item.id, item.name)"
            >
              <Pencil class="size-3.5" />
            </button>
            <button
              type="button"
              :title="item.isTemplate ? '从模板创建副本' : '复制'"
              :aria-label="item.isTemplate ? '从模板创建副本' : '复制'"
              class="hover:bg-brand-500/10 hover:text-brand-600 text-surface-800/50 rounded-md p-1.5 transition"
              @click="item.isTemplate ? fromTemplate(item.id) : duplicate(item.id)"
            >
              <Copy class="size-3.5" />
            </button>
            <button
              type="button"
              :title="item.favorite ? '取消收藏' : '收藏'"
              :aria-label="item.favorite ? '取消收藏' : '收藏'"
              class="text-surface-800/50 rounded-md p-1.5 transition hover:bg-amber-500/10"
              :class="item.favorite ? 'text-amber-500' : 'hover:text-amber-500'"
              @click="toggleFavorite(item.id)"
            >
              <Star class="size-3.5" :class="item.favorite && 'fill-current'" />
            </button>
            <button
              type="button"
              :title="item.isTemplate ? '取消模板标记' : '标记为模板'"
              :aria-label="item.isTemplate ? '取消模板标记' : '标记为模板'"
              class="text-surface-800/50 rounded-md p-1.5 transition hover:bg-violet-500/10"
              :class="item.isTemplate ? 'text-violet-500' : 'hover:text-violet-500'"
              @click="toggleTemplate(item.id)"
            >
              <Sparkles class="size-3.5" />
            </button>
            <button
              v-if="item.lastRun"
              type="button"
              title="查看日志"
              aria-label="查看日志"
              class="hover:bg-brand-500/10 hover:text-brand-600 text-surface-800/50 rounded-md p-1.5 transition"
              @click="openLog(item.id)"
            >
              <FileText class="size-3.5" />
            </button>
            <button
              type="button"
              title="删除"
              aria-label="删除"
              class="text-surface-800/50 rounded-md p-1.5 transition hover:bg-red-500/10 hover:text-red-600"
              @click="remove(item.id, item.name)"
            >
              <Trash2 class="size-3.5" />
            </button>
          </div>
        </li>
      </ul>
    </section>

    <!-- 日志面板 -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0"
        leave-active-class="transition duration-150 ease-in"
        leave-to-class="opacity-0"
      >
        <div
          v-if="logTarget"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
          @click.self="closeLog"
        >
          <div
            class="border-surface-100/70 bg-surface-0/90 shadow-float w-full max-w-md rounded-xl border p-5 backdrop-blur-xl"
          >
            <div class="mb-3 flex items-center justify-between">
              <div class="flex min-w-0 items-center gap-2">
                <ScrollText class="text-brand-600 size-4 shrink-0" />
                <h3 class="text-surface-900 truncate text-sm font-semibold">
                  {{ logTarget.name }}
                </h3>
              </div>
              <button
                type="button"
                class="hover:bg-surface-50 text-surface-800/50 hover:text-surface-900 rounded-md p-1 transition"
                title="关闭"
                aria-label="关闭"
                @click="closeLog"
              >
                <X class="size-4" />
              </button>
            </div>

            <div class="mb-2 flex items-center gap-2">
              <span
                class="rounded-full px-2 py-0.5 text-[10px] font-medium"
                :class="STATUS_META[logTarget.lastRun.status].cls"
              >
                {{ STATUS_META[logTarget.lastRun.status].label }}
              </span>
              <span class="text-surface-800/50 text-[11px]">
                耗时 {{ (logTarget.lastRun.durationMs / 1000).toFixed(1) }}s ·
                {{ fmtTime(logTarget.lastRun.at) }}
              </span>
            </div>

            <div
              class="bg-surface-50 border-surface-100/70 max-h-64 space-y-1 overflow-y-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed"
            >
              <p v-for="(line, i) in logTarget.lastRun.logs" :key="i" :class="lineCls(line)">
                {{ line }}
              </p>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 详情编辑（描述 / 标签） -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0"
        leave-active-class="transition duration-150 ease-in"
        leave-to-class="opacity-0"
      >
        <div
          v-if="detailTarget"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
          @click.self="closeDetail"
        >
          <div
            class="border-surface-100/70 bg-surface-0/90 shadow-float w-full max-w-sm rounded-xl border p-5 backdrop-blur-xl"
          >
            <div class="mb-3 flex items-center justify-between">
              <h3 class="text-surface-900 min-w-0 truncate text-sm font-semibold">
                {{ detailTarget.name }}
              </h3>
              <button
                type="button"
                class="hover:bg-surface-50 text-surface-800/50 hover:text-surface-900 rounded-md p-1 transition"
                title="关闭"
                aria-label="关闭"
                @click="closeDetail"
              >
                <X class="size-4" />
              </button>
            </div>

            <div class="space-y-3">
              <label class="block">
                <span class="text-surface-800/70 mb-1 block text-xs font-medium">描述</span>
                <textarea
                  v-model="detailDescription"
                  rows="3"
                  placeholder="这个工作流做什么？"
                  class="border-surface-100 bg-surface-50 text-surface-900 focus:border-brand-500 w-full resize-none rounded-lg border px-2.5 py-1.5 text-xs outline-none"
                />
              </label>
              <label class="block">
                <span class="text-surface-800/70 mb-1 block text-xs font-medium">
                  标签（逗号分隔）
                </span>
                <input
                  v-model="detailTags"
                  type="text"
                  placeholder="例如：每日，自动，通知"
                  class="border-surface-100 bg-surface-50 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-2.5 py-1.5 text-xs outline-none"
                  @keyup.enter="saveDetail"
                />
              </label>
            </div>

            <div class="mt-4 flex justify-end gap-2">
              <button
                type="button"
                class="text-surface-800/60 hover:bg-surface-100 rounded-lg px-3 py-1.5 text-xs transition"
                @click="closeDetail"
              >
                取消
              </button>
              <button
                type="button"
                class="bg-brand-600 hover:bg-brand-700 text-surface-0 rounded-lg px-3 py-1.5 text-xs font-medium transition"
                @click="saveDetail"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
