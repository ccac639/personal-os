<script setup lang="ts">
import TechTree from '@/features/projects/tech-tree.vue';
</script>

<template>
  <div class="p-8">
    <h1 class="text-2xl font-semibold">开发中</h1>
    <p class="mt-2 text-sm text-neutral-500">
      Personal OS 当前采用的技术栈结构（图标 + 名称，后续可补充项目与任务看板）
    </p>
    <div class="mt-6">
      <TechTree />
    </div>
  </div>
</template>
