---
title: 你好，Personal OS
description: 第一篇示例文章：介绍这个博客的定位、内容规划与发布管线。
date: 2026-08-01
tags: [personal-os, introduction]
category: 随笔
---

> 本文为示例文章，用于演示博客发布管线：frontmatter 解析、Markdown 渲染、
> SEO 输出与 RSS/Sitemap 接入。

Personal OS 是我的个人操作系统——一套把知识、项目与日常工作串在一起的
长期建设计划。这个博客是它的对外窗口。

## 内容规划

- **技术笔记**：Nuxt / Tailwind / 工程化实践
- **项目复盘**：个人项目的架构决策与踩坑记录
- **随笔**：长期主义、个人知识管理

## 为什么是文件型内容源

当前阶段后端 `articles` API 尚未就绪，博客先用 Markdown 文件发布：

1. 内容与代码同仓，提交即发布
2. 数据访问层预留接口，未来可无感切换到后端 API
3. 构建产物纯 SSR，SEO 全链路可验证

> 发布流程：`pnpm --filter @personal-os/blog build` 通过后提交即可。

## 阅读时长

正文的 `readingMinutes` 由渲染器按中文字数与英文单词数估算，列表卡片会展示。

下一站：看看 [Nuxt 4 文件型博客的 SEO 清单](/posts/nuxt4-file-blog-seo)。
