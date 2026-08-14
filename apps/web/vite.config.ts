import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        // 依赖分包：重 vendor 拆独立 chunk，利用浏览器长缓存（FO1 性能线）
        // 行为零变更——仅调整打包结构，不改变加载逻辑与 UI 行为。
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // 注意：Rolldown 预打包会把相互依赖的三方合并进同一模块文件，
          // 按包名分组可能误伤（如 echarts 与 @vue/shared 合并后导致首屏拉全量）。
          // 因此 echarts 不独立分包：它仅被 achievements 页面使用，
          // 页面级懒加载已覆盖，保持路由粒度最安全。
          // 画布：@vue-flow/* + d3 依赖
          if (/[\\/]@vue-flow([\\/]|$)/.test(id)) return 'vendor-vueflow';
          if (/[\\/]d3-(drag|selection|zoom)([\\/]|$)/.test(id)) return 'vendor-vueflow';
          // Vue 生态核心：vue / pinia / vue-router / @vue/*
          if (/[\\/](vue|pinia|vue-router)([\\/]|$)/.test(id)) return 'vendor-vue';
          if (/[\\/]@vue([\\/]|$)/.test(id)) return 'vendor-vue';
          // 其余三方依赖不强制归并：交给 Rollup 自动 code-split，
          // 保持路由级粒度，避免“进任意路由拉全量 vendor”的负优化。
          return undefined;
        },
      },
    },
  },
});
