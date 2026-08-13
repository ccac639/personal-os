<script setup lang="ts">
/**
 * 全局页面过渡层（loading + 错误恢复）。
 *
 * - loading 层：目标页面名称 + 小型 spinner；超过软超时后提示
 *   「正在准备页面内容」并提供取消按钮；硬超时由状态机兜底降级。
 *   首航/刷新（initial）与 query-only 轻量过渡不渲染 loading 层。
 * - 错误层：路由组件加载失败时展示，提供重试 / 返回，不破坏当前页面。
 * - 可访问性：loading 用 role=status + aria-live=polite + aria-busy；
 *   错误用 role=alert；按钮可键盘访问；Escape 取消未完成的过渡。
 * - 生命周期：window keydown 监听随组件卸载移除，不遗留。
 */
import { computed, onBeforeUnmount, onMounted } from 'vue';

import { handleEscape, retryNavigation, goBack, transitionState } from './transition-store';

const state = transitionState;

const showLoading = computed(
  () => state.phase === 'loading' && !state.initial && state.direction !== 'query',
);

function onKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return;
  if (state.phase === 'idle' || state.phase === 'entering') return;
  e.preventDefault();
  handleEscape();
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <Teleport to="body">
    <!-- 等待目标页面就绪：轻量过渡层，不遮挡导航必要信息，无虚假百分比 -->
    <div v-if="showLoading" class="pt-layer" role="status" aria-live="polite" aria-busy="true">
      <div class="pt-layer__card">
        <span class="pt-spinner" aria-hidden="true" />
        <span class="pt-layer__title">{{ state.toTitle || '页面' }}</span>
        <span v-if="state.softElapsed" class="pt-layer__hint">正在准备页面内容…</span>
        <div v-if="state.softElapsed" class="pt-layer__actions">
          <button type="button" class="pt-btn" @click="handleEscape">取消</button>
        </div>
      </div>
    </div>

    <!-- 路由组件加载失败：应用级可恢复错误状态 -->
    <div
      v-else-if="state.phase === 'error'"
      class="pt-layer pt-layer--error"
      role="alert"
      aria-live="assertive"
    >
      <div class="pt-layer__card">
        <span class="pt-layer__title">页面加载失败</span>
        <span v-if="state.errorMessage" class="pt-layer__hint">{{ state.errorMessage }}</span>
        <div class="pt-layer__actions">
          <button type="button" class="pt-btn pt-btn--primary" @click="retryNavigation">
            重试
          </button>
          <button type="button" class="pt-btn" @click="goBack">返回</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
