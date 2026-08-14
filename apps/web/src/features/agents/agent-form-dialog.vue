<script setup lang="ts">
/**
 * Agents 管理 —— 创建 / 编辑表单抽屉
 *
 * 校验覆盖后端实际字段：名称 ≤100、描述 ≤500、模型 ≤100、提供方枚举、
 * 系统提示词 ≤4_000，另含收藏与启用开关（编辑态）。
 * 提交走 store.saving pending 通道：按钮禁用 + 防重复提交；
 * API 失败展示用户可读信息并保留 requestId。
 */
import { Loader2, Save, X } from '@lucide/vue';
import { computed, reactive, ref, watch } from 'vue';

import AppDrawer from '@/components/AppDrawer.vue';
import { toast } from '@/app/ui';

import { requestIdSuffix } from './errors';
import { useAgentAdminStore } from './store';
import type { AgentRecord } from './types';
import {
  AGENT_LIMITS,
  AGENT_PROVIDER_OPTIONS,
  buildCreatePayload,
  buildUpdatePayload,
  emptyAgentForm,
  validateAgentForm,
} from './validation';
import type { AgentFormErrors, AgentFormValues } from './validation';

const props = defineProps<{
  open: boolean;
  /** 编辑目标；null 为新建 */
  agent: AgentRecord | null;
}>();

const emit = defineEmits<{ close: []; saved: [agent: AgentRecord] }>();

const store = useAgentAdminStore();

const isEdit = computed(() => props.agent !== null);
const form = reactive<AgentFormValues>(emptyAgentForm());
const errors = ref<AgentFormErrors>({});

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    errors.value = {};
    store.clearActionError();
    const a = props.agent;
    if (a) {
      form.name = a.name;
      form.description = a.description ?? '';
      form.model = a.model;
      form.provider = a.provider;
      form.systemPrompt = a.systemPrompt ?? '';
      form.favorite = a.favorite;
      form.enabled = a.enabled;
    } else {
      Object.assign(form, emptyAgentForm());
    }
  },
);

async function submit(): Promise<void> {
  const errs = validateAgentForm(form);
  errors.value = errs;
  if (Object.keys(errs).length > 0) return;
  if (store.saving) return; // 防重复提交

  if (isEdit.value && props.agent) {
    const updated = await store.updateAgent(
      props.agent.id,
      buildUpdatePayload(form, props.agent),
      'form',
    );
    if (updated) {
      toast.success('已保存修改');
      emit('saved', updated);
    } else {
      toast.error(store.actionError?.message ?? '保存失败');
    }
  } else {
    const created = await store.createAgent(buildCreatePayload(form));
    if (created) {
      toast.success('已创建智能体');
      emit('saved', created);
    } else {
      toast.error(store.actionError?.message ?? '创建失败');
    }
  }
}

/** 提交中不允许关闭（Escape / 遮罩 / 取消都拦截，避免状态丢失） */
function onClose(): void {
  if (store.saving) return;
  emit('close');
}

function counterClass(over: boolean): string {
  return over ? 'text-red-500' : 'text-surface-800/35';
}
</script>

<template>
  <AppDrawer :open="open" :title="isEdit ? '编辑智能体' : '创建智能体'" @close="onClose">
    <form class="flex flex-col gap-3.5 p-4" @submit.prevent="submit">
      <!-- 名称 -->
      <div class="flex flex-col gap-1">
        <label class="text-surface-900 text-xs font-medium" for="agent-form-name">
          名称 <span class="text-red-500">*</span>
        </label>
        <input
          id="agent-form-name"
          v-model="form.name"
          class="border-surface-100 bg-surface-50 focus:border-brand-500 focus:ring-brand-500/30 rounded-lg border px-2.5 py-1.5 text-xs outline-none focus:ring-2"
          :maxlength="AGENT_LIMITS.NAME_MAX"
          placeholder="智能体名称"
          data-testid="agent-form-name"
        />
        <p v-if="errors.name" class="text-[11px] text-red-500" role="alert">{{ errors.name }}</p>
      </div>

      <!-- 描述 -->
      <div class="flex flex-col gap-1">
        <div class="flex items-baseline justify-between gap-2">
          <label class="text-surface-900 text-xs font-medium" for="agent-form-description"
            >描述</label
          >
          <span
            class="text-surface-800/35 text-[10px]"
            :class="counterClass(form.description.length > AGENT_LIMITS.DESCRIPTION_MAX)"
          >
            {{ form.description.length }}/{{ AGENT_LIMITS.DESCRIPTION_MAX }}
          </span>
        </div>
        <textarea
          id="agent-form-description"
          v-model="form.description"
          class="border-surface-100 bg-surface-50 focus:border-brand-500 focus:ring-brand-500/30 min-h-14 resize-y rounded-lg border px-2.5 py-2 text-xs outline-none focus:ring-2"
          :maxlength="AGENT_LIMITS.DESCRIPTION_MAX"
          placeholder="一句话说明这个智能体的用途"
          data-testid="agent-form-description"
        />
        <p v-if="errors.description" class="text-[11px] text-red-500" role="alert">
          {{ errors.description }}
        </p>
      </div>

      <!-- 提供方 + 模型 -->
      <div class="flex flex-col gap-1">
        <label class="text-surface-900 text-xs font-medium" for="agent-form-provider"
          >模型提供方</label
        >
        <select
          id="agent-form-provider"
          v-model="form.provider"
          class="border-surface-100 bg-surface-50 rounded-lg border px-2 py-1.5 text-xs outline-none"
          data-testid="agent-form-provider"
        >
          <option v-for="o in AGENT_PROVIDER_OPTIONS" :key="o.value" :value="o.value">
            {{ o.label }}
          </option>
        </select>
        <p v-if="errors.provider" class="text-[11px] text-red-500" role="alert">
          {{ errors.provider }}
        </p>
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-surface-900 text-xs font-medium" for="agent-form-model">
          模型 <span class="text-red-500">*</span>
        </label>
        <input
          id="agent-form-model"
          v-model="form.model"
          class="border-surface-100 bg-surface-50 focus:border-brand-500 focus:ring-brand-500/30 rounded-lg border px-2.5 py-1.5 text-xs outline-none focus:ring-2"
          :maxlength="AGENT_LIMITS.MODEL_MAX"
          placeholder="如 gpt-4o-mini / Qwen/Qwen2.5-72B-Instruct"
          spellcheck="false"
          data-testid="agent-form-model"
        />
        <p v-if="errors.model" class="text-[11px] text-red-500" role="alert">{{ errors.model }}</p>
      </div>

      <!-- 系统提示词 -->
      <div class="flex flex-col gap-1">
        <div class="flex items-baseline justify-between gap-2">
          <label class="text-surface-900 text-xs font-medium" for="agent-form-system-prompt"
            >系统提示词</label
          >
          <span
            class="text-surface-800/35 text-[10px]"
            :class="counterClass(form.systemPrompt.length > AGENT_LIMITS.SYSTEM_PROMPT_MAX)"
          >
            {{ form.systemPrompt.length }}/{{ AGENT_LIMITS.SYSTEM_PROMPT_MAX }}
          </span>
        </div>
        <textarea
          id="agent-form-system-prompt"
          v-model="form.systemPrompt"
          class="border-surface-100 bg-surface-50 focus:border-brand-500 focus:ring-brand-500/30 min-h-28 resize-y rounded-lg border px-2.5 py-2 font-mono text-[11px] leading-relaxed outline-none focus:ring-2"
          :maxlength="AGENT_LIMITS.SYSTEM_PROMPT_MAX"
          placeholder="定义这个智能体的角色与行为"
          data-testid="agent-form-system-prompt"
        />
        <p v-if="errors.systemPrompt" class="text-[11px] text-red-500" role="alert">
          {{ errors.systemPrompt }}
        </p>
      </div>

      <!-- 能力开关 -->
      <div class="flex flex-col gap-1.5">
        <label class="text-surface-900 flex cursor-pointer items-center gap-2 text-xs font-medium">
          <input
            v-model="form.favorite"
            type="checkbox"
            class="accent-brand-500 size-3.5"
            data-testid="agent-form-favorite"
          />
          收藏（置顶展示）
        </label>
        <label
          v-if="isEdit"
          class="text-surface-900 flex cursor-pointer items-center gap-2 text-xs font-medium"
        >
          <input
            v-model="form.enabled"
            type="checkbox"
            class="accent-brand-500 size-3.5"
            data-testid="agent-form-enabled"
          />
          启用（停用后不可启动会话）
        </label>
      </div>

      <!-- API 失败提示（保留 requestId） -->
      <div
        v-if="store.actionError"
        class="rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-xs leading-relaxed text-red-600"
        role="alert"
        data-testid="agent-form-error"
      >
        {{ store.actionError.message }}{{ requestIdSuffix(store.actionError) }}
      </div>

      <p class="text-surface-800/35 text-[10px]">
        系统提示词会作为会话级提示词生效；创建后可随时编辑或删除。
      </p>

      <div class="border-surface-100 flex justify-end gap-2 border-t pt-3">
        <button
          class="hover:bg-surface-100 text-surface-800/70 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
          type="button"
          :disabled="store.saving"
          aria-label="取消"
          @click="onClose"
        >
          <X class="size-3.5" />
          取消
        </button>
        <button
          class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-4 py-1.5 text-xs font-medium text-white transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
          type="submit"
          :disabled="store.saving"
          aria-label="保存"
          data-testid="agent-form-submit"
          @click="submit"
        >
          <Loader2 v-if="store.saving" class="size-3.5 animate-spin" />
          <Save v-else class="size-3.5" />
          {{ store.saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </form>
  </AppDrawer>
</template>
