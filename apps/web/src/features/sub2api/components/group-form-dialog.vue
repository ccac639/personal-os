<script setup lang="ts">
/** 模型分组创建 / 编辑表单弹窗 */
import { computed, reactive, ref, watch } from 'vue';
import { X } from '@lucide/vue';

import type { GroupInput, Sub2ApiGroup } from '@/services/sub2api';

const props = defineProps<{
  visible: boolean;
  item: Sub2ApiGroup | null;
  busy?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [input: GroupInput];
}>();

const PLATFORMS = ['anthropic', 'openai', 'gemini', 'antigravity', 'grok', 'composite'] as const;

interface FormState {
  name: string;
  description: string;
  platform: string;
  status: 'active' | 'inactive';
  rateMultiplier: string;
  isExclusive: boolean;
  subscriptionType: string;
  sortOrder: string;
  modelRoutingJson: string;
}

function emptyForm(): FormState {
  return {
    name: '',
    description: '',
    platform: 'anthropic',
    status: 'active',
    rateMultiplier: '1',
    isExclusive: false,
    subscriptionType: 'standard',
    sortOrder: '0',
    modelRoutingJson: '{}',
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
      next.name = item.name;
      next.description = item.description ?? '';
      next.platform = item.platform;
      next.status = item.status === 'inactive' ? 'inactive' : 'active';
      next.rateMultiplier = String(item.rate_multiplier ?? 1);
      next.isExclusive = item.is_exclusive;
      next.subscriptionType = item.subscription_type ?? 'standard';
      next.sortOrder = String(item.sort_order ?? 0);
      next.modelRoutingJson = JSON.stringify(item.model_routing ?? {}, null, 2);
    }
    Object.assign(form, next);
  },
  { immediate: true },
);

const canSubmit = computed(() => form.name.trim().length > 0);

function parseModelRouting(): Record<string, number[]> | null {
  const raw = form.modelRoutingJson.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      error.value = '模型路由必须是 JSON 对象';
      return null;
    }
    return parsed as Record<string, number[]>;
  } catch {
    error.value = '模型路由 JSON 格式不正确';
    return null;
  }
}

function onSubmit(): void {
  if (props.busy) return; // 防重复提交（按钮 disabled + 处理器守卫双保险）
  error.value = null;
  if (!canSubmit.value) {
    error.value = '分组名称必填';
    return;
  }
  const routing = parseModelRouting();
  if (routing === null) return;
  emit('submit', {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    platform: form.platform,
    status: form.status,
    rate_multiplier: Number.isFinite(Number(form.rateMultiplier)) ? Number(form.rateMultiplier) : 1,
    is_exclusive: form.isExclusive,
    subscription_type: form.subscriptionType,
    sort_order: Number.isFinite(Number(form.sortOrder)) ? Number(form.sortOrder) : 0,
    model_routing: Object.keys(routing).length > 0 ? routing : undefined,
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
      :aria-label="item ? '编辑分组' : '新建分组'"
    >
      <div class="absolute inset-0 bg-black/30" @click="$emit('close')" />
      <div
        class="border-surface-100 bg-surface-0 relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border p-4 shadow-lg"
      >
        <div class="flex items-center justify-between">
          <h2 class="text-surface-900 text-sm font-semibold">
            {{ item ? '编辑分组' : '新建分组' }}
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
              <span class="text-surface-800/60 text-[11px]">名称 *</span>
              <input
                v-model="form.name"
                type="text"
                maxlength="128"
                class="border-surface-100 bg-surface-0 focus:border-brand-500 mt-0.5 w-full rounded border px-2 py-1.5 text-xs focus:outline-none"
              />
            </label>
            <label class="block">
              <span class="text-surface-800/60 text-[11px]">平台</span>
              <select
                v-model="form.platform"
                class="border-surface-100 bg-surface-0 focus:border-brand-500 mt-0.5 w-full rounded border px-2 py-1.5 text-xs focus:outline-none"
              >
                <option v-for="p in PLATFORMS" :key="p" :value="p">{{ p }}</option>
              </select>
            </label>
          </div>

          <label class="block">
            <span class="text-surface-800/60 text-[11px]">描述</span>
            <input
              v-model="form.description"
              type="text"
              maxlength="512"
              class="border-surface-100 bg-surface-0 focus:border-brand-500 mt-0.5 w-full rounded border px-2 py-1.5 text-xs focus:outline-none"
            />
          </label>

          <div class="grid grid-cols-4 gap-2.5">
            <label class="block">
              <span class="text-surface-800/60 text-[11px]">状态</span>
              <select
                v-model="form.status"
                class="border-surface-100 bg-surface-0 focus:border-brand-500 mt-0.5 w-full rounded border px-2 py-1.5 text-xs focus:outline-none"
              >
                <option value="active">启用</option>
                <option value="inactive">停用</option>
              </select>
            </label>
            <label class="block">
              <span class="text-surface-800/60 text-[11px]">倍率</span>
              <input
                v-model="form.rateMultiplier"
                type="number"
                min="0"
                step="0.01"
                class="border-surface-100 bg-surface-0 focus:border-brand-500 mt-0.5 w-full rounded border px-2 py-1.5 text-xs focus:outline-none"
              />
            </label>
            <label class="block">
              <span class="text-surface-800/60 text-[11px]">订阅类型</span>
              <select
                v-model="form.subscriptionType"
                class="border-surface-100 bg-surface-0 focus:border-brand-500 mt-0.5 w-full rounded border px-2 py-1.5 text-xs focus:outline-none"
              >
                <option value="standard">standard</option>
                <option value="subscription">subscription</option>
              </select>
            </label>
            <label class="block">
              <span class="text-surface-800/60 text-[11px]">排序</span>
              <input
                v-model="form.sortOrder"
                type="number"
                min="0"
                class="border-surface-100 bg-surface-0 focus:border-brand-500 mt-0.5 w-full rounded border px-2 py-1.5 text-xs focus:outline-none"
              />
            </label>
          </div>

          <label class="flex items-center gap-2 text-[11px]">
            <input v-model="form.isExclusive" type="checkbox" class="size-3" />
            独占分组（is_exclusive）
          </label>

          <label class="block">
            <span class="text-surface-800/60 text-[11px]"
              >模型路由（JSON：对外模型 → 账号 id 数组）</span
            >
            <textarea
              v-model="form.modelRoutingJson"
              rows="3"
              spellcheck="false"
              class="border-surface-100 bg-surface-0 focus:border-brand-500 mt-0.5 w-full rounded border px-2 py-1.5 font-mono text-[11px] focus:outline-none"
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
