/**
 * 应用壳层公共 UI API（供业务模块未来接入，不侵入业务代码）。
 *
 * - toast() / confirm()：全局轻量反馈与确认；
 * - AppStatus：统一 loading / error 状态展示；
 * - AppIconButton / AppTooltip：统一图标按钮与 tooltip；
 * - AppDrawer：可访问移动端抽屉（布局层使用，也可被业务复用）。
 *
 * 业务模块接入示例：
 *   import { toast, confirm } from '@/app/ui';
 *   toast.success('已保存');
 *   const ok = await confirm({ title: '删除？', tone: 'danger' });
 *   if (ok) { ... }
 */
export { toast, dismissToast } from './toast';
export { confirm } from './confirm';
export { default as AppStatus } from '@/components/AppStatus.vue';
export { default as AppIconButton } from '@/components/AppIconButton.vue';
export { default as AppTooltip } from '@/components/AppTooltip.vue';
export { default as AppDrawer } from '@/components/AppDrawer.vue';
