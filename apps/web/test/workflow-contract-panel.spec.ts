import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import ContractPanel from '@/features/workflows/contract-panel.vue';
import { useWorkflowStore } from '@/features/workflows/store';

describe('workflow 输入输出面板（组件交互）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('渲染输入/输出/运行配置三个区块，标题与关闭按钮可见', async () => {
    const store = useWorkflowStore();
    store.addNode('trigger');
    const wrapper = mount(ContractPanel, { global: { plugins: [createPinia()] } });
    await nextTick();
    expect(wrapper.text()).toContain('输入输出与运行配置');
    expect(wrapper.text()).toContain('输入定义');
    expect(wrapper.text()).toContain('输出映射');
    expect(wrapper.text()).toContain('运行配置');
    // 关闭按钮有 aria-label
    const close = wrapper.find('button[aria-label="关闭输入输出面板"]');
    expect(close.exists()).toBe(true);
    wrapper.unmount();
    void store;
  });

  it('添加输入：名称 / 类型 / 必填选项可交互', async () => {
    const wrapper = mount(ContractPanel, { global: { plugins: [createPinia()] } });
    await nextTick();
    const addBtn = wrapper.findAll('button').find((b) => b.text().includes('添加输入'));
    expect(addBtn).toBeTruthy();
    await addBtn!.trigger('click');
    await nextTick();
    // 出现新的输入行（默认 input_1，input 值不在 textContent 中）
    const nameInput = wrapper.find('input[aria-label="输入名称"]');
    expect((nameInput.element as HTMLInputElement).value).toBe('input_1');
    wrapper.unmount();
  });

  it('保存输入：合法定义写入 store（含默认值）', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useWorkflowStore();
    store.addNode('trigger');
    const wrapper = mount(ContractPanel, { global: { plugins: [pinia] } });
    await nextTick();

    // 添加输入并填入名称
    const addBtn = wrapper.findAll('button').find((b) => b.text().includes('添加输入'))!;
    await addBtn.trigger('click');
    await nextTick();
    const nameInput = wrapper.find('input[aria-label="输入名称"]');
    await nameInput.setValue('role');

    const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('保存输入'))!;
    await saveBtn.trigger('click');
    await nextTick();
    expect(store.inputDefs).toHaveLength(1);
    expect(store.inputDefs[0]!.name).toBe('role');
    wrapper.unmount();
  });

  it('输出映射：可选择来源节点', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useWorkflowStore();
    store.addNode('trigger');
    const wrapper = mount(ContractPanel, { global: { plugins: [pinia] } });
    await nextTick();

    const addBtn = wrapper.findAll('button').find((b) => b.text().includes('添加输出'))!;
    await addBtn.trigger('click');
    await nextTick();
    const sourceSelect = wrapper.find('select[aria-label="输出来源"]');
    // 选项包含节点 n-1
    const options = sourceSelect.findAll('option').map((o) => o.attributes('value'));
    expect(options.some((v) => v === 'n-1')).toBe(true);
    wrapper.unmount();
  });

  it('从上次运行复用输入：无记录时给出提示', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useWorkflowStore();
    store.addNode('trigger');
    const wrapper = mount(ContractPanel, { global: { plugins: [pinia] } });
    await nextTick();
    const reuseBtn = wrapper.findAll('button').find((b) => b.text().includes('上次运行'))!;
    await reuseBtn.trigger('click');
    await nextTick();
    expect(wrapper.text()).toContain('暂无上次运行记录');
    wrapper.unmount();
  });
});
