import { postsStore } from '../../utils/posts';

export default defineEventHandler((event) => {
  const slug = getRouterParam(event, 'slug');
  // slug 由文件名派生且已校验，此处仅防御性过滤
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'slug 缺失' });
  }
  return postsStore.getPost(slug);
});
