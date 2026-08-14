<script setup lang="ts">
const route = useRoute();
const tag = String(route.params.tag ?? '');
const { data: posts } = await usePostsByTag(tag);

useSeoMeta({
  title: `标签：${tag}`,
  titleTemplate: '%s · Personal OS Blog',
  description: `标签「${tag}」下的全部文章`,
  ogType: 'website',
  ogTitle: `标签：${tag} · Personal OS Blog`,
  ogDescription: `标签「${tag}」下的全部文章`,
});
</script>

<template>
  <section>
    <div class="mb-6">
      <h1 class="text-2xl font-semibold">#{{ tag }}</h1>
      <p class="text-surface-800/60 mt-2 text-sm">{{ posts?.length ?? 0 }} 篇文章</p>
    </div>
    <PostList :posts="posts ?? []" />
  </section>
</template>
