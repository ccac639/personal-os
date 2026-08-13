<script setup lang="ts">
/**
 * 输入输出契约面板：输入定义编辑器 / 输出映射 / 运行配置。
 * 窄屏作为底部抽屉使用（父组件控制展示方式）。
 */
import { computed, reactive, ref } from 'vue';
import { CirclePlus, RotateCcw, Save, Trash2, X, ListPlus, ArrowDownToLine } from '@lucide/vue';
import { useWorkflowStore } from './store';
import type { WorkflowInputDef, WorkflowInputType, WorkflowOutputDef } from './types';
import { validateInputDefs, validateOutputDefs } from './io';

const store = useWorkflowStore();
const emit = defineEmits<{ close: [] }>();
/** 模板提示文案（避免嵌套 {{}} 解析冲突） */
const varRefHint = '{{变量}}';
/** JSON 示例（避免属性引号冲突） */
const jsonPlaceholder = '{"role": "审查员"}';

/* ---------- 输入定义 ---------- */

const INPUT_TYPES: Array<{ value: WorkflowInputType; label: string }> = [
  { value: 'text', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'boolean', label: '布尔' },
  { value: 'json', label: 'JSON' },
  { value: 'select', label: '选择项' },
];

const draftInputs = ref<WorkflowInputDef[]>([]);
const inputErrors = ref<string[]>([]);

function syncDraft() {
  draftInputs.value = store.inputDefs.map((d) => ({
    ...d,
    options: d.options ? [...d.options] : undefined,
  }));
  inputErrors.value = [];
}

function addInput() {
  draftInputs.value.push({
    name: `input_${draftInputs.value.length + 1}`,
    label: `输入 ${draftInputs.value.length + 1}`,
    type: 'text',
    required: false,
  });
}

function removeInput(i: number) {
  draftInputs.value.splice(i, 1);
}

function saveInputs() {
  const issues = validateInputDefs(draftInputs.value);
  inputErrors.value = issues.map((i) => i.message);
  if (issues.length > 0) return;
  store.setInputDefs(draftInputs.value);
}

/* ---------- 输出定义 ---------- */

const draftOutputs = ref<WorkflowOutputDef[]>([]);
const outputErrors = ref<string[]>([]);

function syncOutputs() {
  draftOutputs.value = store.outputDefs.map((d) => ({ ...d }));
  outputErrors.value = [];
}

function addOutput() {
  draftOutputs.value.push({
    name: `output_${draftOutputs.value.length + 1}`,
    type: 'any',
    source: '',
  });
}

function removeOutput(i: number) {
  draftOutputs.value.splice(i, 1);
}

function saveOutputs() {
  const issues = validateOutputDefs(
    draftOutputs.value,
    store.nodes.map((n) => n.id),
  );
  outputErrors.value = issues.map((i) => i.message);
  if (issues.length > 0) return;
  store.setOutputDefs(draftOutputs.value);
}

/** 输出来源候选：节点 id + 节点输出点路径 */
const sourceOptions = computed(() => {
  const opts: Array<{ value: string; label: string }> = [];
  for (const n of store.nodes) {
    opts.push({ value: n.id, label: `${n.data.label || n.id}（完整输出）` });
    opts.push({ value: `${n.id}.text`, label: `${n.data.label || n.id} → text` });
    opts.push({ value: `${n.id}.output`, label: `${n.data.label || n.id} → output` });
    opts.push({ value: `${n.id}.result`, label: `${n.data.label || n.id} → result` });
  }
  return opts;
});

/* ---------- 运行配置 ---------- */

const runConfigDraft = reactive({
  maxSteps: 100,
  timeoutMs: 60000,
  failStrategy: 'stop' as 'stop' | 'continue',
  allowManualRun: true,
});

function syncRunConfig() {
  const rc = store.runConfig;
  if (!rc) return;
  runConfigDraft.maxSteps = rc.maxSteps;
  runConfigDraft.timeoutMs = rc.timeoutMs;
  runConfigDraft.failStrategy = rc.failStrategy;
  runConfigDraft.allowManualRun = rc.allowManualRun;
}

function saveRunConfig() {
  store.updateRunConfig({
    maxSteps: Math.max(1, Number(runConfigDraft.maxSteps) || 100),
    timeoutMs: Math.max(0, Number(runConfigDraft.timeoutMs) || 0),
    failStrategy: runConfigDraft.failStrategy,
    allowManualRun: runConfigDraft.allowManualRun,
  });
}

/* ---------- 从上次运行复用输入 / 恢复默认 ---------- */

const reuseInputText = ref('');
const inputReuseError = ref('');

function reuseLastRun() {
  const last = store.lastRunInput;
  if (Object.keys(last).length === 0) {
    inputReuseError.value = '暂无上次运行记录';
    return;
  }
  reuseInputText.value = JSON.stringify(last, null, 2);
  inputReuseError.value = '';
}

function restoreDefaults() {
  reuseInputText.value = JSON.stringify(store.defaultInputs(), null, 2);
  inputReuseError.value = '';
}

function applyReuseInput() {
  try {
    const parsed = JSON.parse(reuseInputText.value || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      inputReuseError.value = '需为 JSON 对象';
      return;
    }
    store.runParams = {
      ...store.runParams,
      variables: { ...(store.runParams.variables ?? {}), ...parsed },
    };
    inputReuseError.value = '';
  } catch {
    inputReuseError.value = 'JSON 解析失败';
  }
}

syncDraft();
syncOutputs();
syncRunConfig();
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div
      class="border-surface-100/70 bg-surface-0/90 shadow-float flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border backdrop-blur-xl"
    >
      <header class="border-surface-100 flex items-center justify-between border-b px-4 py-3">
        <h3 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
          <ArrowDownToLine class="text-brand-600 size-4" />
          输入输出与运行配置
        </h3>
        <button
          type="button"
          class="text-surface-800/50 hover:bg-surface-100 rounded-md p-1.5 transition"
          aria-label="关闭输入输出面板"
          title="关闭"
          @click="emit('close')"
        >
          <X class="size-4" />
        </button>
      </header>

      <div class="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <!-- 输入定义 -->
        <section class="border-surface-100 rounded-lg border">
          <header class="border-surface-100 flex items-center gap-2 border-b px-3 py-2">
            <h4 class="text-surface-900 text-xs font-semibold">
              输入定义（{{ draftInputs.length }}）
            </h4>
            <button
              type="button"
              class="text-brand-600 hover:bg-brand-500/10 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition"
              @click="addInput"
            >
              <CirclePlus class="size-3" /> 添加输入
            </button>
            <span v-if="inputErrors.length" class="text-[11px] text-red-600">
              {{ inputErrors[0] }}
            </span>
            <button
              type="button"
              class="bg-brand-600 hover:bg-brand-700 text-surface-0 ml-auto rounded-md px-2 py-1 text-[11px] font-medium transition"
              @click="saveInputs"
            >
              <Save class="mr-0.5 inline size-3" /> 保存输入
            </button>
          </header>
          <div class="space-y-2 p-3">
            <div
              v-for="(def, i) in draftInputs"
              :key="i"
              class="bg-surface-50/60 flex flex-wrap items-center gap-2 rounded-md border border-transparent p-2"
            >
              <input
                v-model="def.name"
                class="border-surface-100 bg-surface-0 text-surface-900 w-32 rounded-md border px-2 py-1 font-mono text-[11px] outline-none"
                placeholder="名称（如 role）"
                aria-label="输入名称"
              />
              <select
                v-model="def.type"
                class="border-surface-100 bg-surface-0 text-surface-900 rounded-md border px-1.5 py-1 text-[11px] outline-none"
                aria-label="输入类型"
              >
                <option v-for="t in INPUT_TYPES" :key="t.value" :value="t.value">
                  {{ t.label }}
                </option>
              </select>
              <input
                v-model="def.label"
                class="border-surface-100 bg-surface-0 text-surface-900 w-24 rounded-md border px-2 py-1 text-[11px] outline-none"
                placeholder="展示名"
                aria-label="展示名"
              />
              <input
                v-model="def.defaultValue"
                class="border-surface-100 bg-surface-0 text-surface-900 w-24 rounded-md border px-2 py-1 text-[11px] outline-none"
                placeholder="默认值"
                aria-label="默认值"
              />
              <label class="text-surface-800/70 flex items-center gap-1 text-[11px]">
                <input v-model="def.required" type="checkbox" class="accent-brand-600" />
                必填
              </label>
              <button
                type="button"
                class="text-surface-800/40 rounded p-1 transition hover:text-red-600"
                :aria-label="`删除输入 ${def.name}`"
                title="删除输入"
                @click="removeInput(i)"
              >
                <Trash2 class="size-3.5" />
              </button>
            </div>
            <p v-if="draftInputs.length === 0" class="text-surface-800/40 text-[11px]">
              暂无输入定义。运行参数将以 {{ varRefHint }} 形式供节点引用。
            </p>
          </div>
        </section>

        <!-- 输出定义 -->
        <section class="border-surface-100 rounded-lg border">
          <header class="border-surface-100 flex items-center gap-2 border-b px-3 py-2">
            <h4 class="text-surface-900 text-xs font-semibold">
              输出映射（{{ draftOutputs.length }}）
            </h4>
            <button
              type="button"
              class="text-brand-600 hover:bg-brand-500/10 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition"
              @click="addOutput"
            >
              <ListPlus class="size-3" /> 添加输出
            </button>
            <span v-if="outputErrors.length" class="text-[11px] text-red-600">
              {{ outputErrors[0] }}
            </span>
            <button
              type="button"
              class="bg-brand-600 hover:bg-brand-700 text-surface-0 ml-auto rounded-md px-2 py-1 text-[11px] font-medium transition"
              @click="saveOutputs"
            >
              <Save class="mr-0.5 inline size-3" /> 保存输出
            </button>
          </header>
          <div class="space-y-2 p-3">
            <div
              v-for="(def, i) in draftOutputs"
              :key="i"
              class="bg-surface-50/60 flex flex-wrap items-center gap-2 rounded-md p-2"
            >
              <input
                v-model="def.name"
                class="border-surface-100 bg-surface-0 text-surface-900 w-32 rounded-md border px-2 py-1 font-mono text-[11px] outline-none"
                placeholder="输出名（如 报告）"
                aria-label="输出名称"
              />
              <select
                v-model="def.source"
                class="border-surface-100 bg-surface-0 text-surface-900 max-w-52 rounded-md border px-1.5 py-1 text-[11px] outline-none"
                aria-label="输出来源"
              >
                <option value="" disabled>选择来源节点…</option>
                <option v-for="o in sourceOptions" :key="o.value" :value="o.value">
                  {{ o.label }}
                </option>
              </select>
              <input
                v-model="def.description"
                class="border-surface-100 bg-surface-0 text-surface-900 w-36 rounded-md border px-2 py-1 text-[11px] outline-none"
                placeholder="说明"
                aria-label="输出说明"
              />
              <button
                type="button"
                class="text-surface-800/40 rounded p-1 transition hover:text-red-600"
                :aria-label="`删除输出 ${def.name}`"
                title="删除输出"
                @click="removeOutput(i)"
              >
                <Trash2 class="size-3.5" />
              </button>
            </div>
            <p v-if="draftOutputs.length === 0" class="text-surface-800/40 text-[11px]">
              暂无输出映射。运行完成后可在运行面板查看节点输出。
            </p>
          </div>
        </section>

        <!-- 从上次运行复用输入 -->
        <section class="border-surface-100 rounded-lg border">
          <header class="border-surface-100 flex items-center gap-2 border-b px-3 py-2">
            <h4 class="text-surface-900 text-xs font-semibold">运行输入（复用 / 默认）</h4>
            <button
              type="button"
              class="text-surface-800/60 hover:bg-surface-100 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition"
              title="从上次运行复用输入"
              @click="reuseLastRun"
            >
              <RotateCcw class="size-3" /> 上次运行
            </button>
            <button
              type="button"
              class="text-surface-800/60 hover:bg-surface-100 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition"
              title="恢复默认输入"
              @click="restoreDefaults"
            >
              <RotateCcw class="size-3" /> 默认值
            </button>
            <button
              type="button"
              class="bg-brand-600 hover:bg-brand-700 text-surface-0 ml-auto rounded-md px-2 py-1 text-[11px] font-medium transition"
              @click="applyReuseInput"
            >
              应用到运行参数
            </button>
          </header>
          <div class="p-3">
            <textarea
              v-model="reuseInputText"
              rows="3"
              class="border-surface-100 bg-surface-50 text-surface-900 focus:border-brand-500 w-full resize-none rounded-md border px-2 py-1.5 font-mono text-[11px] outline-none"
              :placeholder="jsonPlaceholder"
              aria-label="运行输入 JSON"
            />
            <span v-if="inputReuseError" class="mt-1 block text-[11px] text-red-600">{{
              inputReuseError
            }}</span>
          </div>
        </section>

        <!-- 运行配置 -->
        <section class="border-surface-100 rounded-lg border">
          <header class="border-surface-100 flex items-center gap-2 border-b px-3 py-2">
            <h4 class="text-surface-900 text-xs font-semibold">运行配置</h4>
            <button
              type="button"
              class="bg-brand-600 hover:bg-brand-700 text-surface-0 ml-auto rounded-md px-2 py-1 text-[11px] font-medium transition"
              @click="saveRunConfig"
            >
              <Save class="mr-0.5 inline size-3" /> 保存配置
            </button>
          </header>
          <div class="grid grid-cols-2 gap-3 p-3">
            <label class="block">
              <span class="text-surface-800/60 mb-1 block text-[11px]">最大执行步数</span>
              <input
                v-model.number="runConfigDraft.maxSteps"
                type="number"
                min="1"
                class="border-surface-100 bg-surface-50 text-surface-900 w-full rounded-md border px-2 py-1 text-[11px] outline-none"
                aria-label="最大执行步数"
              />
            </label>
            <label class="block">
              <span class="text-surface-800/60 mb-1 block text-[11px]">默认超时（ms）</span>
              <input
                v-model.number="runConfigDraft.timeoutMs"
                type="number"
                min="0"
                class="border-surface-100 bg-surface-50 text-surface-900 w-full rounded-md border px-2 py-1 text-[11px] outline-none"
                aria-label="默认超时"
              />
            </label>
            <label class="block">
              <span class="text-surface-800/60 mb-1 block text-[11px]">失败策略</span>
              <select
                v-model="runConfigDraft.failStrategy"
                class="border-surface-100 bg-surface-50 text-surface-900 w-full rounded-md border px-2 py-1 text-[11px] outline-none"
                aria-label="失败策略"
              >
                <option value="stop">失败即停止</option>
                <option value="continue">失败继续（跳过）</option>
              </select>
            </label>
            <label class="text-surface-800/70 flex items-end gap-2 pb-1 text-[11px]">
              <input
                v-model="runConfigDraft.allowManualRun"
                type="checkbox"
                class="accent-brand-600"
              />
              允许手动运行
            </label>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
