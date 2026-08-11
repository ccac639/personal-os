# apps/blog 结构与约定

- `pages/` — 路由页面（首页、文章列表、文章详情、标签、分类、专题、项目、成果）
- `components/` — Nuxt 组件（后续阶段实现）
- `layouts/` — 布局（default.vue 已建）
- `server/` — Nitro Server Routes / API 代理（后续阶段实现）
- `assets/css/main.css` — Tailwind CSS v4 入口

SEO 能力由 @nuxtjs/seo 统一提供：robots.txt / sitemap.xml / OpenGraph /
Schema.org（JSON-LD）/ RSS feed。
