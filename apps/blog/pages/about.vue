<script setup lang="ts">
useSeoMeta({
  title: '关于',
  titleTemplate: '%s · Personal OS Blog',
  description: '关于 Personal OS 博客与作者',
});
</script>

<template>
  <section class="mx-auto max-w-2xl">
    <h1 class="text-2xl font-semibold">关于</h1>
    <div class="prose-blog mt-4">
      <p>
        Personal OS 是作者的个人操作系统——一套把知识、项目与日常工作串在一起的长期建设计划。
        这个博客是它的对外窗口，记录技术实践、项目复盘与长期主义思考。
      </p>
      <h2>内容方向</h2>
      <ul>
        <li>技术笔记：Nuxt / Tailwind / 工程化实践</li>
        <li>项目复盘：个人项目的架构决策与踩坑记录</li>
        <li>随笔：长期主义、个人知识管理</li>
      </ul>
      <h2>技术栈</h2>
      <p>
        基于 Nuxt 4 的 SSR 博客，内容以 Markdown 文件驱动（服务端渲染为 HTML）， 集成 Sitemap / RSS
        / OpenGraph / Schema.org 结构化数据。通过
        <a href="/rss.xml">RSS</a> 订阅更新。
      </p>
    </div>
  </section>
</template>
