<script setup lang="ts">
import { techTree } from '@/features/projects/tech-stack';
import TechIcon from '@/features/projects/tech-icon.vue';

/** 从技术树提取前 12 个核心技术用于 Dashboard 展示 */
const coreTech = [
  techTree[0]?.subGroups?.[0]?.items[0], // Vue
  techTree[0]?.subGroups?.[0]?.items[1], // Vite
  techTree[0]?.subGroups?.[0]?.items[2], // Vue Router
  techTree[0]?.subGroups?.[0]?.items[3], // Pinia
  techTree[0]?.subGroups?.[1]?.items[0], // Tailwind
  techTree[0]?.subGroups?.[1]?.items[1], // Reka UI
  techTree[2]?.items?.[0], // NestJS
  techTree[2]?.items?.[1], // Fastify
  techTree[2]?.items?.[3], // MongoDB
  techTree[2]?.items?.[5], // Redis
  techTree[4]?.items?.[0], // pnpm
  techTree[4]?.items?.[2], // TypeScript
].filter((item): item is NonNullable<typeof item> => item !== undefined);
</script>

<template>
  <section class="border-surface-100 bg-surface-0 rounded-lg border p-6">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-surface-900 text-lg font-semibold">核心技术栈</h2>
      <router-link to="/projects" class="text-brand-600 hover:text-brand-700 text-sm">
        查看完整技术树
      </router-link>
    </div>
    <div class="flex flex-wrap gap-3">
      <div
        v-for="tech in coreTech"
        :key="tech.name"
        class="border-surface-100 bg-surface-50 hover:border-surface-800/30 hover:bg-surface-0 flex items-center gap-2 rounded-lg border px-3 py-2 transition"
      >
        <TechIcon :item="tech" :size="16" />
        <span class="text-surface-800/80 text-sm">{{ tech.name }}</span>
      </div>
    </div>
  </section>
</template>
