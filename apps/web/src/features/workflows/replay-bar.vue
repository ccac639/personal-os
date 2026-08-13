<script setup lang="ts">
/**
 * 回放态横幅：只读回放提示 + 退出回放。
 * 回放期间画布禁止编辑，节点按历史状态着色。
 */
import { EyeOff } from '@lucide/vue';
import { useWorkflowStore } from './store';

const store = useWorkflowStore();

function exit() {
  store.exitReplay();
}
</script>

<template>
  <div
    class="border-brand-400/40 bg-brand-50/95 text-brand-700 dark:bg-brand-950/80 dark:text-brand-300 absolute top-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium shadow-sm backdrop-blur"
    role="status"
  >
    <EyeOff class="size-3.5" />
    <span>
      回放模式（只读）· 运行
      {{ store.replayRunId ? store.replayRunId.slice(0, 8) : '' }}
    </span>
    <button
      type="button"
      class="hover:bg-brand-500/10 rounded-md px-2 py-0.5 transition"
      @click="exit"
    >
      退出回放
    </button>
  </div>
</template>
