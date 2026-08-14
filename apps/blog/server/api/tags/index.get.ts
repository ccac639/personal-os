import { getPostsStore } from '../../utils/posts';

export default defineEventHandler(() => getPostsStore().listTags());
