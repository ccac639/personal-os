<script setup lang="ts">
import { CalendarClock, Hash, Zap } from '@lucide/vue';
import { computed, ref } from 'vue';

import { parseQuickCapture } from './quick-capture';
import { TASK_PRIORITY_META } from './types';
import type { QuickCaptureParse } from './quick-capture';

const props = defineProps<{ placeholder?: string }>();

const emit = defineEmits<{
  /** 解析成功提交 */
  submit: [parsed: QuickCaptureParse];
}>();

const text = ref('');

const today = (() => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();

const parsed = computed(() => parseQuickCapture(text.value, today));

function commit() {
  const p = parsed.value;
  if (!p) return;
  emit('submit', p);
  text.value = '';
}
</script>

<template>
  <div class="space-y-1.5">
    <div class="flex items-center gap-2">
      <Zap class="text-brand-600 size-4 shrink-0" aria-hidden="true" />
      <input
        v-model="text"
        type="text"
        :placeholder="props.placeholder ?? '快速输入：标题 #标签 !高 今天（回车创建）'"
        class="border-surface-200 bg-surface-0 text-surface-900 focus:border-brand-500 placeholder:text-surface-800/30 min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
        @keydown.enter.prevent="commit"
      />
    </div>
    <!-- 解析预览（确定性解析结果，无 NLP） -->
    <div v-if="parsed" class="flex flex-wrap items-center gap-2 text-xs">
      <span
        v-if="parsed.priority !== 'medium'"
        class="bg-brand-500/10 text-brand-600 rounded-full px-2 py-0.5 font-medium"
      >
        优先级：{{ TASK_PRIORITY_META[parsed.priority].label }}
      </span>
      <span v-if="parsed.dueDate" class="text-surface-800/60 flex items-center gap-1">
        <CalendarClock class="size-3" />
        截止：{{ parsed.dueDate }}
      </span>
      <span v-if="parsed.tags.length" class="text-surface-800/60 flex items-center gap-1">
        <Hash class="size-3" />
        {{ parsed.tags.map((t) => `#${t}`).join(' ') }}
      </span>
      <span class="text-surface-800/40">{{ parsed.title }}</span>
    </div>
  </div>
</template>
