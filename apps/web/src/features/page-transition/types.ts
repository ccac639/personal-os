/**
 * 页面过渡模块 — 公共类型。
 *
 * 状态机：
 *   idle → leaving → loading → entering → idle
 *          （离场动画）（等待就绪）（入场动画）
 *   任意阶段可经 failNavigation 进入 error（路由组件加载失败）。
 *   leaving/loading 可被 cancel（Escape / 取消按钮 / 新导航接管）打断。
 */

/** 过渡方向：同层前进（右到左）、返回（反向）、无法判定（淡入上移）、仅 query 变化（轻量） */
export type Direction = 'forward' | 'backward' | 'unknown' | 'query';

/** 过渡阶段 */
export type Phase = 'idle' | 'leaving' | 'loading' | 'entering' | 'error';

/** 页面就绪协议控制器（usePageReady() 的返回值） */
export interface PageReadyController {
  /** 页面关键内容已可展示，立即进入入场阶段。 */
  markPageReady(): void;
  /** 手动标记加载中（可选；用于延长就绪等待，例如展示端到端进度）。 */
  markPageLoading(reason?: string): void;
  /** 注册一个关键任务：全部任务成功后才进入入场阶段；失败视为完成（不卡页面）。 */
  registerCriticalTask(task: Promise<unknown>): void;
}
