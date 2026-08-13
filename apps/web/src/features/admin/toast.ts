/**
 * Admin 功能域 —— 应用内 toast（自包含，不依赖其他模块）
 *
 * 模拟通知与操作结果反馈统一走本面板；不调用浏览器 Notification 权限。
 */
import { ref } from 'vue';

export type AdminToastKind = 'info' | 'success' | 'warning' | 'error';

export interface AdminToastItem {
  id: number;
  kind: AdminToastKind;
  text: string;
}

let seq = 0;
const toasts = ref<AdminToastItem[]>([]);

export function useAdminToasts() {
  function push(text: string, kind: AdminToastKind = 'info', durationMs = 3600): void {
    seq += 1;
    const id = seq;
    toasts.value.push({ id, kind, text });
    if (durationMs > 0) {
      window.setTimeout(() => dismiss(id), durationMs);
    }
  }

  function dismiss(id: number): void {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  return { toasts, push, dismiss };
}
