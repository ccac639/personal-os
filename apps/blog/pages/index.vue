<script setup lang="ts">
useSeoMeta({
  title: '首页',
  titleTemplate: '%s · Personal OS Blog',
});
</script>

<template>
  <section>
    <h1 class="text-2xl font-semibold">Blog</h1>
    <p class="text-surface-800/60 mt-2 text-sm">
      博客骨架已就绪：文章 / 标签 / 分类 / 专题 / 项目介绍 / 成果展示（后续阶段实现）
    </p>
    <div
      class="rounded-card border-surface-800/20 bg-surface-0 text-surface-800/50 shadow-card mt-6 border border-dashed p-10 text-center text-sm"
    >
      SSR + SEO + OpenGraph + Sitemap + RSS + Structured Data 已启用
    </div>
  </section>
</template>
