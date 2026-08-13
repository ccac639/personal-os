<script setup lang="ts">
/**
 * Chat 功能域 —— 无障碍抽屉（智能体 / 灵感 / 表单共用）
 *
 * - Teleport 到 body，遮罩点击 / Escape 关闭
 * - 焦点锁定：Tab / Shift+Tab 在抽屉内循环，打开时聚焦首个可聚焦元素
 * - 关闭后焦点恢复到触发元素；打开期间锁定 body 滚动
 * - role="dialog" aria-modal="true"，标题通过 aria-labelledby 关联
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    /** 面板宽度类（默认 w-96） */
    widthClass?: string;
    /** 展示标签（描述用途，如「智能体详情」） */
    ariaLabel?: string;
  }>(),
  { widthClass: 'w-96', ariaLabel: '' },
);

const emit = defineEmits<{ close: [] }>();

const panelRef = ref<HTMLElement | null>(null);
let lastFocused: HTMLElement | null = null;

function focusableSelector(): string {
  return [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
}

function focusFirst() {
  void nextTick(() => {
    const panel = panelRef.value;
    if (!panel) return;
    const first = panel.querySelector<HTMLElement>(focusableSelector());
    (first ?? panel).focus();
  });
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
    return;
  }
  if (e.key !== 'Tab') return;
  const panel = panelRef.value;
  if (!panel) return;
  const focusables = panel.querySelectorAll<HTMLElement>(focusableSelector());
  if (focusables.length === 0) {
    e.preventDefault();
    panel.focus();
    return;
  }
  const first = focusables[0]!;
  const last = focusables[focusables.length - 1]!;
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === panel)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      lastFocused = document.activeElement as HTMLElement | null;
      document.addEventListener('keydown', handleKeydown);
      document.body.style.overflow = 'hidden';
      focusFirst();
    } else {
      document.removeEventListener('keydown', handleKeydown);
      document.body.style.overflow = '';
      if (lastFocused) {
        lastFocused.focus?.();
        lastFocused = null;
      }
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown);
  document.body.style.overflow = '';
  if (lastFocused) {
    lastFocused.focus?.();
    lastFocused = null;
  }
});
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer-fade">
      <div v-if="open" class="drawer-root">
        <!-- 遮罩：点击关闭 -->
        <div
          class="drawer-mask"
          aria-hidden="true"
          @click="emit('close')"
        />
        <!-- 面板 -->
        <section
          ref="panelRef"
          class="drawer-panel"
          :class="widthClass"
          role="dialog"
          aria-modal="true"
          :aria-label="ariaLabel || title"
          tabindex="-1"
        >
          <header class="drawer-header">
            <h2 class="min-w-0 truncate text-sm font-semibold">{{ title }}</h2>
            <button
              class="drawer-close"
              aria-label="关闭"
              title="关闭（Esc）"
              @click="emit('close')"
            >
              <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </header>
          <div class="drawer-body min-h-0 flex-1 overflow-y-auto">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="drawer-footer">
            <slot name="footer" />
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.drawer-root {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  justify-content: flex-end;
}

.drawer-mask {
  position: absolute;
  inset: 0;
  background: rgb(2 6 23 / 0.45);
  backdrop-filter: blur(2px);
}

.drawer-panel {
  position: relative;
  display: flex;
  height: 100%;
  flex-direction: column;
  background: var(--color-surface-0);
  border-left: 1px solid var(--color-surface-100);
  box-shadow: -12px 0 32px rgb(2 6 23 / 0.18);
  outline: none;
}

.drawer-header {
  display: flex;
  height: 3rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  border-bottom: 1px solid var(--color-surface-100);
  padding: 0 0.75rem 0 1rem;
}

.drawer-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 0.375rem;
  color: var(--color-surface-800);
  opacity: 0.6;
  transition: all 0.15s;
}

.drawer-close:hover {
  background: var(--color-surface-100);
  opacity: 1;
}

.drawer-close:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--color-brand-500, rgb(99 102 241 / 0.4));
}

.drawer-footer {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  border-top: 1px solid var(--color-surface-100);
  padding: 0.625rem 1rem;
}

.drawer-fade-enter-active,
.drawer-fade-leave-active {
  transition: opacity 0.18s ease;
}

.drawer-fade-enter-active .drawer-panel,
.drawer-fade-leave-active .drawer-panel {
  transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.drawer-fade-enter-from,
.drawer-fade-leave-to {
  opacity: 0;
}

.drawer-fade-enter-from .drawer-panel,
.drawer-fade-leave-to .drawer-panel {
  transform: translateX(100%);
}
</style>
