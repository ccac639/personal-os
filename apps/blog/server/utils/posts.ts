/**
 * 文件型文章内容源与统一数据访问层。
 *
 * 当前实现：构建期/启动期扫描 `content/posts/*.md`，解析 frontmatter 并渲染
 * body 为 HTML。接口（PostsStore）即未来切换到后端 articles API 的替换点——
 * 页面只通过 composables/usePosts 调用，不感知实现。
 *
 * 约定：
 * - slug 由文件名派生，必须是 `[a-z0-9]+(-[a-z0-9]+)*`；
 * - draft 文章：dev 下详情可见（便于预览），列表/标签/分类聚合在任何模式下
 *   都排除，sitemap/RSS 由各自路由自行排除；
 * - 内容目录变化（新增/删除/修改文件）会在下次请求时自动重扫，dev 下即改即生效。
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import type { AdjacentPost, BlogPost, BlogPostMeta, PostGroupCount } from '../../types/post';
import { estimateReadingMinutes, renderMarkdown } from './markdown';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** frontmatter 解析结果（值未校验前的原始形态）。 */
interface RawMeta {
  slug?: unknown;
  title?: unknown;
  description?: unknown;
  date?: unknown;
  updated?: unknown;
  tags?: unknown;
  category?: unknown;
  draft?: unknown;
}

/** 解析后的文章记录（draft 也保留，查询时过滤）。 */
interface ParsedPost {
  meta: BlogPostMeta;
  body: string;
}

function parseScalar(value: string): string | boolean {
  const trimmed = value.trim();
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  return trimmed.replace(/^["']|["']$/g, '');
}

function parseTagsLine(value: string): string[] {
  const inner = value.trim().replace(/^\[|\]$/g, '');
  if (inner === '') {
    return [];
  }
  return inner
    .split(',')
    .map((t) => t.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

function parseFrontmatter(raw: string, file: string): { meta: RawMeta; body: string } {
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') {
    throw new Error(`[posts] ${file}: 缺少 frontmatter（文件必须以 --- 开头）`);
  }
  let endIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]!.trim() === '---') {
      endIndex = i;
      break;
    }
  }
  if (endIndex < 0) {
    throw new Error(`[posts] ${file}: frontmatter 未闭合（缺少结束 --- 标记）`);
  }

  const meta: RawMeta = {};
  const fmLines = lines.slice(1, endIndex);
  let i = 0;
  while (i < fmLines.length) {
    const line = fmLines[i]!;
    const match = /^([A-Za-z]+):(.*)$/.exec(line);
    if (!match) {
      i += 1;
      continue;
    }
    const key = match[1]!;
    const rest = match[2]!.trim();
    if (key === 'tags' && rest === '') {
      // 多行列表形态：
      //   tags:
      //     - a
      //     - b
      const items: string[] = [];
      i += 1;
      while (i < fmLines.length && /^\s+-\s+/.test(fmLines[i]!)) {
        items.push(
          fmLines[i]!.trim()
            .replace(/^-\s+/, '')
            .replace(/^["']|["']$/g, ''),
        );
        i += 1;
      }
      meta.tags = items;
      continue;
    }
    if (rest === '') {
      i += 1;
      continue;
    }
    if (key === 'tags') {
      meta.tags = parseTagsLine(rest);
    } else {
      (meta as Record<string, unknown>)[key] = parseScalar(rest);
    }
    i += 1;
  }

  const body = lines
    .slice(endIndex + 1)
    .join('\n')
    .replace(/^\n+/, '');
  return { meta, body };
}

function requireString(meta: RawMeta, key: keyof RawMeta, file: string, label: string): string {
  const value = meta[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`[posts] ${file}: frontmatter 缺少必填字段 ${label}`);
  }
  return value.trim();
}

function validateDate(value: string, file: string, label: string): string {
  if (!DATE_RE.test(value)) {
    throw new Error(
      `[posts] ${file}: frontmatter 字段 ${label} 格式错误（应为 YYYY-MM-DD，实际: ${value}）`,
    );
  }
  return value;
}

function parsePost(raw: string, file: string): ParsedPost {
  const { meta, body } = parseFrontmatter(raw, file);
  const title = requireString(meta, 'title', file, 'title');
  const description = requireString(meta, 'description', file, 'description');
  const date = validateDate(requireString(meta, 'date', file, 'date'), file, 'date');
  const category = requireString(meta, 'category', file, 'category');

  // slug 可选覆盖：默认取文件名；显式声明时便于文件重命名而不破坏外链。
  const slugOverride = meta.slug;
  let slug = file.slice(0, -3);
  if (slugOverride !== undefined) {
    if (typeof slugOverride !== 'string' || !SLUG_RE.test(slugOverride)) {
      throw new Error(
        `[posts] ${file}: frontmatter 字段 slug 非法（须匹配 ${SLUG_RE.source}，实际: ${String(slugOverride)}）`,
      );
    }
    slug = slugOverride;
  }

  const updatedRaw = meta.updated;
  const updated =
    typeof updatedRaw === 'string' && updatedRaw.trim() !== ''
      ? validateDate(updatedRaw.trim(), file, 'updated')
      : undefined;

  const draft = meta.draft === undefined ? false : meta.draft;
  if (typeof draft !== 'boolean') {
    throw new Error(
      `[posts] ${file}: frontmatter 字段 draft 应为 true/false（实际: ${String(meta.draft)}）`,
    );
  }

  const tags = meta.tags;
  if (
    !Array.isArray(tags) ||
    tags.length === 0 ||
    tags.some((t) => typeof t !== 'string' || t.trim() === '')
  ) {
    throw new Error(`[posts] ${file}: frontmatter 缺少必填字段 tags（非空数组）`);
  }
  const normalizedTags = [...new Set((tags as string[]).map((t) => t.trim()))];

  const rendered = renderMarkdown(body);
  const readingMinutes = estimateReadingMinutes(body);

  return {
    meta: {
      slug,
      title,
      description,
      date,
      updated,
      tags: normalizedTags,
      category,
      draft,
      readingMinutes,
    },
    body: rendered,
  };
}

export interface PostsStore {
  /** 全部非 draft 文章，按 date 倒序（同日按 slug 升序）。 */
  listPosts(): BlogPostMeta[];
  /** 文章详情；未知 slug 返回 null；draft 在非 dev 环境返回 null。 */
  getPost(slug: string): BlogPost | null;
  /** 标签聚合（仅非 draft），按文章数倒序、同数按名称升序。 */
  listTags(): PostGroupCount[];
  listPostsByTag(tag: string): BlogPostMeta[];
  listCategories(): PostGroupCount[];
  listPostsByCategory(category: string): BlogPostMeta[];
  /** 上一篇（较新）/ 下一篇（较旧），仅在非 draft 序列中查找。 */
  getAdjacentPosts(slug: string): { prev: AdjacentPost | null; next: AdjacentPost | null };
}

interface CacheState {
  /** 文件名 -> mtimeMs，内容变更可触发重扫（目录 mtime 不随内容修改变化）。 */
  files: Record<string, number>;
  posts: ParsedPost[];
}

export function createPostsStore(contentDir: string, options: { dev?: boolean } = {}): PostsStore {
  const isDev = options.dev ?? import.meta.dev;
  let cache: CacheState | null = null;

  const scan = (): ParsedPost[] => {
    let files: string[];
    try {
      files = readdirSync(contentDir)
        .filter((f) => f.endsWith('.md'))
        .sort();
    } catch (error) {
      throw new Error(`[posts] 内容目录不可读: ${contentDir}（${(error as Error).message}）`);
    }
    const fingerprint: Record<string, number> = {};
    for (const file of files) {
      fingerprint[file] = statSync(resolve(contentDir, file)).mtimeMs;
    }
    if (cache) {
      const same =
        files.length === Object.keys(cache.files).length &&
        files.every((f) => cache?.files[f] === fingerprint[f]);
      if (same) {
        return cache.posts;
      }
    }

    const posts = files.map((file) => {
      if (!SLUG_RE.test(file.slice(0, -3))) {
        throw new Error(`[posts] ${file}: 文件名不是合法 slug（须匹配 ${SLUG_RE.source}）`);
      }
      return parsePost(readFileSync(resolve(contentDir, file), 'utf8'), file);
    });

    // slug 冲突检测放在解析后：frontmatter 的 slug 覆盖可能与文件名冲突
    const seen = new Map<string, string>();
    posts.forEach((post, idx) => {
      const file = files[idx]!;
      const owner = seen.get(post.meta.slug);
      if (owner) {
        throw new Error(`[posts] slug 冲突: ${owner} 与 ${file} 都解析为 "${post.meta.slug}"`);
      }
      seen.set(post.meta.slug, file);
    });

    cache = { files: fingerprint, posts };
    return posts;
  };

  const published = (): ParsedPost[] => scan().filter((p) => !p.meta.draft);

  const sortedPublished = (): ParsedPost[] =>
    published().sort((a, b) => {
      const byDate = b.meta.date.localeCompare(a.meta.date);
      return byDate !== 0 ? byDate : a.meta.slug.localeCompare(b.meta.slug);
    });

  const toMeta = (p: ParsedPost): BlogPostMeta => p.meta;

  return {
    listPosts: () => sortedPublished().map(toMeta),

    getPost: (slug) => {
      const post = scan().find((p) => p.meta.slug === slug);
      if (!post) {
        return null;
      }
      if (post.meta.draft && !isDev) {
        return null;
      }
      return { ...post.meta, body: post.body };
    },

    listTags: () => {
      const counts = new Map<string, number>();
      for (const post of published()) {
        for (const tag of post.meta.tags) {
          counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
      }
      return [...counts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'));
    },

    listPostsByTag: (tag) =>
      sortedPublished()
        .filter((p) => p.meta.tags.includes(tag))
        .map(toMeta),

    listCategories: () => {
      const counts = new Map<string, number>();
      for (const post of published()) {
        counts.set(post.meta.category, (counts.get(post.meta.category) ?? 0) + 1);
      }
      return [...counts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'));
    },

    listPostsByCategory: (category) =>
      sortedPublished()
        .filter((p) => p.meta.category === category)
        .map(toMeta),

    getAdjacentPosts: (slug) => {
      const ordered = sortedPublished();
      const index = ordered.findIndex((p) => p.meta.slug === slug);
      if (index < 0) {
        return { prev: null, next: null };
      }
      const prev = ordered[index - 1]
        ? { slug: ordered[index - 1]!.meta.slug, title: ordered[index - 1]!.meta.title }
        : null;
      const next = ordered[index + 1]
        ? { slug: ordered[index + 1]!.meta.slug, title: ordered[index + 1]!.meta.title }
        : null;
      return { prev, next };
    },
  };
}

/**
 * 默认实例：内容目录相对应用根目录（dev/build/preview 的 cwd 均为 apps/blog）。
 * 测试用 createPostsStore 注入临时目录，避免触碰真实内容。
 */
export const postsStore: PostsStore = createPostsStore(resolve(process.cwd(), 'content/posts'));
