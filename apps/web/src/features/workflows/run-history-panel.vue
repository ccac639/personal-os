<script setup lang="ts">
/**
 * 运行历史面板：筛选 / 固定 / 删除 / 导出 / 对比 / 回放。
 * 数据来自独立持久化边界（personal-os-workflow-runs）。
 */
import { computed, ref } from 'vue';
import { Activity, Download, Eye, Play, Pin, PinOff, Scale, Trash2, X } from '@lucide/vue';
import { useWorkflowStore } from './store';
import type { RunHistoryEntry, RunHistoryStatus } from './types';
import type { RunHistoryFilter } from './history';
import { formatDiffValue } from './diff';

const store = useWorkflowStore();
const emit = defineEmits<{ close: [] }>();

/* ---------- 筛选 ---------- */

const filter = ref<RunHistoryFilter>({
  status: 'all',
  workflowId: '',
  mode: 'all',
  version: 'all',
  pinnedOnly: false,
});

const STATUS_LABEL: Record<RunHistoryStatus | 'all', string> = {
  all: '全部状态',
  success: '成功',
  failed: '失败',
  cancelled: '已取消',
};

const MODE_LABEL: Record<string, string> = {
  all: '全部方式',
  full: '完整',
  from: '从节点',
  single: '单节点',
};

const filtered = computed(() => store.filterRuns(filter.value));

const versions = computed(() => {
  const set = new Set<string>();
  for (const r of store.runHistory) set.add(r.workflowVersion);
  return [...set].slice(0, 10);
});

/* ---------- 对比 ---------- */

const compareIds = ref<[string | null, string | null]>([null, null]);

function toggleCompare(id: string) {
  if (compareIds.value[0] === null) compareIds.value[0] = id;
  else if (compareIds.value[0] === id) compareIds.value[0] = null;
  else if (compareIds.value[1] === null) compareIds.value[1] = id;
  else if (compareIds.value[1] === id) compareIds.value[1] = null;
  else compareIds.value = [compareIds.value[1], id];
}

const comparison = computed(() => {
  const [a, b] = compareIds.value;
  if (!a || !b) return null;
  return store.compareRunEntries(a, b);
});

/** 模板辅助：非空对比结果（仅在 v-if="comparison" 分支使用） */
function cmp() {
  return comparison.value!;
}

/* ---------- 回放 / 重新运行 ---------- */

function replay(run: RunHistoryEntry) {
  if (store.activeId !== run.workflowId) {
    store.openWorkflow(run.workflowId);
  }
  store.startReplay(run.id);
  emit('close');
}

async function rerun(run: RunHistoryEntry) {
  if (store.activeId !== run.workflowId) {
    store.openWorkflow(run.workflowId);
  }
  await store.rerunFromHistory(run.id);
  emit('close');
}

/* ---------- 时间格式 ---------- */

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusCls(s: RunHistoryStatus): string {
  if (s === 'success') return 'text-green-600 bg-green-500/10';
  if (s === 'failed') return 'text-red-600 bg-red-500/10';
  return 'text-surface-800/60 bg-surface-100';
}

function statusLabel(s: RunHistoryStatus): string {
  return s === 'success' ? '成功' : s === 'failed' ? '失败' : '已取消';
}

function exportRun(run: RunHistoryEntry) {
  const json = store.exportRunEntryJson(run.id);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `run-${run.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div
      class="border-surface-100/70 bg-surface-0/90 shadow-float flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border backdrop-blur-xl"
    >
      <header class="border-surface-100 flex items-center justify-between border-b px-4 py-3">
        <h3 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
          <Activity class="text-brand-600 size-4" />
          运行历史
          <span class="text-surface-800/40 text-[11px]">（{{ store.runHistory.length }} 条）</span>
        </h3>
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="text-surface-800/60 hover:bg-surface-100 rounded-md px-2 py-1 text-[11px] transition"
            @click="store.clearAllRuns(false)"
          >
            清理全部
          </button>
          <button
            type="button"
            class="text-surface-800/50 hover:bg-surface-100 rounded-md p-1.5 transition"
            aria-label="关闭运行历史"
            title="关闭"
            @click="emit('close')"
          >
            <X class="size-4" />
          </button>
        </div>
      </header>

      <!-- 筛选 -->
      <div class="border-surface-100 flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
        <select
          v-model="filter.status"
          class="border-surface-100 bg-surface-50 text-surface-800/70 rounded-md border px-1.5 py-1 text-[11px] outline-none"
          aria-label="按状态筛选"
        >
          <option v-for="(label, k) in STATUS_LABEL" :key="k" :value="k">{{ label }}</option>
        </select>
        <select
          v-model="filter.mode"
          class="border-surface-100 bg-surface-50 text-surface-800/70 rounded-md border px-1.5 py-1 text-[11px] outline-none"
          aria-label="按运行方式筛选"
        >
          <option v-for="(label, k) in MODE_LABEL" :key="k" :value="k">{{ label }}</option>
        </select>
        <select
          v-model="filter.version"
          class="border-surface-100 bg-surface-50 text-surface-800/70 rounded-md border px-1.5 py-1 text-[11px] outline-none"
          aria-label="按工作流版本筛选"
        >
          <option value="all">全部版本</option>
          <option v-for="v in versions" :key="v" :value="v">{{ v.slice(0, 8) }}</option>
        </select>
        <label class="text-surface-800/60 flex items-center gap-1 text-[11px]">
          <input v-model="filter.pinnedOnly" type="checkbox" class="accent-brand-600" />
          仅固定
        </label>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-3">
        <!-- 对比结果 -->
        <section v-if="comparison" class="border-surface-100 mb-3 rounded-lg border p-3">
          <h4 class="text-surface-900 mb-2 flex items-center gap-1.5 text-xs font-semibold">
            <Scale class="text-brand-600 size-3.5" /> 运行对比
          </h4>
          <div class="grid grid-cols-2 gap-2 text-[11px]">
            <div class="text-surface-800/70">
              状态：
              <span :class="cmp().statusChanged ? 'font-medium text-amber-600' : ''">
                {{
                  statusLabel(
                    store.runHistory.find((r) => r.id === cmp().aId)?.status ?? 'cancelled',
                  )
                }}
                →
                {{
                  statusLabel(
                    store.runHistory.find((r) => r.id === cmp().bId)?.status ?? 'cancelled',
                  )
                }}
              </span>
            </div>
            <div class="text-surface-800/70">
              失败节点：{{ cmp().failedNodeA ?? '无' }} → {{ cmp().failedNodeB ?? '无' }}
            </div>
          </div>
          <div v-if="cmp().inputDiff.length > 0" class="mt-2">
            <p class="text-surface-800/50 mb-1 text-[11px]">
              输入差异（{{ cmp().inputDiff.length }}）
            </p>
            <table class="w-full text-[11px]">
              <tbody>
                <tr
                  v-for="d in cmp().inputDiff.slice(0, 5)"
                  :key="d.path"
                  class="border-surface-100 border-b"
                >
                  <td class="text-surface-800/60 py-0.5 pr-2 font-mono">{{ d.path }}</td>
                  <td class="text-surface-800/70 py-0.5 pr-2">{{ formatDiffValue(d.from) }}</td>
                  <td class="text-surface-800/90 py-0.5">→ {{ formatDiffValue(d.to) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="text-surface-800/40 mt-1 text-[11px]">输入无差异</div>
        </section>

        <!-- 历史列表 -->
        <div v-if="filtered.length === 0" class="text-surface-800/40 py-8 text-center text-xs">
          暂无符合条件的运行记录
        </div>
        <div class="space-y-1.5">
          <div
            v-for="run in filtered"
            :key="run.id"
            class="border-surface-100 bg-surface-50/50 flex items-center gap-2 rounded-lg border px-3 py-2"
            :class="{ 'ring-brand-500/40 ring-1': compareIds.includes(run.id) }"
          >
            <span
              class="rounded-full px-2 py-0.5 text-[10px] font-medium"
              :class="statusCls(run.status)"
            >
              {{ statusLabel(run.status) }}
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-surface-900 truncate text-xs font-medium">
                {{ run.workflowName }}
                <span class="text-surface-800/40 font-normal"
                  >· {{ MODE_LABEL[run.mode] ?? run.mode }}</span
                >
              </p>
              <p class="text-surface-800/50 truncate text-[10px]">
                {{ fmtTime(run.startedAt) }} · 耗时 {{ fmtDuration(run.durationMs) }}
                <span v-if="run.failedNodeId" class="text-red-600"
                  >· 失败：{{ run.failedNodeId }}</span
                >
                <span v-if="run.pinned" class="text-brand-600">· 已固定</span>
              </p>
            </div>
            <button
              type="button"
              class="text-surface-800/50 hover:text-brand-600 rounded-md p-1.5 transition"
              :title="run.pinned ? '取消固定' : '固定此运行'"
              :aria-label="run.pinned ? '取消固定' : '固定此运行'"
              @click="store.pinRunEntry(run.id, !run.pinned)"
            >
              <Pin v-if="!run.pinned" class="size-3.5" />
              <PinOff v-else class="size-3.5" />
            </button>
            <button
              type="button"
              class="text-surface-800/50 hover:text-brand-600 rounded-md p-1.5 transition"
              title="选择对比"
              aria-label="选择对比"
              @click="toggleCompare(run.id)"
            >
              <Scale class="size-3.5" />
            </button>
            <button
              type="button"
              class="text-surface-800/50 hover:text-brand-600 rounded-md p-1.5 transition"
              title="导出单条 JSON"
              aria-label="导出单条 JSON"
              @click="exportRun(run)"
            >
              <Download class="size-3.5" />
            </button>
            <button
              type="button"
              class="text-surface-800/50 hover:text-brand-600 rounded-md p-1.5 transition"
              title="回放此运行（只读）"
              aria-label="回放此运行"
              @click="replay(run)"
            >
              <Eye class="size-3.5" />
            </button>
            <button
              type="button"
              class="text-surface-800/50 hover:text-brand-600 rounded-md p-1.5 transition"
              title="用历史输入重新运行"
              aria-label="用历史输入重新运行"
              @click="rerun(run)"
            >
              <Play class="size-3.5" />
            </button>
            <button
              type="button"
              class="text-surface-800/50 rounded-md p-1.5 transition hover:text-red-600"
              title="删除此运行"
              aria-label="删除此运行"
              @click="store.deleteRunEntry(run.id)"
            >
              <Trash2 class="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
