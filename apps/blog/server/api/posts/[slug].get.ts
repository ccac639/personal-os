import { getPostsStore } from '../../utils/posts';

export default defineEventHandler((event) => {
  const slug = getRouterParam(event, 'slug');
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'slug 缺失' });
  }
  const post = getPostsStore().getPost(slug);
  // getPost 对未知 slug 与 draft（非 dev）都返回 null，统一映射为 404
  if (!post) {
    throw createError({ statusCode: 404, statusMessage: '文章不存在' });
  }
  const { prev, next } = getPostsStore().getAdjacentPosts(slug);
  return { post, prev, next };
});
