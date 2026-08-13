<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue';
import { useRouter } from 'vue-router';

import InboxPanel from '@/features/tasks/inbox-panel.vue';

const router = useRouter();
</script>

<template>
  <div class="page-container mx-auto max-w-6xl px-4 py-6">
    <div class="mb-4">
      <button
        type="button"
        class="text-surface-800/60 hover:text-surface-900 flex items-center gap-1.5 text-sm font-medium transition-colors"
        @click="router.push({ path: '/projects' })"
      >
        <ArrowLeft class="size-4" />
        返回开发中
      </button>
    </div>
    <InboxPanel />
  </div>
</template>
