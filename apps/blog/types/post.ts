/**
 * 博客文章领域模型（server 与 client 共享）。
 *
 * 数据访问层的统一契约：未来切换到后端 articles API 时，
 * 页面只依赖这里的类型与 composables/usePosts 的接口，不感知实现。
 */

/** 文章列表项（不含正文，用于列表/标签/分类页与 RSS/Sitemap）。 */
export interface BlogPostMeta {
  /** URL slug，由文件名派生，`[a-z0-9]+(-[a-z0-9]+)*`。 */
  slug: string;
  title: string;
  /** 摘要，用于列表卡片与 meta description。 */
  description: string;
  /** 发布日期，`YYYY-MM-DD`。 */
  date: string;
  /** 最后更新日期，可选。 */
  updated?: string;
  tags: string[];
  category: string;
  /** draft 文章 dev 可见，build/SSR 直出不产出，不进 sitemap/RSS。 */
  draft: boolean;
  /** 预计阅读时长（分钟）。 */
  readingMinutes: number;
}

/** 文章详情（含渲染为 HTML 的正文）。 */
export interface BlogPost extends BlogPostMeta {
  /** 由 Markdown 渲染出的 HTML，服务端渲染，客户端不再处理。 */
  body: string;
  /** 正文标题结构（TOC 用；与 body 内标题 id 同规则）。 */
  headings?: { id: string; text: string; level: number }[];
}

/** 标签/分类聚合项。 */
export interface PostGroupCount {
  name: string;
  count: number;
}

/** 上一篇/下一篇导航项（仅相邻文章，不含 draft）。 */
export interface AdjacentPost {
  slug: string;
  title: string;
}

/** 文章详情响应：正文 + 相邻导航（详情页一次取齐，避免二次请求）。 */
export interface PostDetail {
  post: BlogPost;
  prev: AdjacentPost | null;
  next: AdjacentPost | null;
}
