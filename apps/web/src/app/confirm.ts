/**
 * 全局确认对话框（Promise API，app 壳层公共 API）。
 *
 * - 单例请求队列；ConfirmDialogHost 在 App.vue 挂载一次渲染；
 * - `confirm({ title, message })` 返回 Promise<boolean>：确认 true / 取消 false；
 * - Escape 等价取消；焦点管理（打开聚焦首按钮、关闭归还焦点）由宿主负责；
 * - 业务模块可经 `@/app/ui` 接入。
 */
import { reactive } from 'vue';

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** 确认按钮文案，默认「确认」 */
  confirmText?: string;
  /** 取消按钮文案，默认「取消」 */
  cancelText?: string;
  /** 危险操作强调色 */
  tone?: 'default' | 'danger';
}

export interface ConfirmRequest extends ConfirmOptions {
  id: number;
  resolve: (value: boolean) => void;
}

export const confirmState = reactive<{ request: ConfirmRequest | null }>({ request: null });

let seq = 0;

/** 弹出确认框；返回 Promise，用户操作后 resolve(true/false)。 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    confirmState.request = { id: ++seq, ...options, resolve };
  });
}

/** 宿主组件调用：结算当前请求并关闭。 */
export function resolveConfirm(id: number, value: boolean): void {
  const request = confirmState.request;
  if (request && request.id === id) {
    confirmState.request = null;
    request.resolve(value);
  }
}
