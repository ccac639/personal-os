<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <section class="p-8">
    <h1 class="text-2xl font-semibold">
      {{ title }}
    </h1>
    <p v-if="description" class="text-surface-800/60 mt-2 text-sm">
      {{ description }}
    </p>
    <div
      class="rounded-card border-surface-800/20 bg-surface-0 text-surface-800/50 shadow-card mt-6 border border-dashed p-10 text-center text-sm"
    >
      模块骨架已就绪，业务功能将在后续阶段实现
    </div>
  </section>
</template>
