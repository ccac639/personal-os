import tailwindcss from '@tailwindcss/vite';
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
    public: {
      apiUrl: process.env.API_URL ?? 'http://localhost:3000',
    },
  },
});
