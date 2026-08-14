<script setup lang="ts">
import type { BlogPostMeta } from '~/types/post';

defineProps<{ posts: BlogPostMeta[] }>();
</script>

<template>
  <div v-if="posts.length > 0" class="space-y-4">
    <PostCard v-for="post in posts" :key="post.slug" :post="post" />
  </div>
  <!-- 空态兜底：内容源为空或过滤后无结果 -->
  <div
    v-else
    class="rounded-card border-surface-100 bg-surface-0 text-surface-800/50 shadow-card border border-dashed p-10 text-center text-sm"
  >
    暂无文章
  </div>
</template>
