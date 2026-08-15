import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';

import RouteFormDialog from '@/features/sub2api/components/route-form-dialog.vue';

/** 模型路由表单：校验（必填 / 防重复）与提交 payload 组装（Teleport 到 body） */

function mountDialog(busy = false) {
  return mount(RouteFormDialog, {
    props: { visible: true, item: null, busy },
    attachTo: document.body,
  });
}

function dialogEl(): Element {
  const el = document.body.querySelector('[role="dialog"]');
  if (!el) throw new Error('dialog not mounted');
  return el;
}

async function setModel(value: string): Promise<void> {
  const input = dialogEl().querySelector('input');
  if (!input) throw new Error('input not found');
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
}

async function submitForm(): Promise<void> {
  const form = dialogEl().querySelector('form');
  if (!form) throw new Error('form not found');
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await nextTick();
}

describe('RouteFormDialog 模型路由表单校验', () => {
  it('对外模型名必填：为空时提示错误且不提交', async () => {
    const wrapper = mountDialog();
    await submitForm();
    expect(dialogEl().textContent).toContain('对外模型名必填');
    expect(wrapper.emitted('submit')).toBeUndefined();
    wrapper.unmount();
  });

  it('填写后提交：payload 组装（trim / 可选字段 undefined）', async () => {
    const wrapper = mountDialog();
    await setModel('  gpt-4o-mini  ');
    await submitForm();
    expect(dialogEl().textContent).not.toContain('对外模型名必填');
    const submit = wrapper.emitted('submit');
    expect(submit).toHaveLength(1);
    const payload = submit![0]![0] as Record<string, unknown>;
    expect(payload.public_model).toBe('gpt-4o-mini'); // trim
    expect(payload.match_type).toBe('exact');
    expect(payload.target_platform).toBe('anthropic');
    expect(payload.upstream_model).toBeUndefined(); // 空串 → undefined
    expect(payload.endpoint).toBe('any');
    expect(payload.priority).toBe(0);
    expect(payload.enabled).toBe(true);
    wrapper.unmount();
  });

  it('busy 防重复提交：提交中再次 submit 被阻止', async () => {
    const wrapper = mountDialog(true);
    await setModel('gpt-4o');
    await submitForm();
    await submitForm();
    expect(wrapper.emitted('submit')).toBeUndefined(); // busy 时不 emit
    wrapper.unmount();
  });
});
