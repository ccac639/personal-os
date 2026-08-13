<script setup lang="ts">
/**
 * 健康诊断面板：诊断问题列表（点击定位节点）+ 性能预估 + 类型兼容检查。
 */
import { computed, ref } from 'vue';
import { CircleAlert, Gauge, LocateFixed, RefreshCw, X } from '@lucide/vue';
import { useWorkflowStore } from './store';
import type { DiagnosticIssue } from './diagnostics';

const store = useWorkflowStore();
const emit = defineEmits<{ close: [] }>();

const tab = ref<'diagnostics' | 'estimate' | 'types'>('diagnostics');

function refresh() {
  store.runDiagnostics();
  store.runTypeCheck();
}

const issues = computed(() => store.diagnostics);
const estimate = computed(() => store.estimateRunPerformance());

function severityLabel(s: DiagnosticIssue['severity']): string {
  return s === 'error' ? '错误' : s === 'warning' ? '警告' : '提示';
}
function severityCls(s: DiagnosticIssue['severity']): string {
  if (s === 'error') return 'text-red-600 bg-red-500/10';
  if (s === 'warning') return 'text-amber-600 bg-amber-500/10';
  return 'text-surface-800/60 bg-surface-100';
}

function locate(nodeId?: string) {
  if (!nodeId) return;
  store.selectNode(nodeId);
  store.focusSelected();
  emit('close');
}

const typeIssues = ref<Array<{ nodeId: string; message: string }>>([]);
function refreshTypes() {
  typeIssues.value = store.runTypeCheck().map((t) => ({ nodeId: t.nodeId, message: t.message }));
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div
      class="border-surface-100/70 bg-surface-0/90 shadow-float flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border backdrop-blur-xl"
    >
      <header class="border-surface-100 flex items-center justify-between border-b px-4 py-3">
        <h3 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
          <CircleAlert class="text-brand-600 size-4" />
          工作流诊断
          <span
            class="rounded-full px-1.5 py-0.5 text-[10px]"
            :class="
              store.diagnosticsCount.error > 0
                ? 'bg-red-500/10 text-red-600'
                : 'bg-green-500/10 text-green-600'
            "
          >
            {{ store.diagnosticsCount.error }} 错误 · {{ store.diagnosticsCount.warning }} 警告
          </span>
        </h3>
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="text-surface-800/60 hover:bg-surface-100 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition"
            @click="refresh"
          >
            <RefreshCw class="size-3" /> 重新诊断
          </button>
          <button
            type="button"
            class="text-surface-800/50 hover:bg-surface-100 rounded-md p-1.5 transition"
            aria-label="关闭诊断面板"
            title="关闭"
            @click="emit('close')"
          >
            <X class="size-4" />
          </button>
        </div>
      </header>

      <div class="border-surface-100 flex items-center gap-1 border-b px-3 py-1.5">
        <button
          type="button"
          class="rounded-md px-2 py-1 text-[11px] transition"
          :class="tab === 'diagnostics' ? 'bg-brand-500/10 text-brand-600' : 'text-surface-800/50'"
          @click="tab = 'diagnostics'"
        >
          诊断问题（{{ issues.length }}）
        </button>
        <button
          type="button"
          class="rounded-md px-2 py-1 text-[11px] transition"
          :class="tab === 'estimate' ? 'bg-brand-500/10 text-brand-600' : 'text-surface-800/50'"
          @click="tab = 'estimate'"
        >
          性能预估
        </button>
        <button
          type="button"
          class="rounded-md px-2 py-1 text-[11px] transition"
          :class="tab === 'types' ? 'bg-brand-500/10 text-brand-600' : 'text-surface-800/50'"
          @click="
            tab = 'types';
            refreshTypes();
          "
        >
          类型兼容
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-3">
        <!-- 诊断问题 -->
        <div v-if="tab === 'diagnostics'" class="space-y-1.5">
          <div v-if="issues.length === 0" class="text-surface-800/40 py-8 text-center text-xs">
            未发现问题。点击「重新诊断」开始检查。
          </div>
          <div
            v-for="issue in issues"
            :key="issue.id"
            class="border-surface-100 bg-surface-50/50 flex items-start gap-2 rounded-lg border px-3 py-2"
          >
            <span
              class="mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              :class="severityCls(issue.severity)"
            >
              {{ severityLabel(issue.severity) }}
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-surface-900 text-xs font-medium">{{ issue.title }}</p>
              <p class="text-surface-800/60 mt-0.5 text-[11px]">{{ issue.detail }}</p>
              <p v-if="issue.suggestion" class="text-brand-600 mt-0.5 text-[11px]">
                建议：{{ issue.suggestion }}
              </p>
            </div>
            <button
              v-if="issue.nodeId"
              type="button"
              class="text-surface-800/50 hover:text-brand-600 rounded-md p-1.5 transition"
              title="定位节点"
              :aria-label="`定位节点 ${issue.nodeId}`"
              @click="locate(issue.nodeId)"
            >
              <LocateFixed class="size-3.5" />
            </button>
          </div>
        </div>

        <!-- 性能预估 -->
        <div v-else-if="tab === 'estimate'" class="space-y-2">
          <p class="text-surface-800/40 text-[11px]">以下为本地启发式估算值，仅作参考。</p>
          <div class="grid grid-cols-2 gap-2">
            <div class="border-surface-100 bg-surface-50/50 rounded-lg border p-3">
              <p class="text-surface-800/50 flex items-center gap-1 text-[11px]">
                <Gauge class="size-3" /> 预估执行步数
              </p>
              <p class="text-surface-900 mt-1 text-lg font-semibold">
                {{ estimate?.estimatedSteps ?? '—' }}
              </p>
            </div>
            <div class="border-surface-100 bg-surface-50/50 rounded-lg border p-3">
              <p class="text-surface-800/50 text-[11px]">预估模拟耗时</p>
              <p class="text-surface-900 mt-1 text-lg font-semibold">
                {{ estimate ? `${(estimate.estimatedMs / 1000).toFixed(1)}s` : '—' }}
              </p>
            </div>
            <div class="border-surface-100 bg-surface-50/50 rounded-lg border p-3">
              <p class="text-surface-800/50 text-[11px]">潜在分支组合</p>
              <p class="text-surface-900 mt-1 text-lg font-semibold">
                {{ estimate?.branches ?? '—' }}
              </p>
            </div>
            <div class="border-surface-100 bg-surface-50/50 rounded-lg border p-3">
              <p class="text-surface-800/50 text-[11px]">风险</p>
              <p
                class="mt-1 text-sm font-medium"
                :class="estimate?.mayLoop ? 'text-red-600' : 'text-green-600'"
              >
                {{
                  estimate?.mayLoop
                    ? '潜在无限循环'
                    : estimate?.mayExceedSteps
                      ? '可能超步数'
                      : '正常'
                }}
              </p>
            </div>
          </div>
          <ul
            v-if="estimate?.notes.length"
            class="text-surface-800/60 list-inside list-disc text-[11px]"
          >
            <li v-for="n in estimate.notes" :key="n">{{ n }}</li>
          </ul>
        </div>

        <!-- 类型兼容 -->
        <div v-else class="space-y-1.5">
          <div v-if="typeIssues.length === 0" class="text-surface-800/40 py-8 text-center text-xs">
            未发现类型不兼容。
          </div>
          <div
            v-for="t in typeIssues"
            :key="t.nodeId + t.message"
            class="border-surface-100 bg-surface-50/50 flex items-start gap-2 rounded-lg border px-3 py-2"
          >
            <span
              class="mt-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600"
            >
              警告
            </span>
            <p class="text-surface-800/70 min-w-0 flex-1 text-[11px]">{{ t.message }}</p>
            <button
              type="button"
              class="text-surface-800/50 hover:text-brand-600 rounded-md p-1.5 transition"
              title="定位节点"
              :aria-label="`定位节点 ${t.nodeId}`"
              @click="locate(t.nodeId)"
            >
              <LocateFixed class="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
