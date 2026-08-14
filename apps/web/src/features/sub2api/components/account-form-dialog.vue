<script setup lang="ts">
/** 账号（订阅账号）创建 / 编辑表单弹窗 */
import { computed, reactive, ref, watch } from 'vue';
import { X } from '@lucide/vue';

import type {
  AccountInput,
  Sub2ApiAccount,
  Sub2ApiAccountPlatform,
  Sub2ApiAccountType,
  Sub2ApiGroup,
} from '@/services/sub2api';

const props = defineProps<{
  visible: boolean;
  item: Sub2ApiAccount | null;
  groups: Sub2ApiGroup[];
  busy?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [input: AccountInput];
}>();

const PLATFORMS: Sub2ApiAccountPlatform[] = [
  'anthropic',
  'openai',
  'gemini',
  'antigravity',
  'grok',
];
const TYPES: Sub2ApiAccountType[] = [
  'oauth',
  'setup-token',
  'apikey',
  'upstream',
  'bedrock',
  'service_account',
];

interface FormState {
  name: string;
  platform: Sub2ApiAccountPlatform;
  type: Sub2ApiAccountType;
  status: 'active' | 'inactive';
  priority: string;
  concurrency: string;
  rateMultiplier: string;
  notes: string;
  groupIds: number[];
  credentialsJson: string;
}

function emptyForm(): FormState {
  return {
    name: '',
    platform: 'anthropic',
    type: 'apikey',
    status: 'active',
    priority: '0',
    concurrency: '1',
    rateMultiplier: '',
    notes: '',
    groupIds: [],
    credentialsJson: '{}',
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
      next.platform = item.platform;
      next.type = item.type;
      next.status = item.status === 'inactive' ? 'inactive' : 'active';
      next.priority = String(item.priority ?? 0);
      next.concurrency = String(item.concurrency ?? 1);
      next.rateMultiplier = item.rate_multiplier !== undefined ? String(item.rate_multiplier) : '';
      next.notes = item.notes ?? '';
      next.groupIds = [...(item.group_ids ?? [])];
      next.credentialsJson = '{}';
    }
    Object.assign(form, next);
  },
  { immediate: true },
);

const canSubmit = computed(() => form.name.trim().length > 0);

function parseCredentials(): Record<string, unknown> | null {
  const raw = form.credentialsJson.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      error.value = '平台凭据必须是 JSON 对象';
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    error.value = '平台凭据 JSON 格式不正确';
    return null;
  }
}

function onSubmit(): void {
  if (props.busy) return; // 防重复提交（按钮 disabled + 处理器守卫双保险）
  error.value = null;
  if (!canSubmit.value) {
    error.value = '账号名称必填';
    return;
  }
  const credentials = parseCredentials();
  if (credentials === null) return;
  const input: AccountInput = {
    name: form.name.trim(),
    platform: form.platform,
    type: form.type,
    status: form.status,
    notes: form.notes.trim() || undefined,
    group_ids: form.groupIds.length > 0 ? form.groupIds : undefined,
    priority: Number.isFinite(Number(form.priority)) ? Number(form.priority) : undefined,
    concurrency: Number.isFinite(Number(form.concurrency)) ? Number(form.concurrency) : undefined,
    rate_multiplier:
      form.rateMultiplier !== '' && Number.isFinite(Number(form.rateMultiplier))
        ? Number(form.rateMultiplier)
        : undefined,
    credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
  };
  emit('submit', input);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-60 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      :aria-label="item ? '编辑账号' : '新建账号'"
    >
      <div class="absolute inset-0 bg-black/30" @click="$emit('close')" />
      <div
        class="border-surface-100 bg-surface-0 relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border p-4 shadow-lg"
      >
        <div class="flex items-center justify-between">
          <h2 class="text-surface-900 text-sm font-semibold">
            {{ item ? '编辑账号' : '新建账号' }}
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

          <div class="grid grid-cols-3 gap-2.5">
            <label class="block">
              <span class="text-surface-800/60 text-[11px]">类型</span>
              <select
                v-model="form.type"
                class="border-surface-100 bg-surface-0 focus:border-brand-500 mt-0.5 w-full rounded border px-2 py-1.5 text-xs focus:outline-none"
              >
                <option v-for="t in TYPES" :key="t" :value="t">{{ t }}</option>
              </select>
            </label>
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
              <span class="text-surface-800/60 text-[11px]">优先级</span>
              <input
                v-model="form.priority"
                type="number"
                min="0"
                class="border-surface-100 bg-surface-0 focus:border-brand-500 mt-0.5 w-full rounded border px-2 py-1.5 text-xs focus:outline-none"
              />
            </label>
          </div>

          <div class="grid grid-cols-2 gap-2.5">
            <label class="block">
              <span class="text-surface-800/60 text-[11px]">并发</span>
              <input
                v-model="form.concurrency"
                type="number"
                min="1"
                max="10000"
                class="border-surface-100 bg-surface-0 focus:border-brand-500 mt-0.5 w-full rounded border px-2 py-1.5 text-xs focus:outline-none"
              />
            </label>
            <label class="block">
              <span class="text-surface-800/60 text-[11px]">倍率（rate_multiplier）</span>
              <input
                v-model="form.rateMultiplier"
                type="number"
                min="0"
                step="0.01"
                class="border-surface-100 bg-surface-0 focus:border-brand-500 mt-0.5 w-full rounded border px-2 py-1.5 text-xs focus:outline-none"
              />
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

          <fieldset>
            <legend class="text-surface-800/60 text-[11px]">
              关联分组（{{ form.groupIds.length }}）
            </legend>
            <div v-if="groups.length === 0" class="text-surface-800/40 mt-1 text-[11px]">
              暂无分组
            </div>
            <div v-else class="mt-1 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
              <label
                v-for="group in groups"
                :key="group.id"
                class="border-surface-100 flex cursor-pointer items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]"
                :class="{ 'border-brand-500/40 bg-brand-500/5': form.groupIds.includes(group.id) }"
              >
                <input v-model="form.groupIds" type="checkbox" class="size-3" :value="group.id" />
                {{ group.name }}
              </label>
            </div>
          </fieldset>

          <label class="block">
            <span class="text-surface-800/60 text-[11px]">平台凭据（JSON；创建后不再回显）</span>
            <textarea
              v-model="form.credentialsJson"
              rows="3"
              spellcheck="false"
              class="border-surface-100 bg-surface-0 focus:border-brand-500 mt-0.5 w-full rounded border px-2 py-1.5 font-mono text-[11px] focus:outline-none"
              placeholder='{"api_key": "sk-..."}'
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
