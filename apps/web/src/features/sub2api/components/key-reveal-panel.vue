<script setup lang="ts">
/**
 * 密钥一次性展示面板（创建成功后使用）：
 * - 完整密钥只在创建成功响应中出现一次，本组件仅接收 props 展示；
 * - 不写入 localStorage / sessionStorage / 全局 store；
 * - 用户点击「我已保存」后销毁（父级置空数据即卸载）。
 */
import { Copy, Eye, EyeOff, ShieldAlert } from '@lucide/vue';
import { ref } from 'vue';

const props = defineProps<{
  keyValue: string;
  name: string;
}>();

defineEmits<{ done: [] }>();

const revealed = ref(false);

async function copyKey(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.keyValue);
  } catch {
    // 剪贴板不可用（非 https / 权限）：提示用户手动复制
  }
}
</script>

<template>
  <div class="rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2.5" role="status">
    <div class="flex items-center gap-1.5 text-amber-700">
      <ShieldAlert class="size-4" aria-hidden="true" />
      <p class="text-xs font-medium">API 凭据已创建（完整密钥仅此一次显示，请立即保存）</p>
    </div>
    <p class="text-surface-800/60 mt-1 text-[11px]">
      名称：{{ name }}。关闭本提示后无法再次查看完整密钥，只能撤销重建。
    </p>
    <div class="mt-2 flex flex-wrap items-center gap-2">
      <code
        class="bg-surface-0 border-surface-100 min-w-0 flex-1 overflow-x-auto rounded border px-2 py-1.5 font-mono text-[11px] break-all"
        :data-testid="revealed ? 'sub2api-key-plain' : 'sub2api-key-masked'"
      >
        {{ revealed ? keyValue : '••••••••••••••••' }}
      </code>
      <button
        type="button"
        class="text-surface-800/70 hover:bg-surface-100 flex items-center gap-1 rounded px-2 py-1.5 text-[11px]"
        @click="revealed = !revealed"
      >
        <Eye v-if="!revealed" class="size-3.5" aria-hidden="true" />
        <EyeOff v-else class="size-3.5" aria-hidden="true" />
        {{ revealed ? '隐藏' : '显示' }}
      </button>
      <button
        type="button"
        class="text-surface-800/70 hover:bg-surface-100 flex items-center gap-1 rounded px-2 py-1.5 text-[11px]"
        @click="copyKey"
      >
        <Copy class="size-3.5" aria-hidden="true" />
        复制
      </button>
      <button
        type="button"
        class="bg-brand-500 hover:bg-brand-600 rounded px-2.5 py-1.5 text-[11px] font-medium text-white"
        @click="$emit('done')"
      >
        我已保存
      </button>
    </div>
  </div>
</template>
