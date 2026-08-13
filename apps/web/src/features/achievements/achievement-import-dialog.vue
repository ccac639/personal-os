<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { FileJson, Upload, X } from '@lucide/vue';
import { useOverlayFocus } from './overlay';
import { describeImportScope, parseImport } from './storage';
import type { ImportMode, ImportParseResult, ImportScopeLabel } from './storage';
import type { ImportPayload } from './storage';

const props = defineProps<{
  visible: boolean;
  /** 当前库内成果数量（预览统计用） */
  currentCount: number;
  /** 当前库内成果 id（冲突预览计算用） */
  currentIds: string[];
}>();

const emit = defineEmits<{
  close: [];
  confirm: [payload: ImportPayload, mode: ImportMode];
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const preview = ref<ImportParseResult | null>(null);
const mode = ref<ImportMode>('overwrite');
const reading = ref(false);
const panel = ref<HTMLElement | null>(null);

// 统一焦点管理：不抢焦点（保留触发元素），关闭后归还；Escape 关闭；Tab 陷阱；滚动锁定
useOverlayFocus({
  visible: () => props.visible,
  onEscape: () => emit('close'),
  container: panel,
});

/** 仅解析成功时可用的预览（模板侧的类型收窄） */
const okPreview = computed(() => (preview.value?.ok ? preview.value : null));
const errorMessage = computed(() =>
  preview.value && !preview.value.ok ? preview.value.error : '',
);

/** 与当前库冲突（同 id）的条目数 */
const conflictCount = computed(() => {
  if (!okPreview.value) return 0;
  const current = new Set(props.currentIds);
  return okPreview.value.payload.items.filter((a) => current.has(a.id)).length;
});

const SCOPE_LABELS: Record<ImportScopeLabel, string> = {
  single: '单项',
  collection: '集合',
  library: '全库',
};

/** 导入内容范围（单项 / 集合 / 全库）预览 */
const scopeLabel = computed<ImportScopeLabel | null>(() =>
  okPreview.value ? describeImportScope(okPreview.value.payload) : null,
);

const MODES: { value: ImportMode; title: string; desc: string }[] = [
  {
    value: 'overwrite',
    title: '覆盖冲突',
    desc: '同 id 条目以导入内容覆盖（保留 id 与创建时间，引用稳定）；新条目追加。',
  },
  {
    value: 'skip',
    title: '跳过冲突',
    desc: '同 id 条目保留现有，导入条目丢弃；只导入全新条目。',
  },
  {
    value: 'copy',
    title: '复制为新',
    desc: '同 id 条目以新 id 复制为独立条目；集合引用自动重映射到副本。',
  },
];

function reset() {
  preview.value = null;
  mode.value = 'overwrite';
  reading.value = false;
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  reading.value = true;
  preview.value = null;
  try {
    const text = await file.text();
    preview.value = parseImport(text);
  } catch {
    preview.value = { ok: false, error: '读取文件失败' };
  } finally {
    reading.value = false;
    input.value = '';
  }
}

function confirmImport() {
  if (!preview.value?.ok) return;
  emit('confirm', preview.value.payload, mode.value);
  reset();
}

// 打开时重置解析状态（焦点 / Escape / 滚动锁定由 useOverlayFocus 统一处理）
watch(
  () => props.visible,
  (v) => {
    if (v) reset();
  },
);
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="visible"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
        @click.self="emit('close')"
      >
        <div
          ref="panel"
          class="border-surface-100/70 bg-surface-0/95 shadow-float flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border backdrop-blur-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="achievement-import-title"
        >
          <header
            class="border-surface-100/70 flex items-center justify-between border-b px-5 py-3.5"
          >
            <h2
              id="achievement-import-title"
              class="text-surface-900 flex items-center gap-2 text-sm font-semibold"
            >
              <FileJson class="text-brand-600 size-4" />
              导入成果
            </h2>
            <button
              type="button"
              title="关闭"
              aria-label="关闭"
              class="text-surface-800/50 hover:bg-surface-50 hover:text-surface-900 rounded-md p-1.5 transition"
              @click="emit('close')"
            >
              <X class="size-4" />
            </button>
          </header>

          <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <!-- 选择文件 -->
            <div>
              <input
                ref="fileInput"
                type="file"
                accept="application/json,.json"
                class="sr-only"
                aria-label="选择 JSON 文件"
                @change="onFile"
              />
              <button
                type="button"
                class="border-brand-500/30 text-brand-600 hover:bg-brand-500/10 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-5 text-xs font-medium transition"
                :disabled="reading"
                @click="fileInput?.click()"
              >
                <Upload class="size-4" />
                {{ reading ? '解析中…' : '选择 JSON 文件' }}
              </button>
              <p class="text-surface-800/50 mt-1.5 text-[11px]">
                支持本模块导出的 JSON（全库 / 单项 /
                集合，含版本号）或纯成果数组；旧版本文件自动升级导入。
              </p>
            </div>

            <!-- 预览 -->
            <div v-if="preview" class="space-y-3">
              <p
                v-if="errorMessage"
                class="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600"
              >
                {{ errorMessage }}
              </p>
              <template v-else-if="okPreview">
                <div class="space-y-1.5">
                  <p class="text-surface-800/80 text-xs">
                    文件内容：
                    <span class="text-surface-900 font-semibold">{{
                      scopeLabel ? SCOPE_LABELS[scopeLabel] : ''
                    }}</span>
                    <template v-if="scopeLabel === 'single'"> （单项成果，无集合） </template>
                    <template v-else-if="scopeLabel === 'collection'">
                      （{{ okPreview.payload.collections.length }} 个集合及其成果）
                    </template>
                    <template v-else>（全库导出或批量条目）</template>
                  </p>
                  <p class="text-surface-800/80 text-xs">
                    文件包含
                    <span class="text-surface-900 font-semibold">{{
                      okPreview.payload.items.length
                    }}</span>
                    条有效成果
                    <span v-if="okPreview.payload.collections.length > 0">
                      、<span class="text-surface-900 font-semibold">{{
                        okPreview.payload.collections.length
                      }}</span>
                      个集合
                    </span>
                    <span v-if="okPreview.dropped > 0" class="text-red-600">
                      （{{ okPreview.dropped }} 条因格式无效被跳过）
                    </span>
                  </p>
                  <p
                    v-if="conflictCount > 0"
                    class="rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-amber-600"
                  >
                    与当前库有 <span class="font-semibold">{{ conflictCount }}</span> 条同 id
                    成果，请选择冲突处理方式。
                  </p>
                  <p v-else class="text-xs text-emerald-600">与当前库无 id 冲突，可直接导入。</p>
                </div>

                <ul
                  class="bg-surface-50/70 border-surface-100/80 max-h-32 space-y-1 overflow-y-auto rounded-lg border px-3 py-2 text-xs"
                >
                  <li
                    v-for="a in okPreview.payload.items.slice(0, 6)"
                    :key="a.id"
                    class="text-surface-800/70 truncate"
                  >
                    {{ a.completedAt }} · {{ a.title }}
                  </li>
                  <li v-if="okPreview.payload.items.length > 6" class="text-surface-800/40">
                    …等 {{ okPreview.payload.items.length }} 项
                  </li>
                </ul>

                <!-- 冲突策略 -->
                <fieldset>
                  <legend class="text-surface-800/80 mb-1.5 text-xs font-medium">
                    冲突 ID 策略
                  </legend>
                  <div class="space-y-1.5">
                    <label
                      v-for="m in MODES"
                      :key="m.value"
                      class="border-surface-100 hover:bg-surface-50 flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2"
                    >
                      <input
                        v-model="mode"
                        type="radio"
                        :value="m.value"
                        class="mt-0.5 accent-[color:var(--color-brand-500)]"
                      />
                      <span class="text-xs">
                        <span class="text-surface-900 block font-medium">{{ m.title }}</span>
                        <span class="text-surface-800/50">{{ m.desc }}</span>
                      </span>
                    </label>
                  </div>
                </fieldset>

                <p class="text-surface-800/40 text-[11px]">
                  当前库共 {{ currentCount }} 项成果；覆盖/复制/跳过仅作用于同 id
                  条目，不影响其他数据。
                </p>
              </template>
            </div>
          </div>

          <footer
            class="border-surface-100/70 flex items-center justify-end gap-2 border-t px-5 py-3.5"
          >
            <button
              type="button"
              class="border-surface-100 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 rounded-lg border px-3 py-2 text-xs font-medium transition"
              @click="emit('close')"
            >
              取消
            </button>
            <button
              type="button"
              class="bg-brand-500 hover:bg-brand-600 rounded-lg px-4 py-2 text-xs font-medium text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="!preview?.ok"
              @click="confirmImport"
            >
              确认导入
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
