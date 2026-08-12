<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { MousePointer2, RotateCcw, Trash2, X } from '@lucide/vue';
import { useWorkflowStore } from './store';
import { getNodeDef, nodeSummary, type WorkflowNodeData } from './types';
import {
  delayToSeconds,
  getNodeSchema,
  validateNodeData,
  type NodeField,
  type NodeSchema,
} from './schema';
import { extractVars } from './vars';

const store = useWorkflowStore();

/** 窄屏（<1024px）时检查器切换为底部抽屉，仅选中节点时出现 */
const isWide = ref(true);
let media: MediaQueryList | null = null;
function syncWidth() {
  isWide.value = !media || media.matches;
}
onMounted(() => {
  media = window.matchMedia('(min-width: 1024px)');
  syncWidth();
  media.addEventListener?.('change', syncWidth);
});
onBeforeUnmount(() => {
  media?.removeEventListener?.('change', syncWidth);
});

const node = computed(() => store.selectedNode);
const def = computed(() => (node.value ? getNodeDef(node.value.data.kind) : null));
const schema = computed<NodeSchema | null>(() =>
  node.value ? getNodeSchema(node.value.data.kind) : null,
);

/** 字段级校验错误（每次输入即时重算） */
const fieldErrors = computed<Record<string, string>>(() => {
  if (!node.value) return {};
  return validateNodeData(node.value.data);
});

/** 文本类字段中引用的变量（提示插值能力） */
const templateVars = computed<string[]>(() => {
  if (!node.value) return [];
  const data = node.value.data;
  const texts: string[] = [];
  if (data.template) texts.push(data.template);
  if (data.prompt) texts.push(data.prompt);
  if (data.message) texts.push(data.message);
  return extractVars(texts.join('\n'));
});

/** 延迟换算展示：value + unit → 秒 */
const delaySeconds = computed(() => {
  if (!node.value || node.value.data.kind !== 'delay') return null;
  const d = node.value.data;
  const value = Number(d.delayValue ?? d.seconds ?? 0);
  const unit = d.delayUnit ?? 's';
  return delayToSeconds(value, unit);
});

function patch(key: string, value: string | number) {
  if (!node.value) return;
  store.updateNodeData(node.value.id, { [key]: value } as Partial<WorkflowNodeData>);
}

function patchNumber(key: string, raw: string) {
  if (!node.value) return;
  const n = raw === '' ? '' : Number(raw);
  store.updateNodeData(node.value.id, { [key]: n } as unknown as Partial<WorkflowNodeData>);
}

function patchDelayValue(raw: string) {
  if (!node.value || node.value.data.kind !== 'delay') return;
  const n = raw === '' ? '' : Number(raw);
  store.updateNodeData(node.value.id, {
    delayValue: n as number,
    delayUnit: node.value.data.delayUnit ?? 's',
  });
}

function patchDelayUnit(unit: string) {
  if (!node.value || node.value.data.kind !== 'delay') return;
  store.updateNodeData(node.value.id, {
    delayUnit: unit as WorkflowNodeData['delayUnit'],
    delayValue: node.value.data.delayValue ?? node.value.data.seconds ?? 0,
  });
}

/** 恢复默认值（label 一并恢复为类型默认） */
function resetField() {
  if (!node.value) return;
  const kind = node.value.data.kind;
  const defaults = store.resetToDefaults(kind);
  store.updateNodeData(node.value.id, {
    ...defaults,
    label: getNodeDef(kind).label,
  });
}

const closeDrawer = () => store.selectNode(null);

/** 字段值读取（受控组件绑定） */
function fieldValue(f: NodeField): string {
  if (!node.value) return '';
  const v = node.value.data[f.key as keyof WorkflowNodeData];
  return v === undefined || v === null ? '' : String(v);
}
</script>

<template>
  <!--
    宽屏：右侧常驻属性面板；窄屏：选中节点时底部抽屉。
    两份模板共用同一 schema 与校验逻辑（见 script），避免维护两份字段定义。
  -->
  <aside
    v-if="isWide"
    class="border-surface-100 bg-surface-0 flex w-72 shrink-0 flex-col rounded-xl border shadow-sm"
  >
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

    <template v-else>
      <header class="border-surface-100 flex items-center justify-between border-b px-4 py-3">
        <h2 class="text-surface-900 flex min-w-0 items-center gap-2 text-sm font-semibold">
          <span
            class="flex size-6 shrink-0 items-center justify-center rounded-md"
            :class="def?.chip"
          >
            <component :is="def?.icon" class="size-3.5" />
          </span>
          <span class="truncate">{{ def?.label }}</span>
        </h2>
        <div class="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            class="text-surface-800/40 hover:bg-surface-100 hover:text-surface-900 rounded-md p-1.5 transition"
            title="恢复默认配置"
            aria-label="恢复默认配置"
            @click="resetField"
          >
            <RotateCcw class="size-3.5" />
          </button>
          <button
            type="button"
            class="text-surface-800/40 hover:bg-surface-100 rounded-md p-1.5 transition hover:text-red-600"
            title="删除节点"
            aria-label="删除节点"
            @click="node && store.removeNode(node.id)"
          >
            <Trash2 class="size-3.5" />
          </button>
        </div>
      </header>

      <div class="flex-1 space-y-3 overflow-y-auto p-4">
        <!-- 节点名称 -->
        <label class="block">
          <span class="text-surface-800/70 mb-1 block text-xs font-medium">节点名称</span>
          <input
            :value="fieldValue({ key: 'label' } as NodeField)"
            :class="[
              'border-surface-100 bg-surface-50 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-2.5 py-1.5 text-sm transition outline-none',
              fieldErrors.label && 'border-red-500/60',
            ]"
            @input="patch('label', ($event.target as HTMLInputElement).value)"
          />
          <span v-if="fieldErrors.label" class="mt-1 block text-[11px] text-red-600">
            {{ fieldErrors.label }}
          </span>
        </label>

        <!-- schema 字段 -->
        <label v-for="f in schema?.fields ?? []" :key="f.key" class="block">
          <span class="text-surface-800/70 mb-1 block text-xs font-medium">{{ f.label }}</span>

          <!-- 单位 + 数值（延迟） -->
          <div v-if="f.type === 'unit-number'" class="flex items-center gap-1.5">
            <input
              type="number"
              :min="f.min"
              :max="f.max"
              :step="f.step ?? 1"
              :value="fieldValue(f)"
              :placeholder="f.placeholder"
              :class="[
                'border-surface-100 bg-surface-50 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-2.5 py-1.5 text-sm transition outline-none',
                fieldErrors[f.key] && 'border-red-500/60',
              ]"
              @input="patchDelayValue(($event.target as HTMLInputElement).value)"
            />
            <select
              :value="node.data.delayUnit ?? 's'"
              class="border-surface-100 bg-surface-50 text-surface-900 focus:border-brand-500 w-24 shrink-0 rounded-lg border px-2 py-1.5 text-sm outline-none"
              @change="patchDelayUnit(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="opt in f.unitOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>

          <!-- 下拉 -->
          <select
            v-else-if="f.type === 'select'"
            :value="fieldValue(f)"
            :class="[
              'border-surface-100 bg-surface-50 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-2 py-1.5 text-sm transition outline-none',
              fieldErrors[f.key] && 'border-red-500/60',
            ]"
            @change="patch(f.key, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="opt in f.options" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>

          <!-- 数字 -->
          <input
            v-else-if="f.type === 'number'"
            type="number"
            :min="f.min"
            :max="f.max"
            :step="f.step ?? 1"
            :value="fieldValue(f)"
            :placeholder="f.placeholder"
            :class="[
              'border-surface-100 bg-surface-50 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-2.5 py-1.5 text-sm transition outline-none',
              fieldErrors[f.key] && 'border-red-500/60',
            ]"
            @input="patchNumber(f.key, ($event.target as HTMLInputElement).value)"
          />

          <!-- 多行文本 -->
          <textarea
            v-else-if="f.type === 'textarea'"
            :value="fieldValue(f)"
            rows="3"
            :placeholder="f.placeholder"
            :class="[
              'border-surface-100 bg-surface-50 text-surface-900 focus:border-brand-500 w-full resize-none rounded-lg border px-2.5 py-1.5 text-sm transition outline-none',
              fieldErrors[f.key] && 'border-red-500/60',
            ]"
            @input="patch(f.key, ($event.target as HTMLTextAreaElement).value)"
          />

          <!-- 单行文本 -->
          <input
            v-else
            :value="fieldValue(f)"
            :placeholder="f.placeholder"
            :class="[
              'border-surface-100 bg-surface-50 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-2.5 py-1.5 text-sm transition outline-none',
              fieldErrors[f.key] && 'border-red-500/60',
            ]"
            @input="patch(f.key, ($event.target as HTMLInputElement).value)"
          />

          <!-- 校验错误 -->
          <span v-if="fieldErrors[f.key]" class="mt-1 block text-[11px] text-red-600">
            {{ fieldErrors[f.key] }}
          </span>

          <!-- 延迟换算结果 -->
          <span
            v-if="f.type === 'unit-number' && delaySeconds !== null"
            class="text-surface-800/50 mt-1 block text-[11px]"
          >
            约 {{ delaySeconds }} 秒后继续
          </span>

          <!-- 字段帮助 -->
          <span
            v-if="f.help && !fieldErrors[f.key]"
            class="text-surface-800/40 mt-1 block text-[11px] leading-relaxed"
          >
            {{ f.help }}
          </span>
        </label>

        <!-- 变量插值提示 -->
        <div
          v-if="templateVars.length > 0"
          class="border-surface-100 bg-surface-50/60 rounded-lg border px-3 py-2"
        >
          <p class="text-surface-800/60 text-[11px]">
            引用了 {{ templateVars.length }} 个变量：
            <span class="text-brand-600 font-mono">{{ templateVars.join('、') }}</span>
            <br />运行前请在「运行参数」中提供，缺失时会在日志中提示。
          </p>
        </div>

        <p class="text-surface-800/40 pt-1 text-[11px] leading-relaxed">
          摘要：{{ nodeSummary(node.data) }}
        </p>
      </div>
    </template>
  </aside>

  <!-- 窄屏：底部抽屉（仅选中节点时显示） -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-full opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="translate-y-full opacity-0"
    >
      <div
        v-if="!isWide && node"
        class="border-surface-100/70 bg-surface-0/95 shadow-float fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-hidden rounded-t-2xl border backdrop-blur-xl"
      >
        <header class="border-surface-100 flex items-center justify-between border-b px-4 py-2.5">
          <h2 class="text-surface-900 flex min-w-0 items-center gap-2 text-sm font-semibold">
            <span
              class="flex size-6 shrink-0 items-center justify-center rounded-md"
              :class="def?.chip"
            >
              <component :is="def?.icon" class="size-3.5" />
            </span>
            <span class="truncate">{{ def?.label }}</span>
          </h2>
          <div class="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              class="text-surface-800/40 hover:bg-surface-100 hover:text-surface-900 rounded-md p-1.5 transition"
              title="恢复默认配置"
              aria-label="恢复默认配置"
              @click="resetField"
            >
              <RotateCcw class="size-3.5" />
            </button>
            <button
              type="button"
              class="text-surface-800/40 hover:bg-surface-100 rounded-md p-1.5 transition hover:text-red-600"
              title="删除节点"
              aria-label="删除节点"
              @click="node && store.removeNode(node.id)"
            >
              <Trash2 class="size-3.5" />
            </button>
            <button
              type="button"
              class="text-surface-800/40 hover:bg-surface-100 hover:text-surface-900 rounded-md p-1.5 transition"
              title="收起"
              aria-label="收起面板"
              @click="closeDrawer"
            >
              <X class="size-3.5" />
            </button>
          </div>
        </header>

        <div class="max-h-[54vh] space-y-3 overflow-y-auto p-4 pb-8">
          <label class="block">
            <span class="text-surface-800/70 mb-1 block text-xs font-medium">节点名称</span>
            <input
              :value="fieldValue({ key: 'label' } as NodeField)"
              :class="[
                'border-surface-100 bg-surface-50 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-2.5 py-1.5 text-sm transition outline-none',
                fieldErrors.label && 'border-red-500/60',
              ]"
              @input="patch('label', ($event.target as HTMLInputElement).value)"
            />
            <span v-if="fieldErrors.label" class="mt-1 block text-[11px] text-red-600">
              {{ fieldErrors.label }}
            </span>
          </label>

          <label v-for="f in schema?.fields ?? []" :key="f.key" class="block">
            <span class="text-surface-800/70 mb-1 block text-xs font-medium">{{ f.label }}</span>
            <div v-if="f.type === 'unit-number'" class="flex items-center gap-1.5">
              <input
                type="number"
                :min="f.min"
                :max="f.max"
                :value="fieldValue(f)"
                :placeholder="f.placeholder"
                :class="[
                  'border-surface-100 bg-surface-50 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-2.5 py-1.5 text-sm transition outline-none',
                  fieldErrors[f.key] && 'border-red-500/60',
                ]"
                @input="patchDelayValue(($event.target as HTMLInputElement).value)"
              />
              <select
                :value="node.data.delayUnit ?? 's'"
                class="border-surface-100 bg-surface-50 text-surface-900 focus:border-brand-500 w-24 shrink-0 rounded-lg border px-2 py-1.5 text-sm outline-none"
                @change="patchDelayUnit(($event.target as HTMLSelectElement).value)"
              >
                <option v-for="opt in f.unitOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>
            <select
              v-else-if="f.type === 'select'"
              :value="fieldValue(f)"
              :class="[
                'border-surface-100 bg-surface-50 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-2 py-1.5 text-sm transition outline-none',
                fieldErrors[f.key] && 'border-red-500/60',
              ]"
              @change="patch(f.key, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="opt in f.options" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
            <input
              v-else-if="f.type === 'number'"
              type="number"
              :min="f.min"
              :max="f.max"
              :step="f.step ?? 1"
              :value="fieldValue(f)"
              :placeholder="f.placeholder"
              :class="[
                'border-surface-100 bg-surface-50 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-2.5 py-1.5 text-sm transition outline-none',
                fieldErrors[f.key] && 'border-red-500/60',
              ]"
              @input="patchNumber(f.key, ($event.target as HTMLInputElement).value)"
            />
            <textarea
              v-else-if="f.type === 'textarea'"
              :value="fieldValue(f)"
              rows="3"
              :placeholder="f.placeholder"
              :class="[
                'border-surface-100 bg-surface-50 text-surface-900 focus:border-brand-500 w-full resize-none rounded-lg border px-2.5 py-1.5 text-sm transition outline-none',
                fieldErrors[f.key] && 'border-red-500/60',
              ]"
              @input="patch(f.key, ($event.target as HTMLTextAreaElement).value)"
            />
            <input
              v-else
              :value="fieldValue(f)"
              :placeholder="f.placeholder"
              :class="[
                'border-surface-100 bg-surface-50 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-2.5 py-1.5 text-sm transition outline-none',
                fieldErrors[f.key] && 'border-red-500/60',
              ]"
              @input="patch(f.key, ($event.target as HTMLInputElement).value)"
            />
            <span v-if="fieldErrors[f.key]" class="mt-1 block text-[11px] text-red-600">
              {{ fieldErrors[f.key] }}
            </span>
            <span
              v-if="f.type === 'unit-number' && delaySeconds !== null"
              class="text-surface-800/50 mt-1 block text-[11px]"
            >
              约 {{ delaySeconds }} 秒后继续
            </span>
          </label>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
