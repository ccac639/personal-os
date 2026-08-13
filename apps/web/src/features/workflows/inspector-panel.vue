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
import { extractVars, insertVarRef } from './vars';

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

/* ---------- 变量与数据映射 ---------- */

/** 选中节点的输入字段引用（供插入 / 诊断） */
const nodeVarFields = computed(() => (node.value ? store.nodeInputVars(node.value.id) : []));
/** 缺失变量（当前运行参数 + 上次运行输出中不可用的引用） */
const missingVars = computed(() => (node.value ? store.missingVarsFor(node.value.id) : []));
/** 上次运行输出预览 */
const outputPreview = computed(() => (node.value ? store.nodeOutputPreview(node.value.id) : ''));
/** 变量浏览器（可用变量分组展示） */
const varGroups = computed(() => {
  const groups = new Map<string, Array<{ name: string; value: string }>>();
  for (const v of store.availableVars) {
    const list = groups.get(v.source) ?? [];
    list.push({
      name: v.name,
      value: typeof v.value === 'object' ? JSON.stringify(v.value) : String(v.value),
    });
    groups.set(v.source, list);
  }
  return [...groups.entries()];
});

/** 点击变量引用 → 追加到指定字段末尾 */
function insertVar(field: string, name: string) {
  if (!node.value) return;
  const current = String(node.value.data[field as keyof WorkflowNodeData] ?? '');
  const next = insertVarRef(current, name);
  store.updateNodeData(node.value.id, { [field]: next.text } as Partial<WorkflowNodeData>);
}

const FIELD_LABELS: Record<string, string> = {
  template: '模板内容',
  prompt: '提示词',
  title: '标题',
  message: '正文',
  expr: '判断表达式',
};
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

        <!-- 变量与数据映射 -->
        <div class="border-surface-100 bg-surface-50/60 space-y-2.5 rounded-lg border px-3 py-2.5">
          <p class="text-surface-900 text-[11px] font-semibold">变量与数据映射</p>

          <!-- 输入引用 + 缺失诊断 -->
          <div v-if="nodeVarFields.length > 0" class="space-y-1.5">
            <div v-for="f in nodeVarFields" :key="f.field" class="text-[11px]">
              <p class="text-surface-800/60">
                {{ FIELD_LABELS[f.field] ?? f.field }} 引用：
                <span v-if="f.vars.length === 0" class="text-surface-800/40">无变量</span>
              </p>
              <div class="mt-0.5 flex flex-wrap gap-1">
                <button
                  v-for="v in f.vars"
                  :key="v"
                  type="button"
                  class="rounded px-1.5 py-0.5 font-mono text-[10px] transition"
                  :class="
                    store.availableVarNames.has(v)
                      ? 'bg-green-500/10 text-green-700 hover:bg-green-500/20'
                      : 'bg-amber-500/10 text-amber-700 hover:bg-amber-500/20'
                  "
                  :title="`点击追加 {{${v}}} 到 ${FIELD_LABELS[f.field] ?? f.field} 末尾`"
                  @click="insertVar(f.field, v)"
                >
                  {{ v }}
                </button>
              </div>
            </div>
          </div>
          <p v-else class="text-surface-800/40 text-[11px]">该节点没有引用变量</p>

          <!-- 缺失变量诊断 -->
          <div
            v-if="missingVars.length > 0"
            class="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700"
          >
            缺失变量：<span class="font-mono">{{ missingVars.join('、') }}</span> <br />
            <span class="opacity-80">请在「运行参数」中提供，或连接上游节点作为输入。</span>
          </div>
          <p v-else-if="nodeVarFields.length > 0" class="text-[11px] text-green-700">
            ✓ 引用的变量均可用
          </p>

          <!-- 输出预览（上次运行） -->
          <div v-if="outputPreview">
            <p class="text-surface-800/60 text-[11px]">上次运行输出：</p>
            <pre
              class="bg-surface-0 text-surface-800/80 border-surface-100 mt-0.5 max-h-24 overflow-y-auto rounded-md border p-1.5 font-mono text-[10px] leading-relaxed"
              >{{ outputPreview }}</pre>
          </div>

          <!-- 变量浏览器 -->
          <div>
            <p class="text-surface-800/60 text-[11px]">
              可用变量（{{ store.availableVars.length }}）：
            </p>
            <div v-if="varGroups.length > 0" class="mt-1 space-y-1">
              <div v-for="[source, list] in varGroups" :key="source" class="text-[11px]">
                <p class="text-surface-800/40">{{ source }}</p>
                <div class="mt-0.5 flex max-h-20 flex-wrap gap-1 overflow-y-auto">
                  <span
                    v-for="v in list"
                    :key="v.name"
                    class="border-surface-100 bg-surface-0 text-surface-800/70 rounded border px-1.5 py-0.5 font-mono text-[10px]"
                    :title="v.value"
                  >
                    {{ v.name }}
                  </span>
                </div>
              </div>
            </div>
            <p v-else class="text-surface-800/40 mt-1 text-[11px]">
              暂无可用变量：设置运行参数或运行一次后即可浏览节点输出。
            </p>
          </div>
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
