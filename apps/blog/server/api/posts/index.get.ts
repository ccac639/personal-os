import { getPostsStore } from '../../utils/posts';

export default defineEventHandler(() => getPostsStore().listPosts());
