<script setup lang="ts">
/**
 * 只读分享快照面板：生成 JSON 快照（复制 / 下载）与导入快照为新工作流。
 * 不生成网络 URL，不涉及真实分享服务。
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import { ClipboardCopy, Download, Share2, Upload, X } from '@lucide/vue';
import { useWorkflowStore } from './store';
import { estimateSnapshotBytes } from './share';

const store = useWorkflowStore();
const emit = defineEmits<{ close: [] }>();

/* ---------- 生成快照 ---------- */

const snapshotText = ref('');
const snapshotBytes = computed(() => estimateSnapshotBytes(snapshotText.value));
const generated = ref(false);
const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

function generate() {
  snapshotText.value = store.buildShareSnapshotJson();
  generated.value = true;
  copied.value = false;
}

async function copySnapshot() {
  if (!snapshotText.value) return;
  try {
    await navigator.clipboard.writeText(snapshotText.value);
    copied.value = true;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copied.value = false;
      copyTimer = null;
    }, 1500);
  } catch {
    // 剪贴板不可用时降级：选中文本由用户手动复制
    copied.value = false;
  }
}

onBeforeUnmount(() => {
  if (copyTimer) clearTimeout(copyTimer);
});

function downloadSnapshot() {
  if (!snapshotText.value) return;
  const blob = new Blob([snapshotText.value], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${store.name || 'workflow'}-share.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- 导入快照为新工作流 ---------- */

const importText = ref('');
const importError = ref('');
const importSuccess = ref('');

function importShare() {
  const text = importText.value.trim();
  if (!text) {
    importError.value = '请粘贴分享快照 JSON';
    return;
  }
  // 快速结构检查（轻量，不重复完整解析）
  const quick = store.quickCheckShare(text);
  if (!quick.ok) {
    importError.value = quick.error ?? '快照无效';
    return;
  }
  const result = store.importShareSnapshot(text);
  if (result.ok) {
    importError.value = '';
    importSuccess.value = `已导入为新工作流（独立 ID），当前画布已切换。节点已重映射为全新 ID。`;
    importText.value = '';
  } else {
    importError.value = result.errors.join('；') || '导入失败';
  }
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  return `${(n / 1024).toFixed(1)}KB`;
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div
      class="border-surface-100/70 bg-surface-0/90 shadow-float flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border backdrop-blur-xl"
    >
      <header class="border-surface-100 flex items-center justify-between border-b px-4 py-3">
        <h3 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
          <Share2 class="text-brand-600 size-4" />
          只读分享快照
          <span class="text-surface-800/40 text-[11px]">（本地 JSON，不生成网络链接）</span>
        </h3>
        <button
          type="button"
          class="text-surface-800/50 hover:bg-surface-100 rounded-md p-1.5 transition"
          aria-label="关闭分享面板"
          title="关闭"
          @click="emit('close')"
        >
          <X class="size-4" />
        </button>
      </header>

      <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <!-- 生成快照 -->
        <section class="border-surface-100 bg-surface-50/50 rounded-lg border p-3">
          <div class="flex items-center justify-between">
            <p class="text-surface-900 text-xs font-semibold">生成只读快照</p>
            <span v-if="generated" class="text-surface-800/40 text-[10px] tabular-nums">
              {{ fmtBytes(snapshotBytes) }}
            </span>
          </div>
          <p class="text-surface-800/50 mt-1 text-[11px] leading-relaxed">
            快照包含节点 / 连线 / 输入输出 / 运行配置 / 断言 /
            注释；不含运行时状态、运行历史、配置档案与敏感字段。
          </p>
          <div class="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition"
              :disabled="store.nodes.length === 0"
              @click="generate"
            >
              <Share2 class="size-3.5" />
              生成快照
            </button>
            <button
              type="button"
              class="text-surface-800/70 hover:bg-surface-100 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition disabled:opacity-40"
              :disabled="!snapshotText"
              @click="copySnapshot"
            >
              <ClipboardCopy class="size-3.5" />
              {{ copied ? '已复制' : '复制内容' }}
            </button>
            <button
              type="button"
              class="text-surface-800/70 hover:bg-surface-100 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition disabled:opacity-40"
              :disabled="!snapshotText"
              @click="downloadSnapshot"
            >
              <Download class="size-3.5" />
              下载 JSON
            </button>
          </div>
          <textarea
            v-model="snapshotText"
            readonly
            rows="8"
            placeholder="点击「生成快照」后在此显示只读 JSON…"
            class="border-surface-100 bg-surface-0 text-surface-900 mt-2 w-full resize-y rounded-lg border px-2.5 py-2 font-mono text-[11px] leading-relaxed outline-none"
          />
        </section>

        <!-- 导入快照为新工作流 -->
        <section class="border-surface-100 bg-surface-50/50 rounded-lg border p-3">
          <p class="text-surface-900 text-xs font-semibold">导入快照为新工作流</p>
          <p class="text-surface-800/50 mt-1 text-[11px] leading-relaxed">
            粘贴分享快照 JSON，导入后生成独立工作流 ID 与全新节点 ID（不覆盖当前内容）。
          </p>
          <textarea
            v-model="importText"
            rows="5"
            placeholder='粘贴 {"kind":"workflow-share", ...} 快照内容…'
            class="border-surface-100 bg-surface-0 text-surface-900 focus:border-brand-500 mt-2 w-full resize-y rounded-lg border px-2.5 py-2 font-mono text-[11px] leading-relaxed outline-none"
          />
          <div class="mt-2 flex items-center gap-2">
            <button
              type="button"
              class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-40"
              :disabled="!importText.trim()"
              @click="importShare"
            >
              <Upload class="size-3.5" />
              导入为新工作流
            </button>
            <span v-if="importError" class="text-[11px] text-red-600">{{ importError }}</span>
            <span v-if="importSuccess" class="text-[11px] text-green-600">{{ importSuccess }}</span>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
