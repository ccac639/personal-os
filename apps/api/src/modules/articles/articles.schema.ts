/**
 * articles 模块领域模型（只读镜像 Blog 内容层）。
 *
 * 与 apps/blog/types/post.ts 语义对齐（slug 唯一 / draft 排除 / 相邻导航），
 * 但不 import blog 代码：api 的 tsconfig rootDir=src 不允许跨 app 导入，
 * 本模块自实现同语义的文件型读取层，未来可无感切换为数据库实现。
 */

/** 文章列表项（不含正文）。 */
export interface ArticleMeta {
  slug: string;
  title: string;
  description: string;
  /** 发布日期 YYYY-MM-DD。 */
  date: string;
  /** 最后更新日期，可选。 */
  updated?: string;
  tags: string[];
  category: string;
  /** draft 文章默认不对外暴露。 */
  draft: boolean;
  /** 预计阅读时长（分钟）。 */
  readingMinutes: number;
}

/** 文章详情（含渲染为 HTML 的正文）。 */
export interface Article extends ArticleMeta {
  body: string;
}

/** 标签/分类聚合项。 */
export interface ArticleGroupCount {
  name: string;
  count: number;
}

/** 上一篇/下一篇导航项。 */
export interface AdjacentArticle {
  slug: string;
  title: string;
}

/** 文章详情响应（正文 + 相邻导航一次取齐）。 */
export interface ArticleDetail {
  article: Article;
  prev: AdjacentArticle | null;
  next: AdjacentArticle | null;
}

/** 列表查询（分页字段由平台 PageQueryDto 提供）。 */
export interface ArticleListQuery {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/** 列表响应（与平台分页信封 {items,total,page,pageSize} 对齐）。 */
export interface PaginatedArticles {
  items: ArticleMeta[];
  total: number;
  page: number;
  pageSize: number;
}
