import { describe, expect, it } from 'vitest';
import { slugify } from '../src/string';
import { idSchema } from '../src/validation';

describe('utils smoke', () => {
  it('slugify 基础行为', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('idSchema 校验', () => {
    expect(idSchema.safeParse('abc').success).toBe(true);
    expect(idSchema.safeParse('').success).toBe(false);
  });
});
