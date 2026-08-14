import { postsStore } from '../../utils/posts';

export default defineEventHandler(() => postsStore.listPosts());
