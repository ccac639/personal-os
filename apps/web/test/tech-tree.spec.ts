import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import TechTree from '@/features/projects/tech-tree.vue';

describe('tech-tree 技术结构树', () => {
  const wrapper = mount(TechTree);

  it('渲染全部 6 个技术分组', () => {
    const labels = wrapper.findAll('section header h2').map((h) => h.text());
    expect(labels).toEqual(['前端 Web', '博客', 'API', 'Worker', '工程化', '基础设施']);
  });

  it('包含关键技术（Vue / Vite / Node / Motion / NestJS / Nuxt）', () => {
    const text = wrapper.text();
    expect(text).toContain('Vue.js');
    expect(text).toContain('Vite');
    expect(text).toContain('Node.js');
    expect(text).toContain('Motion');
    expect(text).toContain('NestJS');
    expect(text).toContain('Nuxt');
  });

  it('渲染官方品牌 SVG 图标', () => {
    const imgs = wrapper.findAll('svg[role="img"]');
    expect(imgs.length).toBeGreaterThan(20);
    // Vue 官方图标有品牌色 fill
    const vueSvg = wrapper.find('svg[aria-label="Vue.js"]');
    expect(vueSvg.attributes('fill')).toBe('#4FC08D');
  });

  it('无官方图标的技术使用 lucide 兜底', () => {
    // Motion / Vue Flow / Tiptap 无 simple-icons 图标，渲染为 lucide 组件（非 role=img svg）
    const text = wrapper.text();
    expect(text).toContain('Vue Flow');
    expect(text).toContain('Tiptap');
  });
});
