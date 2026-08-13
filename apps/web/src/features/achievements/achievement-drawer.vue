<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue';
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
  MoreHorizontal,
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
import { buildReuseMarkdown, hasReuse } from './reuse';
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
  /** 导出复用包（JSON） */
  'export-reuse': [item: Achievement];
  /** 导出复用包（Markdown） */
  'export-reuse-md': [item: Achievement];
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

/** 低频操作「更多」菜单 */
const moreOpen = ref(false);

// 抽屉内容切换时重置两段式确认与更多菜单状态（焦点管理由 useOverlayFocus 统一处理）
watch(
  () => props.item?.id,
  () => {
    resetConfirm();
    moreOpen.value = false;
  },
);

/* ---------- 复制 ---------- */

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

/** 复制提示词（复用包模板片段，footer 主操作） */
async function copySnippet() {
  const snippet = props.item?.reuse.templateSnippet;
  if (!snippet) return;
  try {
    await navigator.clipboard.writeText(snippet);
    toasts.push('提示词已复制', 'success');
  } catch {
    toasts.push('复制失败，请手动复制', 'error');
  }
}

/** 复制整包（Markdown，复用包区块内操作） */
async function copyReuseMarkdown() {
  const item = props.item;
  if (!item) return;
  try {
    await navigator.clipboard.writeText(buildReuseMarkdown(item));
    toasts.push('复用包（Markdown）已复制', 'success');
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

const hasRelations = computed(() => {
  const r = props.item?.relations;
  if (!r) return false;
  return (
    r.projectIds.length > 0 ||
    r.workflowIds.length > 0 ||
    r.predecessorIds.length > 0 ||
    r.derivedIds.length > 0
  );
});

/** 是否有可复用的实质内容（含复盘笔记，用于头部角标） */
const reuseReady = computed(() => (props.item ? hasReuse(props.item) : false));
/** 复用包主体是否有内容（不含复盘笔记，复盘笔记独立分区展示） */
const reuseContentReady = computed(() => {
  const r = props.item?.reuse;
  if (!r) return false;
  return (
    r.links.length > 0 ||
    r.usageGuide.trim() !== '' ||
    r.checklist.length > 0 ||
    r.templateSnippet.trim() !== ''
  );
});

/** 更多菜单项（低频操作收纳） */
const moreActions = computed<{ key: string; label: string; icon: Component }[]>(() => {
  const item = props.item;
  if (!item) return [];
  const actions: { key: string; label: string; icon: Component }[] = [
    { key: 'pin', label: item.pinned ? '取消置顶' : '置顶', icon: Pin },
  ];
  if (item.link) actions.push({ key: 'copy-link', label: '复制链接', icon: Copy });
  actions.push({ key: 'export', label: '导出单项', icon: Download });
  if (reuseReady.value) {
    actions.push({ key: 'export-reuse', label: '导出复用包 JSON', icon: Download });
    actions.push({ key: 'export-reuse-md', label: '导出复用包 Markdown', icon: Download });
  }
  return actions;
});

function runMore(key: string) {
  const item = props.item;
  if (!item) return;
  moreOpen.value = false;
  switch (key) {
    case 'pin':
      emit('pin', item.id);
      break;
    case 'copy-link':
      void copyLink();
      break;
    case 'export':
      emit('export', item);
      break;
    case 'export-reuse':
      emit('export-reuse', item);
      break;
    case 'export-reuse-md':
      emit('export-reuse-md', item);
      break;
  }
}

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

            <!-- 正文：清晰分区（基本信息 / 复用包 / 关联 / 复盘笔记） -->
            <div class="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <!-- 基本信息 -->
              <section aria-label="基本信息">
                <h3 class="text-surface-900 mb-1.5 text-xs font-semibold tracking-wide">
                  基本信息
                </h3>

                <p
                  class="text-surface-800/80 text-[13px] leading-relaxed break-words whitespace-pre-wrap"
                >
                  {{ item.description || '暂无描述' }}
                </p>

                <div v-if="item.metrics.length > 0" class="mt-3 grid grid-cols-2 gap-2">
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
                <p v-else class="text-surface-800/40 mt-2 text-xs">暂无关键指标数据</p>

                <div v-if="item.tags.length > 0" class="mt-3 flex flex-wrap gap-1.5">
                  <span
                    v-for="t in item.tags"
                    :key="t"
                    class="max-w-full truncate rounded-full px-2.5 py-1 text-[11px]"
                    :class="tagCls(t)"
                  >
                    {{ t }}
                  </span>
                </div>

                <a
                  v-if="item.link"
                  :href="item.link"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-brand-600 hover:text-brand-700 mt-3 flex items-center gap-1.5 text-[13px] break-all"
                >
                  <Link2 class="size-3.5 shrink-0" />
                  {{ item.link }}
                  <ExternalLink class="size-3 shrink-0" />
                </a>
              </section>

              <!-- 复用包（复盘笔记独立分区；导出/整包复制低频操作收进「更多」菜单） -->
              <section v-if="reuseContentReady" aria-label="复用包" class="border-t pt-4">
                <div class="mb-2.5 flex flex-wrap items-center justify-between gap-1.5">
                  <h3
                    class="text-surface-900 flex items-center gap-1.5 text-xs font-semibold tracking-wide"
                  >
                    <Package class="size-3.5 text-emerald-600" />
                    复用包
                  </h3>
                  <button
                    type="button"
                    class="text-brand-600 hover:text-brand-700 flex items-center gap-1 text-[11px] font-medium transition"
                    @click="copyReuseMarkdown"
                  >
                    <Copy class="size-3" />
                    复制
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

                  <div v-if="item.reuse.templateSnippet.trim()">
                    <p class="text-surface-800/60 mb-1 text-[10px] font-medium tracking-wide">
                      模板片段（提示词）
                    </p>
                    <pre
                      class="bg-surface-900/95 text-surface-100 max-h-40 overflow-auto rounded-lg p-2.5 text-[11px] leading-relaxed break-all whitespace-pre-wrap"
                      >{{ item.reuse.templateSnippet }}</pre>
                  </div>
                </div>
              </section>

              <!-- 关联 -->
              <section v-if="hasRelations" aria-label="关联" class="border-t pt-4">
                <h3 class="text-surface-900 mb-2 text-xs font-semibold tracking-wide">关联</h3>
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

              <!-- 复盘笔记 -->
              <section
                v-if="item.reuse.retrospective.trim()"
                aria-label="复盘笔记"
                class="border-t pt-4"
              >
                <h3 class="text-surface-900 mb-1.5 text-xs font-semibold tracking-wide">
                  复盘笔记
                </h3>
                <p
                  class="text-surface-800/80 text-xs leading-relaxed break-words whitespace-pre-wrap"
                >
                  {{ item.reuse.retrospective }}
                </p>
              </section>
            </div>

            <!-- 底部操作：主操作直显，低频操作收进「更多」 -->
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
                v-if="item.reuse.templateSnippet.trim()"
                type="button"
                class="border-surface-100 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition"
                @click="copySnippet"
              >
                <Copy class="size-3.5" />
                复制提示词
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

              <!-- 更多（低频操作） -->
              <div class="relative">
                <button
                  type="button"
                  aria-label="更多操作"
                  title="更多操作"
                  class="border-surface-100 text-surface-800/50 hover:bg-surface-50 hover:text-surface-900 rounded-lg border px-2.5 py-2 transition"
                  @click="moreOpen = !moreOpen"
                >
                  <MoreHorizontal class="size-4" />
                </button>
                <button
                  v-if="moreOpen"
                  type="button"
                  class="fixed inset-0 z-10 cursor-default"
                  aria-label="关闭更多菜单"
                  @click="moreOpen = false"
                />
                <Transition
                  enter-active-class="transition duration-150 ease-out"
                  enter-from-class="translate-y-1 opacity-0"
                  leave-active-class="transition duration-100 ease-in"
                  leave-to-class="opacity-0"
                >
                  <div
                    v-if="moreOpen"
                    class="shadow-float border-surface-100/70 bg-surface-0/95 absolute right-0 bottom-full z-20 mb-1.5 w-48 rounded-lg border p-1 backdrop-blur-xl"
                  >
                    <button
                      v-for="action in moreActions"
                      :key="action.key"
                      type="button"
                      class="text-surface-800/80 hover:bg-surface-50 hover:text-surface-900 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition"
                      @click="runMore(action.key)"
                    >
                      <component :is="action.icon" class="size-3.5 shrink-0" />
                      {{ action.label }}
                    </button>
                  </div>
                </Transition>
              </div>
            </footer>
          </aside>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
