/**
 * 弹层统一焦点管理（成就模块）
 *
 * 统一四个弹层（确认弹窗 / 详情抽屉 / 导入弹窗 / 新增编辑表单）的键盘与焦点行为：
 * - 打开时记录触发焦点，关闭 / 卸载时归还，避免键盘焦点丢失；
 * - Escape 统一关闭：按监听注册顺序，最上层弹层优先响应并阻止冒泡给下层弹层
 *   （例如抽屉上再打开编辑表单时，Escape 只关表单）；
 * - 可选 Tab 焦点陷阱：键盘操作不会把焦点移出弹层，循环回到弹层内；
 * - 可选背景滚动锁定：打开时 body overflow hidden，关闭时恢复。
 *
 * 设计约定：默认不抢焦点（焦点保留在触发元素上，配合 aria-modal 语义），
 * 需要时通过 initialFocus 显式指定焦点目标（如抽屉的关闭按钮）。
 * 纯 jsdom 环境下同样安全：不依赖布局信息（offsetParent 等）。
 */
import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue';

export interface OverlayFocusOptions {
  /** 弹层开关（ref 或 getter，如 () => props.item !== null） */
  visible: Ref<boolean> | (() => boolean);
  /** Escape 按下时的处理（通常派发 close 事件） */
  onEscape?: () => void;
  /** 打开后移动焦点的目标；缺省 = 不移动焦点（保留在触发元素上） */
  initialFocus?: Ref<HTMLElement | null> | (() => HTMLElement | null);
  /** 弹层根元素（Tab 陷阱边界）；未提供则跳过陷阱 */
  container?: Ref<HTMLElement | null> | (() => HTMLElement | null);
  /** 是否锁定背景滚动（默认 true） */
  lockScroll?: boolean;
}

/** 可聚焦元素选择器（不含 disabled 与 tabindex=-1） */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function resolve<T>(value: Ref<T> | (() => T) | undefined): T | undefined {
  if (value == null) return undefined;
  return typeof value === 'function' ? (value as () => T)() : value.value;
}

export function useOverlayFocus(opts: OverlayFocusOptions): void {
  const { onEscape, lockScroll = true } = opts;
  let lastFocused: HTMLElement | null = null;
  let prevOverflow = '';
  let open = false;

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      // 只让最上层弹层响应：阻止事件继续传给下层弹层的监听器
      e.stopImmediatePropagation();
      onEscape?.();
      return;
    }
    if (e.key !== 'Tab') return;
    const root = resolve(opts.container);
    if (!root) return;
    const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    const inside = root.contains(active);
    if (e.shiftKey && (!inside || active === first)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (!inside || active === last)) {
      e.preventDefault();
      first.focus();
    }
  }

  function teardown(): void {
    if (!open) return;
    open = false;
    window.removeEventListener('keydown', onKeydown);
    if (lockScroll) document.body.style.overflow = prevOverflow;
    lastFocused?.focus();
    lastFocused = null;
  }

  function setup(): void {
    if (open) return;
    open = true;
    lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (lockScroll) {
      prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    window.addEventListener('keydown', onKeydown);
    // 首次挂载时 initialFocus 的 ref 可能尚未填充（模板还没渲染），
    // 在下一帧再解析一次目标，确保抽屉打开后焦点落到关闭按钮。
    void nextTick(() => {
      const target = resolve(opts.initialFocus);
      if (target) target.focus();
    });
  }

  watch(
    () => resolve(opts.visible),
    (v) => (v ? setup() : teardown()),
    { immediate: true },
  );

  onBeforeUnmount(teardown);
}
