import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import {
  buildReuseExport,
  buildReuseMarkdown,
  hasReuse,
  reuseFilename,
  reuseMarkdownFilename,
  reuseSummary,
  REUSE_EXPORT_APP,
  REUSE_EXPORT_VERSION,
} from '@/features/achievements/reuse';
import AchievementDrawer from '@/features/achievements/achievement-drawer.vue';
import type { Achievement } from '@/features/achievements/types';

function make(overrides: Partial<Achievement> = {}): Achievement {
  return {
    id: 'reuse-1',
    type: 'workflow',
    title: '每日审查流水线',
    summary: '',
    description: '',
    tags: [],
    completedAt: '2026-05-20',
    metrics: [],
    relations: { projectIds: [], workflowIds: [], predecessorIds: [], derivedIds: [] },
    reuse: {
      links: [{ label: '使用文档', url: 'https://example.com/docs' }],
      usageGuide: '导入 JSON 后替换 API Key。',
      checklist: ['导入 JSON', '替换 Key', '试运行'],
      retrospective: '条件分支表达最直观。',
      templateSnippet: 'trigger: cron "0 9 * * 1-5"',
    },
    pinned: false,
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('achievement reuse（导出纯函数）', () => {
  it('buildReuseExport：包含版本/应用标识/成果元信息与完整复用包，可 JSON 回读', () => {
    const item = make();
    const json = buildReuseExport(item);

    const data = JSON.parse(json) as {
      version: number;
      app: string;
      exportedAt: string;
      achievement: { id: string; title: string; type: string; completedAt: string };
      reuse: Achievement['reuse'];
    };
    expect(data.version).toBe(REUSE_EXPORT_VERSION);
    expect(data.app).toBe(REUSE_EXPORT_APP);
    expect(data.achievement.id).toBe('reuse-1');
    expect(data.achievement.title).toBe('每日审查流水线');
    expect(data.reuse.links).toEqual([{ label: '使用文档', url: 'https://example.com/docs' }]);
    expect(data.reuse.checklist).toHaveLength(3);
    expect(data.reuse.templateSnippet).toContain('cron');
  });

  it('hasReuse：任一字段非空即为可复用；reuseSummary 返回内容清单', () => {
    expect(hasReuse(make())).toBe(true);
    expect(
      hasReuse(
        make({
          reuse: {
            links: [],
            usageGuide: '',
            checklist: [],
            retrospective: '',
            templateSnippet: '',
          },
        }),
      ),
    ).toBe(false);

    const summary = reuseSummary(make());
    expect(summary).toContain('关键链接 1 个');
    expect(summary).toContain('使用说明');
    expect(summary).toContain('交付清单 3 项');
    expect(summary).toContain('复盘笔记');
    expect(summary).toContain('模板片段');
  });

  it('reuseFilename：标题清洗为安全文件名，含日期', () => {
    const name = reuseFilename(make(), new Date('2026-08-13T00:00:00.000Z'));
    // 中文字符保留、非法文件名字符替换为连字符
    expect(name).toMatch(/^reuse-[\w\u4e00-\u9fa5-]+-2026-08-13\.json$/);
    expect(name).not.toMatch(/[\\/:*?"<>|]/);
    expect(
      reuseFilename(make({ id: 'x', title: '  ' }), new Date('2026-08-13T00:00:00.000Z')),
    ).toContain('reuse-x-');
  });

  it('buildReuseMarkdown：完整复用包渲染为可读 Markdown，内容与元信息齐全', () => {
    const md = buildReuseMarkdown(make());
    expect(md).toContain('# 复用包：每日审查流水线');
    expect(md).toContain('- 类型：workflow');
    expect(md).toContain('- 完成日期：2026-05-20');
    expect(md).toContain('## 关键链接');
    expect(md).toContain('[使用文档](https://example.com/docs)');
    expect(md).toContain('## 使用说明');
    expect(md).toContain('导入 JSON 后替换 API Key。');
    expect(md).toContain('## 交付清单');
    expect(md).toContain('- [ ] 导入 JSON');
    expect(md).toContain('- [ ] 试运行');
    expect(md).toContain('## 复盘笔记');
    expect(md).toContain('条件分支表达最直观。');
    expect(md).toContain('## 模板片段');
    expect(md).toContain('```');
    expect(md).toContain('trigger: cron "0 9 * * 1-5"');
  });

  it('buildReuseMarkdown：空字段不输出对应小节，无复用内容时仅头部', () => {
    const md = buildReuseMarkdown(
      make({
        reuse: {
          links: [],
          usageGuide: '',
          checklist: [],
          retrospective: '',
          templateSnippet: '',
        },
      }),
    );
    expect(md).toContain('# 复用包：每日审查流水线');
    expect(md).not.toContain('## ');
    expect(md).toMatch(/\n$/);
  });

  it('reuseMarkdownFilename：与 JSON 同名同清洗，扩展名为 .md', () => {
    const name = reuseMarkdownFilename(make(), new Date('2026-08-13T00:00:00.000Z'));
    expect(name).toMatch(/^reuse-[\w\u4e00-\u9fa5-]+-2026-08-13\.md$/);
    expect(name).not.toMatch(/[\\/:*?"<>|]/);
  });
});

describe('achievement reuse（抽屉复用包区块）', () => {
  let wrapper: ReturnType<typeof mount> | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
  });

  it('渲染复用包：关键链接安全打开、交付清单可勾选、模板片段可复制', async () => {
    wrapper = mount(AchievementDrawer, { props: { item: make() } });
    await nextTick();
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('复用包');
    expect(dialog.textContent).toContain('使用文档');
    expect(dialog.textContent).toContain('导入 JSON 后替换 API Key。');

    // 外链安全属性
    const link = dialog.querySelector('a') as HTMLAnchorElement;
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');

    // 交付清单勾选：勾选后条目加删除线样式
    const checkbox = dialog.querySelector('input[type="checkbox"]') as HTMLInputElement;
    const labelSpan = checkbox.closest('li')!.querySelector('span')!;
    expect(labelSpan.classList.contains('line-through')).toBe(false);
    checkbox.click();
    await nextTick();
    expect(labelSpan.classList.contains('line-through')).toBe(true);
  });

  it('导出按钮：导出 JSON / 导出 Markdown / 复制 分别派发事件或写剪贴板', async () => {
    wrapper = mount(AchievementDrawer, { props: { item: make() } });
    await nextTick();
    const dialog = document.body.querySelector('[role="dialog"]')!;
    const buttons = Array.from(dialog.querySelectorAll('button'));
    const text = (b: Element) => b.textContent ?? '';

    (buttons.find((b) => text(b).includes('导出 JSON')) as HTMLButtonElement).click();
    expect(wrapper.emitted('export-reuse')![0]![0]).toMatchObject({ id: 'reuse-1' });

    (buttons.find((b) => text(b).includes('导出 Markdown')) as HTMLButtonElement).click();
    expect(wrapper.emitted('export-reuse-md')![0]![0]).toMatchObject({ id: 'reuse-1' });

    (buttons.find((b) => text(b).includes('导出单项')) as HTMLButtonElement).click();
    expect(wrapper.emitted('export')![0]![0]).toMatchObject({ id: 'reuse-1' });
  });

  it('复制按钮：点击复制整包 Markdown（剪贴板不可用时降级提示不崩溃）', async () => {
    wrapper = mount(AchievementDrawer, { props: { item: make() } });
    await nextTick();
    const dialog = document.body.querySelector('[role="dialog"]')!;
    const buttons = Array.from(dialog.querySelectorAll('button'));
    const text = (b: Element) => b.textContent ?? '';
    const copyBtn = buttons.find((b) => text(b).trim() === '复制') as HTMLButtonElement;
    expect(copyBtn).toBeTruthy();

    const write = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: write } });
    copyBtn.click();
    await nextTick();
    expect(write).toHaveBeenCalledTimes(1);
    const copied = write.mock.calls[0]![0] as string;
    expect(copied).toContain('# 复用包：每日审查流水线');
    expect(copied).toContain('## 交付清单');
  });

  it('无复用内容时不渲染复用包区块', async () => {
    wrapper = mount(AchievementDrawer, {
      props: {
        item: make({
          reuse: {
            links: [],
            usageGuide: '',
            checklist: [],
            retrospective: '',
            templateSnippet: '',
          },
        }),
      },
    });
    await nextTick();
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).not.toContain('复用包');
  });
});
