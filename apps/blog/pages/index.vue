<script setup lang="ts">
const { data: posts } = await usePostList();

useSeoMeta({
  title: '首页',
  titleTemplate: '%s · Personal OS Blog',
  description: '个人博客：文章 / 标签 / 分类 / 专题 / 项目介绍 / 成果展示',
});
</script>

<template>
  <section>
    <div class="mb-8">
      <h1 class="text-2xl font-semibold">Personal OS 博客</h1>
      <p class="text-surface-800/60 mt-2 max-w-2xl text-sm leading-relaxed">
        记录个人项目、技术实践与长期主义思考。内容由 Markdown 文件驱动，SSR 直出，附带 RSS 与
        Sitemap。
      </p>
    </div>
    <PostList :posts="posts ?? []" />
  </section>
</template>
