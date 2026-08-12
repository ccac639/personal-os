<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  Check,
  ChevronDown,
  ChevronUp,
  CircleX,
  ClipboardCopy,
  Download,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  ScrollText,
  Square,
} from '@lucide/vue';
import { useWorkflowStore } from './store';
import { getNodeDef, type RunLogEntry, type RunMode } from './types';

const store = useWorkflowStore();

/* ---------- 运行模式 ---------- */

const MODES: Array<{ value: RunMode; label: string; title: string }> = [
  { value: 'full', label: '完整', title: '按拓扑顺序执行全部节点' },
  { value: 'single', label: '单节点', title: '仅执行选中的节点' },
  { value: 'from', label: '从选中继续', title: '从选中节点开始执行其后继' },
];

function setMode(mode: RunMode) {
  store.runMode = mode;
}

const modeTitle = computed(() => MODES.find((m) => m.value === store.runMode)?.title ?? '');

/* ---------- 运行参数（折叠） ---------- */

const paramsOpen = ref(false);
const varsText = ref('');
const contextText = ref('');

function parseJsonSafe(text: string): Record<string, unknown> | null {
  const t = text.trim();
  if (!t) return {};
  try {
    const v = JSON.parse(t);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

const varsError = computed(() => {
  if (!varsText.value.trim()) return '';
  return parseJsonSafe(varsText.value) === null ? '变量需为 JSON 对象，如 {"role":"审查员"}' : '';
});
const contextError = computed(() => {
  if (!contextText.value.trim()) return '';
  return parseJsonSafe(contextText.value) === null ? '上下文需为 JSON 对象，如 {"risks": 3}' : '';
});

function syncParams() {
  store.runParams = {
    initialText: initialText.value,
    variables: parseJsonSafe(varsText.value) ?? store.runParams.variables ?? {},
    context: parseJsonSafe(contextText.value) ?? store.runParams.context ?? {},
  };
}

const initialText = ref('');

/** 字面量提示（避免模板内嵌套花括号） */
const initialHint = '初始文本（{{input}}）';

/* ---------- 运行控制 ---------- */

function run() {
  if (varsError.value || contextError.value) return;
  syncParams();
  store.runWorkflow(store.runMode);
}

const isRunning = computed(() => store.running);
const isPaused = ref(false);

function onPause() {
  store.pauseRun();
  isPaused.value = true;
}
function onResume() {
  store.resumeRun();
  isPaused.value = false;
}
function onCancel() {
  store.cancelRun();
  isPaused.value = false;
}

/* ---------- 进度展示 ---------- */

const currentLabel = computed(() => {
  const id = store.runningNodeId;
  if (!id) return '';
  const n = store.nodes.find((x) => x.id === id);
  if (!n) return '';
  return n.data.label || getNodeDef(n.data.kind).label;
});

const doneCount = computed(
  () => store.runEntries.filter((e) => e.level === 'success' && e.nodeId).length,
);
const totalCount = computed(() => store.nodes.length);

const elapsed = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  timer = setInterval(() => {
    if (store.running) elapsed.value++;
  }, 1000);
});
onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});

const durationLabel = computed(() => {
  const ms = store.running ? elapsed.value * 1000 : (store.activeLastRun?.durationMs ?? 0);
  return `${(ms / 1000).toFixed(1)}s`;
});

const lastRun = computed(() => store.activeLastRun);
const runFailed = computed(() => lastRun.value?.status === 'failed');

/** 从结构化日志提取失败信息与建议 */
const failureInfo = computed(() => {
  const err = store.runEntries.find((e) => e.level === 'error' && e.nodeId);
  const suggest = store.runEntries.find((e) => e.text.startsWith('修复建议'));
  return {
    error: err?.text ?? lastRun.value?.logs.find((l) => l.startsWith('ERROR')) ?? '',
    nodeId: err?.nodeId,
    suggestion: suggest?.text.replace(/^修复建议：/, '') ?? '',
  };
});

/* ---------- 日志（级别筛选 + 点击定位） ---------- */

type LevelFilter = 'all' | 'info' | 'warn' | 'error';
const levelFilter = ref<LevelFilter>('all');

const LEVEL_META: Record<RunLogEntry['level'], { label: string; cls: string }> = {
  run: { label: '运行', cls: 'text-brand-600 bg-brand-500/10' },
  info: { label: '信息', cls: 'text-surface-800/70 bg-surface-100' },
  success: { label: '成功', cls: 'text-green-600 bg-green-500/10' },
  warn: { label: '警告', cls: 'text-amber-600 bg-amber-500/10' },
  error: { label: '错误', cls: 'text-red-600 bg-red-500/10' },
};

function matchesLevel(e: RunLogEntry): boolean {
  if (levelFilter.value === 'all') return true;
  if (levelFilter.value === 'error') return e.level === 'error';
  if (levelFilter.value === 'warn') return e.level === 'warn' || e.level === 'error';
  return ['info', 'success', 'run'].includes(e.level);
}

const filteredLogs = computed(() => store.runEntries.filter(matchesLevel));

const counts = computed(() => ({
  all: store.runEntries.length,
  info: store.runEntries.filter((e) => ['info', 'success', 'run'].includes(e.level)).length,
  warn: store.runEntries.filter((e) => e.level === 'warn' || e.level === 'error').length,
  error: store.runEntries.filter((e) => e.level === 'error').length,
}));

/** 点击日志定位节点 */
function locate(entry: RunLogEntry) {
  if (!entry.nodeId) return;
  store.selectNode(entry.nodeId);
  store.focusSelected();
}

/* ---------- 结果操作 ---------- */

const copied = ref(false);
async function copyResult() {
  copied.value = await store.copyRunResult();
  setTimeout(() => (copied.value = false), 1500);
}

function exportResult() {
  const blob = new Blob([store.exportRunResult()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${store.name || 'workflow'}-run.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- 折叠 ---------- */

const collapsed = ref(false);
</script>

<template>
  <section
    class="border-surface-100 bg-surface-0 shadow-card flex min-h-0 flex-col rounded-xl border"
    :class="collapsed ? 'max-h-10' : 'max-h-80'"
  >
    <!-- 顶栏：模式 + 控制 + 进度 -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
      <!-- 模式 -->
      <div class="flex items-center gap-1" role="group" aria-label="运行模式">
        <button
          v-for="m in MODES"
          :key="m.value"
          type="button"
          :title="m.title"
          :aria-label="m.title"
          class="rounded-md px-2 py-1 text-[11px] font-medium transition"
          :class="
            store.runMode === m.value
              ? 'bg-brand-500/10 text-brand-600'
              : 'text-surface-800/50 hover:bg-surface-100'
          "
          @click="setMode(m.value)"
        >
          {{ m.label }}
        </button>
      </div>

      <!-- 运行控制 -->
      <div class="flex items-center gap-1.5">
        <button
          v-if="!isRunning"
          type="button"
          class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-50"
          :disabled="store.nodes.length === 0"
          :title="modeTitle"
          @click="run"
        >
          <Play class="size-3.5" />
          运行
        </button>
        <template v-else>
          <button
            v-if="!isPaused"
            type="button"
            class="text-surface-800/70 hover:bg-surface-100 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition"
            title="暂停"
            aria-label="暂停运行"
            @click="onPause"
          >
            <Pause class="size-3.5" />
            暂停
          </button>
          <button
            v-else
            type="button"
            class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition"
            title="继续"
            aria-label="继续运行"
            @click="onResume"
          >
            <Play class="size-3.5" />
            继续
          </button>
          <button
            type="button"
            class="text-surface-800/70 hover:bg-surface-100 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition hover:text-red-600"
            title="取消运行"
            aria-label="取消运行"
            @click="onCancel"
          >
            <Square class="size-3" />
            取消
          </button>
        </template>
      </div>

      <!-- 进度 -->
      <div class="flex min-w-0 flex-1 items-center gap-2 text-xs">
        <template v-if="isRunning">
          <Loader2 class="text-brand-600 size-3.5 animate-spin" />
          <span class="text-surface-900 truncate font-medium">
            {{ isPaused ? '已暂停' : `正在执行：${currentLabel || '…'}` }}
          </span>
          <span class="text-surface-800/50 tabular-nums">
            {{ doneCount }}/{{ totalCount }} 节点 · {{ durationLabel }}
          </span>
        </template>
        <template v-else-if="lastRun">
          <Check v-if="lastRun.status === 'success'" class="size-3.5 text-green-600" />
          <CircleX v-else class="size-3.5 text-red-600" />
          <span
            class="font-medium"
            :class="lastRun.status === 'success' ? 'text-green-600' : 'text-red-600'"
          >
            {{ lastRun.status === 'success' ? '运行成功' : '运行失败' }}
          </span>
          <span class="text-surface-800/50 tabular-nums">
            {{ doneCount }} 节点 · 耗时 {{ durationLabel }}
          </span>
          <span
            v-if="failureInfo.error"
            class="text-surface-800/60 min-w-0 truncate"
            :title="failureInfo.error"
          >
            {{ failureInfo.error }}
          </span>
        </template>
        <span v-else class="text-surface-800/40">就绪</span>
      </div>

      <!-- 折叠 / 展开 -->
      <button
        type="button"
        class="text-surface-800/40 hover:bg-surface-100 hover:text-surface-900 rounded-md p-1 transition"
        :title="collapsed ? '展开运行面板' : '折叠运行面板'"
        :aria-label="collapsed ? '展开运行面板' : '折叠运行面板'"
        @click="collapsed = !collapsed"
      >
        <ChevronUp v-if="!collapsed" class="size-3.5" />
        <ChevronDown v-else class="size-3.5" />
      </button>
    </div>

    <!-- 展开内容 -->
    <div
      v-if="!collapsed"
      class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 pt-1 lg:flex-row"
    >
      <!-- 运行参数 -->
      <div
        class="border-surface-100 bg-surface-50/50 flex w-full shrink-0 flex-col rounded-lg border p-3 lg:w-72"
      >
        <button
          type="button"
          class="text-surface-900 flex items-center justify-between text-xs font-semibold"
          @click="paramsOpen = !paramsOpen"
        >
          运行参数
          <ChevronDown class="size-3.5 transition" :class="paramsOpen && 'rotate-180'" />
        </button>
        <div v-if="paramsOpen" class="mt-2 space-y-2.5">
          <label class="block">
            <span class="text-surface-800/60 mb-1 block text-[11px]">{{ initialHint }}</span>
            <textarea
              v-model="initialText"
              rows="2"
              placeholder="输入初始文本…"
              class="border-surface-100 bg-surface-50 text-surface-900 focus:border-brand-500 w-full resize-none rounded-lg border px-2 py-1.5 text-xs outline-none"
            />
          </label>
          <label class="block">
            <span class="text-surface-800/60 mb-1 block text-[11px]">变量（JSON）</span>
            <textarea
              v-model="varsText"
              rows="2"
              :placeholder="JSON.stringify({ role: '审查员' })"
              class="border-surface-100 bg-surface-50 text-surface-900 focus:border-brand-500 w-full resize-none rounded-lg border px-2 py-1.5 font-mono text-[11px] outline-none"
            />
            <span v-if="varsError" class="mt-0.5 block text-[11px] text-red-600">{{
              varsError
            }}</span>
          </label>
          <label class="block">
            <span class="text-surface-800/60 mb-1 block text-[11px]">模拟上下文（JSON）</span>
            <textarea
              v-model="contextText"
              rows="2"
              :placeholder="JSON.stringify({ risks: 3 })"
              class="border-surface-100 bg-surface-50 text-surface-900 focus:border-brand-500 w-full resize-none rounded-lg border px-2 py-1.5 font-mono text-[11px] outline-none"
            />
            <span v-if="contextError" class="mt-0.5 block text-[11px] text-red-600">{{
              contextError
            }}</span>
          </label>
        </div>
      </div>

      <!-- 失败信息 -->
      <div
        v-if="runFailed && failureInfo.error"
        class="flex w-full shrink-0 flex-col justify-center gap-1 rounded-lg border border-red-500/30 bg-red-500/5 p-3 lg:w-80"
      >
        <p class="flex items-center gap-1.5 text-xs font-semibold text-red-600">
          <CircleX class="size-3.5" />
          运行失败
        </p>
        <p class="text-surface-800/80 text-xs">{{ failureInfo.error }}</p>
        <p v-if="failureInfo.suggestion" class="text-surface-800/60 text-[11px] leading-relaxed">
          建议：{{ failureInfo.suggestion }}
        </p>
        <button
          v-if="failureInfo.nodeId"
          type="button"
          class="text-brand-600 mt-1 self-start text-[11px] font-medium hover:underline"
          @click="
            store.selectNode(failureInfo.nodeId);
            store.focusSelected();
          "
        >
          定位失败节点 →
        </button>
        <button
          type="button"
          class="text-brand-600 mt-1 flex items-center gap-1 self-start text-[11px] font-medium hover:underline"
          :disabled="store.running"
          @click="store.retryFailed()"
        >
          <RotateCcw class="size-3" />
          从失败节点重试
        </button>
      </div>

      <!-- 日志 -->
      <div
        class="border-surface-100 bg-surface-50/50 flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border"
      >
        <div class="border-surface-100 flex flex-wrap items-center gap-1.5 border-b px-2.5 py-1.5">
          <ScrollText class="text-surface-800/40 size-3.5" />
          <span class="text-surface-800/60 text-[11px] font-medium">运行日志</span>
          <div class="ml-1 flex items-center gap-1" role="group" aria-label="日志级别筛选">
            <button
              v-for="f in ['all', 'info', 'warn', 'error'] as const"
              :key="f"
              type="button"
              class="rounded px-1.5 py-0.5 text-[10px] transition"
              :class="
                levelFilter === f
                  ? 'bg-brand-500/10 text-brand-600'
                  : 'text-surface-800/40 hover:bg-surface-100'
              "
              @click="levelFilter = f"
            >
              {{ f === 'all' ? '全部' : f === 'info' ? '信息' : f === 'warn' ? '警告' : '错误' }}
              {{ counts[f] }}
            </button>
          </div>
          <div class="ml-auto flex items-center gap-1">
            <button
              type="button"
              class="text-surface-800/50 hover:bg-surface-100 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition"
              title="复制运行结果"
              @click="copyResult"
            >
              <ClipboardCopy class="size-3" />
              {{ copied ? '已复制' : '复制结果' }}
            </button>
            <button
              type="button"
              class="text-surface-800/50 hover:bg-surface-100 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition"
              title="导出运行结果 JSON"
              @click="exportResult"
            >
              <Download class="size-3" />
              导出
            </button>
          </div>
        </div>

        <div
          class="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2 font-mono text-[11px] leading-relaxed"
        >
          <p v-if="filteredLogs.length === 0" class="text-surface-800/40 p-2">
            暂无日志，点击「运行」开始模拟执行。
          </p>
          <button
            v-for="entry in filteredLogs"
            :key="entry.id"
            type="button"
            class="hover:bg-surface-100/60 flex w-full items-start gap-1.5 rounded px-1.5 py-0.5 text-left transition"
            :class="entry.nodeId && 'cursor-pointer'"
            :title="entry.nodeId ? '点击定位到节点' : undefined"
            @click="locate(entry)"
          >
            <span
              class="mt-0.5 w-8 shrink-0 rounded px-1 text-center text-[9px] leading-4"
              :class="LEVEL_META[entry.level].cls"
            >
              {{ LEVEL_META[entry.level].label }}
            </span>
            <span class="min-w-0 break-all" :class="{ 'text-red-600': entry.level === 'error' }">
              {{ entry.text }}
            </span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
