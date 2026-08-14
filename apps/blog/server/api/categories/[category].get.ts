import { getPostsStore } from '../../utils/posts';

export default defineEventHandler((event) => {
  const category = getRouterParam(event, 'category');
  if (!category) {
    throw createError({ statusCode: 400, statusMessage: 'category 缺失' });
  }
  return getPostsStore().listPostsByCategory(category);
});
