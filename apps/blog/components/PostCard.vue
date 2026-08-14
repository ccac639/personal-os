<script setup lang="ts">
import type { BlogPostMeta } from '~/types/post';

defineProps<{ post: BlogPostMeta }>();
</script>

<template>
  <article class="rounded-card border-surface-100 bg-surface-0 shadow-card border p-5">
    <NuxtLink :to="`/posts/${post.slug}`" class="block">
      <h2 class="hover:text-brand-600 text-lg font-semibold">{{ post.title }}</h2>
    </NuxtLink>
    <p class="text-surface-800/60 mt-1.5 text-sm leading-relaxed">{{ post.description }}</p>
    <div class="text-surface-800/50 mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <time :datetime="post.date">{{ post.date }}</time>
      <span class="text-surface-800/30">·</span>
      <span>{{ post.readingMinutes }} 分钟阅读</span>
      <span class="text-surface-800/30">·</span>
      <NuxtLink
        :to="`/categories/${encodeURIComponent(post.category)}`"
        class="text-brand-600 hover:underline"
      >
        {{ post.category }}
      </NuxtLink>
      <template v-for="tag in post.tags" :key="tag">
        <span class="text-surface-800/30">·</span>
        <NuxtLink
          :to="`/tags/${encodeURIComponent(tag)}`"
          class="hover:text-brand-600 hover:underline"
        >
          #{{ tag }}
        </NuxtLink>
      </template>
    </div>
  </article>
</template>
