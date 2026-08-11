import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import PagePlaceholder from '@/components/PagePlaceholder.vue';

describe('web smoke', () => {
  it('挂载占位组件', () => {
    const wrapper = mount(PagePlaceholder, { props: { title: 'Test' } });
    expect(wrapper.find('h1').text()).toBe('Test');
  });
});
