import type { AdjacentPost, BlogPost, BlogPostMeta, PostGroupCount } from '~/types/post';

/**
 * 数据访问层替换点（客户端侧）。
 *
 * 当前实现指向本应用的文件型 API（server/api/**）；未来切换到后端
 * articles API 时，只需修改 BASE 与路径映射，页面代码零改动。
 * 接口契约与 server/utils/posts.ts 的 PostsStore 一一对应。
 */
const BASE = '/api';

/** 文章列表（非 draft，按 date 倒序）。 */
export function usePostList() {
  return useFetch<BlogPostMeta[]>(`${BASE}/posts`, {
    key: 'blog:posts',
    getCachedData: (key) => useNuxtData(key).data.value as BlogPostMeta[] | undefined,
  });
}

/** 文章详情响应：正文 + 相邻导航；未知 slug 由 API 返回 404。 */
export interface PostDetailPayload {
  post: BlogPost;
  prev: AdjacentPost | null;
  next: AdjacentPost | null;
}

/** 文章详情；未知 slug 的请求由服务端 404 拦截（页面负责兜底）。 */
export function usePostDetail(slug: string) {
  return useFetch<PostDetailPayload>(`${BASE}/posts/${slug}`, {
    key: `blog:post:${slug}`,
    getCachedData: (key) => useNuxtData(key).data.value as PostDetailPayload | undefined,
  });
}

/** 标签聚合（含文章数）。 */
export function useTagList() {
  return useFetch<PostGroupCount[]>(`${BASE}/tags`, {
    key: 'blog:tags',
    getCachedData: (key) => useNuxtData(key).data.value as PostGroupCount[] | undefined,
  });
}

export function usePostsByTag(tag: string) {
  return useFetch<BlogPostMeta[]>(`${BASE}/tags/${encodeURIComponent(tag)}`, {
    key: `blog:tag:${tag}`,
    getCachedData: (key) => useNuxtData(key).data.value as BlogPostMeta[] | undefined,
  });
}

export function usePostsByCategory(category: string) {
  return useFetch<BlogPostMeta[]>(`${BASE}/categories/${encodeURIComponent(category)}`, {
    key: `blog:category:${category}`,
    getCachedData: (key) => useNuxtData(key).data.value as BlogPostMeta[] | undefined,
  });
}
