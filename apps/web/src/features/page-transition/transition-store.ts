/**
 * 页面过渡状态机（模块级单例）。
 *
 * 生命周期（token 隔离，快速连续切换只保留最后一次导航）：
 *   router.beforeEach → beginNavigation（phase=leaving，播放离场动画）
 *   waitForLeave(token) 等待离场完成（animationend / 超时 / 取消 / reduce-motion）
 *   afterEach → confirmNavigation（phase=loading，启动软/硬超时计时）
 *   页面组件 mounted：未接入就绪协议 → 自动 ready（兼容旧页面）
 *   页面调用 usePageReady：全部关键任务完成 / markPageReady → ready
 *   markReady → phase=entering（播放入场动画）→ finishEnter → idle + 焦点管理
 *
 * 失败路径：路由组件加载失败 → failNavigation（phase=error，提供重试/返回）；
 * 取消路径：Escape / 取消按钮 / 新导航接管 → 中止当前流程，不污染新导航。
 *
 * 所有定时器与动画监听都绑定 token，随导航取消/完成清理，不遗留。
 */
import { reactive, readonly } from 'vue';

import type { Direction, Phase } from './types';

/** 过渡节奏与超时阈值 */
export const TRANSITION_TIMING = {
  /** 离场动画时长（与 transitions.css .pt-leave-* 一致） */
  LEAVE_MS: 220,
  /** 入场动画时长（与 transitions.css .pt-enter-* 一致） */
  ENTER_MS: 240,
  /** query-only 轻量入场时长 */
  QUERY_ENTER_MS: 140,
  /** 离场等待兜底：超过则强制放行（防 animationend 丢失） */
  LEAVE_TIMEOUT_MS: 400,
  /** 入场结束兜底：超过则清理动画 class 并完成过渡 */
  ENTER_TIMEOUT_MS: 400,
  /** 软超时：超过后 loading 层提示「正在准备页面内容」并提供取消 */
  SOFT_LOADING_MS: 1200,
  /** 硬超时：超过后强制就绪并降级显示页面（记录控制台警告，绝不白屏/永久遮罩） */
  HARD_READY_MS: 5000,
} as const;

export interface BeginNavigationInput {
  direction: Direction;
  /** 首航 / 刷新 / 直接输入 URL：不播放离场，不显示 loading 层 */
  initial?: boolean;
  fromTitle?: string;
  toTitle?: string;
  targetPath: string;
  fromPath: string;
}

/** 需要路由实例的操作（重试 / 返回），由 router/index.ts 注册，避免循环依赖 */
export interface NavCallbacks {
  retry(): void;
  goBack(): void;
}

export interface TransitionState {
  phase: Phase;
  direction: Direction;
  /** 当前导航 token（页面就绪协议绑定此值） */
  token: number;
  fromTitle: string;
  toTitle: string;
  targetPath: string;
  fromPath: string;
  /** 当前 token 是否被 usePageReady 认领（未认领 → mounted 后自动就绪） */
  claimed: boolean;
  /** 未完成的关键任务数（>0 时阻塞进入入场阶段） */
  taskCount: number;
  /** 是否超过软超时（loading 层显示「正在准备页面内容」） */
  softElapsed: boolean;
  /** 首航/刷新标志：不渲染 loading 层 */
  initial: boolean;
  error: unknown;
  errorMessage: string;
}

const state = reactive<TransitionState>({
  phase: 'idle',
  direction: 'unknown',
  token: 0,
  fromTitle: '',
  toTitle: '',
  targetPath: '',
  fromPath: '',
  claimed: false,
  taskCount: 0,
  softElapsed: false,
  initial: false,
  error: undefined,
  errorMessage: '',
});

// ---- 可取消资源（全部绑定 token，导航取消/完成时清理） ----

interface LeavePending {
  token: number;
  resolve: (proceed: boolean) => void;
}

let leavePending: LeavePending | null = null;
let leaveTimer: ReturnType<typeof setTimeout> | undefined;
let enterTimer: ReturnType<typeof setTimeout> | undefined;
let softTimer: ReturnType<typeof setTimeout> | undefined;
let hardTimer: ReturnType<typeof setTimeout> | undefined;
let navCallbacks: NavCallbacks | null = null;
let contentEl: HTMLElement | null = null;

// ---- 工具 ----

function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

const ANIM_CLASSES = [
  'pt-leave-forward',
  'pt-leave-backward',
  'pt-leave-unknown',
  'pt-enter-forward',
  'pt-enter-backward',
  'pt-enter-unknown',
  'pt-enter-query',
] as const;

function clearAnimClasses(el: HTMLElement): void {
  for (const c of ANIM_CLASSES) el.classList.remove(c);
}

function clearTimers(): void {
  if (leaveTimer !== undefined) clearTimeout(leaveTimer);
  if (enterTimer !== undefined) clearTimeout(enterTimer);
  if (softTimer !== undefined) clearTimeout(softTimer);
  if (hardTimer !== undefined) clearTimeout(hardTimer);
  leaveTimer = undefined;
  enterTimer = undefined;
  softTimer = undefined;
  hardTimer = undefined;
}

function clearLeavePending(): void {
  if (leavePending !== null) {
    leavePending.resolve(false);
    leavePending = null;
  }
  if (leaveTimer !== undefined) clearTimeout(leaveTimer);
  leaveTimer = undefined;
  if (contentEl) clearAnimClasses(contentEl);
}

function warnOnce(message: string): void {
  console.warn(`[page-transition] ${message}`);
}

// ---- 动画执行 ----

function runLeave(el: HTMLElement, direction: Direction): void {
  clearAnimClasses(el);
  void el.offsetWidth; // 强制 reflow，确保动画 class 重启
  if (direction === 'backward') el.classList.add('pt-leave-backward');
  else if (direction === 'unknown') el.classList.add('pt-leave-unknown');
  else el.classList.add('pt-leave-forward');
}

function runEnter(el: HTMLElement, direction: Direction): void {
  clearAnimClasses(el);
  void el.offsetWidth;
  if (direction === 'query') el.classList.add('pt-enter-query');
  else if (direction === 'backward') el.classList.add('pt-enter-backward');
  else if (direction === 'unknown') el.classList.add('pt-enter-unknown');
  else el.classList.add('pt-enter-forward');
}

function isFormField(el: HTMLElement): boolean {
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (el as HTMLElement).isContentEditable === true
  );
}

// ---- 对外控制器 ----

/** 注册需要路由实例的操作（由 router/index.ts 调用）。 */
export function setNavCallbacks(callbacks: NavCallbacks): void {
  navCallbacks = callbacks;
}

/** 注册过渡动画目标元素（布局的 <main>）。 */
export function registerContentEl(el: HTMLElement | null): void {
  contentEl = el;
}

/** 当前导航 token（页面 setup 期间调用 usePageReady 绑定）。 */
export function getCurrentToken(): number {
  return state.token;
}

/**
 * 开始一次导航：递增 token、进入 leaving、播放离场动画。
 * 返回该次导航的 token。
 */
export function beginNavigation(input: BeginNavigationInput): number {
  // 新导航接管：取消上一个仍在等待离场的导航
  clearLeavePending();

  state.token += 1;
  state.direction = input.direction;
  state.fromTitle = input.fromTitle ?? '';
  state.toTitle = input.toTitle ?? '';
  state.targetPath = input.targetPath;
  state.fromPath = input.fromPath;
  state.initial = input.initial === true;
  state.claimed = false;
  state.taskCount = 0;
  state.softElapsed = false;
  state.error = undefined;
  state.errorMessage = '';

  if (input.initial || input.direction === 'query') {
    // 首航/刷新或轻量过渡：跳过离场，直接等待新页面
    state.phase = 'loading';
    startLoadingTimers(state.token);
    return state.token;
  }

  state.phase = 'leaving';
  if (contentEl && !prefersReducedMotion()) {
    runLeave(contentEl, input.direction);
  }
  return state.token;
}

/**
 * 等待离场动画完成。resolve(true) 表示放行导航；
 * resolve(false) 表示该导航已被取消/接管，应中止。
 */
export function waitForLeave(token: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (token !== state.token) {
      resolve(false);
      return;
    }
    if (state.phase !== 'leaving' || prefersReducedMotion()) {
      // 无离场阶段（如动画缺失/reduce-motion）→ 立即放行
      state.phase = 'loading';
      startLoadingTimers(token);
      resolve(true);
      return;
    }
    leavePending = { token, resolve };
    leaveTimer = setTimeout(() => finishLeave(token), TRANSITION_TIMING.LEAVE_TIMEOUT_MS);
  });
}

/** 离场完成：进入 loading，等待页面就绪。 */
function finishLeave(token: number): void {
  if (leavePending === null || leavePending.token !== token) return;
  if (leaveTimer !== undefined) clearTimeout(leaveTimer);
  leaveTimer = undefined;
  const resolver = leavePending.resolve;
  leavePending = null;
  if (contentEl) clearAnimClasses(contentEl);
  state.phase = 'loading';
  startLoadingTimers(token);
  resolver(true);
}

/**
 * 导航确认（router.afterEach）：离场已完成、新路由已解析。
 * query-only 方向同样在此进入等待就绪，但走轻量入场。
 */
export function confirmNavigation(): void {
  if (state.phase !== 'loading') return;
  // loading 计时已在 beginNavigation/waitForLeave 中启动（幂等保护）
}

/** 启动 loading 软/硬超时（幂等：清除旧计时再启动）。 */
function startLoadingTimers(token: number): void {
  if (softTimer !== undefined) clearTimeout(softTimer);
  if (hardTimer !== undefined) clearTimeout(hardTimer);
  softTimer = setTimeout(() => {
    if (token === state.token && state.phase === 'loading') state.softElapsed = true;
  }, TRANSITION_TIMING.SOFT_LOADING_MS);
  hardTimer = setTimeout(() => {
    if (token !== state.token || state.phase !== 'loading') return;
    warnOnce(
      `页面就绪超时（${TRANSITION_TIMING.HARD_READY_MS}ms），已降级显示：${state.toTitle || state.targetPath || '(未知)'}`,
    );
    markPageReady(token);
  }, TRANSITION_TIMING.HARD_READY_MS);
}

/** 页面组件挂载完成：未认领协议 → 自动就绪（兼容旧页面）。
 * @vue:mounted 会传入组件实例，这里不需要。 */
export function notifyPageMounted(): void {
  const token = state.token;
  if (state.phase !== 'loading') return;
  if (!state.claimed) markPageReady(token);
}

/** 页面就绪协议：认领当前导航。 */
export function claimPage(token: number): void {
  if (token === state.token && state.phase === 'loading') state.claimed = true;
}

/** 页面卸载：清理任务；若该 token 仍是当前且等待中 → 防卡死自动就绪。 */
export function disposePage(token: number): void {
  if (token !== state.token) return;
  state.taskCount = 0;
  if (state.phase === 'loading') markPageReady(token);
}

/** 注册关键任务：全部完成后自动就绪；失败视为完成（记录警告，不卡页面）。 */
export function registerTask(token: number, task: Promise<unknown>): void {
  if (token !== state.token || state.phase !== 'loading') return;
  state.taskCount += 1;
  Promise.resolve(task).then(
    () => taskSettled(token),
    (err: unknown) => {
      warnOnce(
        `关键任务失败（已降级视为完成）：${err instanceof Error ? err.message : String(err)}`,
      );
      taskSettled(token);
    },
  );
}

/** 单个任务结束。 */
export function taskSettled(token: number): void {
  if (token !== state.token || state.phase !== 'loading') return;
  state.taskCount = Math.max(0, state.taskCount - 1);
  if (state.taskCount === 0) markPageReady(token);
}

/** 页面就绪：进入入场阶段并播放入场动画。幂等。 */
export function markPageReady(token: number): void {
  if (token !== state.token || state.phase !== 'loading') return;
  if (softTimer !== undefined) clearTimeout(softTimer);
  if (hardTimer !== undefined) clearTimeout(hardTimer);
  softTimer = undefined;
  hardTimer = undefined;
  state.softElapsed = false;

  state.phase = 'entering';
  const direction = state.direction;
  if (contentEl) {
    if (prefersReducedMotion()) {
      clearAnimClasses(contentEl);
    } else {
      runEnter(contentEl, direction);
    }
  }
  const enterMs =
    direction === 'query' ? TRANSITION_TIMING.QUERY_ENTER_MS : TRANSITION_TIMING.ENTER_TIMEOUT_MS;
  if (enterTimer !== undefined) clearTimeout(enterTimer);
  enterTimer = setTimeout(() => finishEnter(token), enterMs);
}

/**
 * 手动声明仍在加载（可选）：重置软超时提示计时，避免 loading 层过早提示。
 * 硬超时（HARD_READY_MS）仍作为最终兜底，保证任何异常都不会永久阻塞。
 */
export function markPageLoading(token: number): void {
  if (token !== state.token || state.phase !== 'loading') return;
  state.softElapsed = false;
  if (softTimer !== undefined) clearTimeout(softTimer);
  softTimer = setTimeout(() => {
    if (token === state.token && state.phase === 'loading') state.softElapsed = true;
  }, TRANSITION_TIMING.SOFT_LOADING_MS);
}

/** 入场完成：回到 idle，清理动画 class，焦点移动到主内容。 */
function finishEnter(token: number): void {
  if (token !== state.token || state.phase !== 'entering') return;
  if (enterTimer !== undefined) clearTimeout(enterTimer);
  enterTimer = undefined;
  if (contentEl) clearAnimClasses(contentEl);
  state.phase = 'idle';
  moveFocusToMain(state.direction !== 'query');
}

/** 过渡完成后的焦点管理：不抢夺正在输入的表单焦点。 */
function moveFocusToMain(resetScroll: boolean): void {
  const el = contentEl;
  if (!el) return;
  if (resetScroll) el.scrollTop = 0;
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  if (active instanceof HTMLElement && isFormField(active)) return;
  try {
    el.focus({ preventScroll: true });
  } catch {
    /* focus 失败不影响页面 */
  }
}

/** 路由组件加载失败（router.onError）：恢复当前页面可见，展示错误层。 */
export function failNavigation(error: unknown): void {
  clearLeavePending();
  clearTimers();
  if (contentEl) clearAnimClasses(contentEl);
  state.phase = 'error';
  state.error = error;
  state.errorMessage = error instanceof Error ? error.message : String(error);
  warnOnce(`路由/组件加载失败：${state.errorMessage}`);
}

/** 重试失败的目标路由（错误层按钮）。 */
export function retryNavigation(): void {
  if (state.phase !== 'error') return;
  navCallbacks?.retry();
}

/** 返回上一稳定页面（错误层按钮）。 */
export function goBack(): void {
  if (state.phase !== 'error') return;
  navCallbacks?.goBack();
}

/** Escape / 取消：中止尚未完成的过渡，恢复到稳定状态。 */
export function handleEscape(): void {
  switch (state.phase) {
    case 'leaving': {
      // 导航未确认（URL 未变）：直接取消
      clearLeavePending();
      state.phase = 'idle';
      break;
    }
    case 'loading': {
      clearTimers();
      state.phase = 'idle';
      navCallbacks?.goBack();
      break;
    }
    case 'error': {
      goBack();
      break;
    }
    default:
      break;
  }
}

/** 当前状态（只读）。 */
export const transitionState: Readonly<TransitionState> = readonly(
  state,
) as Readonly<TransitionState>;
