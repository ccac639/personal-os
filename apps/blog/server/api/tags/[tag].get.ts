import { getPostsStore } from '../../utils/posts';

export default defineEventHandler((event) => {
  const tag = getRouterParam(event, 'tag');
  if (!tag) {
    throw createError({ statusCode: 400, statusMessage: 'tag 缺失' });
  }
  return getPostsStore().listPostsByTag(tag);
});
