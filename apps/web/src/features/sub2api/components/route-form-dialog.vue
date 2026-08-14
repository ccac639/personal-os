<script setup lang="ts">
/** 模型路由（对外模型 → 上游平台/模型）创建 / 编辑表单弹窗 */
import { computed, reactive, ref, watch } from 'vue';
import { X } from '@lucide/vue';

import type { CompositeRouteInput, Sub2ApiCompositeRoute } from '@/services/sub2api';

const props = defineProps<{
  visible: boolean;
  item: Sub2ApiCompositeRoute | null;
  busy?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [input: CompositeRouteInput];
}>();

const PLATFORMS = ['anthropic', 'openai', 'gemini', 'antigravity', 'grok'] as const;
const ENDPOINTS = [
  'any',
  'messages',
  'count_tokens',
  'responses',
  'chat_completions',
  'embeddings',
  'images',
  'gemini',
] as const;

interface FormState {
  publicModel: string;
  matchType: 'exact' | 'prefix';
  targetPlatform: string;
  upstreamModel: string;
  endpoint: string;
  priority: string;
  enabled: boolean;
  notes: string;
}

function emptyForm(): FormState {
  return {
    publicModel: '',
    matchType: 'exact',
    targetPlatform: 'anthropic',
    upstreamModel: '',
    endpoint: 'any',
    priority: '0',
    enabled: true,
    notes: '',
  };
}

const form = reactive<FormState>(emptyForm());
const error = ref<string | null>(null);

watch(
  () => [props.visible, props.item] as const,
  ([visible, item]) => {
    if (!visible) return;
    error.value = null;
    const next = emptyForm();
    if (item) {
      next.publicModel = item.public_model;
      next.matchType = item.match_type;
      next.targetPlatform = item.target_platform;
      next.upstreamModel = item.upstream_model;
      next.endpoint = item.endpoint;
      next.priority = String(item.priority ?? 0);
      next.enabled = item.enabled;
      next.notes = item.notes ?? '';
    }
    Object.assign(form, next);
  },
  { immediate: true },
);

const canSubmit = computed(() => form.publicModel.trim().length > 0);

function onSubmit(): void {
  if (props.busy) return; // 防重复提交（按钮 disabled + 处理器守卫双保险）
  error.value = null;
  if (!canSubmit.value) {
    error.value = '对外模型名必填';
    return;
  }
  emit('submit', {
    public_model: form.publicModel.trim(),
    match_type: form.matchType,
    target_platform: form.targetPlatform,
    upstream_model: form.upstreamModel.trim() || undefined,
    endpoint: form.endpoint as CompositeRouteInput['endpoint'],
    priority: Number.isFinite(Number(form.priority)) ? Number(form.priority) : 0,
    enabled: form.enabled,
    notes: form.notes.trim() || undefined,
  });
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-60 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      :aria-label="item ? '编辑路由' : '新建路由'"
    >
      <div class="absolute inset-0 bg-black/30" @click="$emit('close')" />
      <div
        class="border-surface-100 bg-surface-0 relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border p-4 shadow-lg"
      >
        <div class="flex items-center justify-between">
          <h2 class="text-surface-900 text-sm font-semibold">
            {{ item ? '编辑路由' : '新建路由' }}
          </h2>
          <button
            type="button"
            class="text-surface-800/50 hover:bg-surface-100 rounded p-1"
            aria-label="关闭"
            @click="$emit('close')"
          >
            <X class="size-4" />
          </button>
        </div>

        <form class="mt-3 space-y-2.5" @submit.prevent="onSubmit">
          <div class="grid grid-cols-2 gap-2.5">
            <label class="block">
              <span class="text-surface-800/60 text-[11px]">对外模型名 *</span>
              <input
                v-model="form.publicModel"
                type="text"
                maxlength="256"
                class="border-surface-100 bg-surface-0 focus:border-brand-500 mt-0.5 w-full rounded border px-2 py-1.5 font-mono text-xs focus:outline-none"
                placeholder="claude-sonnet-4"
              />
            </label>
            <label class="block">
              <span class="text-surface-800/60 text-[11px]">匹配方式</span>
              <select
                v-model="form.matchType"
                class="border-surface-100 bg-surface-0 focus:border-brand-500 mt-0.5 w-full rounded border px-2 py-1.5 text-xs focus:outline-none"
              >
                <option value="exact">精确（exact）</option>
                <option value="prefix">前缀（prefix）</option>
              </select>
            </label>
          </div>

          <div class="grid grid-cols-2 gap-2.5">
            <label class="block">
              <span class="text-surface-800/60 text-[11px]">上游平台</span>
              <select
                v-model="form.targetPlatform"
                class="border-surface-100 bg-surface-0 focus:border-brand-500 mt-0.5 w-full rounded border px-2 py-1.5 text-xs focus:outline-none"
              >
                <option v-for="p in PLATFORMS" :key="p" :value="p">{{ p }}</option>
              </select>
            </label>
            <label class="block">
              <span class="text-surface-800/60 text-[11px]">上游模型</span>
              <input
                v-model="form.upstreamModel"
                type="text"
                maxlength="256"
                class="border-surface-100 bg-surface-0 focus:border-brand-500 mt-0.5 w-full rounded border px-2 py-1.5 font-mono text-xs focus:outline-none"
              />
            </label>
          </div>

          <div class="grid grid-cols-3 gap-2.5">
            <label class="block">
              <span class="text-surface-800/60 text-[11px]">端点</span>
              <select
                v-model="form.endpoint"
                class="border-surface-100 bg-surface-0 focus:border-brand-500 mt-0.5 w-full rounded border px-2 py-1.5 text-xs focus:outline-none"
              >
                <option v-for="e in ENDPOINTS" :key="e" :value="e">{{ e }}</option>
              </select>
            </label>
            <label class="block">
              <span class="text-surface-800/60 text-[11px]">优先级</span>
              <input
                v-model="form.priority"
                type="number"
                min="0"
                class="border-surface-100 bg-surface-0 focus:border-brand-500 mt-0.5 w-full rounded border px-2 py-1.5 text-xs focus:outline-none"
              />
            </label>
            <label class="flex items-end gap-2 pb-1.5 text-[11px]">
              <input v-model="form.enabled" type="checkbox" class="size-3" />
              启用
            </label>
          </div>

          <label class="block">
            <span class="text-surface-800/60 text-[11px]">备注</span>
            <input
              v-model="form.notes"
              type="text"
              maxlength="512"
              class="border-surface-100 bg-surface-0 focus:border-brand-500 mt-0.5 w-full rounded border px-2 py-1.5 text-xs focus:outline-none"
            />
          </label>

          <p v-if="error" class="text-[11px] text-red-600" role="alert">{{ error }}</p>

          <div class="flex justify-end gap-2 pt-1">
            <button
              type="button"
              class="border-surface-100 text-surface-800/70 hover:bg-surface-100 rounded border px-3 py-1.5 text-[11px]"
              @click="$emit('close')"
            >
              取消
            </button>
            <button
              type="submit"
              class="bg-brand-500 hover:bg-brand-600 rounded px-3 py-1.5 text-[11px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="busy"
            >
              {{ busy ? '提交中…' : item ? '保存' : '创建' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
