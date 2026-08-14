import { escapeHtml } from '../utils/markdown';

/**
 * /rss.xml：最新 20 篇非 draft 文章（RSS 2.0）。
 *
 * @nuxtjs/seo 组合包不内置 RSS 模块（已核实 5.3.12 dependencies），
 * 按分线文档 1.4 兜底方案手写 Nitro route；链接以 site.url（BLOG_URL 可覆盖）为基。
 */
export default defineEventHandler((event) => {
  const config = getSiteConfig(event);
  const origin = config.url.replace(/\/+$/, '');
  const posts = getPostsStore().listPosts().slice(0, 20);

  const items = posts
    .map((p) => {
      const url = `${origin}/posts/${p.slug}`;
      const pubDate = new Date(`${p.date}T00:00:00Z`).toUTCString();
      return [
        '    <item>',
        `      <title>${escapeHtml(p.title)}</title>`,
        `      <link>${escapeHtml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeHtml(url)}</guid>`,
        `      <description>${escapeHtml(p.description)}</description>`,
        `      <pubDate>${pubDate}</pubDate>`,
        '    </item>',
      ].join('\n');
    })
    .join('\n');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeHtml(config.name ?? 'Personal OS Blog')}</title>`,
    `    <link>${escapeHtml(origin)}</link>`,
    `    <description>${escapeHtml(config.description ?? '')}</description>`,
    `    <atom:link href="${escapeHtml(origin)}/rss.xml" rel="self" type="application/rss+xml" />`,
    `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
    items,
    '  </channel>',
    '</rss>',
  ].join('\n');

  setHeader(event, 'Content-Type', 'application/rss+xml; charset=utf-8');
  return xml;
});
