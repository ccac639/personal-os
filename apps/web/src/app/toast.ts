/**
 * 全局轻量 toast（统一反馈通道，app 壳层公共 API）。
 *
 * - 单例消息队列；AppToastHost 在 App.vue 挂载一次渲染；
 * - 自动消失（默认 3200ms），可手动关闭，支持 info / success / error；
 * - 计时器由宿主组件统一管理：宿主卸载时全部清理，不遗留；
 * - 业务模块可经 `@/app/ui` 接入，无需依赖本模块内部结构。
 */
import { reactive } from 'vue';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  duration: number;
  createdAt: number;
}

export interface ToastOptions {
  tone?: ToastTone;
  /** 自动消失时长（ms），0 = 不自动消失 */
  duration?: number;
}

export const DEFAULT_TOAST_DURATION = 3200;
const MAX_TOASTS = 4;

export const toastState = reactive<{ items: ToastItem[] }>({ items: [] });

let seq = 0;

function push(message: string, options: ToastOptions = {}): number {
  const id = ++seq;
  toastState.items.push({
    id,
    tone: options.tone ?? 'info',
    message,
    duration: options.duration ?? DEFAULT_TOAST_DURATION,
    createdAt: Date.now(),
  });
  if (toastState.items.length > MAX_TOASTS) {
    toastState.items.splice(0, toastState.items.length - MAX_TOASTS);
  }
  return id;
}

export const toast = {
  info(message: string, options?: Omit<ToastOptions, 'tone'>): number {
    return push(message, { ...options, tone: 'info' });
  },
  success(message: string, options?: Omit<ToastOptions, 'tone'>): number {
    return push(message, { ...options, tone: 'success' });
  },
  error(message: string, options?: Omit<ToastOptions, 'tone'>): number {
    return push(message, { ...options, tone: 'error' });
  },
};

export function dismissToast(id: number): void {
  const index = toastState.items.findIndex((item) => item.id === id);
  if (index >= 0) toastState.items.splice(index, 1);
}

export function clearToasts(): void {
  toastState.items.splice(0, toastState.items.length);
}
