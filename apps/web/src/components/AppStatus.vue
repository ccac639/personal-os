<script setup lang="ts">
/**
 * 统一 loading / error 状态组件（壳层公共组件）。
 *
 * - loading：spinner + 文案（role=status，aria-live=polite）；
 * - error：错误文案 + 重试按钮（role=alert）；
 * - 无状态、无监听器，纯展示。
 */
withDefaults(
  defineProps<{
    loading?: boolean;
    error?: string | null;
    label?: string;
    retryText?: string;
  }>(),
  { loading: false, error: null, label: '加载中…', retryText: '重试' },
);

defineEmits<{ retry: [] }>();
</script>

<template>
  <div v-if="loading" class="app-status app-status--loading" role="status" aria-live="polite">
    <span class="app-status__spinner" aria-hidden="true" />
    <span class="app-status__label">{{ label }}</span>
  </div>
  <div v-else-if="error" class="app-status app-status--error" role="alert">
    <span class="app-status__label">{{ error }}</span>
    <button type="button" class="app-status__retry" @click="$emit('retry')">{{ retryText }}</button>
  </div>
</template>

<style scoped>
.app-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 6rem;
  padding: 1.5rem;
  color: var(--app-text-secondary, var(--color-surface-800));
  font-size: 14px;
}

.app-status--error {
  color: var(--color-red-600, var(--color-danger-600));
}

.app-status__spinner {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid var(--app-border, var(--color-surface-100));
  border-top-color: var(--app-accent, var(--color-brand-500));
  animation: app-status-spin 800ms linear infinite;
}

.app-status__retry {
  padding: 4px 14px;
  border: 1px solid var(--app-border, var(--color-surface-100));
  border-radius: 0.5rem;
  color: var(--app-text, var(--color-surface-900));
  background: var(--app-surface-subtle, var(--color-page));
  cursor: pointer;
  transition:
    background-color var(--app-duration-fast, 120ms) var(--app-ease-out, ease),
    border-color var(--app-duration-fast, 120ms) var(--app-ease-out, ease);
}

.app-status__retry:hover {
  background: var(--app-surface-100, var(--color-surface-100));
}

.app-status__retry:focus-visible {
  outline: 2px solid var(--app-accent, var(--color-brand-500));
  outline-offset: 2px;
}

@keyframes app-status-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-status__spinner {
    animation: none;
  }

  .app-status__retry {
    transition: none;
  }
}
</style>
