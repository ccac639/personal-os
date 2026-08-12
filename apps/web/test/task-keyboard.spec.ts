import { describe, expect, it } from 'vitest';

import { classifyKanbanKey, isEditableTarget } from '@/features/tasks/keyboard';

describe('task keyboard shortcuts（纯函数）', () => {
  it('N / E / Delete / Backspace / Escape 分别映射新建、编辑、删除、退出', () => {
    const base = { ctrl: false, meta: false, alt: false, editable: false };
    expect(classifyKanbanKey({ ...base, key: 'n' })).toBe('create');
    expect(classifyKanbanKey({ ...base, key: 'N' })).toBe('create');
    expect(classifyKanbanKey({ ...base, key: 'e' })).toBe('edit');
    expect(classifyKanbanKey({ ...base, key: 'Delete' })).toBe('delete');
    expect(classifyKanbanKey({ ...base, key: 'Backspace' })).toBe('delete');
    expect(classifyKanbanKey({ ...base, key: 'Escape' })).toBe('escape');
    expect(classifyKanbanKey({ ...base, key: 'x' })).toBe('none');
    expect(classifyKanbanKey({ ...base, key: 'Enter' })).toBe('none');
  });

  it('输入框 / 组合键 / 可编辑区域一律忽略', () => {
    const base = { ctrl: false, meta: false, alt: false, editable: false };
    expect(classifyKanbanKey({ ...base, key: 'n', editable: true })).toBe('none');
    expect(classifyKanbanKey({ ...base, key: 'n', ctrl: true })).toBe('none');
    expect(classifyKanbanKey({ ...base, key: 'e', meta: true })).toBe('none');
    expect(classifyKanbanKey({ ...base, key: 'Delete', alt: true })).toBe('none');
  });

  it('isEditableTarget：input / textarea / select / contenteditable 为可编辑', () => {
    const input = document.createElement('input');
    expect(isEditableTarget(input)).toBe(true);
    const textarea = document.createElement('textarea');
    expect(isEditableTarget(textarea)).toBe(true);
    const select = document.createElement('select');
    expect(isEditableTarget(select)).toBe(true);
    const div = document.createElement('div');
    expect(isEditableTarget(div)).toBe(false);
    div.setAttribute('contenteditable', 'true');
    expect(isEditableTarget(div)).toBe(true);
    expect(isEditableTarget(null)).toBe(false);
  });
});
