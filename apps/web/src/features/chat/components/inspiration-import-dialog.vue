<script setup lang="ts">
import { FileUp, X } from '@lucide/vue';
import { ref } from 'vue';

import ChatDrawer from './chat-drawer.vue';
import { parseInspirationImport } from '../inspiration';
import { useInspirationStore } from '../inspiration-store';
import type { InspirationImportPreview, InspirationImportStrategy } from '../inspiration-types';
import { pushToast } from '../toast';

defineProps<{ open: boolean }>();

const emit = defineEmits<{ close: [] }>();

const store = useInspirationStore();

const text = ref('');
const preview = ref<InspirationImportPreview | null>(null);
const parseError = ref<string | null>(null);
const strategy = ref<InspirationImportStrategy>('skip');

const strategies: { key: InspirationImportStrategy; label: string }[] = [
  { key: 'skip', label: '跳过重复' },
  { key: 'overwrite', label: '覆盖重复' },
  { key: 'copy', label: '复制为新条目' },
];

function analyze() {
  parseError.value = null;
  const result = parseInspirationImport(text.value);
  if ('error' in result) {
    parseError.value = result.error;
    preview.value = null;
    return;
  }
  preview.value = result.preview;
}

function close() {
  text.value = '';
  preview.value = null;
  parseError.value = null;
  emit('close');
}

function doImport() {
  if (!text.value.trim()) {
    pushToast('请先粘贴导入内容', 'warning');
    return;
  }
  const result = store.importFromJson(text.value, strategy.value);
  if (!result.ok) {
    pushToast(result.error ?? '导入失败', 'warning');
    return;
  }
  const r = result.result!;
  pushToast(
    `导入完成：新增 ${r.added} / 跳过 ${r.skipped} / 覆盖 ${r.overwritten} / 复制 ${r.copied}`,
    'success',
  );
  close();
}
</script>

<template>
  <ChatDrawer
    :open="open"
    title="导入灵感"
    aria-label="导入灵感"
    @close="close"
  >
    <div class="flex flex-col gap-3.5 p-4">
      <p class="text-surface-800/55 text-xs leading-relaxed">
        粘贴灵感库导出的 JSON（版本 1）。导入前会先展示数量与版本预览。
      </p>

      <textarea
        v-model="text"
        class="border-surface-100 bg-surface-50 focus:border-brand-500 focus:ring-brand-500/30 min-h-40 resize-y rounded-lg border px-2.5 py-2 font-mono text-[11px] leading-relaxed outline-none focus:ring-2"
        placeholder="{&quot;app&quot;:&quot;personal-os-inspiration&quot;,&quot;version&quot;:1,&quot;items&quot;:[...]}"
        aria-label="导入内容"
      />

      <p v-if="parseError" class="text-red-500 text-[11px]" role="alert">{{ parseError }}</p>

      <div v-if="preview" class="border-surface-100 bg-surface-50/60 flex flex-col gap-1 rounded-lg border p-3 text-xs">
        <p class="text-surface-900 font-medium">
          共 {{ preview.total }} 条（版本 {{ preview.version }}）
        </p>
        <p v-if="preview.invalidCount > 0" class="text-red-500 text-[11px]">
          {{ preview.invalidCount }} 条无效{{ preview.firstInvalidReason ? `：${preview.firstInvalidReason}` : '' }}
        </p>
        <p v-else class="text-surface-800/55 text-[11px]">全部通过校验</p>
      </div>

      <div v-if="preview" class="flex flex-col gap-1.5">
        <p class="text-surface-900 text-xs font-medium">重复 ID 处理</p>
        <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="重复 ID 处理策略">
          <button
            v-for="s in strategies"
            :key="s.key"
            type="button"
            role="radio"
            :aria-checked="strategy === s.key"
            class="border-surface-100 hover:border-brand-500/50 focus-visible:ring-brand-500/40 rounded-lg border px-2.5 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2"
            :class="strategy === s.key ? 'bg-brand-500/10 border-brand-500/50 text-brand-600' : 'text-surface-800/60'"
            @click="strategy = s.key"
          >
{{ s.label }}
</button>
        </div>
      </div>
    </div>

    <template #footer>
      <button
        class="hover:bg-surface-100 text-surface-800/70 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
        aria-label="取消"
        @click="close"
      >
        <X class="size-3.5" />
        取消
      </button>
      <button
        class="hover:bg-surface-100 text-surface-800/70 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
        aria-label="分析导入内容"
        @click="analyze"
      >
        预览
      </button>
      <button
        class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-4 py-1.5 text-xs font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2"
        aria-label="确认导入"
        :disabled="!preview"
        :class="preview ? '' : 'opacity-40'"
        @click="doImport"
      >
        <FileUp class="size-3.5" />
        导入
      </button>
    </template>
  </ChatDrawer>
</template>
