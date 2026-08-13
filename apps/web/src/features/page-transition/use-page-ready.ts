/**
 * 页面就绪协议 composable。
 *
 * 页面级组件在 setup 中调用 usePageReady() 获得控制器：
 * - registerCriticalTask(promise)：声明关键任务（首屏数据初始化、图表/画布
 *   初始化等）。全部任务成功后才进入入场阶段；任务失败视为完成（记录警告，
 *   不阻塞页面）。
 * - markPageLoading(reason?)：手动延长就绪等待（可选）。
 * - markPageReady()：关键内容已可展示，立即播放入场动画。
 *
 * 兼容降级：未调用 usePageReady() 的旧页面在组件 mounted 后自动视为就绪。
 * 所有回调绑定创建时的导航 token，旧页面的延迟回调不会污染新页面；
 * 页面卸载自动释放任务（disposePage）。
 */
import { getCurrentInstance, onBeforeUnmount } from 'vue';

import {
  claimPage,
  disposePage,
  getCurrentToken,
  markPageLoading,
  markPageReady,
  registerTask,
} from './transition-store';
import type { PageReadyController } from './types';

export function usePageReady(): PageReadyController {
  const instance = getCurrentInstance();
  const token = getCurrentToken();
  claimPage(token);

  let disposed = false;
  if (instance) {
    onBeforeUnmount(() => {
      disposed = true;
      disposePage(token);
    });
  }

  return {
    markPageReady() {
      if (disposed) return;
      markPageReady(token);
    },
    markPageLoading() {
      if (disposed) return;
      markPageLoading(token);
    },
    registerCriticalTask(task) {
      if (disposed) return;
      registerTask(token, task);
    },
  };
}
