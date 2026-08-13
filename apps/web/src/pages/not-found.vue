<script setup lang="ts">
/**
 * 404 可恢复页面（应用壳层路由兜底）。
 *
 * - 未匹配任何业务路由时由 catch-all 路由渲染；
 * - 提供「返回首页」与「返回上一页」两个恢复出口；
 * - 走标准页面过渡协议（mounted 后自动就绪）。
 */
import { useRouter } from 'vue-router';

const router = useRouter();

function goBack(): void {
  if (window.history.length > 1) {
    void router.back();
  } else {
    void router.replace('/');
  }
}
</script>

<template>
  <section class="app-page app-not-found">
    <p class="app-not-found__code" aria-hidden="true">404</p>
    <h1 class="app-not-found__title">页面不存在或已被移动</h1>
    <p class="app-not-found__hint">请检查地址，或返回首页继续浏览。</p>
    <div class="app-not-found__actions">
      <RouterLink to="/" class="app-not-found__btn app-not-found__btn--primary"
        >返回首页</RouterLink
      >
      <button type="button" class="app-not-found__btn" @click="goBack">返回上一页</button>
    </div>
  </section>
</template>

<style scoped>
.app-not-found {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 4rem 1.5rem;
  text-align: center;
}

.app-not-found__code {
  margin: 0;
  font-size: 4rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: var(--app-accent, #6366f1);
  line-height: 1;
}

.app-not-found__title {
  margin: 1rem 0 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--app-text, #0f172a);
}

.app-not-found__hint {
  margin: 0.5rem 0 0;
  font-size: 0.875rem;
  color: var(--app-text-secondary, #1e293b);
}

.app-not-found__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.app-not-found__btn {
  display: inline-flex;
  align-items: center;
  padding: 0.5rem 1.25rem;
  border: 1px solid var(--app-border, #f1f5f9);
  border-radius: 0.5rem;
  font-size: 0.875rem;
  color: var(--app-text, #0f172a);
  background: var(--app-surface-subtle, #f8fafc);
  cursor: pointer;
  text-decoration: none;
  transition:
    background-color var(--app-duration-fast, 120ms) var(--app-ease-out, ease),
    border-color var(--app-duration-fast, 120ms) var(--app-ease-out, ease);
}

.app-not-found__btn:hover {
  background: var(--app-surface-100, #f1f5f9);
}

.app-not-found__btn:focus-visible {
  outline: 2px solid var(--app-accent, #6366f1);
  outline-offset: 2px;
}

.app-not-found__btn--primary {
  border-color: var(--app-accent-strong, #4f46e5);
  background: var(--app-accent-strong, #4f46e5);
  color: #ffffff;
}

.app-not-found__btn--primary:hover {
  background: var(--app-accent, #6366f1);
}

@media (prefers-reduced-motion: reduce) {
  .app-not-found__btn {
    transition: none;
  }
}
</style>
