---
title: Personal OS 架构笔记：从骨架到可发布
description: 示例文章：个人项目三端（blog / web / api）的边界划分与数据流。
date: 2026-08-12
tags: [personal-os, 架构, 工程化]
category: 项目复盘
---

> 本文为示例文章，复盘 monorepo 内三端应用如何各司其职、零重叠演进。

## 目录边界

- `apps/blog`：纯 SSR 博客，文件型内容源，不依赖后端
- `apps/web`：管理端，接后端 API
- `apps/api`：NestJS 后端，业务模块按领域划分

## 关键决策

**博客不依赖 articles API。** 后端 `articles` 模块目录为空，本线在 blog 内
用文件内容源做到「可 SSR 发布」，数据访问层保留替换点：

- `server/utils/posts.ts`：扫描 `content/posts/*.md`
- `composables/usePosts.ts`：页面唯一入口
- 未来切 API 时只改实现，不改页面

## 演进顺序

1. 内容源 + 页面 + SEO（本轮）
2. articles API 就绪后切换数据层
3. 全文搜索（Pagefind）与 OG 图自动生成

## 踩坑记录

- sitemap 模块会过滤动态路由，需显式注册 source
- `@nuxtjs/seo` 不提供 RSS，需手写 Nitro 路由
- 新增依赖会触碰根 lockfile，本线坚持零新增

---

欢迎回看开篇：[你好，Personal OS](/posts/hello-personal-os)。
