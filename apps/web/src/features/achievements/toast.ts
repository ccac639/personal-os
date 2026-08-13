/**
 * 轻量非阻塞提示（模块内共享，不依赖外部组件库）
 */
import { ref } from 'vue';

export interface ToastItem {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
}

const toasts = ref<ToastItem[]>([]);
let seq = 0;

export function useToasts() {
  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  function push(message: string, kind: ToastItem['kind'] = 'info') {
    const id = ++seq;
    toasts.value.push({ id, kind, message });
    window.setTimeout(() => dismiss(id), 3500);
  }

  return { toasts, push, dismiss };
}
