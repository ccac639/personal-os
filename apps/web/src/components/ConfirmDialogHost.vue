<script setup lang="ts">
/**
 * 全局确认对话框渲染宿主（App.vue 挂载一次）。
 *
 * - 渲染 confirmState.request（Teleport 到 body）；
 * - role=alertdialog + aria-modal；打开聚焦确认按钮；
 * - Escape 等价取消；关闭后焦点归还给打开前的元素；
 * - window keydown 监听随请求开/关与卸载清理。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

import { confirmState, resolveConfirm } from '@/app/confirm';

const request = computed(() => confirmState.request);
const panelRef = ref<HTMLElement | null>(null);
let restoreTarget: HTMLElement | null = null;

function focusConfirm(): void {
  void nextTick(() => {
    const el = panelRef.value;
    if (!el) return;
    const confirmBtn = el.querySelector<HTMLElement>('.confirm-dialog__confirm');
    (confirmBtn ?? el).focus();
  });
}

function onCancel(): void {
  const req = confirmState.request;
  if (req) resolveConfirm(req.id, false);
}

function onConfirm(): void {
  const req = confirmState.request;
  if (req) resolveConfirm(req.id, true);
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !confirmState.request) return;
  event.preventDefault();
  resolveConfirm(confirmState.request.id, false);
}

watch(request, (next) => {
  if (next) {
    restoreTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    focusConfirm();
    window.addEventListener('keydown', onWindowKeydown);
  } else {
    window.removeEventListener('keydown', onWindowKeydown);
    restoreTarget?.focus?.();
    restoreTarget = null;
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown);
  restoreTarget = null;
});
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-dialog">
      <div
        v-if="request"
        class="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        :aria-label="request.title"
      >
        <div class="confirm-dialog__backdrop" />
        <div ref="panelRef" class="confirm-dialog__panel" tabindex="-1">
          <h2 class="confirm-dialog__title">{{ request.title }}</h2>
          <p v-if="request.message" class="confirm-dialog__message">{{ request.message }}</p>
          <div class="confirm-dialog__actions">
            <button type="button" class="confirm-dialog__btn" @click="onCancel">
              {{ request.cancelText ?? '取消' }}
            </button>
            <button
              type="button"
              class="confirm-dialog__btn confirm-dialog__confirm"
              :class="{ 'confirm-dialog__confirm--danger': request.tone === 'danger' }"
              @click="onConfirm"
            >
              {{ request.confirmText ?? '确认' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.confirm-dialog {
  position: fixed;
  inset: 0;
  z-index: 65;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.confirm-dialog__backdrop {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--app-text, #0f172a) 38%, transparent);
}

.confirm-dialog__panel {
  position: relative;
  width: min(24rem, 100%);
  padding: 1.25rem;
  border-radius: 0.75rem;
  background: var(--app-surface, #ffffff);
  box-shadow: var(--app-shadow-float, 0 8px 24px -6px rgb(0 0 0 / 0.12));
  color: var(--app-text, #0f172a);
  outline: none;
}

.confirm-dialog__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.confirm-dialog__message {
  margin: 0.5rem 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--app-text-secondary, #1e293b);
  overflow-wrap: anywhere;
}

.confirm-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.625rem;
  margin-top: 1.25rem;
}

.confirm-dialog__btn {
  padding: 6px 16px;
  border: 1px solid var(--app-border, #f1f5f9);
  border-radius: 0.5rem;
  font-size: 13px;
  color: var(--app-text, #0f172a);
  background: var(--app-surface-subtle, #f8fafc);
  cursor: pointer;
  transition:
    background-color var(--app-duration-fast, 120ms) var(--app-ease-out, ease),
    border-color var(--app-duration-fast, 120ms) var(--app-ease-out, ease);
}

.confirm-dialog__btn:hover {
  background: var(--app-surface-100, #f1f5f9);
}

.confirm-dialog__btn:focus-visible {
  outline: 2px solid var(--app-accent, #6366f1);
  outline-offset: 2px;
}

.confirm-dialog__confirm {
  border-color: var(--app-accent-strong, #4f46e5);
  background: var(--app-accent-strong, #4f46e5);
  color: #ffffff;
}

.confirm-dialog__confirm:hover {
  background: var(--app-accent, #6366f1);
}

.confirm-dialog__confirm--danger {
  border-color: var(--color-red-600, #dc2626);
  background: var(--color-red-600, #dc2626);
}

.confirm-dialog__confirm--danger:hover {
  background: var(--color-red-700, #b91c1c);
}

/* 进出场：仅 transform/opacity */
.confirm-dialog-enter-active,
.confirm-dialog-leave-active {
  transition: opacity 160ms var(--app-ease-out, ease);
}

.confirm-dialog-enter-active .confirm-dialog__panel,
.confirm-dialog-leave-active .confirm-dialog__panel {
  transition: transform 180ms var(--app-ease-out, ease);
}

.confirm-dialog-enter-from,
.confirm-dialog-leave-to {
  opacity: 0;
}

.confirm-dialog-enter-from .confirm-dialog__panel,
.confirm-dialog-leave-to .confirm-dialog__panel {
  transform: translateY(8px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .confirm-dialog-enter-active,
  .confirm-dialog-leave-active,
  .confirm-dialog-enter-active .confirm-dialog__panel,
  .confirm-dialog-leave-active .confirm-dialog__panel {
    transition: none;
  }
}
</style>
