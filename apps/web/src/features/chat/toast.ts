/**
 * Chat 功能域 —— 极简本地 toast
 *
 * 模块级响应式状态，由 ChatToast 组件渲染。
 * 用于结果操作反馈、偏好恢复提示等非阻塞通知。
 */
import { reactive } from 'vue';

export interface ToastItem {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'warning';
}

let seq = 0;

export const toastState = reactive<{ items: ToastItem[] }>({ items: [] });

export function pushToast(
  text: string,
  kind: ToastItem['kind'] = 'success',
  duration = 2600,
): void {
  const id = ++seq;
  toastState.items.push({ id, text, kind });
  window.setTimeout(() => {
    const idx = toastState.items.findIndex((t) => t.id === id);
    if (idx >= 0) toastState.items.splice(idx, 1);
  }, duration);
}
