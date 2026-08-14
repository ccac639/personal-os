/**
 * sitemap 动态 URL 数据源（供 @nuxtjs/sitemap 的 sources 拉取）。
 *
 * 用户自定义 server/routes/sitemap.xml.ts 会被模块自带 route 覆盖（已实测），
 * 正确接入方式是 nuxt.config 的 sitemap.sources 指向本 API；
 * 模块运行时 fetch 本端点，响应 JSON 数组/对象即可。
 * draft 文章已由 postsStore.listPosts() 排除；URL 以 site.url（BLOG_URL 可覆盖）为基。
 */
export default defineEventHandler((event) => {
  const store = getPostsStore();
  const origin = getSiteConfig(event).url.replace(/\/+$/, '');
  const abs = (path: string) => `${origin}${path}`;

  return {
    urls: [
      ...store.listPosts().map((p) => ({
        loc: abs(`/posts/${p.slug}`),
        lastmod: p.updated ?? p.date,
      })),
      ...store.listTags().map((t) => abs(`/tags/${encodeURIComponent(t.name)}`)),
      ...store.listCategories().map((c) => abs(`/categories/${encodeURIComponent(c.name)}`)),
    ],
  };
});
