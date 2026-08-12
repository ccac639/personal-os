import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import WorkflowAiPreview from '@/features/workflows/workflow-ai-preview.vue';
import { useWorkflowStore } from '@/features/workflows/store';
import type { AiGenerateService } from '@/features/workflows/ai-workflow';

const originalMatchMedia = window.matchMedia;

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe('workflow AI 预览组件（动画与可访问性）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    mockMatchMedia(false); // jsdom 默认无 matchMedia
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  async function preparePreview(): Promise<ReturnType<typeof createPinia>> {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useWorkflowStore();
    store.createWorkflow('AI 测试');
    const svc: AiGenerateService = {
      async generate() {
        return {
          summary: '预览测试',
          nodes: [
            { id: 't', kind: 'trigger' },
            { id: 'a', kind: 'ai', data: { prompt: 'p' } },
            { id: 'o', kind: 'output' },
          ],
          edges: [
            { source: 't', target: 'a' },
            { source: 'a', target: 'o' },
          ],
          warnings: ['测试警告'],
        };
      },
    };
    store.setAiService(svc);
    vi.useFakeTimers();
    const p = store.generateAiWorkflow('生成预览', 'new');
    await vi.advanceTimersByTimeAsync(2000);
    await p;
    return pinia;
  }

  it('预览只渲染 preview 节点：正式画布节点不受影响，动画阶段不改正式数据', async () => {
    const pinia = await preparePreview();
    const store = useWorkflowStore();
    const wrapper = mount(WorkflowAiPreview, {
      global: { plugins: [pinia] },
    });
    await nextTick();

    // 正式数据未被预览影响
    expect(store.nodes).toHaveLength(0);
    expect(store.edges).toHaveLength(0);
    expect(store.aiPhase).toBe('ready');

    // 预览层渲染了 3 个草稿节点卡片
    const cards = wrapper.findAll('.ai-preview-node');
    expect(cards).toHaveLength(3);
    // 预览边 SVG 存在
    expect(wrapper.find('path.ai-preview-edge').exists()).toBe(true);
    // 校验提示展示
    expect(wrapper.text()).toContain('校验提示');
    expect(wrapper.text()).toContain('测试警告');
    // 操作按钮存在
    expect(wrapper.text()).toContain('应用全部');
    expect(wrapper.text()).toContain('取消');

    wrapper.unmount();
    vi.useRealTimers();
  });

  it('reduced-motion：关闭动画 class（节点仍渲染、无 transition-delay）', async () => {
    mockMatchMedia(true); // prefers-reduced-motion: reduce
    const pinia = await preparePreview();
    const wrapper = mount(WorkflowAiPreview, {
      global: { plugins: [pinia] },
    });
    await nextTick();

    const cards = wrapper.findAll('.ai-preview-node');
    expect(cards.length).toBeGreaterThan(0);
    // reduce 模式下节点无动画 class（直接显示）
    for (const c of cards) {
      expect(c.classes()).not.toContain('ai-node-in');
    }
    // 扫描线隐藏
    expect(wrapper.find('.ai-scanline').exists()).toBe(false);

    wrapper.unmount();
    vi.useRealTimers();
  });

  it('取消按钮调用 clearAiPreview，不修改正式工作流', async () => {
    const pinia = await preparePreview();
    const store = useWorkflowStore();
    const wrapper = mount(WorkflowAiPreview, {
      global: { plugins: [pinia] },
    });
    await nextTick();

    const cancelBtn = wrapper.findAll('button').find((b) => b.text().includes('取消'));
    expect(cancelBtn).toBeTruthy();
    cancelBtn!.trigger('click');
    await nextTick();

    expect(store.aiPreview).toBeNull();
    expect(store.nodes).toHaveLength(0);

    wrapper.unmount();
    vi.useRealTimers();
  });
});
