---
title: Nuxt 4 文件型博客的 SEO 全链路清单
description: 示例文章：sitemap、robots、OG、Schema.org 与 RSS 在 Nuxt 4 下的接入要点。
date: 2026-08-05
updated: 2026-08-10
tags: [nuxt, seo, ssr]
category: 技术
---

> 本文为示例文章，记录 @nuxtjs/seo 在 `srcDir: '.'` 定制下的实际行为。

## 模块分工

`@nuxtjs/seo` 是技术 SEO 的组合包，各能力来自独立模块：

- `@nuxtjs/sitemap`：sitemap.xml，静态路由自动收录，动态路由需注册 source
- `@nuxtjs/robots`：robots.txt，自动追加 `Sitemap:` 指向
- `nuxt-schema-org`：JSON-LD，`defineArticle` 可输出 `BlogPosting`
- `nuxt-seo-utils`：`useSeoMeta` 统一管理 OG / Twitter / canonical

## 动态路由的 Sitemap 接入

sitemap 模块默认只收录无参数路由（`[slug]` 这类会被过滤）。做法：

```ts
// nuxt.config.ts
sitemap: {
  sources: ['/api/__sitemap__/blog'],
}
```

```ts
// server/api/__sitemap__/blog.ts
export default defineSitemapEventHandler(() => {
  return [{ loc: '/posts/hello-personal-os' }];
});
```

## RSS 的实现路径

`@nuxtjs/seo` 不含 RSS 能力，用 Nitro 路由手写 `/rss.xml`：

- 输出最新 20 篇非 draft 文章
- 链接一律以 `useSiteConfig().url` 派生，随 `BLOG_URL` 环境变量变化
- `pubDate` 用 RFC 822 格式

## 验证清单

1. `build` 后 `/sitemap.xml`、`/rss.xml`、`/robots.txt` 可访问
2. 文章页 HTML 含 `og:*` 与 `BlogPosting` JSON-LD
3. 改 `BLOG_URL` 后 sitemap / RSS / canonical 同步变化

> 想快速上手 Tailwind v4 的样式体系？见 [Tailwind v4 设计令牌笔记](/posts/tailwind-v4-design-tokens)。
