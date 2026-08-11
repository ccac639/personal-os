/** 博客文章基础类型 */
export interface Article {
  id: string;
  slug: string;
  title: string;
  summary?: string;
  content: string;
  coverImage?: string;
  status: ArticleStatus;
  tags: string[];
  categoryId?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type ArticleStatus = 'draft' | 'published' | 'archived';

export interface ArticleCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

export interface ArticleTag {
  id: string;
  name: string;
  slug: string;
}
