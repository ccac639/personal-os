<script setup lang="ts">
import { computed, ref } from 'vue';
import { Clock, Copy, History, RotateCcw, Sparkles, X } from '@lucide/vue';
import { useWorkflowStore } from './store';

const store = useWorkflowStore();
const emit = defineEmits<{ close: [] }>();

const versions = computed(() => store.listVersions());

/** 相对时间 */
function fmtTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${new Date(ts).getMonth() + 1}月${new Date(ts).getDate()}日`;
}

const confirmRestoreId = ref<string | null>(null);

function requestRestore(id: string) {
  confirmRestoreId.value = id;
}
function doRestore(id: string) {
  store.restoreVersion(id);
  confirmRestoreId.value = null;
}

function createNow() {
  store.createVersion('手动保存版本');
}

function toggleTemplate() {
  const rec = store.activeId ? store.records.find((r) => r.id === store.activeId) : null;
  if (rec) store.toggleTemplate(rec.id);
}

const isTemplate = computed(() =>
  store.activeId ? store.records.find((r) => r.id === store.activeId)?.isTemplate === true : false,
);
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div
      class="border-surface-100/70 bg-surface-0/90 shadow-float flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border backdrop-blur-xl"
    >
      <header class="border-surface-100 flex items-center justify-between border-b px-4 py-3">
        <h3 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
          <History class="text-brand-600 size-4" />
          版本与模板
          <span class="text-surface-800/40 text-[11px] font-normal">
            {{ store.name }}
          </span>
        </h3>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="text-surface-800/50 hover:bg-surface-100 flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] transition"
            :class="isTemplate ? 'bg-amber-500/10 text-amber-600' : ''"
            :title="isTemplate ? '取消模板标记' : '标记为模板（可复制为新工作流）'"
            @click="toggleTemplate"
          >
            <Sparkles class="size-3.5" />
            {{ isTemplate ? '已标记模板' : '标记为模板' }}
          </button>
          <button
            type="button"
            class="text-surface-800/50 hover:bg-surface-50 hover:text-surface-900 rounded-md p-1 transition"
            title="关闭"
            aria-label="关闭"
            @click="emit('close')"
          >
            <X class="size-4" />
          </button>
        </div>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto p-3">
        <!-- 当前结构保存版本 -->
        <button
          type="button"
          class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition disabled:opacity-50"
          :disabled="store.nodes.length === 0"
          @click="createNow"
        >
          <RotateCcw class="size-3.5" />
          保存当前结构为版本
        </button>

        <p class="text-surface-800/40 mt-3 mb-1.5 text-[11px]">
          版本快照（最多 {{ 20 }} 条，手动保存或结构变化时生成）
        </p>

        <ul v-if="versions.length > 0" class="space-y-1.5">
          <li
            v-for="v in versions"
            :key="v.id"
            class="border-surface-100 bg-surface-50/50 flex items-start gap-2 rounded-lg border p-2.5"
          >
            <Clock class="text-surface-800/40 mt-0.5 size-3.5 shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="text-surface-900 truncate text-xs font-medium">{{ v.summary }}</p>
              <p class="text-surface-800/50 mt-0.5 text-[11px]">
                {{ fmtTime(v.createdAt) }} · {{ v.nodes.length }} 节点 · {{ v.edges.length }} 连线
              </p>
            </div>
            <button
              type="button"
              class="text-surface-800/50 hover:bg-surface-100 hover:text-surface-900 shrink-0 rounded-md px-2 py-1 text-[11px] transition"
              :title="'恢复版本到当前工作流'"
              @click="requestRestore(v.id)"
            >
              恢复
            </button>
          </li>
        </ul>
        <p v-else class="text-surface-800/40 py-4 text-center text-xs">
          暂无版本，保存一次即可生成快照
        </p>
      </div>

      <!-- 恢复确认 -->
      <div
        v-if="confirmRestoreId"
        class="border-surface-100 flex items-center justify-between gap-3 border-t bg-amber-500/5 px-4 py-2.5"
      >
        <p class="text-surface-800/80 text-xs">恢复将覆盖当前画布内容（可撤销）。</p>
        <div class="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            class="text-surface-800/50 hover:bg-surface-100 rounded-md px-2 py-1 text-[11px] transition"
            @click="confirmRestoreId = null"
          >
            取消
          </button>
          <button
            type="button"
            class="text-surface-0 rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-medium transition hover:bg-amber-700"
            @click="doRestore(confirmRestoreId)"
          >
            确认恢复
          </button>
        </div>
      </div>

      <!-- 模板提示 -->
      <div class="border-surface-100 flex items-center gap-2 border-t px-4 py-2.5">
        <Copy class="text-surface-800/40 size-3.5 shrink-0" />
        <p class="text-surface-800/60 text-[11px]">
          模板可在列表页一键复制为独立的新工作流，互不影响。
        </p>
      </div>
    </div>
  </div>
</template>
