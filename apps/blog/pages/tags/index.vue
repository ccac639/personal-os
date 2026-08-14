<script setup lang="ts">
const { data: tags } = await useTagList();

useSeoMeta({
  title: '标签',
  titleTemplate: '%s · Personal OS Blog',
  description: '按标签浏览全部博客文章',
});
</script>

<template>
  <section>
    <div class="mb-6">
      <h1 class="text-2xl font-semibold">标签</h1>
      <p class="text-surface-800/60 mt-2 text-sm">按主题浏览全部文章。</p>
    </div>
    <div v-if="tags && tags.length > 0" class="flex flex-wrap gap-2">
      <NuxtLink
        v-for="tag in tags"
        :key="tag.name"
        :to="`/tags/${encodeURIComponent(tag.name)}`"
        class="bg-surface-100 hover:border-brand-500/50 hover:bg-surface-0 rounded-full border border-transparent px-3 py-1.5 text-sm transition-colors"
      >
        #{{ tag.name }}
        <span class="text-surface-800/40 ml-1">{{ tag.count }}</span>
      </NuxtLink>
    </div>
    <div
      v-else
      class="rounded-card border-surface-100 bg-surface-0 text-surface-800/50 shadow-card border border-dashed p-10 text-center text-sm"
    >
      暂无标签
    </div>
  </section>
</template>
