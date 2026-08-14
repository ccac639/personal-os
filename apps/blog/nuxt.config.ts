import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import { defineNuxtConfig } from 'nuxt/config';

export default defineNuxtConfig({
  compatibilityDate: '2026-08-01',

  // Nuxt 4 兼容结构：使用根目录布局（pages/ components/ layouts/ server/）
  srcDir: '.',

  modules: ['@nuxtjs/seo'],

  // @nuxtjs/seo 统一提供 robots + sitemap + OG + Schema.org + RSS
  site: {
    url: process.env.BLOG_URL ?? 'http://localhost:3001',
    name: 'Personal OS Blog',
    description: '个人博客：文章 / 标签 / 分类 / 专题 / 项目介绍 / 成果展示',
  },

  // sitemap 动态源：模块运行时 fetch 本 API 补充文章/标签/分类 URL
  // （用户自定义 server/routes/sitemap.xml.ts 会被模块自带 route 覆盖，不可用）
  sitemap: {
    sources: ['/api/sitemap-urls'],
  },

  css: ['~/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()],
  },

  typescript: {
    strict: true,
    typeCheck: true,
  },

  devServer: {
    port: 3001,
  },

  runtimeConfig: {
    // 内容目录在 build 期固化为绝对路径：nitro 运行时（preview/生产）cwd 会被切到
    // .output，不能再依赖 process.cwd() 定位源码目录。
    blogContentDir: resolve(process.cwd(), 'content/posts'),
    public: {
      apiUrl: process.env.API_URL ?? 'http://localhost:3000',
    },
  },
});
