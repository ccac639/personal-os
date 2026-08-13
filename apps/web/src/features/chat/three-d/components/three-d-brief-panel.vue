<script setup lang="ts">
/**
 * Chat 功能域 —— 3D 工作台底部面板（时间线 / 生成简报）
 *
 * 时间线：项目本地操作记录（有限数量）。
 * 生成简报：可编辑简报文本、复制 JSON / 纯文本、导出 JSON / Markdown、
 * mock 生成草稿（明确标注「仅本地预览」）。
 */
import {
  Box,
  Camera,
  ClipboardCopy,
  FileCode2,
  FileDown,
  FileText,
  Lightbulb,
  RotateCcw,
  Sparkles,
  Undo2,
} from '@lucide/vue';
import { computed, ref } from 'vue';

import { cameraPresetLabel } from '../service';
import { useThreeDWorkspaceStore } from '../store';
import type { HistoryOpKind } from '../types';

const store = useThreeDWorkspaceStore();

const textarea = ref<HTMLTextAreaElement | null>(null);

const tab = computed({
  get: () => store.ui.bottomTab,
  set: (v: 'history' | 'brief') => {
    store.ui.bottomTab = v;
  },
});

const history = computed(() => store.activeProject?.history ?? []);

function timeLabel(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

const KIND_ICONS: Record<HistoryOpKind, typeof Box> = {
  create: Box,
  update: Box,
  delete: Box,
  duplicate: Box,
  transform: Box,
  color: Box,
  scene: Box,
  project: Box,
  brief: FileText,
  undo: Undo2,
  redo: RotateCcw,
};

function kindIcon(kind: HistoryOpKind) {
  return KIND_ICONS[kind] ?? Box;
}

const draft = computed(() => store.generationDraft);
const generating = computed(() => store.generating);
</script>

<template>
  <section
    class="border-surface-100 bg-surface-0/70 flex h-56 shrink-0 flex-col border-t"
    aria-label="时间线与生成简报"
  >
    <!-- 标签页 -->
    <div class="border-surface-100 flex h-9 shrink-0 items-center gap-1 border-b px-2">
      <button
        class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
        :class="tab === 'history' ? 'bg-surface-100 text-surface-900' : ''"
        :aria-pressed="tab === 'history'"
        @click="tab = 'history'"
      >
        <Undo2 class="size-3" />
        时间线
        <span class="text-surface-800/35 text-[10px]">{{ history.length }}</span>
      </button>
      <button
        class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
        :class="tab === 'brief' ? 'bg-surface-100 text-surface-900' : ''"
        :aria-pressed="tab === 'brief'"
        @click="tab = 'brief'"
      >
        <Lightbulb class="size-3" />
        生成简报
      </button>
    </div>

    <!-- 时间线 -->
    <div v-if="tab === 'history'" class="min-h-0 flex-1 overflow-y-auto px-3 py-2">
      <p v-if="history.length === 0" class="text-surface-800/40 py-4 text-center text-[11px]">
        还没有操作记录（新增 / 复制 / 删除 / 变换等会出现在这里）
      </p>
      <ul v-else class="space-y-1">
        <li
          v-for="h in [...history].reverse()"
          :key="h.id"
          class="text-surface-800/70 flex items-center gap-2 text-[11px]"
        >
          <component :is="kindIcon(h.kind)" class="text-surface-800/35 size-3 shrink-0" />
          <span class="min-w-0 flex-1 truncate">{{ h.label }}</span>
          <span class="text-surface-800/35 shrink-0 text-[10px] tabular-nums">{{
            timeLabel(h.at)
          }}</span>
        </li>
      </ul>
    </div>

    <!-- 生成简报 -->
    <div v-else class="flex min-h-0 flex-1">
      <div class="flex min-w-0 flex-1 flex-col p-2">
        <div class="mb-1.5 flex shrink-0 items-center gap-1">
          <button
            class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
            aria-label="复制简报 JSON"
            title="复制简报 JSON"
            @click="store.copyBriefJson()"
          >
            <ClipboardCopy class="size-3" />
            复制 JSON
          </button>
          <button
            class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
            aria-label="复制简报纯文本"
            title="复制简报纯文本"
            @click="store.copyBriefText()"
          >
            <FileText class="size-3" />
            复制文本
          </button>
          <button
            class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
            aria-label="导出简报 JSON"
            title="导出简报 JSON"
            @click="store.exportBriefJson()"
          >
            <FileCode2 class="size-3" />
            导出 JSON
          </button>
          <button
            class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
            aria-label="导出简报 Markdown"
            title="导出简报 Markdown"
            @click="store.exportBriefMarkdown()"
          >
            <FileDown class="size-3" />
            导出 Markdown
          </button>
          <button
            class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
            aria-label="重置简报文本"
            title="恢复自动生成的简报文本"
            @click="store.resetBriefText()"
          >
            <RotateCcw class="size-3" />
            重置文本
          </button>
          <button
            class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 ml-auto flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-medium text-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
            :disabled="generating"
            aria-label="生成简报草稿（本地 mock）"
            title="生成结构化生成计划（仅本地，不调用真实服务）"
            @click="store.runGenerationDraft()"
          >
            <Sparkles class="size-3" />
            {{ generating ? '生成中…' : '生成简报' }}
          </button>
        </div>
        <textarea
          ref="textarea"
          class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 h-full min-h-0 w-full resize-none rounded-lg border px-2.5 py-2 font-mono text-[11px] leading-relaxed outline-none"
          :value="store.briefText"
          aria-label="生成简报文本（可编辑）"
          spellcheck="false"
          @input="(e: Event) => store.setBriefText((e.target as HTMLTextAreaElement).value)"
        />
      </div>

      <!-- 生成结果 -->
      <div class="border-surface-100 w-72 shrink-0 overflow-y-auto border-l px-3 py-2">
        <template v-if="draft">
          <div class="mb-1.5 flex items-center gap-1.5">
            <Sparkles class="text-brand-600 size-3.5" />
            <p class="text-surface-900 text-[11px] font-semibold">生成计划（本地预览）</p>
          </div>
          <p
            class="mb-2 flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[10px] text-amber-600 dark:bg-amber-500/10"
          >
            <Camera class="size-3" />
            {{ draft.note }}
          </p>
          <ol class="mb-2 space-y-1">
            <li v-for="(step, i) in draft.plan" :key="i" class="text-surface-800/70 text-[10px]">
              {{ i + 1 }}. {{ step }}
            </li>
          </ol>
          <p class="text-surface-800/50 mb-1 text-[10px] font-semibold">建议资产</p>
          <ul class="mb-2 space-y-0.5">
            <li
              v-for="(a, i) in draft.suggestedAssets"
              :key="i"
              class="text-surface-800/60 text-[10px]"
            >
              {{ a.name + (a.primitiveKind ? `（${a.primitiveKind}）` : '') + `：${a.reason}` }}
            </li>
          </ul>
          <p class="text-surface-800/50 mb-1 text-[10px] font-semibold">建议灯光</p>
          <ul class="mb-2 space-y-0.5">
            <li
              v-for="(l, i) in draft.suggestedLights"
              :key="i"
              class="text-surface-800/60 text-[10px]"
            >
              {{ l.kind }} · {{ l.color }} · {{ l.intensity }}
            </li>
          </ul>
          <p class="text-surface-800/50 mb-1 text-[10px] font-semibold">建议镜头</p>
          <p class="text-surface-800/60 text-[10px]">
            {{ cameraPresetLabel(draft.suggestedCamera.preset) }}：{{ draft.suggestedCamera.note }}
          </p>
        </template>
        <p v-else class="text-surface-800/40 py-3 text-center text-[10px]">
          点击「生成简报」获取结构化生成计划（本地 mock）
        </p>
      </div>
    </div>
  </section>
</template>
