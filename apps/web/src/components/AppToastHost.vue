<script setup lang="ts">
/**
 * 全局 toast 渲染宿主（App.vue 挂载一次）。
 *
 * - 渲染 toastState 队列（Teleport 到 body）；
 * - 每个条目独立自动消失计时器；手动关闭即清理对应计时器；
 * - 宿主卸载时清理全部计时器（测试可断言 vi.getTimerCount() === 0）；
 * - 动画仅 transform/opacity，reduced-motion 下禁用。
 */
import { onBeforeUnmount, ref, watch } from 'vue';

import { dismissToast, toastState, type ToastItem } from '@/app/toast';

const scheduled = ref<Set<number>>(new Set());
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function schedule(item: ToastItem): void {
  if (scheduled.value.has(item.id) || item.duration <= 0) return;
  scheduled.value.add(item.id);
  timers.set(
    item.id,
    setTimeout(() => {
      timers.delete(item.id);
      scheduled.value.delete(item.id);
      dismissToast(item.id);
    }, item.duration),
  );
}

function onClose(id: number): void {
  const timer = timers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(id);
    scheduled.value.delete(id);
  }
  dismissToast(id);
}

watch(
  () => toastState.items.map((item) => item.id),
  () => {
    for (const item of toastState.items) schedule(item);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  scheduled.value.clear();
});
</script>

<template>
  <Teleport to="body">
    <div class="app-toast-host" role="region" aria-label="通知">
      <TransitionGroup name="toast">
        <div
          v-for="item in toastState.items"
          :key="item.id"
          class="app-toast"
          :class="`app-toast--${item.tone}`"
          role="status"
        >
          <span class="app-toast__msg">{{ item.message }}</span>
          <button
            type="button"
            class="app-toast__close"
            aria-label="关闭通知"
            @click="onClose(item.id)"
          >
            <svg
              class="size-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.app-toast-host {
  position: fixed;
  top: 0.75rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 70;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  width: min(24rem, calc(100vw - 2rem));
  pointer-events: none;
}

.app-toast {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.625rem 0.875rem;
  border: 1px solid var(--app-border, #f1f5f9);
  border-radius: 0.625rem;
  background: var(--app-surface, #ffffff);
  box-shadow: var(--app-shadow-float, 0 8px 24px -6px rgb(0 0 0 / 0.12));
  color: var(--app-text, #0f172a);
  font-size: 13px;
  pointer-events: auto;
}

.app-toast::before {
  content: '';
  flex-shrink: 0;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  background: var(--app-accent, #6366f1);
}

.app-toast--success::before {
  background: var(--color-emerald-500, #10b981);
}

.app-toast--error::before {
  background: var(--color-red-500, #ef4444);
}

.app-toast__msg {
  flex: 1;
  overflow-wrap: anywhere;
}

.app-toast__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 0.375rem;
  color: var(--app-text-secondary, #1e293b);
  background: transparent;
  cursor: pointer;
  transition:
    background-color var(--app-duration-fast, 120ms) var(--app-ease-out, ease),
    color var(--app-duration-fast, 120ms) var(--app-ease-out, ease);
}

.app-toast__close:hover {
  background: var(--app-surface-subtle, #f8fafc);
}

.app-toast__close:focus-visible {
  outline: 2px solid var(--app-accent, #6366f1);
  outline-offset: 2px;
}

/* 进出场：仅 transform/opacity */
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 180ms var(--app-ease-out, ease),
    transform 200ms var(--app-ease-out, ease);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.toast-leave-active {
  position: absolute;
  width: 100%;
}

@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active {
    transition: none;
  }
}
</style>
