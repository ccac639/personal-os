<script setup lang="ts">
/**
 * AI 工作流助手面板：自然语言生成 / 补充 / 解释
 * 流程：输入需求 -> 生成（mock service，未来接真实 LLM）-> 校验 -> 画布预览 -> 用户确认
 * 生成结果只进入 preview state，不直接写正式 store。
 */
import { computed, ref } from 'vue';
import { Bot, Loader2, Sparkles, X } from '@lucide/vue';
import { useWorkflowStore } from './store';
import type { AiGenMode } from './ai-workflow';

const store = useWorkflowStore();

const prompt = ref('');
const scope = ref<AiGenMode>('new');

const MODES: Array<{ value: AiGenMode; label: string; hint: string }> = [
  { value: 'new', label: '生成新工作流', hint: '从零生成一张可运行的工作流' },
  { value: 'extend', label: '补充当前画布', hint: '在现有画布上增加节点并自动连接' },
];

const hasPreview = computed(() => store.aiPreview !== null);

function generate() {
  store.generateAiWorkflow(prompt.value, scope.value);
}

function clear() {
  store.clearAiPreview();
  prompt.value = '';
}
</script>

<template>
  <aside
    class="border-surface-100 bg-surface-0 flex w-full shrink-0 flex-col rounded-xl border shadow-sm lg:w-72"
  >
    <header class="border-surface-100 flex items-center justify-between border-b px-3 py-2.5">
      <h2 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
        <span
          class="flex size-6 items-center justify-center rounded-md bg-violet-500/10 text-violet-600"
        >
          <Bot class="size-3.5" />
        </span>
        AI 工作流助手
      </h2>
      <button
        v-if="hasPreview || store.aiError"
        type="button"
        class="text-surface-800/50 hover:text-surface-900 rounded-lg p-1 transition"
        aria-label="关闭 AI 面板"
        title="关闭 AI 面板"
        @click="clear"
      >
        <X class="size-3.5" />
      </button>
    </header>

    <div class="flex flex-col gap-2.5 p-3">
      <!-- 模式选择 -->
      <div class="grid grid-cols-2 gap-1.5">
        <button
          v-for="m in MODES"
          :key="m.value"
          type="button"
          class="rounded-lg border px-2 py-1.5 text-left text-[11px] transition"
          :class="
            scope === m.value
              ? 'border-violet-500 bg-violet-500/10 text-violet-700 dark:text-violet-300'
              : 'border-surface-100 text-surface-800/60 hover:border-surface-800/30'
          "
          :title="m.hint"
          :aria-pressed="scope === m.value"
          @click="scope = m.value"
        >
          <span class="block font-medium">{{ m.label }}</span>
          <span class="text-surface-800/40 block truncate">{{ m.hint }}</span>
        </button>
      </div>

      <!-- 需求输入 -->
      <textarea
        v-model="prompt"
        rows="3"
        class="border-surface-100 bg-surface-50 text-surface-900 w-full resize-none rounded-lg border px-2 py-1.5 text-xs outline-none focus:border-violet-500"
        placeholder="例如：每天早上 9 点抓取文章，用 AI 总结风险，有风险时推送通知"
        :disabled="store.aiBusy || store.running"
      />
      <p class="text-surface-800/40 -mt-1 text-[10px]">
        本地模拟生成（不调用真实 AI），支持：定时、提示词、AI 生成、代码、条件、延迟、通知、输出
      </p>

      <button
        type="button"
        class="text-surface-0 flex w-full items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium transition hover:bg-violet-700 disabled:opacity-50"
        :disabled="store.aiBusy || store.running || !prompt.trim()"
        @click="generate"
      >
        <Loader2 v-if="store.aiBusy" class="size-3.5 animate-spin" />
        <Sparkles v-else class="size-3.5" />
        {{ store.aiBusy ? '生成中…' : hasPreview ? '重新生成' : '生成工作流' }}
      </button>

      <!-- 生成结果摘要 -->
      <div
        v-if="store.aiError"
        class="rounded-lg border border-red-300 bg-red-50 px-2.5 py-2 text-[11px] text-red-700 dark:border-red-500/40 dark:bg-red-950/60 dark:text-red-300"
      >
        {{ store.aiError }}
      </div>
      <div
        v-else-if="hasPreview"
        class="rounded-lg border border-violet-500/30 bg-violet-500/5 px-2.5 py-2 text-[11px] text-violet-700 dark:text-violet-300"
      >
        <p class="font-medium">{{ store.aiPreview?.response.summary }}</p>
        <p class="mt-0.5 text-violet-600/60 dark:text-violet-300/60">
          已在画布预览 · 请确认后再应用（可撤销）
        </p>
      </div>
    </div>
  </aside>
</template>
