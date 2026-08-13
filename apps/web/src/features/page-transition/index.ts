/**
 * 页面过渡模块 — 公共入口。
 *
 * 使用方式：
 * - 路由层：router/index.ts 在 beforeEach/afterEach/onError 中驱动状态机；
 * - 布局层：default-layout.vue 注册 <main> 为动画目标、在 RouterView 组件
 *   mounted 时通知状态机、导航项 hover/focus 时预取；
 * - 页面层：usePageReady() 声明关键任务（可选；未接入自动兼容）；
 * - 全局 UI：TransitionManager 组件（App.vue 挂载一次）。
 */
export * from './types';
export { transitionState as transitionState } from './transition-store';
export {
  beginNavigation,
  claimPage,
  confirmNavigation,
  disposePage,
  failNavigation,
  getCurrentToken,
  goBack,
  handleEscape,
  markPageLoading,
  markPageReady,
  notifyPageMounted,
  registerContentEl,
  registerTask,
  retryNavigation,
  setNavCallbacks,
  taskSettled,
  waitForLeave,
  TRANSITION_TIMING,
} from './transition-store';
export { getDirection, isInitialNavigation, isQueryOnly, prefetchRoute } from './route-transition';
export { usePageReady } from './use-page-ready';
export { default as TransitionManager } from './transition-manager.vue';
