<script setup lang="ts">
/**
 * Admin 可复用弹窗
 *
 * 可访问性约定：
 * - Escape 关闭、遮罩点击关闭
 * - 打开时焦点移入弹窗（确认按钮），Tab 焦点锁定在弹窗内循环
 * - 关闭后焦点恢复到触发元素
 * - busy 状态下禁用确认按钮（防重复提交）
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { X } from '@lucide/vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description?: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
    busy?: boolean;
    /** 隐藏取消按钮（纯确认/信息弹窗） */
    hideCancel?: boolean;
  }>(),
  {
    description: '',
    confirmText: '确认',
    cancelText: '取消',
    danger: false,
    busy: false,
    hideCancel: false,
  },
);

const emit = defineEmits<{
  'update:open': [value: boolean];
  confirm: [];
}>();

const dialogRef = ref<HTMLElement | null>(null);
const confirmRef = ref<HTMLButtonElement | null>(null);
let previousFocus: HTMLElement | null = null;

function close(): void {
  if (props.busy) return; // 操作进行中不允许关闭
  emit('update:open', false);
}

function onConfirm(): void {
  emit('confirm');
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && props.open && !props.busy) {
    e.preventDefault();
    close();
  }
  if (e.key === 'Tab' && props.open) {
    trapFocus(e);
  }
}

/** Tab 焦点锁定：循环在弹窗内可聚焦元素之间 */
function trapFocus(e: KeyboardEvent): void {
  const root = dialogRef.value;
  if (!root) return;
  const focusables = Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
  if (focusables.length === 0) return;
  const first = focusables[0]!;
  const last = focusables[focusables.length - 1]!;
  const active = document.activeElement;
  if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      previousFocus = document.activeElement as HTMLElement | null;
      await nextTick();
      if (confirmRef.value) confirmRef.value.focus();
      else dialogRef.value?.focus();
    } else if (previousFocus) {
      previousFocus.focus();
      previousFocus = null;
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (previousFocus) {
    previousFocus.focus();
    previousFocus = null;
  }
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      @keydown="onKeydown"
    >
      <!-- 遮罩 -->
      <div class="bg-surface-900/40 absolute inset-0" aria-hidden="true" @click="close" />
      <!-- 弹窗体 -->
      <div
        ref="dialogRef"
        class="bg-surface-0 border-surface-100 shadow-surface-900/10 relative z-10 w-full max-w-md rounded-xl border shadow-xl"
        tabindex="-1"
        @click.stop
      >
        <header class="flex items-start justify-between gap-3 px-5 pt-4">
          <div>
            <h2 class="text-surface-900 text-base font-semibold">{{ title }}</h2>
            <p v-if="description" class="text-surface-800/70 mt-1 text-sm leading-relaxed">
              {{ description }}
            </p>
          </div>
          <button
            type="button"
            class="text-surface-800/60 hover:bg-surface-100 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-8 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
            aria-label="关闭弹窗"
            title="关闭弹窗"
            :disabled="busy"
            @click="close"
          >
            <X class="size-4" aria-hidden="true" />
          </button>
        </header>

        <div class="px-5 py-4">
          <slot />
        </div>

        <footer class="flex justify-end gap-2 px-5 pb-4">
          <button
            v-if="!hideCancel"
            type="button"
            class="border-surface-100 text-surface-800/80 hover:bg-surface-100 focus-visible:ring-brand-500/40 rounded-lg border px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
            :disabled="busy"
            @click="close"
          >
            {{ cancelText }}
          </button>
          <button
            ref="confirmRef"
            type="button"
            class="bg-brand-600 text-surface-0 hover:bg-brand-700 focus-visible:ring-brand-500/40 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
            :class="danger ? 'bg-rose-600 hover:bg-rose-700' : ''"
            :disabled="busy"
            @click="onConfirm"
          >
            <span v-if="busy" class="inline-flex items-center gap-2">处理中…</span>
            <span v-else>{{ confirmText }}</span>
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
