<script setup lang="ts">
/** 渠道创建 / 编辑表单弹窗（服务端校验为准，前端仅基础必填） */
import { computed, reactive, ref, watch } from 'vue';
import { X } from '@lucide/vue';

import type { ChannelInput, Sub2ApiChannel, Sub2ApiGroup } from '@/services/sub2api';

const props = defineProps<{
  visible: boolean;
  /** null = 新建；非空 = 编辑 */
  item: Sub2ApiChannel | null;
  groups: Sub2ApiGroup[];
  /** 提交中（防重复提交） */
  busy?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [input: ChannelInput];
}>();

interface FormState {
  name: string;
  description: string;
  status: 'active' | 'disabled';
  billing_model_source: string;
  restrict_models: boolean;
  groupIds: number[];
  modelMappingJson: string;
}

function emptyForm(): FormState {
  return {
    name: '',
    description: '',
    status: 'active',
    billing_model_source: 'requested',
    restrict_models: false,
    groupIds: [],
    modelMappingJson: '{}',
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
      next.status = item.status === 'disabled' ? 'disabled' : 'active';
      next.billing_model_source = item.billing_model_source ?? 'requested';
      next.restrict_models = item.restrict_models;
      next.groupIds = [...(item.group_ids ?? [])];
      next.modelMappingJson = JSON.stringify(item.model_mapping ?? {}, null, 2);
    }
    Object.assign(form, next);
  },
  { immediate: true },
);

const canSubmit = computed(() => form.name.trim().length > 0);

function parseModelMapping(): Record<string, Record<string, string>> | null {
  const raw = form.modelMappingJson.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      error.value = '模型映射必须是 JSON 对象';
      return null;
    }
    return parsed as Record<string, Record<string, string>>;
  } catch {
    error.value = '模型映射 JSON 格式不正确';
    return null;
  }
}

function onSubmit(): void {
  if (props.busy) return; // 防重复提交（按钮 disabled + 处理器守卫双保险）
  error.value = null;
  if (!canSubmit.value) {
    error.value = '渠道名称必填';
    return;
  }
  const mapping = parseModelMapping();
  if (mapping === null) return;
  emit('submit', {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    status: form.status,
    billing_model_source: form.billing_model_source || undefined,
    restrict_models: form.restrict_models,
    group_ids: form.groupIds.length > 0 ? form.groupIds : undefined,
    model_mapping: Object.keys(mapping).length > 0 ? mapping : undefined,
  });
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-60 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      :aria-label="item ? '编辑渠道' : '新建渠道'"
      @keydown="onKeydown"
    >
      <div class="absolute inset-0 bg-black/30" @click="$emit('close')" />
      <div
        class="border-surface-100 bg-surface-0 relative w-full max-w-lg rounded-lg border p-4 shadow-lg"
      >
        <div class="flex items-center justify-between">
          <h2 class="text-surface-900 text-sm font-semibold">
            {{ item ? '编辑渠道' : '新建渠道' }}
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
          <label class="block">
            <span class="text-surface-800/60 text-[11px]">名称 *</span>
            <input
              v-model="form.name"
              type="text"
              maxlength="128"
              class="border-surface-100 bg-surface-0 focus:border-brand-500 mt-0.5 w-full rounded border px-2 py-1.5 text-xs focus:outline-none"
              placeholder="如：Claude 直连渠道"
            />
          </label>

          <label class="block">
            <span class="text-surface-800/60 text-[11px]">描述</span>
            <input
              v-model="form.description"
              type="text"
              maxlength="512"
              class="border-surface-100 bg-surface-0 focus:border-brand-500 mt-0.5 w-full rounded border px-2 py-1.5 text-xs focus:outline-none"
            />
          </label>

          <div class="grid grid-cols-2 gap-2.5">
            <label class="block">
              <span class="text-surface-800/60 text-[11px]">状态</span>
              <select
                v-model="form.status"
                class="border-surface-100 bg-surface-0 focus:border-brand-500 mt-0.5 w-full rounded border px-2 py-1.5 text-xs focus:outline-none"
              >
                <option value="active">启用</option>
                <option value="disabled">禁用</option>
              </select>
            </label>
            <label class="block">
              <span class="text-surface-800/60 text-[11px]">计费来源</span>
              <input
                v-model="form.billing_model_source"
                type="text"
                maxlength="32"
                class="border-surface-100 bg-surface-0 focus:border-brand-500 mt-0.5 w-full rounded border px-2 py-1.5 text-xs focus:outline-none"
                placeholder="requested"
              />
            </label>
          </div>

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

          <label class="flex items-center gap-2 text-[11px]">
            <input v-model="form.restrict_models" type="checkbox" class="size-3" />
            仅允许映射内模型（restrict_models）
          </label>

          <label class="block">
            <span class="text-surface-800/60 text-[11px]"
              >模型映射（JSON：platform → {上游模型: 对外模型}）</span
            >
            <textarea
              v-model="form.modelMappingJson"
              rows="4"
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
