<script setup lang="ts">
import {
  Bookmark,
  Bot,
  Check,
  ClipboardList,
  Copy,
  Download,
  FileDown,
  GitBranch,
  Lightbulb,
  Pencil,
  Quote,
  RefreshCw,
} from '@lucide/vue';
import { motion } from 'motion-v';
import { computed, onBeforeUnmount, ref } from 'vue';

import { dispatchChatAction } from '../actions';
import { renderMarkdown } from '../markdown';
import { categoryLabel, modelById } from '../models';
import { useChatStore } from '../store';
import type { ChatActionKind, ChatMessage } from '../types';

const props = defineProps<{
  message: ChatMessage;
  /** 是否为当前会话的最后一条消息 */
  isLast: boolean;
}>();

const store = useChatStore();

const copied = ref(false);
const copyFailed = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;
let codeCopyTimer: ReturnType<typeof setTimeout> | null = null;

onBeforeUnmount(() => {
  if (copyTimer) clearTimeout(copyTimer);
  if (codeCopyTimer) clearTimeout(codeCopyTimer);
});

const html = computed(() => renderMarkdown(props.message.content));

const hasError = computed(() => props.message.error === true);

const model = computed(() => modelById(props.message.model ?? ''));

const canRegenerate = computed(
  () =>
    props.message.role === 'assistant' &&
    props.isLast &&
    !props.message.streaming &&
    !store.isStreaming &&
    (props.message.content.length > 0 || hasError.value),
);

/** 是否可编辑：仅最近一条用户消息且非流式 */
const canEdit = computed(() => {
  if (props.message.role !== 'user') return false;
  if (store.isStreaming) return false;
  const msgs = store.activeSession?.messages ?? [];
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    const m = msgs[i];
    if (m && m.role === 'user') return m.id === props.message.id;
  }
  return false;
});

/** 结果操作：仅助手、非流式、非错误、有内容时显示 */
const canAct = computed(
  () =>
    props.message.role === 'assistant' &&
    !props.message.streaming &&
    !hasError.value &&
    props.message.content.trim().length > 0,
);

/** 书签：任意已结束消息（非流式、非错误态）可标记 */
const canBookmark = computed(
  () => !props.message.streaming && !hasError.value,
);

const time = computed(() => {
  const d = new Date(props.message.createdAt);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
});

/** 复制文本，返回是否成功；成功/失败都有短暂明确反馈 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function flashCopyState(ok: boolean) {
  copied.value = ok;
  copyFailed.value = !ok;
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copied.value = false;
    copyFailed.value = false;
    copyTimer = null;
  }, 1500);
}

async function copyContent() {
  flashCopyState(await copyText(props.message.content));
}

/** 代码块复制：事件委托读取 .code-block 内 code 的纯文本（不含高亮标签） */
function handleBodyClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  const btn = target?.closest<HTMLElement>('.code-copy-btn');
  if (!btn) return;
  const codeEl = btn.closest<HTMLElement>('.code-block')?.querySelector<HTMLElement>('code.hljs');
  if (!codeEl) return;
  void copyCode(btn, codeEl.textContent ?? '');
}

async function copyCode(btn: HTMLElement, code: string) {
  const ok = await copyText(code);
  btn.textContent = ok ? '已复制' : '复制失败';
  if (codeCopyTimer) clearTimeout(codeCopyTimer);
  codeCopyTimer = setTimeout(() => {
    btn.textContent = '复制';
    codeCopyTimer = null;
  }, 1500);
}

function handleRegenerate() {
  store.regenerate(props.message.id);
}

function handleEdit() {
  store.startEdit(props.message.id);
}

function handleBookmark() {
  store.toggleBookmark(props.message.id);
}

function handleQuoteReply() {
  store.beginQuote(props.message.id);
}

function handleExport() {
  store.exportMessage(props.message.id);
}

/** 结果操作：生成本地 action payload（未来可注入真实模块回调） */
function handleAction(kind: ChatActionKind) {
  dispatchChatAction({
    kind,
    messageId: props.message.id,
    content: props.message.content.slice(0, 200),
    createdAt: Date.now(),
  });
}
</script>

<template>
  <motion.div
    class="group flex w-full gap-3"
    :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
    :initial="{ opacity: 0, y: 10 }"
    :animate="{ opacity: 1, y: 0 }"
    :transition="{ type: 'spring', stiffness: 320, damping: 26 }"
  >
    <!-- 助手头像（当前模型语义色） -->
    <div
      v-if="message.role === 'assistant'"
      class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
      :style="{ background: model?.color ?? 'var(--chat-mono)' }"
    >
      {{ model?.label.slice(0, 1) ?? 'AI' }}
    </div>

    <div
      class="min-w-0"
      :class="message.role === 'user' ? 'max-w-[85%]' : 'max-w-full flex-1'"
    >
      <!-- 助手消息头部：模型名 + 类别 + 生成状态 -->
      <div
        v-if="message.role === 'assistant'"
        class="mb-1 flex items-center gap-1.5"
      >
        <span class="text-surface-900 text-xs font-medium">
          {{ model?.label ?? '助手' }}
        </span>
        <span
          class="rounded px-1 py-px text-[9px] font-medium"
          :style="{
            color: model?.color ?? 'var(--chat-mono)',
            background: 'color-mix(in srgb, ' + (model?.color ?? 'var(--chat-mono)') + ' 12%, transparent)',
          }"
        >
          {{ categoryLabel(model?.id ?? '') }}
        </span>
        <span
          v-if="message.streaming"
          class="text-surface-800/40 flex items-center gap-1 text-[10px]"
        >
          <span class="size-1.5 animate-pulse rounded-full bg-emerald-500" />
          生成中
        </span>
        <span
          v-else-if="hasError"
          class="text-red-500 text-[10px]"
        >
          生成失败
        </span>
      </div>

      <!-- 用户消息：克制样式（次级块底、深色文字）；含引用时先展示引用块 -->
      <div
        v-if="message.role === 'user'"
        class="bg-surface-100 text-surface-900 inline-block max-w-full rounded-2xl rounded-br-md px-4 py-2.5 text-[0.925rem] leading-relaxed whitespace-pre-wrap break-words"
      >
        <div
          v-if="message.quote"
          class="border-surface-200 bg-surface-50 text-surface-800/70 mb-1.5 max-w-full rounded-lg border-l-2 border-l-brand-400 px-2 py-1 text-xs"
        >
          <p class="text-surface-800/50 font-medium">
            引用{{ message.quote.role === 'user' ? '用户' : '助手' }}
          </p>
          <p class="line-clamp-2 break-words">{{ message.quote.content }}</p>
        </div>
        {{ message.content }}
      </div>

      <!-- 助手消息：Markdown 内容 -->
      <div v-else>
        <!-- eslint-disable vue/no-v-html -- HTML 已由 DOMPurify 清洗（features/chat/markdown.ts） -->
        <div
          class="markdown-body"
          :class="{ 'pb-6': message.streaming }"
          @click="handleBodyClick"
          v-html="html"
        />
        <!-- eslint-enable vue/no-v-html -->
        <span v-if="message.streaming" class="stream-cursor" aria-hidden="true" />

        <!-- 生成失败：错误提示 + 重试 -->
        <div
          v-if="hasError"
          class="border-red-200 bg-red-50 text-red-600 mt-1 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
        >
          <span>回复生成失败，请重试</span>
          <button
            class="hover:bg-red-100 flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium transition-colors"
            aria-label="重试生成"
            title="重试"
            @click="handleRegenerate"
          >
            <RefreshCw class="size-3" />
            重试
          </button>
        </div>

        <!-- 结果操作：加入任务 / 保存为成果 / 转为工作流草稿 -->
        <div
          v-if="canAct"
          class="mt-2.5 flex flex-wrap items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          :class="{ 'opacity-100': message.streaming || hasError }"
        >
          <button
            class="hover:bg-surface-100 text-surface-800/55 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2"
            aria-label="加入任务"
            title="把生成结果加入任务"
            @click="handleAction('add-task')"
          >
            <ClipboardList class="size-3" />
            加入任务
          </button>
          <button
            class="hover:bg-surface-100 text-surface-800/55 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2"
            aria-label="保存为成果"
            title="把生成结果保存为成果"
            @click="handleAction('save-artifact')"
          >
            <FileDown class="size-3" />
            保存为成果
          </button>
          <button
            class="hover:bg-surface-100 text-surface-800/55 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2"
            aria-label="转为工作流草稿"
            title="把生成结果转为工作流草稿"
            @click="handleAction('workflow-draft')"
          >
            <GitBranch class="size-3" />
            转工作流草稿
          </button>
          <button
            class="hover:bg-surface-100 text-surface-800/55 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2"
            aria-label="保存为灵感"
            title="把这段回复保存到灵感广场"
            @click="handleAction('save-inspiration')"
          >
            <Lightbulb class="size-3" />
            保存为灵感
          </button>
          <button
            class="hover:bg-surface-100 text-surface-800/55 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2"
            aria-label="创建智能体变体"
            title="基于这条回复创建个人智能体"
            @click="handleAction('create-agent-variant')"
          >
            <Bot class="size-3" />
            创建智能体变体
          </button>
        </div>
      </div>

      <!-- 操作栏：时间 + 书签 / 引用 / 复制 / 导出 / 编辑 / 重新生成 -->
      <div
        class="text-surface-800/45 mt-1 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        :class="[
          message.role === 'user' ? 'justify-end pr-0.5' : 'pl-0.5',
          { 'opacity-100': message.streaming || hasError || message.bookmarked },
        ]"
      >
        <span class="text-[11px]">{{ time }}</span>

        <button
          v-if="canBookmark"
          class="hover:bg-surface-100 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-6 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2"
          :class="message.bookmarked ? 'text-amber-500' : ''"
          :aria-pressed="message.bookmarked"
          :aria-label="message.bookmarked ? '取消书签' : '添加书签'"
          :title="message.bookmarked ? '取消书签' : '添加书签'"
          @click="handleBookmark"
        >
          <Bookmark class="size-3.5" :class="message.bookmarked ? 'fill-current' : ''" />
        </button>

        <button
          class="hover:bg-surface-100 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-6 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2"
          :aria-label="message.role === 'user' ? '引用回复此消息' : '引用回复此回复'"
          :title="message.role === 'user' ? '引用回复' : '引用回复'"
          @click="handleQuoteReply"
        >
          <Quote class="size-3.5" />
        </button>

        <button
          class="hover:bg-surface-100 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-6 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2"
          :aria-label="message.role === 'user' ? '复制消息' : '复制回复'"
          :title="copyFailed ? '复制失败' : copied ? '已复制' : '复制'"
          @click="copyContent"
        >
          <Check v-if="copied" class="size-3.5 text-green-600" />
          <Copy v-else class="size-3.5" :class="copyFailed ? 'text-red-500' : ''" />
        </button>

        <button
          class="hover:bg-surface-100 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-6 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2"
          aria-label="导出消息 Markdown"
          title="导出消息 Markdown"
          @click="handleExport"
        >
          <Download class="size-3.5" />
        </button>

        <button
          v-if="canEdit"
          class="hover:bg-surface-100 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-6 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2"
          aria-label="编辑并重新发送"
          title="编辑并重新发送"
          @click="handleEdit"
        >
          <Pencil class="size-3.5" />
        </button>

        <button
          v-if="canRegenerate"
          class="hover:bg-surface-100 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-6 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2"
          :aria-label="hasError ? '重试生成' : '重新生成'"
          :title="hasError ? '重试' : '重新生成'"
          @click="handleRegenerate"
        >
          <RefreshCw class="size-3.5" />
        </button>
      </div>
    </div>
  </motion.div>
</template>

<style scoped>
/* 流式输出光标 */
.stream-cursor {
  display: inline-block;
  width: 8px;
  height: 1.05em;
  margin-left: 2px;
  vertical-align: text-bottom;
  border-radius: 2px;
  background: var(--color-brand-500);
  animation: chat-cursor-blink 0.9s steps(2, start) infinite;
}

@keyframes chat-cursor-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}

/* ---- Markdown 正文样式（v-html 内容，scoped 下用 :deep） ---- */
.markdown-body {
  font-size: 0.925rem;
  line-height: 1.75;
  word-break: break-word;
}

.markdown-body :deep(p) {
  margin: 0.55rem 0;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  margin: 1.1rem 0 0.5rem;
  font-weight: 600;
  line-height: 1.4;
}

.markdown-body :deep(h2) {
  font-size: 1.15rem;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid var(--color-surface-100);
}

.markdown-body :deep(h3) {
  font-size: 1rem;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0.55rem 0;
  padding-left: 1.4rem;
}

.markdown-body :deep(ul) {
  list-style: disc;
}

.markdown-body :deep(ol) {
  list-style: decimal;
}

.markdown-body :deep(li) {
  margin: 0.25rem 0;
}

.markdown-body :deep(blockquote) {
  margin: 0.75rem 0;
  padding: 0.1rem 0 0.1rem 0.85rem;
  border-left: 3px solid var(--color-brand-200, #c7d2fe);
  color: var(--color-surface-800);
  opacity: 0.85;
}

.markdown-body :deep(a) {
  color: var(--color-brand-600);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.markdown-body :deep(code:not(pre code)) {
  background: var(--color-surface-100);
  border-radius: 0.35rem;
  padding: 0.12rem 0.4rem;
  font-size: 0.85em;
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas,
    monospace;
}

/* 代码块 */
.markdown-body :deep(.code-block) {
  position: relative;
  margin: 0.8rem 0;
  padding: 0.9rem 1rem;
  border-radius: 0.75rem;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 0.82rem;
  line-height: 1.65;
  overflow-x: auto;
  overflow-y: auto;
  max-height: 420px;
  box-shadow: var(--shadow-card);
}

.markdown-body :deep(.code-lang) {
  position: absolute;
  top: 0.55rem;
  left: 0.85rem;
  font-size: 0.68rem;
  letter-spacing: 0.05em;
  color: rgb(226 232 240 / 0.45);
  text-transform: uppercase;
}

/* 代码块复制按钮：右上角，hover 显示，点击后短暂显示“已复制” */
.markdown-body :deep(.code-copy-btn) {
  position: absolute;
  top: 0.4rem;
  right: 0.5rem;
  z-index: 1;
  border: 1px solid rgb(148 163 184 / 0.25);
  border-radius: 0.375rem;
  padding: 0.1rem 0.5rem;
  font-size: 0.68rem;
  line-height: 1.5;
  color: rgb(226 232 240 / 0.8);
  background: rgb(15 23 42 / 0.92);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.markdown-body :deep(.code-block:hover .code-copy-btn),
.markdown-body :deep(.code-copy-btn:focus-visible) {
  opacity: 1;
}

@media (hover: none) {
  .markdown-body :deep(.code-copy-btn) {
    opacity: 1;
  }
}

.markdown-body :deep(pre code.hljs) {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas,
    monospace;
  background: transparent;
  padding: 0;
}

/* highlight.js token 配色（精简版） */
.markdown-body :deep(.hljs-keyword),
.markdown-body :deep(.hljs-selector-tag),
.markdown-body :deep(.hljs-meta) {
  color: #c084fc;
}

.markdown-body :deep(.hljs-string),
.markdown-body :deep(.hljs-regexp) {
  color: #86efac;
}

.markdown-body :deep(.hljs-number),
.markdown-body :deep(.hljs-literal) {
  color: #fdba74;
}

.markdown-body :deep(.hljs-title),
.markdown-body :deep(.hljs-title.function_),
.markdown-body :deep(.hljs-section) {
  color: #93c5fd;
}

.markdown-body :deep(.hljs-comment),
.markdown-body :deep(.hljs-quote) {
  color: #64748b;
  font-style: italic;
}

.markdown-body :deep(.hljs-built_in),
.markdown-body :deep(.hljs-type),
.markdown-body :deep(.hljs-class .hljs-title) {
  color: #5eead4;
}

.markdown-body :deep(.hljs-attr),
.markdown-body :deep(.hljs-attribute),
.markdown-body :deep(.hljs-variable),
.markdown-body :deep(.hljs-params) {
  color: #7dd3fc;
}

.markdown-body :deep(.hljs-template-variable),
.markdown-body :deep(.hljs-tag) {
  color: #f9a8d4;
}

.markdown-body :deep(table) {
  display: block;
  margin: 0.75rem 0;
  border-collapse: collapse;
  font-size: 0.85em;
  width: 100%;
  overflow-x: auto;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--color-surface-100);
  padding: 0.45rem 0.7rem;
  text-align: left;
}

.markdown-body :deep(th) {
  background: var(--color-surface-50);
  font-weight: 600;
}

.markdown-body :deep(hr) {
  margin: 1rem 0;
  border: 0;
  border-top: 1px solid var(--color-surface-100);
}
</style>
