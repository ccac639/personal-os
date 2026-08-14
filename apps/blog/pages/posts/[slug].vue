<script setup lang="ts">
const route = useRoute();
const slug = String(route.params.slug ?? '');
const { data } = await usePostDetail(slug);
const post = computed(() => data.value?.post ?? null);

// 服务端 API 已对未知 slug / draft（非 dev）返回 404；
// 客户端导航场景 useFetch 无数据时这里兜底抛 404。
if (!post.value) {
  throw createError({ statusCode: 404, statusMessage: '文章不存在', fatal: true });
}

useSeoMeta({
  title: post.value.title,
  titleTemplate: '%s · Personal OS Blog',
  description: post.value.description,
});
</script>

<template>
  <article v-if="post" class="mx-auto max-w-3xl">
    <header class="mb-8">
      <div class="text-surface-800/50 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <time :datetime="post.date">{{ post.date }}</time>
        <template v-if="post.updated">
          <span class="text-surface-800/30">·</span>
          <span>更新于 {{ post.updated }}</span>
        </template>
        <span class="text-surface-800/30">·</span>
        <span>{{ post.readingMinutes }} 分钟阅读</span>
        <span class="text-surface-800/30">·</span>
        <NuxtLink
          :to="`/categories/${encodeURIComponent(post.category)}`"
          class="text-brand-600 hover:underline"
        >
          {{ post.category }}
        </NuxtLink>
      </div>
      <h1 class="mt-2 text-3xl leading-tight font-bold">{{ post.title }}</h1>
      <div class="mt-3 flex flex-wrap gap-1.5">
        <NuxtLink
          v-for="tag in post.tags"
          :key="tag"
          :to="`/tags/${encodeURIComponent(tag)}`"
          class="bg-surface-100 text-surface-800/70 hover:text-brand-600 rounded-full px-2.5 py-0.5 text-xs"
        >
          #{{ tag }}
        </NuxtLink>
      </div>
    </header>

    <!-- 正文为服务端 markdown 渲染器产出：所有文本已转义，无原始 HTML 注入 -->
    <div class="prose-blog" v-html="post.body" />

    <nav
      v-if="data?.prev || data?.next"
      class="border-surface-100 mt-10 grid gap-3 border-t pt-6 text-sm sm:grid-cols-2"
    >
      <NuxtLink
        v-if="data?.next"
        :to="`/posts/${data.next.slug}`"
        class="rounded-card border-surface-100 bg-surface-0 shadow-card hover:border-brand-500/50 border p-4 transition-colors"
      >
        <span class="text-surface-800/50 block text-xs">下一篇</span>
        <span class="hover:text-brand-600 mt-1 block font-medium">{{ data.next.title }}</span>
      </NuxtLink>
      <NuxtLink
        v-if="data?.prev"
        :to="`/posts/${data.prev.slug}`"
        class="rounded-card border-surface-100 bg-surface-0 shadow-card hover:border-brand-500/50 border p-4 text-right transition-colors sm:col-start-2"
      >
        <span class="text-surface-800/50 block text-xs">上一篇</span>
        <span class="hover:text-brand-600 mt-1 block font-medium">{{ data.prev.title }}</span>
      </NuxtLink>
    </nav>
  </article>
</template>
