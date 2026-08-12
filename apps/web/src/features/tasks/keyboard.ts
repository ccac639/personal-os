/**
 * 任务看板键盘快捷键分类纯函数（可单测）
 *
 * 映射规则（在输入框 / 内容可编辑区域 / 组合键按下时一律忽略）：
 * - N            → 新建任务
 * - E            → 编辑当前选中任务
 * - Delete / BS  → 删除当前选中任务（触发二次确认）
 * - Escape       → 退出选中 / 关闭弹窗
 */
export type KanbanKeyAction = 'create' | 'edit' | 'delete' | 'escape' | 'none';

export interface KeyContext {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  /** 事件目标是否为可编辑元素（input / textarea / select / contenteditable） */
  editable: boolean;
}

export function classifyKanbanKey(ctx: KeyContext): KanbanKeyAction {
  if (ctx.editable) return 'none';
  if (ctx.ctrl || ctx.meta || ctx.alt) return 'none';
  const k = ctx.key.toLowerCase();
  if (k === 'n') return 'create';
  if (k === 'e') return 'edit';
  if (k === 'delete' || k === 'backspace') return 'delete';
  if (k === 'escape') return 'escape';
  return 'none';
}

/** 判断 DOM 事件目标是否可编辑（供组件层调用，保持纯逻辑单测） */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  // jsdom 下 isContentEditable 可能为 undefined，需同时检查 contenteditable 属性
  const attr = target.getAttribute('contenteditable');
  return attr !== null || target.isContentEditable === true;
}
