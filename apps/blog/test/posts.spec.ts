import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPostsStore, type PostsStore } from '../server/utils/posts';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'blog-posts-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** 写入一篇 frontmatter 为键值对/数组形态的文章。 */
function writePost(slug: string, fm: Record<string, unknown>, body = '正文内容'): void {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fm)) {
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.join(', ')}]`);
    } else {
      lines.push(`${key}: ${String(value)}`);
    }
  }
  lines.push('---', '', body);
  writeFileSync(join(dir, `${slug}.md`), lines.join('\n'));
}

function makeStore(dev = false): PostsStore {
  return createPostsStore(dir, { dev });
}

describe('posts 数据访问层', () => {
  it('列表按 date 倒序并排除 draft', () => {
    writePost('older', {
      title: '旧文',
      description: 'd',
      date: '2026-01-01',
      tags: ['a'],
      category: 'x',
    });
    writePost('newer', {
      title: '新文',
      description: 'd',
      date: '2026-06-01',
      tags: ['a'],
      category: 'x',
    });
    writePost('draft-post', {
      title: '草稿',
      description: 'd',
      date: '2026-07-01',
      tags: ['a'],
      category: 'x',
      draft: true,
    });

    const store = makeStore();
    const slugs = store.listPosts().map((p) => p.slug);
    expect(slugs).toEqual(['newer', 'older']);
  });

  it('getPost 返回渲染后的 HTML 与元数据', () => {
    writePost(
      'detail',
      {
        title: '详情页',
        description: '摘要',
        date: '2026-02-02',
        updated: '2026-03-03',
        tags: ['a', 'b'],
        category: '技术',
      },
      '# 标题\n\n**加粗**',
    );

    const post = makeStore().getPost('detail');
    expect(post).not.toBeNull();
    expect(post!.title).toBe('详情页');
    expect(post!.tags).toEqual(['a', 'b']);
    expect(post!.category).toBe('技术');
    expect(post!.updated).toBe('2026-03-03');
    expect(post!.readingMinutes).toBeGreaterThanOrEqual(1);
    expect(post!.body).toContain('<h2 id="标题">标题</h2>');
    expect(post!.headings).toEqual([{ id: '标题', text: '标题', level: 2 }]);
    expect(post!.body).toContain('<strong>加粗</strong>');
  });

  it('未知 slug 返回 null', () => {
    writePost('known', {
      title: '已知',
      description: 'd',
      date: '2026-01-01',
      tags: ['a'],
      category: 'x',
    });
    expect(makeStore().getPost('missing')).toBeNull();
  });

  it('draft：非 dev 不可见，dev 可见', () => {
    writePost('draft-post', {
      title: '草稿',
      description: 'd',
      date: '2026-01-01',
      tags: ['a'],
      category: 'x',
      draft: true,
    });
    expect(makeStore(false).getPost('draft-post')).toBeNull();
    expect(makeStore(true).getPost('draft-post')?.title).toBe('草稿');
  });

  it('frontmatter 缺失时报错并带文件名', () => {
    writeFileSync(join(dir, 'no-fm.md'), '没有 frontmatter 的正文');
    expect(() => makeStore().listPosts()).toThrow(/no-fm\.md/);
  });

  it('必填字段缺失报错并指明字段', () => {
    writePost('missing-title', {
      description: 'd',
      date: '2026-01-01',
      tags: ['a'],
      category: 'x',
    });
    expect(() => makeStore().listPosts()).toThrow(/title/);
  });

  it('date 格式错误报错', () => {
    writePost('bad-date', {
      title: 't',
      description: 'd',
      date: '2026/01/01',
      tags: ['a'],
      category: 'x',
    });
    expect(() => makeStore().listPosts()).toThrow(/date/);
  });

  it('tags 空数组报错', () => {
    writePost('no-tags', {
      title: 't',
      description: 'd',
      date: '2026-01-01',
      tags: [],
      category: 'x',
    });
    expect(() => makeStore().listPosts()).toThrow(/tags/);
  });

  it('slug 冲突（frontmatter 覆盖）报错并列出两个文件名', () => {
    writePost('first', {
      slug: 'same',
      title: '甲',
      description: 'd',
      date: '2026-01-01',
      tags: ['a'],
      category: 'x',
    });
    writePost('second', {
      slug: 'same',
      title: '乙',
      description: 'd',
      date: '2026-01-02',
      tags: ['a'],
      category: 'x',
    });
    expect(() => makeStore().listPosts()).toThrow(/slug 冲突.*first.*second/s);
  });

  it('tags 支持多行列表形态', () => {
    const raw = [
      '---',
      'title: 多行标签',
      'description: d',
      'date: 2026-01-01',
      'category: x',
      'tags:',
      '  - 甲',
      '  - 乙',
      '---',
      '',
      '正文',
    ].join('\n');
    writeFileSync(join(dir, 'multi-tags.md'), raw);
    const post = makeStore().getPost('multi-tags');
    expect(post?.tags).toEqual(['甲', '乙']);
  });

  it('标签聚合按文章数倒序', () => {
    writePost('p1', {
      title: '一',
      description: 'd',
      date: '2026-01-01',
      tags: ['热门', '普通'],
      category: 'x',
    });
    writePost('p2', {
      title: '二',
      description: 'd',
      date: '2026-01-02',
      tags: ['热门'],
      category: 'x',
    });
    const tags = makeStore().listTags();
    expect(tags[0]).toEqual({ name: '热门', count: 2 });
    expect(tags).toContainEqual({ name: '普通', count: 1 });
  });

  it('分类聚合与按分类过滤', () => {
    writePost('p1', {
      title: '一',
      description: 'd',
      date: '2026-01-01',
      tags: ['a'],
      category: '技术',
    });
    writePost('p2', {
      title: '二',
      description: 'd',
      date: '2026-01-02',
      tags: ['a'],
      category: '技术',
    });
    writePost('p3', {
      title: '三',
      description: 'd',
      date: '2026-01-03',
      tags: ['a'],
      category: '随笔',
    });

    const store = makeStore();
    expect(store.listCategories()).toContainEqual({ name: '技术', count: 2 });
    expect(store.listPostsByCategory('技术').map((p) => p.slug)).toEqual(['p2', 'p1']);
  });

  it('按标签过滤', () => {
    writePost('p1', {
      title: '一',
      description: 'd',
      date: '2026-01-01',
      tags: ['a'],
      category: 'x',
    });
    writePost('p2', {
      title: '二',
      description: 'd',
      date: '2026-01-02',
      tags: ['a', 'b'],
      category: 'x',
    });
    expect(
      makeStore()
        .listPostsByTag('b')
        .map((p) => p.slug),
    ).toEqual(['p2']);
    expect(makeStore().listPostsByTag('不存在')).toEqual([]);
  });

  it('上一篇/下一篇导航（仅非 draft）', () => {
    writePost('old', {
      title: '旧',
      description: 'd',
      date: '2026-01-01',
      tags: ['a'],
      category: 'x',
    });
    writePost('mid', {
      title: '中',
      description: 'd',
      date: '2026-02-01',
      tags: ['a'],
      category: 'x',
    });
    writePost('new', {
      title: '新',
      description: 'd',
      date: '2026-03-01',
      tags: ['a'],
      category: 'x',
    });
    writePost('draft-post', {
      title: '草稿',
      description: 'd',
      date: '2026-04-01',
      tags: ['a'],
      category: 'x',
      draft: true,
    });

    const { prev, next } = makeStore().getAdjacentPosts('mid');
    expect(prev).toEqual({ slug: 'new', title: '新' });
    expect(next).toEqual({ slug: 'old', title: '旧' });
  });

  it('内容文件修改后自动重扫', () => {
    writePost('editable', {
      title: '初版',
      description: 'd',
      date: '2026-01-01',
      tags: ['a'],
      category: 'x',
    });
    const store = makeStore();
    expect(store.getPost('editable')?.title).toBe('初版');

    // 改写内容并把 mtime 拨快，模拟文件被编辑
    writePost('editable', {
      title: '修订版',
      description: 'd',
      date: '2026-01-01',
      tags: ['a'],
      category: 'x',
    });
    const file = join(dir, 'editable.md');
    const future = new Date(Date.now() + 10_000);
    utimesSync(file, future, future);

    expect(store.getPost('editable')?.title).toBe('修订版');
  });

  it('内容目录不存在时报清晰错误', () => {
    const store = createPostsStore(join(dir, 'nope'), { dev: false });
    expect(() => store.listPosts()).toThrow(/内容目录/);
  });
});
