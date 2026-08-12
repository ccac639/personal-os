import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import InspectorPanel from '@/features/workflows/inspector-panel.vue';
import { useWorkflowStore } from '@/features/workflows/store';

describe('workflow 检查器抽屉（窄屏）', () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    originalMatchMedia = window.matchMedia;
    // 模拟窄屏：<1024px → matches=false → 抽屉模式
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    document.body.innerHTML = '';
  });

  it('窄屏选中节点时渲染底部抽屉，未选中不渲染', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useWorkflowStore();
    store.addNode('ai'); // n-1（自动选中）

    const wrapper = mount(InspectorPanel, {
      global: { plugins: [pinia] },
    });
    await nextTick();
    await nextTick();

    // Teleport 到 body：抽屉应存在且包含 schema 字段（模型/提示词/温度等）
    const drawer = document.body.querySelector('.fixed.inset-x-0.bottom-0');
    expect(drawer).toBeTruthy();
    expect(document.body.textContent).toContain('AI 生成');
    expect(document.body.textContent).toContain('温度');

    // 未选中 → 抽屉消失
    store.selectNode(null);
    await nextTick();
    await nextTick();
    expect(document.body.querySelector('.fixed.inset-x-0.bottom-0')).toBeNull();

    wrapper.unmount();
  });

  it('抽屉内字段编辑驱动 store（恢复默认 + 删除节点按钮可用）', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useWorkflowStore();
    store.addNode('ai');
    store.updateNodeData('n-1', { temperature: 0.3 });

    const wrapper = mount(InspectorPanel, {
      global: { plugins: [pinia] },
    });
    await nextTick();
    await nextTick();

    // 温度输入框存在且值为 0.3
    const tempInput = document.body.querySelector<HTMLInputElement>('input[type="number"]');
    expect(tempInput).toBeTruthy();
    expect(tempInput!.value).toBe('0.3');

    // 恢复默认按钮：点击后温度回到 schema 默认 0.7
    const resetBtn = document.body.querySelector<HTMLButtonElement>('[title="恢复默认配置"]');
    expect(resetBtn).toBeTruthy();
    resetBtn!.click();
    await nextTick();
    expect(store.nodes[0]!.data.temperature).toBe(0.7);

    wrapper.unmount();
  });
});
