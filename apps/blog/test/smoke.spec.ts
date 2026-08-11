import { describe, expect, it } from 'vitest';

import { slugify } from '@personal-os/utils';

describe('blog smoke', () => {
  it('共享 utils 可用', () => {
    expect(slugify('Nuxt 3 Blog')).toBe('nuxt-3-blog');
  });
});
