<script setup lang="ts">
import { Play, X } from '@lucide/vue';
import { computed, reactive, ref, watch } from 'vue';

import ChatDrawer from './chat-drawer.vue';
import { agentIcon, initialAgentInputs } from '../agents';
import { useAgentsStore } from '../agent-store';
import type { AgentInputField, AgentLaunchInputs } from '../agent-types';
import { pushToast } from '../toast';

const props = defineProps<{ open: boolean; agentId: string | null }>();

const emit = defineEmits<{ close: []; launched: [sessionId: string] }>();

const store = useAgentsStore();

const agent = computed(() => store.agentById(props.agentId ?? ''));
const values = reactive<AgentLaunchInputs>({});
const error = ref<string | null>(null);

/** 打开时初始化默认值 */
watch(
  () => props.open,
  (open) => {
    if (open && agent.value) {
      const init = initialAgentInputs(agent.value);
      for (const k of Object.keys(values)) delete values[k];
      Object.assign(values, init);
      error.value = null;
    }
  },
);

function fieldValue(field: AgentInputField): string | boolean | string[] {
  return values[field.key] ?? '';
}

function setValue(field: AgentInputField, value: string | boolean | string[]) {
  values[field.key] = value;
}

function toggleTag(field: AgentInputField, tag: string) {
  const current = Array.isArray(values[field.key]) ? (values[field.key] as string[]) : [];
  values[field.key] = current.includes(tag)
    ? current.filter((t) => t !== tag)
    : [...current, tag];
}

function submit() {
  if (!agent.value) return;
  error.value = null;
  const result = store.launchAgent(agent.value.id, { ...values });
  if (!result.ok) {
    error.value = result.error ?? '启动失败';
    return;
  }
  pushToast(`已创建「${agent.value.name}」会话，草稿已填入输入框`, 'success');
  emit('launched', result.sessionId ?? '');
}
</script>

<template>
  <ChatDrawer
    :open="open"
    :title="`启动智能体：${agent?.name ?? ''}`"
    aria-label="启动智能体"
    @close="emit('close')"
  >
    <div v-if="agent" class="flex flex-col gap-4 p-4">
      <div class="flex items-center gap-2.5">
        <div
          class="flex size-8 items-center justify-center rounded-lg text-white"
          :style="{ background: agent.color }"
          aria-hidden="true"
        >
          <component :is="agentIcon(agent.icon)" class="size-4" />
        </div>
        <div class="min-w-0">
          <p class="text-surface-900 text-sm font-semibold">{{ agent.name }}</p>
          <p class="text-surface-800/50 truncate text-[11px]">{{ agent.description }}</p>
        </div>
      </div>

      <!-- 输入字段 -->
      <form class="flex flex-col gap-3" @submit.prevent="submit">
        <div v-for="field in agent.inputFields" :key="field.key" class="flex flex-col gap-1">
          <label class="text-surface-900 flex items-center gap-1 text-xs font-medium">
            {{ field.label }}
            <span v-if="field.required" class="text-red-500" aria-hidden="true">*</span>
          </label>

          <!-- textarea -->
          <textarea
            v-if="field.type === 'textarea'"
            class="border-surface-100 bg-surface-50 focus:border-brand-500 focus:ring-brand-500/30 min-h-20 resize-y rounded-lg border px-2.5 py-2 text-xs outline-none focus:ring-2"
            :placeholder="field.placeholder"
            :value="fieldValue(field) as string"
            @input="setValue(field, ($event.target as HTMLTextAreaElement).value)"
          />

          <!-- text -->
          <input
            v-else-if="field.type === 'text'"
            class="border-surface-100 bg-surface-50 focus:border-brand-500 focus:ring-brand-500/30 rounded-lg border px-2.5 py-1.5 text-xs outline-none focus:ring-2"
            :placeholder="field.placeholder"
            :value="fieldValue(field) as string"
            @input="setValue(field, ($event.target as HTMLInputElement).value)"
          />

          <!-- select -->
          <select
            v-else-if="field.type === 'select'"
            class="border-surface-100 bg-surface-50 focus:border-brand-500 focus:ring-brand-500/30 rounded-lg border px-2 py-1.5 text-xs outline-none focus:ring-2"
            :value="fieldValue(field) as string"
            @change="setValue(field, ($event.target as HTMLSelectElement).value)"
          >
            <option
              v-for="opt in field.options ?? []"
              :key="opt.value"
              :value="opt.value"
            >
{{ opt.label }}
</option>
          </select>

          <!-- tags -->
          <div v-else-if="field.type === 'tags'" class="flex flex-wrap gap-1.5">
            <button
              v-for="tag in (field.defaultValue as string[] | undefined) ?? ['类型安全', '性能', '可读性', '安全']"
              :key="tag"
              type="button"
              class="border-surface-100 hover:border-brand-500/50 focus-visible:ring-brand-500/40 rounded-lg border px-2 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2"
              :class="(fieldValue(field) as string[]).includes(tag) ? 'bg-brand-500/10 border-brand-500/50 text-brand-600' : 'text-surface-800/60'"
              :aria-pressed="(fieldValue(field) as string[]).includes(tag)"
              @click="toggleTag(field, tag)"
            >
{{ tag }}
</button>
          </div>

          <!-- switch -->
          <label v-else-if="field.type === 'switch'" class="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              class="accent-brand-500 size-3.5"
              :checked="fieldValue(field) === true"
              @change="setValue(field, ($event.target as HTMLInputElement).checked)"
            />
            <span class="text-surface-800/70">{{ field.help ?? '开启' }}</span>
          </label>

          <p v-if="field.help && field.type !== 'switch'" class="text-surface-800/40 text-[10px]">{{ field.help }}</p>
        </div>

        <p v-if="error" class="text-red-500 text-[11px]" role="alert">{{ error }}</p>

        <p class="text-surface-800/40 text-[10px]">
          启动后将创建新会话并预填草稿，不会自动发送
        </p>
      </form>
    </div>

    <template #footer>
      <button
        class="hover:bg-surface-100 text-surface-800/70 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
        aria-label="取消"
        @click="emit('close')"
      >
        <X class="size-3.5" />
        取消
      </button>
      <button
        class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-4 py-1.5 text-xs font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2"
        aria-label="开始使用"
        @click="submit"
      >
        <Play class="size-3.5" />
        开始使用
      </button>
    </template>
  </ChatDrawer>
</template>
