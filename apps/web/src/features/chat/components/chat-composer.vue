<script setup lang="ts">
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  GripVertical,
  ImagePlus,
  Pencil,
  Quote,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  X,
} from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import {
  formatFileSize,
  reorderAttachments,
  validateDraftFiles,
} from '../draft';
import { allSystemPromptPresets, createCustomPreset } from '../presets';
import { CHAT_MODELS } from '../models';
import { useChatStore } from '../store';
import { pushToast } from '../toast';
import type {
  ChatAttachmentDraft,
  ChatOutputMode,
  ChatReplyLength,
  ChatSystemPromptPreset,
} from '../types';

const store = useChatStore();

const text = ref('');
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const modelMenuOpen = ref(false);
const systemPromptOpen = ref(false);
/** 系统提示词编辑缓冲（应用/另存为前仅内存） */
const promptBuffer = ref('');
/** 预设列表：内置 + 自定义（自定义变更后刷新） */
const presets = ref<ChatSystemPromptPreset[]>(allSystemPromptPresets());
/** 另存为预设的内联表单 */
const saveFormOpen = ref(false);
const presetNameInput = ref('');

/** 模型选择弹层挂载点 */
const modelMenuRef = ref<HTMLElement | null>(null);

/** 附件草稿：仅浏览器内预览，禁止上传、禁止写入 localStorage */
const attachments = ref<ChatAttachmentDraft[]>([]);
const draftErrors = ref<string[]>([]);
const fileInputRef = ref<HTMLInputElement | null>(null);
/** 拖拽排序中的源下标 */
const dragIndex = ref<number | null>(null);

const OUTPUT_MODES: { key: ChatOutputMode; label: string }[] = [
  { key: 'chat', label: '对话' },
  { key: 'writing', label: '写作' },
  { key: 'code', label: '代码' },
  { key: 'image', label: '图像提示词' },
];

const REPLY_LENGTHS: { key: ChatReplyLength; label: string }[] = [
  { key: 'short', label: '简洁' },
  { key: 'standard', label: '标准' },
  { key: 'detailed', label: '详细' },
];

const currentModelLabel = computed(
  () => CHAT_MODELS.find((m) => m.id === store.activeModelId)?.label ?? '模型',
);

/** 上下文预算（本地估算，非真实 tokenizer） */
const budget = computed(() =>
  store.sessionBudget(store.activeSession, store.activeModelId),
);

const quotePreview = computed(() => {
  const q = store.quoteTarget;
  if (!q) return '';
  return q.content.length > 120 ? `${q.content.slice(0, 120)}…` : q.content;
});

/** 当前模型类别与输出模式不一致时，给推荐模型打标 */
const showRecommend = computed(
  () =>
    !!store.modeRecommendedModel &&
    store.categoryOf(store.activeModelId) !== store.modeCategory,
);

function isRecommended(id: string): boolean {
  return showRecommend.value && store.modeRecommendedModel?.id === id;
}

function autoResize() {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
}

function nextTickResize() {
  requestAnimationFrame(() => autoResize());
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    send();
  }
}

function send() {
  if (store.isStreaming) {
    store.stopStreaming();
    return;
  }
  if (!text.value.trim()) return;
  if (store.editingId) {
    store.editAndResend(store.editingId, text.value, store.quoteTarget ?? undefined);
    store.cancelEdit();
  } else {
    store.sendMessage(text.value, store.quoteTarget ?? undefined);
  }
  text.value = '';
  store.clearQuote();
  clearAttachments();
  nextTickResize();
}

/** 进入编辑态：填充原消息文本并聚焦；引用态还原原消息引用 */
watch(
  () => store.editingId,
  (id, oldId) => {
    if (id) {
      const msgs = store.activeSession?.messages ?? [];
      const msg = msgs.find((m) => m.id === id);
      if (msg) {
        text.value = msg.content;
        if (msg.quote) store.quoteTarget = msg.quote;
        nextTickResize();
        textareaRef.value?.focus();
      }
    } else if (oldId) {
      text.value = '';
      nextTickResize();
    }
  },
);

/* ---------- 附件草稿（校验 / 排序 / 移除） ---------- */

function addFiles(files: FileList | File[] | null) {
  if (!files) return;
  const result = validateDraftFiles(
    Array.from(files),
    attachments.value,
    (f) => URL.createObjectURL(f),
  );
  attachments.value = [...attachments.value, ...result.items];
  draftErrors.value = result.errors.map((e) => e.message);
  if (fileInputRef.value) fileInputRef.value.value = '';
}

function removeAttachment(id: string) {
  const target = attachments.value.find((a) => a.id === id);
  if (target) URL.revokeObjectURL(target.url);
  attachments.value = attachments.value.filter((a) => a.id !== id);
}

function clearAttachments() {
  for (const a of attachments.value) URL.revokeObjectURL(a.url);
  attachments.value = [];
  draftErrors.value = [];
}

function handleDrop(e: DragEvent) {
  e.preventDefault();
  addFiles(e.dataTransfer?.files ?? null);
}

function onDragStart(i: number) {
  dragIndex.value = i;
}

function onDragOver(e: DragEvent) {
  e.preventDefault();
}

function onDropAt(i: number) {
  const from = dragIndex.value;
  if (from !== null && from !== i) {
    attachments.value = reorderAttachments(attachments.value, from, i);
  }
  dragIndex.value = null;
}

function moveAttachment(id: string, dir: -1 | 1) {
  const idx = attachments.value.findIndex((a) => a.id === id);
  const to = idx + dir;
  if (idx < 0 || to < 0 || to >= attachments.value.length) return;
  attachments.value = reorderAttachments(attachments.value, idx, to);
}

/* ---------- 系统提示词预设（会话级） ---------- */

function refreshPresets() {
  presets.value = allSystemPromptPresets();
}

/** 打开面板 / 会话提示词变化时，同步编辑缓冲 */
watch(
  [systemPromptOpen, () => store.sessionSystemPrompt],
  () => {
    if (systemPromptOpen.value) {
      promptBuffer.value = store.sessionSystemPrompt?.text ?? '';
    }
  },
);

/** 系统提示词：开关与折叠面板联动 */
function toggleSystemPrompt() {
  const next = !store.prefs.systemPromptEnabled;
  store.setSystemPromptEnabled(next);
  systemPromptOpen.value = next;
}

function applyPreset(presetId: string) {
  if (presetId === 'none') {
    store.clearSessionSystemPrompt();
    promptBuffer.value = '';
    return;
  }
  const preset = presets.value.find((p) => p.id === presetId);
  if (!preset) return;
  store.setSessionSystemPrompt(preset.id, preset.text);
  promptBuffer.value = preset.text;
}

function applyCustom() {
  if (!promptBuffer.value.trim()) {
    store.clearSessionSystemPrompt();
    return;
  }
  store.setSessionCustomPrompt(promptBuffer.value);
}

async function copyPrompt() {
  const content = store.sessionSystemPrompt?.text ?? promptBuffer.value;
  if (!content.trim()) {
    pushToast('当前没有可复制的系统提示词', 'warning');
    return;
  }
  try {
    await navigator.clipboard.writeText(content);
    pushToast('系统提示词已复制');
  } catch {
    pushToast('复制失败，请重试', 'warning');
  }
}

function restoreDefault() {
  store.restoreDefaultSystemPrompt();
  promptBuffer.value = store.sessionSystemPrompt?.text ?? '';
  pushToast('已恢复默认预设（通用协作）');
}

function openSaveForm() {
  if (!promptBuffer.value.trim()) {
    pushToast('请先输入要保存的提示词内容', 'warning');
    return;
  }
  presetNameInput.value = '';
  saveFormOpen.value = true;
}

function saveCustomPreset() {
  const preset = createCustomPreset(presetNameInput.value, promptBuffer.value);
  if (!preset) {
    pushToast('预设名称不能为空', 'warning');
    return;
  }
  refreshPresets();
  store.setSessionSystemPrompt(preset.id, preset.text);
  saveFormOpen.value = false;
  pushToast(`已保存自定义预设「${preset.name}」`);
}

/* ---------- 全局交互 ---------- */

function onGlobalClick(e: MouseEvent) {
  if (modelMenuRef.value && !modelMenuRef.value.contains(e.target as Node)) {
    modelMenuOpen.value = false;
  }
}

function onGlobalKeydown(e: KeyboardEvent) {
  // Ctrl/Cmd + K：聚焦输入框
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    textareaRef.value?.focus();
    return;
  }
  // Escape：关闭模型菜单 / 系统提示词面板 / 取消编辑 / 取消引用等临时交互
  if (e.key === 'Escape') {
    if (modelMenuOpen.value) modelMenuOpen.value = false;
    if (systemPromptOpen.value) systemPromptOpen.value = false;
    if (store.editingId) store.cancelEdit();
    if (store.quoteTarget) store.clearQuote();
  }
}

onMounted(() => {
  document.addEventListener('click', onGlobalClick);
  window.addEventListener('keydown', onGlobalKeydown);
  refreshPresets();
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onGlobalClick);
  window.removeEventListener('keydown', onGlobalKeydown);
  clearAttachments();
});
</script>

<template>
  <div class="shrink-0 px-4 pb-3">
    <div class="mx-auto w-full max-w-3xl">
      <!-- 编辑态提示条 -->
      <div
        v-if="store.editingId"
        class="border-brand-200 bg-brand-50 text-brand-700 mb-2 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs"
      >
        <Pencil class="size-3.5 shrink-0" />
        <span class="min-w-0 flex-1 truncate">正在编辑上一条消息</span>
        <button
          class="hover:bg-brand-100 focus-visible:ring-brand-500/40 flex size-5 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2"
          aria-label="取消编辑"
          title="取消编辑（Esc）"
          @click="store.cancelEdit()"
        >
          <X class="size-3.5" />
        </button>
      </div>

      <!-- 引用回复条 -->
      <div
        v-if="store.quoteTarget"
        class="border-brand-200 bg-brand-50 text-brand-700 mb-2 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs"
      >
        <Quote class="size-3.5 shrink-0" />
        <span class="min-w-0 flex-1">
          <span class="block truncate font-medium">
            引用{{ store.quoteTarget.role === 'user' ? '用户' : '助手' }}消息
          </span>
          <span class="text-brand-700/70 block truncate">{{ quotePreview }}</span>
        </span>
        <button
          class="hover:bg-brand-100 focus-visible:ring-brand-500/40 flex size-5 shrink-0 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2"
          aria-label="取消引用"
          title="取消引用（Esc）"
          @click="store.clearQuote()"
        >
          <X class="size-3.5" />
        </button>
      </div>

      <!-- 附件校验错误 -->
      <p
        v-if="draftErrors.length > 0"
        class="mb-1.5 px-1 text-[11px] leading-relaxed text-red-500"
        role="alert"
      >
        {{ draftErrors.join('；') }}
      </p>

      <!-- 附件草稿（本地预览，可拖拽排序） -->
      <div
        v-if="attachments.length > 0"
        class="mb-2 flex flex-wrap items-center gap-2"
      >
        <div
          v-for="(a, i) in attachments"
          :key="a.id"
          class="border-surface-100 bg-surface-0 shadow-card group/att relative flex items-center gap-1.5 rounded-lg border p-1.5 pr-2"
          draggable="true"
          :aria-label="`附件 ${a.name}`"
          @dragstart="onDragStart(i)"
          @dragover="onDragOver"
          @drop.prevent="onDropAt(i)"
        >
          <GripVertical class="size-3 shrink-0 cursor-grab text-surface-800/30" aria-hidden="true" />
          <img
            :src="a.url"
            :alt="a.name"
            class="size-10 rounded-md object-cover"
          />
          <span class="max-w-36">
            <span class="text-surface-900 block truncate text-[11px] font-medium">{{ a.name }}</span>
            <span class="text-surface-800/45 block text-[10px]">{{ formatFileSize(a.size) }} · 待上传</span>
          </span>
          <span class="flex shrink-0 flex-col">
            <button
              class="text-surface-800/40 hover:bg-surface-100 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-4 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-1 disabled:opacity-30"
              :aria-label="`上移附件 ${a.name}`"
              :disabled="i === 0"
              @click="moveAttachment(a.id, -1)"
            >
              <ChevronUp class="size-3" />
            </button>
            <button
              class="text-surface-800/40 hover:bg-surface-100 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-4 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-1 disabled:opacity-30"
              :aria-label="`下移附件 ${a.name}`"
              :disabled="i === attachments.length - 1"
              @click="moveAttachment(a.id, 1)"
            >
              <ChevronDown class="size-3" />
            </button>
          </span>
          <button
            class="text-surface-800/50 hover:bg-red-50 hover:text-red-600 focus-visible:ring-brand-500/40 flex size-5 shrink-0 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2"
            :aria-label="`移除附件 ${a.name}`"
            :title="`移除附件 ${a.name}`"
            @click="removeAttachment(a.id)"
          >
            <X class="size-3" />
          </button>
        </div>
        <button
          class="hover:bg-surface-100 text-surface-800/55 hover:text-red-600 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2"
          aria-label="清空全部附件"
          title="清空全部附件"
          @click="clearAttachments"
        >
          <Trash2 class="size-3" />
          清空附件
        </button>
      </div>

      <!-- 配置行：输出模式 / 回复长度 / 系统提示词 / 模型 -->
      <div class="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
        <!-- 输出模式 -->
        <div class="flex items-center gap-0.5" role="group" aria-label="输出模式">
          <button
            v-for="m in OUTPUT_MODES"
            :key="m.key"
            class="text-surface-800/55 hover:bg-surface-100 hover:text-surface-900 focus-visible:ring-brand-500/40 rounded-md px-1.5 py-0.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2"
            :class="store.prefs.outputMode === m.key ? 'bg-surface-100 text-surface-900 font-medium' : ''"
            :aria-pressed="store.prefs.outputMode === m.key"
            @click="store.setOutputMode(m.key)"
          >
            {{ m.label }}
          </button>
        </div>

        <!-- 回复长度 -->
        <div class="flex items-center gap-0.5" role="group" aria-label="回复长度">
          <button
            v-for="l in REPLY_LENGTHS"
            :key="l.key"
            class="text-surface-800/45 hover:bg-surface-100 hover:text-surface-900 focus-visible:ring-brand-500/40 rounded-md px-1.5 py-0.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2"
            :class="store.prefs.replyLength === l.key ? 'bg-surface-100 text-surface-900 font-medium' : ''"
            :aria-pressed="store.prefs.replyLength === l.key"
            @click="store.setReplyLength(l.key)"
          >
            {{ l.label }}
          </button>
        </div>

        <!-- 系统提示词开关 -->
        <button
          class="hover:bg-surface-100 text-surface-800/55 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2"
          :class="store.prefs.systemPromptEnabled ? 'bg-surface-100 text-surface-900 font-medium' : ''"
          :aria-pressed="store.prefs.systemPromptEnabled"
          aria-label="系统提示词"
          title="系统提示词"
          @click="toggleSystemPrompt"
        >
          <SlidersHorizontal class="size-3" />
          系统提示词
        </button>

        <span class="text-surface-800/20 hidden select-none sm:inline">·</span>

        <!-- 当前模型快捷选择 -->
        <div ref="modelMenuRef" class="relative">
          <button
            class="hover:bg-surface-100 text-surface-800/70 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
            aria-label="选择模型"
            title="选择模型"
            @click="modelMenuOpen = !modelMenuOpen"
          >
            <Sparkles class="size-3" />
            {{ currentModelLabel }}
            <ChevronDown class="size-2.5" :class="modelMenuOpen ? 'rotate-180' : ''" />
          </button>

          <transition
            enter-active-class="transition duration-150 ease-out"
            enter-from-class="opacity-0 scale-95"
            enter-to-class="opacity-100 scale-100"
            leave-active-class="transition duration-100 ease-in"
            leave-from-class="opacity-100 scale-100"
            leave-to-class="opacity-0 scale-95"
          >
            <div
              v-if="modelMenuOpen"
              class="bg-surface-0 shadow-float border-surface-100 absolute bottom-full left-0 z-30 mb-1 w-60 overflow-hidden rounded-xl border py-1"
            >
              <p class="text-surface-800/40 px-3 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wider">
                切换模型
              </p>
              <button
                v-for="m in CHAT_MODELS"
                :key="m.id"
                class="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-surface-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                :class="store.activeModelId === m.id ? 'text-brand-600' : 'text-surface-800/80'"
                @click="store.setCurrentModel(m.id); modelMenuOpen = false"
              >
                <span class="flex items-center gap-2">
                  <span
                    class="flex size-5 items-center justify-center rounded text-[10px] font-bold text-white"
                    :style="{ background: m.color }"
                  >
                    {{ m.label.slice(0, 1) }}
                  </span>
                  <span>
                    <span class="block text-sm font-medium">
                      {{ m.label }}
                      <span
                        v-if="isRecommended(m.id)"
                        class="border-brand-200 text-brand-600 ml-1 rounded border px-1 align-middle text-[9px] font-medium"
                      >推荐</span>
                    </span>
                    <span class="text-surface-800/45 block text-[11px]">{{ m.hint }}</span>
                  </span>
                </span>
                <Check v-if="store.activeModelId === m.id" class="size-4" />
              </button>
            </div>
          </transition>
        </div>
      </div>

      <!-- 系统提示词预设面板（会话级；自定义预设持久化，会话文本随会话存储） -->
      <transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="opacity-0 -translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-1"
      >
        <div
          v-if="store.prefs.systemPromptEnabled && systemPromptOpen"
          class="border-surface-100 bg-surface-0 shadow-card mb-2 rounded-lg border p-2"
        >
          <p class="text-surface-800/40 px-1 pb-1.5 text-[10px] font-medium uppercase tracking-wider">
            系统提示词预设（会话级）
          </p>
          <div class="flex flex-wrap items-center gap-1" role="group" aria-label="提示词预设">
            <button
              class="border-surface-100 text-surface-800/55 hover:bg-surface-100 hover:text-surface-900 focus-visible:ring-brand-500/40 rounded-md border px-2 py-0.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2"
              :class="!store.sessionSystemPrompt ? 'border-brand-300 bg-surface-100 text-surface-900 font-medium' : ''"
              :aria-pressed="!store.sessionSystemPrompt"
              @click="applyPreset('none')"
            >
              无
            </button>
            <button
              v-for="p in presets"
              :key="p.id"
              class="border-surface-100 text-surface-800/55 hover:bg-surface-100 hover:text-surface-900 focus-visible:ring-brand-500/40 rounded-md border px-2 py-0.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2"
              :class="store.sessionSystemPrompt?.presetId === p.id ? 'border-brand-300 bg-surface-100 text-surface-900 font-medium' : ''"
              :aria-pressed="store.sessionSystemPrompt?.presetId === p.id"
              @click="applyPreset(p.id)"
            >
              {{ p.name }}
              <span
                v-if="p.builtin"
                class="text-surface-800/35 ml-0.5 text-[9px]"
              >内置</span>
            </button>
          </div>
          <textarea
            v-model="promptBuffer"
            class="scrollbar-thin bg-surface-50 text-surface-900 mt-2 block max-h-28 w-full resize-none rounded-md border border-transparent px-2.5 py-1.5 text-xs leading-relaxed outline-none transition-colors focus:border-brand-500"
            rows="2"
            placeholder="自定义系统提示词（点击「应用」后对当前会话生效）…"
            aria-label="系统提示词内容"
          />
          <div class="mt-1.5 flex flex-wrap items-center gap-1 px-1">
            <button
              class="bg-brand-600 hover:bg-brand-700 text-surface-0 focus-visible:ring-brand-500/40 rounded-md px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
              aria-label="应用自定义提示词"
              @click="applyCustom"
            >
              应用
            </button>
            <button
              class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 rounded-md px-2 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2"
              aria-label="另存为预设"
              @click="openSaveForm"
            >
              另存为预设
            </button>
            <button
              class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2"
              aria-label="复制系统提示词"
              @click="copyPrompt"
            >
              <Copy class="size-3" />
              复制
            </button>
            <button
              class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2"
              aria-label="恢复默认提示词"
              @click="restoreDefault"
            >
              <RotateCcw class="size-3" />
              恢复默认
            </button>
          </div>
          <div v-if="saveFormOpen" class="mt-1.5 flex items-center gap-1.5 px-1">
            <input
              v-model="presetNameInput"
              class="border-surface-200 bg-surface-50 text-surface-900 h-7 min-w-0 flex-1 rounded-md border px-2 text-xs outline-none focus:border-brand-500"
              type="text"
              placeholder="预设名称"
              aria-label="自定义预设名称"
              @keydown.enter="saveCustomPreset"
            />
            <button
              class="bg-brand-600 hover:bg-brand-700 text-surface-0 focus-visible:ring-brand-500/40 rounded-md px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
              aria-label="保存自定义预设"
              @click="saveCustomPreset"
            >
              保存
            </button>
            <button
              class="hover:bg-surface-100 text-surface-800/60 focus-visible:ring-brand-500/40 rounded-md px-2 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2"
              aria-label="取消保存预设"
              @click="saveFormOpen = false"
            >
              取消
            </button>
          </div>
          <p class="text-surface-800/35 mt-1.5 px-1 text-[10px]">
            预设文本会保存到本地；附件与未应用的内容不会写入 localStorage
          </p>
        </div>
      </transition>

      <!-- 上下文预算提示 -->
      <p
        v-if="budget.level !== 'ok'"
        class="mb-1.5 px-1 text-[11px]"
        :class="budget.level === 'danger' ? 'text-red-500' : 'text-amber-600'"
        role="status"
      >
        上下文预算：约 {{ budget.used.toLocaleString() }} / {{ budget.limit.toLocaleString() }}
        tokens（{{ Math.round(budget.ratio * 100) }}%）
        {{ budget.level === 'danger' ? '，接近上限，建议精简历史或新建会话' : '，内容较长，注意控制输入长度' }}
      </p>

      <!-- 输入面板 -->
      <div
        class="border-surface-200 focus-within:border-brand-500 bg-surface-0 shadow-card focus-within:ring-brand-500/15 rounded-2xl border transition-all focus-within:ring-4"
        @dragover.prevent
        @drop.prevent="handleDrop"
      >
        <textarea
          ref="textareaRef"
          v-model="text"
          class="scrollbar-thin block max-h-40 w-full resize-none overflow-y-auto bg-transparent px-4 pt-3.5 text-[0.925rem] leading-relaxed outline-none placeholder:text-surface-800/40"
          :placeholder="
            store.isStreaming
              ? '正在回复…'
              : store.editingId
                ? '编辑消息，Enter 保存修改…'
                : '输入内容，Enter 发送；可拖入图片预览'
          "
          :disabled="store.isStreaming"
          rows="1"
          aria-label="消息输入框"
          @input="autoResize"
          @keydown="handleKeydown"
        />

        <!-- 工具栏 -->
        <div class="flex items-center justify-between px-2.5 pb-2.5 pt-1">
          <div class="flex items-center gap-1">
            <!-- 图片附件 -->
            <button
              class="text-surface-800/40 hover:bg-surface-100 hover:text-surface-800 focus-visible:ring-brand-500/40 flex size-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2"
              :disabled="store.isStreaming"
              aria-label="添加图片"
              title="添加图片（仅本地预览）"
              @click="fileInputRef?.click()"
            >
              <ImagePlus class="size-4" />
            </button>
            <input
              ref="fileInputRef"
              class="hidden"
              type="file"
              accept="image/*"
              multiple
              aria-hidden="true"
              tabindex="-1"
              @change="addFiles(fileInputRef?.files ?? null)"
            />
            <span
              v-if="text.trim().length > 2000"
              class="text-surface-800/35 text-[10px]"
              aria-hidden="true"
            >
              已输入 {{ text.length }} 字
            </span>
          </div>

          <!-- 发送 / 停止 -->
          <button
            class="focus-visible:ring-brand-500/40 flex size-8 items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-2"
            :class="
              store.isStreaming
                ? 'bg-surface-100 hover:bg-surface-200 text-surface-900'
                : text.trim()
                  ? 'bg-brand-600 hover:bg-brand-700 text-surface-0 shadow-sm'
                  : 'bg-surface-100 text-surface-800/40'
            "
            :aria-label="
              store.isStreaming ? '停止生成' : store.editingId ? '保存修改' : '发送消息'
            "
            :title="
              store.isStreaming ? '停止生成' : store.editingId ? '保存修改（Enter）' : '发送消息（Enter）'
            "
            :disabled="!store.isStreaming && !text.trim()"
            @click="send"
          >
            <Square v-if="store.isStreaming" class="size-3.5 fill-current" />
            <ArrowUp v-else class="size-4" />
          </button>
        </div>
      </div>

      <!-- 快捷键提示 -->
      <p class="text-surface-800/35 mt-2 text-center text-[11px]">
        Enter 发送 · Shift + Enter 换行 · Ctrl/⌘ + K 聚焦输入 · 图片仅本地预览
      </p>
    </div>
  </div>
</template>

<style scoped>
.scrollbar-thin::-webkit-scrollbar {
  width: 6px;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  border-radius: 9999px;
  background: rgb(15 23 42 / 0.12);
}
.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background: rgb(15 23 42 / 0.24);
}
.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}
</style>
