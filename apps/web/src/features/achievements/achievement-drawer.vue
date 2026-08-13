<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  Archive,
  CalendarDays,
  Copy,
  Download,
  ExternalLink,
  FolderKanban,
  GitBranch,
  Inbox,
  Link2,
  Package,
  Pencil,
  Pin,
  Trash2,
  Workflow,
  X,
} from '@lucide/vue';
import { TYPE_META, tagCls } from './constants';
import { useOverlayFocus } from './overlay';
import { useToasts } from './toast';
import { hasReuse } from './reuse';
import type { Achievement } from './types';

const props = defineProps<{
  item: Achievement | null;
  /** 项目 id → 名称（只读引用 projects 模块） */
  projectNameById?: Record<string, string>;
  /** 工作流 id → 名称（只读引用 workflows 模块） */
  workflowNameById?: Record<string, string>;
  /** 成果 id → 条目（前置/衍生跳转） */
  itemsById?: Record<string, Achievement>;
}>();

const emit = defineEmits<{
  close: [];
  edit: [item: Achievement];
  pin: [id: string];
  archive: [id: string];
  remove: [id: string];
  'open-linked': [id: string];
  /** 导出单项 */
  export: [item: Achievement];
  /** 导出复用包 */
  'export-reuse': [item: Achievement];
}>();

const toasts = useToasts();
const aside = ref<HTMLElement | null>(null);
const closeBtn = ref<HTMLButtonElement | null>(null);

// 统一焦点管理：打开时焦点移到关闭按钮，关闭后归还；Escape 关闭；Tab 陷阱；滚动锁定
useOverlayFocus({
  visible: () => props.item !== null,
  onEscape: () => emit('close'),
  initialFocus: closeBtn,
  container: aside,
});

/** 两段式删除确认 */
const confirming = ref(false);
let confirmTimer: ReturnType<typeof setTimeout> | null = null;

function askRemove() {
  if (!props.item) return;
  if (confirming.value) {
    emit('remove', props.item.id);
    resetConfirm();
    return;
  }
  confirming.value = true;
  if (confirmTimer) clearTimeout(confirmTimer);
  confirmTimer = setTimeout(resetConfirm, 2500);
}

function resetConfirm() {
  confirming.value = false;
  if (confirmTimer) {
    clearTimeout(confirmTimer);
    confirmTimer = null;
  }
}

// 抽屉内容切换时重置两段式确认状态（焦点管理由 useOverlayFocus 统一处理）
watch(
  () => props.item,
  () => resetConfirm(),
);

/* ---------- 复制链接 ---------- */

async function copyLink() {
  const link = props.item?.link;
  if (!link) return;
  try {
    await navigator.clipboard.writeText(link);
    toasts.push('链接已复制', 'success');
  } catch {
    toasts.push('复制失败，请手动复制链接', 'error');
  }
}

/* ---------- 复制模板片段 ---------- */

async function copySnippet() {
  const snippet = props.item?.reuse.templateSnippet;
  if (!snippet) return;
  try {
    await navigator.clipboard.writeText(snippet);
    toasts.push('模板片段已复制', 'success');
  } catch {
    toasts.push('复制失败，请手动复制', 'error');
  }
}

/* ---------- 派生展示 ---------- */

const related = computed(() => {
  const item = props.item;
  if (!item) return null;
  return {
    projects: item.relations.projectIds.map((id) => ({
      id,
      name: props.projectNameById?.[id] ?? '（已失效）',
      valid: !!props.projectNameById?.[id],
    })),
    workflows: item.relations.workflowIds.map((id) => ({
      id,
      name: props.workflowNameById?.[id] ?? '（已失效）',
      valid: !!props.workflowNameById?.[id],
    })),
    predecessors: item.relations.predecessorIds.map((id) => ({
      id,
      item: props.itemsById?.[id] ?? null,
    })),
    derived: item.relations.derivedIds.map((id) => ({ id, item: props.itemsById?.[id] ?? null })),
  };
});

const reuseReady = computed(() => (props.item ? hasReuse(props.item) : false));

/** 交付清单勾选状态（本地 UI 态，不持久化） */
const checkedChecklist = ref<Set<string>>(new Set());

function toggleChecklist(key: string) {
  const next = new Set(checkedChecklist.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  checkedChecklist.value = next;
}

watch(
  () => props.item?.id,
  () => {
    checkedChecklist.value = new Set();
  },
);
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-250 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-200 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="item"
        class="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
        @click.self="emit('close')"
      >
        <Transition
          enter-active-class="transition duration-300 ease-out"
          enter-from-class="translate-x-full"
          leave-active-class="transition duration-250 ease-in"
          leave-to-class="translate-x-full"
        >
          <aside
            v-if="item"
            ref="aside"
            class="border-surface-100/70 bg-surface-0/95 shadow-float absolute top-0 right-0 flex h-full w-full max-w-lg flex-col backdrop-blur-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="achievement-drawer-title"
            tabindex="-1"
          >
            <!-- 头部 -->
            <header
              class="border-surface-100/70 flex items-start justify-between gap-3 border-b px-5 py-4"
            >
              <div class="flex min-w-0 items-center gap-2.5">
                <span
                  class="flex size-10 shrink-0 items-center justify-center rounded-lg"
                  :class="TYPE_META[item.type].chip"
                >
                  <component :is="TYPE_META[item.type].icon" class="size-5" />
                </span>
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span
                      class="rounded-full px-2 py-0.5 text-[10px] font-medium"
                      :class="TYPE_META[item.type].chip"
                    >
                      {{ TYPE_META[item.type].label }}
                    </span>
                    <span
                      v-if="item.pinned"
                      class="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600"
                    >
                      <Pin class="size-2.5" /> 置顶
                    </span>
                    <span
                      v-if="item.archived"
                      class="text-surface-800/50 rounded-full border border-dashed px-2 py-0.5 text-[10px]"
                    >
                      已归档
                    </span>
                    <span
                      v-if="reuseReady"
                      class="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600"
                    >
                      <Package class="size-2.5" /> 可复用
                    </span>
                  </div>
                  <h2
                    id="achievement-drawer-title"
                    class="text-surface-900 mt-1.5 text-base leading-snug font-semibold break-words"
                  >
                    {{ item.title }}
                  </h2>
                </div>
              </div>
              <button
                ref="closeBtn"
                type="button"
                title="关闭（Esc）"
                aria-label="关闭详情"
                class="text-surface-800/50 hover:bg-surface-50 hover:text-surface-900 shrink-0 rounded-md p-1.5 transition"
                @click="emit('close')"
              >
                <X class="size-4" />
              </button>
            </header>

            <!-- 元信息 -->
            <div
              class="border-surface-100/70 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b px-5 py-3 text-xs"
            >
              <span class="text-surface-800/70 flex items-center gap-1.5">
                <CalendarDays class="size-3.5" />
                完成于
                <span class="text-surface-900 font-medium tabular-nums">{{
                  item.completedAt
                }}</span>
              </span>
              <span
                v-if="item.relatedProject"
                class="text-surface-800/70 flex items-center gap-1.5"
              >
                <FolderKanban class="size-3.5" />
                关联项目
                <span class="text-brand-600 font-medium">{{ item.relatedProject }}</span>
              </span>
            </div>

            <!-- 正文 -->
            <div class="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <!-- 描述 -->
              <section>
                <h3 class="text-surface-900 mb-1.5 text-xs font-semibold tracking-wide">描述</h3>
                <p
                  class="text-surface-800/80 text-[13px] leading-relaxed break-words whitespace-pre-wrap"
                >
                  {{ item.description || '暂无描述' }}
                </p>
              </section>

              <!-- 关系 -->
              <section
                v-if="
                  item.relations.projectIds.length > 0 ||
                  item.relations.workflowIds.length > 0 ||
                  item.relations.predecessorIds.length > 0 ||
                  item.relations.derivedIds.length > 0
                "
              >
                <h3 class="text-surface-900 mb-2 text-xs font-semibold tracking-wide">关系</h3>
                <div class="space-y-2.5">
                  <div v-if="related!.projects.length > 0" class="flex items-start gap-2">
                    <FolderKanban class="text-surface-800/40 mt-0.5 size-3.5 shrink-0" />
                    <div class="flex flex-wrap gap-1">
                      <span
                        v-for="p in related!.projects"
                        :key="p.id"
                        class="text-brand-600 text-[11px]"
                        :class="p.valid ? '' : 'text-surface-800/40 line-through'"
                      >
                        {{ p.name }}
                      </span>
                    </div>
                  </div>
                  <div v-if="related!.workflows.length > 0" class="flex items-start gap-2">
                    <Workflow class="text-surface-800/40 mt-0.5 size-3.5 shrink-0" />
                    <div class="flex flex-wrap gap-1">
                      <span
                        v-for="w in related!.workflows"
                        :key="w.id"
                        class="text-[11px] text-emerald-600"
                        :class="w.valid ? '' : 'text-surface-800/40 line-through'"
                      >
                        {{ w.name }}
                      </span>
                    </div>
                  </div>
                  <div v-if="related!.predecessors.length > 0" class="flex items-start gap-2">
                    <GitBranch class="text-surface-800/40 mt-0.5 size-3.5 shrink-0" />
                    <div class="flex flex-wrap gap-1">
                      <button
                        v-for="p in related!.predecessors"
                        :key="p.id"
                        type="button"
                        class="text-[11px] text-amber-600 transition hover:text-amber-700"
                        :class="p.item ? '' : 'text-surface-800/40 line-through'"
                        :title="p.item ? '打开该成果' : '该成果已被删除'"
                        @click="p.item && emit('open-linked', p.id)"
                      >
                        前置：{{ p.item?.title ?? '（已失效）' }}
                      </button>
                    </div>
                  </div>
                  <div v-if="related!.derived.length > 0" class="flex items-start gap-2">
                    <GitBranch class="text-surface-800/40 mt-0.5 size-3.5 shrink-0" />
                    <div class="flex flex-wrap gap-1">
                      <button
                        v-for="d in related!.derived"
                        :key="d.id"
                        type="button"
                        class="text-[11px] text-violet-600 transition hover:text-violet-700"
                        :class="d.item ? '' : 'text-surface-800/40 line-through'"
                        :title="d.item ? '打开该成果' : '该成果已被删除'"
                        @click="d.item && emit('open-linked', d.id)"
                      >
                        衍生：{{ d.item?.title ?? '（已失效）' }}
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <!-- 关键指标（无数据时不显示误导性 0） -->
              <section>
                <h3 class="text-surface-900 mb-2 text-xs font-semibold tracking-wide">关键指标</h3>
                <div v-if="item.metrics.length > 0" class="grid grid-cols-2 gap-2">
                  <div
                    v-for="m in item.metrics"
                    :key="m.label"
                    class="border-surface-100/80 bg-surface-50/70 rounded-lg border px-3 py-2.5"
                  >
                    <p class="text-surface-800/50 text-[10px] break-words">{{ m.label }}</p>
                    <p
                      class="text-surface-900 mt-0.5 text-sm font-semibold break-words tabular-nums"
                    >
                      {{ m.value || '—' }}
                    </p>
                  </div>
                </div>
                <p v-else class="text-surface-800/40 text-xs">暂无关键指标数据</p>
              </section>

              <!-- 标签 -->
              <section v-if="item.tags.length > 0">
                <h3 class="text-surface-900 mb-2 text-xs font-semibold tracking-wide">标签</h3>
                <div class="flex flex-wrap gap-1.5">
                  <span
                    v-for="t in item.tags"
                    :key="t"
                    class="max-w-full truncate rounded-full px-2.5 py-1 text-[11px]"
                    :class="tagCls(t)"
                  >
                    {{ t }}
                  </span>
                </div>
              </section>

              <!-- 链接 -->
              <section v-if="item.link">
                <h3 class="text-surface-900 mb-2 text-xs font-semibold tracking-wide">链接</h3>
                <a
                  :href="item.link"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-brand-600 hover:text-brand-700 flex items-center gap-1.5 text-[13px] break-all"
                >
                  <Link2 class="size-3.5 shrink-0" />
                  {{ item.link }}
                  <ExternalLink class="size-3 shrink-0" />
                </a>
              </section>

              <!-- 复用包 -->
              <section
                v-if="reuseReady"
                class="border-surface-100/80 bg-surface-50/40 rounded-xl border p-3.5"
              >
                <div class="mb-2.5 flex items-center justify-between gap-2">
                  <h3
                    class="text-surface-900 flex items-center gap-1.5 text-xs font-semibold tracking-wide"
                  >
                    <Package class="size-3.5 text-emerald-600" />
                    复用包
                  </h3>
                  <button
                    type="button"
                    class="text-brand-600 hover:text-brand-700 flex items-center gap-1 text-[11px] font-medium transition"
                    @click="emit('export-reuse', item)"
                  >
                    <Download class="size-3" />
                    导出复用包
                  </button>
                </div>

                <div class="space-y-3">
                  <div v-if="item.reuse.links.length > 0">
                    <p class="text-surface-800/60 mb-1.5 text-[10px] font-medium tracking-wide">
                      关键链接
                    </p>
                    <ul class="space-y-1">
                      <li v-for="l in item.reuse.links" :key="l.url">
                        <a
                          :href="l.url"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="text-brand-600 hover:text-brand-700 flex items-center gap-1.5 text-xs break-all"
                        >
                          <Link2 class="size-3 shrink-0" />
                          {{ l.label }}
                          <ExternalLink class="size-2.5 shrink-0" />
                        </a>
                      </li>
                    </ul>
                  </div>

                  <div v-if="item.reuse.usageGuide.trim()">
                    <p class="text-surface-800/60 mb-1 text-[10px] font-medium tracking-wide">
                      使用说明
                    </p>
                    <p
                      class="text-surface-800/80 text-xs leading-relaxed break-words whitespace-pre-wrap"
                    >
                      {{ item.reuse.usageGuide }}
                    </p>
                  </div>

                  <div v-if="item.reuse.checklist.length > 0">
                    <p class="text-surface-800/60 mb-1 text-[10px] font-medium tracking-wide">
                      交付清单
                    </p>
                    <ul class="space-y-1">
                      <li
                        v-for="c in item.reuse.checklist"
                        :key="c"
                        class="flex items-center gap-2 text-xs"
                      >
                        <input
                          type="checkbox"
                          :checked="checkedChecklist.has(c)"
                          class="size-3.5 shrink-0 accent-[color:var(--color-brand-500)]"
                          :aria-label="`勾选交付项：${c}`"
                          @change="toggleChecklist(c)"
                        />
                        <span
                          class="text-surface-800/80"
                          :class="checkedChecklist.has(c) ? 'text-surface-800/40 line-through' : ''"
                        >
                          {{ c }}
                        </span>
                      </li>
                    </ul>
                  </div>

                  <div v-if="item.reuse.retrospective.trim()">
                    <p class="text-surface-800/60 mb-1 text-[10px] font-medium tracking-wide">
                      复盘笔记
                    </p>
                    <p
                      class="text-surface-800/80 text-xs leading-relaxed break-words whitespace-pre-wrap"
                    >
                      {{ item.reuse.retrospective }}
                    </p>
                  </div>

                  <div v-if="item.reuse.templateSnippet.trim()">
                    <div class="mb-1 flex items-center justify-between">
                      <p class="text-surface-800/60 text-[10px] font-medium tracking-wide">
                        模板片段
                      </p>
                      <button
                        type="button"
                        class="text-brand-600 hover:text-brand-700 flex items-center gap-1 text-[10px] font-medium transition"
                        @click="copySnippet"
                      >
                        <Copy class="size-3" />
                        复制
                      </button>
                    </div>
                    <pre
                      class="bg-surface-900/95 text-surface-100 max-h-40 overflow-auto rounded-lg p-2.5 text-[11px] leading-relaxed break-all whitespace-pre-wrap"
                      >{{ item.reuse.templateSnippet }}</pre>
                  </div>
                </div>
              </section>
            </div>

            <!-- 底部操作 -->
            <footer
              class="border-surface-100/70 flex flex-wrap items-center gap-2 border-t px-5 py-3.5"
            >
              <button
                type="button"
                class="border-surface-100 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition"
                @click="emit('edit', item)"
              >
                <Pencil class="size-3.5" />
                编辑
              </button>
              <button
                v-if="item.link"
                type="button"
                class="border-surface-100 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition"
                @click="copyLink"
              >
                <Copy class="size-3.5" />
                复制链接
              </button>
              <button
                type="button"
                class="border-surface-100 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition"
                @click="emit('export', item)"
              >
                <Download class="size-3.5" />
                导出单项
              </button>
              <button
                type="button"
                class="border-surface-100 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition"
                @click="emit('pin', item.id)"
              >
                <Pin class="size-3.5" :class="item.pinned ? 'fill-current text-amber-500' : ''" />
                {{ item.pinned ? '取消置顶' : '置顶' }}
              </button>
              <button
                type="button"
                class="border-surface-100 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition"
                @click="emit('archive', item.id)"
              >
                <component :is="item.archived ? Inbox : Archive" class="size-3.5" />
                {{ item.archived ? '取消归档' : '归档' }}
              </button>
              <button
                type="button"
                class="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition"
                :class="
                  confirming
                    ? 'bg-red-500/10 text-red-600'
                    : 'text-surface-800/50 hover:bg-red-500/10 hover:text-red-600'
                "
                @click="askRemove"
              >
                <Trash2 class="size-3.5" />
                {{ confirming ? '再次点击确认删除' : '删除' }}
              </button>
            </footer>
          </aside>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
