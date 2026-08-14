<script setup lang="ts">
import { Loader2, Save, X } from '@lucide/vue';
import { computed, reactive, ref, watch } from 'vue';

import ChatDrawer from './chat-drawer.vue';
import {
  AGENT_CATEGORIES,
  AGENT_ICON_KEYS,
  agentIcon,
  emptyAgentForm,
  validateAgentForm,
} from '../agents';
import { useAgentsStore } from '../agent-store';
import type { AgentCategory, ChatAgent } from '../agent-types';
import { CHAT_MODELS } from '../models';
import { pushToast } from '../toast';
import { requestIdSuffix } from '@/features/agents/errors';

const props = defineProps<{
  open: boolean;
  /** 编辑目标 id；null 为新建 */
  editId: string | null;
  /** 复制来源 id（从任一智能体复制创建变体） */
  copyFromId?: string | null;
  /** 表单预填（从消息 / 灵感创建变体） */
  prefill?: { title: string; prompt: string; source: 'message' | 'inspiration' } | null;
}>();

const emit = defineEmits<{ close: [] }>();

const store = useAgentsStore();

const form = reactive({
  name: '',
  description: '',
  category: 'writing' as AgentCategory,
  icon: 'pen-line',
  color: 'var(--chat-rose)',
  tagsText: '',
  systemPrompt: '',
  recommendedModelId: 'general-reasoning',
  recommendedMode: 'chat' as ChatAgent['recommendedMode'],
  starterPromptsText: '',
});

const errors = ref<{
  name?: string;
  description?: string;
  systemPrompt?: string;
  recommendedModelId?: string;
}>({});
const isEdit = computed(() => props.editId !== null);

const modes = [
  { key: 'chat', label: '对话' },
  { key: 'writing', label: '写作' },
  { key: 'code', label: '代码' },
  { key: 'image', label: '图像提示词' },
] as const;

const modelOptions = computed(() => CHAT_MODELS.filter((m) => m.available));

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    errors.value = {};
    const editTarget = props.editId ? store.agentById(props.editId) : undefined;
    const copySource = props.copyFromId ? store.agentById(props.copyFromId) : undefined;
    const source = editTarget ?? copySource;
    if (source) {
      form.name = source.name;
      form.description = source.description;
      form.category = source.category;
      form.icon = source.icon;
      form.color = source.color;
      form.tagsText = source.tags.join('、');
      form.systemPrompt = source.systemPrompt;
      form.recommendedModelId = source.recommendedModelId;
      form.recommendedMode = source.recommendedMode;
      form.starterPromptsText = source.starterPrompts.join('\n');
    } else if (props.prefill) {
      // 消息 / 灵感预填：标题 + 提示词作为系统提示词，来源备注进简介
      const empty = emptyAgentForm();
      Object.assign(form, empty);
      form.name = props.prefill.title;
      form.systemPrompt = props.prefill.prompt;
      form.starterPromptsText = props.prefill.prompt;
      form.description =
        props.prefill.source === 'message'
          ? '由对话消息创建的个人智能体'
          : '由灵感创建的个人智能体';
      form.tagsText = '';
    } else {
      const empty = emptyAgentForm();
      Object.assign(form, empty);
      form.tagsText = '';
      form.starterPromptsText = '';
    }
  },
);

function parseTags(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[,，、\n]/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ].slice(0, 8);
}

function save() {
  const errs = validateAgentForm({
    name: form.name,
    description: form.description,
    systemPrompt: form.systemPrompt,
    recommendedModelId: form.recommendedModelId,
  });
  errors.value = errs;
  if (Object.keys(errs).length > 0) return;

  void submit();
}

async function submit() {
  if (store.saving) return;
  const payload: Partial<ChatAgent> = {
    name: form.name.trim(),
    description: form.description.trim(),
    category: form.category,
    icon: form.icon,
    color: form.color,
    tags: parseTags(form.tagsText),
    systemPrompt: form.systemPrompt.trim(),
    recommendedModelId: form.recommendedModelId,
    recommendedMode: form.recommendedMode,
    starterPrompts: form.starterPromptsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
  };

  if (isEdit.value && props.editId) {
    const ok = await store.updateAgent(props.editId, payload);
    if (!ok) {
      pushToast(
        (store.actionError?.message ?? '保存失败，请稍后再试') + requestIdSuffix(store.actionError),
        'error',
      );
      return;
    }
    pushToast('已保存修改', 'success');
  } else {
    const created = await store.createAgent(payload);
    if (!created) {
      pushToast(
        (store.actionError?.message ?? '创建失败，请稍后再试') + requestIdSuffix(store.actionError),
        'error',
      );
      return;
    }
    pushToast('已创建个人智能体', 'success');
  }
  emit('close');
}
</script>

<template>
  <ChatDrawer
    :open="open"
    :title="isEdit ? '编辑智能体' : '创建个人智能体'"
    aria-label="智能体表单"
    @close="emit('close')"
  >
    <form class="flex flex-col gap-3.5 p-4" @submit.prevent="save">
      <div class="flex flex-col gap-1">
        <label class="text-surface-900 text-xs font-medium"
          >名称 <span class="text-red-500">*</span></label
        >
        <input
          v-model="form.name"
          class="border-surface-100 bg-surface-50 focus:border-brand-500 focus:ring-brand-500/30 rounded-lg border px-2.5 py-1.5 text-xs outline-none focus:ring-2"
          placeholder="智能体名称"
        />
        <p v-if="errors.name" class="text-[11px] text-red-500" role="alert">{{ errors.name }}</p>
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-surface-900 text-xs font-medium"
          >简介 <span class="text-red-500">*</span></label
        >
        <textarea
          v-model="form.description"
          class="border-surface-100 bg-surface-50 focus:border-brand-500 focus:ring-brand-500/30 min-h-14 resize-y rounded-lg border px-2.5 py-2 text-xs outline-none focus:ring-2"
          placeholder="一句话说明这个智能体的用途"
        />
        <p v-if="errors.description" class="text-[11px] text-red-500" role="alert">
          {{ errors.description }}
        </p>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1">
          <label class="text-surface-900 text-xs font-medium">类别</label>
          <select
            v-model="form.category"
            class="border-surface-100 bg-surface-50 rounded-lg border px-2 py-1.5 text-xs outline-none"
          >
            <option v-for="c in AGENT_CATEGORIES" :key="c.key" :value="c.key">{{ c.label }}</option>
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-surface-900 text-xs font-medium">推荐模型</label>
          <select
            v-model="form.recommendedModelId"
            class="border-surface-100 bg-surface-50 rounded-lg border px-2 py-1.5 text-xs outline-none"
          >
            <option v-for="m in modelOptions" :key="m.id" :value="m.id">{{ m.label }}</option>
          </select>
          <p v-if="errors.recommendedModelId" class="text-[11px] text-red-500" role="alert">
            {{ errors.recommendedModelId }}
          </p>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1">
          <label class="text-surface-900 text-xs font-medium">输出模式</label>
          <select
            v-model="form.recommendedMode"
            class="border-surface-100 bg-surface-50 rounded-lg border px-2 py-1.5 text-xs outline-none"
          >
            <option v-for="m in modes" :key="m.key" :value="m.key">{{ m.label }}</option>
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-surface-900 text-xs font-medium">图标</label>
          <div class="flex flex-wrap items-center gap-1">
            <button
              v-for="key in AGENT_ICON_KEYS"
              :key="key"
              type="button"
              class="hover:bg-surface-100 focus-visible:ring-brand-500/40 flex size-7 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
              :class="form.icon === key ? 'bg-surface-100 text-brand-600' : 'text-surface-800/60'"
              :aria-label="`选择图标 ${key}`"
              :aria-pressed="form.icon === key"
              @click="form.icon = key"
            >
              <component :is="agentIcon(key)" class="size-4" />
            </button>
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-surface-900 text-xs font-medium">能力标签</label>
        <input
          v-model="form.tagsText"
          class="border-surface-100 bg-surface-50 focus:border-brand-500 focus:ring-brand-500/30 rounded-lg border px-2.5 py-1.5 text-xs outline-none focus:ring-2"
          placeholder="用顿号分隔，如：写作、润色、长文"
        />
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-surface-900 text-xs font-medium"
          >系统提示词 <span class="text-red-500">*</span></label
        >
        <textarea
          v-model="form.systemPrompt"
          class="border-surface-100 bg-surface-50 focus:border-brand-500 focus:ring-brand-500/30 min-h-28 resize-y rounded-lg border px-2.5 py-2 font-mono text-[11px] leading-relaxed outline-none focus:ring-2"
          placeholder="定义这个智能体的角色与行为"
        />
        <p v-if="errors.systemPrompt" class="text-[11px] text-red-500" role="alert">
          {{ errors.systemPrompt }}
        </p>
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-surface-900 text-xs font-medium">示例任务（每行一个）</label>
        <textarea
          v-model="form.starterPromptsText"
          class="border-surface-100 bg-surface-50 focus:border-brand-500 focus:ring-brand-500/30 min-h-12 resize-y rounded-lg border px-2.5 py-2 text-xs outline-none focus:ring-2"
          placeholder="每行一个示例任务"
        />
      </div>

      <p class="text-surface-800/35 text-[10px]">
        启动字段可稍后在智能体目录编辑；系统提示词会作为会话级提示词生效。
      </p>
    </form>

    <template #footer>
      <button
        class="hover:bg-surface-100 text-surface-800/70 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
        aria-label="取消"
        @click="emit('close')"
      >
        <X class="size-3.5" />
        取消
      </button>
      <button
        class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-4 py-1.5 text-xs font-medium text-white transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
        aria-label="保存"
        :disabled="store.saving"
        @click="save"
      >
        <Loader2 v-if="store.saving" class="size-3.5 animate-spin" />
        <Save v-else class="size-3.5" />
        {{ store.saving ? '保存中…' : '保存' }}
      </button>
    </template>
  </ChatDrawer>
</template>
