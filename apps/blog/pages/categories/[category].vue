<script setup lang="ts">
const route = useRoute();
const category = String(route.params.category ?? '');
const { data: posts } = await usePostsByCategory(category);

useSeoMeta({
  title: `分类：${category}`,
  titleTemplate: '%s · Personal OS Blog',
  description: `分类「${category}」下的全部文章`,
});
</script>

<template>
  <section>
    <div class="mb-6">
      <h1 class="text-2xl font-semibold">{{ category }}</h1>
      <p class="text-surface-800/60 mt-2 text-sm">{{ posts?.length ?? 0 }} 篇文章</p>
    </div>
    <PostList :posts="posts ?? []" />
  </section>
</template>
