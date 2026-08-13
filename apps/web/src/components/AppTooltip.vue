<script setup lang="ts">
/**
 * 统一 tooltip（壳层公共组件，纯 CSS 实现）。
 *
 * - 悬停 / 键盘聚焦（:focus-within）时显示；
 * - 无 JS 监听器 / 计时器，无需清理；
 * - reduced-motion 下禁用过渡动画。
 */
defineProps<{
  text: string;
}>();
</script>

<template>
  <span class="app-tooltip" :data-tip="text">
    <slot />
  </span>
</template>

<style scoped>
.app-tooltip {
  position: relative;
  display: inline-flex;
}

.app-tooltip::after {
  content: attr(data-tip);
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 60;
  max-width: 16rem;
  padding: 4px 10px;
  border-radius: 0.375rem;
  background: var(--app-text, #0f172a);
  color: var(--app-surface, #ffffff);
  font-size: 12px;
  line-height: 1.4;
  text-align: center;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition:
    opacity var(--app-duration-fast, 120ms) var(--app-ease-out, ease),
    visibility var(--app-duration-fast, 120ms);
}

.app-tooltip:hover::after,
.app-tooltip:focus-within::after {
  opacity: 1;
  visibility: visible;
}

@media (prefers-reduced-motion: reduce) {
  .app-tooltip::after {
    transition: none;
  }
}
</style>
