import { describe, expect, it } from 'vitest';
import {
  isValidDateString,
  isValidUrl,
  splitTags,
  validateDraft,
} from '@/features/achievements/validation';
import type { AchievementDraft } from '@/features/achievements/types';

function draft(overrides: Partial<AchievementDraft> = {}): AchievementDraft {
  return {
    type: 'project',
    title: '成果',
    summary: '',
    description: '',
    tags: ['vue'],
    completedAt: '2026-08-13',
    metrics: [],
    relations: { projectIds: [], workflowIds: [], predecessorIds: [], derivedIds: [] },
    reuse: { links: [], usageGuide: '', checklist: [], retrospective: '', templateSnippet: '' },
    ...overrides,
  };
}

describe('achievement validation（字段校验）', () => {
  it('isValidDateString：拒绝格式错误、越界、闰日非法', () => {
    expect(isValidDateString('2026-08-13')).toBe(true);
    expect(isValidDateString('2024-02-29')).toBe(true); // 闰年
    expect(isValidDateString('2026-02-29')).toBe(false); // 非闰年
    expect(isValidDateString('2026-13-01')).toBe(false);
    expect(isValidDateString('2026-8-13')).toBe(false);
    expect(isValidDateString('20260813')).toBe(false);
    expect(isValidDateString('')).toBe(false);
  });

  it('isValidUrl：仅接受 http/https', () => {
    expect(isValidUrl('https://example.com/a?b=1')).toBe(true);
    expect(isValidUrl('http://localhost:3000')).toBe(true);
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
    expect(isValidUrl('ftp://example.com')).toBe(false);
    expect(isValidUrl('not a url')).toBe(false);
    expect(isValidUrl('')).toBe(false);
  });

  it('splitTags：支持中英文分隔符，去重去空', () => {
    expect(splitTags('vue, pinia、写作 测试')).toEqual(['vue', 'pinia', '写作', '测试']);
    expect(splitTags('vue，vue, vue')).toEqual(['vue']);
    expect(splitTags('   ')).toEqual([]);
    expect(splitTags('')).toEqual([]);
  });

  it('validateDraft：标题/日期必填，链接格式、标签长度校验', () => {
    expect(validateDraft(draft())).toEqual({});

    expect(validateDraft(draft({ title: '  ' })).title).toBe('请填写成果标题');
    expect(validateDraft(draft({ completedAt: '' })).completedAt).toBe('请选择有效的完成日期');
    expect(validateDraft(draft({ completedAt: '2026-02-30' })).completedAt).toBe(
      '请选择有效的完成日期',
    );
    expect(validateDraft(draft({ link: 'javascript:alert(1)' })).link).toContain('http');
    expect(validateDraft(draft({ link: 'https://ok.example.com' })).link).toBeUndefined();
    expect(validateDraft(draft({ tags: ['x'.repeat(31)] })).tags).toBe('单个标签最长 30 个字');

    // 多个错误同时返回
    const errors = validateDraft(draft({ title: '', completedAt: 'bad', link: 'oops' }));
    expect(errors.title).toBeDefined();
    expect(errors.completedAt).toBeDefined();
    expect(errors.link).toBeDefined();
  });

  it('validateDraft：复用包链接需名称 + http/https 地址', () => {
    expect(validateDraft(draft())).toEqual({});
    expect(
      validateDraft(
        draft({
          reuse: {
            links: [
              { label: '文档', url: 'https://example.com' },
              { label: '坏链接', url: 'javascript:alert(1)' },
            ],
            usageGuide: '',
            checklist: [],
            retrospective: '',
            templateSnippet: '',
          },
        }),
      ).reuseLinks,
    ).toContain('http');
    expect(
      validateDraft(
        draft({
          reuse: {
            links: [{ label: '', url: 'https://example.com' }],
            usageGuide: '',
            checklist: [],
            retrospective: '',
            templateSnippet: '',
          },
        }),
      ).reuseLinks,
    ).toBeDefined();
  });
});
