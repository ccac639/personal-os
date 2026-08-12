<script setup lang="ts">
import { computed } from 'vue';
import { MousePointer2, Trash2 } from '@lucide/vue';
import { useWorkflowStore } from '@/stores/workflow';
import { getNodeDef, nodeSummary } from './types';

const store = useWorkflowStore();

const node = computed(() => store.selectedNode);
const def = computed(() => (node.value ? getNodeDef(node.value.data.kind) : null));

/** 各类型字段：label + 类型 + data key + 占位符 */
const FIELD_DEFS: Record<
  string,
  Array<{
    key: string;
    label: string;
    type: 'text' | 'textarea' | 'number' | 'select';
    options?: string[];
    placeholder?: string;
  }>
> = {
  trigger: [{ key: 'cron', label: 'Cron 表达式', type: 'text', placeholder: '0 9 * * *' }],
  ai: [
    {
      key: 'model',
      label: '模型',
      type: 'select',
      options: ['deepseek-v3', 'glm-4.6', 'claude-sonnet-4', 'gpt-4.1'],
    },
    { key: 'prompt', label: '提示词', type: 'textarea', placeholder: '输入任务指令…' },
  ],
  code: [
    {
      key: 'lang',
      label: '语言',
      type: 'select',
      options: ['python', 'typescript', 'bash', 'sql'],
    },
    { key: 'code', label: '代码', type: 'textarea', placeholder: 'print("hello")' },
  ],
  condition: [{ key: 'expr', label: '判断表达式', type: 'text', placeholder: 'result == "ok"' }],
  notify: [
    {
      key: 'channel',
      label: '渠道',
      type: 'select',
      options: ['邮件', '钉钉', '飞书', '企业微信', 'Telegram'],
    },
    { key: 'message', label: '消息内容', type: 'textarea', placeholder: '支持 {{ 变量 }} 插值' },
  ],
  delay: [{ key: 'seconds', label: '等待秒数', type: 'number', placeholder: '60' }],
};

function patch(key: string, value: string | number) {
  if (!node.value) return;
  store.updateNodeData(node.value.id, { [key]: value } as never);
}
</script>

<template>
  <aside
    class="border-surface-100 bg-surface-0 flex w-72 shrink-0 flex-col rounded-xl border shadow-sm"
  >
    <!-- 未选中：画布概览 -->
    <template v-if="!node">
      <header class="border-surface-100 border-b px-4 py-3">
        <h2 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
          <MousePointer2 class="text-surface-800/40 size-4" />
          属性面板
        </h2>
      </header>
      <div class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <div class="text-surface-800/30 text-5xl">🖱️</div>
        <p class="text-surface-800/50 text-sm">点击画布中的节点<br />查看与编辑配置</p>
        <dl class="text-surface-800/60 mt-2 space-y-1 text-xs">
          <div class="flex justify-between gap-6">
            <dt>节点</dt>
            <dd class="text-surface-900 font-semibold tabular-nums">{{ store.stats.nodeCount }}</dd>
          </div>
          <div class="flex justify-between gap-6">
            <dt>连线</dt>
            <dd class="text-surface-900 font-semibold tabular-nums">{{ store.stats.edgeCount }}</dd>
          </div>
          <div class="flex justify-between gap-6">
            <dt>触发器</dt>
            <dd class="text-surface-900 font-semibold tabular-nums">
              {{ store.stats.triggerCount }}
            </dd>
          </div>
        </dl>
      </div>
    </template>

    <!-- 已选中：编辑节点 -->
    <template v-else>
      <header class="border-surface-100 flex items-center justify-between border-b px-4 py-3">
        <h2 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
          <span class="flex size-6 items-center justify-center rounded-md" :class="def?.chip">
            <component :is="def?.icon" class="size-3.5" />
          </span>
          {{ def?.label }}
        </h2>
        <button
          type="button"
          class="text-surface-800/40 hover:bg-surface-100 rounded-md p-1.5 transition hover:text-red-600"
          title="删除节点"
          @click="node && store.removeNode(node.id)"
        >
          <Trash2 class="size-4" />
        </button>
      </header>

      <div class="flex-1 space-y-3 overflow-y-auto p-4">
        <label class="block">
          <span class="text-surface-800/70 mb-1 block text-xs font-medium">节点名称</span>
          <input
            :value="node.data.label"
            class="border-surface-100 bg-surface-50 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-2.5 py-1.5 text-sm transition outline-none"
            @input="patch('label', ($event.target as HTMLInputElement).value)"
          />
        </label>

        <label v-for="f in FIELD_DEFS[node.data.kind] ?? []" :key="f.key" class="block">
          <span class="text-surface-800/70 mb-1 block text-xs font-medium">{{ f.label }}</span>
          <select
            v-if="f.type === 'select'"
            :value="String(node.data[f.key as keyof typeof node.data] ?? '')"
            class="border-surface-100 bg-surface-50 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-2 py-1.5 text-sm transition outline-none"
            @change="patch(f.key, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="opt in f.options" :key="opt" :value="opt">{{ opt }}</option>
          </select>
          <textarea
            v-else-if="f.type === 'textarea'"
            :value="String(node.data[f.key as keyof typeof node.data] ?? '')"
            rows="3"
            :placeholder="f.placeholder"
            class="border-surface-100 bg-surface-50 text-surface-900 focus:border-brand-500 w-full resize-none rounded-lg border px-2.5 py-1.5 text-sm transition outline-none"
            @input="patch(f.key, ($event.target as HTMLTextAreaElement).value)"
          />
          <input
            v-else
            :type="f.type"
            :value="String(node.data[f.key as keyof typeof node.data] ?? '')"
            :placeholder="f.placeholder"
            class="border-surface-100 bg-surface-50 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-2.5 py-1.5 text-sm transition outline-none"
            @input="patch(f.key, ($event.target as HTMLInputElement).value)"
          />
        </label>

        <p class="text-surface-800/40 pt-1 text-[11px] leading-relaxed">
          摘要：{{ nodeSummary(node.data) }}
        </p>
      </div>
    </template>
  </aside>
</template>
