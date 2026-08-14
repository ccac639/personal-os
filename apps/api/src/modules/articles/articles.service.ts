/**
 * articles 服务：只读镜像 Blog 内容层。
 *
 * 数据源为 `apps/blog/content/posts/*.md`（monorepo 内稳定相对路径），
 * 解析语义与 blog 的 posts.ts 对齐（slug 唯一 / draft 排除 / date 倒序 /
 * tags 去重 / 相邻导航），mtime 指纹缓存——内容变更下次请求自动重扫。
 *
 * 为什么自实现而非 import blog 代码：
 * api 的 tsconfig（rootDir=src）不允许跨 app 导入；语义对齐 + 独立实现
 * 也让未来切换数据库实现时只改本文件。
 */
import { Injectable } from '@nestjs/common';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  AdjacentArticle,
  ArticleDetail,
  ArticleGroupCount,
  ArticleMeta,
  PaginatedArticles,
} from './articles.schema.js';

/** Blog 内容目录：相对 monorepo 根（apps/api 运行 cwd 为 apps/api）。 */
const BLOG_CONTENT_DIR = resolve(process.cwd(), '../blog/content/posts');

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 解析后的文章记录（draft 也保留，查询时过滤）。 */
interface ParsedArticle {
  meta: ArticleMeta;
  body: string;
}

interface CacheState {
  files: Record<string, number>;
  articles: ParsedArticle[];
}

function parseScalar(value: string): string | boolean {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  return trimmed.replace(/^["']|["']$/g, '');
}

function parseTagsLine(value: string): string[] {
  const inner = value.trim().replace(/^\[|\]$/g, '');
  if (inner === '') return [];
  return inner
    .split(',')
    .map((t) => t.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

/** 解析 frontmatter（title/description/date/updated/tags/category/draft）。 */
function parseFrontmatter(
  raw: string,
  file: string,
): { meta: Record<string, unknown>; body: string } {
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') {
    throw new Error(`[articles] ${file}: 缺少 frontmatter（文件必须以 --- 开头）`);
  }
  let endIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.trim() === '---') {
      endIndex = i;
      break;
    }
  }
  if (endIndex < 0) {
    throw new Error(`[articles] ${file}: frontmatter 未闭合（缺少结束 --- 标记）`);
  }

  const meta: Record<string, unknown> = {};
  const fmLines = lines.slice(1, endIndex);
  let i = 0;
  while (i < fmLines.length) {
    const line = fmLines[i];
    if (!line) {
      i += 1;
      continue;
    }
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
      while (i < fmLines.length && /^\s+-\s+/.test(fmLines[i] ?? '')) {
        items.push(
          (fmLines[i] ?? '')
            .trim()
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
      meta[key] = parseScalar(rest);
    }
    i += 1;
  }

  const body = lines
    .slice(endIndex + 1)
    .join('\n')
    .replace(/^\n+/, '');
  return { meta, body };
}

function requireString(
  meta: Record<string, unknown>,
  key: string,
  file: string,
  label: string,
): string {
  const value = meta[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`[articles] ${file}: frontmatter 缺少必填字段 ${label}`);
  }
  return value;
}

/** 简化 Markdown 渲染：仅转义 HTML + 段落/标题/列表/代码块/引用/行内样式。 */
function renderMarkdown(source: string): string {
  const escape = (input: string): string =>
    input.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const escapeAttr = (input: string): string =>
    escape(input).replaceAll('"', '&quot;').replaceAll("'", '&#39;');

  const SAFE_URL_RE = /^(?:https?:|mailto:|\/|#)/i;
  const safeHref = (href: string): string | null =>
    SAFE_URL_RE.test(href.trim()) ? href.trim() : null;

  const renderInline = (text: string): string =>
    text
      .replace(/`([^`]+)`/g, (_m, code: string) => `<code>${escape(code)}</code>`)
      .replace(/\*\*([^*]+)\*\*/g, (_m, bold: string) => `<strong>${escape(bold)}</strong>`)
      .replace(/\*([^*]+)\*/g, (_m, italic: string) => `<em>${escape(italic)}</em>`)
      .replace(/!\[([^\]]*)\]\(([^)]*)\)/g, (_m, alt: string, href: string) => {
        const safe = safeHref(href);
        return safe
          ? `<img src="${escapeAttr(safe)}" alt="${escapeAttr(alt)}" />`
          : `![${alt}](${href})`;
      })
      .replace(/\[([^\]]+)\]\(([^)]*)\)/g, (m, label: string, href: string) => {
        const safe = safeHref(href);
        return safe ? `<a href="${escapeAttr(safe)}">${escape(label)}</a>` : m;
      });

  const lines = source.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line) {
      out.push('<p></p>');
      i += 1;
      continue;
    }
    // 围栏代码块
    const fence = /^```(\w*)$/.exec(line);
    if (fence) {
      const lang = fence[1] ?? '';
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i] ?? '')) {
        code.push(escape(lines[i] ?? ''));
        i += 1;
      }
      i += 1; // 跳过结束围栏
      out.push(
        `<pre><code${lang ? ` class="language-${escapeAttr(lang)}"` : ''}>${code.join('\n')}</code></pre>`,
      );
      continue;
    }
    // 标题（整体降一级：h1 → h2，避免与页面标题冲突）
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(heading[1]!.length + 1, 6);
      out.push(`<h${level}>${renderInline(heading[2]!)}</h${level}>`);
      i += 1;
      continue;
    }
    // 引用块
    if (line.startsWith('> ')) {
      const quote: string[] = [];
      while (i < lines.length && (lines[i] ?? '').startsWith('> ')) {
        quote.push(renderInline((lines[i] ?? '').slice(2)));
        i += 1;
      }
      out.push(`<blockquote><p>${quote.join('<br />')}</p></blockquote>`);
      continue;
    }
    // 无序列表（支持一级缩进嵌套）
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i] ?? '')) {
        items.push(`<li>${renderInline((lines[i] ?? '').replace(/^\s*[-*]\s+/, ''))}</li>`);
        i += 1;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    // 有序列表
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? '')) {
        items.push(`<li>${renderInline((lines[i] ?? '').replace(/^\s*\d+\.\s+/, ''))}</li>`);
        i += 1;
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }
    // 分隔线
    if (/^\s*(?:-{3,}|\*{3,})\s*$/.test(line)) {
      out.push('<hr />');
      i += 1;
      continue;
    }
    // 段落（合并软换行）
    const para: string[] = [line];
    i += 1;
    while (i < lines.length && (lines[i] ?? '').trim() !== '') {
      para.push(lines[i] ?? '');
      i += 1;
    }
    out.push(`<p>${renderInline(para.join(' '))}</p>`);
    i += 1;
  }
  return out.join('\n');
}

/** 估算阅读时长：按 400 字/分钟粗略估算。 */
function estimateReadingMinutes(source: string): number {
  const chinese = (source.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const words = (source.match(/[a-zA-Z0-9]+/g) ?? []).length;
  return Math.max(1, Math.ceil((chinese + words) / 400));
}

/** 解析单篇 Markdown 文件为 ParsedArticle。 */
function parseArticle(file: string): ParsedArticle {
  if (!SLUG_RE.test(file.slice(0, -3))) {
    throw new Error(`[articles] ${file}: 文件名不是合法 slug（须匹配 ${SLUG_RE.source}）`);
  }
  const raw = readFileSync(resolve(BLOG_CONTENT_DIR, file), 'utf8');
  const { meta, body } = parseFrontmatter(raw, file);

  // slug 由文件名派生（与 blog posts.ts 一致）；frontmatter 的 slug 可选覆盖
  const slug =
    typeof meta.slug === 'string' && meta.slug.trim() !== '' ? meta.slug.trim() : file.slice(0, -3);
  const title = requireString(meta, 'title', file, 'title');
  const description = requireString(meta, 'description', file, 'description');
  const date = requireString(meta, 'date', file, 'date');
  if (!DATE_RE.test(date)) {
    throw new Error(`[articles] ${file}: frontmatter date 格式错误（须 YYYY-MM-DD）`);
  }
  const updated = typeof meta.updated === 'string' ? meta.updated : undefined;
  if (updated !== undefined && !DATE_RE.test(updated)) {
    throw new Error(`[articles] ${file}: frontmatter updated 格式错误（须 YYYY-MM-DD）`);
  }
  const tags = meta.tags;
  if (
    !Array.isArray(tags) ||
    tags.length === 0 ||
    tags.some((t) => typeof t !== 'string' || t.trim() === '')
  ) {
    throw new Error(`[articles] ${file}: frontmatter 缺少必填字段 tags（非空数组）`);
  }
  const category = requireString(meta, 'category', file, 'category');
  const draft = meta.draft === true;
  const normalizedTags = [...new Set((tags as string[]).map((t) => t.trim()))];

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
      readingMinutes: estimateReadingMinutes(body),
    },
    body: renderMarkdown(body),
  };
}

@Injectable()
export class ArticlesService {
  private cache: CacheState | null = null;

  /** 扫描内容目录，mtime 指纹变化时重扫。 */
  private scan(): ParsedArticle[] {
    const files = readdirSync(BLOG_CONTENT_DIR)
      .filter((f) => f.endsWith('.md'))
      .sort();

    const fingerprint: Record<string, number> = {};
    for (const file of files) {
      fingerprint[file] = statSync(resolve(BLOG_CONTENT_DIR, file)).mtimeMs;
    }

    if (this.cache) {
      const same =
        files.length === Object.keys(this.cache.files).length &&
        files.every((f) => this.cache?.files[f] === fingerprint[f]);
      if (same) {
        return this.cache.articles;
      }
    }

    const articles = files.map((file) => parseArticle(file));
    // slug 冲突检测（frontmatter 的 slug 覆盖可能与文件名冲突）
    const seen = new Map<string, string>();
    articles.forEach((article, idx) => {
      const file = files[idx] ?? '';
      const owner = seen.get(article.meta.slug);
      if (owner) {
        throw new Error(
          `[articles] slug 冲突: ${owner} 与 ${file} 都解析为 "${article.meta.slug}"`,
        );
      }
      seen.set(article.meta.slug, file);
    });

    this.cache = { files: fingerprint, articles };
    return articles;
  }

  private published(): ParsedArticle[] {
    return this.scan().filter((a) => !a.meta.draft);
  }

  private sortedPublished(): ParsedArticle[] {
    return this.published().sort((a, b) => {
      const byDate = b.meta.date.localeCompare(a.meta.date);
      return byDate !== 0 ? byDate : a.meta.slug.localeCompare(b.meta.slug);
    });
  }

  /** 分页列表（非 draft，按 date 倒序）。 */
  list(query: { page?: number; pageSize?: number }): PaginatedArticles {
    const page = Math.max(1, Math.floor(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(query.pageSize ?? 20)));
    const all = this.sortedPublished();
    const start = (page - 1) * pageSize;
    return {
      items: all.slice(start, start + pageSize).map((a) => a.meta),
      total: all.length,
      page,
      pageSize,
    };
  }

  /** 文章详情（含相邻导航）；未知 slug / draft 返回 null。 */
  getDetail(slug: string): ArticleDetail | null {
    const all = this.sortedPublished();
    const idx = all.findIndex((a) => a.meta.slug === slug);
    if (idx < 0) return null;
    const current = all[idx];
    const prevArticle = idx > 0 ? all[idx - 1] : undefined;
    const nextArticle = idx < all.length - 1 ? all[idx + 1] : undefined;
    if (!current) return null;
    return {
      article: { ...current.meta, body: current.body },
      prev: prevArticle ? toAdjacent(prevArticle) : null,
      next: nextArticle ? toAdjacent(nextArticle) : null,
    };
  }

  /** 标签聚合（仅非 draft），按文章数倒序、同数按名称升序。 */
  listTags(): ArticleGroupCount[] {
    const counts = new Map<string, number>();
    for (const article of this.published()) {
      for (const tag of article.meta.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  listPostsByTag(tag: string): ArticleMeta[] {
    return this.published()
      .filter((a) => a.meta.tags.includes(tag))
      .sort((a, b) => b.meta.date.localeCompare(a.meta.date))
      .map((a) => a.meta);
  }

  /** 分类聚合（仅非 draft），按文章数倒序。 */
  listCategories(): ArticleGroupCount[] {
    const counts = new Map<string, number>();
    for (const article of this.published()) {
      const cat = article.meta.category;
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  listPostsByCategory(category: string): ArticleMeta[] {
    return this.published()
      .filter((a) => a.meta.category === category)
      .sort((a, b) => b.meta.date.localeCompare(a.meta.date))
      .map((a) => a.meta);
  }
}

function toAdjacent(a: ParsedArticle): AdjacentArticle {
  return { slug: a.meta.slug, title: a.meta.title };
}
