<script setup lang="ts">
import { ref } from 'vue';
import { AlertTriangle, X } from '@lucide/vue';
import { useOverlayFocus } from './overlay';

const props = defineProps<{
  visible: boolean;
  /** 待删除标题（最多展示前 3 条） */
  titles: string[];
  count: number;
}>();

const emit = defineEmits<{
  confirm: [];
  close: [];
}>();

const panel = ref<HTMLElement | null>(null);

// 统一焦点管理：不抢焦点（保留触发元素），关闭后归还；Escape 关闭；Tab 陷阱；滚动锁定
useOverlayFocus({
  visible: () => props.visible,
  onEscape: () => emit('close'),
  container: panel,
});
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="visible"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
        @click.self="emit('close')"
      >
        <div
          ref="panel"
          class="border-surface-100/70 bg-surface-0/95 shadow-float w-full max-w-sm rounded-xl border backdrop-blur-xl"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="achievement-delete-title"
          aria-describedby="achievement-delete-desc"
        >
          <header
            class="border-surface-100/70 flex items-center justify-between border-b px-5 py-3.5"
          >
            <h2
              id="achievement-delete-title"
              class="text-surface-900 flex items-center gap-2 text-sm font-semibold"
            >
              <AlertTriangle class="size-4 text-red-600" />
              删除成果
            </h2>
            <button
              type="button"
              title="关闭"
              aria-label="关闭"
              class="text-surface-800/50 hover:bg-surface-50 hover:text-surface-900 rounded-md p-1.5 transition"
              @click="emit('close')"
            >
              <X class="size-4" />
            </button>
          </header>

          <div id="achievement-delete-desc" class="space-y-2 px-5 py-4">
            <p class="text-surface-900 text-[13px]">
              确定删除选中的
              <span class="font-semibold">{{ count }}</span> 项成果吗？此操作不可撤销。
            </p>
            <ul
              v-if="titles.length > 0"
              class="text-surface-800/60 max-h-28 space-y-1 overflow-y-auto text-xs"
            >
              <li v-for="t in titles" :key="t" class="truncate">· {{ t }}</li>
              <li v-if="count > titles.length" class="text-surface-800/40">…等 {{ count }} 项</li>
            </ul>
          </div>

          <footer
            class="border-surface-100/70 flex items-center justify-end gap-2 border-t px-5 py-3.5"
          >
            <button
              type="button"
              class="border-surface-100 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 rounded-lg border px-3 py-2 text-xs font-medium transition"
              @click="emit('close')"
            >
              取消
            </button>
            <button
              type="button"
              class="rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-red-700"
              @click="emit('confirm')"
            >
              确认删除
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
