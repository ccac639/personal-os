<script setup lang="ts">
import { X } from '@lucide/vue';

defineProps<{
  open: boolean;
  title: string;
  /** 面板宽度类（默认 max-w-lg） */
  widthClass?: string;
}>();

const emit = defineEmits<{ close: [] }>();
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
        v-if="open"
        class="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
      >
        <div
          class="bg-surface-900/40 absolute inset-0 backdrop-blur-[2px]"
          @click="emit('close')"
        />
        <div
          class="border-surface-100 bg-surface-0 shadow-float relative w-full overflow-hidden rounded-t-2xl border sm:rounded-2xl"
          :class="widthClass ?? 'max-w-lg'"
        >
          <header class="border-surface-100 flex items-center justify-between border-b px-5 py-3.5">
            <h2 class="text-surface-900 text-sm font-semibold">{{ title }}</h2>
            <button
              type="button"
              class="text-surface-800/50 hover:bg-surface-100 hover:text-surface-900 flex size-7 items-center justify-center rounded-lg transition-colors"
              aria-label="关闭"
              @click="emit('close')"
            >
              <X class="size-4" />
            </button>
          </header>
          <div class="max-h-[70vh] overflow-y-auto p-5">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
