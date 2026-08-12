<script setup lang="ts">
/**
 * 全局页面过渡遮罩（独立组件，避免状态更新波及路由过渡子树）。
 *
 * 关键设计：遮罩的显示/隐藏由 usePageTransition 的模块级状态驱动。
 * 若把 v-if="isTransitioning" 写在 default-layout 模板中，Transition 的
 * after-leave 钩子触发 show 时会让 default-layout 整体重渲染，Vue 的
 * out-in 状态机在重渲染窗口内会跳过新页面 enter（页面空白）。
 * 抽离为独立组件后，isTransitioning 变化只重渲染本组件，路由过渡子树不受影响。
 */
import { usePageTransition } from '@/composables/use-page-transition';

const { isTransitioning, transitionMeta } = usePageTransition();
</script>

<template>
  <!-- 全局页面过渡层：仅路由切换期间出现；fixed 全视口 + pointer-events 穿透，
       z-index 低于项目弹窗层，不遮挡任何可操作 UI；新页面入场后由 v-if 彻底销毁 -->
  <div v-if="isTransitioning" class="page-transition-overlay" aria-hidden="true">
    <div class="page-transition-grid"></div>
    <div class="page-transition-scanline"></div>
    <div class="page-transition-beam"></div>
    <div class="page-transition-rings"><span></span><span></span></div>
    <div class="page-transition-hex page-transition-hex--left"></div>
    <div class="page-transition-hex page-transition-hex--right"></div>
    <div v-if="transitionMeta.toTitle" class="page-transition-status">
      切换至 {{ transitionMeta.toTitle }}
    </div>
    <div class="page-transition-progress">
      <div class="page-transition-progress-bar"></div>
    </div>
    <div class="page-transition-noise"></div>
  </div>
</template>
