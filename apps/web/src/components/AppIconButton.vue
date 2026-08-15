<script setup lang="ts">
/**
 * 统一图标按钮（壳层公共组件）。
 *
 * - 必填 aria-label（同时作为 title 提示，兼顾键盘与悬停）；
 * - tone：ghost（默认）/ primary / danger；size：sm / md；
 * - 焦点样式统一（focus-visible 品牌色描边）；
 * - 纯展示组件，不注册任何监听器/计时器。
 */
withDefaults(
  defineProps<{
    label: string;
    tone?: 'ghost' | 'primary' | 'danger';
    size?: 'sm' | 'md';
    disabled?: boolean;
  }>(),
  { tone: 'ghost', size: 'md', disabled: false },
);

defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
  <button
    type="button"
    class="app-icon-btn"
    :class="[`app-icon-btn--${tone}`, `app-icon-btn--${size}`]"
    :aria-label="label"
    :title="label"
    :disabled="disabled"
    @click="$emit('click', $event)"
  >
    <slot />
  </button>
</template>

<style scoped>
.app-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 0.5rem;
  color: var(--app-text-secondary, var(--color-surface-800));
  background: transparent;
  cursor: pointer;
  transition:
    background-color var(--app-duration-fast, 120ms) var(--app-ease-out, ease),
    color var(--app-duration-fast, 120ms) var(--app-ease-out, ease),
    border-color var(--app-duration-fast, 120ms) var(--app-ease-out, ease);
}

.app-icon-btn:hover:not(:disabled) {
  background: var(--app-surface-subtle, var(--color-page));
  color: var(--app-text, var(--color-surface-900));
}

.app-icon-btn:focus-visible {
  outline: 2px solid var(--app-accent, var(--color-brand-500));
  outline-offset: 2px;
}

.app-icon-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.app-icon-btn--sm {
  width: 2rem;
  height: 2rem;
}

.app-icon-btn--md {
  width: 2.25rem;
  height: 2.25rem;
}

.app-icon-btn--primary {
  background: var(--app-accent-strong, var(--color-brand-600));
  color: var(--color-surface-0);
}

.app-icon-btn--primary:hover:not(:disabled) {
  background: var(--app-accent, var(--color-brand-500));
  color: var(--color-surface-0);
}

.app-icon-btn--danger {
  color: var(--color-red-600, var(--color-danger-600));
}

.app-icon-btn--danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-red-600, var(--color-danger-600)) 10%, transparent);
  color: var(--color-red-700, var(--color-danger-700));
}

@media (prefers-reduced-motion: reduce) {
  .app-icon-btn {
    transition: none;
  }
}
</style>
