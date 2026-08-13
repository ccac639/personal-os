<script setup lang="ts">
import { Lightbulb, Save, X } from '@lucide/vue';
import { computed, reactive, watch } from 'vue';

import ChatDrawer from './chat-drawer.vue';
import { INSPIRATION_CATEGORIES } from '../inspiration';
import { useInspirationStore } from '../inspiration-store';
import type { InspirationCategory } from '../inspiration-types';
import { pushToast } from '../toast';

const store = useInspirationStore();

/** 可选类别（不含「全部」） */
const categoryOptions = INSPIRATION_CATEGORIES.filter((c) => c.key !== 'all');

const form = reactive({
  title: '',
  summary: '',
  prompt: '',
  category: 'other' as InspirationCategory,
  tagsText: '',
});

const open = computed(() => store.pendingSave !== null);
const draft = computed(() => store.pendingSave?.draft);

const emit = defineEmits<{ navigateInspiration: []; close: [] }>();

watch(
  () => store.pendingSave,
  (pending) => {
    if (!pending) return;
    form.title = pending.draft.title;
    form.summary = pending.draft.summary;
    form.prompt = pending.draft.prompt;
    form.category = pending.draft.category;
    form.tagsText = pending.draft.tags.join('、');
  },
  { immediate: true },
);

function close() {
  store.cancelSave();
  emit('close');
}

function save(stay: boolean) {
  const title = form.title.trim();
  if (!title) {
    pushToast('标题不能为空', 'warning');
    return;
  }
  const tags = [...new Set(form.tagsText.split(/[,，、\n]/).map((t) => t.trim()).filter(Boolean))];
  const item = store.commitSave({
    title,
    summary: form.summary.trim(),
    prompt: form.prompt.trim(),
    category: form.category,
    tags,
    source: draft.value?.source ?? 'chat',
    relatedAgentId: draft.value?.relatedAgentId,
    relatedModelId: draft.value?.relatedModelId,
    relatedConversationId: draft.value?.relatedConversationId,
  });
  if (item) {
    pushToast('已保存到灵感库', 'success');
    if (stay) {
      emit('close');
    } else {
      emit('navigateInspiration');
    }
  }
}
</script>

<template>
  <ChatDrawer
    :open="open"
    title="保存为灵感"
    aria-label="保存为灵感"
    @close="close"
  >
    <form class="flex flex-col gap-3.5 p-4" @submit.prevent="save(true)">
      <p class="text-surface-800/55 text-xs leading-relaxed">
        只保存文本与结构化元数据，不含附件与完整会话记录。
      </p>

      <div class="flex flex-col gap-1">
        <label class="text-surface-900 text-xs font-medium">标题 <span class="text-red-500">*</span></label>
        <input
          v-model="form.title"
          class="border-surface-100 bg-surface-50 focus:border-brand-500 focus:ring-brand-500/30 rounded-lg border px-2.5 py-1.5 text-xs outline-none focus:ring-2"
          placeholder="给这条灵感起个标题"
        />
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-surface-900 text-xs font-medium">摘要</label>
        <textarea
          v-model="form.summary"
          class="border-surface-100 bg-surface-50 focus:border-brand-500 focus:ring-brand-500/30 min-h-12 resize-y rounded-lg border px-2.5 py-2 text-xs outline-none focus:ring-2"
          placeholder="一句话摘要"
        />
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-surface-900 text-xs font-medium">提示词</label>
        <textarea
          v-model="form.prompt"
          class="border-surface-100 bg-surface-50 focus:border-brand-500 focus:ring-brand-500/30 min-h-24 resize-y rounded-lg border px-2.5 py-2 font-mono text-[11px] leading-relaxed outline-none focus:ring-2"
          placeholder="完整提示词内容"
        />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1">
          <label class="text-surface-900 text-xs font-medium">类别</label>
          <select v-model="form.category" class="border-surface-100 bg-surface-50 rounded-lg border px-2 py-1.5 text-xs outline-none">
            <option v-for="c in categoryOptions" :key="c.key" :value="c.key">{{ c.label }}</option>
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-surface-900 text-xs font-medium">标签</label>
          <input
            v-model="form.tagsText"
            class="border-surface-100 bg-surface-50 focus:border-brand-500 focus:ring-brand-500/30 rounded-lg border px-2.5 py-1.5 text-xs outline-none focus:ring-2"
            placeholder="顿号分隔"
          />
        </div>
      </div>

      <p class="text-surface-800/35 text-[10px]">来源：{{ draft?.source === 'chat' ? '从对话保存' : '手动创建' }}</p>
    </form>

    <template #footer>
      <button
        class="hover:bg-surface-100 text-surface-800/70 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
        aria-label="取消"
        @click="close"
      >
        <X class="size-3.5" />
        取消
      </button>
      <button
        class="hover:bg-surface-100 text-surface-800/70 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
        aria-label="保存并留在对话"
        @click="save(true)"
      >
        <Save class="size-3.5" />
        留在对话
      </button>
      <button
        class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-3.5 py-1.5 text-xs font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2"
        aria-label="保存并前往灵感广场"
        @click="save(false)"
      >
        <Lightbulb class="size-3.5" />
        保存并前往
      </button>
    </template>
  </ChatDrawer>
</template>
