<script setup lang="ts">
/**
 * 可访问移动端抽屉（壳层公共组件）。
 *
 * - role=dialog + aria-modal；打开时聚焦首个可聚焦元素；
 * - Tab / Shift+Tab 焦点圈定在面板内（焦点陷阱）；
 * - Escape 关闭（window keydown，随开/关与卸载清理）；
 * - 遮罩点击关闭；惰性渲染（v-if），不渲染时 DOM 无残留；
 * - 关闭后的焦点归还由调用方负责（布局层归还汉堡按钮）；
 * - reduced-motion 下无位移动画。
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';

import AppIconButton from './AppIconButton.vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title?: string;
  }>(),
  { title: '导航' },
);

const emit = defineEmits<{ close: [] }>();

const panelRef = ref<HTMLElement | null>(null);

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function focusables(): HTMLElement[] {
  const el = panelRef.value;
  if (!el) return [];
  return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (node) => !node.closest('[aria-hidden="true"]'),
  );
}

function focusFirst(): void {
  void nextTick(() => {
    const list = focusables();
    const target = list[0] ?? panelRef.value;
    target?.focus({ preventScroll: true });
  });
}

function onPanelKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Tab' || !panelRef.value) return;
  const list = focusables();
  if (list.length === 0) return;
  const first = list[0]!;
  const last = list[list.length - 1]!;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === panelRef.value)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      focusFirst();
      window.addEventListener('keydown', onWindowKeydown);
    } else {
      window.removeEventListener('keydown', onWindowKeydown);
    }
  },
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="open" class="app-drawer" role="dialog" aria-modal="true" :aria-label="title">
        <div class="app-drawer__backdrop" @click="emit('close')" />
        <aside ref="panelRef" class="app-drawer__panel" tabindex="-1" @keydown="onPanelKeydown">
          <header v-if="title" class="app-drawer__header">
            <h2 class="app-drawer__title">{{ title }}</h2>
            <AppIconButton label="关闭导航菜单" @click="emit('close')">
              <svg
                class="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </AppIconButton>
          </header>
          <div class="app-drawer__body">
            <slot />
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.app-drawer {
  position: fixed;
  inset: 0;
  z-index: 55;
}

.app-drawer__backdrop {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--app-text, var(--color-surface-900)) 38%, transparent);
}

.app-drawer__panel {
  position: absolute;
  inset-block: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  width: min(19rem, calc(100vw - 3rem));
  background: var(--app-surface, var(--color-surface-0));
  box-shadow: var(--app-shadow-float, 0 8px 24px -6px rgb(0 0 0 / 0.12));
  color: var(--app-text, var(--color-surface-900));
  outline: none;
}

.app-drawer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  height: 3.5rem;
  padding-inline: 1rem 0.5rem;
  border-bottom: 1px solid var(--app-border, var(--color-surface-100));
}

.app-drawer__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.app-drawer__body {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem 0.5rem 1.5rem;
}

/* 抽屉滑入：仅 transform/opacity */
.drawer-enter-active,
.drawer-leave-active {
  transition:
    opacity 200ms var(--app-ease-out, ease),
    transform 220ms var(--app-ease-out, ease);
}

.drawer-enter-active .app-drawer__panel,
.drawer-leave-active .app-drawer__panel {
  transition: transform 220ms var(--app-ease-out, ease);
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

.drawer-enter-from .app-drawer__panel,
.drawer-leave-to .app-drawer__panel {
  transform: translateX(-100%);
}

@media (prefers-reduced-motion: reduce) {
  .drawer-enter-active,
  .drawer-leave-active,
  .drawer-enter-active .app-drawer__panel,
  .drawer-leave-active .app-drawer__panel {
    transition: none;
  }
}
</style>
